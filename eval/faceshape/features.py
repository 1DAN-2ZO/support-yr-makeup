"""얼굴형 판별 기준(특징) 계산 — #60 규칙 기준선 다음 단계, S-2 후보 B.

앱 규칙(estimateFaceShape)은 폭 3개(얼굴·턱·이마)와 길이만 본다. 여기서는 사람이 얼굴형을 볼 때 보는 것을
숫자로 바꿔 더한다.

1. 높이별 얼굴 폭 — 이마 위(10)부터 턱 끝(152)까지 여러 높이에서 윤곽선 좌우 폭을 재고 가장 넓은 폭으로 나눈다
2. 턱 모서리 각도 — 좌우 턱 모서리(172·397)에서 위(광대 쪽)와 아래(턱 끝 쪽) 윤곽선이 이루는 각
3. 턱 끝 각도 — 턱 끝(152)에서 좌우 윤곽선이 이루는 각
4. 얼굴 길이 ÷ 폭 — 기존 규칙과 같은 기준

모든 좌표는 두 눈 바깥 끝(33·263)을 잇는 선이 수평이 되게 돌린 뒤 계산한다(고개 기울기 제거).
입력은 MediaPipe Face Landmarker 478점(px).
"""

from __future__ import annotations

import numpy as np

# MediaPipe FACE_OVAL 윤곽선 순서 (이마 위 10 → 오른쪽으로 돌아 턱 끝 152 → 왼쪽 → 다시 10)
FACE_OVAL = [
    10,
    338,
    297,
    332,
    284,
    251,
    389,
    356,
    454,
    323,
    361,
    288,
    397,
    365,
    379,
    378,
    400,
    377,
    152,
    148,
    176,
    149,
    150,
    136,
    172,
    58,
    132,
    93,
    234,
    127,
    162,
    21,
    54,
    103,
    67,
    109,
]
LEVELS = np.linspace(0.08, 0.92, 12)  # 이마 위(0) ~ 턱 끝(1) 사이 높이 12곳


def _upright(lm: np.ndarray) -> np.ndarray:
    """눈 바깥 끝 두 점이 수평이 되도록 회전하고, 이마 위(10)를 원점으로."""
    a, b = lm[33], lm[263]
    ang = np.arctan2(b[1] - a[1], b[0] - a[0])
    c, s = np.cos(-ang), np.sin(-ang)
    rot = (lm - lm[10]) @ np.array([[c, -s], [s, c]]).T
    return rot


def _angle(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    """점 p 에서 a, b 방향이 이루는 각(도)."""
    u, v = a - p, b - p
    cos = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def _side_x_at(poly: np.ndarray, y: float) -> float | None:
    """한쪽 윤곽선(위→아래 순서)에서 높이 y 의 x 좌표를 선형 보간."""
    for i in range(len(poly) - 1):
        y0, y1 = poly[i][1], poly[i + 1][1]
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1:
            t = (y - y0) / (y1 - y0)
            return float(poly[i][0] + t * (poly[i + 1][0] - poly[i][0]))
    return None


def features(lm_px) -> dict:
    lm = _upright(np.asarray(lm_px, dtype=float))
    oval = lm[FACE_OVAL]
    top, chin = lm[10], lm[152]
    height = chin[1] - top[1]
    right = oval[: FACE_OVAL.index(152) + 1]  # 10 → 152 (이미지 오른쪽)
    left = oval[FACE_OVAL.index(152) :][::-1]  # 10 → 152 (이미지 왼쪽)
    left = np.vstack([oval[0], left[:-1]]) if left[0][1] > oval[0][1] else left

    widths = []
    for t in LEVELS:
        y = top[1] + t * height
        xr, xl = _side_x_at(right, y), _side_x_at(left, y)
        widths.append(abs(xr - xl) if xr is not None and xl is not None else np.nan)
    widths = np.array(widths)
    wmax = np.nanmax(widths)
    prof = widths / wmax

    jaw_r = _angle(lm[397], lm[361], lm[379])
    jaw_l = _angle(lm[172], lm[132], lm[150])
    chin_ang = _angle(lm[152], lm[148], lm[377])
    out = {f"w{i:02d}": float(v) for i, v in enumerate(prof)}
    out.update(
        {
            "len_w": float(height / wmax),
            "jaw_angle": (jaw_r + jaw_l) / 2,
            "chin_angle": chin_ang,
            "widest_at": float(LEVELS[int(np.nanargmax(widths))]),  # 가장 넓은 높이 (0 = 이마 위, 1 = 턱 끝)
        }
    )
    return out
