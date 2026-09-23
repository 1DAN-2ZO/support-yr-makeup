"""얼굴 점 MLP 정확도 올리기 실험 — 특징·점 고르기·증강·모델 설정 비교 (멘토링 2026-09-22 후속).

데이터: train/prep_views.py 가 만든 landmarks_views.npz (컬러, 얼굴 확대 + 앱 여백 두 버전, 서양·동양 혼합)
분리: 학습/검증/시험 모두 '같은 사진 묶음' 단위 — 같은 사진의 두 버전이 서로 다른 쪽에 들어가지 않는다.
설정 고르기는 검증으로만 하고, 시험은 마지막에 고른 설정 하나로 한 번만 잰다(시험에 맞춰 고르면 과대평가된다).

  python eval/faceshape/mlp_tune.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.faceshape.features import FACE_OVAL, features  # noqa: E402

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
CLEAN = BASE / "faceshape_clean"
CLASSES = ["heart", "oblong", "oval", "round", "square"]
# 얼굴형에 직접 관련된 점: 윤곽 + 광대·턱선 안쪽 + 코 기둥(세로 기준선). 눈·입(표정·사람마다 다른 부분)은 뺀다
EXTRA_SHAPE = [1, 4, 5, 6, 168, 197, 195, 50, 280, 117, 346, 123, 352, 207, 427]
EXTRA_SHAPE += [192, 416, 214, 434, 212, 432, 202, 422, 204, 424, 32, 262, 140, 369]
SHAPE_PTS = sorted(set(FACE_OVAL) | set(EXTRA_SHAPE))


def mirror_map(mean_xy: np.ndarray) -> np.ndarray:
    """좌우 반전했을 때 각 점이 어느 점으로 가는지 — 평균 얼굴을 뒤집어 가장 가까운 점과 짝짓는다."""
    flipped = mean_xy * np.array([-1, 1])
    d = ((flipped[:, None, :] - mean_xy[None, :, :]) ** 2).sum(2)
    return d.argmin(1)


def geo(X: np.ndarray) -> np.ndarray:
    """사람이 얼굴형을 볼 때 보는 숫자(높이별 폭 12개, 길이/폭, 턱·턱끝 각도, 가장 넓은 높이)."""
    rows = []
    for x in X:
        f = features(x[:, :2])
        rows.append([f[k] for k in sorted(f)])
    a = np.array(rows, dtype=np.float32)
    return np.nan_to_num(a, nan=np.nanmean(a))


def make_features(X, kind, geo_cache):
    if kind == "전체 478점 xyz":
        F = X.reshape(len(X), -1)
    elif kind == "전체 478점 xy":
        F = X[:, :, :2].reshape(len(X), -1)
    elif kind == "형태 점만 xy":
        F = X[:, SHAPE_PTS, :2].reshape(len(X), -1)
    elif kind == "형태 점 xy + 얼굴형 숫자":
        F = np.concatenate([X[:, SHAPE_PTS, :2].reshape(len(X), -1), geo_cache], 1)
    elif kind == "얼굴형 숫자만":
        F = geo_cache
    else:
        raise ValueError(kind)
    return F.astype(np.float32)


def augment(X: np.ndarray, mm: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """좌우 반전(절반) + 작은 회전(±5도) + 점 흔들기. 얼굴형은 좌우 반전·살짝 기울임에 바뀌지 않는다."""
    X = X.copy()
    flip = rng.random(len(X)) < 0.5
    X[flip] = X[flip][:, mm] * np.array([-1, 1, 1], dtype=np.float32)
    ang = np.radians(rng.uniform(-5, 5, len(X)))
    c, s = np.cos(ang), np.sin(ang)
    x, y = X[:, :, 0].copy(), X[:, :, 1].copy()
    X[:, :, 0] = c[:, None] * x - s[:, None] * y
    X[:, :, 1] = s[:, None] * x + c[:, None] * y
    X[:, :, :2] *= rng.uniform(0.97, 1.03, (len(X), 1, 1))
    X += rng.normal(0, 0.004, X.shape).astype(np.float32)
    return X


def train_one(cfg, Xtr, ytr, Xva, yva, feat_fn, mm, epochs, seed=0):
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    F0 = feat_fn(Xtr)
    mu, sd = F0.mean(0), F0.std(0) + 1e-6
    T = lambda a: torch.tensor((a - mu) / sd, dtype=torch.float32)  # noqa: E731
    h, drop = cfg["hidden"], cfg["dropout"]
    layers, d_in = [], F0.shape[1]
    for w in h:
        layers += [nn.Linear(d_in, w), nn.BatchNorm1d(w), nn.ReLU(), nn.Dropout(drop)]
        d_in = w
    net = nn.Sequential(*layers, nn.Linear(d_in, 5))
    opt = torch.optim.AdamW(net.parameters(), lr=cfg["lr"], weight_decay=cfg["wd"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    lossf = nn.CrossEntropyLoss(label_smoothing=cfg["ls"])
    xva = T(feat_fn(Xva))
    ytr_t = torch.tensor(ytr)
    best, best_ep, best_state, curve = -1.0, 0, None, []
    xtr_fixed = T(F0)
    for ep in range(epochs):
        net.train()
        xtr = T(feat_fn(augment(Xtr, mm, rng))) if cfg["aug"] else xtr_fixed
        perm = torch.randperm(len(xtr))
        for k in range(0, len(xtr), 128):
            b = perm[k : k + 128]
            opt.zero_grad()
            lossf(net(xtr[b]), ytr_t[b]).backward()
            opt.step()
        sched.step()
        net.eval()
        with torch.no_grad():
            va = float((net(xva).argmax(1).numpy() == yva).mean())
        curve.append(va)
        if va > best:
            best, best_ep = va, ep + 1
            best_state = {k: v.clone() for k, v in net.state_dict().items()}
    net.load_state_dict(best_state)
    net.eval()
    return net, T, best, best_ep, curve


def main() -> int:
    d = np.load(CLEAN / "landmarks_views.npz")
    X, y, g, view, split, files = d["X"], d["y"], d["g"], d["view"], d["split"], d["f"]
    tr_all = split == "train"
    groups = np.unique(g[tr_all])
    rng = np.random.default_rng(0)
    va_groups = set(rng.choice(groups, size=int(len(groups) * 0.12), replace=False).tolist())
    is_va = tr_all & np.isin(g, list(va_groups))
    is_tr = tr_all & ~is_va
    is_te = split == "test"
    assert not (set(g[is_tr]) & set(g[is_va])) and not (set(g[is_tr]) & set(g[is_te]))
    print(
        f"학습 {is_tr.sum()} · 검증 {is_va.sum()} · 시험 {is_te.sum()} (두 버전 합산, 묶음 단위로 겹침 없음)",
        flush=True,
    )

    mm = mirror_map(X[is_tr][:, :, :2].mean(0))
    print("좌우 짝이 맞는 점 비율", round(float((mm[mm] == np.arange(478)).mean()), 3), flush=True)
    t0 = time.time()
    G = geo(X)
    print(f"얼굴형 숫자 계산 {time.time() - t0:.0f}s", flush=True)

    def feat_fn_for(kind):
        def fn(Xs):
            if kind in ("형태 점 xy + 얼굴형 숫자", "얼굴형 숫자만"):
                return make_features(Xs, kind, geo(Xs) if Xs is not X else G)
            return make_features(Xs, kind, None)

        return fn

    base = {"hidden": [256, 128], "dropout": 0.3, "lr": 1e-3, "wd": 1e-3, "ls": 0.0, "aug": False}
    EP = int(os.environ.get("TUNE_EPOCHS", "300"))
    trials = [
        ("기준: 전체 478점 xyz", "전체 478점 xyz", base),
        ("전체 478점 xy", "전체 478점 xy", base),
        ("형태 점만 xy", "형태 점만 xy", base),
        ("얼굴형 숫자만", "얼굴형 숫자만", base),
        ("형태 점 xy + 얼굴형 숫자", "형태 점 xy + 얼굴형 숫자", base),
    ]
    results = []
    Xtr, ytr, Xva, yva = X[is_tr], y[is_tr], X[is_va], y[is_va]
    for name, kind, cfg in trials:
        fn = feat_fn_for(kind)
        _, _, va, ep, _ = train_one(cfg, Xtr, ytr, Xva, yva, fn, mm, EP)
        results.append({"name": name, "kind": kind, "cfg": cfg, "val": va, "best_epoch": ep})
        print(f"[특징] {name}: 검증 {va:.3f} @ {ep}회차", flush=True)

    best_kind = max(results, key=lambda r: r["val"])["kind"]
    fn = feat_fn_for(best_kind)
    for name, cfg in [
        ("+ 증강(반전·회전·흔들기)", {**base, "aug": True}),
        ("+ 증강 + 라벨 스무딩", {**base, "aug": True, "ls": 0.1}),
        ("+ 증강 + 넓은 층 512·256", {**base, "aug": True, "hidden": [512, 256]}),
        ("+ 증강 + 층 3개 512·256·128", {**base, "aug": True, "hidden": [512, 256, 128]}),
        ("+ 증강 + 드롭아웃 0.5", {**base, "aug": True, "dropout": 0.5}),
    ]:
        _, _, va, ep, _ = train_one(cfg, Xtr, ytr, Xva, yva, fn, mm, EP)
        results.append(
            {"name": f"{best_kind} {name}", "kind": best_kind, "cfg": cfg, "val": va, "best_epoch": ep}
        )
        print(f"[설정] {best_kind} {name}: 검증 {va:.3f} @ {ep}회차", flush=True)

    best = max(results, key=lambda r: r["val"])
    print("검증 기준 최종 선택:", best["name"], round(best["val"], 3), flush=True)

    # 시험은 여기서 한 번만: 기준(처음 설정)과 최종 선택 두 개
    tags = json.loads((CLEAN / "bangs_tags.json").read_text())
    stem_bangs = {(Path(k).parent.name.lower(), Path(k).stem): v for k, v in tags.items()}
    bang = np.array([stem_bangs.get((Path(f).parent.name.lower(), Path(f).stem), False) for f in files])
    final = {}
    for label, r in [("기준", results[0]), ("최종", best)]:
        fn = feat_fn_for(r["kind"])
        net, T, va, ep, curve = train_one(r["cfg"], Xtr, ytr, Xva, yva, fn, mm, EP)
        with torch.no_grad():
            p = net(T(fn(X[is_te]))).argmax(1).numpy()
        yt, vt, bt = y[is_te], view[is_te], bang[is_te]

        def acc(m, p=p, yt=yt):
            return float((p[m] == yt[m]).mean())

        cm = np.zeros((5, 5), int)
        for a, b in zip(yt[vt == 1], p[vt == 1], strict=True):
            cm[a, b] += 1
        final[label] = {
            "name": r["name"], "val": va, "best_epoch": ep, "curve": curve,
            "test_all": acc(np.ones_like(yt, bool)), "test_tight": acc(vt == 0), "test_margin": acc(vt == 1),
            "test_margin_no_bangs": acc((vt == 1) & ~bt), "test_margin_bangs": acc((vt == 1) & bt),
            "test_tight_no_bangs": acc((vt == 0) & ~bt),
            "per_class_margin": {CLASSES[i]: float(cm[i, i] / cm[i].sum()) for i in range(5)},
            "confusion_margin": cm.tolist(),
        }  # fmt: skip
        f = final[label]
        print(
            f"[시험] {label} ({r['name']}): 전체 {f['test_all']:.3f} | 확대 {f['test_tight']:.3f} · 여백 "
            f"{f['test_margin']:.3f} | 여백·앞머리 없음 {f['test_margin_no_bangs']:.3f} · 앞머리 있음 "
            f"{f['test_margin_bangs']:.3f}",
            flush=True,
        )
        if label == "최종":
            torch.save(
                {
                    "state_dict": net.state_dict(),
                    "cfg": r["cfg"],
                    "kind": r["kind"],
                    "classes": CLASSES,
                    "shape_pts": SHAPE_PTS,
                },
                BASE / "models" / "faceshape_mlp.pt",
            )
    out = BASE / "results" / "faceshape_mlp_tune.json"
    out.write_text(
        json.dumps(
            {
                "trials": results,
                "final": final,
                "n": {"train": int(is_tr.sum()), "val": int(is_va.sum()), "test": int(is_te.sum())},
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    print("saved", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
