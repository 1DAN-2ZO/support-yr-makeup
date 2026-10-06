"""Interactive Gradio demo for the Stable-Makeup candidate (the deployable one — Apache-2.0,
meets the 3s target at fp16 + reduced steps per bench.py's measured results).

Run inside the makeup-bench-sm conda env, from this directory:

    conda run -n makeup-bench-sm python app_demo.py

Then open http://127.0.0.1:7860 in a browser. Upload a frontal face photo (id_image) and a
makeup reference photo (makeup_image), pick steps/guidance, and see the result + timing live.

Loading logic mirrors bench.py's bench_stable_makeup() — same fp16 weights, same
SD15_SNAPSHOT env var, same vendored diffusers/pipeline_sd15/spiga_draw modules from the
stable_makeup/ checkout (added to sys.path below), same CLIP image-encoder id swap
(openai/clip-vit-large-patch14 instead of the repo's undocumented local `image_encoder_l`).
"""
import os
import sys
import time
from pathlib import Path

import cv2
import gradio as gr
import numpy as np
import torch
from PIL import Image

SERVER_BENCH_DIR = Path(__file__).resolve().parent
SM_DIR = SERVER_BENCH_DIR / "stable_makeup"

DEFAULT_SD15_SNAPSHOT = (
    Path.home() / ".cache/huggingface/hub/models--stable-diffusion-v1-5--stable-diffusion-v1-5"
    / "snapshots" / "451f4fe16113bff5a5d2269ed5ad43b0592e9a14"
)

os.chdir(SM_DIR)  # repo code uses relative paths like "./models/..."
sys.path.insert(0, str(SM_DIR))

from diffusers import UNet2DConditionModel as OriginalUNet2DConditionModel  # noqa: E402  (vendored copy in stable_makeup/diffusers)
from pipeline_sd15 import StableDiffusionControlNetPipeline  # noqa: E402
from diffusers import DDIMScheduler, ControlNetModel  # noqa: E402
from detail_encoder.encoder_plus import detail_encoder  # noqa: E402
from spiga_draw import spiga_process, spiga_segmentation  # noqa: E402
from spiga.inference.config import ModelConfig  # noqa: E402
from spiga.inference.framework import SPIGAFramework  # noqa: E402
from facelib import FaceDetector  # noqa: E402

DTYPE = torch.float16  # deployable setting per bench.py results (fp32 is ~2.4x slower, same quality)
SD15_SNAPSHOT = os.environ.get("SD15_SNAPSHOT", str(DEFAULT_SD15_SNAPSHOT))

print(f"Loading Stable-Makeup pipeline (fp16) from {SD15_SNAPSHOT} ...")
_t0 = time.perf_counter()

processor = SPIGAFramework(ModelConfig("300wpublic"))
detector = FaceDetector(weight_path="./models/mobilenet0.25_Final.pth")

Unet = OriginalUNet2DConditionModel.from_pretrained(SD15_SNAPSHOT, subfolder="unet").to("cuda", DTYPE)
id_encoder = ControlNetModel.from_unet(Unet)
pose_encoder = ControlNetModel.from_unet(Unet)
makeup_encoder = detail_encoder(Unet, "openai/clip-vit-large-patch14", "cuda", dtype=DTYPE)

makeup_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model.bin", map_location="cuda"), strict=False)
id_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model_1.bin", map_location="cuda"), strict=False)
pose_encoder.load_state_dict(torch.load("./models/stablemakeup/pytorch_model_2.bin", map_location="cuda"), strict=False)
id_encoder.to("cuda", DTYPE)
pose_encoder.to("cuda", DTYPE)
makeup_encoder.to("cuda", DTYPE)

pipe = StableDiffusionControlNetPipeline.from_pretrained(
    SD15_SNAPSHOT,
    safety_checker=None,
    unet=Unet,
    controlnet=[id_encoder, pose_encoder],
    torch_dtype=DTYPE,
).to("cuda")
pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config)

print(f"Loaded in {time.perf_counter() - _t0:.1f}s. Launching Gradio UI...")


def get_draw(pil_img, size):
    spigas = spiga_process(pil_img, detector)
    if spigas is False:
        w, h = pil_img.size
        return Image.new("RGB", (w, h), color=(0, 0, 0))
    return spiga_segmentation(spigas, size=size)


# 원본 크기 유지 (2026-10-06 당화응 ②): 512 정사각형으로 늘려 넣으면 얼굴이 찌그러지고 결과도 512 로 나온다.
# 얼굴 둘레(머리 · 턱 포함)를 정사각형으로 잘라 넣고, 결과를 그 자리에 되돌려 붙인다 — 경계는 부드럽게 섞는다.
FACE_MARGIN = 1.9    # 얼굴 상자(눈썹 ~ 턱) 긴 변의 몇 배로 자를지
FACE_UP = 0.08       # 이마 · 머리 쪽으로 올리는 정도 (얼굴 상자 높이 비율)
FEATHER = 0.08       # 붙일 때 가장자리를 섞는 폭 (자른 변 비율)


