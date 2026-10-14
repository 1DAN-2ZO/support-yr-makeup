"""사진마다 이름표를 붙여 격자로 나란히 (PoC 눈으로 보기용).

    python -I sheet_labeled.py <out.png> <열 수> <칸 높이> "이름표=사진경로" ["이름표=사진경로" ...]
이름표 안의 \\n 은 줄바꿈.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

out, cols, height = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = [a.split("=", 1) for a in sys.argv[4:]]
font = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 20)
small = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 17)
CAP = 78                      # 이름표 칸 높이
tiles = []
for label, path in items:
    im = Image.open(path).convert("RGB")
    im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    t = Image.new("RGB", (max(im.width, 300), CAP + height), (255, 255, 255))
    t.paste(im, ((t.width - im.width) // 2, CAP))
    d = ImageDraw.Draw(t)
    for i, line in enumerate(label.replace("\\n", "\n").split("\n")[:3]):
        d.text((8, 4 + i * 24), line, font=font if i == 0 else small, fill=(0, 0, 0) if i == 0 else (70, 70, 70))
    tiles.append(t)
rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
W = max(sum(t.width for t in r) + 10 * (len(r) - 1) for r in rows)
H = sum(max(t.height for t in r) for r in rows) + 10 * (len(rows) - 1)
sheet = Image.new("RGB", (W, H), (200, 200, 200))
y = 0
for r in rows:
    x = 0
    for t in r:
        sheet.paste(t, (x, y)); x += t.width + 10
    y += max(t.height for t in r) + 10
sheet.save(out)
print(out, sheet.size)
