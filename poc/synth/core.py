"""합성 학습 데이터 생성기 — 핵심 계산 모듈 (core.js의 파이썬 이식본).

core.js와 **같은 시드에서 같은 결과**가 나와야 한다. parity.py가 그것을 검증한다.
브라우저는 시연용이고, 대량 생성은 이쪽에서 돈다.

의존성 없음 (표준 라이브러리만). 이미지 출력은 generate.py가 Pillow로 한다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

# ---------------- 랜드마크 인덱스 ----------------

IDX = {
    "eyeRingL": [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    "eyeRingR": [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    "lashUpperL": [33, 246, 161, 160, 159, 158, 157, 173, 133],
    "lashUpperR": [263, 466, 388, 387, 386, 385, 384, 398, 362],
    "browUpperL": [70, 63, 105, 66, 107],
    "browLowerL": [55, 65, 52, 53, 46],
    "browUpperR": [300, 293, 334, 296, 336],
    "browLowerR": [285, 295, 282, 283, 276],
    "lipOuter": [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
    "eyeBottomL": 145,
    "eyeBottomR": 374,
    "mouthCornerL": 61,
    "mouthCornerR": 291,
    "eyeOuterL": 33,
    "eyeOuterR": 263,
}

PART_IDS = ["brow", "liner", "shadow", "lip", "cheek"]
PART_LABEL = {"brow": 1, "liner": 2, "shadow": 3, "lip": 4, "cheek": 5}

PALETTE = {
    "brow": ["#4a3728", "#5c4033", "#6b4f3a", "#3d2b1f"],
    "liner": ["#12100f", "#1c1917", "#3b2f2a"],
    "shadow": ["#8b6f5e", "#a67f6b", "#7d5f52", "#b08a7a"],
    "lip": ["#c2615e", "#d4776f", "#b8504f", "#cf8177", "#a84a52"],
    "cheek": ["#e08b86", "#dd7f7f", "#e69a92"],
}

# ---------------- 난수 ----------------

_U32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """자바스크립트 Math.imul — 32비트 부호 있는 곱셈."""
    r = (a * b) & _U32
    return r - 0x100000000 if r >= 0x80000000 else r


def mulberry32(seed: int) -> Callable[[], float]:
    """core.js의 mulberry32와 비트 단위로 같은 수열을 낸다."""
    state = seed & _U32

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & _U32
        t = state
        t = _imul(t ^ (t >> 15), t | 1) & _U32
        t = (t ^ (t + _imul(t ^ (t >> 7), t | 61))) & _U32
        return ((t ^ (t >> 14)) & _U32) / 4294967296

    return nxt


def _pick(rng, arr):
    return arr[math.floor(rng() * len(arr)) % len(arr)]


def _between(rng, lo, hi):
    return lo + rng() * (hi - lo)


def random_params(seed: int) -> dict:
    """한 장을 만들 변형 파라미터. core.js randomParams와 같은 순서로 난수를 뽑아야 한다."""
    rng = mulberry32(seed)
    asym = _between(rng, -0.18, 0.18)
    return {
        "seed": seed,
        "asym": asym,
        "brow": {
            "color": _pick(rng, PALETTE["brow"]),
            "alpha": _between(rng, 0.4, 0.72),
            "fill": _between(rng, 1.0, 1.18),
            "tailLift": _between(rng, -0.1, 0.22),
        },
        "liner": {
            "color": _pick(rng, PALETTE["liner"]),
            "alpha": _between(rng, 0.75, 1.0),
            "thickness": _between(rng, 0.05, 0.13),
            "wingLen": _between(rng, 0.0, 0.30),
            "wingAngle": _between(rng, 0.05, 0.55),
        },
        "shadow": {
            "color": _pick(rng, PALETTE["shadow"]),
            "alpha": _between(rng, 0.2, 0.5),
            "height": _between(rng, 0.15, 0.42),
            "present": rng() > 0.25,
        },
        "lip": {
            "color": _pick(rng, PALETTE["lip"]),
            "alpha": _between(rng, 0.6, 0.95),
            "overline": _between(rng, -0.04, 0.10),
        },
        "cheek": {
            "color": _pick(rng, PALETTE["cheek"]),
            "alpha": _between(rng, 0.15, 0.4),
            "radius": _between(rng, 0.22, 0.40),
            "present": rng() > 0.2,
        },
    }


# ---------------- 기하 도우미 ----------------

Point = tuple[float, float]


def _sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def _add(a: Point, b: Point) -> Point:
    return (a[0] + b[0], a[1] + b[1])


def _mul(a: Point, k: float) -> Point:
    return (a[0] * k, a[1] * k)


def _len(a: Point) -> float:
    return math.hypot(a[0], a[1]) or 1.0


def _norm(a: Point) -> Point:
    return _mul(a, 1 / _len(a))


def _lerp(a: Point, b: Point, t: float) -> Point:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _at(lm, i: int) -> Point:
    p = lm[i]
    return (p[0], p[1]) if isinstance(p, (tuple, list)) else (p["x"], p["y"])


def _many(lm, idxs) -> list[Point]:
    return [_at(lm, i) for i in idxs]


def centroid(poly: list[Point]) -> Point:
    x = sum(p[0] for p in poly)
    y = sum(p[1] for p in poly)
    return (x / len(poly), y / len(poly))


def polygon_area(poly: list[Point]) -> float:
    s = 0.0
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        s += a[0] * b[1] - b[0] * a[1]
    return abs(s) / 2


def bbox(poly: list[Point]) -> dict:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys),
            "w": max(xs) - min(xs), "h": max(ys) - min(ys)}


def _outward_normals(pts: list[Point], away: Point) -> list[Point]:
    ns = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        t = _norm(_sub(b, a))
        ns.append((-t[1], t[0]))
    m = len(pts) // 2
    d = _sub(pts[m], away)
    s = 1 if ns[m][0] * d[0] + ns[m][1] * d[1] >= 0 else -1
    return [_mul(n, s) for n in ns]


def _band(pts: list[Point], away: Point, thickness_at) -> list[Point]:
    ns = _outward_normals(pts, away)
    outer = [_add(p, _mul(ns[i], thickness_at(i, len(pts)))) for i, p in enumerate(pts)]
    return outer + list(reversed(pts))


def face_width(lm) -> float:
    return _len(_sub(_at(lm, IDX["eyeOuterR"]), _at(lm, IDX["eyeOuterL"])))


def _eye_width(lm, side: str) -> float:
    lash = _many(lm, IDX["lashUpperL"] if side == "L" else IDX["lashUpperR"])
    return _len(_sub(lash[-1], lash[0]))


# ---------------- 부위별 폴리곤 ----------------


def liner_polygon(lm, side: str, p: dict) -> list[Point]:
    lash = _many(lm, IDX["lashUpperL"] if side == "L" else IDX["lashUpperR"])
    ring = _many(lm, IDX["eyeRingL"] if side == "L" else IDX["eyeRingR"])
    eye = _eye_width(lm, side)
    c = centroid(ring)

    base = eye * p["thickness"]
    poly = _band(lash, c, lambda i, n: base * (1 - 0.55 * (i / (n - 1))))

    if p["wingLen"] > 0.01:
        outer, inner = lash[0], lash[-1]
        d = _norm(_sub(outer, inner))
        a = p["wingAngle"] if side == "L" else -p["wingAngle"]
        rot = (d[0] * math.cos(a) - d[1] * math.sin(a),
               d[0] * math.sin(a) + d[1] * math.cos(a))
        poly.insert(0, _add(outer, _mul(rot, eye * p["wingLen"])))
    return poly


def shadow_polygon(lm, side: str, p: dict) -> list[Point]:
    lash = _many(lm, IDX["lashUpperL"] if side == "L" else IDX["lashUpperR"])
    ring = _many(lm, IDX["eyeRingL"] if side == "L" else IDX["eyeRingR"])
    eye = _eye_width(lm, side)
    c = centroid(ring)
    h = eye * p["height"]
    return _band(lash, c, lambda i, n: h * (0.45 + 0.55 * math.sin(math.pi * (i / (n - 1)))))


def brow_polygon(lm, side: str, p: dict) -> list[Point]:
    upper = _many(lm, IDX["browUpperL"] if side == "L" else IDX["browUpperR"])
    lower = _many(lm, IDX["browLowerL"] if side == "L" else IDX["browLowerR"])
    poly = upper + lower
    c = centroid(poly)
    eye = _eye_width(lm, side)

    face_c = centroid(_many(lm, [IDX["eyeOuterL"], IDX["eyeOuterR"]]))
    tail_is_first = _len(_sub(upper[0], face_c)) > _len(_sub(upper[-1], face_c))

    out = []
    for i, pt in enumerate(poly):
        grown = _add(c, _mul(_sub(pt, c), p["fill"]))
        idx_in_upper = i if i < len(upper) else len(poly) - 1 - i + len(upper) - 1
        t = idx_in_upper / (len(upper) - 1) if len(upper) > 1 else 0
        w = 1 - t if tail_is_first else t
        out.append((grown[0], grown[1] - eye * p["tailLift"] * max(0, w)))
    return out


def lip_polygon(lm, p: dict) -> list[Point]:
    poly = _many(lm, IDX["lipOuter"])
    c = centroid(poly)
    k = 1 + p["overline"]
    return [_add(c, _mul(_sub(pt, c), k)) for pt in poly]


def cheek_polygon(lm, side: str, p: dict, steps: int = 24) -> list[Point]:
    eye_b = _at(lm, IDX["eyeBottomL"] if side == "L" else IDX["eyeBottomR"])
    mouth = _at(lm, IDX["mouthCornerL"] if side == "L" else IDX["mouthCornerR"])
    fw = face_width(lm)
    face_c = centroid(_many(lm, [IDX["eyeOuterL"], IDX["eyeOuterR"]]))
    mid = _lerp(eye_b, mouth, 0.5)
    sign = 1 if mid[0] - face_c[0] > 0 else (-1 if mid[0] - face_c[0] < 0 else 0)
    c = (mid[0] + sign * fw * 0.12, mid[1])
    rx = fw * p["radius"] * 0.5
    ry = rx * 0.62
    return [(c[0] + math.cos(a) * rx, c[1] + math.sin(a) * ry)
            for a in ((i / steps) * math.pi * 2 for i in range(steps))]


# ---------------- 한 장 조립 ----------------


@dataclass
class Part:
    id: str
    label: int
    color: str
    alpha: float
    feather: float
    polys: list = field(default_factory=list)


def build_sample(lm, params: dict) -> dict:
    parts: list[Part] = []

    def side(base: dict, k: str) -> dict:
        return {**base, k: base[k] * (1 + params["asym"])}

    def side_neg(base: dict, k: str) -> dict:
        return {**base, k: base[k] * (1 - params["asym"])}

    if params["shadow"]["present"]:
        parts.append(Part("shadow", PART_LABEL["shadow"], params["shadow"]["color"],
                          params["shadow"]["alpha"], 0.5, [
                              shadow_polygon(lm, "L", side(params["shadow"], "height")),
                              shadow_polygon(lm, "R", side_neg(params["shadow"], "height"))]))
    parts.append(Part("liner", PART_LABEL["liner"], params["liner"]["color"],
                      params["liner"]["alpha"], 0.06, [
                          liner_polygon(lm, "L", side(params["liner"], "thickness")),
                          liner_polygon(lm, "R", side_neg(params["liner"], "thickness"))]))
    parts.append(Part("brow", PART_LABEL["brow"], params["brow"]["color"],
                      params["brow"]["alpha"], 0.22, [
                          brow_polygon(lm, "L", side(params["brow"], "fill")),
                          brow_polygon(lm, "R", side_neg(params["brow"], "fill"))]))
    parts.append(Part("lip", PART_LABEL["lip"], params["lip"]["color"],
                      params["lip"]["alpha"], 0.08, [lip_polygon(lm, params["lip"])]))
    if params["cheek"]["present"]:
        parts.append(Part("cheek", PART_LABEL["cheek"], params["cheek"]["color"],
                          params["cheek"]["alpha"], 0.7, [
                              cheek_polygon(lm, "L", side(params["cheek"], "radius")),
                              cheek_polygon(lm, "R", side_neg(params["cheek"], "radius"))]))
    return {"params": params, "parts": parts}


def sample_stats(sample: dict) -> dict:
    return {part.id: sum(polygon_area(poly) for poly in part.polys)
            for part in sample["parts"]}
