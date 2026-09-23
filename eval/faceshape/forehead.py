"""이마 정보 더하기 비교 — ① 얼굴 점 478개 ② + 머리선 점 10개 ③ + 정해진 높이의 이마 폭.

머리선 위치는 뼈 구조가 아니라 머리카락 상태(M자·물러난 머리선)에 따라 달라져 잡음이 될 수 있다.
그래서 ③은 머리선이 아니라 '눈썹 위 정해진 높이'마다 얼굴 피부 폭을 잰다. 그 높이가 머리선보다 아래면
머리선이 앞이든 뒤든 같은 값이 나온다. 머리카락에 가려 잴 수 없으면 0 + '못 잼' 표시를 넣는다.

높이 단위 u = 눈썹 중간에서 눈 중심까지 세로 거리. 높이 k·u (k = 0.5, 1.0, 1.5, 2.0, 2.5) 에서
눈꼬리 선과 나란한 방향으로 피부가 이어지는 폭을 재고 얼굴 폭(234–454)으로 나눈다.

  python eval/faceshape/forehead.py extract     # 여백 버전 → <clean>/forehead.npz
  python eval/faceshape/forehead.py compare     # 세 가지 비교 (학습·검증·시험 묶음 단위 분리)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.faceshape.hairline import FACE_SKIN, tools  # noqa: E402

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
CLEAN = BASE / "faceshape_clean"
KS = [0.5, 1.0, 1.5, 2.0, 2.5]
CLASSES = ["heart", "oblong", "oval", "round", "square"]
BROW = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300]  # 양쪽 눈썹 윗선
EYE = [159, 145, 386, 374]  # 양쪽 눈 위·아래 중심


def forehead_widths(lm: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """(폭 5개, 못 잼 표시 5개) — 폭은 얼굴 폭 대비."""
    a, b = lm[33, :2], lm[263, :2]
    ex = (b - a) / np.linalg.norm(b - a)  # 눈꼬리 선 방향 (가로)
    up = np.array([ex[1], -ex[0]])  # 위쪽 방향
    if up[1] > 0:
        up = -up
    brow = lm[BROW, :2].mean(0)
    eye = lm[EYE, :2].mean(0)
    u = abs(np.dot(brow - eye, up))
    face_w = np.linalg.norm(lm[454, :2] - lm[234, :2])
    mask = np.squeeze(mask)
    H, W = mask.shape
    out, miss = [], []
    for k in KS:
        c = brow + up * k * u
        cx, cy = int(round(c[0])), int(round(c[1]))
        if not (0 <= cx < W and 0 <= cy < H) or mask[cy, cx] != FACE_SKIN:
            out.append(0.0)
            miss.append(1.0)
            continue
        ends = []
        for s in (-1, 1):
            t = 0.0
            while True:
                p = c + s * ex * (t + 1)
                px, py = int(round(p[0])), int(round(p[1]))
                if not (0 <= px < W and 0 <= py < H) or mask[py, px] != FACE_SKIN:
                    break
                t += 1
            ends.append(t)
        out.append(sum(ends) / face_w)
        miss.append(0.0)
    return np.array(out + miss, dtype=np.float32)


def extract() -> int:
    import mediapipe as mp

    fl, seg = tools()
    d = np.load(CLEAN / "landmarks_views.npz")
    idx = np.nonzero(d["view"] == 1)[0]
    Fw = []
    for n, i in enumerate(idx):
        rgb = Image.open(d["f"][i]).convert("RGB")
        im = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb))
        r = fl.detect(im)
        if not r.face_landmarks:
            Fw.append(np.r_[np.zeros(5), np.ones(5)].astype(np.float32))
            continue
        lm = np.array([[q.x * rgb.width, q.y * rgb.height, q.z * rgb.width] for q in r.face_landmarks[0]])
        Fw.append(forehead_widths(lm, seg.segment(im).category_mask.numpy_view()))
        if n % 1000 == 0:
            print(n, "/", len(idx), flush=True)
    Fw = np.array(Fw)
    np.savez_compressed(CLEAN / "forehead.npz", idx=idx, F=Fw)
    print(
        "높이별 못 잰 비율", {k: round(float(Fw[:, 5 + j].mean()), 3) for j, k in enumerate(KS)}, flush=True
    )
    return 0


def compare() -> int:
    import torch

    from eval.faceshape.mlp_tune import train_one

    d = np.load(CLEAN / "landmarks_views.npz")
    hl = np.load(CLEAN / "hairline.npz")
    fh = np.load(CLEAN / "forehead.npz")
    assert (hl["idx"] == fh["idx"]).all()
    idx = hl["idx"]
    X, y, g, split = d["X"][idx], d["y"][idx], d["g"][idx], d["split"][idx]
    files = d["f"][idx]
    H = hl["H"].reshape(len(idx), -1)
    FW = fh["F"]
    # 학습/검증 분리는 mlp_tune 과 같은 규칙(묶음 단위, 시드 0, 12%)
    tr_all = split == "train"
    groups = np.unique(d["g"][d["split"] == "train"])
    rng = np.random.default_rng(0)
    va_groups = set(rng.choice(groups, size=int(len(groups) * 0.12), replace=False).tolist())
    is_va = tr_all & np.isin(g, list(va_groups))
    is_tr = tr_all & ~is_va
    is_te = split == "test"
    assert not (set(g[is_tr]) & set(g[is_va])) and not (set(g[is_tr]) & set(g[is_te]))
    tags = json.loads((CLEAN / "bangs_tags.json").read_text())
    bang = np.array([tags.get(str(f), False) for f in files])
    EXTRA = {"① 얼굴 점 478개": None, "② + 머리선 점 10개": H, "③ + 정해진 높이 이마 폭": FW}
    only = os.environ.get("ONLY")  # 예: "①,②" — 일부만 비교
    if only:
        EXTRA = {k: v for k, v in EXTRA.items() if k[0] in only.split(",")}
    seeds = [int(v) for v in os.environ.get("SEEDS", "0").split(",")]
    base = {"hidden": [256, 128], "dropout": 0.3, "lr": 1e-3, "wd": 1e-3, "ls": 0.0, "aug": False}
    EP = int(os.environ.get("TUNE_EPOCHS", "300"))
    res = {}
    for (name, ex), seed in [(it, sd) for it in EXTRA.items() for sd in seeds]:
        full = X.reshape(len(X), -1) if ex is None else np.concatenate([X.reshape(len(X), -1), ex], 1)
        pos = {id(a): a for a in []}
        del pos
        # train_one 은 (N,478,3) 을 받아 특징 함수를 거친다 → 여기서는 행 번호로 넘겨 특징을 붙인다
        rows = np.arange(len(X), dtype=np.float32)[:, None, None].repeat(478, 1).repeat(3, 2)

        def fn(R, full=full):
            return full[R[:, 0, 0].astype(int)]

        net, T, va, ep, _ = train_one(
            base, rows[is_tr], y[is_tr], rows[is_va], y[is_va], fn, np.arange(478), EP, seed=seed
        )
        with torch.no_grad():
            p = net(T(fn(rows[is_te]))).argmax(1).numpy()
        yt, bt = y[is_te], bang[is_te]
        cm = np.zeros((5, 5), int)
        for a_, b_ in zip(yt, p, strict=True):
            cm[a_, b_] += 1
        name_s = f"{name} · 시드 {seed}"
        res[name_s] = {
            "val": va, "best_epoch": ep, "test": float((p == yt).mean()),
            "test_no_bangs": float((p[~bt] == yt[~bt]).mean()),
            "per_class": {CLASSES[i]: float(cm[i, i] / cm[i].sum()) for i in range(5)},
            "oval_to_heart": int(cm[2, 0]), "heart_to_oval": int(cm[0, 2]), "confusion": cm.tolist(),
        }  # fmt: skip
        r = res[name_s]
        print(
            f"{name_s}: 검증 {va:.3f} | 시험 {r['test']:.3f} (앞머리 없음 {r['test_no_bangs']:.3f}) | "
            f"계란형 {r['per_class']['oval']:.3f} · 역삼각형 {r['per_class']['heart']:.3f} | "
            f"계란→역삼 {r['oval_to_heart']} · 역삼→계란 {r['heart_to_oval']}",
            flush=True,
        )
    out_name = os.environ.get("OUT_NAME", "faceshape_forehead_compare.json")
    (BASE / "results" / out_name).write_text(json.dumps(res, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(extract() if sys.argv[1:] == ["extract"] else compare())
