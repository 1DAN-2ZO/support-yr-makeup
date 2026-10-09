"""굵은 날개(스모키 · 굵은 검정 날개) 끝 찾기 — 시험 (실험 58). ridgeTail 은 "가는 선"만 봐서 굵은 날개를 짧게 읽거나 놓친다 (실험 50 · 54).

눈꼬리 바깥에서 맨얼굴보다 DARK 넘게 어두워진 칸들 중, 눈꼬리 둘레(NEAR 안)에서 이어진 덩어리의 가장 바깥 (눈 폭 비율).
그 덩어리가 눈 축에 수직으로 THICK 넘게 두꺼운 곳이 있어야 한다 — 가는 선은 ridgeTail 의 일이다.

    python solid_wing.py <폴더> <맨얼굴 이름> <그림 이름의 정규식> [DARK …]      (work 아래 폴더, 저장소 밖)
"""
import json, os, re, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
from lash_or_wing import EYES, light

W = Path(os.environ.get("DHE_DATA_DIR", "D:/nudy-data")) / "work"
NEAR, THICK, FAR = 0.12, 0.05, 0.7


def solid_tail(LB, LI, lm, k, dark):
    o_i, in_i, _ = EYES[k]; o = np.array([lm[o_i]["x"], lm[o_i]["y"]]); inn = np.array([lm[in_i]["x"], lm[in_i]["y"]])
    ue = np.linalg.norm(o - inn); a = (o - inn) / ue; n = np.array([a[1], -a[0]]) if a[0] > 0 else np.array([-a[1], a[0]])
    if n[1] > 0: n = -n
    R = int(np.ceil(0.8 * ue)); x0, y0 = int(o[0]) - R, int(o[1]) - R; x1, y1 = x0 + 2 * R, y0 + 2 * R
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(LB.shape[1] - 1, x1), min(LB.shape[0] - 1, y1)
    D = (LB - LI)[y0:y1 + 1, x0:x1 + 1]; ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
    U = ((xs - o[0]) * a[0] + (ys - o[1]) * a[1]) / ue; V = ((xs - o[0]) * n[0] + (ys - o[1]) * n[1]) / ue
    ok = (D > dark) & (U > -0.1) & (U < FAR) & (V > -0.15) & (V < 0.4)
    seen = np.zeros_like(ok); best = None
    for sy, sx in zip(*np.nonzero(ok & (np.hypot(U, V) < NEAR))):
        if seen[sy, sx]: continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; cells = []
        while q:
            y, x = q.popleft(); cells.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < ok.shape[0] and 0 <= xx < ok.shape[1] and ok[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; q.append((yy, xx))
        cy, cx = np.array(cells).T; u, v = U[cy, cx], V[cy, cx]
        # 눈꼬리 바깥(u > 0.04)에서 가장 두꺼운 곳: u 를 1px 칸으로 나눠 그 칸의 v 범위
        thick = 0.0
        for b in np.unique(np.round(u[u > 0.04] * ue)):
            vv = v[np.round(u * ue) == b]; thick = max(thick, vv.max() - vv.min())
        if thick >= THICK and (best is None or u.max() > best): best = float(u.max())
    return best


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    folder, bare_name, pat = sys.argv[1:4]; darks = [float(x) for x in sys.argv[4:]] or [25, 35, 45]; d = W / folder
    bare = Image.open(d / f"{bare_name}.png"); lm = json.loads((d / f"{bare_name}.lm.json").read_text(encoding="utf-8")); LB = light(bare)
    f2 = lambda v: "  - " if v is None else f"{v:.2f}"
    print(f"{folder}   굵은 날개 끝 R · L — 어두워짐 기준 {' / '.join(str(int(x)) for x in darks)}")
    for f in sorted(p for p in d.glob("*.png") if re.search(pat, p.name)):
        im = Image.open(f)
        if im.size != bare.size: continue
        LI = light(im)
        print(f"{f.stem[:14]:<14} " + "   ".join(f"{f2(solid_tail(LB, LI, lm, 'R', t))} · {f2(solid_tail(LB, LI, lm, 'L', t))}" for t in darks))
