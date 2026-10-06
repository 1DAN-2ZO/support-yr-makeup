"""결과 모양 실험 33 — 눈썹 꼬리 끝을 따로 찍은 사진에서 재기: 머리카락 분할로 관자놀이 머리카락에서 멈춘다.

    DHE_DATA_DIR=D:/nudy-data uv run --extra vlm --extra eval --with scikit-image python eval/samples/shape/brow_tail.py <폴더> <id,id,…>

<폴더> = final_whole.py (WHOLE_CASES=brow2) 가 만든 것: _bare · _made (맨얼굴 · 정답, 얼굴 점은 _bare 것) · c<id>_bare · c<id>_<n> (시도사진, 각자의 얼굴 점).
실험 32 에서 밝기만으로는 늘린 꼬리가 관자놀이 머리카락까지 이어졌다. 앱이 이미 쓰는 머리카락 분할(MediaPipe selfie_multiclass, 1번 = 머리카락)로 그 칸을 뺀다.
재는 법: 눈썹 머리 → 꼬리 축을 따라가며, 축에 수직인 줄에서 가장 어두운 칸이 위 · 아래 피부(밝은 쪽)보다 MIN 넘게 어두운 데까지가 눈썹. 머리카락 칸은 보지 않고,
        줄의 가운데가 머리카락이면 거기서 멈춘다. 끝은 눈썹 길이의 비율 (얼굴 점의 꼬리 = 1). 맨얼굴의 끝을 뺀 것이 '늘린 양'.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import ImageSegmenter, ImageSegmenterOptions
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import color

MIN, GAP, STEP, BAND, SKIN, FAR, MIN_EXT, TOL = 9.0, 0.06, 0.02, 0.28, (0.38, 0.5), 0.7, 0.1, 0.1
URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
SIDES = {"R": ((107, 55), (70, 46)), "L": ((336, 285), (300, 276))}
DIR, IDS = Path(sys.argv[1]), sys.argv[2].split(",")
model = Path(os.environ["DHE_DATA_DIR"]) / "models" / "selfie_multiclass_256x256.tflite"
if not model.exists():
    urllib.request.urlretrieve(URL, model)
SEG = ImageSegmenter.create_from_options(ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=str(model)), output_category_mask=True))


def load(name, lm_from=None):
    im = Image.open(DIR / f"{name}.png").convert("RGB")
    a = np.asarray(im)
    L = gaussian_filter(color.rgb2lab(a.astype(float) / 255)[..., 0], 0.7)
    cat = SEG.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(a))).category_mask.numpy_view().squeeze()
    hair = np.asarray(Image.fromarray((cat == 1).astype(np.uint8) * 255).resize(im.size, Image.BILINEAR)) > 127
    lm = json.loads((DIR / f"{lm_from or name}.lm.json").read_text(encoding="utf-8"))
    return L, hair, lm


def tail_end(L, hair, lm, side):
    P = lambda i: np.array([lm[i]["x"], lm[i]["y"]])
    (h0, h1), (t0, t1) = SIDES[side]
    h, t = (P(h0) + P(h1)) / 2, (P(t0) + P(t1)) / 2
    ln = np.linalg.norm(t - h)
    a = (t - h) / ln
    n = np.array([-a[1], a[0]])
    n = -n if n[1] > 0 else n
    H, W = L.shape

    def at(u, v):
        x, y = h + (a * u + n * v) * ln
        xi, yi = int(np.clip(round(x), 0, W - 1)), int(np.clip(round(y), 0, H - 1))
        return L[yi, xi], hair[yi, xi]

    end, gap, u = 0.5, 0.0, 0.5
    while u <= 1 + FAR:
        mid = [at(u, v)[1] for v in np.arange(-0.1, 0.101, 0.03)]
        if np.mean(mid) > 0.5:   # 줄의 가운데가 머리카락이다
            break
        skin = []
        for sgn in (1, -1):
            vals = [at(u, sgn * v) for v in np.arange(SKIN[0], SKIN[1] + 1e-6, 0.03)]
            keep = [l for l, hr in vals if not hr]
            if keep:
                skin.append(np.mean(keep))
        band = [l for l, hr in (at(u, v) for v in np.arange(-BAND, BAND + 1e-6, 0.03)) if not hr]
        if skin and band and max(skin) - min(band) >= MIN:
            end, gap = u, 0.0
        else:
            gap += STEP
            if gap > GAP:
                break
        u += STEP
    return end


bare, made = load("_bare"), load("_made", "_bare")
base = {s: tail_end(*bare, s) for s in "RL"}
want = {s: tail_end(*made, s) - base[s] for s in "RL"}
print("맨얼굴의 눈썹 끝 (얼굴 점의 꼬리 = 1): R %.2f · L %.2f   |   정답이 늘린 양: R %+.0f%% · L %+.0f%%" % (base["R"], base["L"], want["R"] * 100, want["L"] * 100))
NAMES = ["아무것도 안 함 (진짜 맨얼굴)", "정답대로 (꼬리 늘림)", "꼬리 안 늘림", "눈썹 안 그림", "오른쪽만 늘림"]
for n in IDS:
    b = load(f"c{n}_bare")
    own = {s: tail_end(*b, s) for s in "RL"}   # 이 사진 쪽 맨얼굴의 끝 — 실제 흐름에는 없다 (참고)
    print(f"-- 사진 {n} (이 사진의 맨얼굴 끝 R {own['R']:.2f} · L {own['L']:.2f})")
    for i, name in enumerate(NAMES):
        f = "bare" if i == 0 else str(i)
        if not (DIR / f"c{n}_{f}.png").exists():
            continue
        cur = load(f"c{n}_{f}")
        got = {s: tail_end(*cur, s) - base[s] for s in "RL"}
        say = []
        for s, nm in (("R", "오른쪽"), ("L", "왼쪽")):
            if abs(want[s]) < MIN_EXT:
                continue
            if got[s] < want[s] - TOL:
                say.append(f"{nm} 눈썹 꼬리가 짧아요")
            elif got[s] > want[s] + TOL:
                say.append(f"{nm} 눈썹 꼬리가 길어요")
        print("  %-22s R %+4.0f%% · L %+4.0f%%  →  %s" % (name, got["R"] * 100, got["L"] * 100, " · ".join(say) or "꼬리 길이는 맞아요"))
