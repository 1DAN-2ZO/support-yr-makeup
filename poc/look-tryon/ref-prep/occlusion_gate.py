"""PoC — 참고 사진 가림 판정: 눈썹 · 눈 · 볼 · 입술이 잘 보이는가.

  "reject" 얼굴을 못 찾음 · 얼굴 각도가 큼 · 머리카락(옷 · 기타)이 양쪽 다 많이 가림 · 손이 양쪽 다 많이 가림
           · 머리카락이 한쪽을 가렸는데 반대쪽도 깨끗하지 않음 → "다른 사진 요청"
           (PoC 에서만 개발자가 본다 — 서비스 동작은 바꾸지 않고 원본을 그대로 통과시킨다)
  "fill"   머리카락이 한쪽만 많이 가렸고 반대쪽은 깨끗함 (모든 부위 15% 이하) → 반대쪽을 좌우반전해서 채운다 (mirror_half.py)
  "pass"   그 밖 (잘 보임 · 약간만 가림 · 손이 한쪽만 가림) → 원본 그대로 통과
  코드 오류(우리 쪽 예외)는 pass — 전처리 때문에 서비스가 막히면 안 된다.

가림 = 얼굴 분할(selfie_multiclass_256x256)이 머리카락 · 옷 · 기타 · (몸 피부 = 손)로 본 부위 비율.
L / R 은 사진 기준 왼쪽 / 오른쪽.
"""
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, ImageSegmenter, ImageSegmenterOptions
from PIL import Image

LANDMARKER_PATH = Path(r"D:\flux2-poc\models\face_landmarker.task")
SEG_PATH = Path(r"D:\flux2-poc\models\selfie_multiclass_256x256.tflite")
OCCLUDER = (1, 2, 4, 5)       # 1 머리카락 · 2 몸 피부(손) · 4 옷 · 5 기타.  (0 배경 · 3 얼굴 피부)
HAIR_LIKE = (1, 4, 5)         # 머리카락 · 옷 · 기타 — 많이 가리면 다른 사진 요청 (서버 결과에 검은 얼룩이 생긴다)
HAND = 2                      # 몸 피부(손) — 한쪽만 가리면 통과 (피부색이라 얼룩은 안 생기고 화장만 빠진다), 양쪽이면 다른 사진 요청
OCC_MIN = 0.15                # (그림 색 구분용) 이 이하 = 잘 보임
# 한 부위라도 이만큼 넘게 가렸으면 → 다른 사진 요청. OCC_MIN ~ 이 값 사이는 약간 가림 — 통과.
# 눈썹은 더 엄격하게: 머리카락이 눈썹을 30~40% 만 걸쳐도 서버 결과의 눈썹이 검게 번졌다 (AI 생성 시험 ④, 2026-10-14)
OCC_HEAVY = {"brow": 0.30, "eye": 0.40, "cheek": 0.40, "lip": 0.40}
# 얼굴 각도(도) — 이만큼 넘게 돌아가면 다른 사진 요청 (MediaPipe 머리 자세). 임시값: 정면 사진 26장은 좌우 ±7 · 위아래 ±10 · 기울임 ±3 이내,
# 3/4 샘플(half.jpg)은 좌우 -38 · 기울임 -32. 샘플이 모자란다 (2026-10-14)
ANGLE_MAX = {"yaw": 25.0, "pitch": 25.0, "roll": 25.0}
ANGLE_NAMES = {"yaw": "좌우", "pitch": "위아래", "roll": "기울임"}
CROP_MARGIN = 1.8            # 얼굴 점 상자 긴 변의 몇 배로 잘라 분할할지 (얼굴을 크게 놓아야 가는 머리카락이 잡힌다)
CROP_MAX = 512
# 얼굴 중심선 위의 점들 (이마 → 콧대 → 코끝 → 윗입술 → 아랫입술 → 턱)
AXIS = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152]
# 눈마다: 윗눈꺼풀 · 아랫눈꺼풀 · 눈썹 아랫선 · 눈썹 윗선 · 바깥 눈꼬리 · 안쪽 눈꼬리 (app_klein.py EYES 와 같다)
EYES = (
    ([33, 246, 161, 160, 159, 158, 157, 173, 133], [33, 7, 163, 144, 145, 153, 154, 155, 133], [46, 53, 52, 65, 55], [70, 63, 105, 66, 107], 33, 133),
    ([263, 466, 388, 387, 386, 385, 384, 398, 362], [263, 249, 390, 373, 374, 380, 381, 382, 362], [276, 283, 282, 295, 285], [300, 293, 334, 296, 336], 263, 362),
)
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
UNDER_EYE = 0.3
CHEEK_AT = (0.25, 1.15)
CHEEK_SIZE = (1.0, 0.8)

