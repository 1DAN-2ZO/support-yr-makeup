"""look_values_from_arrays(#121) 시험 — 합성 numpy 이미지·손으로 만든 마스크로, mediapipe 없이.
extract_layer_from_arrays와 같은 편향 보정(_bias_corrected_delta_de)을 공유하므로 그 부분의
회귀는 test_layer.py가 잡는다. 여기는 부위별 대표값으로 요약하는 부분만 본다."""

import numpy as np

from server.app.layer import look_values_from_arrays

H = W = 40
BASE = (200, 170, 150)


def solid(color=BASE):
    return np.full((H, W, 3), color, dtype=np.uint8)


def _rect(r0, r1, c0, c1):
    m = np.zeros((H, W), dtype=bool)
    m[r0:r1, c0:c1] = True
    return m


MASKS = {
    "browL": _rect(2, 5, 2, 10),
    "browR": _rect(2, 5, 12, 20),
    "eyeL": _rect(8, 14, 2, 10),
    "eyeR": _rect(8, 14, 12, 20),
    "lips": _rect(20, 26, 14, 26),
    "cheekL": _rect(16, 20, 2, 10),
    "cheekR": _rect(16, 20, 12, 20),
}
FOREHEAD = _rect(30, 34, 14, 26)

EXPECTED_PARTS = {"brow", "liner", "shadow", "lip", "cheek"}


def test_identity_gives_near_zero_alpha_everywhere():
    out = look_values_from_arrays(solid(), solid(), MASKS, FOREHEAD)
    assert out["brow"]["alpha"] == 0.0
    assert out["shadow"]["alphaL"] == out["shadow"]["alphaR"] == 0.0
    assert out["cheek"]["alphaL"] == out["cheek"]["alphaR"] == 0.0
    assert out["lip"]["alpha"] == 0.0


def test_all_five_parts_present_liner_is_none():
    out = look_values_from_arrays(solid(), solid(), MASKS, FOREHEAD)
    assert set(out) == EXPECTED_PARTS
    assert out["liner"] is None


def test_brow_has_alpha_but_no_color():
    result = solid()
    result[MASKS["browL"]] = (140, 120, 110)
    result[MASKS["browR"]] = (140, 120, 110)
    out = look_values_from_arrays(solid(), result, MASKS, FOREHEAD)
    assert out["brow"]["alpha"] > 0
    assert "color" not in out["brow"]


def test_shadow_alpha_is_sided_and_color_is_shared():
    result = solid()
    result[MASKS["eyeL"]] = (60, 40, 40)  # 왼쪽만 진한 섀도우
    out = look_values_from_arrays(solid(), result, MASKS, FOREHEAD)
    assert out["shadow"]["alphaL"] > out["shadow"]["alphaR"]
    assert out["shadow"]["alphaR"] == 0.0
    color = out["shadow"]["color"]
    assert len(color) == 3
    assert all(0 <= c <= 255 for c in color)


def test_cheek_alpha_is_sided_like_shadow():
    result = solid()
    result[MASKS["cheekR"]] = (240, 150, 120)
    out = look_values_from_arrays(solid(), result, MASKS, FOREHEAD)
    assert out["cheek"]["alphaR"] > out["cheek"]["alphaL"]
    assert out["cheek"]["alphaL"] == 0.0


def test_lip_alpha_and_color_from_single_mask():
    result = solid()
    result[MASKS["lips"]] = (190, 60, 60)
    out = look_values_from_arrays(solid(), result, MASKS, FOREHEAD)
    assert out["lip"]["alpha"] > 0
    color = out["lip"]["color"]
    assert len(color) == 3
    assert all(0 <= c <= 255 for c in color)


def test_alpha_clips_to_one_for_extreme_change():
    result = solid()
    result[MASKS["lips"]] = (0, 0, 0)  # BASE 대비 극단적인 차이
    out = look_values_from_arrays(solid(), result, MASKS, FOREHEAD)
    assert out["lip"]["alpha"] == 1.0


def test_global_bias_is_removed_before_alpha():
    """이마까지 포함해 전체가 밝아지는 경우(조명 변화) — 화장 없는 부위는 그대로 alpha 0."""
    brighter = np.full((H, W, 3), tuple(min(255, c + 18) for c in BASE), dtype=np.uint8)
    out = look_values_from_arrays(solid(), brighter, MASKS, FOREHEAD)
    assert out["brow"]["alpha"] == 0.0
    assert out["lip"]["alpha"] == 0.0


def test_forehead_none_returns_none():
    assert look_values_from_arrays(solid(), solid(), MASKS, None) is None


def test_forehead_empty_returns_none():
    empty = np.zeros((H, W), dtype=bool)
    assert look_values_from_arrays(solid(), solid(), MASKS, empty) is None
