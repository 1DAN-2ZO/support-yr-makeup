"""Stable-Makeup 상주 모델 서버 — makeup-bench-sm conda env 안에서만 돈다(#45, 별도 프로세스).
server/app/worker_stable_makeup.py가 이 서버로 HTTP 위임한다.

SPIGA 포즈 이미지는 source_path(mtime 포함)로 캐싱한다 — 같은 사진에 룩 여러 개를 얹을 때
SPIGA 랜드마크 추출을 세션당 1회만 하기 위함(#45 산출물 요구사항).

실행 (이 디렉터리에서):
    conda run -n makeup-bench-sm python model_server.py --port 8100

가중치·SD1.5 스냅샷 경로는 app_demo.py/bench.py와 동일 (README "재현 방법" 절 참고).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

SERVER_BENCH_DIR = Path(__file__).resolve().parent
SM_DIR = SERVER_BENCH_DIR / "stable_makeup"
RESULT_DIR = Path(os.environ.get("DHE_RESULT_DIR", "/tmp/danghwaeung/results"))

DEFAULT_SD15_SNAPSHOT = (
    Path.home() / ".cache/huggingface/hub/models--stable-diffusion-v1-5--stable-diffusion-v1-5"
    / "snapshots" / "451f4fe16113bff5a5d2269ed5ad43b0592e9a14"
)

os.chdir(SM_DIR)
sys.path.insert(0, str(SM_DIR))

from diffusers import UNet2DConditionModel as OriginalUNet2DConditionModel  # noqa: E402
from pipeline_sd15 import StableDiffusionControlNetPipeline  # noqa: E402
from diffusers import DDIMScheduler, ControlNetModel  # noqa: E402
from detail_encoder.encoder_plus import detail_encoder  # noqa: E402
from spiga_draw import spiga_process, spiga_segmentation  # noqa: E402
from spiga.inference.config import ModelConfig  # noqa: E402
from spiga.inference.framework import SPIGAFramework  # noqa: E402
from facelib import FaceDetector  # noqa: E402

DTYPE = torch.float16
SD15_SNAPSHOT = os.environ.get("SD15_SNAPSHOT", str(DEFAULT_SD15_SNAPSHOT))

print(f"모델 로딩 중... ({SD15_SNAPSHOT})")
processor = SPIGAFramework(ModelConfig("300wpublic"))
detector = FaceDetector(weight_path="./models/mobilenet0.25_Final.pth")
Unet = OriginalUNet2DConditionModel.from_pretrained(SD15_SNAPSHOT, subfolder="unet").to("cuda", DTYPE)
id_encoder = ControlNetModel.from_unet(Unet)
pose_encoder = ControlNetModel.from_unet(Unet)
makeup_encoder = detail_encoder(Unet, "openai/clip-vit-large-patch14", "cuda", dtype=DTYPE)
makeup_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model.bin", map_location="cuda"), strict=False
)
id_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model_1.bin", map_location="cuda"), strict=False
)
pose_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model_2.bin", map_location="cuda"), strict=False
)
id_encoder.to("cuda", DTYPE)
pose_encoder.to("cuda", DTYPE)
makeup_encoder.to("cuda", DTYPE)
pipe = StableDiffusionControlNetPipeline.from_pretrained(
    SD15_SNAPSHOT, safety_checker=None, unet=Unet, controlnet=[id_encoder, pose_encoder], torch_dtype=DTYPE,
).to("cuda")
pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config)
print("로딩 완료.")

_pose_cache: dict[str, tuple[float, Image.Image]] = {}


def _get_pose(source_path: str, id_image: Image.Image) -> Image.Image:
    mtime = os.path.getmtime(source_path)
    cached = _pose_cache.get(source_path)
    if cached and cached[0] == mtime:
        return cached[1]
    spigas = spiga_process(id_image, detector)
    pose = (
        spiga_segmentation(spigas, size=512)
        if spigas is not False
        else Image.new("RGB", id_image.size, (0, 0, 0))
    )
    _pose_cache[source_path] = (mtime, pose)
    return pose


class InferRequest(BaseModel):
    source_path: str
    ref_path: str
    steps: int = 8
    guidance_scale: float = 1.6


class InferResponse(BaseModel):
    result_url: str
    ms: int


app = FastAPI(title="stable-makeup-model-server")


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    if not os.path.exists(req.source_path):
        raise HTTPException(404, "source_path not found")
    if not os.path.exists(req.ref_path):
        raise HTTPException(404, "ref_path not found")

    id_image = Image.open(req.source_path).convert("RGB").resize((512, 512))
    ref_image = Image.open(req.ref_path).convert("RGB").resize((512, 512))
    pose_image = _get_pose(req.source_path, id_image)

    torch.cuda.synchronize()
    t0 = time.perf_counter()
    result = makeup_encoder.generate(
        id_image=[id_image, pose_image],
        makeup_image=ref_image,
        pipe=pipe,
        guidance_scale=req.guidance_scale,
        num_inference_steps=req.steps,
    )
    torch.cuda.synchronize()
    ms = int((time.perf_counter() - t0) * 1000)

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULT_DIR / f"{int(time.time() * 1000)}.jpg"
    result.save(out_path)
    return InferResponse(result_url=f"/results/{out_path.name}", ms=ms)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "cached_poses": len(_pose_cache)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8100)
    args = ap.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port)
