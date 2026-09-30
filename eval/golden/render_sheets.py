"""정답 매길 사진을 가이드 선과 함께 모음 사진으로 — AI 먼저 매기기·사람 검수용 (#64).

정답 매기기 화면(label.html)과 같은 가이드 모양을 파이썬으로 그린다.
한 칸 = 화장 사진 확대(가이드 선) + 맨얼굴 같은 부분.

  python eval/golden/render_sheets.py            # DHE_DATA_DIR/golden/sheets/<부위>_<번호>.jpg + index.json
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "eval" / "golden" / "manifest.json"
BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
OUT = BASE / "golden" / "sheets"
LM = {
    "eyeA": {"outer": 33, "inner": 133, "upper": [33, 246, 161, 160, 159, 158, 157, 173, 133]},
    "eyeB": {"outer": 263, "inner": 362, "upper": [263, 466, 388, 387, 386, 385, 384, 398, 362]},
    "browA": {"upper": [70, 63, 105, 66, 107], "lower": [46, 53, 52, 65, 55]},
    "browB": {"upper": [300, 293, 334, 296, 336], "lower": [276, 283, 282, 295, 285]},
    "lips": [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
}
SIDES = [
    ("eyeA", "browA", 50, 234, -1),
    ("eyeB", "browB", 280, 454, 1),
]  # (눈, 눈썹, 광대 점, 얼굴 옆 점, 기울기 부호) — eval/score/guide-poc.mjs 와 같다


def guides(part: str, lm: list) -> list[tuple[list, bool]]:
    P = lambda i: lm[i]  # noqa: E731
    d = lambda a, b: math.dist(a, b)  # noqa: E731
    ueye = (d(P(33), P(133)) + d(P(263), P(362))) / 2
    face_w = d(P(234), P(454))
    out = []
    for eye, brow, cheek, face, sign in SIDES:
        e, b = LM[eye], LM[brow]
        if part == "brow":
            out.append(([P(i) for i in b["upper"] + b["lower"][::-1]], True))
        if part == "liner":
            o, n = P(e["outer"]), P(e["inner"])
            vx, vy = o[0] - n[0], o[1] - n[1]
            ln = math.hypot(vx, vy) or 1
            a = math.radians(30)
            dx, dy = vx / ln * math.cos(a), vy / ln * math.cos(a) - math.sin(a)
            dl = math.hypot(dx, dy) or 1
            out.append(([P(i) for i in e["upper"]], False))
            out.append(([o, (o[0] + dx / dl * 0.15 * ueye, o[1] + dy / dl * 0.15 * ueye)], False))
        if part == "shadow":
            lid = [P(i) for i in e["upper"]]
            lo = [P(i) for i in b["lower"]]
            top = []
            for k, p in enumerate(lid):
                q = lo[min(len(lo) - 1, round(k / (len(lid) - 1) * (len(lo) - 1)))]
                top.append((p[0] + (q[0] - p[0]) * 0.55, p[1] + (q[1] - p[1]) * 0.55))
            out.append((lid + top[::-1], True))
        if part == "cheek":
            c0, f0 = P(cheek), P(face)
            cx, cy = c0[0] + (f0[0] - c0[0]) * 0.25, c0[1] + (f0[1] - c0[1]) * 0.25
            rx, ry, t = face_w * 0.11, face_w * 0.07, math.radians(sign * -25)
            pts = []
            for k in range(40):
                q = k / 40 * 2 * math.pi
                x, y = rx * math.cos(q), ry * math.sin(q)
                pts.append((cx + x * math.cos(t) - y * math.sin(t), cy + x * math.sin(t) + y * math.cos(t)))
            out.append((pts, True))
    if part == "lip":
        out.append(([P(i) for i in LM["lips"]], True))
    return out


def crop_with_guide(img_path: Path, lm_path: Path, part: str, width: int, draw_guide: bool) -> Image.Image:
    im = Image.open(img_path).convert("RGB")
    lm = json.loads(lm_path.read_text())
    g = guides(part, lm)
    xs = [p[0] for s, _ in g for p in s]
    ys = [p[1] for s, _ in g for p in s]
    m = max(max(xs) - min(xs), max(ys) - min(ys)) * 0.35
    box = (max(0, min(xs) - m), max(0, min(ys) - m), min(im.width, max(xs) + m), min(im.height, max(ys) + m))
    sc = width / (box[2] - box[0])
    crop = im.crop(box).resize((width, round((box[3] - box[1]) * sc)), Image.LANCZOS)
    if draw_guide:
        dr = ImageDraw.Draw(crop)
        for pts, closed in g:
            q = [((x - box[0]) * sc, (y - box[1]) * sc) for x, y in pts]
            dr.line(q + ([q[0]] if closed else []), fill=(30, 120, 255), width=2)
    return crop


def main() -> int:
    g = json.loads(MANIFEST.read_text(encoding="utf-8"))
    items = [it for it in g["items"] if it.get("label_set")]
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    index = {}
    for part in ["liner", "brow", "lip", "shadow", "cheek"]:
        ps = [it for it in items if it["part"] == part]
        for s in range(0, len(ps), 12):
            cells = []
            for k, it in enumerate(ps[s : s + 12]):
                mk = crop_with_guide(BASE / it["makeup"], BASE / it["makeup_lm"], part, 300, True)
                br = crop_with_guide(BASE / it["bare"], BASE / it["bare_lm"], part, 170, False)
                h = max(mk.height, br.height) + 24
                cell = Image.new("RGB", (480, h), "white")
                cell.paste(mk, (0, 24))
                cell.paste(br, (306, 24))
                num = s + k + 1
                ImageDraw.Draw(cell).text((4, 2), f"{part} #{num}", fill=(200, 0, 0), font=font)
                index[f"{part}#{num}"] = it["id"]
                cells.append(cell)
            cols = 3
            rows = (len(cells) + cols - 1) // cols
            ch = max(c.height for c in cells)
            sheet = Image.new("RGB", (cols * 490, rows * (ch + 10)), (235, 235, 235))
            for k, c in enumerate(cells):
                sheet.paste(c, ((k % cols) * 490, (k // cols) * (ch + 10)))
            sheet.save(OUT / f"{part}_{s // 12 + 1}.jpg", quality=88)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print("모음 사진", len(list(OUT.glob("*.jpg"))), "장 ·", len(index), "칸")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
