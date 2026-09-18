"""눈썹 다각형이 정답 눈썹의 절반밖에 못 덮는 문제(T2 IoU ≈ 0.5)를 얼마나 키우면 되는지 실험.

MediaPipe 눈썹 점(70,63,105,66,107 / 55,65,52,53,46)은 눈썹의 **위·아래 가장자리 선**이라 그 사이만 채우면
실제 털 영역보다 얇다. 다각형을 눈 너비의 몇 %만큼 바깥으로 불렸을 때 IoU가 어떻게 변하는지 잰다.
(입술·눈은 이미 0.7~0.86 이라 그대로 둔다)

    python probe_brow.py --dataset helen --root ... --n 100
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from eval_real import ADAPTERS, Landmarker, landmark_masks, iou  # noqa: E402

for _s in (sys.stdout,):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass


def dilate(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask
    im = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * px + 1))
    return np.asarray(im) > 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, choices=sorted(ADAPTERS))
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--ratios", default="0,0.03,0.06,0.09,0.12,0.15,0.20")
    args = ap.parse_args()
    ratios = [float(x) for x in args.ratios.split(",")]

    items = ADAPTERS[args.dataset](args.root)
    random.Random(0).shuffle(items)
    items = items[: args.n]
    lmk = Landmarker()
    res = {r: [] for r in ratios}
    for im_path, load in items:
        rgb = np.asarray(Image.open(im_path).convert("RGB"))
        h, w = rgb.shape[:2]
        gt = load()
        if "_size" in gt:
            s = gt.pop("_size")
            rgb = np.asarray(Image.fromarray(rgb).resize((s, s), Image.LANCZOS))
            h, w = s, s
        lm = lmk(rgb)
        if lm is None or "browL" not in gt:
            continue
        lmm = landmark_masks(lm, h, w)
        eye_w = abs(lm[133][0] - lm[33][0])  # 왼눈 너비(px)
        # 좌우 규약 보정
        if (iou(gt["browL"], lmm["browR"]) or 0) + (iou(gt["browR"], lmm["browL"]) or 0) > \
           (iou(gt["browL"], lmm["browL"]) or 0) + (iou(gt["browR"], lmm["browR"]) or 0):
            gt["browL"], gt["browR"] = gt["browR"], gt["browL"]
        for r in ratios:
            px = int(round(eye_w * r))
            vals = [iou(gt[k], dilate(lmm[k], px)) for k in ("browL", "browR") if gt[k].any()]
            vals = [v for v in vals if v is not None]
            if vals:
                res[r].append(float(np.mean(vals)))
    out = {f"{r:.2f}": round(float(np.mean(v)), 3) for r, v in res.items() if v}
    print(json.dumps({"dataset": args.dataset, "n": len(next(iter(res.values()))), "brow_iou_by_dilate_ratio_of_eye_width": out}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
