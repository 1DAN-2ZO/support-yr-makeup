"""크롭 박스를 실제 사진에 그려 눈으로 확인한다.

    python preview.py                 # preview.png 생성
    python preview.py --out 다른이름.png

crop.js의 계산을 node로 돌려 받아온다. 계산을 두 번 구현하지 않기 위해서다.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow가 필요합니다:  pip install pillow")

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).parent
NAME = {"brow": "눈썹", "liner": "아이라이너", "shadow": "섀도우",
        "lip": "입술", "cheek": "볼터치", "contour": "쉐딩·하이라이트"}
COLOR = {"brow": "#e6194b", "liner": "#3cb44b", "shadow": "#c9a227",
         "lip": "#4363d8", "cheek": "#f58231", "contour": "#8a6f96"}


def specs() -> dict:
    """crop.js를 node로 실행해 부위 6개의 CropSpec을 받는다."""
    fx = json.loads((HERE / "fixture-landmarks.json").read_text(encoding="utf-8"))
    js = (
        "import {allCropSpecs} from './crop.js';"
        "import {readFileSync} from 'node:fs';"
        "const f=JSON.parse(readFileSync(new URL('./fixture-landmarks.json',import.meta.url),'utf-8'));"
        "console.log(JSON.stringify(allCropSpecs(f.landmarks,{imageW:f.image.w,imageH:f.image.h})));"
    )
    p = subprocess.run(["node", "--input-type=module", "-e", js],
                       capture_output=True, text=True, cwd=HERE)
    if p.returncode != 0:
        sys.exit(f"crop.js 실행 실패:\n{p.stderr}")
    return json.loads(p.stdout), fx


def font(size: int, bold: bool = False):
    name = "malgunbd.ttf" if bold else "malgun.ttf"
    try:
        return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)
    except OSError:
        return ImageFont.load_default()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "preview.png")
    args = ap.parse_args()

    sp, fx = specs()
    src = Path(HERE / ".." / ".." / fx["source"]).resolve()
    if not src.exists():
        sys.exit(f"원본 사진이 없습니다: {src}")
    photo = Image.open(src).convert("RGB")

    S = 3                                    # 원본이 작아 확대해서 그린다
    big = photo.resize((photo.width * S, photo.height * S), Image.LANCZOS)
    ov = big.copy()
    d = ImageDraw.Draw(ov)
    for pid, s in sp.items():
        b = s["box"]
        d.rectangle([b["x"] * S, b["y"] * S, (b["x"] + b["w"]) * S, (b["y"] + b["h"]) * S],
                    outline=COLOR[pid], width=3)

    # 부위별 크롭 6장
    CW = 300
    crops = []
    for pid, s in sp.items():
        b = s["box"]
        c = photo.crop((round(b["x"]), round(b["y"]),
                        round(b["x"] + b["w"]), round(b["y"] + b["h"])))
        ch = max(1, round(CW / (b["w"] / b["h"])))
        crops.append((pid, s, c.resize((CW, ch), Image.LANCZOS)))

    pad, gap = 28, 16
    left_w = ov.width
    grid_h = max(c.height for _, _, c in crops) + 76
    W = pad * 2 + left_w + gap + CW * 3 + gap * 2
    H = max(ov.height, grid_h * 2) + pad * 2 + 90
    sheet = Image.new("RGB", (W, H), (250, 248, 246))
    dd = ImageDraw.Draw(sheet)

    dd.text((pad, 24), "화면 3 크롭 박스 — 실측 랜드마크로 계산", font=font(30, True), fill=(40, 36, 32))
    dd.text((pad, 62), f"원본 {photo.width}×{photo.height} · {fx['source']}", font=font(17), fill=(140, 132, 125))
    sheet.paste(ov, (pad, 100))

    gx = pad + left_w + gap
    for i, (pid, s, c) in enumerate(crops):
        x = gx + (i % 3) * (CW + gap)
        y = 100 + (i // 3) * grid_h
        sheet.paste(c, (x, y))
        dd.rectangle([x, y, x + CW, y + c.height], outline=COLOR[pid], width=3)
        dd.text((x, y + c.height + 8), NAME[pid], font=font(20, True), fill=(40, 36, 32))
        dd.text((x, y + c.height + 34),
                f"{s['orientation']} · {s['box']['w']:.0f}×{s['box']['h']:.0f}px · 얼굴 대비 {s['zoom']:.2f}배",
                font=font(15), fill=(140, 132, 125))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out)
    print(f"저장: {args.out}  ({sheet.width}×{sheet.height})")
    for pid, s in sp.items():
        print(f"  {NAME[pid]:<12} {s['orientation']:<10} "
              f"{s['box']['w']:6.1f}×{s['box']['h']:6.1f}  {s['zoom']:.2f}배"
              + ("  (클램프됨)" if s["clamped"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
