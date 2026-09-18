"""실사용 데이터셋을 우리 파이프라인으로 실제로 돌려 보는 검증 스크립트.

문서(datasets-v6.md)에 적힌 데이터셋이 **우리 프로젝트에서 실제로 쓸 만한지**를 숫자로 확인한다.
데이터셋마다 같은 네 가지를 잰다.

  T1 검출   MediaPipe Face Landmarker(478점)가 얼굴을 찾는 비율, 한 장당 시간, 홍채 지름(px), 고개 각도
  T2 정합   랜드마크로 그린 부위 다각형(core.py와 같은 방식) vs 사람이 그린 정답 마스크의 IoU
            → "랜드마크 기반으로 부위 마스크를 만들어도 되나"에 대한 답
  T3 모델   합성 데이터로만 학습한 TinyUNet(poc/synth)을 실제 사진에 돌린 IoU + 맨얼굴 오검출 비율
            → "합성 학습이 실제 사진에서 어디까지 먹히나"에 대한 답
  T4 라벨   해상도, 클래스 픽셀 비율, 좌우 분리 여부 등 라벨 자체의 성격

사용법
    python eval_real.py --dataset helen --root D:/danghaeung-datasets/helen --n 200 --out results/helen
    python eval_real.py --dataset facesynthetics --root D:/danghaeung-datasets/facesynthetics --n 200
    python eval_real.py --dataset periorbital --root D:/danghaeung-datasets/periorbital --n 200
    python eval_real.py --dataset lapa --root D:/danghaeung-datasets/LaPa --n 200
    python eval_real.py --dataset celebamask --root D:/danghaeung-datasets/CelebAMask-HQ --n 200

결과: <out>/summary.json, <out>/per_image.csv, <out>/montage.png (사진 | 정답 | 랜드마크 다각형 | 모델 예측)
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
SYNTH = HERE.parent / "synth"
sys.path.insert(0, str(SYNTH))
from core import IDX, centroid, _many, _at  # noqa: E402

PARTS = ["browL", "browR", "eyeL", "eyeR", "lip", "lipOnly", "iris"]

# ---------------------------------------------------------------- 어댑터
# 각 어댑터는 [(image_path, load_gt)] 목록을 돌려준다.
# load_gt() -> dict[part] = bool ndarray (H,W)  (없는 부위는 키 자체를 안 넣는다)


def _stack(mask_paths: dict[str, Path]) -> dict[str, np.ndarray]:
    out = {}
    for k, p in mask_paths.items():
        if p.exists():
            out[k] = np.asarray(Image.open(p).convert("L")) > 127
    return out


def adapter_helen(root: Path):
    """SmithCVPR2013 (Helen 파싱). images/*.jpg, labels/<name>/<name>_lbl00..10.png
    00 배경 01 피부 02 왼눈썹 03 오른눈썹 04 왼눈 05 오른눈 06 코 07 윗입술 08 입안 09 아랫입술 10 머리카락"""
    imgs = sorted((root / "images").glob("*.jpg"))
    items = []
    for im in imgs:
        d = root / "labels" / im.stem

        def load(d=d, stem=im.stem):
            m = _stack({f"c{i:02d}": d / f"{stem}_lbl{i:02d}.png" for i in range(11)})
            if not m:
                return {}
            # Helen 은 "left"가 화면 기준 왼쪽인지 사람 기준인지 논문마다 다르다. 좌우는 합쳐서도 본다.
            return {"browL": m["c02"], "browR": m["c03"], "eyeL": m["c04"], "eyeR": m["c05"],
                    "lip": m["c07"] | m["c08"] | m["c09"], "lipOnly": m["c07"] | m["c09"]}
        items.append((im, load))
    return items


FS_CLASSES = {0: "bg", 1: "skin", 2: "nose", 3: "r_eye", 4: "l_eye", 5: "r_brow", 6: "l_brow",
              7: "r_ear", 8: "l_ear", 9: "mouth_in", 10: "top_lip", 11: "bottom_lip", 12: "neck",
              13: "hair", 14: "beard", 15: "clothing", 16: "eyewear", 17: "headwear", 18: "facewear", 19: "ignore"}


def adapter_facesynthetics(root: Path):
    """Microsoft FaceSynthetics. 000000.png + 000000_seg.png (정수 라벨) + 000000_ldmks.txt"""
    imgs = sorted(p for p in root.rglob("*.png") if "_seg" not in p.name and "_ldmks" not in p.name)
    items = []
    for im in imgs:
        seg = im.with_name(im.stem + "_seg.png")
        if not seg.exists():
            continue

        def load(seg=seg):
            s = np.asarray(Image.open(seg))
            if s.ndim == 3:
                s = s[..., 0]
            return {"browL": s == 6, "browR": s == 5, "eyeL": s == 4, "eyeR": s == 3,
                    "lip": (s == 9) | (s == 10) | (s == 11), "lipOnly": (s == 10) | (s == 11)}
        items.append((im, load))
    return items


def adapter_lapa(root: Path):
    """LaPa. <split>/images/*.jpg, <split>/labels/*.png  (0 배경 1 피부 2 왼눈썹 3 오른눈썹 4 왼눈 5 오른눈
    6 코 7 윗입술 8 입안 9 아랫입술 10 머리카락)"""
    items = []
    for split in ["test", "val", "train"]:
        for im in sorted((root / split / "images").glob("*.jpg")):
            lab = root / split / "labels" / (im.stem + ".png")
            if not lab.exists():
                continue

            def load(lab=lab):
                s = np.asarray(Image.open(lab))
                if s.ndim == 3:
                    s = s[..., 0]
                return {"browL": s == 2, "browR": s == 3, "eyeL": s == 4, "eyeR": s == 5,
                        "lip": (s == 7) | (s == 8) | (s == 9), "lipOnly": (s == 7) | (s == 9)}
            items.append((im, load))
    return items


def adapter_celebamask(root: Path):
    """CelebAMask-HQ. CelebA-HQ-img/<i>.jpg, CelebAMask-HQ-mask-anno/<k>/<i:05d>_<part>.png (512×512)"""
    img_dir = root / "CelebA-HQ-img"
    anno = root / "CelebAMask-HQ-mask-anno"
    items = []
    for im in sorted(img_dir.glob("*.jpg"), key=lambda p: int(p.stem)):
        i = int(im.stem)
        sub = anno / str(i // 2000)

        def load(sub=sub, i=i):
            def m(part):
                p = sub / f"{i:05d}_{part}.png"
                return (np.asarray(Image.open(p).convert("L")) > 127) if p.exists() else None
            z = np.zeros((512, 512), bool)
            g = {k: (m(v) if m(v) is not None else z) for k, v in
                 {"browL": "l_brow", "browR": "r_brow", "eyeL": "l_eye", "eyeR": "r_eye",
                  "u": "u_lip", "l": "l_lip", "mouth": "mouth"}.items()}
            return {"browL": g["browL"], "browR": g["browR"], "eyeL": g["eyeL"], "eyeR": g["eyeR"],
                    "lip": g["u"] | g["l"] | g["mouth"], "lipOnly": g["u"] | g["l"], "_size": 512}
        items.append((im, load))
    return items


def adapter_periorbital(root: Path):
    """Periorbital Segmentation Dataset (Zenodo 13916845). 구조는 압축 해제 후 자동 탐색:
    이미지 옆에 같은 이름의 마스크 폴더/파일(iris, sclera, brow ...)이 있는 형태를 가정한다."""
    items = []
    # 시도 1: VOC 형식 (JPEGImages + SegmentationClass)
    imgs = sorted(p for p in root.rglob("*.jpg")) + sorted(p for p in root.rglob("*.png") if "mask" not in p.name.lower() and "seg" not in p.name.lower())
    for im in imgs:
        cands = list(im.parent.glob(im.stem + "*mask*")) + list((im.parent.parent / "masks").glob(im.stem + "*")) \
            if (im.parent.parent / "masks").exists() else list(im.parent.glob(im.stem + "*mask*"))
        if not cands:
            continue

        def load(cands=cands):
            out = {}
            for c in cands:
                n = c.name.lower()
                if c.suffix.lower() not in (".png", ".jpg", ".bmp"):
                    continue
                arr = np.asarray(Image.open(c))
                if arr.ndim == 3:
                    arr = arr[..., 0]
                if "iris" in n:
                    out["iris"] = arr > 0
                elif "brow" in n:
                    out["browL"] = arr > 0
                elif "sclera" in n:
                    out["sclera"] = arr > 0
                elif arr.max() <= 8:      # 정수 라벨 한 장 (클래스 번호는 README 확인)
                    out["_int"] = arr
            return out
        items.append((im, load))
    return items


def adapter_easyportrait(root: Path):
    """EasyPortrait (HF gofixyourself/EasyPortrait). 사진 <root>/*.jpg (또는 images/<split>/), 라벨 <root>/<split>/*.png
    0 배경 1 사람 2 피부 3 왼눈썹 4 오른눈썹 5 왼눈 6 오른눈 7 입술 8 치아  (입술은 상/하 구분 없음)"""
    items = []
    for split in ["val", "test", "train"]:
        for lab in sorted((root / split).glob("*.png")):
            cands = [root / (lab.stem + ".jpg"), root / "images" / split / (lab.stem + ".jpg"), root / split / (lab.stem + ".jpg")]
            im = next((c for c in cands if c.exists()), None)
            if im is None:
                continue

            def load(lab=lab):
                s = np.asarray(Image.open(lab))
                if s.ndim == 3:
                    s = s[..., 0]
                return {"browL": s == 3, "browR": s == 4, "eyeL": s == 5, "eyeR": s == 6,
                        "lip": (s == 7) | (s == 8), "lipOnly": s == 7}
            items.append((im, load))
    return items


def adapter_mt(root: Path):
    """MT (BeautyGAN) 화장 사진. 부위 정답 마스크가 없으므로 T1(검출·홍채·각도)과 T3 오검출만 잰다.
    all/images/makeup/*.png (화장) — 맨얼굴 쪽은 non-makeup/ 이지만 여기서는 화장 쪽만 본다."""
    imgs = sorted((root / "all" / "images" / "makeup").glob("*.png"))
    return [(im, (lambda: {})) for im in imgs]


ADAPTERS = {"helen": adapter_helen, "facesynthetics": adapter_facesynthetics, "lapa": adapter_lapa,
            "celebamask": adapter_celebamask, "periorbital": adapter_periorbital, "easyportrait": adapter_easyportrait,
            "mt": adapter_mt}


# ---------------------------------------------------------------- MediaPipe

class Landmarker:
    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode
        self.mp = mp
        model = SYNTH / "face_landmarker.task"
        if not model.exists():
            sys.exit(f"{model} 이 없습니다. poc/synth/generate.py 를 한 번 실행해 내려받으세요.")
        self.lmk = FaceLandmarker.create_from_options(FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model)), running_mode=RunningMode.IMAGE, num_faces=1))

    def __call__(self, rgb: np.ndarray):
        h, w = rgb.shape[:2]
        res = self.lmk.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        if not res.face_landmarks:
            return None
        return [(p.x * w, p.y * h, p.z * w) for p in res.face_landmarks[0]]


def iris_px(lm) -> float:
    """홍채 지름(px). 468/473이 중심, 469-472 / 474-477이 테두리."""
    d = []
    for c, ring in ((468, (469, 470, 471, 472)), (473, (474, 475, 476, 477))):
        cx, cy = lm[c][0], lm[c][1]
        r = np.mean([np.hypot(lm[i][0] - cx, lm[i][1] - cy) for i in ring])
        d.append(2 * r)
    return float(np.mean(d))


def yaw_deg(lm) -> float:
    """코끝(1)이 두 눈 바깥 꼬리(33·263) 사이 어디에 있는지로 어림한 좌우 회전각. 0이면 정면."""
    l, r, n = lm[33], lm[263], lm[1]
    span = r[0] - l[0]
    if abs(span) < 1e-6:
        return 0.0
    t = (n[0] - l[0]) / span          # 0.5 면 정중앙
    return float(np.degrees(np.arcsin(np.clip((t - 0.5) * 2, -1, 1))))


# ---------------------------------------------------------------- 랜드마크 다각형

def poly_mask(poly, h, w) -> np.ndarray:
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in poly], fill=255)
    return np.asarray(im) > 0


def landmark_masks(lm, h, w) -> dict[str, np.ndarray]:
    pts = [(p[0], p[1]) for p in lm]
    browL = _many(pts, IDX["browUpperL"]) + _many(pts, IDX["browLowerL"])
    browR = _many(pts, IDX["browUpperR"]) + _many(pts, IDX["browLowerR"])
    eyeL = _many(pts, IDX["eyeRingL"])
    eyeR = _many(pts, IDX["eyeRingR"])
    lip = _many(pts, IDX["lipOuter"])
    out = {"browL": poly_mask(browL, h, w), "browR": poly_mask(browR, h, w),
           "eyeL": poly_mask(eyeL, h, w), "eyeR": poly_mask(eyeR, h, w), "lip": poly_mask(lip, h, w)}
    out["lipOnly"] = out["lip"]
    # 홍채: 중심 + 반지름 원
    ir = Image.new("L", (w, h), 0)
    dr = ImageDraw.Draw(ir)
    for c, ring in ((468, (469, 470, 471, 472)), (473, (474, 475, 476, 477))):
        cx, cy = lm[c][0], lm[c][1]
        r = np.mean([np.hypot(lm[i][0] - cx, lm[i][1] - cy) for i in ring])
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    out["iris"] = np.asarray(ir) > 0
    return out


def iou(a: np.ndarray, b: np.ndarray) -> float | None:
    if a.shape != b.shape:
        return None
    u = (a | b).sum()
    return float((a & b).sum() / u) if u else None


# ---------------------------------------------------------------- 합성 학습 모델

class SynthModel:
    def __init__(self, ckpt: Path):
        import torch
        sys.path.insert(0, str(SYNTH))
        from train import TinyUNet
        from generate import face_box
        self.torch, self.face_box = torch, face_box
        ck = torch.load(ckpt, map_location="cpu")
        self.net = TinyUNet(base=ck.get("base", 16))
        self.net.load_state_dict(ck["model"])
        self.net.eval()
        self.size = 256

    def __call__(self, rgb: np.ndarray, lm) -> np.ndarray:
        """전체 이미지 크기의 정수 라벨(0~5)을 돌려준다. 얼굴 밖은 0."""
        h, w = rgb.shape[:2]
        box = self.face_box([(p[0], p[1]) for p in lm], w, h)
        pil = Image.fromarray(rgb)
        crop = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), 0)
        crop.paste(pil.crop(box), (0, 0))
        x = np.asarray(crop.resize((self.size, self.size), Image.LANCZOS), dtype=np.float32) / 255.0
        with self.torch.no_grad():
            logit = self.net(self.torch.from_numpy(x).permute(2, 0, 1)[None])
        pred = logit.argmax(1)[0].numpy().astype(np.uint8)
        back = Image.fromarray(pred).resize((box[2] - box[0], box[3] - box[1]), Image.NEAREST)
        full = Image.new("L", (w, h), 0)
        full.paste(back, (box[0], box[1]))
        return np.asarray(full)


# ---------------------------------------------------------------- 몽타주

def overlay(rgb, masks: dict[str, np.ndarray], colors: dict[str, tuple]) -> Image.Image:
    im = rgb.astype(np.float32).copy()
    for k, m in masks.items():
        if k not in colors or m is None or m.shape != rgb.shape[:2]:
            continue
        c = np.array(colors[k], np.float32)
        im[m] = im[m] * 0.45 + c * 0.55
    return Image.fromarray(im.clip(0, 255).astype(np.uint8))


COL = {"browL": (255, 200, 0), "browR": (255, 140, 0), "eyeL": (0, 200, 255), "eyeR": (0, 120, 255),
       "lip": (255, 40, 120), "iris": (120, 255, 60)}
PRED_COL = {1: (255, 200, 0), 2: (0, 0, 0), 3: (150, 60, 255), 4: (255, 40, 120), 5: (255, 150, 150)}


def crop_face_view(rgb, lm, pad=0.25):
    xs = [p[0] for p in lm[:468]]
    ys = [p[1] for p in lm[:468]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    s = max(x1 - x0, y1 - y0) * (1 + pad)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2))


# ---------------------------------------------------------------- 메인

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, choices=sorted(ADAPTERS))
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--ckpt", type=Path, default=SYNTH / "results" / "best_noweight.pt")
    ap.add_argument("--montage", type=int, default=6)
    args = ap.parse_args()
    out = args.out or (HERE / "results" / args.dataset)
    out.mkdir(parents=True, exist_ok=True)

    items = ADAPTERS[args.dataset](args.root)
    if not items:
        sys.exit(f"{args.root} 에서 이미지를 찾지 못했습니다 (구조가 예상과 다름).")
    random.Random(args.seed).shuffle(items)
    items = items[: args.n]
    print(f"[{args.dataset}] 전체 {len(ADAPTERS[args.dataset](args.root))}장 중 {len(items)}장 평가")

    lmk = Landmarker()
    model = SynthModel(args.ckpt) if args.ckpt.exists() else None
    if model is None:
        print(f"  (모델 파일 없음 → T3 생략: {args.ckpt})")

    rows, tiles = [], []
    agg = {p: [] for p in PARTS}
    agg_m = {"brow": [], "lip": [], "lipOnly": []}
    fp = {"liner": [], "shadow": [], "cheek": []}
    det, t_sum, sizes, iris, yaws = 0, 0.0, [], [], []
    gt_ratio = {p: [] for p in PARTS}

    for k, (im_path, load) in enumerate(items):
        rgb = np.asarray(Image.open(im_path).convert("RGB"))
        h, w = rgb.shape[:2]
        gt = load()
        if "_size" in gt:   # CelebAMask 는 사진 1024, 마스크 512
            s = gt.pop("_size")
            if (h, w) != (s, s):
                rgb = np.asarray(Image.fromarray(rgb).resize((s, s), Image.LANCZOS))
                h, w = s, s
        sizes.append((w, h))
        for p in PARTS:
            if p in gt and gt[p].shape == (h, w):
                gt_ratio[p].append(gt[p].mean())

        t0 = time.perf_counter()
        lm = lmk(rgb)
        dt = time.perf_counter() - t0
        t_sum += dt
        row = {"image": im_path.name, "w": w, "h": h, "detected": lm is not None, "ms": round(dt * 1000, 1)}
        if lm is None:
            rows.append(row)
            continue
        det += 1
        row["iris_px"] = round(iris_px(lm), 2)
        row["yaw_deg"] = round(yaw_deg(lm), 1)
        iris.append(row["iris_px"])
        yaws.append(row["yaw_deg"])

        lmm = landmark_masks(lm, h, w)
        # 데이터셋마다 "left"가 화면 왼쪽인지(Helen) 사람의 왼쪽인지(CelebAMask-HQ) 다르다.
        # 좌우 교차 IoU가 더 높으면 뒤집힌 규약으로 보고 정답 키를 바꿔서 잰다. 뒤집힘 비율은 따로 기록.
        for a, b in (("browL", "browR"), ("eyeL", "eyeR")):
            if a in gt and b in gt and gt[a].any() and gt[b].any():
                straight = (iou(gt[a], lmm[a]) or 0) + (iou(gt[b], lmm[b]) or 0)
                crossed = (iou(gt[a], lmm[b]) or 0) + (iou(gt[b], lmm[a]) or 0)
                swapped = crossed > straight
                row[f"lr_swapped_{a[:-1]}"] = swapped
                if swapped:
                    gt[a], gt[b] = gt[b], gt[a]
        for p in PARTS:
            if p in gt:
                v = iou(gt[p], lmm[p])
                if v is not None and gt[p].any():
                    row[f"lm_iou_{p}"] = round(v, 3)
                    agg[p].append(v)

        if model is not None:
            pred = model(rgb, lm)
            if "browL" in gt and "browR" in gt:
                gb = gt["browL"] | gt["browR"]
                v = iou(gb, pred == 1)
                if v is not None and gb.any():
                    row["model_iou_brow"] = round(v, 3)
                    agg_m["brow"].append(v)
            for key in ("lip", "lipOnly"):
                if key in gt and gt[key].any():
                    v = iou(gt[key], pred == 4)
                    if v is not None:
                        row[f"model_iou_{key}"] = round(v, 3)
                        agg_m[key].append(v)
            face_px = max(1, (pred > 0).sum() + (pred == 0).sum())  # 전체 픽셀
            for cid, name in ((2, "liner"), (3, "shadow"), (5, "cheek")):
                r = float((pred == cid).sum() / (h * w))
                row[f"model_fp_{name}"] = round(r, 5)
                fp[name].append(r)
        rows.append(row)

        if len(tiles) < args.montage:
            box = crop_face_view(rgb, lm)
            def cut(img):
                return img.crop(box).resize((256, 256), Image.LANCZOS)
            gt_over = overlay(rgb, {k: gt[k] for k in ("browL", "browR", "eyeL", "eyeR", "lip", "iris") if k in gt}, COL)
            lm_over = overlay(rgb, {k: lmm[k] for k in ("browL", "browR", "eyeL", "eyeR", "lip", "iris")}, COL)
            cols = [cut(Image.fromarray(rgb)), cut(gt_over), cut(lm_over)]
            if model is not None:
                pm = {cid: (pred == cid) for cid in PRED_COL}
                pcol = {cid: PRED_COL[cid] for cid in PRED_COL}
                cols.append(cut(overlay(rgb, pm, pcol)))
            tiles.append(cols)
        if (k + 1) % 25 == 0:
            print(f"  {k + 1}/{len(items)}  검출 {det}  누적 {t_sum:.1f}s")

    # ---------------- 집계
    def stat(xs):
        if not xs:
            return None
        a = np.array(xs, float)
        return {"mean": round(float(a.mean()), 4), "median": round(float(np.median(a)), 4),
                "p10": round(float(np.percentile(a, 10)), 4), "p90": round(float(np.percentile(a, 90)), 4), "n": len(xs)}

    summary = {
        "dataset": args.dataset, "root": str(args.root), "n": len(items), "seed": args.seed,
        "T1_detect_rate": round(det / len(items), 4), "T1_ms_per_image": round(t_sum / len(items) * 1000, 1),
        "T1_iris_px": stat(iris), "T1_iris_ge_25px_ratio": (round(float(np.mean(np.array(iris) >= 25)), 3) if iris else None),
        "T1_abs_yaw_deg": stat([abs(y) for y in yaws]),
        "T1_yaw_over_30_ratio": (round(float(np.mean(np.abs(yaws) > 30)), 3) if yaws else None),
        "T2_landmark_iou": {p: stat(v) for p, v in agg.items() if v},
        "T2_lr_swapped_ratio": {a: round(float(np.mean([r[f"lr_swapped_{a}"] for r in rows if f"lr_swapped_{a}" in r])), 3)
                                for a in ("brow", "eye") if any(f"lr_swapped_{a}" in r for r in rows)},
        "T3_model_iou": {p: stat(v) for p, v in agg_m.items() if v},
        "T3_model_false_positive_pixel_ratio": {p: stat(v) for p, v in fp.items() if v},
        "T4_image_size": {"w": stat([s[0] for s in sizes]), "h": stat([s[1] for s in sizes])},
        "T4_gt_pixel_ratio": {p: stat(v) for p, v in gt_ratio.items() if v},
        "T4_parts_available": sorted(p for p in PARTS if gt_ratio[p]),
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    keys = sorted({k for r in rows for k in r}, key=lambda k: (k != "image", k))
    with open(out / "per_image.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=keys)
        wr.writeheader()
        wr.writerows(rows)
    if tiles:
        ncol = len(tiles[0])
        sheet = Image.new("RGB", (256 * ncol, 256 * len(tiles)), (30, 30, 30))
        for r, cols in enumerate(tiles):
            for c, im in enumerate(cols):
                sheet.paste(im, (256 * c, 256 * r))
        sheet.save(out / "montage.png")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n결과 → {out}/  (summary.json, per_image.csv, montage.png)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
