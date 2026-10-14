"""PoC B — FLUX.2 klein 4B 로 참고 사진 전체를 고쳐 그리기 (로컬 RTX 3060 12GB).

서버(app_klein.py)는 맨얼굴 점으로 만든 마스크 안만 다시 그려서 "사진 전체 고치기" 는 못 한다 — 그래서 로컬에서 따로 돌린다.
app_klein 과 같은 방식: 지시문 해석(글 부품 7.5GB)을 먼저 따로 돌려 결과만 두고 내린 뒤, 그리는 부품만 그래픽카드에 올린다.
(전체를 한 번에 올리면 12GB 에 안 들어가고, 부분씩 올리기는 윈도우에서 프로그램이 죽었다 — app_klein.py 머리말)

jobs.json: [{"image": "in.png", "prompt": "...", "out": "out.png", "seed": 1234, "steps": 4, "mirror": false}, ...]
mirror 를 켜면 원본과 그 좌우반전을 참고 사진 두 장(1, 2)으로 같이 넣는다.
image 를 빼면 글만으로 그린다 (환경 확인용). 이 폴더는 PoC 시험용이라 서비스에는 들어가지 않는다.
"""
import gc
import hashlib
import json
import sys
import time
from pathlib import Path

import torch
from PIL import Image, ImageOps

MODEL = Path(r"D:\flux2-poc\FLUX.2-klein-4B")
EMBED_DIR = Path(r"D:\flux2-poc\embeds")
LONG_SIDE = 1024      # 그릴 때 긴 변 (16 의 배수로 맞춘다)


def fit(img: Image.Image, long_side: int) -> tuple[Image.Image, int, int]:
    w, h = img.size
    s = long_side / max(w, h)
    w2, h2 = max(16, round(w * s / 16) * 16), max(16, round(h * s / 16) * 16)
    return img.resize((w2, h2), Image.LANCZOS), w2, h2


def embeds_for(prompts: list[str]) -> dict[str, torch.Tensor]:
    """지시문마다 해석 결과를 구해 둔다 — 저장해 둔 게 있으면 그대로, 없는 것만 글 부품을 올려 돌린다"""
    EMBED_DIR.mkdir(parents=True, exist_ok=True)
    got: dict[str, torch.Tensor] = {}
    need = []
    for p in dict.fromkeys(prompts):
        f = EMBED_DIR / (hashlib.sha1(p.encode("utf8")).hexdigest() + ".pt")
        if f.exists():
            got[p] = torch.load(f)
        else:
            need.append((p, f))
    if need:
        from diffusers import Flux2KleinPipeline
        from transformers import AutoModelForCausalLM

        print(f"지시문 해석 {len(need)}개 ...", flush=True)
        te = AutoModelForCausalLM.from_pretrained(str(MODEL), subfolder="text_encoder", dtype=torch.bfloat16, device_map="cuda")
        enc = Flux2KleinPipeline.from_pretrained(str(MODEL), text_encoder=te, transformer=None, vae=None, torch_dtype=torch.bfloat16)
        for p, f in need:
            with torch.no_grad():
                e, _ = enc.encode_prompt(prompt=p, device="cuda")
            e = e.to(torch.bfloat16).cpu()
            torch.save(e, f)
            got[p] = e
        del enc, te
        gc.collect()
        torch.cuda.empty_cache()
    return got


def main() -> None:
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
    emb = embeds_for([j["prompt"] for j in jobs])
    from diffusers import Flux2KleinPipeline

    t0 = time.perf_counter()
    pipe = Flux2KleinPipeline.from_pretrained(str(MODEL), text_encoder=None, tokenizer=None, torch_dtype=torch.bfloat16).to("cuda")
    print(f"그리는 부품 올림 {time.perf_counter() - t0:.1f}s · VRAM {torch.cuda.memory_allocated() / 2**30:.1f}GB", flush=True)
    for j in jobs:
        src = Image.open(j["image"]).convert("RGB") if j.get("image") else None
        if src is not None:
            src, w, h = fit(src, j.get("long_side", LONG_SIDE))
        else:
            w = h = j.get("size", 768)
        if src is not None and j.get("mirror"):               # 참고 두 장: 1 = 원본, 2 = 좌우반전 (분할 없이 뒤집기만)
            src = [src, ImageOps.mirror(src)]
        torch.cuda.reset_peak_memory_stats()
        t1 = time.perf_counter()
        gen = torch.Generator("cpu").manual_seed(int(j.get("seed", 1234)))
        out = pipe(image=src, prompt_embeds=emb[j["prompt"]].to("cuda", torch.bfloat16), height=h, width=w,
                   num_inference_steps=int(j.get("steps", 4)), guidance_scale=float(j.get("guidance", 1.0)), generator=gen).images[0]
        dt = time.perf_counter() - t1
        Path(j["out"]).parent.mkdir(parents=True, exist_ok=True)
        out.save(j["out"])
        print(f"{j['out']}  {dt:.1f}s  {w}x{h}  VRAM peak {torch.cuda.max_memory_allocated() / 2**30:.1f}GB", flush=True)


if __name__ == "__main__":
    main()
