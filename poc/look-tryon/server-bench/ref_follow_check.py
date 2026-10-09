"""정답사진이 참고 사진을 따라 그리는지 — 켜 둔 klein 서버(app_klein.py)에 참고 사진 세 장을 보내 본다 (② 2026-10-08).

지시문에 화장 항목(눈썹 · 섀도 · 라이너 · 블러셔 · 입술)을 늘어놓았더니, 모델이 참고 사진 대신 '흔한 화장'을 그렸다 —
화장 없는 사진을 참고로 넣어도 빨간 입술 · 아이라인이 생겼다. 옮긴 그림(참고 = 시도사진)도 같은 서버라,
화장을 안 해도 옮긴 그림에 화장이 생겨 피드백이 틀린다. 지시문 · 강도를 바꿀 때 이걸로 다시 본다.

참고 사진 (저장소 샘플 얼굴만 — 개인 사진 없음)
  self  : 맨얼굴 그 자체          → 거의 안 바뀌어야 한다
  other : 다른 사람 맨얼굴        → 거의 안 바뀌어야 한다
  tint  : 다른 사람 얼굴에 섀도 파랑 · 입술 초록 · 볼에 큰 분홍 블러셔를 칠한 것
          → 그 색 쪽으로 가야 하고 (흔한 화장이면 빨간 입술로 간다), 큰 블러셔는 볼을 넓게 덮어야 한다
            (칠할 자리가 작으면 참고 사진의 큰 블러셔가 작게 옮겨졌다 — 2026-10-09, 팀원 방식(사진 전체를 새로 그림)과 견줘 봄)
  blush : 다른 사람 얼굴에 칠할 타원보다 크고 가장자리가 부드러운 분홍 블러셔만
          → 블러셔 크기는 그대로(타원 안 테두리까지 진하게), 타원 밖으로 이어지며 옅어지고, 딱 끊긴 테두리가 없어야 한다
            (2026-10-09 사용자: 칠할 타원 그대로 붙여 분홍 판 같았다 · 안쪽부터 옅게 했더니 블러셔가 작아져 더 눈에 띄었다 —
            크기는 그대로 두고 블러셔가 없는 쪽으로 그라데이션을 주며 퍼뜨리기)
  모두    : 눈 안쪽(흰자 · 눈동자)은 그대로여야 한다
  입 벌린 맨얼굴(사진 경로를 주면 — 저장소 샘플에는 입 벌린 얼굴이 없고 개인 사진은 안 올린다)
          tint  → 벌린 입 안(이)은 그대로여야 한다 — 입술 바깥 선 안을 다 칠해 이까지 빨갛게 덮였다 (2026-10-09 사용자).
                  입술(바깥 선 ~ 안쪽 선 사이 띠)은 초록 쪽으로 가야 한다 — 입 안을 모델이 칠할 영역에서까지 뺐더니 얇은 입술 띠를 다시 그리지 않아
                  입술 색이 거의 안 옮겨졌다
          blush → 볼 가운데에서 바깥으로 가며 붉어진 정도가 줄었다 다시 오르는 줄무늬가 없어야 한다 — 모델이 칠할 영역 끝(얼굴 옆선 쪽)을
                  스스로 옅게 그려, 그 바깥에 이어 펴 바른 색과 사이에 옅은 줄이 생겼다 (2026-10-09 사용자, 갸름한 얼굴) — 다시 그려서 참고 사진의 눈꺼풀 선이 눈동자에 비쳤다 (2026-10-09 카리나 사진)
             돌려받은 그림은 무손실(webp VP8L · PNG) — 손실 webp 가 가는 선(라이너 꼬리)을 뭉갰다 (#393)

    conda run -n flux2 python ref_follow_check.py [http://127.0.0.1:7861] [입 벌린 맨얼굴 사진]
"""
import base64
import io
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from PIL import Image, ImageDraw

API = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7861").rstrip("/")
OPEN_MOUTH = Path(sys.argv[2]) if len(sys.argv) > 2 else None
SAMPLES = Path(__file__).resolve().parents[2] / "samples" / "phone-portraits-20"
BARE = SAMPLES / "person_1_front_open.jpg"
OTHER = SAMPLES / "person_2_front_open.jpg"
# 서버가 정답사진 · 옮긴 그림을 만들 때 쓰는 값 (server/app/flux.py STEPS · STRENGTH · SEED) — 여기서는 seed 둘
STEPS, STRENGTH, SEEDS = 4, 0.85, (1234, 7)

LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
# 눈마다 윗눈꺼풀(눈꼬리 → 눈머리) · 눈썹 아랫선(눈꼬리 쪽 → 눈머리 쪽) — 그 사이가 섀도 자리
LIDS = (([33, 246, 161, 160, 159, 158, 157, 173, 133], [46, 53, 52, 65, 55]),
        ([263, 466, 388, 387, 386, 385, 384, 398, 362], [276, 283, 282, 295, 285]))
# 볼 — 눈 가운데에서 바깥으로 눈 폭 0.25, 아래로 1.15 인 곳을 가운데로 (가로 · 세로 반지름, 눈 폭 대비)
CHEEK_AT = (0.25, 1.15)
CHEEK_ZONE = (0.9, 0.7)     # 잴 자리
CHEEK_PAINT = (1.0, 0.8)    # 참고 사진에 칠하는 크기 — 잴 자리보다 조금 크게
# 통과 기준 (Lab) — 화장 없는 참고면 입술 · 섀도 자리 평균 색 차가 이 밑, 칠한 참고면 그 색 쪽으로 이만큼 넘게,
# 볼 잴 자리 중 붉어진(a* 가 CHEEK_RED 넘게 오른) 곳이 CHEEK_COVER 넘게
BARE_MAX = 6.0
# 눈 안쪽은 눈 폭의 3% 로 흐려서 견준다 — 서버가 webp(손실 압축)로 돌려줘서, 그대로 견주면 압축만으로 눈 안쪽 색 차가 2.7 이었다
# (흐리면 압축만 1.0. 이 스크립트로 — 눈 안쪽까지 다시 그리던 서버: 칠한 참고 2.8 ~ 3.1 · 고친 서버: 0.9 ~ 1.5, 2026-10-09)
EYE_BLUR = 0.03
EYE_MAX = 2.0
TINT_MIN = 4.0
CHEEK_RED = 5.0
CHEEK_COVER = 0.6
# blush 참고 사진: 칠할 타원(CHEEK_PAINT) 가운데에서 BLUSH_SOFT[0] 까지 진하게, BLUSH_SOFT[1] 까지 옅어지는 분홍 (타원 밖까지 이어진다)
BLUSH_SOFT = (0.6, 1.35)
# 붉어진 정도를 가운데(타원 0.4 안)에 견줘: 안 테두리 띠(0.85 ~ 1)는 BLUSH_IN 넘게(크기 그대로), 바깥 띠(1.05 ~ 1.3)는 BLUSH_OUT 넘게(퍼짐),
# 먼 곳(1.8 ~ 2.2)은 BLUSH_FAR 밑(얼굴 전체로 번지지 않음), 볼 둘레(1.4 안)에서 바뀌는 가파름(눈 폭당 · 상위 0.5%)은 BLUSH_STEEP 밑
# 이 스크립트 · 같은 그림(seed 1234)으로 — 타원 그대로: 0.40 · 0.03 · 0.02 · 8.8 / 안쪽부터 옅게: 0.04 · 0.01 · 0.02 · 6.1 /
# 크기 그대로 + 바깥으로 펴기: 0.46 · 0.29 · 0.02 · 7.3 (2026-10-09)
BLUSH_IN = 0.3
BLUSH_OUT = 0.15
BLUSH_FAR = 0.1
BLUSH_STEEP = 8.0
# 줄무늬: 볼 가운데에서 바깥(타원 0.7 ~ 1.4, 다른 볼 쪽 · 입술 · 눈 둘레 전까지)으로 가며 줄었다 다시 오른 크기(가운데 대비, 줄기 95%)가 BLUSH_RIM 밑.
# 입 벌린 맨얼굴(2026-10-09 사용자 사진) · blush 로 — 바깥으로 펴기만: 0.12 / 테두리 쪽은 원본 피부 + 고른 색: 0.02
BLUSH_RIM = 0.06
# 벌린 입 안 — 눈 안쪽처럼 흐려서 견준 색 차. 같은 사진 · tint 로 — 입 안까지 칠함: 49.7 / 뺌: 3.0
MOUTH_MAX = 6.0
# 입 안쪽 선 (윗입술 아랫선 · 아랫입술 윗선) — 입을 다물면 넓이가 거의 0
MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]

