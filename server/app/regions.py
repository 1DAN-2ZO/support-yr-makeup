"""부위 랜드마크 폴리곤 — 클라이언트 poc/look-tryon/client/lib/regions.js `buildRegions`의 파이썬 복제.

regions.js가 단일 진실 원천이다. 인덱스·EYESHADOW_REACH를 바꾸면 이 파일도 같은 PR에서 고친다
(server/tests/test_layer.py가 regions.js를 파싱해 어긋나면 실패시킨다).
FOREHEAD는 비화장 기준 영역(전역 편향 추정용)으로 client/app-webgl.js와 같은 값.
"""

from __future__ import annotations

from collections.abc import Sequence

EYES_UPPER = {
    "R": [133, 173, 157, 158, 159, 160, 161, 246, 33],
    "L": [362, 398, 384, 385, 386, 387, 388, 466, 263],
}
BROW = {
    "R": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "L": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
}
CHEEK = {
    "R": [116, 117, 118, 101, 36, 205, 187, 123],
    "L": [345, 346, 347, 330, 266, 425, 411, 352],
}
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
EYESHADOW_REACH = 0.45
FOREHEAD = [10, 109, 108, 151, 337, 338]

Point = tuple[float, float]


def _centroid(pts: list[Point]) -> Point:
    n = len(pts)
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)


def _lerp(a: Point, b: Point, t: float) -> Point:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def build_regions(lm: Sequence[tuple[float, float]], w: int, h: int) -> dict[str, list[Point]]:
    """정규화 랜드마크(x, y) 시퀀스 + 이미지 크기 -> 부위별 폴리곤(픽셀). regions.js buildRegions와 동일."""

    def pts(idx: list[int]) -> list[Point]:
        return [(lm[i][0] * w, lm[i][1] * h) for i in idx]

    brow_r, brow_l = pts(BROW["R"]), pts(BROW["L"])
    brow_rc, brow_lc = _centroid(brow_r), _centroid(brow_l)
    lid_r, lid_l = pts(EYES_UPPER["R"]), pts(EYES_UPPER["L"])
    eye_r = [*lid_r, *reversed([_lerp(p, brow_rc, EYESHADOW_REACH) for p in lid_r])]
    eye_l = [*lid_l, *reversed([_lerp(p, brow_lc, EYESHADOW_REACH) for p in lid_l])]
    return {
        "browR": brow_r,
        "browL": brow_l,
        "eyeR": eye_r,
        "eyeL": eye_l,
        "lips": pts(LIPS),
        "cheekR": pts(CHEEK["R"]),
        "cheekL": pts(CHEEK["L"]),
    }
