"""
모델을 직접 돌려 본다 (서버 없이) — 속도·메모리·결과 그림 확인용. 서버와 같은 함수(server.generate)를 쓴다.

  python try.py <결과 폴더> "<내 얼굴>|<화장 사진>[|seed[|지시문 이름]]" [...]

쌍마다 결과 폴더에 <내 얼굴>__<화장 사진>__<지시문>__s<seed>.png 로 저장한다.
"""

import os
import sys

import torch
from PIL import Image, ImageOps

from guard import report
from prompt import DEFAULT
from server import generate, load

out_dir, jobs = sys.argv[1], sys.argv[2:]
os.makedirs(out_dir, exist_ok=True)
report("시작")
load()
name = lambda p: os.path.splitext(os.path.basename(p))[0]  # noqa: E731
for k, job in enumerate(jobs):
    # 윈도우 경로의 "C:" 와 헷갈리지 않게 "|" 로 나눈다
    bare, ref, *rest = job.split("|")
    seed = int(rest[0]) if rest else 0
    prompt = rest[1] if len(rest) > 1 else DEFAULT
    me = ImageOps.exif_transpose(Image.open(bare)).convert("RGB")
    look = ImageOps.exif_transpose(Image.open(ref)).convert("RGB")
    torch.cuda.reset_peak_memory_stats()
    img, ms = generate(me, look, seed=seed, prompt=prompt)
    path = f"{out_dir}/{name(bare)}__{name(ref)}__{prompt}__s{seed}.png"
    img.save(path)
    report(f"{k}: {ms}ms {path}")
