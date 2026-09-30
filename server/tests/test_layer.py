"""화장 레이어 추출 테스트 — poc/look-tryon/client/lib/extractLayer.test.js의 세 케이스를 합성 numpy 이미지와
손으로 만든 마스크로 미러링한다(mediapipe 불필요). regions.js와의 인덱스 동기화도 여기서 자동 검사한다."""

import logging
import re
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from server.app import layer as layer_mod
from server.app import regions
from server.app.config import settings
from server.app.layer import extract_layer, extract_layer_from_arrays

CLIENT = Path(__file__).resolve().parents[2] / "poc" / "look-tryon" / "client"
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


# --- 부위별 임계값(PART_DE_OVERRIDE, 2026-09-25) ---
# ΔE≈5.58 짜리 옅은 변화 — 전역 임계값(6) 밑이라 override 없는 부위에선 안 잡혀야 하고,
# 눈썹·눈섀도우(override 임계값 3)에서는 잡혀야 한다.
WEAK_COLOR = (185, 155, 135)


def test_weak_change_below_global_threshold_is_dropped_for_unlisted_part():
    result = solid(BASE)
    result[20:26, 12:20] = WEAK_COLOR
    layer = extract_layer_from_arrays(solid(BASE), result, {"lips": LIP}, FOREHEAD)
    assert layer[20:26, 12:20, 3].max() == 0


def test_weak_change_is_kept_for_brow_and_eye_via_override():
    result = solid(BASE)
    result[20:26, 12:20] = WEAK_COLOR
    for part in ("browR", "browL", "eyeR", "eyeL"):
        layer = extract_layer_from_arrays(solid(BASE), result, {part: LIP}, FOREHEAD)
        assert (layer[20:26, 12:20, 3] > 0).all(), part


def test_override_full_alpha_de_is_lower_so_alpha_ramps_faster():
    """같은 ΔE라도 override 부위는 풀알파 기준(20)이 낮아서 lips(40 그대로)보다 알파가 더 크다."""
    result = solid(BASE)
    result[20:26, 12:20] = WEAK_COLOR
    lips_layer = extract_layer_from_arrays(solid(BASE), result, {"lips": LIP}, FOREHEAD, threshold=1)
    brow_layer = extract_layer_from_arrays(solid(BASE), result, {"browR": LIP}, FOREHEAD)
    assert brow_layer[23, 15, 3] > lips_layer[23, 15, 3]


def test_explicit_threshold_arg_does_not_affect_overridden_parts():
    """threshold 인자를 크게 줘도(가려질 정도로) override 부위는 영향 안 받는다 — 실수로 전체를
    흐리게 만드는 걸 방지."""
    result = solid(BASE)
    result[20:26, 12:20] = WEAK_COLOR
    layer = extract_layer_from_arrays(solid(BASE), result, {"browR": LIP}, FOREHEAD, threshold=100)
    assert (layer[20:26, 12:20, 3] > 0).all()


def test_overlapping_parts_keep_the_stronger_alpha():
    """같은 픽셀이 override 부위·일반 부위 마스크에 동시에 들어가면 더 큰 알파(=override 쪽)가 남는다."""
    result = solid(BASE)
    result[20:26, 12:20] = WEAK_COLOR
    masks = {"lips": LIP, "browR": LIP}  # 일부러 같은 영역을 두 부위에 다 줌
    layer = extract_layer_from_arrays(solid(BASE), result, masks, FOREHEAD)
    assert (layer[20:26, 12:20, 3] > 0).all()


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
    js = (CLIENT / "lib" / "regions.js").read_text(encoding="utf8")

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
    js = (CLIENT / "lib" / "regions.js").read_text(encoding="utf8")
    assert float(re.search(r"EYESHADOW_REACH = ([\d.]+)", js).group(1)) == regions.EYESHADOW_REACH


def test_forehead_matches_regions_js():
    # app-webgl.js(C4)는 2026-09-24 삭제됨 — FOREHEAD의 단일 진실 원천은 지금 lib/regions.js.
    js = (CLIENT / "lib" / "regions.js").read_text(encoding="utf8")
    m = re.search(r"export const FOREHEAD = \[([\d,\s]+)\]", js)
    assert [int(x) for x in re.findall(r"\d+", m.group(1))] == regions.FOREHEAD


def test_build_regions_keys_and_eyeshadow_band():
    lm = [(i / 500, i / 500) for i in range(478)]
    r = regions.build_regions(lm, 100, 100)
    assert list(r) == ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"]
    assert len(r["eyeR"]) == 2 * len(regions.EYES_UPPER["R"])


