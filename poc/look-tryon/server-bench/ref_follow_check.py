"""정답사진이 참고 사진을 따라 그리는지 — 켜 둔 klein 서버(app_klein.py)에 참고 사진 세 장을 보내 본다 (② 2026-10-08).

지시문에 화장 항목(눈썹 · 섀도 · 라이너 · 블러셔 · 입술)을 늘어놓았더니, 모델이 참고 사진 대신 '흔한 화장'을 그렸다 —
화장 없는 사진을 참고로 넣어도 빨간 입술 · 아이라인이 생겼다. 옮긴 그림(참고 = 시도사진)도 같은 서버라,
화장을 안 해도 옮긴 그림에 화장이 생겨 피드백이 틀린다. 지시문 · 강도를 바꿀 때 이걸로 다시 본다.

참고 사진 (저장소 샘플 얼굴만 — 개인 사진 없음)
  self  : 맨얼굴 그 자체          → 거의 안 바뀌어야 한다
  other : 다른 사람 맨얼굴        → 거의 안 바뀌어야 한다
  tint  : 다른 사람 얼굴에 섀도 파랑 · 입술 초록을 칠한 것 → 그 색 쪽으로 가야 한다 (흔한 화장이면 빨간 입술로 간다)

    conda run -n flux2 python ref_follow_check.py [http://127.0.0.1:7861]
"""
import base64
import io
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import quote

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from PIL import Image, ImageDraw

API = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7861").rstrip("/")
SAMPLES = Path(__file__).resolve().parents[2] / "samples" / "phone-portraits-20"
BARE = SAMPLES / "person_1_front_open.jpg"
OTHER = SAMPLES / "person_2_front_open.jpg"
# 서버가 정답사진 · 옮긴 그림을 만들 때 쓰는 값 (server/app/flux.py STEPS · STRENGTH · SEED) — 여기서는 seed 둘
STEPS, STRENGTH, SEEDS = 4, 0.85, (1234, 7)

LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
# 눈마다 윗눈꺼풀(눈꼬리 → 눈머리) · 눈썹 아랫선(눈꼬리 쪽 → 눈머리 쪽) — 그 사이가 섀도 자리
LIDS = (([33, 246, 161, 160, 159, 158, 157, 173, 133], [46, 53, 52, 65, 55]),
        ([263, 466, 388, 387, 386, 385, 384, 398, 362], [276, 283, 282, 295, 285]))
# 통과 기준 (Lab) — 화장 없는 참고면 입술 · 섀도 자리 평균 색 차가 이 밑, 칠한 참고면 그 색 쪽으로 이만큼 넘게
BARE_MAX = 6.0
TINT_MIN = 4.0

_lmk = FaceLandmarker.create_from_options(FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=str(Path.home() / ".cache" / "nudy" / "face_landmarker.task")), num_faces=1))


def landmarks(im):
    w, h = im.size
    r = _lmk.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im.convert("RGB")).copy()))
    return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]])


def zones(im):
    """(입술, 섀도 자리) 마스크 — 섀도 자리는 윗눈꺼풀 ~ 눈썹 아랫선 사이의 아래쪽 절반 (눈썹 털은 안 넣음)"""
    lm = landmarks(im)
    lips = Image.new("L", im.size, 0)
    ImageDraw.Draw(lips).polygon([tuple(lm[k]) for k in LIPS], fill=255)
    lids = Image.new("L", im.size, 0)
    for lid, brow in LIDS:
        top = [lm[lid[0]] + (lm[b] - lm[lid[0]]) * 0.5 for b in brow]
        ImageDraw.Draw(lids).polygon([tuple(p) for p in [lm[k] for k in lid] + top[::-1]], fill=255)
    return np.asarray(lips) > 0, np.asarray(lids) > 0


def lab(im):
    c = np.asarray(im.convert("RGB"), np.float64) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / [0.95047, 1.0, 1.08883]
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def tinted(im):
    """섀도 자리 파랑 · 입술 초록 — 흔한 화장(분홍 · 주황 섀도, 빨간 입술)과 반대 색"""
    lips, lids = zones(im)
    a = np.asarray(im.convert("RGB"), np.float64)
    for m, color in ((lids, (40, 90, 220)), (lips, (30, 160, 70))):
        a[m] = a[m] * 0.35 + np.array(color) * 0.65
    return Image.fromarray(a.astype(np.uint8))


def png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return {"url": "data:image/png;base64," + base64.b64encode(b.getvalue()).decode(), "meta": {"_type": "gradio.FileData"}}


def make(bare, ref, seed):
    body = json.dumps({"data": [png(bare), png(ref), STEPS, STRENGTH, True, seed]}).encode()
    req = urllib.request.Request(f"{API}/gradio_api/call/predict", body, {"Content-Type": "application/json"})
    eid = json.load(urllib.request.urlopen(req))["event_id"]
    sse = urllib.request.urlopen(f"{API}/gradio_api/call/predict/{eid}", timeout=300).read().decode()
    kind, data = re.findall(r"event: (\w+)\ndata: (.*)", sse)[-1]
    if kind != "complete":
        raise RuntimeError(data[:200])
    path = json.loads(data)[0]["path"]
    return Image.open(io.BytesIO(urllib.request.urlopen(f"{API}/gradio_api/file={quote(path, safe='')}").read())).convert("RGB")


def main():
    bare = Image.open(BARE).convert("RGB")
    other = Image.open(OTHER).convert("RGB")
    lips, lids = zones(bare)
    L0 = lab(bare)
    refs = {"self": bare, "other": other, "tint": tinted(other)}
    ok = True
    for name, ref in refs.items():
        for seed in SEEDS:
            d = lab(make(bare, ref, seed)) - L0
            de_lip = np.linalg.norm(d[lips], axis=-1).mean()
            de_lid = np.linalg.norm(d[lids], axis=-1).mean()
            if name == "tint":
                # 입술은 초록 쪽(a* 내려감), 섀도는 파랑 쪽(b* 내려감)
                greener, bluer = -d[lips][:, 1].mean(), -d[lids][:, 2].mean()
                good = greener > TINT_MIN and bluer > TINT_MIN
                print(f"{name:5s} seed {seed:4d}  입술 초록 쪽 {greener:+5.1f} · 섀도 파랑 쪽 {bluer:+5.1f}  (> {TINT_MIN})  {'통과' if good else '실패'}")
            else:
                good = de_lip < BARE_MAX and de_lid < BARE_MAX
                print(f"{name:5s} seed {seed:4d}  입술 색 차 {de_lip:4.1f} · 섀도 자리 색 차 {de_lid:4.1f}  (< {BARE_MAX})  {'통과' if good else '실패'}")
            ok &= bool(good)
    print("통과" if ok else "실패")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
