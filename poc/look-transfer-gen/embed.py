"""
지시문을 한 번만 해석해 파일로 저장한다 (embeds/<이름>.pt).

지시문("image 2 의 화장을 image 1 에 옮겨라")은 매번 같으니, 글 해석 부품(8GB)을 서버에 계속 올려 둘 이유가 없다.
여기서 한 번 돌려 결과만 남기고 내린다 — 그 뒤 서버는 그림 생성 부품만 올린다.

  python embed.py

지시문(prompt.py)을 바꾸거나 더하면 다시 돌린다. 이미 저장한 것 중 글이 같은 것은 건너뛴다.
"""

import os

import torch

from guard import report, start_guard
from prompt import EMBEDS_DIR, MODEL_DIR, PROMPTS, embeds_file

start_guard()
os.makedirs(EMBEDS_DIR, exist_ok=True)
todo = {k: v for k, v in PROMPTS.items() if not (os.path.exists(embeds_file(k)) and torch.load(embeds_file(k))["prompt"] == v)}
if not todo:
    raise SystemExit("바뀐 지시문이 없습니다")

from diffusers import Flux2KleinPipeline  # noqa: E402
from transformers import AutoModelForCausalLM  # noqa: E402

# device_map="cuda": 파일에서 그래픽카드로 바로 올린다 — PC 메모리에 8GB 를 통째로 올리지 않는다
te = AutoModelForCausalLM.from_pretrained(f"{MODEL_DIR}/text_encoder", dtype=torch.bfloat16, device_map="cuda")
report("글 해석 부품 올림")
pipe = Flux2KleinPipeline.from_pretrained(MODEL_DIR, text_encoder=te, transformer=None, vae=None, torch_dtype=torch.bfloat16)
for name, text in todo.items():
    with torch.no_grad():
        embeds, _ = pipe.encode_prompt(prompt=text, device="cuda")
    torch.save({"prompt": text, "embeds": embeds.float().cpu()}, embeds_file(name))
    print("saved", embeds_file(name), tuple(embeds.shape))
report("지시문 해석함")