_lmk = FaceLandmarker.create_from_options(FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=str(Path.home() / ".cache" / "nudy" / "face_landmarker.task")), num_faces=1))


def landmarks(im):
    w, h = im.size
    r = _lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im.convert("RGB")).copy()))
    return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]])


# 눈 안쪽 (윗 · 아랫눈꺼풀 테두리)
EYE_IN = ([33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
          [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466])


def eyes_in(im):
    lm = landmarks(im)
    m = Image.new("L", im.size, 0)
    for e in EYE_IN:
        ImageDraw.Draw(m).polygon([tuple(lm[k]) for k in e], fill=255)
    return np.asarray(m) > 0


def cheeks(im, size):
    """볼 타원 마스크 — size = (가로, 세로) 반지름 (눈 폭 대비)"""
    lm = landmarks(im)
    m = Image.new("L", im.size, 0)
    for lid, _ in LIDS:
        o, i0 = lm[lid[0]], lm[lid[-1]]
        ew = float(np.linalg.norm(o - i0))
        c = (o + i0) / 2 + (o - i0) / ew * CHEEK_AT[0] * ew + np.array([0, CHEEK_AT[1] * ew])
        rx, ry = size[0] * ew, size[1] * ew
        ImageDraw.Draw(m).ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], fill=255)
    return np.asarray(m) > 0


def cheek_q(im):
    """볼 타원(CHEEK_PAINT) 가운데에서 잰 거리 — 1 이 타원 테두리 (두 볼 중 가까운 쪽) · 눈 폭"""
    lm = landmarks(im)
    yy, xx = np.mgrid[0:im.size[1], 0:im.size[0]].astype(np.float32)
    q = np.full(yy.shape, 9.0, np.float32)
    for lid, _ in LIDS:
        o, i0 = lm[lid[0]], lm[lid[-1]]
        ew = float(np.linalg.norm(o - i0))
        c = (o + i0) / 2 + (o - i0) / ew * CHEEK_AT[0] * ew + np.array([0, CHEEK_AT[1] * ew])
        q = np.minimum(q, np.hypot((xx - c[0]) / (CHEEK_PAINT[0] * ew), (yy - c[1]) / (CHEEK_PAINT[1] * ew)))
    return q, ew


def blush_profile(da, q, ew, lips, eye):
    """(안 테두리 띠, 바깥 띠, 먼 곳 — 가운데 대비, 가파름) — da: 맨얼굴 대비 a* 변화"""
    near_eye = cv2.dilate(eye.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.2 * ew) | 1,) * 2)) > 0
    ok = ~lips & ~near_eye
    center = float(da[(q < 0.4) & ok].mean())
    ring = lambda a, b: float(da[(q > a) & (q < b) & ok].mean()) / center
    gy, gx = np.gradient(cv2.GaussianBlur(da.astype(np.float32), (0, 0), 0.03 * ew))
    steep = np.hypot(gx, gy) * ew / max(center, 1e-6)
    return ring(0.85, 1.0), ring(1.05, 1.3), ring(1.8, 2.2), float(np.percentile(steep[(q < 1.4) & ok], 99.5))


