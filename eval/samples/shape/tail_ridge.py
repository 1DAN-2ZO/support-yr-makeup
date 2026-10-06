"""결과 모양 실험 30 — 맨얼굴과 겹치는 그림에서 라이너 꼬리를 '가는 선' 으로 잰다.

    DHE_DATA_DIR=D:/nudy-data uv run --extra eval --with scikit-image python eval/samples/shape/tail_ridge.py <폴더> <맨얼굴 이름> <그림 이름> …
    … tail_ridge.py --selftest <폴더> <맨얼굴 이름>      맨얼굴에 길이를 아는 꼬리(0 · 8 · 15 · 30%)를 그려 넣고 잰다

<폴더>/<이름>.png 과 맨얼굴의 <이름>.lm.json (얼굴 점 478개 px). 그림은 맨얼굴과 같은 크기 · 같은 자리여야 한다
(정답사진 · 모델이 옮긴 그림을 맨얼굴 얼굴 점에 맞춰 붙인 판). 따로 찍은 사진은 linerFan (score-shape.ts) 이 맡는다.

왜 따로 만드나: 모델이 옮긴 그림은 눈꼬리 바깥 섀도우가 넓게 어둡다(L -20~-30). 맨얼굴보다 어두워진 칸을 세면 그것이 꼬리로 읽힌다 (README 실험 28).
재는 법: 칸마다 '선 값' = 양옆(네 방향, SIDE 떨어진 두 칸) 중 더 어두운 쪽보다 얼마나 더 어두운가 — 넓은 그늘은 양옆도 같이 어두워 0 이다.
        맨얼굴의 선 값을 뺀 것이 MIN 이상이고 맨얼굴보다 DARK 넘게 어두워진 칸을 새 선으로 본다. 눈꼬리 얼굴 점에서 REACH 안에 닿는 덩어리의 가장 바깥 칸이 꼬리 끝.
        길이는 눈꼬리 얼굴 점에서 바깥으로 잰 값이다 — 얼굴 점이 실제 눈꼬리보다 안쪽이면 그만큼 길게 나오므로, 정답 그림과 **같은 맨얼굴 틀에서** 견줄 때만 뜻이 있다.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, label
from skimage import color

SIDE, MIN, DARK, REACH, FAR = (0.025,), 6.0, 8.0, 0.22, 0.5   # 양옆 폭(눈 폭 비율) · 선 값(L) · 맨얼굴보다 어두워진 정도(L) · 눈꼬리에서 이어졌다고 보는 거리 · 보는 범위
EYE = {"R": (33, 133, [33, 246, 161, 160, 159, 158]), "L": (263, 362, [263, 466, 388, 387, 386, 385])}


def axes(lm, side):
    o, i, _ = EYE[side]
    ox, oy, ix, iy = lm[o]["x"], lm[o]["y"], lm[i]["x"], lm[i]["y"]
    ue = math.hypot(ox - ix, oy - iy)
    a = np.array([(ox - ix) / ue, (oy - iy) / ue])
    n = np.array([-a[1], a[0]])
    return np.array([ox, oy]), a, (-n if n[1] > 0 else n), ue


def ridge_map(L, ue):
    """칸마다 선 값: 네 방향 중 가장 큰 (양옆 중 더 어두운 쪽 − 자기). 넓은 그늘 · 그늘의 가장자리는 0"""
    out = np.full(L.shape, -1e9)
    for s in SIDE:
        k = max(2, round(s * ue))
        for dy, dx in ((0, k), (k, 0), (k, k), (k, -k)):
            out = np.maximum(out, np.minimum(np.roll(L, (dy, dx), (0, 1)), np.roll(L, (-dy, -dx), (0, 1))) - L)
    return out


def tail(L, LB, lm, side):
    """눈꼬리 둘레에서 새로 생긴 가는 선의 끝 — (눈꼬리 얼굴 점에서 바깥으로 잰 거리, 눈 축 기준 각도).
    시작점은 보지 않는다: 얼굴 점의 눈꼬리가 실제 눈꼬리와 다를 수 있고(모델은 실제 눈꼬리에서 그린다), 견주는 것은 끝의 자리다."""
    c, a, n, ue = axes(lm, side)
    H, W = L.shape
    yy, xx = np.mgrid[0:H, 0:W]
    u = ((xx - c[0]) * a[0] + (yy - c[1]) * a[1]) / ue
    v = ((xx - c[0]) * n[0] + (yy - c[1]) * n[1]) / ue
    win = (u > -0.25) & (u < FAR) & (v > -0.3) & (v < 0.4)
    new = (ridge_map(L, ue) - np.maximum(ridge_map(LB, ue), 0) >= MIN) & (L - LB <= -DARK) & win
    lab_, k = label(new, structure=np.ones((3, 3)))
    if not k:
        return 0.0, 0.0
    sizes = np.bincount(lab_.ravel())
    near = np.unique(lab_[new & (np.hypot(u, v) < REACH)])
    keep = np.isin(lab_, [i for i in near if i > 0 and sizes[i] >= max(6, (0.03 * ue) ** 2)])
    if not keep.any():
        return 0.0, 0.0
    j = np.unravel_index(np.argmax(np.where(keep, u, -9)), u.shape)
    return float(u[j]), float(np.degrees(np.arctan2(v[j], u[j])))


def draw(img, lm, sides, length, deg=15.0):
    """맨얼굴에 꼬리를 그려 넣는다 (눈꼬리에서 눈 축 기준 deg 도, 눈 폭의 length 배, 끝으로 갈수록 가늘게) + 윗눈꺼풀 선"""
    K, (W, H) = 4, img.size
    m = Image.new("L", (W * K, H * K), 0)
    d = ImageDraw.Draw(m)
    for s in sides:
        c, a, n, ue = axes(lm, s)
        r = math.radians(deg)
        dv = a * math.cos(r) + n * math.sin(r)
        pv = np.array([-dv[1], dv[0]])
        w0 = 0.022 * ue
        if length > 0:
            tip = c + dv * length * ue
            d.polygon([tuple((c + pv * w0) * K), tuple((c - pv * w0) * K), tuple(tip * K)], fill=255)
        up = [(lm[j]["x"], lm[j]["y"]) for j in EYE[s][2]]
        for k in range(len(up) - 1):
            d.line([(up[k][0] * K, up[k][1] * K), (up[k + 1][0] * K, up[k + 1][1] * K)], fill=255, width=max(2, round(0.04 * ue * K * (1 - k / 7))))
    m = m.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: int(v * 0.9))
    return Image.composite(Image.new("RGB", (W, H), (28, 22, 24)), img.convert("RGB"), m)


def lightness(im):
    return gaussian_filter(color.rgb2lab(np.asarray(im.convert("RGB")).astype(float) / 255)[..., 0], 0.6)


def show(name, L, LB, lm):
    out = []
    for s in "RL":
        r, deg = tail(L, LB, lm, s)
        out.append("   없음     " if r < 0.04 else "%3.0f%% %4.0f도 " % (r * 100, deg))
    print("%-26s R %s | L %s" % (name, out[0], out[1]))


if __name__ == "__main__":
    args = sys.argv[1:]
    self_test = args and args[0] == "--selftest"
    DIR, BARE, NAMES = Path(args[1 if self_test else 0]), args[2 if self_test else 1], args[3 if self_test else 2:]
    lm = json.loads((DIR / f"{BARE}.lm.json").read_text(encoding="utf-8"))
    bare = Image.open(DIR / f"{BARE}.png")
    LB = lightness(bare)
    print("그림                         오른쪽 눈      | 왼쪽 눈        (길이 = 눈 폭 %, 각도 = 눈 축 기준 · 위가 +)")
    if self_test:
        for length, deg in ((0, 15), (0.05, 15), (0.08, 15), (0.15, 15), (0.3, 15), (0.15, 40), (0.3, -5)):
            show("그려 넣음 %2.0f%% · %d도" % (length * 100, deg), lightness(draw(bare, lm, "RL", length, deg)), LB, lm)
        show("한쪽(R)만 30%", lightness(draw(bare, lm, "R", 0.3)), LB, lm)
    for n in NAMES:
        show(n, lightness(Image.open(DIR / f"{n}.png")), LB, lm)
