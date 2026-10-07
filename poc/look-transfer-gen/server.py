"""
룩 옮기기 실험 — 생성 모델 서버 (정답사진 후보 만들기, 실험용).

내 맨얼굴 사진 + 배우고 싶은 화장 사진 → 화장한 내 얼굴 사진 한 장.
모델: FLUX.2 [klein] 4B (Apache-2.0, black-forest-labs/FLUX.2-klein-4B). 이 PC 의 그래픽카드에서만 돈다.
받는 쪽은 client/look-transfer-probe.html (client/vite.lt.config.ts 의 /__gen 프록시). 설치 · 실행은 README.md.

  python embed.py                                              (처음 한 번 — 지시문을 해석해 embeds/ 에 저장)
  python -m uvicorn server:app --host 127.0.0.1 --port 8189

- 127.0.0.1 로만 연다. 밖에서는 실험 화면(vite)의 /__gen 프록시를 거쳐서만 들어온다.
- 받은 사진과 만든 사진은 메모리에서만 쓰고 디스크에 저장하지 않는다.
- 그림 생성 부품(8GB)만 그래픽카드에 올린다. 글 해석 부품(8GB)은 안 올린다 — 지시문이 늘 같아서 embed.py 가
  미리 해석해 둔 것을 읽는다. 둘을 같이 올렸더니 PC 메모리(32GB)가 바닥났다 (2026-10-06).
- 모델은 첫 요청 때 올린다. POST /unload 로 내릴 수 있다. PC 메모리가 4GB 아래로 떨어지면 스스로 꺼진다 (guard.py).
"""

from __future__ import annotations

import io
import threading
import time

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageOps

from guard import report, start_guard
from prompt import DEFAULT, MODEL_DIR, PROMPTS, embeds_file

start_guard()
app = FastAPI(title="look-transfer-gen")
_lock = threading.Lock()
_pipe = None
_embeds: dict = {}


def embeds(name: str):
    """미리 해석해 둔 지시문 (embed.py 가 저장한 것)."""
    if name not in _embeds:
        _embeds[name] = torch.load(embeds_file(name))["embeds"].to("cuda", torch.bfloat16)
    return _embeds[name]


def load():
    """그림 생성 부품과 그림 압축·복원 부품을 그래픽카드에 올린다 (이미 올렸으면 그대로)."""
    global _pipe
    if _pipe is None:
        from diffusers import Flux2KleinPipeline, Flux2Transformer2DModel

        t0 = time.time()
        # device_map="cuda": 파일에서 그래픽카드로 바로 — PC 메모리에 8GB 를 통째로 올리지 않는다
        transformer = Flux2Transformer2DModel.from_pretrained(MODEL_DIR, subfolder="transformer", torch_dtype=torch.bfloat16, device_map="cuda")
        pipe = Flux2KleinPipeline.from_pretrained(MODEL_DIR, transformer=transformer, text_encoder=None, tokenizer=None, torch_dtype=torch.bfloat16)
        pipe.vae.to("cuda")
        _pipe = pipe
        print(f"[gen] model loaded in {time.time() - t0:.1f}s", flush=True)
        report("모델 올림")
    return _pipe


# 작은 사진을 이보다 많이 키우지는 않는다 — 너무 작은 얼굴은 키워도 뭉개진 그림일 뿐이다
MAX_UPSCALE = 4.0


def fit(im: Image.Image, long_side: int) -> Image.Image:
    """긴 변을 long_side 로 맞춘다 (가로·세로는 16의 배수 — 모델 조건).

    작은 사진은 키운다. 모델은 1024 쯤에서 가장 잘 그리는데, 작은 얼굴 사진이 352x432 그대로 들어가
    화장이 뭉개지던 것을 2026-10-06 서버 기록에서 봤다. 결과는 generate() 가 원래 크기로 되돌린다.
    """
    k = min(MAX_UPSCALE, long_side / max(im.size))
    w = max(16, round(im.width * k / 16) * 16)
    h = max(16, round(im.height * k / 16) * 16)
    return im.resize((w, h), Image.LANCZOS)


def generate(me: Image.Image, look: Image.Image, seed: int = 0, steps: int = 4, size: int = 1024, prompt: str = DEFAULT, raw: bool = False) -> tuple[Image.Image, int]:
    """화장한 내 얼굴 — me 와 같은 크기로 돌려준다. (그림, 걸린 ms)

    raw 면 모델이 낸 크기 그대로 돌려준다 (크기를 되돌리지 않는다) — 모델 출력 원본이 필요한 시험용.
    """
    src = fit(me, size)
    t0 = time.time()
    with _lock:  # 한 번에 하나만 — 그래픽카드 한 장
        pipe = load()
        out = pipe(
            prompt_embeds=embeds(prompt),
            image=[src, fit(look, size)],
            height=src.height,
            width=src.width,
            guidance_scale=1.0,
            num_inference_steps=steps,
            generator=torch.Generator("cpu").manual_seed(seed),
        ).images[0]
    ms = round((time.time() - t0) * 1000)
    print(f"[gen] {src.width}x{src.height} steps={steps} seed={seed} prompt={prompt} {ms}ms", flush=True)
    # 보낸 사진과 같은 크기로 돌려준다 — 받는 쪽이 원본과 바로 겹쳐 볼 수 있게
    return (out if raw else out.resize(me.size, Image.LANCZOS)), ms


def _open(data: bytes) -> Image.Image:
    try:
        return ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"사진을 읽지 못했습니다: {e}") from e


@app.get("/health")
def health():
    gpu = torch.cuda.is_available()
    return {
        "loaded": _pipe is not None,
        "gpu": torch.cuda.get_device_name(0) if gpu else None,
        "vram_used_gb": round(torch.cuda.memory_allocated(0) / 1e9, 2) if gpu else None,
        "prompts": list(PROMPTS),
        "default_prompt": DEFAULT,
    }


@app.post("/unload")
def unload():
    global _pipe
    with _lock:
        _pipe = None
        _embeds.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    return {"loaded": False}


@app.post("/transfer")
def transfer(
    bare: UploadFile = File(...),
    ref: UploadFile = File(...),
    seed: int = Form(0),
    steps: int = Form(4),
    size: int = Form(1024),
    prompt: str = Form(DEFAULT),
    raw: bool = Form(False),
):
    if not 1 <= steps <= 50 or not 256 <= size <= 1536:
        raise HTTPException(400, "steps 1~50, size 256~1536")
    if prompt not in PROMPTS:
        raise HTTPException(400, f"지시문 이름은 {list(PROMPTS)} 중 하나")
    out, ms = generate(_open(bare.file.read()), _open(ref.file.read()), seed, steps, size, prompt, raw)
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"x-gen-ms": str(ms), "x-gen-size": f"{out.width}x{out.height}"})


@app.exception_handler(torch.OutOfMemoryError)
async def oom(_req, _exc):
    torch.cuda.empty_cache()
    return JSONResponse({"detail": "그래픽 메모리가 부족합니다. 다른 프로그램이 그래픽카드를 쓰고 있는지 확인해 주세요."}, status_code=503)
