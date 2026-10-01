"""화장 레이어(픽셀 PNG)·룩 대표값(rules/looks.json parts) 추출 — 원본(맨얼굴)과 화장한 사진의
차이 중 부위 마스크 안쪽만 남긴다. 둘 다 같은 편향 보정 ΔLab·ΔE(_bias_corrected_delta_de)를 쓴다.

extract_layer_from_arrays: Stable-Makeup 잡 큐(제거됨, #179·#180)에서 LookJob.layer로 나가던
함수. 지금은 호출자가 없다 — 실패는 예외가 아니라 None을 돌려준다.
look_values_from_arrays: #121(룩 참조 사진에서 템플릿 값 측정) — 픽셀 레이어 대신 부위별 대표값
하나씩(alpha·color)을 rules/looks.json의 parts 모양으로 돌려준다. liner는 빠진다(아래 주석).

알고리즘(POC 선행 구현 client/lib/extractLayer.js와 같은 순서):
 1. 이마(비화장 기준)에서 (결과 Lab - 원본 Lab)의 채널별 중앙값 = diffusion 재구성 전역 편향 추정
 2. 결과 Lab에서 그 편향을 차감 (이마가 프레임 밖이라 추정 불가면 레이어 없음)
 3. 부위 마스크 안에서 원본과 보정된 결과의 ΔE(CIE76) 계산, layer_de_threshold 미만은 알파 0

부위별 임계값(2026-09-25, #tuning): CIE76은 어둡고 채도 낮은 색 변화(눈썹·스모키 아이섀도우)를 밝고
진한 변화(립스틱)보다 작게 잰다. 전체 부위 공통 임계값(layer_de_threshold=6)으로는 눈썹·아이섀도우가
거의 안 잡힌다 — client POC round-trip 검증(2026-09-24)에서 실측. `PART_DE_OVERRIDE`로 눈썹·눈섀도우만
임계값·풀알파 기준을 낮춘다. 시작값이라 실사진 회귀 테스트로 재조정 필요.

인코딩(RGBA, uint8):
  R = ΔL * 1.275 + 128  (ΔL -100..100 -> 0..255)
  G = Δa + 128,  B = Δb + 128   (Δ는 편향 보정 후 결과 - 원본, 0 변화 = 128)
  A = clip(ΔE / 40, 0, 1) * 255, 마스크 밖·임계 미만은 0
좌표계: 원본 사진을 512x512로 리사이즈한 것(모델 서버가 id_image를 그렇게 자른다)과 결과 이미지가 정렬돼 있다.
"""

from __future__ import annotations

import functools
import logging

import numpy as np
from PIL import Image, ImageDraw

from . import regions
from .config import settings

log = logging.getLogger(__name__)

# 모델 서버가 id_image를 리사이즈하는 크기 = 결과 이미지 크기
ALIGNED_SIZE = 512
# 알파가 1.0(불투명)이 되는 ΔE (부위별 override가 없는 부위의 기본값)
_ALPHA_FULL_DE = 40.0

# 부위별 (임계값, 풀알파 ΔE) override — 없는 부위는 layer_de_threshold/_ALPHA_FULL_DE(전역 기본값)를 쓴다.
# 눈썹·눈섀도우만 둘 다 낮춰서: ① 더 작은 ΔE에서도 알파가 생기고(임계값↓) ② 같은 ΔE라도 더 빨리
# 불투명해진다(풀알파 기준↓) — 어두운 색 변화가 CIE76에서 작게 재지는 걸 이중으로 보정한다.
PART_DE_OVERRIDE: dict[str, tuple[float, float]] = {
    "browR": (3.0, 20.0),
    "browL": (3.0, 20.0),
    "eyeR": (3.0, 20.0),
    "eyeL": (3.0, 20.0),
}

