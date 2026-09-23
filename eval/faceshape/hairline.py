"""머리선 점 추가 — 얼굴 점 478개에 없는 '이마 맨 위(머리선)' 정보를 더한다.

MediaPipe 얼굴 점의 맨 위(10번)는 머리선이 아니라 이마 중간이라 얼굴 전체 길이를 모른다.
촬영 기준을 '앞머리 넘기고 찍기'로 바꿨으므로 머리선이 사진에 보인다.
MediaPipe 머리카락·피부 분할 모델(selfie_multiclass_256x256)로 얼굴 피부가 끝나는 선을 찾아
얼굴 폭을 따라 점 N_PTS 개를 찍는다. 좌표는 얼굴 점과 같은 방식(눈꼬리 수평·중심·얼굴 폭)으로 맞춘다.

  python eval/faceshape/hairline.py preview      # 사진 몇 장에 머리선 점을 그려 확인
  python eval/faceshape/hairline.py extract      # 여백 버전 전체 → <clean>/hairline.npz
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image, ImageDraw

BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
CLEAN = BASE / "faceshape_clean"
N_PTS = 10
FACE_SKIN, HAIR = 3, 1  # selfie_multiclass 분류 번호: 0 배경 1 머리카락 2 몸 피부 3 얼굴 피부 4 옷 5 기타


def tools():
    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(BASE / "models" / "face_landmarker.task"))
        )
    )
    seg = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=BaseOptions(
                model_asset_path=str(BASE / "models" / "selfie_multiclass_256x256.tflite")
            ),
            output_category_mask=True,
        )
    )
    return fl, seg


def hairline(rgb: Image.Image, fl, seg):
    """(얼굴 점 478×3 px, 머리선 점 N×2 px, 머리선이 사진 위 끝에 닿았는지) — 얼굴을 못 찾으면 None."""
    im = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb))
    r = fl.detect(im)
    if not r.face_landmarks:
        return None
    lm = np.array([[q.x * rgb.width, q.y * rgb.height, q.z * rgb.width] for q in r.face_landmarks[0]])
    mask = seg.segment(im).category_mask.numpy_view()
    xl, xr = lm[234, 0], lm[454, 0]
    y_start = lm[10, 1]  # 이마 중간(10번)에서 위로 올라가며 얼굴 피부가 끝나는 곳을 찾는다
    pts, clipped = [], False
    for t in np.linspace(0.15, 0.85, N_PTS):
        x = int(round(xl + t * (xr - xl)))
        x = min(max(x, 0), mask.shape[1] - 1)
        y = int(round(y_start))
        while y > 0 and mask[y - 1, x] == FACE_SKIN:
            y -= 1
        if y <= 0:
            clipped = True
        pts.append([x, y])
    return lm, np.array(pts, dtype=float), clipped


def normalize_with(lm: np.ndarray, extra: np.ndarray) -> np.ndarray:
    """eval/faceshape/landmark_models.normalize 와 같은 변환을 추가 점에도 적용 → (N, 2)."""
    a, b = lm[33, :2], lm[263, :2]
    ang = np.arctan2(b[1] - a[1], b[0] - a[0])
    c, s = np.cos(-ang), np.sin(-ang)
    R = np.array([[c, -s], [s, c]]).T
    center = lm[:, :2].mean(0)
    xy = (lm[:, :2] - center) @ R
    w = xy[454, 0] - xy[234, 0]
    return ((extra - center) @ R) / w


def preview() -> int:
    fl, seg = tools()
    d = np.load(CLEAN / "landmarks_views.npz")
    files = [f for f, v in zip(d["f"], d["view"], strict=True) if v == 1]
    rng = np.random.default_rng(3)
    pick = rng.choice(len(files), 12, replace=False)
    sheet = Image.new("RGB", (6 * 170, 2 * 210), "white")
    for k, i in enumerate(pick):
        rgb = Image.open(files[i]).convert("RGB")
        out = hairline(rgb, fl, seg)
        dr = ImageDraw.Draw(rgb)
        if out:
            lm, hp, _ = out
            for x, y in lm[[10, 234, 454], :2]:
                dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill="yellow")
            for x, y in hp:
                dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill="red")
        rgb.thumbnail((166, 206))
        sheet.paste(rgb, ((k % 6) * 170 + 2, (k // 6) * 210 + 2))
    out = Path(os.environ.get("PREVIEW_OUT", "/tmp/hairline_preview.jpg"))
    sheet.save(out)
    print(out)
    return 0


def extract() -> int:
    fl, seg = tools()
    d = np.load(CLEAN / "landmarks_views.npz")
    idx = np.nonzero(d["view"] == 1)[0]
    H, X, ok, clip = [], [], [], []
    for n, i in enumerate(idx):
        out = hairline(Image.open(d["f"][i]).convert("RGB"), fl, seg)
        if out is None:
            H.append(np.zeros((N_PTS, 2)))
            X.append(np.zeros((478, 3)))
            ok.append(False)
            clip.append(False)
            continue
        lm, hp, c = out
        from eval.faceshape.landmark_models import normalize

        H.append(normalize_with(lm, hp))
        X.append(normalize(lm))
        ok.append(True)
        clip.append(c)
        if n % 1000 == 0:
            print(n, "/", len(idx), flush=True)
    np.savez_compressed(CLEAN / "hairline.npz", idx=idx, H=np.array(H, np.float32), X=np.array(X, np.float32),
                        ok=np.array(ok), clipped=np.array(clip))  # fmt: skip
    print(f"여백 버전 {len(idx)}장: 얼굴 찾음 {sum(ok)} · 머리선이 사진 위 끝에 닿음 {sum(clip)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    raise SystemExit(preview() if sys.argv[1:] == ["preview"] else extract())
