"""화장 레이어 추출 테스트 — poc/look-tryon/client/lib/extractLayer.test.js의 세 케이스를 합성 numpy 이미지와
손으로 만든 마스크로 미러링한다(mediapipe 불필요). regions.js와의 인덱스 동기화도 여기서 자동 검사한다."""

import os
import re

import numpy as np
import pytest
from PIL import Image

from server.app import layer as layer_mod
from server.app import regions
from server.app.config import settings
from server.app.layer import extract_layer, extract_layer_from_arrays

W = H = 32
BASE = (200, 170, 150)
LIP = np.zeros((H, W), dtype=bool)
LIP[20:26, 12:20] = True
FOREHEAD = np.zeros((H, W), dtype=bool)
FOREHEAD[2:8, 10:22] = True
MASKS = {"lips": LIP}


def solid(color):
    return np.full((H, W, 3), color, dtype=np.uint8)


def test_identity_gives_no_layer():
    layer = extract_layer_from_arrays(solid(BASE), solid(BASE), MASKS, FOREHEAD)
    assert layer[..., 3].max() == 0


def test_global_bias_only_gives_no_layer():
    brighter = tuple(min(255, c + 18) for c in BASE)
    layer = extract_layer_from_arrays(solid(BASE), solid(brighter), MASKS, FOREHEAD)
    assert layer[..., 3].sum() == 0


def test_real_makeup_inside_region_only():
    result = solid(BASE)
    result[20:26, 12:20] = (200, 30, 60)
    layer = extract_layer_from_arrays(solid(BASE), result, MASKS, FOREHEAD)
    assert (layer[20:26, 12:20, 3] > 0).all()
    outside = layer[..., 3].copy()
    outside[20:26, 12:20] = 0
    assert outside.sum() == 0


def test_bias_plus_makeup_keeps_makeup():
    brighter = np.full((H, W, 3), tuple(min(255, c + 18) for c in BASE), dtype=np.uint8)
    brighter[20:26, 12:20] = (200, 30, 60)
    layer = extract_layer_from_arrays(solid(BASE), brighter, MASKS, FOREHEAD)
    assert (layer[20:26, 12:20, 3] > 0).all()
    assert layer[0:10, :, 3].sum() == 0


def test_delta_encoding_neutral_is_128():
    layer = extract_layer_from_arrays(solid(BASE), solid(BASE), MASKS, FOREHEAD)
    assert (layer[..., :3] == 128).all()


@pytest.fixture()
def landmarker_unset():
    """frozen dataclass라 monkeypatch.setattr 불가 — 값을 직접 바꾸고 끝나면 복원한다."""
    old = settings.face_landmarker_path
    object.__setattr__(settings, "face_landmarker_path", "")
    yield
    object.__setattr__(settings, "face_landmarker_path", old)


def test_extract_layer_without_landmarker_returns_none(tmp_path, landmarker_unset):
    src = tmp_path / "s.png"
    Image.fromarray(solid(BASE)).save(src)
    assert extract_layer(str(src), str(src)) is None


def test_extract_layer_writes_png_next_to_result(tmp_path, monkeypatch):
    n = layer_mod.ALIGNED_SIZE
    src = tmp_path / "s.png"
    res = tmp_path / "123.jpg"
    Image.fromarray(np.full((n, n, 3), BASE, dtype=np.uint8)).save(src)
    out = np.full((n, n, 3), BASE, dtype=np.uint8)
    out[200:260, 120:200] = (200, 30, 60)
    Image.fromarray(out).save(res, quality=100, subsampling=0)
    lips = np.zeros((n, n), dtype=bool)
    lips[200:260, 120:200] = True
    fore = np.zeros((n, n), dtype=bool)
    fore[20:80, 100:220] = True
    monkeypatch.setattr(layer_mod, "_region_masks", lambda img: ({"lips": lips}, fore))
    path = extract_layer(str(src), str(res))
    assert path == str(tmp_path / "123_layer.png")
    arr = np.array(Image.open(path))
    assert arr.shape == (n, n, 4)
    assert arr[230, 160, 3] > 0 and arr[:100, :, 3].max() == 0


def test_extract_layer_no_face_returns_none(tmp_path, monkeypatch):
    src = tmp_path / "s.png"
    Image.fromarray(solid(BASE)).save(src)
    monkeypatch.setattr(layer_mod, "_region_masks", lambda img: None)
    assert extract_layer(str(src), str(src)) is None


def _js_arrays():
    js = open(os.path.join("poc", "look-tryon", "client", "lib", "regions.js"), encoding="utf8").read()

    def grab(name):
        m = re.search(rf"export const {name} = (.*?);\n(?=export|\n)", js, re.S)
        return [[int(x) for x in re.findall(r"\d+", a)] for a in re.findall(r"\[([\d,\s]+)\]", m.group(1))]

    return grab


def test_indices_match_regions_js():
    grab = _js_arrays()
    eyes, brow, cheek, lips = grab("EYES"), grab("BROW"), grab("CHEEK"), grab("LIPS")
    assert eyes == [regions.EYES_UPPER["R"], regions.EYES_UPPER["L"]]
    assert brow == [regions.BROW["R"], regions.BROW["L"]]
    assert cheek == [regions.CHEEK["R"], regions.CHEEK["L"]]
    assert lips == [regions.LIPS]
    js = open(os.path.join("poc", "look-tryon", "client", "lib", "regions.js"), encoding="utf8").read()
    assert float(re.search(r"EYESHADOW_REACH = ([\d.]+)", js).group(1)) == regions.EYESHADOW_REACH


def test_forehead_matches_app_webgl():
    js = open(os.path.join("poc", "look-tryon", "client", "app-webgl.js"), encoding="utf8").read()
    m = re.search(r"const FOREHEAD = \[([\d,\s]+)\]", js)
    assert [int(x) for x in re.findall(r"\d+", m.group(1))] == regions.FOREHEAD


def test_build_regions_keys_and_eyeshadow_band():
    lm = [(i / 500, i / 500) for i in range(478)]
    r = regions.build_regions(lm, 100, 100)
    assert list(r) == ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"]
    assert len(r["eyeR"]) == 2 * len(regions.EYES_UPPER["R"])