# sRGB(D65) <-> XYZ, client/lib/color.js와 같은 행렬·백색점
_M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def _rgb2lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = (lin @ _M.T) / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack(
        [116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1
    )


def _median(x: np.ndarray) -> float:
    return float(np.median(x)) if x.size else 0.0


def _bias_corrected_delta_de(
    source_rgb: np.ndarray, result_rgb: np.ndarray, forehead: np.ndarray | None
) -> tuple[np.ndarray, np.ndarray] | None:
    """(편향 보정된 ΔLab, ΔE) — extract_layer_from_arrays·look_values_from_arrays가 같이 쓴다.
    forehead가 없거나 비면 None (이마가 프레임 밖이라 전역 편향을 추정할 수 없음)."""
    lab_s = _rgb2lab(source_rgb)
    lab_r = _rgb2lab(result_rgb)
    diff = lab_r - lab_s
    if forehead is None or not forehead.any():
        return None
    bias = np.array([_median(diff[..., k][forehead]) for k in range(3)])
    delta = diff - bias  # 편향 보정된 결과 - 원본
    return delta, np.linalg.norm(delta, axis=-1)


def extract_layer_from_arrays(
    source_rgb: np.ndarray,
    result_rgb: np.ndarray,
    masks: dict[str, np.ndarray],
    forehead: np.ndarray | None,
    threshold: float | None = None,
) -> np.ndarray | None:
    """source/result: HxWx3 uint8, masks: 부위 -> HxW bool, forehead: 편향 추정용 bool. 반환 HxWx4 uint8.

    forehead가 없거나 비면(이마가 프레임 밖) None — 전역 편향 보정 없이 뽑으면 diffusion 색조가 통째로
    가짜 화장이 되므로, 가짜 레이어보다 클라이언트의 3점 아핀 폴백이 낫다.

    threshold: 넘기면 PART_DE_OVERRIDE에 없는 부위(=전역 기본값 자리)에만 적용된다. 눈썹·눈섀도우처럼
    override가 있는 부위는 이 인자와 무관하게 항상 자기 값을 쓴다(호출부가 실수로 전체를 흐리게
    만들 수 없게)."""
    thr_default = settings.layer_de_threshold if threshold is None else threshold
    corrected = _bias_corrected_delta_de(source_rgb, result_rgb, forehead)
    if corrected is None:
        log.warning("layer: forehead outside frame, skipping layer")
        return None
    delta, de = corrected

    # 부위마다 다른 (임계값, 풀알파 ΔE)를 적용해야 해서 전체를 한 마스크로 합치지 않고 부위별로 돈다.
    # 부위가 겹치면(눈섀도우 밴드가 눈썹 쪽으로 번지는 경우 등) 더 진하게 나온 쪽을 남긴다.
    alpha = np.zeros(de.shape, dtype=np.float64)
    for part_id, m in masks.items():
        part_thr, part_full_de = PART_DE_OVERRIDE.get(part_id, (thr_default, _ALPHA_FULL_DE))
        part_alpha = np.where(m & (de >= part_thr), np.clip(de / part_full_de, 0, 1) * 255, 0)
        alpha = np.maximum(alpha, part_alpha)

    out = np.empty((*de.shape, 4), dtype=np.uint8)
    out[..., 0] = np.clip(np.round(delta[..., 0] * 1.275 + 128), 0, 255)
    out[..., 1] = np.clip(np.round(delta[..., 1] + 128), 0, 255)
    out[..., 2] = np.clip(np.round(delta[..., 2] + 128), 0, 255)
    out[..., 3] = np.round(alpha)
    return out


# rules/looks.json의 parts 부위 -> regions.py 마스크 키. liner는 없다 — regions.py에 라이너 전용
# 마스크가 없어서(#121, thick 등 다른 방법 필요) look_values_from_arrays 범위 밖.
_TEMPLATE_PART_SIDES: dict[str, dict[str, str]] = {
    "brow": {"L": "browL", "R": "browR"},
    "shadow": {"L": "eyeL", "R": "eyeR"},
    "cheek": {"L": "cheekL", "R": "cheekR"},
}
# 좌우로 안 쪼개는 단일 마스크 부위 (alpha 하나, color 하나)
_TEMPLATE_PART_SINGLE: dict[str, str] = {"lip": "lips"}
# rules/looks.json에서 color 필드가 없는 부위 (alpha만)
_TEMPLATE_NO_COLOR = {"brow"}


def _lab2rgb(lab: np.ndarray) -> list[int]:
    """_rgb2lab의 역변환. ΔLab(델타)을 그대로 넣어도 계산만 한다 — 절대 Lab인지 델타인지는
    호출부 책임(look_values_from_arrays는 델타를 넣는다, PART_DE_OVERRIDE와 같은 식)."""
    ll, a, b = lab[0], lab[1], lab[2]
    fy = (ll + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200
    f = np.array([fx, fy, fz])
    xyz = np.where(f > 6 / 29, f**3, (f - 16 / 116) / 7.787) * _WHITE
    lin = xyz @ np.linalg.inv(_M).T
    rgb = np.where(lin > 0.0031308, 1.055 * np.clip(lin, 0, None) ** (1 / 2.4) - 0.055, 12.92 * lin)
    return [int(v) for v in np.clip(np.round(rgb * 255), 0, 255)]


def _part_alpha(part_id: str, mask: np.ndarray, de: np.ndarray) -> float:
    _, full_de = PART_DE_OVERRIDE.get(part_id, (None, _ALPHA_FULL_DE))
    return round(float(np.clip(_median(de[mask]) / full_de, 0, 1)), 3)


def look_values_from_arrays(
    source_rgb: np.ndarray,
    result_rgb: np.ndarray,
    masks: dict[str, np.ndarray],
    forehead: np.ndarray | None,
) -> dict[str, dict[str, object]] | None:
    """rules/looks.json의 parts 대표값(#121) — extract_layer_from_arrays와 같은 편향 보정
    ΔLab·ΔE를 부위 전체(마스크 안) 중앙값 하나로 요약한다. masks는 regions.build_regions()가
    돌려주는 7개 키(browL/R·eyeL/R·lips·cheekL/R)를 그대로 기대한다.

    color는 이슈 기재대로 "ΔLab 중앙값 → sRGB"다 — 절대 Lab이 아니라 델타를 그대로 Lab처럼
    변환한다(레이어 PNG 인코딩과 같은 방식). alpha는 median(ΔE) / 풀알파 기준(부위별 override 있으면
    그 값, 없으면 _ALPHA_FULL_DE) — 어떤 개별 픽셀도 layer_de_threshold로 안 거른다(대표값 하나라
    픽셀별 게이팅이 의미 없다).

    forehead 없으면 extract_layer_from_arrays와 같은 이유로 None. liner는 항상 빠진다(위 주석)."""
    corrected = _bias_corrected_delta_de(source_rgb, result_rgb, forehead)
    if corrected is None:
        log.warning("look_values: forehead outside frame, skipping")
        return None
    delta, de = corrected

    out: dict[str, dict[str, object]] = {}
    for part_id, sides in _TEMPLATE_PART_SIDES.items():
        l_key, r_key = sides["L"], sides["R"]
        entry: dict[str, object] = {}
        if part_id in _TEMPLATE_NO_COLOR:
            entry["alpha"] = round(
                (_part_alpha(l_key, masks[l_key], de) + _part_alpha(r_key, masks[r_key], de)) / 2, 3
            )
        else:
            entry["alphaL"] = _part_alpha(l_key, masks[l_key], de)
            entry["alphaR"] = _part_alpha(r_key, masks[r_key], de)
            union = masks[l_key] | masks[r_key]
            entry["color"] = _lab2rgb(np.array([_median(delta[..., k][union]) for k in range(3)]))
        out[part_id] = entry

    for part_id, mask_key in _TEMPLATE_PART_SINGLE.items():
        m = masks[mask_key]
        out[part_id] = {
            "alpha": _part_alpha(mask_key, m, de),
            "color": _lab2rgb(np.array([_median(delta[..., k][m]) for k in range(3)])),
        }

    out["liner"] = None
    return out


def polygon_mask(h: int, w: int, points_px: list[tuple[float, float]]) -> np.ndarray:
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).polygon(points_px, fill=255)
    return np.array(img) > 0


@functools.lru_cache(maxsize=1)
def _landmarker(model_path: str):
    from mediapipe.tasks.python import BaseOptions, vision  # 지연 임포트 — 없어도 서버·테스트는 돈다

    return vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
        )
    )


