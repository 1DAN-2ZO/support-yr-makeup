"""입술이 왜 옅게 옮겨지나 — 템플릿 원본의 입술 대비 / 맨얼굴의 입술 대비 / 옮긴 그림의 입술 대비 (입술 − 둘레 피부, Lab)"""
import json, sys
from pathlib import Path
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, "C:/Coding/support-yr-makeup/eval/vlm")
from landmarks import detect, model_path
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode
from PIL import Image, ImageDraw
D = Path("D:/nudy-data/work/v5/tpl")
LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
def lab_of(rgb):
    c = rgb.astype(np.float64) / 255; c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    x = (0.4124 * c[..., 0] + 0.3576 * c[..., 1] + 0.1805 * c[..., 2]) / 0.95047; y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]; z = (0.0193 * c[..., 0] + 0.1192 * c[..., 1] + 0.9505 * c[..., 2]) / 1.08883
    f = lambda t: np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    return np.stack([116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))], -1)
def mask(size, poly):
    m = Image.new("L", size, 0); ImageDraw.Draw(m).polygon([(float(a), float(b)) for a, b in poly], fill=1); return np.asarray(m).astype(bool)
def read(im, lm):
    lab = lab_of(np.asarray(im)); p = np.array([[lm[i]["x"], lm[i]["y"]] for i in LIP]); q = np.array([[lm[i]["x"], lm[i]["y"]] for i in INNER]); c = p.mean(0)
    lip = mask(im.size, p) & ~mask(im.size, q); ring = mask(im.size, c + (p - c) * 1.9) & ~mask(im.size, c + (p - c) * 1.45)
    return lab[lip].mean(0), lab[ring].mean(0)
f = lambda v: " ".join(f"{x:6.1f}" for x in v)
lmk = FaceLandmarker.create_from_options(FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(model_path())), running_mode=RunningMode.IMAGE, num_faces=1))
blm = json.loads((D / "bare.lm.json").read_text(encoding="utf-8")); bl, br = read(Image.open(D / "bare.png").convert("RGB"), blm); b = bl - br
print(f"맨얼굴     입술 {f(bl)} · 둘레 피부 {f(br)} · 입술−피부 {f(b)}   (L a b)")
print("\n번호  원본 입술−피부 (L a b)   원본이 맨얼굴보다 (L a b) 크기   옮긴 그림이 맨얼굴보다 (L a b) 크기   옮겨진 비율")
for n in range(1, 11):
    src = D / "src" / f"{n:02d}.webp"; png = D / "src" / f"{n:02d}.png"; Image.open(src).convert("RGB").save(png)
    faces = detect(png, lmk); sl, sr = read(Image.open(png).convert("RGB"), faces[0]); s = sl - sr - b
    ml, mr = read(Image.open(D / f"moved_t{n}.png").convert("RGB"), blm); m = ml - mr - b
    print(f"{n:02d}   {f(sl - sr)}     {f(s)}  {np.linalg.norm(s):5.1f}      {f(m)}  {np.linalg.norm(m):5.1f}      {m @ s / (s @ s):5.2f}   피부 원본 {f(sr)} · 옮긴 {f(mr)}")
