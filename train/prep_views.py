"""정리한 얼굴형 데이터(prep_clean)에 '얼굴 확대' 버전을 더한다 — 사진 한 장당 두 가지 모양.

  ① 얼굴 확대: 얼굴 점 범위 + 여백 10% (공개 데이터 시험 사진처럼 얼굴이 꽉 찬 모양, 단 컬러)
  ② 앱 여백: 머리 위·어깨까지 (prep_clean 이 만든 것)

두 버전은 같은 사진이라 같은 묶음 번호를 쓴다 — 학습/검증/시험이 서로 겹치지 않는다.
각 버전에서 얼굴 점을 따로 뽑는다(자른 모양에 따라 점 위치가 조금 달라지므로).

  python train/prep_views.py --clean ~/dhe-data/faceshape_clean --src ~/dhe-data/faceshape

출력: <clean>/landmarks_views.npz  (X, y, f, g, view[0=확대,1=여백], split[train/test])
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image, ImageFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.faceshape.landmark_models import normalize  # noqa: E402

ImageFile.LOAD_TRUNCATED_IMAGES = True
CLASSES = ["heart", "oblong", "oval", "round", "square"]
TIGHT = 0.10


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", required=True)
    ap.add_argument("--src", required=True)
    args = ap.parse_args()
    clean, src = Path(args.clean), Path(args.src)
    models = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data")) / "models"
    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(models / "face_landmarker.task"))
        )
    )
    cache = json.loads((clean.parent / f"{clean.name}_detect_cache.json").read_text())
    d = np.load(clean / "landmarks.npz")
    out = {k: [] for k in ["X", "y", "f", "g", "view", "split"]}
    tight_dir = clean / "_tight"
    miss = 0
    for split in ["train", "test"]:
        for x, y, f, g in zip(
            d[f"{split}_X"], d[f"{split}_y"], d[f"{split}_f"], d[f"{split}_g"], strict=True
        ):
            # ② 앱 여백 버전: prep_clean 이 뽑은 얼굴 점 그대로
            out["X"].append(x)
            out["y"].append(int(y))
            out["f"].append(str(f))
            out["g"].append(int(g))
            out["view"].append(1)
            out["split"].append(split)
            # ① 얼굴 확대 버전: 원본에서 얼굴 점 범위 + 10% 로 잘라 다시 뽑는다
            orig = src / CLASSES[int(y)] / Path(f).name
            cands = [
                k for k in cache if Path(k).parent.name == CLASSES[int(y)] and Path(k).stem == Path(f).stem
            ]
            if not cands or cache[cands[0]] is None:
                miss += 1
                continue
            lm0 = np.array(cache[cands[0]])
            rgb = Image.open(cands[0]).convert("RGB")
            x0, x1 = lm0[:, 0].min(), lm0[:, 0].max()
            y0, y1 = lm0[:, 1].min(), lm0[:, 1].max()
            mw, mh = (x1 - x0) * TIGHT, (y1 - y0) * TIGHT
            crop = rgb.crop(
                (max(0, round(x0 - mw)), max(0, round(y0 - mh)),
                 min(rgb.width, round(x1 + mw)), min(rgb.height, round(y1 + mh)))
            )  # fmt: skip
            r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(crop)))
            if not r.face_landmarks:
                miss += 1
                continue
            lm = np.array(
                [[q.x * crop.width, q.y * crop.height, q.z * crop.width] for q in r.face_landmarks[0]]
            )
            tf = tight_dir / split / CLASSES[int(y)] / f"{Path(f).stem}.jpg"
            tf.parent.mkdir(parents=True, exist_ok=True)
            crop.save(tf, quality=92)
            out["X"].append(normalize(lm).astype(np.float32))
            out["y"].append(int(y))
            out["f"].append(str(tf))
            out["g"].append(int(g))
            out["view"].append(0)
            out["split"].append(split)
            del orig
        print(split, "완료", flush=True)
    np.savez_compressed(clean / "landmarks_views.npz", **{k: np.array(v) for k, v in out.items()})
    v, s = np.array(out["view"]), np.array(out["split"])
    print(
        f"얼굴 확대 못 만든 사진 {miss}장 | 학습: 확대 {((v == 0) & (s == 'train')).sum()} · 여백 "
        f"{((v == 1) & (s == 'train')).sum()} | 시험: 확대 {((v == 0) & (s == 'test')).sum()} · 여백 "
        f"{((v == 1) & (s == 'test')).sum()}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