def blush_rim(da, lm, ew, bad, center):
    """볼 가운데에서 바깥으로 가며 붉어진 정도가 줄었다 다시 오른 크기 (가운데 대비 · 72 줄기 × 두 볼 중 95%) — 줄무늬"""
    s = cv2.GaussianBlur(da.astype(np.float32), (0, 0), 0.03 * ew)
    h, w = s.shape
    cs = []
    for lid, _ in LIDS:
        o, i0 = lm[lid[0]], lm[lid[-1]]
        e = float(np.linalg.norm(o - i0))
        cs.append(((o + i0) / 2 + (o - i0) / e * CHEEK_AT[0] * e + np.array([0, CHEEK_AT[1] * e]), CHEEK_PAINT[0] * e, CHEEK_PAINT[1] * e))
    out = []
    for j, (c, rx, ry) in enumerate(cs):
        oc, orx, ory = cs[1 - j]
        for t in np.linspace(0, 2 * np.pi, 72, endpoint=False):
            lo, rise = np.inf, 0.0
            for qq in np.arange(0.7, 1.4, 0.02):
                x, y = c[0] + rx * qq * np.cos(t), c[1] + ry * qq * np.sin(t)
                xi, yi = int(round(x)), int(round(y))
                if np.hypot((x - oc[0]) / orx, (y - oc[1]) / ory) < qq or not (0 <= xi < w and 0 <= yi < h) or bad[yi, xi]:
                    break   # 다른 볼 쪽 · 사진 밖 · 입술 · 눈 둘레
                lo = min(lo, s[yi, xi])
                rise = max(rise, s[yi, xi] - lo)
            out.append(rise)
    return float(np.percentile(out, 95)) / center


def mouth_in(im):
    """벌린 입 안 (테두리 1px 안쪽)"""
    lm = landmarks(im)
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).polygon([tuple(lm[k]) for k in MOUTH], fill=255)
    return cv2.erode(np.asarray(m), np.ones((3, 3), np.uint8)) > 0


def zones(im):
    """(입술, 섀도 자리, 볼) 마스크 — 섀도 자리는 윗눈꺼풀 ~ 눈썹 아랫선 사이의 아래쪽 절반 (눈썹 털은 안 넣음)"""
    lm = landmarks(im)
    lips = Image.new("L", im.size, 0)
    ImageDraw.Draw(lips).polygon([tuple(lm[k]) for k in LIPS], fill=255)
    lids = Image.new("L", im.size, 0)
    for lid, brow in LIDS:
        top = [lm[lid[0]] + (lm[b] - lm[lid[0]]) * 0.5 for b in brow]
        ImageDraw.Draw(lids).polygon([tuple(p) for p in [lm[k] for k in lid] + top[::-1]], fill=255)
    lips = np.asarray(lips) > 0
    return lips, np.asarray(lids) > 0, cheeks(im, CHEEK_ZONE) & ~lips


def lab(im):
    c = np.asarray(im.convert("RGB"), np.float64) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / [0.95047, 1.0, 1.08883]
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def blurred(L, sigma):
    return np.stack([cv2.GaussianBlur(L[..., i].astype(np.float32), (0, 0), sigma) for i in range(3)], -1)


def tinted(im):
    """섀도 자리 파랑 · 입술 초록 — 흔한 화장(분홍 · 주황 섀도, 빨간 입술)과 반대 색 · 볼에 큰 분홍 블러셔"""
    lips, lids, _ = zones(im)
    blush = cheeks(im, CHEEK_PAINT) & ~lips
    a = np.asarray(im.convert("RGB"), np.float64)
    for m, color in ((blush, (235, 105, 135)), (lids, (40, 90, 220)), (lips, (30, 160, 70))):
        a[m] = a[m] * 0.35 + np.array(color) * 0.65
    return Image.fromarray(a.astype(np.uint8))


