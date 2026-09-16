"""검증용 가짜 얼굴 랜드마크 (fixture.mjs의 파이썬 이식본). 같은 값을 만들어야 한다."""

from __future__ import annotations

import math

from core import IDX


def make_fixture() -> list[tuple[float, float]]:
    lm = [(200.0, 250.0) for _ in range(478)]

    def put(i: int, x: float, y: float) -> None:
        lm[i] = (x, y)

    def ring(idxs, cx, start_deg, step):
        for i, idx in enumerate(idxs):
            a = math.radians(start_deg + step * i)
            put(idx, cx + 25 * math.cos(a), 200 + 10 * math.sin(a))

    ring(IDX["eyeRingL"], 150, 180, -22.5)
    ring(IDX["eyeRingR"], 250, 0, 22.5)

    def brow(upper, lower, outer_x, inner_x, y):
        for i, idx in enumerate(upper):
            t = i / (len(upper) - 1)
            put(idx, outer_x + (inner_x - outer_x) * t, y - 4 * math.sin(math.pi * t))
        for i, idx in enumerate(lower):
            t = i / (len(lower) - 1)
            put(idx, inner_x + (outer_x - inner_x) * t, y + 12)

    brow(IDX["browUpperL"], IDX["browLowerL"], 122, 178, 172)
    brow(IDX["browUpperR"], IDX["browLowerR"], 278, 222, 172)

    n = len(IDX["lipOuter"])
    for i, idx in enumerate(IDX["lipOuter"]):
        a = math.radians(180 + i * (360 / n))
        put(idx, 200 + 32 * math.cos(a), 340 + 16 * math.sin(a))

    return lm
