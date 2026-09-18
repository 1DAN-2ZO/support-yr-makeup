"""FFHQ-Makeup (맨얼굴·화장 쌍)으로 **화장 있는 얼굴**에서 우리 모델이 어디까지 되나 본다.

FFHQ-Makeup 에는 부위 마스크가 없다. 대신 같은 얼굴의 맨얼굴·화장 사진이 픽셀 단위로 정렬돼 있으므로
두 사진의 색 차이(CIE ΔE)가 큰 곳 = 화장이 올라간 곳이다. 이것을 임시 정답(pseudo GT)으로 쓴다.

재는 것
  P1  랜드마크 부위 안의 평균 ΔE      → 화장이 실제로 눈·입술·볼에 올라갔는지 (데이터셋 자체 확인)
  P2  모델이 화장이라고 찍은 픽셀 중 ΔE≥임계 비율  → 정밀도 비슷한 것 (헛찍기)
  P3  ΔE≥임계 픽셀(얼굴 안) 중 모델이 화장으로 덮은 비율 → 재현율 비슷한 것 (놓침)
  P4  맨얼굴에 모델을 돌렸을 때 화장 클래스 픽셀 비율   → 오검출

사용법
    python eval_ffhq_makeup.py --root D:/danghaeung-datasets/hf_ffhq_makeup/images --out results/ffhq_makeup
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from eval_real import Landmarker, SynthModel, landmark_masks, overlay, PRED_COL, COL  # noqa: E402

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB(0..255) → CIE Lab (D65). 외부 패키지 없이 계산."""
    x = rgb.astype(np.float64) / 255.0
    x = np.where(x > 0.04045, ((x + 0.055) / 1.055) ** 2.4, x / 12.92)
    M = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = x @ M.T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)


def delta_e(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.sqrt(((rgb_to_lab(a) - rgb_to_lab(b)) ** 2).sum(-1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=HERE / "results" / "ffhq_makeup")
    ap.add_argument("--ckpt", type=Path, default=HERE.parent / "synth" / "results" / "best_noweight.pt")
    ap.add_argument("--thr", type=float, default=8.0, help="화장으로 볼 ΔE 임계 (JND≈2.3, 눈에 확실히 띔≈5~10)")
    ap.add_argument("--montage", type=int, default=6)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    bares = sorted(args.root.glob("*_bare.jpg"))
    pairs = [(b, m) for b in bares for m in sorted(args.root.glob(b.name.replace("_bare", "_makeup_*")))]
    print(f"맨얼굴 {len(bares)}명, 쌍 {len(pairs)}개")

    lmk, model = Landmarker(), SynthModel(args.ckpt)
    region_de = {"lip": [], "eyeL": [], "eyeR": [], "browL": [], "browR": [], "cheek_proxy": [], "face_rest": []}
    prec = {1: [], 2: [], 3: [], 4: [], 5: []}
    recall_all, bare_fp = [], {2: [], 3: [], 4: [], 5: []}
    det = 0
    tiles = []
    per_style = {}

    for b, m in pairs:
        rb = np.asarray(Image.open(b).convert("RGB"))
        rm = np.asarray(Image.open(m).convert("RGB"))
        h, w = rb.shape[:2]
        lm = lmk(rb)
        if lm is None:
            continue
        det += 1
        de = delta_e(rb, rm)
        masks = landmark_masks(lm, h, w)
        # 얼굴 영역: 랜드마크 볼록 껍질 대신 얼굴 박스 안 + 랜드마크 외곽 다각형
        face = np.zeros((h, w), bool)
        from PIL import ImageDraw
        hull_idx = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
                    152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        im = Image.new("L", (w, h), 0)
        ImageDraw.Draw(im).polygon([(lm[i][0], lm[i][1]) for i in hull_idx], fill=255)
        face = np.asarray(im) > 0
        # 볼 대용: 눈 아래~입꼬리 사이 사각형 (좌우)
        cheek = np.zeros((h, w), bool)
        for eb, mc in ((145, 61), (374, 291)):
            x0, x1 = sorted([lm[eb][0], lm[mc][0]])
            y0, y1 = lm[eb][1] + 0.15 * h * 0.1, lm[mc][1]
            cheek[int(y0):int(y1), int(x0):int(x1)] = True
        cheek &= face & ~masks["lip"] & ~masks["eyeL"] & ~masks["eyeR"]

        for k in ("lip", "eyeL", "eyeR", "browL", "browR"):
            region_de[k].append(float(de[masks[k]].mean()) if masks[k].any() else np.nan)
        region_de["cheek_proxy"].append(float(de[cheek].mean()) if cheek.any() else np.nan)
        rest = face & ~masks["lip"] & ~masks["eyeL"] & ~masks["eyeR"] & ~masks["browL"] & ~masks["browR"] & ~cheek
        region_de["face_rest"].append(float(de[rest].mean()))

        pred = model(rm, lm)
        # 첫 실행에서 화장 없는 피부도 ΔE≈10 이 나왔다 (생성 이미지라 얼굴 전체 색이 조금씩 다름).
        # 그래서 절대 임계가 아니라 "그 얼굴의 화장 없는 피부 중앙값 + thr" 를 쓴다.
        base = float(np.median(de[rest])) if rest.any() else 0.0
        hi = (de >= base + args.thr) & face
        for c in prec:
            pm = pred == c
            if pm.sum() > 50:
                prec[c].append(float((pm & hi).sum() / pm.sum()))
        makeup_pred = (pred >= 2) & (pred <= 5)
        if hi.sum() > 50:
            recall_all.append(float((hi & makeup_pred).sum() / hi.sum()))
        style = m.stem.split("_")[-1]
        per_style.setdefault(style, []).append(float(de[face].mean()))

        pb = model(rb, lm)
        for c in bare_fp:
            bare_fp[c].append(float((pb == c).sum() / face.sum()))

        if len(tiles) < args.montage:
            de_vis = np.clip(de / 25.0, 0, 1)
            de_img = Image.fromarray((np.stack([de_vis] * 3, -1) * 255).astype(np.uint8))
            pm = {cid: (pred == cid) for cid in PRED_COL}
            tiles.append([Image.fromarray(rb), Image.fromarray(rm), de_img,
                          overlay(rm, pm, PRED_COL)])

    def stat(xs):
        a = np.array([x for x in xs if x == x], float)
        return None if a.size == 0 else {"mean": round(float(a.mean()), 3), "median": round(float(np.median(a)), 3), "n": int(a.size)}

    summary = {
        "pairs": len(pairs), "detected": det, "thr_deltaE": args.thr,
        "P1_mean_deltaE_by_region": {k: stat(v) for k, v in region_de.items()},
        "P1_mean_deltaE_by_style": {k: stat(v) for k, v in sorted(per_style.items())},
        "P2_precision_like": {{1: "brow", 2: "liner", 3: "shadow", 4: "lip", 5: "cheek"}[c]: stat(v) for c, v in prec.items()},
        "P3_recall_like_makeup_classes": stat(recall_all),
        "P4_bare_face_false_positive_ratio": {{2: "liner", 3: "shadow", 4: "lip", 5: "cheek"}[c]: stat(v) for c, v in bare_fp.items()},
    }
    (args.out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    if tiles:
        sheet = Image.new("RGB", (256 * 4, 256 * len(tiles)))
        for r, cols in enumerate(tiles):
            for c, im in enumerate(cols):
                sheet.paste(im.resize((256, 256)), (256 * c, 256 * r))
        sheet.save(args.out / "montage.png")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