def soft_blush(im):
    """칠할 타원보다 크고 가장자리가 부드러운 분홍 블러셔만 (입술 · 눈은 그대로)"""
    q, _ = cheek_q(im)
    lips, _, _ = zones(im)
    t = np.clip((q - BLUSH_SOFT[0]) / (BLUSH_SOFT[1] - BLUSH_SOFT[0]), 0, 1)
    alpha = (0.65 * (1 - t * t * (3 - 2 * t)) * ~lips)[..., None]
    a = np.asarray(im.convert("RGB"), np.float64)
    return Image.fromarray((a * (1 - alpha) + np.array((235, 105, 135)) * alpha).astype(np.uint8))


def png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return {"url": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), "meta": {"_type": "gradio.FileData"}}


def lossless(data):
    """무손실인가 — PNG, 또는 webp 의 그림 조각이 VP8L(무손실). VP8 는 손실"""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return False
    i = 12
    while i + 8 <= len(data):
        tag = data[i:i + 4]
        if tag == b"VP8L":
            return True
        if tag == b"VP8 ":
            return False
        i += 8 + int.from_bytes(data[i + 4:i + 8], "little") + (int.from_bytes(data[i + 4:i + 8], "little") & 1)
    return False


LAST = {"bytes": b""}


def make(bare, ref, seed):
    body = json.dumps({"data": [png(bare), png(ref), STEPS, STRENGTH, True, seed]}).encode()
    req = urllib.request.Request(f"{API}/gradio_api/call/predict", body, {"Content-Type": "application/json"})
    eid = json.load(urllib.request.urlopen(req))["event_id"]
    sse = urllib.request.urlopen(f"{API}/gradio_api/call/predict/{eid}", timeout=300).read().decode()
    kind, data = re.findall(r"event: (\w+)\ndata: (.*)", sse)[-1]
    if kind != "complete":
        raise RuntimeError(data[:200])
    path = json.loads(data)[0]["path"]
    LAST["bytes"] = urllib.request.urlopen(f"{API}/gradio_api/file={quote(path, safe='')}").read()
    return Image.open(io.BytesIO(LAST["bytes"])).convert("RGB")


def open_mouth_check(other):
    """입 벌린 맨얼굴: tint 로 벌린 입 안이 그대로인지, blush 로 볼 줄무늬가 없는지 (seed 1234 하나)"""
    bare = Image.open(OPEN_MOUTH).convert("RGB")
    lm = landmarks(bare)
    lips, _, _ = zones(bare)
    eye = eyes_in(bare)
    q, ew = cheek_q(bare)
    L0 = lab(bare)
    sigma = EYE_BLUR * float(np.linalg.norm(lm[33] - lm[133]))
    mouth = mouth_in(bare)
    ring = lips & ~cv2.dilate(mouth.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)   # 입술 띠 (입 안 둘레 빼고)
    L = lab(make(bare, tinted(other), SEEDS[0]))
    de_mouth = float(np.linalg.norm(blurred(L, sigma) - blurred(L0, sigma), axis=-1)[mouth].mean())
    greener = float(-(L - L0)[ring][:, 1].mean())
    good_mouth = mouth.sum() > 0 and de_mouth < MOUTH_MAX and greener > TINT_MIN
    print(f"입 벌림 tint  seed {SEEDS[0]:4d}  입 안 색 차 {de_mouth:4.1f} (< {MOUTH_MAX}, {int(mouth.sum())}px) · 입술 초록 쪽 {greener:+5.1f} (> {TINT_MIN})"
          f"  {'통과' if good_mouth else '실패'}")
    bad = lips | (cv2.dilate(eye.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.2 * ew) | 1,) * 2)) > 0)
    da = lab(make(bare, soft_blush(other), SEEDS[0]))[..., 1] - L0[..., 1]
    rim = blush_rim(da, lm, ew, bad, float(da[(q < 0.4) & ~bad].mean()))
    print(f"입 벌림 blush seed {SEEDS[0]:4d}  볼 줄무늬 {rim:4.2f} (< {BLUSH_RIM})  {'통과' if rim < BLUSH_RIM else '실패'}")
    return bool(good_mouth and rim < BLUSH_RIM)


