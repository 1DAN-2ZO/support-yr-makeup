"""홍채 mm 척도 검증 — Periorbital 사람 라벨 vs MediaPipe 홍채 점.

Periorbital 은 눈 부위 크롭이라 얼굴 검출이 안 된다 (30장 중 0). 그래서 같은 사진에서 직접 비교하는 대신
**크기에 무관한 비율** "홍채 지름 ÷ 눈 너비(흰자+홍채 가로폭)" 를 두 곳에서 재서 비교한다.
  A. Periorbital CFD 827장: 사람이 그린 홍채(클래스 3)·흰자(클래스 2) 마스크
  B. EasyPortrait: MediaPipe 홍채 점(468~477)과 눈꼬리 점(33-133, 362-263)
두 비율이 비슷하면 MediaPipe 홍채 지름을 11.7mm 자로 써도 된다는 근거가 된다.

    python probe_iris.py --peri D:/danghaeung-datasets/periorbital/periorbital_dataset --ep D:/danghaeung-datasets/EasyPortrait --n 200
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from eval_real import Landmarker, adapter_easyportrait  # noqa: E402

for _s in (sys.stdout,):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

IRIS, SCLERA = 3, 2   # 픽셀 통계로 추정 (2: 가로폭비 0.70 두 덩어리, 3: 0.59 두 원). 논문 표기와 대조 필요


def components(mask: np.ndarray):
    """연결 성분을 라벨링해 (x0,x1,y0,y1) 목록. scipy 없이 BFS."""
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = True
        x0 = x1 = x
        y0 = y1 = y
        n = 0
        while stack:
            cy, cx = stack.pop()
            n += 1
            x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if n >= 30:
            out.append((x0, x1, y0, y1, n))
    return sorted(out, key=lambda c: -c[4])


def peri_ratios(root: Path, n: int):
    masks = sorted((root / "cfd_final_data" / "cfd_output_masks").glob("*.png"))
    random.Random(0).shuffle(masks)
    ratios = []
    for m in masks[:n]:
        a = np.asarray(Image.open(m))
        iris = components(a == IRIS)[:2]
        eye = components((a == IRIS) | (a == SCLERA))[:2]
        if len(iris) < 2 or len(eye) < 2:
            continue
        # 왼/오른 짝 맞추기: x 중심이 가까운 것끼리
        for ir in iris:
            icx = (ir[0] + ir[1]) / 2
            ey = min(eye, key=lambda e: abs((e[0] + e[1]) / 2 - icx))
            d = ir[1] - ir[0] + 1
            ew = ey[1] - ey[0] + 1
            if ew > d > 0:
                ratios.append(d / ew)
    return ratios


def mp_ratios(root: Path, n: int):
    items = adapter_easyportrait(root)
    random.Random(0).shuffle(items)
    lmk = Landmarker()
    ratios = []
    for im, _ in items[:n]:
        rgb = np.asarray(Image.open(im).convert("RGB"))
        lm = lmk(rgb)
        if lm is None:
            continue
        for c, ring, a, b in ((468, (469, 470, 471, 472), 33, 133), (473, (474, 475, 476, 477), 362, 263)):
            cx, cy = lm[c][0], lm[c][1]
            d = 2 * np.mean([np.hypot(lm[i][0] - cx, lm[i][1] - cy) for i in ring])
            ew = abs(lm[a][0] - lm[b][0])
            if ew > 0:
                ratios.append(d / ew)
    return ratios


def stat(xs):
    a = np.array(xs, float)
    return {"mean": round(float(a.mean()), 3), "median": round(float(np.median(a)), 3),
            "p10": round(float(np.percentile(a, 10)), 3), "p90": round(float(np.percentile(a, 90)), 3), "n": int(a.size)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--peri", type=Path, required=True)
    ap.add_argument("--ep", type=Path, required=True)
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--out", type=Path, default=HERE / "results" / "iris_ratio")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    res = {"periorbital_human_label_iris_over_eyewidth": stat(peri_ratios(args.peri, args.n)),
           "mediapipe_easyportrait_iris_over_eyewidth": stat(mp_ratios(args.ep, args.n)),
           "note": "눈 너비 = Periorbital 은 흰자+홍채 마스크 가로폭, MediaPipe 는 눈꼬리 점(33-133 / 362-263) 거리. 정의가 완전히 같지는 않다."}
    (args.out / "summary.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
