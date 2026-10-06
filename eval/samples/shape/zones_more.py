"""결과 모양 실험 36 — 더 잡을 만한 것: 눈썹 두께 · 섀도우를 눈꼬리 바깥으로 뺐나 · 눈 밑을 칠했나.

    DHE_DATA_DIR=D:/nudy-data uv run --extra eval --with scikit-image python eval/samples/shape/zones_more.py <brow|shadow> <폴더> <id,id,…>

<폴더> = final_whole.py (WHOLE_CASES=brow3 · shadow2) 가 만든 것: _bare · _made (얼굴 점은 _bare 것) · c<id>_bare · c<id>_<n> (각자의 얼굴 점).
구역은 그 사진의 얼굴 점으로 만든다. 값 = (구역 평균 Lab − 그 구역의 기준 피부 평균 Lab) 이 맨얼굴에서 바뀐 양을, 정답 그림의 주 구역(눈썹 안 · 눈두덩) 변화 방향으로 잰 것 (1 = 주 구역의 정답 변화만큼).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from skimage import color

MODE, DIR, IDS = sys.argv[1], Path(sys.argv[2]), sys.argv[3].split(",")
EYE = {"R": dict(up=[33, 246, 161, 160, 159, 158, 157, 173, 133], lo=[33, 7, 163, 144, 145, 153, 154, 155, 133]),
       "L": dict(up=[263, 466, 388, 387, 386, 385, 384, 398, 362], lo=[263, 249, 390, 373, 374, 380, 381, 382, 362])}
BROW = {"R": dict(up=[70, 63, 105, 66, 107], lo=[46, 53, 52, 65, 55]), "L": dict(up=[300, 293, 334, 296, 336], lo=[276, 283, 282, 295, 285])}


def load(name, lm_from=None):
    im = Image.open(DIR / f"{name}.png").convert("RGB")
    lm = json.loads((DIR / f"{lm_from or name}.lm.json").read_text(encoding="utf-8"))
    return color.rgb2lab(np.asarray(im).astype(float) / 255), np.array([[p["x"], p["y"]] for p in lm])


def mean_in(lab, polys):
    H, W = lab.shape[:2]
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([tuple(p) for p in poly], fill=255)
    k = np.asarray(m) > 0
    return lab[k].mean(0) if k.any() else np.zeros(3)


def band(line, a, b):
    """선을 화면 아래(+y)로 a ~ b 만큼 옮긴 두 선 사이의 띠"""
    return [*(line + [0, a]), *(line + [0, b])[::-1]]


def zones(lab, P):
    """{구역: 구역 − 기준 피부} — 좌우를 합쳐서"""
    ue = abs(P[33, 0] - P[133, 0])
    z, ref = {}, {}
    def add(k, poly, rpoly):
        z.setdefault(k, []).append(poly)
        ref.setdefault(k, []).append(rpoly)
    for s in "RL":
        if MODE == "brow":
            up, lo = P[BROW[s]["up"]], P[BROW[s]["lo"]]
            fore = band(up, -0.34 * ue, -0.22 * ue)   # 기준 피부 = 눈썹 위 이마
            add("눈썹 안", [*up, *lo[::-1]], fore)
            add("바로 위", band(up, -0.12 * ue, -0.03 * ue), fore)
            add("바로 아래", band(lo, 0.03 * ue, 0.10 * ue), fore)
        else:
            up, lo, bl = P[EYE[s]["up"]], P[EYE[s]["lo"]], P[BROW[s]["lo"]]
            at = lambda t: np.array([up[i] + (bl[min(len(bl) - 1, round(i / (len(up) - 1) * (len(bl) - 1)))] - up[i]) * t for i in range(len(up))])
            o, inn = up[0], up[-1]
            a = (o - inn) / np.linalg.norm(o - inn)
            n = np.array([-a[1], a[0]])
            n = -n if n[1] > 0 else n
            quad = lambda u0, u1, v0, v1: [o + (a * u + n * v) * ue for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
            add("눈두덩", [*at(0.1), *at(0.4)[::-1]], [*at(0.82), *at(0.98)[::-1]])
            add("눈꼬리 바깥", quad(0.08, 0.35, -0.05, 0.22), quad(0.1, 0.35, -0.42, -0.26))
            add("눈 밑", band(lo, 0.04 * ue, 0.15 * ue), band(lo, 0.3 * ue, 0.42 * ue))
    return {k: mean_in(lab, z[k]) - mean_in(lab, ref[k]) for k in z}


bare, made = load("_bare"), load("_made", "_bare")
zb, zt = zones(*bare), zones(*made)
KEYS = list(zb)
T = zt[KEYS[0]] - zb[KEYS[0]]
amt = lambda z: {k: float((z[k] - zb[k]) @ T / (T @ T)) for k in KEYS}
row = lambda name, a: "%-24s" % name + "".join("%10.2f" % a[k] for k in KEYS)
print("정답 주 구역(%s) 변화의 크기 %.1f" % (KEYS[0], np.linalg.norm(T)))
print(" " * 24 + "".join("%10s" % k for k in KEYS))
print(row("정답 그림", amt(zt)))
NAMES = ["아무것도 안 함 (맨얼굴)", "정답대로", "원래 두께만" if MODE == "brow" else "바깥으로 더 뺌", "눈썹 안 그림" if MODE == "brow" else "눈 밑에도"]
for n in IDS:
    print(f"-- 사진 {n}")
    for i, name in enumerate(NAMES):
        f = DIR / f"c{n}_{'bare' if i == 0 else i}.png"
        if f.exists():
            print(row(name, amt(zones(*load(f.stem)))))
