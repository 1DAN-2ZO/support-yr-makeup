"""결과 모양 실험 37 — 사진 조건 확인: 맨얼굴과 시도사진이 견줄 만한 조건으로 찍혔나 (밝기 · 색 · 얼굴 크기 · 고개 각도).

    DHE_DATA_DIR=D:/nudy-data uv run --extra eval --with scikit-image python eval/samples/shape/shot_condition.py

$DHE_DATA_DIR/work 의 쌍(.png + .lm.json, 둘 다 아무것도 안 그린 얼굴)을 읽어 값을 나란히 보여 준다. 판정이 맞았던 쌍과 틀렸던 쌍에서 값이 어떻게 다른지 보려는 것.
  이마 = 얼굴 점 151 둘레(눈 폭의 0.4배 원)의 Lab 중앙값 · 크기 = 눈 폭 ÷ 사진 가로 · 좌우 = (코끝 − 두 눈 가운데).x ÷ 두 눈 사이 · 위아래 = 〃.y ÷ 두 눈 사이 · 기울기 = 두 눈을 잇는 선의 각도
"""
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import color

W = Path(os.environ["DHE_DATA_DIR"]) / "work"
SETS = [
    ("촬영 페이지 · 같은 방식 7분 뒤 (판정 맞음)", "burst/pairs", [(f"y{k}_open_bare", f"y{k}_open_made") for k in (1, 3, 5)]),
    ("촬영 페이지 · 한 묶음 안 0.2초 간격", "burst/pairs", [(f"w3{k}_open_bare", f"w3{k}_open_made") for k in (2, 5)]),
    ("촬영 페이지 · 사진 모드 대 영상 27분 (눈썹 -0.22 치우침)", "burst/pairs", [(f"x{k}_open_bare", f"x{k}_open_made") for k in (1, 3, 5)]),
    ("손으로 찍은 같은 자리 (가짜 꼬리 5/12, 입술 · 섀도우는 맞음)", "same-seat/pairs", [(f"s{k}_open_bare", f"s{k}_open_made") for k in (2, 3, 4)]),
    ("다른 날 · 다른 곳 (입술 -0.24, 섀도우 헛잡음)", "liner-test/reshoot", [("me_open_bare", "me_open_made"), ("me3_open_bare", "me3_open_made")]),
]


def measure(d, name):
    im = Image.open(d / f"{name}.png").convert("RGB")
    lm = np.array([[p["x"], p["y"]] for p in json.loads((d / f"{name}.lm.json").read_text(encoding="utf-8"))])
    lab = color.rgb2lab(np.asarray(im).astype(float) / 255)
    ue = abs(lm[33, 0] - lm[133, 0])
    yy, xx = np.mgrid[0:im.height, 0:im.width]
    fore = np.median(lab[(xx - lm[151, 0]) ** 2 + (yy - lm[151, 1]) ** 2 <= (ue * 0.4) ** 2], axis=0)
    eyes = (lm[33] + lm[263]) / 2
    gap = np.linalg.norm(lm[263] - lm[33])
    nose = (lm[4] - eyes) / gap
    roll = np.degrees(np.arctan2(lm[263, 1] - lm[33, 1], lm[263, 0] - lm[33, 0]))
    return dict(fore=fore, size=ue / im.width, yaw=nose[0], pitch=nose[1], roll=roll)


print("쌍                                이마 밝기 차 · 색 차(ab)   크기 비   좌우 차   위아래 차   기울기 차")
for tag, sub, pairs in SETS:
    print(f"-- {tag}")
    for a, b in pairs:
        d = W / sub
        if not (d / f"{a}.png").exists() or not (d / f"{b}.png").exists():
            continue
        x, y = measure(d, a), measure(d, b)
        df = y["fore"] - x["fore"]
        print("  %-30s %+6.1f · %4.1f          %5.2f    %+5.2f    %+5.2f     %+5.1f도" % (
            b, df[0], np.hypot(df[1], df[2]), y["size"] / x["size"], y["yaw"] - x["yaw"], y["pitch"] - x["pitch"], y["roll"] - x["roll"]))
