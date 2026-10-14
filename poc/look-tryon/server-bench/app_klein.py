"""FLUX.2 [klein] 4B 화장 입히기 데모 서버 (당화응 ② 2026-10-06) — makeup-extract-probe 페이지의 ③ 'AI 모델' 에서 고른다.

Stable-Makeup(app_demo.py, 7860)과 같은 REST 모양: run(id_image, makeup_image, steps, strength, keep_size, seed).
klein 4B 는 Apache-2.0 (상업 사용 가능). 9B 는 비상업이라 쓰지 않는다.

그냥 '사진 두 장 + 지시' 로 그리면 화장은 옮겨 오지만 참고 인물의 피부색 · 얼굴형까지 따라가 다른 사람이 됐다 (지시문으로 못 막음).
그래서 영역 다시 그리기(Flux2KleinInpaintPipeline)로 — 얼굴 점으로 눈두덩(섀도 · 라이너 · 꼬리) · 볼 · 입술만 칠할 영역으로 주고
나머지(얼굴형 · 코 · 피부 · 머리 · 배경)는 원본 그대로 둔다. 눈 안쪽(흰자 · 눈동자)도 빼야 눈 모양(쌍꺼풀 · 크기)이 안 바뀐다.

실행 (모델을 받은 HF 캐시를 HF_HOME 으로 — 예시는 D 드라이브):

    set HF_HOME=D:\\hf-cache
    set HF_HUB_OFFLINE=1
    conda run -n flux2 python app_klein.py

화장 옮기기만 따로 가르친 부품(LoRA) nudy_makeup_klein4b_v1.safetensors 를 끼운다 — 이 파일 옆에 있으면 끼우고, 없으면 klein 그대로.
다른 곳의 파일은 KLEIN_LORA 에 경로를 주고, 옆에 있어도 빼려면 KLEIN_LORA=off.
    set KLEIN_LORA=D:\\nudy-lora\\lora\\nudy_makeup_klein4b_v1\\nudy_makeup_klein4b_v1.safetensors
klein base 4B 로 학습(ai-toolkit)해 이 증류판에 그대로 끼운다 — 진한 화장 · 입술 색이 참고에 더 가깝게 옮겨졌다.
250 ~ 2000 걸음 부품 중 2000 걸음으로 정했다 (2026-10-14) — 어두운 피부에 밝은 참고를 줘도 볼을 가장 덜 밝혔다. 한 장 시간은 그대로.
부품 파일은 git 에 안 올리고 릴리스 lora-klein-makeup-v1 에 둔다 (.gitignore *.safetensors). GPU 서버는 자동 배포(gpu-deploy.yml)가
이 파일 옆(D:\\)에 받아 둔다. 끼우려면 diffusers 와 같은 환경에 peft 가 있어야 한다.
못 끼우면 서버를 멈추지 않고 klein 그대로 켠다 — 켤 때 "[lora] loaded · failed · off" 한 줄을 남기고, 배포가 그 줄을 본다.

지시문은 고정이라 글 해석 부품(7.5GB)은 처음 한 번만 돌려 결과를 ~/.cache/nudy/klein_prompt_embeds.pt 에 두고(지시문 · 모델이
바뀌면 다시), 서버에는 그리는 부품(7.3GB) + 그림 변환 부품만 그래픽카드에 통째로 올린다 — RTX 3060 12GB 에 들어간다.
전에는 다 안 들어가 부분씩 올렸는데(enable_model_cpu_offload) 쓸 때마다 PC 메모리 → 그래픽카드로 옮기는 순간 프로그램이
죽었다(Windows access violation, 2026-10-07 하루 3번). ① look-transfer-gen 의 embed.py 와 같은 생각 (#331).
만든 그림 · 받은 사진은 Gradio 임시 폴더에 남지 않게 2분 지나면 지운다 (정의서: 서버에는 저장 안 함).

Stable-Makeup 서버와 같이 켜면 그래픽카드 메모리(12GB)가 모자라다 — 하나씩 켠다.
"""
import gc
import os
import time
import urllib.request
import queue
import uuid
from concurrent.futures import Future
from pathlib import Path

import cv2
import gradio as gr
from gradio.utils import get_upload_folder
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial import Delaunay

import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from diffusers import Flux2KleinInpaintPipeline

MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
LANDMARKER_PATH = Path.home() / ".cache" / "nudy" / "face_landmarker.task"
EMBEDS_PATH = Path.home() / ".cache" / "nudy" / "klein_prompt_embeds.pt"
LORA_NAME = "nudy_makeup_klein4b_v1.safetensors"   # 정한 화장 부품 (2000 걸음) — 이 파일 옆에 있으면 끼운다


def lora_path():
    """끼울 부품 파일 — KLEIN_LORA 가 있으면 그것(off 면 안 끼움), 없으면 이 파일 옆의 LORA_NAME (있을 때만). 비면 안 끼운다"""
    env = os.environ.get("KLEIN_LORA", "").strip()
    if env:
        return "" if env.lower() == "off" else env
    near = Path(__file__).resolve().with_name(LORA_NAME)
    return str(near) if near.exists() else ""


LORA = lora_path()
SIZE = 768          # 얼굴 정사각형을 이 크기로 그린다
REF_SIZE = 512      # 참고 사진 크기 (작아도 화장은 옮겨 오고 더 빠르다)
# 돌려주는 그림은 무손실 webp — Gradio 기본(손실 webp)이 가는 선(라이너 꼬리)을 뭉개서 피드백이 꼬리를 못 읽었다 (#393).
# 압축 강도(0 빠름 · 100 작음) 50: 1600 × 1600 한 장 2MB · 1.1초 (PNG 는 2.9MB · 0.3초, 손실 webp 는 160KB)
LOSSLESS_EFFORT = 50
FACE_MARGIN = 1.3   # 얼굴 점 상자 긴 변의 몇 배로 자를지 (이마 꼭대기 ~ 턱이 이미 들어 있다)
FEATHER = 0.08      # 원본에 되붙일 때 가장자리를 섞는 폭
OVAL_KEEP = 0.9     # 칠할 영역은 얼굴 윤곽을 가운데 쪽으로 이만큼 줄인 안에서만
# 짧게 — 화장 항목(눈썹 · 섀도 · 라이너 · 블러셔 · 입술)을 늘어놓으면 모델이 참고 사진 대신 '흔한 화장'을 그렸다:
# 화장 없는 사진을 참고로 넣어도 빨간 입술 · 아이라인 · 진한 눈썹이 생기고, 초록 입술 참고에도 빨간 입술 (2026-10-08 ref_follow_check.py).
# 모델이 받는 사진 순서대로 부른다 — image 1 = 얼굴(다시 그릴 사진), image 2 = 참고 사진 (Flux2KleinInpaintPipeline: [image, image_reference]).
# 눈썹도 칠할 영역에 있어서(#371) 참고 사진에 눈썹 화장이 있으면 따라 그린다
PROMPT = "Copy the makeup of image 2 onto the face in image 1."

