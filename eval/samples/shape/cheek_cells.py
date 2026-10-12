"""볼을 "정답사진에서 바뀐 자리"로 재기 (실험 61). 사진은 저장소 밖 (DHE_DATA_DIR)
정답사진은 맨얼굴과 겹쳐 있으므로(② 의 방식) 볼을 작은 칸으로 나눠 칸마다 정답 − 맨얼굴을 보고, 많이 바뀐 칸에 무게를 준다.
시도사진은 다른 사진이라 얼굴 점으로 맞춘 자리(affine)에서 같은 칸을 읽는다.
    python cheek_cells.py target            정답사진마다 볼 변화의 크기 (전체 평균 / 바뀐 칸에 무게)
    python cheek_cells.py real              팀원의 실제 사진(볼 화장 없음, 2~9단계)에 볼이 있는 정답을 견줌 — 0 이어야 한다
    python cheek_cells.py cross             한 정답사진을 시도사진 자리에 넣어 다른 정답과 견줌 (같은 얼굴, 만든 그림끼리)
"""
import json, os, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
DATA = Path(os.environ.get("DHE_DATA_DIR", "D:/nudy-data")) / "work"
CHEEK = {"R": [116, 117, 118, 119, 100, 142, 203, 206, 216, 192, 213, 147, 123], "L": [345, 346, 347, 348, 329, 371, 423, 426, 436, 416, 433, 376, 352]}
BY = os.environ.get("BY", "da")
STEP, NOISE, CLEAN, MIN_CELLS = 0.14, float(os.environ.get("NOISE", 2.0)), 1.5, int(os.environ.get("MINC", 8))   # 칸 크기(눈 폭 비율) · 이보다 덜 바뀐 칸은 무게 0 · 이보다 덜 바뀐 칸은 기준 피부 · 칠한 칸 최소 수


def lab_of(rgb):
    c = rgb.astype(np.float64) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    x = (0.4124 * c[..., 0] + 0.3576 * c[..., 1] + 0.1805 * c[..., 2]) / 0.95047
    y = 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]
    z = (0.0193 * c[..., 0] + 0.1192 * c[..., 1] + 0.9505 * c[..., 2]) / 1.08883
    f = lambda t: np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)
    return np.stack([116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))], -1)


class Frame:
    def __init__(self, png, lm=None):
        self.lab = lab_of(np.asarray(Image.open(png).convert("RGB")))
        self.lm = np.array([[p["x"], p["y"]] for p in json.loads(Path(lm).read_text(encoding="utf-8"))]) if lm else None
        self.eye = float(np.hypot(*(self.lm[33] - self.lm[133]))) if lm else 0

    def box(self, p, half):
        h, w, _ = self.lab.shape; x, y = int(round(p[0])), int(round(p[1])); r = max(1, int(round(half)))
        return self.lab[max(0, y - r):min(h, y + r + 1), max(0, x - r):min(w, x + r + 1)].reshape(-1, 3).mean(0)


def cells(base, k):
    """기준 사진(정답의 맨얼굴)의 볼 다각형 안 칸 가운데 자리 (in) 와 1.6배 키운 띠의 칸 (ring)"""
    poly = base.lm[CHEEK[k]]; c = poly.mean(0); step = STEP * base.eye
    big = c + (poly - c) * 1.6; x0, y0 = big.min(0); x1, y1 = big.max(0)
    w, h = int(x1 - x0) + 2, int(y1 - y0) + 2
    def mask(q):
        m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).polygon([(float(a - x0), float(b - y0)) for a, b in q], fill=1); return np.asarray(m)
    mi, mb = mask(poly), mask(big)
    ins, ring = [], []
    for y in np.arange(y0 + step / 2, y1, step):
        for x in np.arange(x0 + step / 2, x1, step):
            ix, iy = int(x - x0), int(y - y0)
            if mi[iy, ix]: ins.append((x, y))
            elif mb[iy, ix]: ring.append((x, y))
    return np.array(ins), np.array(ring), step / 2


def affine(src, dst):
    """src 점 → dst 점 (최소제곱 affine)"""
    a = np.hstack([src, np.ones((len(src), 1))]); m, *_ = np.linalg.lstsq(a, dst, rcond=None)
    return lambda p: np.hstack([p, np.ones((len(p), 1))]) @ m


FIT = {"R": CHEEK["R"] + [33, 133, 61, 2, 234, 93, 132], "L": CHEEK["L"] + [263, 362, 291, 2, 454, 323, 361]}


def read(frame, base, pts, half, k):
    """기준 사진의 칸 자리를 이 사진으로 옮겨 칸마다 Lab"""
    if len(pts) == 0: return np.zeros((0, 3))
    q = pts if frame.lm is None or frame is base else affine(base.lm[FIT[k]], frame.lm[FIT[k]])(pts)
    s = 1 if frame.lm is None or frame is base else frame.eye / base.eye
    return np.array([frame.box(p, half * s) for p in q])


def target_side(tbare, target, k):
    ins, ring, half = cells(tbare, k)
    dt = read(target, tbare, ins, half, k) - read(tbare, tbare, ins, half, k)
    # 무게: 붉어진 만큼(da). 모델은 화장 없는 참고에서도 볼을 다시 그려 밝기가 2~4 바뀌므로(da 는 0) 색 거리 전체로는 못 가른다. BY=de 면 색 거리로
    de = np.linalg.norm(dt, axis=1); w = np.clip((de if BY == "de" else dt[:, 1]) - NOISE, 0, None)
    flat = dt.mean(0)
    t = (dt * w[:, None]).sum(0) / w.sum() if w.sum() > 0 else np.zeros(3)
    return dict(ins=ins, ring=ring, half=half, w=w, t=t, flat=float(np.linalg.norm(flat)), strong=float(np.linalg.norm(t)), n=int((w > 0).sum()), total=len(ins), de=de)