# regions.js buildRegions 골든값. 아래 명령으로 실제 JS를 한 번 돌려 얻었다(테스트는 런타임에 node 불필요):
#   node --input-type=module -e "import {buildRegions} from 'file:///<repo>/poc/look-tryon/client/lib/regions.js';
#     const lm=Array.from({length:478},(_,i)=>({x:0.2+0.6*((i*37)%478)/478,y:0.1+0.8*((i*91)%478)/478}));
#     console.log(JSON.stringify(buildRegions(lm,640,480)));"
GOLDEN_REGIONS = {
    "browR": [
        [288.6694560669456, 173.32217573221757],
        [464.6025104602511, 429.5899581589958],
        [177.0041841004184, 427.98326359832635],
        [169.77405857740587, 264.9037656903766],
        [236.45188284518832, 190.19246861924688],
        [226.81171548117157, 228.75313807531379],
        [140.05020920502093, 191.79916317991635],
        [137.64016736401675, 393.439330543933],
        [167.36401673640165, 82.5439330543933],
        [343.2970711297071, 338.8117154811716],
    ],
    "browL": [
        [213.15481171548115, 91.38075313807532],
        [389.08786610878667, 347.64853556485355],
        [455.76569037656895, 272.93723849372384],
        [478.25941422594144, 182.96234309623432],
        [131.2133891213389, 419.1464435146444],
        [151.29707112970712, 146.81171548117157],
        [448.53556485355637, 109.85774058577405],
        [446.1255230125523, 311.49790794979083],
        [475.8493723849372, 384.6025104602511],
        [267.78242677824267, 256.8702928870293],
    ],
    "eyeR": [
        [241.27196652719664, 170.91213389121341],
        [278.22594142259413, 407.0962343096234],
        [186.64435146443515, 389.4225941422594],
        [216.3682008368201, 78.52719665271967],
        [246.09205020920507, 151.63179916317992],
        [275.8158995815899, 224.7364016736402],
        [305.5397489539749, 297.8410041841004],
        [144.06694560669456, 367.73221757322176],
        [340.88702928870293, 156.4518828451883],
        [293.31280334728035, 208.50878661087867],
        [185.06175732217574, 324.7129707112971],
        [273.8717991631799, 286.27280334728033],
        [257.52368200836816, 246.0652719665272],
        [241.1755648535565, 205.85774058577405],
        [224.82744769874478, 165.65020920502093],
        [208.47933054393306, 336.64267782426776],
        [258.84920502092046, 346.36317991631796],
        [238.52451882845187, 216.46192468619248],
    ],
    "eyeL": [
        [136.03347280334728, 399.86610878661094],
        [438.092050209205, 343.63179916317995],
        [405.95815899581595, 88.1673640167364],
        [435.68200836820085, 161.2719665271967],
        [465.4058577405858, 234.3765690376569],
        [495.1297071129707, 307.4811715481172],
        [140.85355648535565, 380.58577405857744],
        [155.31380753138077, 322.744769874477],
        [265.3723849372385, 74.51046025104604],
        [301.5230125523012, 154.54794979079503],
        [240.9907949790795, 291.07682008368204],
        [233.03765690376568, 322.8893723849373],
        [427.88953974895395, 282.68184100418415],
        [411.54142259414226, 242.474309623431],
        [395.1933054393305, 202.26677824267787],
        [378.8451882845188, 162.05924686192472],
        [396.5188284518828, 302.5646861924687],
        [230.3866108786611, 333.4935564853557],
    ],
    "lips": [
        [405.1548117154812, 283.3807531380753],
        [250.9121338912134, 132.35146443514645],
        [164.9539748953975, 284.18410041841],
        [135.23012552301256, 211.07949790794981],
        [459.78242677824267, 64.8702928870293],
        [128, 48],
        [384.26778242677824, 366.92887029288704],
        [443.7154811715481, 129.13807531380752],
        [473.439330543933, 202.24267782426782],
        [381.0543933054393, 379.7824267782427],
        [329.64016736401675, 201.43933054393307],
        [138.44351464435147, 198.22594142259413],
        [453.3556485355649, 90.57740585774059],
        [262.1589958158996, 87.36401673640168],
        [245.2887029288703, 346.8451882845188],
        [249.30543933054395, 138.77824267782427],
        [320.8033472803348, 428.7866108786611],
        [132.01673640167365, 223.93305439330544],
        [144.8702928870293, 172.51882845188283],
        [243.68200836820083, 353.27196652719664],
    ],
    "cheekR": [
        [503.9665271966527, 80.13389121338912],
        [149.69037656903765, 153.2384937238494],
        [179.41422594142261, 226.34309623430968],
        [442.1087866108786, 135.56485355648536],
        [430.05857740585776, 375.76569037656907],
        [461.3891213389121, 58.44351464435147],
        [310.35983263598325, 278.560669456067],
        [328.0334728033473, 207.8661087866109],
    ],
    "cheekL": [
        [398.7280334728034, 309.0878661087866],
        [428.45188284518827, 382.1924686192469],
        [458.1757322175733, 71.29707112970712],
        [336.87029288702934, 364.5188284518829],
        [354.5439330543933, 293.8242677824268],
        [472.6359832635983, 397.45606694560666],
        [440.50209205020917, 141.9916317991632],
        [222.7949790794979, 52.820083682008374],
    ],
}