_seg = None
_landmarker = None


def detect(rgb: np.ndarray):
    """(얼굴 점 478개 픽셀, 머리 자세 {yaw, pitch, roll} 도) — 못 찾으면 (None, None)"""
    global _landmarker
    if _landmarker is None:
        _landmarker = FaceLandmarker.create_from_options(FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(LANDMARKER_PATH)), num_faces=1, output_facial_transformation_matrixes=True))
    r = _landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.copy()))
    if not r.face_landmarks:
        return None, None
    h, w = rgb.shape[:2]
    lm = np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]])
    pose = None
    if r.facial_transformation_matrixes:
        R = np.array(r.facial_transformation_matrixes[0])[:3, :3]
        R = R / np.linalg.norm(R, axis=0, keepdims=True)                      # 크기(배율)를 뺀 회전만
        pose = {"yaw": float(np.degrees(np.arctan2(-R[2, 0], np.hypot(R[2, 1], R[2, 2])))),
                "pitch": float(np.degrees(np.arctan2(R[2, 1], R[2, 2]))),
                "roll": float(np.degrees(np.arctan2(R[1, 0], R[0, 0])))}
    return lm, pose


def landmarks(rgb: np.ndarray):
    """얼굴 점 478개 (픽셀) — 못 찾으면 None"""
    return detect(rgb)[0]


def axis_of(lm: np.ndarray):
    """얼굴 중심선 — (선 위의 한 점 c, 사진 오른쪽을 향하는 단위 법선 n)"""
    pts = lm[AXIS]
    c = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - c)
    d = vt[0]
    n = np.array([-d[1], d[0]])
    if n[0] < 0:
        n = -n
    return c, n


def segment(rgb: np.ndarray) -> np.ndarray:
    global _seg
    if _seg is None:
        _seg = ImageSegmenter.create_from_options(ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=str(SEG_PATH)), output_category_mask=True))
    r = _seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.copy()))
    return r.category_mask.numpy_view().astype(np.uint8)


def crop_face(rgb: np.ndarray, lm: np.ndarray):
    """얼굴 둘레 정사각형 잘라 (자른 사진, 왼쪽 위 x, y, 배율). 사진 밖은 검게 채운다"""
    x0, y0 = lm.min(axis=0)
    x1, y1 = lm.max(axis=0)
    side = max(x1 - x0, y1 - y0) * CROP_MARGIN
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left, top = int(round(cx - side / 2)), int(round(cy - side / 2))
    side = int(round(side))
    pad = side
    padded = cv2.copyMakeBorder(rgb, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    crop = padded[top + pad: top + pad + side, left + pad: left + pad + side]
    scale = min(1.0, CROP_MAX / side)
    if scale < 1.0:
        crop = cv2.resize(crop, (round(side * scale), round(side * scale)), interpolation=cv2.INTER_AREA)
    return crop, left, top, scale


def part_masks(lm: np.ndarray, shape: tuple[int, int]) -> dict:
    """{ 'L'|'R': {부위: 불리언 마스크} } — lm 은 shape(h, w) 좌표계의 얼굴 점"""
    h, w = shape
    c, n = axis_of(lm)
    d = np.array([-n[1], n[0]])
    if d[1] < 0:
        d = -d                                           # 아래쪽을 향하는 단위 방향
    out: dict = {"L": {}, "R": {}}

    def poly(pts) -> np.ndarray:
        m = np.zeros((h, w), np.uint8)
        cv2.fillPoly(m, [np.round(np.asarray(pts)).astype(np.int32)], 1)
        return m

    def grow(m: np.ndarray, r: float) -> np.ndarray:
        k = max(1, int(round(r)))
        return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1)))

    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = (xs - c[0]) * n[0] + (ys - c[1]) * n[1]       # 중심선에서 오른쪽(+) 으로의 거리
    for up, lo, brl, bru, outer, inner in EYES:
        ctr = lm[[outer, inner]].mean(axis=0)
        side = "R" if float((ctr - c) @ n) > 0 else "L"
        ew = float(np.linalg.norm(lm[outer] - lm[inner]))
        out_dir = n if side == "R" else -n
        brow = grow(poly(np.vstack([lm[brl], lm[bru][::-1]])), 0.08 * ew)
        eye = grow(poly(np.vstack([lm[up], lm[lo][::-1]])), UNDER_EYE * ew)
        cm = np.zeros((h, w), np.uint8)
        cc = ctr + out_dir * CHEEK_AT[0] * ew + d * CHEEK_AT[1] * ew
        ang = float(np.degrees(np.arctan2(n[1], n[0])))
        cv2.ellipse(cm, (int(round(cc[0])), int(round(cc[1]))), (max(1, int(CHEEK_SIZE[0] * ew)), max(1, int(CHEEK_SIZE[1] * ew))), ang, 0, 360, 1, -1)
        out[side].update(brow=brow > 0, eye=eye > 0, cheek=cm > 0)
    lip = poly(lm[LIPS]) > 0
    out["R"]["lip"] = lip & (dist > 0)
    out["L"]["lip"] = lip & (dist <= 0)
    return out