def cur_side(T, tbare, bare, cur, k):
    """시도의 변화: (칠한 칸 − 기준 피부) 가 맨얼굴에서 얼마나 달라졌나. 기준 피부 = 볼 둘레 띠 중 정답에서 안 바뀐 칸"""
    if T["n"] < MIN_CELLS: return None
    w = T["w"]
    ring_t = np.linalg.norm(read_target_ring(T, tbare, k), axis=1)
    ref = T["ring"][ring_t < CLEAN] if (ring_t < CLEAN).sum() >= 6 else T["ring"]
    def rel(f):
        part = read(f, tbare, T["ins"], T["half"], k); r = read(f, tbare, ref, T["half"], k).mean(0)
        return part - r
    d = ((rel(cur) - rel(bare)) * w[:, None]).sum(0) / w.sum()
    return float(d @ T["t"] / (T["t"] @ T["t"]))


_RING = {}
def read_target_ring(T, tbare, k):
    return _RING[(id(T), k)]


def measure(tbare, target, bare=None, cur=None):
    out = {}
    for k in "RL":
        T = target_side(tbare, target, k)
        _RING[(id(T), k)] = read(target, tbare, T["ring"], T["half"], k) - read(tbare, tbare, T["ring"], T["half"], k)
        out[k] = dict(flat=T["flat"], strong=T["strong"], n=T["n"], total=T["total"], da=float(T["t"][1]), amount=cur_side(T, tbare, bare, cur, k) if cur is not None else None)
    return out


def fr(d, name): return Frame(DATA / d / f"{name}.png", DATA / d / "bare.lm.json")
f1 = lambda v: "   - " if v is None else f"{v:5.1f}"
f2 = lambda v: "    - " if v is None else f"{v:6.2f}"

mode = sys.argv[1]
if mode == "target":
    print(f"칸 {STEP} · 무게 0 인 변화 {NOISE}\n정답사진                전체 평균 R · L   바뀐 칸에 무게 R · L   붉어짐(da) R · L   칠한 칸 R · L")
    for who in ("team", "me", "K1", "K2"):
        d = f"recal/{who}"; tb = fr(d, "bare")
        for f in sorted((DATA / d).glob("t_*.png")):
            m = measure(tb, Frame(f)); r, l = m["R"], m["L"]
            print(f"{who:5} {f.stem:10}      {f1(r['flat'])} · {f1(l['flat'])}        {f1(r['strong'])} · {f1(l['strong'])}        {f1(r['da'])} · {f1(l['da'])}     {r['n']:3}/{r['total']} · {l['n']:3}/{l['total']}")
elif mode == "real":
    d = "recal/team"; tb = fr(d, "bare"); P = DATA / "trial/p1/pairs"
    bare = Frame(P / "s2k1_open_bare.png", P / "s2k1_open_bare.lm.json")
    for t in sys.argv[2:] or ["t_s2", "t_s3"]:
        tg = Frame(DATA / d / f"{t}.png"); m0 = measure(tb, tg)
        print(f"\n정답 = {t} (볼 변화 {m0['R']['strong']:.1f} · {m0['L']['strong']:.1f}) — 팀원 실제 사진(볼 화장 없음)에서 읽힌 볼의 양 R · L, 다섯 장")
        for s in range(2, 10):
            row = []
            for kk in range(1, 6):
                p = P / f"s{s}k{kk}_open_made.png"
                if not p.exists(): continue
                m = measure(tb, tg, bare, Frame(p, P / f"s{s}k{kk}_open_made.lm.json")); row.append((m["R"]["amount"], m["L"]["amount"]))
            if row:
                rng = lambda i: "-" if row[0][i] is None else f"{min(r[i] for r in row):.2f}~{max(r[i] for r in row):.2f}"
                med = lambda i: float(np.median([r[i] for r in row if r[i] is not None])) if any(r[i] is not None for r in row) else None
                print(f"  {s}단계  가운데 값 {f2(med(0))} · {f2(med(1))}   범위 R {rng(0)} · L {rng(1)}")
elif mode == "cross":
    for who in sys.argv[2:] or ["K1", "K2", "team", "me"]:
        d = f"recal/{who}"; tb = fr(d, "bare"); names = [f.stem for f in sorted((DATA / d).glob("t_*.png"))]
        T = {n: Frame(DATA / d / f"{n}.png") for n in names}; strong = {n: measure(tb, T[n]) for n in names}
        tg = [n for n in names if min(strong[n]["R"]["n"], strong[n]["L"]["n"]) >= MIN_CELLS]
        print(f"\n[{who}] 볼이 읽힌 정답: {', '.join(tg) or '없음'}\n{'시도 ＼ 정답':14}" + "".join(f"{n[2:]:>14}" for n in tg))
        for c in names:
            cur = Frame(DATA / d / f"{c}.png"); cur.lm, cur.eye = tb.lm, tb.eye
            cells_ = []
            for n in tg:
                m = measure(tb, T[n], tb, cur); cells_.append(f"{f2(m['R']['amount'])} ·{f2(m['L']['amount'])}")
            print(f"{c[2:]:14}" + "".join(f"{x:>14}" for x in cells_))
