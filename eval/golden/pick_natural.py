"""정답 매길 사진 고르기 (#64) — 사람마다 가장 자연스러운 화장 2종만, 약 200장.

FFHQ-Makeup 화장은 합성이라 지나치게 화려하거나 이상한 것이 섞여 있다. 앱 사용자가 할 법한 화장이 아니면
정답을 매겨도 쓸모가 적다. 이미지·글 비교 모델(CLIP)로 '자연스러운 데일리 화장' 쪽 점수를 매겨
사람마다 상위 N종을 고르고, 눈썹·아이라인·입술은 전부, 섀도우·볼터치는 채점기가 점수를 낸 것만 넣는다.
결과는 manifest 항목의 "label_set": true 로 표시한다 — 정답 매기기 화면은 이 표시가 있으면 그것만 보여 준다.

  python eval/golden/pick_natural.py --per 2
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "eval" / "golden" / "manifest.json"
BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
NATURAL = [
    "a photo of a woman wearing natural everyday makeup",
    "a photo of a woman wearing soft subtle makeup",
]
FLASHY = [
    "a photo of a woman wearing heavy dramatic colorful makeup",
    "a photo of a woman with strange unusual face paint makeup",
    "a photo of a woman wearing bright blue or green eyeshadow and heavy eyeliner",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=2, help="사람마다 고를 화장 수")
    args = ap.parse_args()
    from sentence_transformers import SentenceTransformer

    g = json.loads(MANIFEST.read_text(encoding="utf-8"))
    items = [it for it in g["items"] if not str(it.get("source", "")).endswith("-bare")]
    looks = sorted({(it["person_id"], it["makeup"]) for it in items})
    m = SentenceTransformer("clip-ViT-B-32")
    txt = m.encode(NATURAL + FLASHY, normalize_embeddings=True)
    emb = m.encode([Image.open(BASE / mk).convert("RGB") for _, mk in looks], normalize_embeddings=True)
    logits = 100 * emb @ txt.T
    prob = np.exp(logits - logits.max(1, keepdims=True))
    prob /= prob.sum(1, keepdims=True)
    natural = prob[:, : len(NATURAL)].sum(1)

    by_person: dict[str, list[tuple[float, str]]] = defaultdict(list)
    for (pid, mk), s in zip(looks, natural, strict=True):
        by_person[pid].append((float(s), mk))
    chosen = {mk for pid in by_person for _, mk in sorted(by_person[pid], reverse=True)[: args.per]}

    # 섀도우·볼터치는 채점기가 점수를 낸 것만 (확인만은 일치율 계산에 안 들어감)
    cand = [it for it in items if it["makeup"] in chosen]
    need_score = [it for it in cand if it["part"] in ("shadow", "cheek")]
    out = subprocess.run(
        ["node", str(ROOT / "eval" / "score" / "score_cli.mjs")],
        input=json.dumps({"items": need_score, "data_dir": str(BASE)}),
        capture_output=True,
        text=True,
        check=True,
    )
    scored = {r["id"] for r in json.loads(out.stdout) if r["status"] == "scored"}
    keep = {it["id"] for it in cand if it["part"] in ("brow", "liner", "lip") or it["id"] in scored}
    for it in g["items"]:
        it.pop("label_set", None)
        if it["id"] in keep:
            it["label_set"] = True
    g["item_fields"]["label_set"] = (
        "true 면 사람이 정답을 매기는 대상 (pick_natural.py 가 고름: 사람마다 자연스러운 화장 N종)"
    )
    MANIFEST.write_text(json.dumps(g, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 확인용 모음 사진: 사람마다 고른 것(초록 테두리) / 뺀 것
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    pids = sorted(by_person)
    for s in range(0, len(pids), 10):
        sheet = Image.new("RGB", (5 * 110, 10 * 124), "white")
        d = ImageDraw.Draw(sheet)
        for r, pid in enumerate(pids[s : s + 10]):
            for c, (sc, mk) in enumerate(sorted(by_person[pid], reverse=True)):
                im = Image.open(BASE / mk).convert("RGB")
                im.thumbnail((104, 104))
                x, y = c * 110, r * 124
                sheet.paste(im, (x + 3, y + 3))
                if mk in chosen:
                    d.rectangle((x + 1, y + 1, x + 108, y + 108), outline=(20, 160, 60), width=3)
                d.text((x + 4, y + 108), f"{pid[-6:]} {sc:.2f}", fill="black", font=font)
        sheet.save(BASE / "golden" / f"natural_sheet_{s // 10 + 1}.jpg", quality=85)
    parts = defaultdict(int)
    for it in g["items"]:
        if it.get("label_set"):
            parts[it["part"]] += 1
    print(f"고른 화장 {len(chosen)}종 · 정답 매길 사진 {len(keep)}장", dict(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