def _region_masks(rgb: np.ndarray) -> tuple[dict[str, np.ndarray], np.ndarray] | None:
    """rgb(HxWx3 uint8)에서 얼굴을 찾아 (부위 마스크, 이마 마스크). 얼굴 없음/모델 없음 -> None."""
    model_path = settings.face_landmarker_path
    if not model_path:
        log.warning("layer: face landmarker path not configured")
        return None
    import mediapipe as mp  # 지연 임포트

    res = _landmarker(model_path).detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
    if not res.face_landmarks:
        log.warning("layer: no face found")
        return None
    lm = [(p.x, p.y) for p in res.face_landmarks[0]]
    h, w = rgb.shape[:2]
    masks = {k: polygon_mask(h, w, pts) for k, pts in regions.build_regions(lm, w, h).items()}
    forehead = polygon_mask(h, w, [(lm[i][0] * w, lm[i][1] * h) for i in regions.FOREHEAD])
    return masks, forehead


def extract_layer(source_path: str, result_path: str) -> str | None:
    """원본 사진·결과 이미지 경로 -> `<결과>_layer.png` 경로. 어떤 실패든 None (경로는 로그에 안 남김)."""
    try:
        size = (ALIGNED_SIZE, ALIGNED_SIZE)
        source = np.array(Image.open(source_path).convert("RGB").resize(size, Image.LANCZOS))
        result = np.array(Image.open(result_path).convert("RGB").resize(size, Image.LANCZOS))
        found = _region_masks(source)
        if found is None:
            return None
        masks, forehead = found
        layer = extract_layer_from_arrays(source, result, masks, forehead)
        if layer is None or layer[..., 3].max() == 0:
            return None  # 임계 미달 = 화장이 안 보임. 레이어 없이 결과 이미지만
        out_path = result_path.rsplit(".", 1)[0] + "_layer.png"
        Image.fromarray(layer, mode="RGBA").save(out_path)
        return out_path
    except Exception as e:  # noqa: BLE001 — 레이어 문제로 워커를 죽이지 않는다
        log.warning("layer: extraction failed (%s)", type(e).__name__)
        return None
