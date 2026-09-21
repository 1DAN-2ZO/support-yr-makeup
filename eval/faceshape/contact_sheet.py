"""생성한 한국인 얼굴을 얼굴형별로 한 장에 모아 사람이 검수하기 쉽게 만든다 (1-7 검수).

  python eval/faceshape/contact_sheet.py            # DHE_DATA_DIR/kr_faces/_sheets/<얼굴형>.jpg

검수 결과는 kr_faces/review.json 에 {"round/round_003.png": "oval"} 처럼 적는다.
요청과 다르게 나온 사진은 실제 얼굴형으로 바꾸고, 판단이 어려우면 "exclude".
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "kr_faces"
KO = {"heart": "역삼각형", "oblong": "긴형", "oval": "계란형", "round": "둥근형", "square": "각진형"}
TW, TH, COLS = 200, 240, 5


def main() -> int:
    out = BASE / "_sheets"
    out.mkdir(exist_ok=True)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 16)
    except OSError:
        font = ImageFont.load_default()
    for c, ko in KO.items():
        files = sorted((BASE / c).glob("*.png"))
        if not files:
            continue
        rows = (len(files) + COLS - 1) // COLS
        sheet = Image.new("RGB", (COLS * TW, rows * (TH + 22) + 34), "white")
        d = ImageDraw.Draw(sheet)
        d.text((8, 6), f"요청: {ko} ({c}) — {len(files)}장", fill="black", font=font)
        for i, f in enumerate(files):
            im = Image.open(f).convert("RGB")
            im.thumbnail((TW - 6, TH - 6))
            x, y = (i % COLS) * TW, 34 + (i // COLS) * (TH + 22)
            sheet.paste(im, (x + 3, y + 3))
            d.text((x + 6, y + TH), f.name, fill="#444", font=font)
        sheet.save(out / f"{c}.jpg", quality=85)
        print(out / f"{c}.jpg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