# 눈마다: 윗눈꺼풀 · 아랫눈꺼풀 · 눈썹 아랫선 · 눈썹 윗선 · 바깥 눈꼬리 · 안쪽 눈꼬리
EYES = (
    ([33, 246, 161, 160, 159, 158, 157, 173, 133], [33, 7, 163, 144, 145, 153, 154, 155, 133], [46, 53, 52, 65, 55], [70, 63, 105, 66, 107], 33, 133),
    ([263, 466, 388, 387, 386, 385, 384, 398, 362], [263, 249, 390, 373, 374, 380, 381, 382, 362], [276, 283, 282, 295, 285], [300, 293, 334, 296, 336], 263, 362),
)
BROW_MARGIN = 0.06   # 눈썹 윗선 위로 이만큼(눈 폭 비율) 더 칠할 영역에 넣는다 — 윗선 점 위로 삐져나온 눈썹 털까지
# 볼 · 눈 밑 칠할 자리 (눈 폭 비율). 작게 잡았더니(볼 반지름 0.75 × 0.5 · 눈 밑 0.12) 참고 사진의 큰 블러셔 · 눈 밑 색이 작게 옮겨졌다 —
# 팀원 방식(사진 전체를 새로 그림)과 같은 사진으로 견줘 넓혔다 (2026-10-09). 더 넓히면(1.2 × 0.95) 코 옆까지 덮고 블러셔는 거의 안 늘었다
UNDER_EYE = 0.3                 # 아랫눈꺼풀에서 아래로
CHEEK_AT = (0.25, 1.15)         # 볼 가운데 — 눈 가운데에서 바깥으로 · 아래로
CHEEK_SIZE = (1.0, 0.8)         # 볼 타원 반지름 (가로 · 세로)
# 볼 블러셔는 크기 그대로 두고 테두리를 바깥(블러셔가 없는 쪽)으로 이어 옅게 — 타원 그대로 되붙이니 볼에 분홍 판을 붙인 것 같았고,
# 타원 안쪽부터 옅게 하니 블러셔가 작아져 더 눈에 띄었다 (2026-10-09 사용자: 크기는 그대로, 블러셔가 없는 쪽으로 그라데이션).
# 테두리 쪽은 모델 그림 대신 '원본 피부 + 고르게 편 블러셔 색' — 모델이 칠할 영역 끝(얼굴 옆선 쪽)을 스스로 옅게 그려 그 바깥에 이은 색과
# 사이에 옅은 줄이 생겼다 (같은 날 갸름한 얼굴 사진). 검사는 ref_follow_check.py
BLUSH_CORE = 0.5                # 볼 타원 가운데에서 반지름의 이만큼까지는 모델 그림 그대로, 테두리까지 원본 피부 + 고른 색으로 넘어간다
UNDER_HOLD = 0.15               # 눈 밑도 아랫눈꺼풀에서 이만큼까지 모델 그림, UNDER_EYE 까지 넘어간다 (볼만 하면 눈 밑 칠할 자리 아랫변이 띠로 남았다)
RIM = 0.15                      # 칠할 영역 끝(얼굴 옆선 쪽) 앞 이만큼에서도 넘어간다
SPREAD_REACH = 0.5              # 고른 색은 볼 · 눈 밑 테두리에서 이만큼 바깥까지 옅어지며 이어진다
SPREAD_BLUR = 0.2               # 그린 색을 이만큼 둘레에서 고르게 모은다 (털 · 잡티 무늬는 안 옮기고 색만)
FACE_EDGE = 0.12                # 얼굴 윤곽 · 눈 · 입술 앞에서 이만큼에 걸쳐 멈춘다 (머리카락 · 눈동자에 색이 번지지 않게)
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
# 벌린 입 안 (입술 안쪽 선) — 되붙일 때 뺀다(원본 그대로). 입술 바깥 선 안을 다 칠해 벌린 입의 이까지 빨갛게 덮였다 (2026-10-09 사용자).
# 모델이 칠할 영역에서까지 빼니 얇은 입술 띠를 덜 칠해 입술 색이 옅게 옮겨져서, 모델에게는 전처럼 입 안까지 준다. 다물면 넓이가 거의 0
MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

if not LANDMARKER_PATH.exists():
    LANDMARKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(LANDMARKER_URL, LANDMARKER_PATH)
landmarker = FaceLandmarker.create_from_options(FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(LANDMARKER_PATH)), num_faces=1))



def prompt_embeds():
    """지시문 해석 결과 — 저장해 둔 것이 같은 지시문 · 모델이면 그대로, 아니면 글 해석 부품만 그래픽카드에 올려 한 번 돌리고 내린다"""
    if EMBEDS_PATH.exists():
        saved = torch.load(EMBEDS_PATH)
        if saved.get("prompt") == PROMPT and saved.get("model") == MODEL_ID:
            return saved["embeds"]
    print("지시문 해석 (한 번만) ...")
    from transformers import AutoModelForCausalLM
    # device_map="cuda": 파일에서 그래픽카드로 바로 — PC 메모리에 7.5GB 를 통째로 올리지 않는다
    te = AutoModelForCausalLM.from_pretrained(MODEL_ID, subfolder="text_encoder", dtype=torch.bfloat16, device_map="cuda")
    enc = Flux2KleinInpaintPipeline.from_pretrained(MODEL_ID, text_encoder=te, transformer=None, vae=None, torch_dtype=torch.bfloat16)
    with torch.no_grad():
        embeds, _ = enc.encode_prompt(prompt=PROMPT, device="cuda")
    embeds = embeds.to(torch.bfloat16).cpu()
    del enc, te
    gc.collect()
    torch.cuda.empty_cache()
    EMBEDS_PATH.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"prompt": PROMPT, "model": MODEL_ID, "embeds": embeds}, EMBEDS_PATH)
    return embeds


