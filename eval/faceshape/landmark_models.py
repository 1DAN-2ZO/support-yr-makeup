"""얼굴 점 좌표로 얼굴형 분류 — 다항 로지스틱 회귀 · 작은 신경망(Dense 층) (멘토링 2026-09-22).

CNN 과 같은 조건으로 비교한다: 학습 폴더 전체로 학습(10% 검증), 같은 test 998장으로 채점.
지난번 얼굴 점 결과(최대 50.9%)는 test 998장 안에서만 나눠 학습해 학습량이 CNN 의 1/10 이었다.

  python eval/faceshape/landmark_models.py extract      # 얼굴 점 뽑아 캐시 (CPU, 한 번만)
  python eval/faceshape/landmark_models.py train        # 로지스틱 회귀 + 신경망 학습·채점

특징: MediaPipe 얼굴 점 478개를 눈꼬리(33·263) 기준으로 똑바로 세우고, 얼굴 중심으로 옮기고,
얼굴 폭으로 나눠 크기를 맞춘 뒤 (x, y, z) 를 한 줄로 펼친다. 윤곽 36점만 쓴 것과 전체 478점을 비교한다.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from train.faceshape_cnn import CLASSES, dhash, list_images  # noqa: E402

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
CACHE = Path(os.environ.get("LM_CACHE", BASE / "results" / "faceshape_landmarks_cache.npz"))
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
             152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]  # fmt: skip


def normalize(lm: np.ndarray) -> np.ndarray:
    """(478, 3) 픽셀 좌표 → 기울기·위치·크기를 맞춘 좌표."""
    a, b = lm[33, :2], lm[263, :2]
    ang = np.arctan2(b[1] - a[1], b[0] - a[0])
    c, s = np.cos(-ang), np.sin(-ang)
    xy = (lm[:, :2] - lm[:, :2].mean(0)) @ np.array([[c, -s], [s, c]]).T
    w = xy[454, 0] - xy[234, 0]
    z = (lm[:, 2] - lm[:, 2].mean()) / w
    return np.concatenate([xy / w, z[:, None]], 1)


def extract() -> int:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(BASE / "models" / "face_landmarker.task"))
        )
    )
    train, test = list_images(BASE / "faceshape")
    test_hashes = {dhash(p) for p, _ in test}
    train = [(p, y) for p, y in train if dhash(p) not in test_hashes]  # CNN 과 같은 겹침 제거
    out = {}
    for name, items in [("train", train), ("test", test)]:
        X, Y, F = [], [], []
        miss = 0
        for i, (p, y) in enumerate(items):
            try:
                rgb = Image.open(p).convert("RGB")
            except OSError:
                miss += 1
                continue
            r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb)))
            if not r.face_landmarks:
                miss += 1
                continue
            lm = np.array([[q.x * rgb.width, q.y * rgb.height, q.z * rgb.width] for q in r.face_landmarks[0]])
            X.append(normalize(lm).astype(np.float32))
            Y.append(y)
            F.append(str(p))
            if i % 1000 == 0:
                print(name, i, "/", len(items), flush=True)
        out[f"{name}_X"], out[f"{name}_y"], out[f"{name}_f"] = np.stack(X), np.array(Y), np.array(F)
        print(f"{name}: {len(X)}장 (얼굴 못 찾음 {miss})", flush=True)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE, **out)
    print("saved", CACHE)
    return 0


def train_models() -> int:
    import torch
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from torch import nn

    d = np.load(CACHE)
    rng = np.random.default_rng(0)
    idx = rng.permutation(len(d["train_y"]))
    n_val = len(idx) // 10
    va_i, tr_i = idx[:n_val], idx[n_val:]
    results = {}

    def cm_of(y, p):
        cm = np.zeros((5, 5), int)
        for a, b in zip(y, p, strict=True):
            cm[a, b] += 1
        return cm

    for feat, pts in [("윤곽 36점", FACE_OVAL), ("전체 478점", list(range(478)))]:
        X = d["train_X"][:, pts].reshape(len(d["train_X"]), -1)
        Xt = d["test_X"][:, pts].reshape(len(d["test_X"]), -1)
        y, yt = d["train_y"], d["test_y"]
        sc = StandardScaler().fit(X[tr_i])
        Xtr, Xva, Xte = sc.transform(X[tr_i]), sc.transform(X[va_i]), sc.transform(Xt)

        lr = LogisticRegression(max_iter=3000, C=1.0).fit(Xtr, y[tr_i])
        p = lr.predict(Xte)
        results[f"다항 로지스틱 회귀 · {feat}"] = {
            "test_acc": float((p == yt).mean()),
            "val_acc": float((lr.predict(Xva) == y[va_i]).mean()),
            "confusion": cm_of(yt, p).tolist(),
            "n_features": X.shape[1],
            "test_pred": p.tolist(),
        }
        print(
            f"로지스틱 회귀 · {feat}: test {results[f'다항 로지스틱 회귀 · {feat}']['test_acc']:.3f}",
            flush=True,
        )

        torch.manual_seed(0)
        net = nn.Sequential(
            nn.Linear(X.shape[1], 256), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3), nn.Linear(128, 5),
        )  # fmt: skip
        opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-3)
        lossf = nn.CrossEntropyLoss()
        T = lambda a: torch.tensor(a, dtype=torch.float32)  # noqa: E731
        xtr, ytr = T(Xtr), torch.tensor(y[tr_i])
        curve, best, best_state = [], -1.0, None
        for ep in range(int(os.environ.get("LM_EPOCHS", "100"))):
            net.train()
            perm = torch.randperm(len(xtr))
            tot = 0.0
            for k in range(0, len(xtr), 128):
                b = perm[k : k + 128]
                opt.zero_grad()
                loss = lossf(net(xtr[b]), ytr[b])
                loss.backward()
                opt.step()
                tot += float(loss) * len(b)
            net.eval()
            with torch.no_grad():
                va = float((net(T(Xva)).argmax(1).numpy() == y[va_i]).mean())
            curve.append({"epoch": ep + 1, "loss": tot / len(xtr), "val_acc": va})
            if va > best:
                best, best_ep = va, ep + 1
                best_state = {k: v.clone() for k, v in net.state_dict().items()}
        net.load_state_dict(best_state)
        net.eval()
        with torch.no_grad():
            p = net(T(Xte)).argmax(1).numpy()
        key = f"신경망(Dense 3층) · {feat}"
        results[key] = {
            "test_acc": float((p == yt).mean()),
            "val_best": best,
            "best_epoch": best_ep,
            "confusion": cm_of(yt, p).tolist(),
            "n_features": X.shape[1],
            "curve": curve,
            "test_pred": p.tolist(),
        }
        print(
            f"신경망 · {feat}: test {results[key]['test_acc']:.3f} (검증 최고 {best:.3f} @ {best_ep}회차)",
            flush=True,
        )

    out = BASE / "results" / f"faceshape_landmark_models_ep{os.environ.get('LM_EPOCHS', '100')}.json"
    out.write_text(
        json.dumps(
            {
                "classes": CLASSES,
                "n_train": len(tr_i),
                "n_val": n_val,
                "n_test": len(d["test_y"]),
                "test_f": [str(f) for f in d["test_f"]],
                "results": results,
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    print("saved", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(extract() if sys.argv[1:] == ["extract"] else train_models())