def face_square(pil):
    """얼굴 둘레 정사각형 (left, top, side) — 사진 안으로 맞춘다. 얼굴을 못 찾으면 None"""
    bgr = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
    _, boxes, _, _ = detector.detect_align(bgr)
    boxes = boxes.cpu().numpy() if hasattr(boxes, "cpu") else np.asarray(boxes)
    if len(boxes) == 0:
        return None
    x0, y0, x1, y1 = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))[:4]
    w, h = pil.size
    side = min(max(x1 - x0, y1 - y0) * FACE_MARGIN, w, h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - FACE_UP * (y1 - y0)
    left = int(round(min(max(cx - side / 2, 0), w - side)))
    top = int(round(min(max(cy - side / 2, 0), h - side)))
    return left, top, int(side)


def paste_back(original, result512, box):
    """결과(512)를 자른 크기로 되돌려 원본 같은 자리에 붙인다 — 가장자리 FEATHER 만큼 원본과 섞음"""
    left, top, side = box
    patch = np.asarray(result512.convert("RGB").resize((side, side), Image.LANCZOS)).astype(np.float32)
    base = np.asarray(original.convert("RGB")).astype(np.float32).copy()
    f = max(1, int(side * FEATHER))
    ramp = np.clip(np.minimum(np.arange(side), np.arange(side)[::-1]) / f, 0, 1)
    alpha = np.minimum.outer(ramp, ramp)[..., None]
    region = base[top:top + side, left:left + side]
    base[top:top + side, left:left + side] = region * (1 - alpha) + patch * alpha
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def run(id_image, makeup_image, steps, guidance_scale, keep_size=True):
    if id_image is None or makeup_image is None:
        raise gr.Error("얼굴 사진(id_image)과 룩 참조 사진(makeup_image)을 둘 다 업로드하세요.")

    original = id_image.convert("RGB")
    makeup_image = makeup_image.convert("RGB")
    box = face_square(original) if keep_size else None
    if box:
        left, top, side = box
        id_image = original.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)
    else:
        id_image = original.resize((512, 512))
    mbox = face_square(makeup_image) if keep_size else None
    if mbox:
        ml, mt, ms = mbox
        makeup_image = makeup_image.crop((ml, mt, ml + ms, mt + ms))
    makeup_image = makeup_image.resize((512, 512), Image.LANCZOS)
    pose_image = get_draw(id_image, size=512)

    torch.cuda.synchronize()
    t0 = time.perf_counter()
    result_img = makeup_encoder.generate(
        id_image=[id_image, pose_image],
        makeup_image=makeup_image,
        pipe=pipe,
        guidance_scale=guidance_scale,
        num_inference_steps=int(steps),
    )
    torch.cuda.synchronize()
    dt = time.perf_counter() - t0
    vram = torch.cuda.max_memory_allocated() / (1024 ** 2)

    status = f"{dt:.2f}초 (steps={int(steps)}, guidance={guidance_scale}, fp16, 512×512) · VRAM peak {vram:.0f}MB · 목표: 3초 이내"
    if box:
        result_img = paste_back(original, result_img, box)
        status += f" · 원본 {original.size[0]}×{original.size[1]} 유지 (얼굴 {box[2]}px 정사각형만 바꿈)"
    elif keep_size:
        status += " · 얼굴을 못 찾아 512 정사각형으로 늘려 넣음"
    return result_img, status


id_examples = sorted((SM_DIR / "test_imgs/id").glob("*.jpg"))
makeup_examples = sorted((SM_DIR / "test_imgs/makeup").glob("*.jpg"))
examples = [[str(id_examples[0]), str(makeup_examples[0]), 8, 1.6, True]] if id_examples and makeup_examples else None

demo = gr.Interface(
    fn=run,
    inputs=[
        gr.Image(type="pil", label="얼굴 사진 (id_image)"),
        gr.Image(type="pil", label="룩 참조 사진 (makeup_image)"),
        gr.Slider(minimum=4, maximum=30, value=8, step=1, label="DDIM steps (8 = 벤치마크 권장값, 2.55초 / 10 step은 3.15초로 3초 예산 초과)"),
        gr.Slider(minimum=1.01, maximum=5.0, value=1.6, step=0.05, label="makeup_guidance_scale (1.05~1.15 옅은 화장, 2+ 진한 화장)"),
        gr.Checkbox(value=True, label="원본 크기 유지 — 얼굴만 정사각형으로 잘라 입히고 원본에 다시 붙이기"),
    ],
    outputs=[
        gr.Image(type="pil", label="결과"),
        gr.Textbox(label="측정"),
    ],
    examples=examples,
    title="Stable-Makeup 서버 벤치마크 데모 (RTX 3060)",
    description=(
        "화면 2 '룩 얹어보기' 서버 화장 전이 후보(Apache-2.0, 상업 사용 가능) 실측용 데모. "
        "fp16 + 8 step(2.55초)이 3초 목표를 만족하는 벤치마크 설정(10 step은 3.15초로 초과)."
    ),
)

if __name__ == "__main__":
    demo.queue().launch(server_name="127.0.0.1", server_port=7860, share=False)