_t0 = time.perf_counter()
EMBEDS = prompt_embeds().to("cuda", torch.bfloat16)
print(f"Loading {MODEL_ID} (bf16, 그리는 부품만 그래픽카드에 통째로) ...")
pipe = Flux2KleinInpaintPipeline.from_pretrained(MODEL_ID, text_encoder=None, tokenizer=None, torch_dtype=torch.bfloat16).to("cuda")
if LORA:
    try:
        pipe.load_lora_weights(LORA)
        print(f"[lora] loaded {LORA}", flush=True)
    except Exception as e:   # 부품을 못 끼워도(peft 없음 · 파일 깨짐 등) 서비스는 klein 그대로 — 배포가 이 줄을 보고 빨갛게 알린다
        print(f"[lora] failed {type(e).__name__}: {e}", flush=True)
        try:
            pipe.unload_lora_weights()
        except Exception:
            pass
        LORA = ""
else:
    print("[lora] off", flush=True)
print(f"Loaded in {time.perf_counter() - _t0:.1f}s · VRAM {torch.cuda.memory_allocated() / 2**30:.1f}GB. Launching Gradio UI...")


def landmarks(pil):
    """얼굴 점 478개 (픽셀) — 못 찾으면 None"""
    r = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(pil.convert("RGB")).copy()))
    if not r.face_landmarks:
        return None
    w, h = pil.size
    return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]])


def face_square(pil, lm):
    """얼굴 점 상자 둘레 정사각형 (left, top, side) — 사진 안으로 맞춘다"""
    w, h = pil.size
    x0, y0 = lm.min(axis=0)
    x1, y1 = lm.max(axis=0)
    side = int(min(max(x1 - x0, y1 - y0) * FACE_MARGIN, w, h))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(round(min(max(cx - side / 2, 0), w - side)))
    top = int(round(min(max(cy - side / 2, 0), h - side)))
    return left, top, side


def eye_hull(lm, eye, under=True):
    """눈 하나의 칠할 자리 점들: 눈두덩 ~ 눈썹(털 자리까지) · 꼬리 자리, under 면 눈 밑까지 (볼록 껍질로 칠한다)"""
    up, lo, brow, brow_up, outer, inner = eye
    o, i0 = lm[outer], lm[inner]
    ew = float(np.linalg.norm(o - i0))
    pts = [lm[k] for k in up + lo + brow] + [lm[k] + np.array([0, -BROW_MARGIN * ew]) for k in brow_up]
    pts.append(o + (o - i0) / ew * 0.45 * ew + np.array([0, -0.15 * ew]))   # 꼬리 자리
    if under:
        pts += [lm[k] + np.array([0, UNDER_EYE * ew]) for k in lo]         # 눈 밑
    arr = np.array(pts)
    from scipy.spatial import ConvexHull
    return [tuple(p) for p in arr[ConvexHull(arr).vertices]]


def cheek_ellipse(lm, eye):
    """볼 타원 상자 (왼 · 위 · 오른 · 아래) · 그 눈 폭"""
    *_, outer, inner = eye
    o, i0 = lm[outer], lm[inner]
    ew = float(np.linalg.norm(o - i0))
    c = (o + i0) / 2 + (o - i0) / ew * CHEEK_AT[0] * ew + np.array([0, CHEEK_AT[1] * ew])
    rx, ry = CHEEK_SIZE[0] * ew, CHEEK_SIZE[1] * ew
    return [c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], ew


def face_oval(lm, size, shrink=1.0):
    """얼굴 윤곽(가운데 쪽으로 shrink 만큼 줄인) 안 · 눈 안쪽 빼기 전"""
    m = Image.new("L", (size, size), 0)
    oval = np.array([lm[k] for k in FACE_OVAL])
    c = oval.mean(axis=0)
    ImageDraw.Draw(m).polygon([tuple(c + (p - c) * shrink) for p in oval], fill=255)
    return m


def holes(lm, size, mouth=True):
    """칠해도 되는 곳 — 얼굴 윤곽보다 조금 안쪽(OVAL_KEEP)에서 눈 안쪽 (· mouth 면 벌린 입 안) 을 뺀 곳 (0 / 255).
    윤곽 끝까지 칠하게 했더니 얼굴 · 머리카락 경계를 다시 그려 볼 가이드에 옆선 띠가 잡혔다"""
    keep = face_oval(lm, size, OVAL_KEEP)
    kd = ImageDraw.Draw(keep)
    for up, lo, *_ in EYES:
        kd.polygon([tuple(lm[k]) for k in up + lo[::-1]], fill=0)
    if mouth:
        kd.polygon([tuple(lm[k]) for k in MOUTH], fill=0)
    return keep


