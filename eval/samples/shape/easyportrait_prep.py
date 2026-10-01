"""EasyPortrait 검증 세트 → 결과 모양 채점 실험용 준비.

    # 먼저 받기 (약 3GB) — $DHE_DATA_DIR/easyportrait/ 에
    #   https://huggingface.co/datasets/gofixyourself/EasyPortrait  data/val.zip · data/annotations.zip
    uv run --extra vlm --extra eval python eval/samples/shape/easyportrait_prep.py 300

정면에 가깝고 눈이 크게 찍힌(눈 폭 80px 이상) 사진을 골라 $DHE_DATA_DIR/easyportrait/work/ 에
<번호>.png · <번호>.lm.json(얼굴 점 478개, 픽셀) · <번호>.mask.png(정답 마스크, 값 = 클래스 번호)를 둔다.

EasyPortrait: 실제 폰·웹캠 셀피 2만 장, 사람이 그린 부위 마스크
(0 배경 1 사람 2 피부 3·4 눈썹 5·6 눈 7 입술 8 치아). 라이선스 CC BY-SA 4.0 계열.
사진은 저장소에 넣지 않는다. 화장 여부 표시는 없다 — 대부분 맨얼굴이지만 섞여 있다.
"""

from __future__ import annotations

import io
import json
import math
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "eval" / "vlm"))

MIN_EYE_PX = 80
MAX_NOSE_OFF = 0.06  # 코끝이 얼굴 가운데에서 치우친 정도 (얼굴 폭 비율) — 정면 대략


def main() -> None:
    import numpy as np  # noqa: PLC0415
    from landmarks import detect, model_path  # noqa: PLC0415
    from mediapipe.tasks.python import BaseOptions  # noqa: PLC0415
    from mediapipe.tasks.python.vision import (  # noqa: PLC0415
        FaceLandmarker,
        FaceLandmarkerOptions,
        RunningMode,
    )
    from PIL import Image  # noqa: PLC0415

    data = os.environ.get("DHE_DATA_DIR")
    if not data:
        sys.exit("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)")
    ep = Path(data) / "easyportrait"
    out = ep / "work"
    out.mkdir(parents=True, exist_ok=True)
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 300

    zi, za = zipfile.ZipFile(ep / "val.zip"), zipfile.ZipFile(ep / "annotations.zip")
    imgs = sorted(n for n in zi.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png")))
    ann = {Path(n).stem: n for n in za.namelist() if "val" in n and n.lower().endswith(".png")}
    print("검증 사진", len(imgs), "라벨", len(ann))

    opts = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path())),
        running_mode=RunningMode.IMAGE,
        num_faces=1,
    )
    kept = seen = 0
    tmp = out / "_tmp.jpg"
    with FaceLandmarker.create_from_options(opts) as lmk:
        for name in imgs:
            stem = Path(name).stem
            if stem not in ann or kept >= want:
                continue
            seen += 1
            tmp.write_bytes(zi.read(name))
            r = detect(tmp, lmk)
            if r is None:
                continue
            lm, _, _ = r

            def d(a: int, b: int, lm=lm) -> float:
                return math.hypot(lm[a]["x"] - lm[b]["x"], lm[a]["y"] - lm[b]["y"])

            eye_w = (d(33, 133) + d(362, 263)) / 2
            off = abs(lm[1]["x"] - (lm[234]["x"] + lm[454]["x"]) / 2) / (d(234, 454) or 1)
            if eye_w < MIN_EYE_PX or off > MAX_NOSE_OFF:
                continue
            Image.open(tmp).convert("RGBA").save(out / f"{stem}.png")
            pts = [{"x": round(q["x"], 2), "y": round(q["y"], 2)} for q in lm]
            (out / f"{stem}.lm.json").write_text(json.dumps(pts), encoding="utf-8")
            # 값 = 클래스 번호 그대로 (팔레트를 색으로 풀지 않는다)
            a = np.asarray(Image.open(io.BytesIO(za.read(ann[stem]))))
            if a.ndim == 3:  # noqa: PLR2004
                a = a[..., 0]
            Image.fromarray(a.astype("uint8"), mode="L").save(out / f"{stem}.mask.png")
            kept += 1
    tmp.unlink(missing_ok=True)
    print(f"본 사진 {seen} → 고른 사진 {kept} (눈 폭 {MIN_EYE_PX}px 이상 · 정면)")


if __name__ == "__main__":
    main()
