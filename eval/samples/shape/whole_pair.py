"""결과 모양 실험 20 — 실제 화장 전·후 사진 한 쌍에서 부위별 변화를 잰다 (정답 그림 없이, 따로 찍은 두 장).

    DHE_DATA_DIR=D:/nudy-data uv run --extra vlm --extra eval --with scikit-image python eval/samples/shape/whole_pair.py <폴더> <id>

입력 (저장소 밖)  <폴더>/<id>_open_bare.png · <id>_open_made.png  (+ 있으면 _closed_ 두 장 — 얼굴 점만 뽑아 둔다)
출력              <폴더>/<id>_*.lm.json (얼굴 점 478개, 라이너 스크립트용) · <폴더>/_<id>_sheet.jpg (맨얼굴 · 화장 · 떠낸 것 · 다시 얹은 것)
방식은 final_whole.py 와 같다: 화장 사진을 얼굴 점으로 맨얼굴 자리에 펴고, 부위마다 바로 주변 피부의 변화를 뺀 Lab 변화를 잰다.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt as edt
from scipy.ndimage import gaussian_filter as gf
from skimage import color
from skimage.transform import PiecewiseAffineTransform, warp

sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "vlm"))
from landmarks import detect, model_path  # noqa: E402
from mediapipe.tasks.python import BaseOptions  # noqa: E402
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode  # noqa: E402

assert os.environ.get("DHE_DATA_DIR"), "DHE_DATA_DIR 를 정해 주세요"
DIR, ID = Path(sys.argv[1]), sys.argv[2]
LIP_O = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIP_I = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
EYES = [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
        [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]]
BROWS = [[70, 63, 105, 66, 107, 55, 65, 52, 53, 46], [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]]
CHEEKS = [[116, 117, 118, 119, 100, 142, 203, 206, 216, 192, 213, 147, 123],
          [345, 346, 347, 348, 329, 371, 423, 426, 436, 416, 433, 376, 352]]
PARTS = ["입술", "섀도우", "볼", "눈썹", "속눈썹 선"]

opts = FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(model_path())), running_mode=RunningMode.IMAGE, num_faces=1)
LMK = FaceLandmarker.create_from_options(opts)


def points(name):
    f = DIR / f"{ID}_{name}.png"
    if not f.exists():
        return None
    faces = detect(f, LMK)
    if not faces:
        print(f"얼굴을 못 찾음: {name}")
        return None
    (DIR / f"{ID}_{name}.lm.json").write_text(json.dumps([{"x": round(p["x"], 2), "y": round(p["y"], 2)} for p in faces[0]]), encoding="utf-8")
    return np.array([[p["x"], p["y"]] for p in faces[0]])


PA, PM = points("open_bare"), points("open_made")
for n in ("closed_bare", "closed_made"):
    points(n)
A = np.asarray(Image.open(DIR / f"{ID}_open_bare.png").convert("RGB")).astype(float) / 255
Mraw = np.asarray(Image.open(DIR / f"{ID}_open_made.png").convert("RGB")).astype(float) / 255
H, W = A.shape[:2]
M = warp(Mraw, PiecewiseAffineTransform.from_estimate(PA, PM), output_shape=(H, W), order=1, mode="edge")
eye = abs(PA[33, 0] - PA[133, 0])
print("얼굴 폭 %dpx · 눈 폭 %dpx (맨얼굴) / 얼굴 폭 %dpx (화장)" % (PA[454, 0] - PA[234, 0], eye, PM[454, 0] - PM[234, 0]))


def poly(ids):
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).polygon([tuple(PA[i]) for i in ids], fill=255)
    return np.asarray(im) > 0


def ramp(v, a, b):
    return np.clip((v - a) / (b - a), 0, 1)


def fea(mk, s):
    return gf(mk.astype(float), s)


eyes = poly(EYES[0]) | poly(EYES[1])
dEye = edt(~eyes)
brows = poly(BROWS[0]) | poly(BROWS[1])
dBrow = edt(~brows)
lips = poly(LIP_O) & ~poly(LIP_I)
REGION = {
    "입술": fea(lips, eye * 0.025),
    "눈썹": fea(dBrow < eye * 0.06, eye * 0.03),
    "섀도우": fea((dEye > eye * 0.08) & (dEye < eye * 0.32) & ~brows, eye * 0.05),
    "볼": fea(poly(CHEEKS[0]) | poly(CHEEKS[1]), eye * 0.08),
    "속눈썹 선": fea((dEye > 0) & (dEye < eye * 0.08), eye * 0.012),
}


def ring(k):
    core = REGION[k] > 0.5
    near = (edt(~core) < eye * 0.3) & ~core & ~eyes & (dEye > eye * 0.4)
    for o in PARTS:
        near &= REGION[o] < 0.05
    return near.astype(float)


def wmean(R, w):
    return (R * w[..., None]).sum((0, 1)) / max(w.sum(), 1e-6)


D = color.rgb2lab(np.clip(M, 0, 1)) - color.rgb2lab(A)
D = np.stack([gf(D[..., c], eye * 0.02) for c in range(3)], 2)
alpha = np.zeros((H, W))
print("부위     dL    da    db · 크기 · 주변 피부의 변화 dL da db · 칠한 칸 비율")
for k in PARTS:
    base = wmean(D, ring(k))
    R = D - base
    ch = np.sqrt(R[..., 1] ** 2 + R[..., 2] ** 2 + (0.4 * R[..., 0]) ** 2)
    v = {"입술": ramp(ch, 2, 6), "눈썹": ramp(-R[..., 0], 3, 10), "섀도우": ramp(np.sqrt(ch**2 + (0.6 * R[..., 0]) ** 2), 3, 8),
         "볼": ramp(gf(R[..., 1], eye * 0.10), 1.0, 4.5), "속눈썹 선": ramp(-R[..., 0], 8, 20)}[k]
    a = REGION[k] * v
    t = wmean(R, REGION[k])
    print("%-6s %+5.1f %+5.1f %+5.1f · %4.1f · %+5.1f %+5.1f %+5.1f · %3.0f%%" % (k, *t, np.linalg.norm(t), *base, 100 * (a >= 0.5).sum() / max((REGION[k] >= 0.5).sum(), 1)))
    alpha = np.maximum(alpha, a)
alpha = alpha * (1 - fea(eyes, 1.0))
a3 = alpha[..., None]
ims = [Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)) for x in (A, M, M * a3 + (1 - a3), M * a3 + A * (1 - a3))]
out = Image.new("RGB", (W * 4 + 30, H), "white")
for i, im in enumerate(ims):
    out.paste(im, (i * (W + 10), 0))
out.save(DIR / f"_{ID}_sheet.jpg", quality=90)
