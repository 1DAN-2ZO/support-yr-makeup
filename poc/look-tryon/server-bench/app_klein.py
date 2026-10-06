"""FLUX.2 [klein] 4B 화장 입히기 데모 서버 (당화응 ② 2026-10-06) — makeup-extract-probe 페이지의 ③ 'AI 모델' 에서 고른다.

Stable-Makeup(app_demo.py, 7860)과 같은 REST 모양: run(id_image, makeup_image, steps, strength, keep_size, seed).
klein 4B 는 Apache-2.0 (상업 사용 가능). 9B 는 비상업이라 쓰지 않는다.

그냥 '사진 두 장 + 지시' 로 그리면 화장은 옮겨 오지만 참고 인물의 피부색 · 얼굴형까지 따라가 다른 사람이 됐다 (지시문으로 못 막음).
그래서 영역 다시 그리기(Flux2KleinInpaintPipeline)로 — 얼굴 점으로 눈두덩(섀도 · 라이너 · 꼬리) · 볼 · 입술만 칠할 영역으로 주고
나머지(얼굴형 · 코 · 피부 · 머리 · 배경)는 원본 그대로 둔다. 눈 안쪽(흰자 · 눈동자)도 빼야 눈 모양(쌍꺼풀 · 크기)이 안 바뀐다.

실행 (모델을 받은 HF 캐시를 HF_HOME 으로, RTX 3060 12GB 에서 bf16 + 부분씩 올리기, 한 장 약 22초 · 처음 한 번 약 60초):

    set HF_HOME=D:\\hf-cache
    conda run -n flux2 python app_klein.py

Stable-Makeup 서버와 같이 켜면 그래픽카드 메모리(12GB)가 모자라다 — 하나씩 켠다.
"""
import time
import urllib.request
import queue
from concurrent.futures import Future
from pathlib import Path

import gradio as gr
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFilter

import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from diffusers import Flux2KleinInpaintPipeline

MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
LANDMARKER_PATH = Path.home() / ".cache" / "nudy" / "face_landmarker.task"
SIZE = 768          # 얼굴 정사각형을 이 크기로 그린다
REF_SIZE = 512      # 참고 사진 크기 (작아도 화장은 옮겨 오고 더 빠르다)
FACE_MARGIN = 1.3   # 얼굴 점 상자 긴 변의 몇 배로 자를지 (이마 꼭대기 ~ 턱이 이미 들어 있다)
FEATHER = 0.08      # 원본에 되붙일 때 가장자리를 섞는 폭
PROMPT = ("Apply the makeup from the reference image (eyeshadow colors and placement, eyeliner, blush, lip color) to this woman's face. "
          "Keep her own skin tone, eye shape and identity.")

EYES = (
    ([33, 246, 161, 160, 159, 158, 157, 173, 133], [33, 7, 163, 144, 145, 153, 154, 155, 133], [46, 53, 52, 65, 55], 33, 133),
    ([263, 466, 388, 387, 386, 385, 384, 398, 362], [263, 249, 390, 373, 374, 380, 381, 382, 362], [276, 283, 282, 295, 285], 263, 362),
)
LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

if not LANDMARKER_PATH.exists():
    LANDMARKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(LANDMARKER_URL, LANDMARKER_PATH)
landmarker = FaceLandmarker.create_from_options(FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(LANDMARKER_PATH)), num_faces=1))

print(f"Loading {MODEL_ID} (bf16, model CPU offload) ...")
_t0 = time.perf_counter()
pipe = Flux2KleinInpaintPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()
print(f"Loaded in {time.perf_counter() - _t0:.1f}s. Launching Gradio UI...")


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


def makeup_mask(lm, size):
    """화장 칠할 영역 (흰색 = 다시 그림): 눈두덩 ~ 눈썹 아래 · 꼬리 자리 · 볼 · 입술. 눈 안쪽은 빼고, 얼굴 윤곽 밖(머리카락)도 뺀다"""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    from scipy.spatial import ConvexHull
    for up, lo, brow, outer, inner in EYES:
        o, i0 = lm[outer], lm[inner]
        ew = float(np.linalg.norm(o - i0))
        out_dir = (o - i0) / ew
        pts = [lm[k] for k in up + lo + brow]
        pts.append(o + out_dir * 0.45 * ew + np.array([0, -0.15 * ew]))   # 꼬리 자리
        pts += [lm[k] + np.array([0, 0.12 * ew]) for k in lo]              # 아래 눈두덩 조금
        arr = np.array(pts)
        d.polygon([tuple(p) for p in arr[ConvexHull(arr).vertices]], fill=255)
        c = (o + i0) / 2 + out_dir * 0.35 * ew + np.array([0, 1.25 * ew])  # 볼
        d.ellipse([c[0] - 0.75 * ew, c[1] - 0.5 * ew, c[0] + 0.75 * ew, c[1] + 0.5 * ew], fill=255)
    d.polygon([tuple(lm[k]) for k in LIPS], fill=255)
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    keep = Image.new("L", (size, size), 0)
    kd = ImageDraw.Draw(keep)
    kd.polygon([tuple(lm[k]) for k in FACE_OVAL], fill=255)
    for up, lo, *_ in EYES:
        kd.polygon([tuple(lm[k]) for k in up + lo[::-1]], fill=0)
    keep = keep.filter(ImageFilter.GaussianBlur(1.5))
    return Image.fromarray((np.asarray(m, np.float32) * np.asarray(keep, np.float32) / 255).astype(np.uint8))