def main():
    bare = Image.open(BARE).convert("RGB")
    other = Image.open(OTHER).convert("RGB")
    lips, lids, cheek = zones(bare)
    eye = eyes_in(bare)
    L0 = lab(bare)
    lm = landmarks(bare)
    sigma = EYE_BLUR * float(np.linalg.norm(lm[33] - lm[133]))
    B0 = blurred(L0, sigma)
    q, ew = cheek_q(bare)
    bad = lips | (cv2.dilate(eye.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(0.2 * ew) | 1,) * 2)) > 0)
    refs = {"self": bare, "other": other, "tint": tinted(other), "blush": soft_blush(other)}
    ok = True
    for name, ref in refs.items():
        for seed in SEEDS:
            L = lab(make(bare, ref, seed))
            d = L - L0
            de_lip = np.linalg.norm(d[lips], axis=-1).mean()
            de_lid = np.linalg.norm(d[lids], axis=-1).mean()
            de_eye = np.linalg.norm(blurred(L, sigma) - B0, axis=-1)[eye].mean()
            eye_ok = de_eye < EYE_MAX
            eye_txt = f" · 눈 안쪽 {de_eye:3.1f} (< {EYE_MAX}) · {'무손실' if lossless(LAST['bytes']) else '손실 압축'}"
            if name == "tint":
                # 입술은 초록 쪽(a* 내려감), 섀도는 파랑 쪽(b* 내려감)
                greener, bluer = -d[lips][:, 1].mean(), -d[lids][:, 2].mean()
                cover = float((d[cheek][:, 1] > CHEEK_RED).mean())
                good = greener > TINT_MIN and bluer > TINT_MIN and cover > CHEEK_COVER and eye_ok and lossless(LAST["bytes"])
                print(f"{name:5s} seed {seed:4d}  입술 초록 쪽 {greener:+5.1f} · 섀도 파랑 쪽 {bluer:+5.1f}  (> {TINT_MIN})"
                      f" · 볼 덮음 {cover:4.0%} (> {CHEEK_COVER:.0%}){eye_txt}  {'통과' if good else '실패'}")
            elif name == "blush":
                inner, outer, far, steep = blush_profile(d[..., 1], q, ew, lips, eye)
                rim = blush_rim(d[..., 1], lm, ew, bad, float(d[..., 1][(q < 0.4) & ~bad].mean()))
                good = (de_lip < BARE_MAX and inner > BLUSH_IN and outer > BLUSH_OUT and far < BLUSH_FAR and steep < BLUSH_STEEP
                        and rim < BLUSH_RIM and eye_ok and lossless(LAST["bytes"]))
                print(f"{name:5s} seed {seed:4d}  입술 색 차 {de_lip:4.1f} (< {BARE_MAX}) · 볼 안 테두리 {inner:4.2f} (> {BLUSH_IN})"
                      f" · 바깥 {outer:4.2f} (> {BLUSH_OUT}) · 먼 곳 {far:5.2f} (< {BLUSH_FAR}) · 가파름 {steep:4.1f} (< {BLUSH_STEEP})"
                      f" · 줄무늬 {rim:4.2f} (< {BLUSH_RIM})"
                      f"{eye_txt}  {'통과' if good else '실패'}")
            else:
                good = de_lip < BARE_MAX and de_lid < BARE_MAX and eye_ok and lossless(LAST["bytes"])
                print(f"{name:5s} seed {seed:4d}  입술 색 차 {de_lip:4.1f} · 섀도 자리 색 차 {de_lid:4.1f}  (< {BARE_MAX})"
                      f"{eye_txt}  {'통과' if good else '실패'}")
            ok &= bool(good)
    if OPEN_MOUTH is not None:
        ok &= open_mouth_check(other)
    print("통과" if ok else "실패")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