def makeup_mask(lm, size):
    """화장 칠할 영역 (흰색 = 다시 그림): 눈두덩 ~ 눈썹(털 자리까지) · 꼬리 자리 · 볼 · 입술. 눈 안쪽은 빼고, 얼굴 윤곽 밖(머리카락)도 뺀다.
    눈썹은 아랫선까지만 넣었더니 털 자리를 다시 그리지 못해 정답사진의 눈썹이 맨얼굴 그대로였다 (#371)"""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    for eye in EYES:
        d.polygon(eye_hull(lm, eye), fill=255)
        d.ellipse(cheek_ellipse(lm, eye)[0], fill=255)
    d.polygon([tuple(lm[k]) for k in LIPS], fill=255)
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    keep = holes(lm, size, mouth=False).filter(ImageFilter.GaussianBlur(1.5))
    return Image.fromarray((np.asarray(m, np.float32) * np.asarray(keep, np.float32) / 255).astype(np.uint8))


def smooth(u):
    u = np.clip(u, 0, 1)
    return u * u * (3 - 2 * u)


def blend_fields(lm, result, face, size):
    """되붙이는 법 (모두 size × size): (모델 그림을 쓸 정도 0 ~ 1, 고르게 편 색 차이 × 3, 그 색을 더할 정도 0 ~ 1).
    눈두덩 · 눈썹 · 입술은 칠할 영역 그대로 모델 그림. 볼 · 눈 밑은 가운데 쪽만 모델 그림이고 테두리로 갈수록 '원본 피부 + 고른 색' 으로,
    그 색은 칠할 영역 밖으로도 이어 옅어진다 — 블러셔 크기는 그대로, 끊긴 테두리 · 줄은 없다"""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    lids = Image.new("L", (size, size), 0)
    paint = Image.new("L", (size, size), 0)
    soft, ews = np.zeros((size, size), np.float32), []
    for eye in EYES:
        ImageDraw.Draw(lids).polygon(eye_hull(lm, eye, under=False), fill=255)
        ImageDraw.Draw(paint).polygon(eye_hull(lm, eye), fill=255)
        box, ew = cheek_ellipse(lm, eye)
        ews.append(ew)
        ImageDraw.Draw(paint).ellipse(box, fill=255)
        cx, cy, rx, ry = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, (box[2] - box[0]) / 2, (box[3] - box[1]) / 2
        soft = np.maximum(soft, 1 - smooth((np.hypot((xx - cx) / rx, (yy - cy) / ry) - BLUSH_CORE) / (1 - BLUSH_CORE)))
        lid = Image.new("L", (size, size), 255)
        ImageDraw.Draw(lid).line([tuple(lm[k]) for k in eye[1]], fill=0, width=1)
        below = cv2.distanceTransform(np.asarray(lid), cv2.DIST_L2, 5)     # 아랫눈꺼풀 선에서 떨어진 거리
        soft = np.maximum(soft, 1 - smooth((below - UNDER_HOLD * ew) / ((UNDER_EYE - UNDER_HOLD) * ew)))
    ew = float(np.mean(ews))
    hard = lids.copy()
    ImageDraw.Draw(hard).polygon([tuple(lm[k]) for k in LIPS], fill=255)
    hard = np.asarray(hard.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4)), np.float32) / 255
    inside = np.asarray(holes(lm, size)) > 0
    keep = np.asarray(Image.fromarray(inside.astype(np.uint8) * 255).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255
    soft = soft * smooth(cv2.distanceTransform(inside.astype(np.uint8), cv2.DIST_L2, 5) / (RIM * ew))
    alpha = np.maximum(hard, soft) * keep
    # 고른 색: 볼 · 눈 밑(눈두덩 · 눈썹 빼고) 안에서 그린 그림이 맨얼굴과 다른 만큼을 SPREAD_BLUR 둘레 평균으로 — 밖으로도 이어진다
    src = (np.asarray(paint) > 0) & ~(np.asarray(lids) > 0) & inside
    src = cv2.erode(src.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    diff = np.asarray(result.convert("RGB"), np.float32) - np.asarray(face, np.float32)
    num = cv2.GaussianBlur(diff * src[..., None], (0, 0), SPREAD_BLUR * ew)
    den = cv2.GaussianBlur(src.astype(np.float32), (0, 0), SPREAD_BLUR * ew)
    color = num / np.maximum(den, 1e-3)[..., None]
    stop = face_oval(lm, size)
    sd = ImageDraw.Draw(stop)
    for up, lo, *_ in EYES:
        sd.polygon([tuple(lm[k]) for k in up + lo[::-1]], fill=0)
    sd.polygon([tuple(lm[k]) for k in LIPS], fill=0)
    face_in = cv2.distanceTransform((np.asarray(stop) > 0).astype(np.uint8), cv2.DIST_L2, 5)
    away = cv2.distanceTransform((~src).astype(np.uint8), cv2.DIST_L2, 5)
    weight = (1 - smooth(away / (SPREAD_REACH * ew))) * smooth(face_in / (FACE_EDGE * ew)) * smooth(den / 0.05)
    return alpha, color, weight


def paste_back(original, result, box, alpha=None, color=None, weight=None):
    """그린 얼굴 정사각형을 원본에 되붙인다 (blend_fields). alpha(모델 그림을 쓸 정도)를 주면 그 밖은 원본 픽셀 그대로 —
    모델은 16px 칸 단위로 그려서 칠할 영역에서 뺀 눈 안쪽까지 다시 그렸고, 참고 사진의 눈꺼풀 선이 눈동자에 비쳤다 (2026-10-09).
    color · weight 를 주면 모델 그림을 안 쓴 만큼 그 자리에 고른 색을 더한다"""
    left, top, side = box
    patch = np.asarray(result.convert("RGB").resize((side, side), Image.LANCZOS)).astype(np.float32)
    base = np.asarray(original.convert("RGB")).astype(np.float32).copy()
    f = max(1, int(side * FEATHER))
    ramp = np.clip(np.minimum(np.arange(side), np.arange(side)[::-1]) / f, 0, 1)
    edge = np.minimum.outer(ramp, ramp)[..., None]
    up = lambda x: cv2.resize(x, (side, side), interpolation=cv2.INTER_LINEAR)
    a = edge * (up(alpha)[..., None] if alpha is not None else 1)
    region = base[top:top + side, left:left + side]
    out = region + a * (patch - region)
    if color is not None:
        out += (1 - a) * edge * up(weight)[..., None] * up(color)
    base[top:top + side, left:left + side] = out
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def warp_to(ref, rlm, lm, size):
    """참고 사진을 얼굴 점으로 내 얼굴 모양(lm, size × size 정사각형 좌표)에 맞춰 편다 — 얼굴 점 삼각형마다 따로, 얼굴 밖은 회색.
    참고 사진의 눈 모양 · 윗라인 각도가 내 눈과 달라서, 모델이 참고 사진 눈에 맞춰 라인 · 속눈썹을 그리면 내 눈꺼풀이 그 안쪽에
    흐리게 겹쳐 보였다 (2026-10-09 카리나 사진, 사용자 제안: 참고 사진 눈 윗라인을 내 눈에 맞추기)"""
    src = np.asarray(ref.convert("RGB"))
    dst = np.full((size, size, 3), 128, np.uint8)
    P, Q = rlm[:468].astype(np.float32), lm[:468].astype(np.float32)
    for t in Delaunay(Q).simplices:
        q = Q[t]
        x, y, w, h = cv2.boundingRect(q)
        x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, size), min(y + h, size)
        if x1 <= x0 or y1 <= y0:
            continue
        a = cv2.getAffineTransform(P[t], (q - np.array([x0, y0], np.float32)).astype(np.float32))
        patch = cv2.warpAffine(src, a, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        inside = np.zeros((y1 - y0, x1 - x0), np.uint8)
        cv2.fillConvexPoly(inside, np.round(q - [x0, y0]).astype(np.int32), 1)
        dst[y0:y1, x0:x1][inside > 0] = patch[inside > 0]
    return Image.fromarray(dst)


# 그리기는 메인 스레드에서만 — 다른 스레드에서 그리면 두 번째 그림부터 서버가 오류 없이 죽었다 (윈도우 · 모델 부분씩 올리기,
# 스레드 하나로 모아도 같음 · 메인 스레드면 몇 번이든 괜찮음 — 원인 미확인). 웹 서버는 뒤 스레드에서 돌며 요청만 넘긴다
JOBS: "queue.Queue[tuple[Future, tuple]]" = queue.Queue()


def run(id_image, makeup_image, steps=4, strength=0.85, keep_size=True, seed=1234):
    if id_image is None or makeup_image is None:
        raise gr.Error("얼굴 사진과 참고 화장 사진을 둘 다 넣으세요.")
    job: Future = Future()
    JOBS.put((job, (id_image, makeup_image, steps, strength, keep_size, seed)))
    return job.result()


def serve_jobs():
    """메인 스레드에서 그리기 요청을 하나씩 처리한다"""
    while True:
        job, args = JOBS.get()
        try:
            job.set_result(_run(*args))
        except Exception as e:  # gr.Error 도 그대로 페이지에 전달
            job.set_exception(e)


def _run(id_image, makeup_image, steps, strength, keep_size, seed):
    original = id_image.convert("RGB")
    lm = landmarks(original)
    if lm is None:
        raise gr.Error("얼굴 사진에서 얼굴을 못 찾았어요.")
    box = face_square(original, lm)
    left, top, side = box
    face = original.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    lm_sq = (lm - [left, top]) * (SIZE / side)
    mask = makeup_mask(lm_sq, SIZE)

    ref = makeup_image.convert("RGB")
    rlm = landmarks(ref)
    if rlm is not None:
        ref = warp_to(ref, rlm, lm_sq, SIZE)    # 내 얼굴 모양으로 편 참고 사진 (얼굴을 못 찾으면 그대로)
    ref = ref.resize((REF_SIZE, REF_SIZE), Image.LANCZOS)

    torch.cuda.reset_peak_memory_stats()
    t0 = time.perf_counter()
    gen = torch.Generator("cpu").manual_seed(int(seed)) if seed is not None and seed >= 0 else None
    out = pipe(prompt_embeds=EMBEDS, image=face, mask_image=mask, image_reference=ref, height=SIZE, width=SIZE,
               strength=float(strength), guidance_scale=1.0, num_inference_steps=int(steps), generator=gen).images[0]
    dt = time.perf_counter() - t0
    vram = torch.cuda.max_memory_allocated() / 2**30
    result = paste_back(original, out, box, *blend_fields(lm_sq, out, face, SIZE))
    # Gradio 임시 폴더 안에 직접 무손실로 — 거기 있는 파일은 Gradio 가 다시 압축하지 않고 그대로 보내고, 2분 뒤 지우기(delete_cache)에도 든다
    folder = Path(get_upload_folder()) / uuid.uuid4().hex
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "result.webp"
    result.save(path, format="WEBP", lossless=True, quality=LOSSLESS_EFFORT, method=2)
    status = (f"{dt:.1f}초 (FLUX.2 klein 4B 영역 다시 그리기, steps={int(steps)}, 강도={float(strength):.2f}, 얼굴 {side}px → {SIZE}) · "
              f"VRAM peak {vram:.1f}GB · 원본 {original.size[0]}×{original.size[1]} 유지" + (f" · LoRA {Path(LORA).stem}" if LORA else ""))
    return str(path), status


demo = gr.Interface(
    fn=run,
    inputs=[
        gr.Image(type="pil", label="얼굴 사진 (id_image)"),
        gr.Image(type="pil", label="참고 화장 사진 (makeup_image)"),
        gr.Slider(minimum=2, maximum=12, value=4, step=1, label="steps (klein 4B 증류 모델 — 4 권장)"),
        gr.Slider(minimum=0.5, maximum=1.0, value=0.85, step=0.05, label="강도 (칠할 영역을 얼마나 다시 그릴지 — 0.7 이면 seed 에 따라 입술 등을 빼먹었다)"),
        gr.Checkbox(value=True, label="원본 크기 유지 (얼굴만 잘라 그리고 원본에 되붙이기)"),
        gr.Number(value=1234, precision=0, label="seed (같은 값이면 같은 잡음에서 그림 · -1 이면 매번 무작위)"),
    ],
    outputs=[gr.Image(type="pil", label="결과"), gr.Textbox(label="측정")],
    title="FLUX.2 [klein] 4B 화장 입히기 (영역 다시 그리기)",
    api_name="predict",   # 페이지가 부르는 이름 — Stable-Makeup 서버(Gradio 5)와 같게. Gradio 6 은 기본이 함수 이름(run)
    delete_cache=(60, 120),   # 1분마다 2분 지난 임시 파일(받은 사진 · 만든 그림)을 지운다 — 페이지가 받아 갈 시간은 충분
)

if __name__ == "__main__":
    demo.queue().launch(server_name="127.0.0.1", server_port=7861, share=False, prevent_thread_lock=True)
    serve_jobs()