def paste_back(original, result, box):
    left, top, side = box
    patch = np.asarray(result.convert("RGB").resize((side, side), Image.LANCZOS)).astype(np.float32)
    base = np.asarray(original.convert("RGB")).astype(np.float32).copy()
    f = max(1, int(side * FEATHER))
    ramp = np.clip(np.minimum(np.arange(side), np.arange(side)[::-1]) / f, 0, 1)
    alpha = np.minimum.outer(ramp, ramp)[..., None]
    region = base[top:top + side, left:left + side]
    base[top:top + side, left:left + side] = region * (1 - alpha) + patch * alpha
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


# 그리기는 메인 스레드에서만 — 다른 스레드에서 그리면 두 번째 그림부터 서버가 오류 없이 죽었다 (윈도우 · 모델 부분씩 올리기,
# 스레드 하나로 모아도 같음 · 메인 스레드면 몇 번이든 괜찮음 — 원인 미확인). 웹 서버는 뒤 스레드에서 돌며 요청만 넘긴다
JOBS: "queue.Queue[tuple[Future, tuple]]" = queue.Queue()


def run(id_image, makeup_image, steps=4, strength=0.7, keep_size=True, seed=1234):
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
    mask = makeup_mask((lm - [left, top]) * (SIZE / side), SIZE)

    ref = makeup_image.convert("RGB")
    rlm = landmarks(ref)
    if rlm is not None:
        rl, rt, rs = face_square(ref, rlm)
        ref = ref.crop((rl, rt, rl + rs, rt + rs))
    ref = ref.resize((REF_SIZE, REF_SIZE), Image.LANCZOS)

    torch.cuda.reset_peak_memory_stats()
    t0 = time.perf_counter()
    gen = torch.Generator("cpu").manual_seed(int(seed)) if seed is not None and seed >= 0 else None
    out = pipe(prompt=PROMPT, image=face, mask_image=mask, image_reference=ref, height=SIZE, width=SIZE,
               strength=float(strength), guidance_scale=1.0, num_inference_steps=int(steps), generator=gen).images[0]
    dt = time.perf_counter() - t0
    vram = torch.cuda.max_memory_allocated() / 2**30
    result = paste_back(original, out, box)
    status = (f"{dt:.1f}초 (FLUX.2 klein 4B 영역 다시 그리기, steps={int(steps)}, 강도={float(strength):.2f}, 얼굴 {side}px → {SIZE}) · "
              f"VRAM peak {vram:.1f}GB · 원본 {original.size[0]}×{original.size[1]} 유지")
    return result, status


demo = gr.Interface(
    fn=run,
    inputs=[
        gr.Image(type="pil", label="얼굴 사진 (id_image)"),
        gr.Image(type="pil", label="참고 화장 사진 (makeup_image)"),
        gr.Slider(minimum=2, maximum=12, value=4, step=1, label="steps (klein 4B 증류 모델 — 4 권장)"),
        gr.Slider(minimum=0.5, maximum=1.0, value=0.7, step=0.05, label="강도 (칠할 영역을 얼마나 다시 그릴지 — 0.7 자연스러움, 0.85 진함)"),
        gr.Checkbox(value=True, label="원본 크기 유지 (얼굴만 잘라 그리고 원본에 되붙이기)"),
        gr.Number(value=1234, precision=0, label="seed (같은 값이면 같은 잡음에서 그림 · -1 이면 매번 무작위)"),
    ],
    outputs=[gr.Image(type="pil", label="결과"), gr.Textbox(label="측정")],
    title="FLUX.2 [klein] 4B 화장 입히기 (영역 다시 그리기)",
    api_name="predict",   # 페이지가 부르는 이름 — Stable-Makeup 서버(Gradio 5)와 같게. Gradio 6 은 기본이 함수 이름(run)
)

if __name__ == "__main__":
    demo.queue().launch(server_name="127.0.0.1", server_port=7861, share=False, prevent_thread_lock=True)
    serve_jobs()
