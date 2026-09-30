"""FFHQ-Makeup 전체에서 동양인 후보 추리기 — 사람이 마지막에 확인한다.

팀 사용자는 한국인이라 채점 시험지를 동양인 기준으로 만든다. FFHQ-Makeup 에는 인종 표시가 없어서
이미지·글을 비교하는 공개 모델(CLIP ViT-B/32)로
맨얼굴 사진이 "동아시아인" 설명에 얼마나 가까운지 점수를 매긴다.
이 점수는 후보를 줄이는 용도일 뿐이다 — 최종 선택은 모음 사진을 보고 사람이 한다.

  python eval/golden/pick_asian.py --root <압축 푼 폴더> --top 80

출력: DHE_DATA_DIR/golden/asian_candidates.json (점수 높은 순), 모음 사진 asian_sheet_*.jpg
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
OUT = BASE / "golden"
PROMPTS = {
    "east_asian": "a photo of an East Asian person's face",
    "white": "a photo of a white person's face",
    "black": "a photo of a black person's face",
    "south_asian": "a photo of a South Asian person's face",
    "latino": "a photo of a Latino person's face",
    "middle_eastern": "a photo of a Middle Eastern person's face",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="맨얼굴 사진이 들어 있는 폴더 (하위 폴더 포함 검색)")
    ap.add_argument("--pattern", default="*bare*")
    ap.add_argument("--top", type=int, default=80)
    args = ap.parse_args()
    from sentence_transformers import SentenceTransformer

    files = sorted(
        p for p in Path(args.root).rglob(args.pattern) if p.suffix.lower() in {".jpg", ".png", ".jpeg"}
    )
    print("맨얼굴 사진", len(files), flush=True)
    m = SentenceTransformer("clip-ViT-B-32")
    txt = m.encode(list(PROMPTS.values()), normalize_embeddings=True)
    scores = []
    for i in range(0, len(files), 64):
        ims = [Image.open(f).convert("RGB") for f in files[i : i + 64]]
        emb = m.encode(ims, normalize_embeddings=True, batch_size=64)
        logits = 100 * emb @ txt.T
        prob = np.exp(logits - logits.max(1, keepdims=True))
        prob /= prob.sum(1, keepdims=True)
        scores += prob[:, 0].tolist()
        if i % 1280 == 0:
            print(i, "/", len(files), flush=True)
    order = np.argsort(scores)[::-1]
    cand = [{"file": str(files[j]), "east_asian_prob": round(float(scores[j]), 3)} for j in order[: args.top]]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "asian_candidates.json").write_text(json.dumps(cand, ensure_ascii=False, indent=1))
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    per = 40
    for s in range(0, len(cand), per):
        sheet = Image.new("RGB", (10 * 130, 4 * 150), "white")
        d = ImageDraw.Draw(sheet)
        for k, c in enumerate(cand[s : s + per]):
            im = Image.open(c["file"]).convert("RGB")
            im.thumbnail((126, 126))
            x, y = (k % 10) * 130, (k // 10) * 150
            sheet.paste(im, (x + 2, y + 2))
            d.text((x + 4, y + 130), f"#{s + k + 1}  {c['east_asian_prob']:.2f}", fill="red", font=font)
        sheet.save(OUT / f"asian_sheet_{s // per + 1}.jpg", quality=85)
    print(
        f"후보 {len(cand)}명 → {OUT}/asian_candidates.json, 모음 사진 {(len(cand) + per - 1) // per}장",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
