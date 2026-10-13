"""템플릿 사진의 밝기를 맨얼굴에 맞춘다 — 입술 둘레 피부의 밝기(Y)가 같아지도록 빛의 양을 곱한다 (저장소 밖에 저장)"""
import json, sys
from pathlib import Path
import numpy as np
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, "C:/Coding/support-yr-makeup/eval/vlm")
from landmarks import detect, model_path
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode
from PIL import Image, ImageDraw
D = Path("D:/nudy-data/work/v5/tpl"); (D / "adj").mkdir(exist_ok=True)
LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
lin = lambda c: np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
enc = lambda c: np.where(c > 0.0031308, 1.055 * np.clip(c, 0, 1) ** (1 / 2.4) - 0.055, 12.92 * c)
def ring_y(im, lm):
    p = np.array([[lm[i]["x"], lm[i]["y"]] for i in LIP]); c = p.mean(0)
    def mask(q): m = Image.new("L", im.size, 0); ImageDraw.Draw(m).polygon([(float(a), float(b)) for a, b in q], fill=1); return np.asarray(m).astype(bool)
    r = mask(c + (p - c) * 1.9) & ~mask(c + (p - c) * 1.45); a = lin(np.asarray(im).astype(np.float64) / 255)[r]
    return float((a @ [0.2126, 0.7152, 0.0722]).mean())
lmk = FaceLandmarker.create_from_options(FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(model_path())), running_mode=RunningMode.IMAGE, num_faces=1))
by = ring_y(Image.open(D / "bare.png").convert("RGB"), json.loads((D / "bare.lm.json").read_text(encoding="utf-8")))
for n in range(1, 11):
    im = Image.open(D / "src" / f"{n:02d}.png").convert("RGB"); g = by / ring_y(im, detect(D / "src" / f"{n:02d}.png", lmk)[0])
    out = (enc(lin(np.asarray(im).astype(np.float64) / 255) * g) * 255).round().clip(0, 255).astype(np.uint8)
    Image.fromarray(out).save(D / "adj" / f"{n:02d}.jpg", quality=95); print(f"{n:02d} 곱한 값 {g:.2f}")
