"""PoC — 얼굴 한쪽 절반을 좌우반전해서 가려진 반대쪽에 덮는다 (참고 사진 전처리).

FLUX 로 그리지 않는다: 보이는 쪽의 실제 화장 픽셀을 그대로 복사하므로 화장이 바뀌지 않는다.
얼굴 중심선(occlusion_gate.AXIS 점들을 맞춘 직선)을 축으로 사진을 뒤집고,
가려진 쪽 얼굴 윤곽(원래 윤곽 ∪ 뒤집힌 윤곽) 안만 뒤집힌 사진으로 바꾼다. 윤곽 밖(손 · 머리 · 배경)은 그대로 둔다.
얼굴을 못 찾거나 오류가 나면 원본을 그대로 돌려준다.  3/4 각도는 지원하지 않는다 (중심선이 접힌 점 때문에 틀어진다).

keep='L' → 사진 왼쪽 절반을 지켜 오른쪽을 덮는다. keep='R' → 반대.
"""
import cv2
import numpy as np
from PIL import Image

import occlusion_gate as og

FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
FEATHER = 0.012       # 덮는 영역 가장자리를 흐리는 정도 (얼굴 너비 대비)


def mirror(rgb: np.ndarray, keep: str, lm: np.ndarray | None = None):
    h, w = rgb.shape[:2]
    lm = og.landmarks(rgb) if lm is None else lm
    if lm is None:
        return rgb, {"error": "얼굴을 못 찾음"}
    c, n = og.axis_of(lm)
    sign = 1 if keep == "L" else -1                    # 덮을 쪽의 법선 방향 부호 (L 을 지키면 오른쪽(+)을 덮음)
    A = np.eye(2) - 2 * np.outer(n, n)
    t = 2 * float(c @ n) * n
    M = np.hstack([A, t[:, None]]).astype(np.float32)
    flipped = cv2.warpAffine(rgb, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

    oval = lm[FACE_OVAL]
    oval_flip = oval @ A.T + t
    poly = np.zeros((h, w), np.uint8)
    for o in (oval, oval_flip):
        cv2.fillPoly(poly, [np.round(o).astype(np.int32)], 255)       # 원래 윤곽 ∪ 뒤집힌 윤곽
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    side = ((xs - c[0]) * n[0] + (ys - c[1]) * n[1]) * sign > 0       # 덮을 쪽 반평면
    mask = (poly > 0) & side
    width = float(oval[:, 0].max() - oval[:, 0].min())
    k = max(1.0, width * FEATHER)
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), k)[..., None]
    alpha = np.where(side[..., None], alpha, 0.0)                    # 중심선을 넘어 번지지 않게 (보이는 쪽은 원본 그대로)
    out = (flipped * alpha + rgb * (1 - alpha)).round().clip(0, 255).astype(np.uint8)
    return out, {"axis_c": c, "axis_n": n}


def prep(img: Image.Image, keep: str) -> Image.Image:
    """서버에 끼울 형태 — 실패하면 원본 그대로"""
    try:
        out, info = mirror(np.asarray(img.convert("RGB")), keep)
        return Image.fromarray(out) if "error" not in info else img
    except Exception as e:  # noqa: BLE001  전처리 때문에 서비스가 죽으면 안 된다
        print("전처리 실패 — 원본 그대로:", e)
        return img