def analyze(rgb: np.ndarray) -> dict:
    """판정 + 근거. 얼굴을 못 찾거나 오류가 나면 pass (원본 그대로)"""
    rep: dict = {"verdict": "pass", "why": ""}
    try:
        lm, pose = detect(rgb)
        if lm is None:
            rep["verdict"], rep["why"] = "reject", "얼굴을 못 찾음 → 다른 사진 요청"
            return rep
        rep["pose"] = pose
        crop, left, top, scale = crop_face(rgb, lm)
        lmc = (lm - np.array([left, top])) * scale
        seg = segment(crop)
        parts = part_masks(lmc, seg.shape)
        occ = np.isin(seg, OCCLUDER)
        hair = np.isin(seg, HAIR_LIKE)                   # 머리카락 · 옷 · 기타
        hand = seg == HAND
        frac = lambda mask: {s: {p: float(mask[m].mean()) if m.any() else 0.0 for p, m in parts[s].items()} for s in ("L", "R")}  # noqa: E731
        rep["scores"], rep["hair"], rep["hand"] = frac(occ), frac(hair), frac(hand)
        hair_bad = [f"{s}:{p}" for s in ("L", "R") for p, v in rep["hair"][s].items() if v > OCC_HEAVY[p]]
        hand_sides = [s for s in ("L", "R") if any(v > OCC_HEAVY[p] for p, v in rep["hand"][s].items())]
        rep["occluded"] = {"hair": hair_bad, "hand_sides": hand_sides}
        hair_sides = sorted({b[0] for b in hair_bad})
        turned = [f"{ANGLE_NAMES[k]} {v:+.0f}°" for k, v in (pose or {}).items() if abs(v) > ANGLE_MAX[k]]
        rep["turned"] = turned                              # 각도가 크면 거절이 아니라 FLUX 정면화 대상 (prep 에서) — 판별은 원본으로 먼저 한다
        if len(hair_sides) == 2:
            rep["verdict"], rep["why"] = "reject", f"머리카락 · 옷이 양쪽 다 많이 가림 ({', '.join(hair_bad)}) → 다른 사진 요청"
        elif len(hair_sides) == 1:
            occluded = hair_sides[0]
            keep = "R" if occluded == "L" else "L"
            keep_worst = max(rep["scores"][keep].values())
            if keep in hand_sides:
                rep["verdict"], rep["why"] = "reject", f"머리카락이 {occluded} 쪽을, 손이 {keep} 쪽을 많이 가림 → 다른 사진 요청"
            elif keep_worst > OCC_MIN:
                # 채울 원본인 반대쪽도 깨끗하지 않으면 뒤집어도 가림이 복사된다 (AI 생성 시험 ⑥: 반대쪽 눈썹 25%)
                rep["verdict"], rep["why"] = "reject", f"{occluded} 쪽이 가렸고 {keep} 쪽도 깨끗하지 않음 (최대 {keep_worst:.0%}) → 다른 사진 요청"
            else:
                rep.update(verdict="fill", occluded_side=occluded, keep=keep,
                           why=f"머리카락 · 옷이 {occluded} 쪽만 많이 가림 ({', '.join(hair_bad)}) → {keep} 쪽을 뒤집어 채움")
        elif len(hand_sides) == 2:
            rep["verdict"], rep["why"] = "reject", "손이 양쪽 다 많이 가림 → 다른 사진 요청"
        elif hand_sides:
            rep["why"] = f"손이 {hand_sides[0]} 쪽을 가렸으나 한쪽뿐이라 통과 (손은 피부색이라 얼룩이 안 생김)"
        else:
            worst = max(v for s in ("L", "R") for v in rep["scores"][s].values())
            rep["why"] = "눈썹 · 눈 · 볼 · 입술이 잘 보임" if worst <= OCC_MIN else "약간 가린 곳이 있으나 많이 가린 곳은 없음 → 원본 그대로"
        rep["_debug"] = (crop, parts, occ)
    except Exception as e:  # noqa: BLE001  전처리 때문에 서비스가 죽으면 안 된다
        rep.update(verdict="pass", why=f"오류 → 원본 그대로: {e}")
    return rep


