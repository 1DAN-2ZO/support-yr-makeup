"""앱 촬영과 비슷한 조건의 얼굴형 데이터 만들기 — 컬러 + 머리 위·어깨까지 나오는 여백.

공개 얼굴형 데이터의 시험 사진(test)은 전부 흑백에 얼굴만 꽉 차게 잘린 사진이라, 앱에서 찍는
컬러·여백 있는 사진과 조건이 다르다. 학습 폴더의 컬러 원본만 골라 앱처럼 잘라 새 폴더를 만든다.

  python train/prep_applike.py --src ~/dhe-data/faceshape --out ~/dhe-data/faceshape_applike

출력 구조는 faceshape_cnn.py 가 그대로 읽는 모양이다:
  <out>/{heart,...}/*.jpg (학습 90%), <out>/test/{Heart,...}/*.jpg (시험 10%, 얼굴형별 같은 비율)
흑백 사진(원래 전처리된 것)과 얼굴을 못 찾은 사진은 뺀다.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True
CLASSES = ["heart", "oblong", "oval", "round", "square"]
# 얼굴 점 기준 여백 (얼굴 폭 W·이마~턱 길이 H 배수). 머리 위와 어깨가 조금 나오게
SIDE, TOP, BOTTOM = 0.8, 0.9, 0.6


def is_gray(im: Image.Image) -> bool:
    if im.mode in ("L", "LA", "1"):
        return True
    a = np.asarray(im.convert("RGB").resize((64, 64)), dtype=np.int16)
    return bool(np.abs(a[..., 0] - a[..., 1]).max() < 8 and np.abs(a[..., 1] - a[..., 2]).max() < 8)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--test-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    models = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "models"
    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(models / "face_landmarker.task"))
        )
    )
    src, out = Path(args.src), Path(args.out)
    rnd = random.Random(args.seed)
    stats = {}
    for c in CLASSES:
        files = sorted(p for p in (src / c).glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
        kept, gray, noface, n_clip = [], 0, 0, 0
        for p in files:
            try:
                im = Image.open(p)
                im.load()
            except OSError:
                continue
            if is_gray(im):
                gray += 1
                continue
            rgb = im.convert("RGB")
            res = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb)))
            if len(res.face_landmarks) != 1:
                noface += 1
                continue
            lm = res.face_landmarks[0]
            xs = [q.x * rgb.width for q in lm]
            cx, w = (min(xs) + max(xs)) / 2, max(xs) - min(xs)
            top_y, chin_y = lm[10].y * rgb.height, lm[152].y * rgb.height
            h = chin_y - top_y
            box = (cx - w * SIDE - w / 2, top_y - h * TOP, cx + w * SIDE + w / 2, chin_y + h * BOTTOM)
            # 사진 밖으로 나가면 원본 가장자리에서 자른다 (검은 테두리는 앱 사진에 없는 모양이라 넣지 않는다)
            clipped = box[0] < 0 or box[1] < 0 or box[2] > rgb.width or box[3] > rgb.height
            box = (
                max(0, round(box[0])),
                max(0, round(box[1])),
                min(rgb.width, round(box[2])),
                min(rgb.height, round(box[3])),
            )
            n_clip += clipped
            kept.append((p, rgb.crop(box)))
        rnd.shuffle(kept)
        n_test = round(len(kept) * args.test_frac)
        for i, (p, crop) in enumerate(kept):
            d = out / "test" / c.capitalize() if i < n_test else out / c
            d.mkdir(parents=True, exist_ok=True)
            crop.save(d / f"{p.stem}.jpg", quality=92)
        stats[c] = {
            "원본": len(files),
            "흑백 제외": gray,
            "얼굴 못 찾음": noface,
            "학습": len(kept) - n_test,
            "시험": n_test,
            "여백 부족(가장자리에서 자름)": n_clip,
        }
        print(c, stats[c], flush=True)
    (out / "prep.json").write_text(
        json.dumps(
            {"margin": {"side": SIDE, "top": TOP, "bottom": BOTTOM}, "stats": stats},
            ensure_ascii=False,
            indent=1,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
