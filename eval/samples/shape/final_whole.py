"""결과 모양 실험 19 — 마지막 전체 사진 한 장을 '생성한 화장 그림'과 부위별로 비교.

    DHE_DATA_DIR=D:/nudy-data uv run --extra vlm --extra eval --with scikit-image python eval/samples/shape/final_whole.py

입력 (저장소 밖)  $DHE_DATA_DIR/work/makeup-layer/bare.png · made.png  (같은 크기, 겹치는 한 쌍)
                  $DHE_DATA_DIR/golden/raw/p01/{4,2,1}_open.jpg         (다시 찍은 맨얼굴 = 확인 사진 바탕)
정답값  맨얼굴 → 생성 그림의 부위별 Lab 변화 (피부 전체 변화는 이마 중앙값으로 뺀다)
확인    확인 사진을 얼굴 점으로 맨얼굴 자리에 편 뒤 같은 변화를 잰다
숫자    양 = 정답 방향으로 바뀐 크기 / 정답 크기 (0 안 그림 · 1 같음), 색 = 방향 코사인, 범위 = 칠한 칸 IoU
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import distance_transform_edt as edt
from scipy.ndimage import gaussian_filter as gf
from scipy.ndimage import shift as nshift
from skimage import color
from skimage.transform import PiecewiseAffineTransform, warp

sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "vlm"))
from landmarks import detect, model_path  # noqa: E402
from mediapipe.tasks.python import BaseOptions  # noqa: E402
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode  # noqa: E402

DATA = Path(os.environ["DHE_DATA_DIR"])
SRC = DATA / "work" / "makeup-layer"
RAW = DATA / "golden" / "raw" / "p01"
WORK = DATA / "work" / "final-whole"
WORK.mkdir(parents=True, exist_ok=True)
FACE_W = 380
LIP_O = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIP_I = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
EYES = [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]]
BROWS = [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]
CHEEKS = [[116, 117, 118, 119, 100, 142, 203, 206, 216, 192, 213, 147, 123],
          [345, 346, 347, 348, 329, 371, 423, 426, 436, 416, 433, 376, 352]]
PARTS = ["입술", "섀도우", "볼", "눈썹"]

opts = FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(model_path())), running_mode=RunningMode.IMAGE, num_faces=1)
LMK = FaceLandmarker.create_from_options(opts)


def points(path):
    f = detect(path, LMK)
    return np.array([[p["x"], p["y"]] for p in f[0]]) if f else None


def face_crop(img, pts, name):
    """얼굴 상자로 자르고 얼굴 폭을 FACE_W 로 맞춘다 → (그림 0~1, 얼굴 점)"""
    fw = pts[454, 0] - pts[234, 0]
    m = fw * 0.2
    x0, y0 = int(max(0, pts[234, 0] - m)), int(max(0, pts[10, 1] - m))
    x1, y1 = int(min(img.width, pts[454, 0] + m)), int(min(img.height, pts[152, 1] + m))
    s = FACE_W / fw
    c = img.crop((x0, y0, x1, y1))
    c = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
    c.save(WORK / f"{name}.png")
    dump(name, (pts - [x0, y0]) * s)
    return np.asarray(c).astype(float) / 255, (pts - [x0, y0]) * s


def dump(name, pts):
    """얼굴 점을 whole_score.mjs 가 읽는 모양으로 (저장소 밖)"""
    (WORK / f"{name}.lm.json").write_text(json.dumps([{"x": round(float(x), 2), "y": round(float(y), 2)} for x, y in pts]), encoding="utf-8")


# ── 맨얼굴 · 생성 그림 (맨얼굴 자리 = 기준 틀) ──
bare = Image.open(SRC / "bare.png").convert("RGB")
made = Image.open(SRC / "made.png").convert("RGB")
pb, pm = points(SRC / "bare.png"), points(SRC / "made.png")
fw = pb[454, 0] - pb[234, 0]
ox, oy = int(pb[234, 0] - fw * 0.2), int(pb[10, 1] - fw * 0.2)
S = FACE_W / fw
A, PA = face_crop(bare, pb, "_bare")
PM = (pm - [ox, oy]) * S
H, W = A.shape[:2]
M = np.asarray(made.crop((ox, oy, ox + round(W / S), oy + round(H / S))).resize((W, H), Image.LANCZOS)).astype(float) / 255
labA = color.rgb2lab(A)
Image.fromarray((M * 255).astype(np.uint8)).save(WORK / "_made.png")
eye = abs(PA[33, 0] - PA[133, 0])


def poly(P, ids):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(P[i]) for i in ids], fill=255)
    return np.asarray(im) > 0


def both(ids):
    return poly(PA, ids) | poly(PM, ids)


def ramp(v, a, b):
    return np.clip((v - a) / (b - a), 0, 1)


def fea(mk, s):
    return gf(mk.astype(float), s)


yy, xx = np.mgrid[0:H, 0:W]
skin = (xx - PA[151, 0]) ** 2 + (yy - PA[151, 1]) ** 2 <= (eye * 0.4) ** 2
eyes = both(EYES[0]) | both(EYES[1])
dEye = edt(~eyes)
brows = both(BROWS[0]) | both(BROWS[1])
dBrow = edt(~brows)
lips = both(LIP_O) & ~(poly(PA, LIP_I) & poly(PM, LIP_I))
cheeks = poly(PA, CHEEKS[0]) | poly(PA, CHEEKS[1])
REGION = {
    "입술": fea(lips, eye * 0.025),
    "눈썹": fea(dBrow < eye * 0.06, eye * 0.03),
    "섀도우": fea((dEye > eye * 0.03) & (dEye < eye * 0.32) & ~brows, eye * 0.05),
    "볼": fea(cheeks, eye * 0.08),
}


def ring(k):
    """부위 바로 주변의 피부 (다른 부위 · 눈은 뺀다) — 그 부위의 기준 피부"""
    core = REGION[k] > 0.5
    near = (edt(~core) < eye * 0.3) & ~core & ~eyes & (dEye > eye * 0.35 if k != "섀도우" else dEye > eye * 0.4)
    for o in PARTS:
        near &= REGION[o] < 0.05
    return near.astype(float)


RING = {k: ring(k) for k in PARTS}


def wmean(R, w):
    return (R * w[..., None]).sum((0, 1)) / max(w.sum(), 1e-6)


def change(img):
    """맨얼굴 자리에 놓인 그림 → 부위별 Lab 변화 (그 부위 주변 피부의 변화를 뺀다, 잔 무늬는 흐림)"""
    D = color.rgb2lab(np.clip(img, 0, 1)) - labA
    D = np.stack([gf(D[..., c], eye * 0.02) for c in range(3)], 2)
    return {k: D - wmean(D, RING[k]) for k in PARTS}


def alphas(RS):
    out = {}
    for k, R in RS.items():
        ch = np.sqrt(R[..., 1] ** 2 + R[..., 2] ** 2 + (0.4 * R[..., 0]) ** 2)
        v = {"입술": ramp(ch, 2, 6), "눈썹": ramp(-R[..., 0], 3, 10), "섀도우": ramp(ch, 3, 8), "볼": ramp(gf(R[..., 1], eye * 0.10), 1.0, 4.5)}[k]
        out[k] = REGION[k] * v
    return out


RT = change(M)
AT = alphas(RT)
TV = {k: wmean(RT[k], AT[k]) for k in PARTS}
print("정답값 (맨얼굴 → 생성 그림) 부위별 변화 dL da db · 크기 · 칠한 칸 · 기준 피부 칸")
for k in PARTS:
    print("  %-4s %+5.1f %+5.1f %+5.1f · %4.1f · %d · %d" % (k, *TV[k], np.linalg.norm(TV[k]), int((AT[k] >= 0.5).sum()), int(RING[k].sum())))


def score(imgA):
    """맨얼굴 자리에 편 확인 사진 → 부위별 (양, 색, 범위)"""
    RS = change(imgA)
    AO = alphas(RS)
    out = {}
    for k in PARTS:
        t = TV[k]
        o = wmean(RS[k], AT[k])
        tn = np.linalg.norm(t)
        a, b = AO[k] >= 0.5, AT[k] >= 0.5
        out[k] = (float(o @ t / tn**2), float(o @ t / (np.linalg.norm(o) * tn + 1e-6)), float((a & b).sum() / max((a | b).sum(), 1)))
    return out


def verdict(p, c, iou):
    if p < 0.3:
        return "안 그림"
    if c < 0.8:
        return "색 다름"
    if p < 0.6:
        return "옅음"
    if p > 1.6:
        return "진함"
    return "비슷" if iou >= 0.3 else "자리 다름"


def to_A(img, P):
    t = PiecewiseAffineTransform.from_estimate(PA, P)
    return warp(img, t, output_shape=(H, W), order=1, mode="edge")


def from_A(layer, P, shape):
    t = PiecewiseAffineTransform.from_estimate(P, PA)
    return warp(layer, t, output_shape=shape[:2], order=1, mode="constant", cval=0, preserve_range=True)


def show(name, r):
    print("%-16s" % name + " | ".join("%s %5.2f %5.2f %4.2f %s" % (k, *r[k], verdict(*r[k])) for k in PARTS))


print("\n확인 사진 → 부위별  양 · 색 · 범위 · 판정")
show("생성 그림 그대로", score(M))
LAYER = {k: RT[k] * AT[k][..., None] for k in PARTS}
CASES = {
    "맨얼굴(진짜)": None,
    "그대로 얹음": {},
    "입술 빼먹음": {"입술": lambda L: L * 0},
    "섀도우 색 다름": {"섀도우": lambda L: np.stack([L[..., 0], -L[..., 2], L[..., 1]], 2)},
    "볼 옅음(0.4)": {"볼": lambda L: L * 0.4},
    "볼 아래로": {"볼": lambda L: np.stack([nshift(L[..., c], (eye * 0.6, 0), order=1) for c in range(3)], 2)},
    "섀도우 위로 더": {"섀도우": lambda L: L + np.stack([nshift(L[..., c], (-eye * 0.2, 0), order=1) for c in range(3)], 2) * (np.abs(L).sum(2, keepdims=True) < 1)},
    "섀도우 한쪽만": {"섀도우": lambda L: L * (xx < PA[168, 0])[..., None]},
}
sheet = []
for n in ("4", "2", "1"):
    src = ImageOps.exif_transpose(Image.open(RAW / f"{n}_open.jpg")).convert("RGB")
    src.thumbnail((1600, 1600))
    src.save(WORK / f"_c{n}_full.png")
    C, PC = face_crop(src, points(WORK / f"_c{n}_full.png"), f"c{n}_bare")
    labC = color.rgb2lab(C)
    for i, (name, mod) in enumerate(CASES.items()):
        if mod is None:
            img, P = C, PC
        else:
            lay = sum((mod[k](LAYER[k]) if k in mod else LAYER[k]) for k in PARTS)
            img = np.clip(color.lab2rgb(labC + from_A(lay, PC, C.shape)), 0, 1)
            f = WORK / f"c{n}_{i}.png"
            Image.fromarray((img * 255).astype(np.uint8)).save(f)
            P = points(f)
            dump(f.stem, P)
            if n == "4" and not mod:
                sheet = [C, img]
        show(f"사진{n} {name}", score(to_A(img, P)))
if sheet:
    hh = min(x.shape[0] for x in [A, M] + sheet)
    ims = [Image.fromarray((x[:hh] * 255).astype(np.uint8)) for x in [A, M] + sheet]
    out = Image.new("RGB", (sum(i.width for i in ims) + 30, hh), "white")
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + 10
    out.save(WORK / "_sheet.jpg", quality=90)