def prep(img: Image.Image, frontalize=None) -> tuple[Image.Image, dict]:
    """서버에 끼울 형태: (전처리된 사진, 판정). 판별은 원본으로 먼저 한다 (CPU, 빠름) — 거절은 FLUX 를 돌리기 전에 바로 나온다.
      reject → 원본 그대로 (바로)         pass → 원본 그대로
      fill → 뒤집어 채운 사진 (각도가 크면 뒤집기가 성립하지 않으므로 거절)
      각도가 큰 pass → "frontalize": frontalize(img) (FLUX 로 정면으로 돌리기 — GPU) 한 사진. 얼굴을 못 찾게 되거나 실패하면 원본 그대로.
    frontalize 가 없으면 판정만 "frontalize" 로 돌려주고 원본을 그대로 둔다."""
    rep = analyze(np.asarray(img.convert("RGB")))
    turned = rep.get("turned") or []
    if rep["verdict"] == "fill":
        if turned:
            rep["verdict"], rep["why"] = "reject", f"얼굴 각도가 크고({', '.join(turned)}) 한쪽이 가려서 뒤집어 채울 수 없음 → 다른 사진 요청"
            return img, rep
        import mirror_half as mh   # 순환 참조를 피해 필요할 때만 불러온다
        return mh.prep(img, rep["keep"]), rep
    if rep["verdict"] == "pass" and turned:
        rep["verdict"], rep["why"] = "frontalize", f"{rep['why']} / 얼굴 각도가 큼 ({', '.join(turned)}) → FLUX 로 정면으로 돌림"
        if frontalize is None:
            return img, rep
        try:
            out = frontalize(img)
            if detect(np.asarray(out.convert("RGB")))[0] is None:
                rep["why"] += " (정면화한 사진에서 얼굴을 못 찾아 원본 그대로)"
                return img, rep
            return out, rep
        except Exception as e:  # noqa: BLE001  FLUX 쪽 실패 — 원본 그대로 통과
            rep["why"] += f" (정면화 실패 → 원본 그대로: {e})"
            return img, rep
    return img, rep


def overlay(rep: dict) -> Image.Image | None:
    """확인용: 가린 곳(분할이 머리카락 · 손 · 옷으로 본 곳)을 붉게, 부위 테두리는 초록(잘 보임) · 노랑(약간) · 자주(많이 가림)"""
    if "_debug" not in rep:
        return None
    crop, parts, occ = rep["_debug"]
    im = crop.copy().astype(np.float32)
    im[occ] = im[occ] * 0.55 + np.array([255, 0, 0]) * 0.45
    im = im.astype(np.uint8)
    for s in ("L", "R"):
        for p, m in parts[s].items():
            v = rep["scores"][s][p]
            col = (255, 0, 255) if v > OCC_HEAVY[p] else ((255, 255, 0) if v > OCC_MIN else (0, 255, 0))
            cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(im, cs, -1, col, 2)
    return Image.fromarray(im)
