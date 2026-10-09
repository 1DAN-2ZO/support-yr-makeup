"""속눈썹 가닥과 라이너 꼬리 가르기 — 시험 (실험 55). 정답사진 · 옮긴 그림에서 그려진 속눈썹의 바깥 가닥을 꼬리로 읽는 것(실험 54)을 막으려고.

눈마다 두 가지를 잰다 (맨얼굴과 같은 크기 · 같은 자리인 그림, 맨얼굴의 얼굴 점):
  가닥 수   윗눈꺼풀 선에서 위로 눈 폭의 LIFT 만큼 띄운 길을 따라가며, 맨얼굴보다 DARK 넘게 어두워진 짧은 구간(폭 ≤ THIN)의 수 — 속눈썹 가닥
  굵은 뿌리 눈꼬리 바깥(눈 폭의 BASE 구간)에서, 눈 축에 수직으로 봤을 때 맨얼굴보다 SOLID 넘게 어두워진 구간의 가장 긴 폭 (눈 폭 비율) — 날개 라이너

    python lash_or_wing.py <폴더> <맨얼굴 이름> <그림 이름의 정규식>      (work 아래 폴더, 저장소 밖)
"""
import json, os, re, sys
from pathlib import Path
import numpy as np
from PIL import Image

W = Path(os.environ.get("DHE_DATA_DIR", "D:/nudy-data")) / "work"
LIFT, DARK, THIN = 0.12, 8.0, 0.07
BASE, SOLID = (0.06, 0.20), 18.0
EYES = {"R": (33, 133, [33, 246, 161, 160, 159, 158, 157, 173, 133]), "L": (263, 362, [263, 466, 388, 387, 386, 385, 384, 398, 362])}


def light(im):
    a = np.asarray(im.convert("RGB"), dtype=np.float64) / 255
    a = np.where(a > 0.04045, ((a + 0.055) / 1.055) ** 2.4, a / 12.92)
    y = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    L = np.where(y > 0.008856, 116 * np.cbrt(y) - 16, 903.3 * y)
    p = np.pad(L, 1, mode="edge")   # 3x3 으로 한 번 흐린다 (ridgeTail 과 같게)
    return (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:] + 2 * p[1:-1, :-2] + 4 * p[1:-1, 1:-1] + 2 * p[1:-1, 2:] + p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) / 16


def at(D, x, y):
    xi, yi = int(round(x)), int(round(y))
    return D[yi, xi] if 0 <= yi < D.shape[0] and 0 <= xi < D.shape[1] else 0.0


def measure(LB, LI, lm, k):
    o_i, in_i, up = EYES[k]; o = np.array([lm[o_i]["x"], lm[o_i]["y"]]); inn = np.array([lm[in_i]["x"], lm[in_i]["y"]])
    ue = np.linalg.norm(o - inn); a = (o - inn) / ue; n = np.array([a[1], -a[0]]) if a[0] > 0 else np.array([-a[1], a[0]])
    if n[1] > 0: n = -n
    D = LB - LI   # 맨얼굴보다 어두워진 정도
    # 가닥 수: 윗눈꺼풀 선을 위로 띄운 길 (눈머리 · 눈꼬리 쪽 15% 는 뺀다)
    pts = np.array([[lm[i]["x"], lm[i]["y"]] for i in up]) + n * LIFT * ue
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); total = seg.sum(); strands, run, t = 0, 0, 0.15 * total
    while t <= 0.85 * total:
        j = int(np.searchsorted(np.cumsum(seg), t)); j = min(j, len(seg) - 1); r = (t - (np.cumsum(seg)[j] - seg[j])) / seg[j]; p = pts[j] + (pts[j + 1] - pts[j]) * r
        if at(D, *p) > DARK: run += 1
        else:
            if 0 < run <= THIN * ue: strands += 1
            run = 0
        t += 1
    if 0 < run <= THIN * ue: strands += 1
    # 굵은 뿌리: 눈꼬리 바깥 구간에서 수직 방향으로 가장 긴 "많이 어두워진" 구간
    thick = 0
    for u in np.arange(BASE[0] * ue, BASE[1] * ue + 1):
        best = run = 0
        for v in np.arange(-0.15 * ue, 0.35 * ue + 1):
            run = run + 1 if at(D, *(o + a * u + n * v)) > SOLID else 0; best = max(best, run)
        thick = max(thick, best)
    return strands, thick / ue


if __name__ == "__main__":
    folder, bare_name, pat = sys.argv[1:4]; d = W / folder
    bare = Image.open(d / f"{bare_name}.png"); lm = json.loads((d / f"{bare_name}.lm.json").read_text(encoding="utf-8")); LB = light(bare)
    print(f"{folder}   가닥 수 R · L | 굵은 뿌리 R · L (눈 폭 비율)")
    for f in sorted(p for p in d.glob("*.png") if re.search(pat, p.name)):
        im = Image.open(f)
        if im.size != bare.size: continue
        LI = light(im); r, l = measure(LB, LI, lm, "R"), measure(LB, LI, lm, "L")
        print(f"{f.stem[:18]:<18} {r[0]:3d} · {l[0]:3d} | {r[1]:.3f} · {l[1]:.3f}")
