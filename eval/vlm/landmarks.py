"""VLM 선정 실험 1단계 준비 — 사진 → 얼굴 점 478개 → 측정값 (앱과 같은 measureFace).

    uv run --extra vlm python eval/vlm/landmarks.py

입력  $DHE_DATA_DIR/vlm-eval/photos/*.jpg|*.jpeg|*.png
      맨얼굴 정면, 팀원 동의 받은 사진만. 저장소에 넣지 않는다
출력  $DHE_DATA_DIR/vlm-eval/work/<사진 이름>.json        {id, sha256, w, h, lm, m}
      - id 는 사진 해시 앞 12자리 — 결과 파일·보고서에는 사진 이름 대신 이것만 남긴다

얼굴 점 모델은 $DHE_FACE_LANDMARKER_PATH (face_landmarker.task). 없으면 앱이 쓰는 것과 같은 공식 파일을 받아
$DHE_DATA_DIR/models/ 에 둔다. 얼굴을 못 찾은 사진은 건너뛰고 이름을 알려 준다.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"


def data_dir() -> Path:
    d = os.environ.get("DHE_DATA_DIR")
    if not d:
        sys.exit("DHE_DATA_DIR 를 정해 주세요 (사진·결과는 저장소 밖에 둡니다)")
    return Path(d)


def model_path() -> Path:
    p = os.environ.get("DHE_FACE_LANDMARKER_PATH")
    if p:
        return Path(p)
    p = data_dir() / "models" / "face_landmarker.task"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        print(f"얼굴 점 모델 받는 중 → {p}", file=sys.stderr)
        urllib.request.urlretrieve(MODEL_URL, p)
    return p


def core(reqs: list[dict]) -> list:
    """앱 코드(측정·프롬프트·관문) 호출 — vlm_core.mjs"""
    r = subprocess.run(
        ["node", str(HERE / "vlm_core.mjs")],
        input=json.dumps(reqs),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if r.returncode != 0:
        raise RuntimeError(f"vlm_core.mjs 실패: {r.stderr[-800:]}")
    return json.loads(r.stdout)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def detect(path: Path, landmarker) -> tuple[list[dict], int, int] | None:
    import mediapipe as mp

    img = mp.Image.create_from_file(str(path))
    res = landmarker.detect(img)
    if not res.face_landmarks:
        return None
    w, h = img.width, img.height
    return [{"x": p.x * w, "y": p.y * h} for p in res.face_landmarks[0]], w, h


def main() -> None:
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

    photos_dir = data_dir() / "vlm-eval" / "photos"
    work = data_dir() / "vlm-eval" / "work"
    work.mkdir(parents=True, exist_ok=True)
    photos = sorted(p for p in photos_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not photos:
        sys.exit(f"사진이 없습니다: {photos_dir}")

    opts = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path())),
        running_mode=RunningMode.IMAGE,
        num_faces=1,
    )
    found: list[tuple[Path, str, list[dict], int, int]] = []
    missed: list[str] = []
    with FaceLandmarker.create_from_options(opts) as lmk:
        for p in photos:
            r = detect(p, lmk)
            if r is None:
                missed.append(p.name)
                continue
            found.append((p, sha256(p), *r))

    measures = core([{"op": "measure", "lm": lm} for _, _, lm, _, _ in found])
    for (p, digest, lm, w, h), m in zip(found, measures, strict=True):
        if isinstance(m, dict) and "error" in m:
            missed.append(f"{p.name} (측정 실패: {m['error']})")
            continue
        out = {"id": digest[:12], "photo": p.name, "sha256": digest, "w": w, "h": h, "lm": lm, "m": m}
        (work / f"{p.stem}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"측정 {len(found) - sum(1 for x in missed if '측정 실패' in x)}장 → {work}")
    if missed:
        print("건너뜀: " + ", ".join(missed), file=sys.stderr)


if __name__ == "__main__":
    main()