def test_build_regions_matches_js_golden():
    lm = [(0.2 + 0.6 * ((i * 37) % 478) / 478, 0.1 + 0.8 * ((i * 91) % 478) / 478) for i in range(478)]
    got = regions.build_regions(lm, 640, 480)
    assert list(got) == list(GOLDEN_REGIONS)
    for name, pts in GOLDEN_REGIONS.items():
        assert len(got[name]) == len(pts), name
        for (gx, gy), (ex, ey) in zip(got[name], pts, strict=True):
            assert abs(gx - ex) < 1e-6 and abs(gy - ey) < 1e-6, name


# --- 성능 저하 경로: 실제 작은 이미지로 조건 하나만 바꿔 원인을 특정한다 ---
N = layer_mod.ALIGNED_SIZE


@pytest.fixture()
def real_pair(tmp_path):
    src = tmp_path / "source_photo.png"
    res = tmp_path / "555.jpg"
    Image.fromarray(np.full((N, N, 3), BASE, dtype=np.uint8)).save(src)
    out = np.full((N, N, 3), BASE, dtype=np.uint8)
    out[200:260, 120:200] = (200, 30, 60)
    Image.fromarray(out).save(res, quality=100, subsampling=0)
    return str(src), str(res)


@pytest.fixture()
def landmarker_path():
    """face_landmarker_path를 바꾸고 복원하는 헬퍼(frozen dataclass)."""
    old = settings.face_landmarker_path

    def _set(v):
        object.__setattr__(settings, "face_landmarker_path", v)

    yield _set
    object.__setattr__(settings, "face_landmarker_path", old)


def _no_paths_in_logs(caplog, *paths):
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert text  # 경고 로그가 실제로 남았어야 한다
    for p in paths:
        assert p not in text
        assert Path(p).name not in text


def test_nonexistent_landmarker_file_returns_none(real_pair, landmarker_path, caplog):
    missing = str(Path(real_pair[0]).parent / "nope" / "missing_model.task")
    landmarker_path(missing)
    layer_mod._landmarker.cache_clear()
    with caplog.at_level(logging.WARNING):
        assert extract_layer(*real_pair) is None
    _no_paths_in_logs(caplog, *real_pair, missing)


def test_mediapipe_not_importable_returns_none(real_pair, landmarker_path, monkeypatch, caplog):
    fake_model = str(Path(real_pair[0]).parent / "model_file.task")
    landmarker_path(fake_model)
    layer_mod._landmarker.cache_clear()
    monkeypatch.setitem(sys.modules, "mediapipe", None)  # import mediapipe -> ImportError
    with caplog.at_level(logging.WARNING):
        assert extract_layer(*real_pair) is None
    _no_paths_in_logs(caplog, *real_pair, fake_model)


def test_landmarker_unset_logs_no_paths(real_pair, landmarker_unset, caplog):
    with caplog.at_level(logging.WARNING):
        assert extract_layer(*real_pair) is None
    _no_paths_in_logs(caplog, *real_pair)


# --- 이마 마스크 ---
def test_empty_forehead_returns_none(caplog):
    result = solid(BASE)
    result[20:26, 12:20] = (200, 30, 60)
    with caplog.at_level(logging.WARNING):
        assert extract_layer_from_arrays(solid(BASE), result, MASKS, np.zeros((H, W), dtype=bool)) is None
        assert extract_layer_from_arrays(solid(BASE), result, MASKS, None) is None
    assert "forehead" in caplog.text


def test_forehead_polygon_fully_off_frame_gives_no_layer(real_pair, monkeypatch, caplog):
    """이마 폴리곤이 프레임 밖(y<0)이면 PIL이 클리핑해 마스크가 비고 -> 레이어 없음."""
    lm = [(0.5, 0.5)] * 478
    for i in regions.FOREHEAD:
        lm[i] = (0.5 + 0.01 * (i % 5), -0.5)
    forehead = layer_mod.polygon_mask(N, N, [(lm[i][0] * N, lm[i][1] * N) for i in regions.FOREHEAD])
    assert not forehead.any()
    lips = np.zeros((N, N), dtype=bool)
    lips[200:260, 120:200] = True
    monkeypatch.setattr(layer_mod, "_region_masks", lambda rgb: ({"lips": lips}, forehead))
    with caplog.at_level(logging.WARNING):
        assert extract_layer(*real_pair) is None
    _no_paths_in_logs(caplog, *real_pair)


def test_forehead_polygon_partially_off_frame_is_clipped_not_crash():
    poly = [(100.0, -50.0), (200.0, -50.0), (200.0, 30.0), (100.0, 30.0)]
    m = layer_mod.polygon_mask(N, N, poly)
    assert m.any()  # 보이는 부분(y 0..30)만 남는다
    assert not m[40:, :].any()
    assert m[:31, 101:200].all()
