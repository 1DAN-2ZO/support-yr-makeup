"""화장 레이어 추출 — 원본(맨얼굴)과 생성 결과의 차이 중 부위 마스크 안쪽만 남긴 RGBA PNG.

`LookJob.layer`(schemas.Layer, mesh="mediapipe-468")로 나가고 클라이언트가 라이브 얼굴에 드레이프한다.
실패는 예외가 아니라 None — 호출자(worker)는 layer=None으로 두고 클라이언트가 3점 아핀으로 폴백한다.

알고리즘(POC 선행 구현 client/lib/extractLayer.js와 같은 순서):
 1. 이마(비화장 기준)에서 (결과 Lab - 원본 Lab)의 채널별 중앙값 = diffusion 재구성 전역 편향 추정
 2. 결과 Lab에서 그 편향을 차감 (이마가 프레임 밖이라 추정 불가면 레이어 없음)
 3. 부위 마스크 안에서 원본과 보정된 결과의 ΔE(CIE76) 계산, layer_de_threshold 미만은 알파 0

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
# 알파가 1.0(불투명)이 되는 ΔE
_ALPHA_FULL_DE = 40.0

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


def extract_layer_from_arrays(
    source_rgb: np.ndarray,
    result_rgb: np.ndarray,
    masks: dict[str, np.ndarray],
    forehead: np.ndarray | None,
    threshold: float | None = None,
) -> np.ndarray | None:
    """source/result: HxWx3 uint8, masks: 부위 -> HxW bool, forehead: 편향 추정용 bool. 반환 HxWx4 uint8.

    forehead가 없거나 비면(이마가 프레임 밖) None — 전역 편향 보정 없이 뽑으면 diffusion 색조가 통째로
    가짜 화장이 되므로, 가짜 레이어보다 클라이언트의 3점 아핀 폴백이 낫다."""
    thr = settings.layer_de_threshold if threshold is None else threshold
    lab_s = _rgb2lab(source_rgb)
    lab_r = _rgb2lab(result_rgb)

    diff = lab_r - lab_s
    if forehead is None or not forehead.any():
        log.warning("layer: forehead outside frame, skipping layer")
        return None
    bias = np.array([_median(diff[..., k][forehead]) for k in range(3)])
    delta = diff - bias  # 편향 보정된 결과 - 원본
    de = np.linalg.norm(delta, axis=-1)

    mask = np.zeros(de.shape, dtype=bool)
    for m in masks.values():
        mask |= m
    alpha = np.where(mask & (de >= thr), np.clip(de / _ALPHA_FULL_DE, 0, 1) * 255, 0)

    out = np.empty((*de.shape, 4), dtype=np.uint8)
    out[..., 0] = np.clip(np.round(delta[..., 0] * 1.275 + 128), 0, 255)
    out[..., 1] = np.clip(np.round(delta[..., 1] + 128), 0, 255)
    out[..., 2] = np.clip(np.round(delta[..., 2] + 128), 0, 255)
    out[..., 3] = np.round(alpha)
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
