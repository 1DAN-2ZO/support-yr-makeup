"""FFHQ-Makeup 동양인 맨얼굴 — 저장소에는 목록만, 사진은 각자 FFHQ-Makeup 에서 꺼내 저장소 밖에 둔다.

    uv run python eval/samples/ffhq_east_asian.py              # 확인한 30장 → $DHE_DATA_DIR/samples/…
    uv run python eval/samples/ffhq_east_asian.py --download   # zip 이 없으면 받는다 (약 3.6GB)
    uv run --extra vlm python eval/samples/ffhq_east_asian.py --landmarks   # 얼굴 점 478개(.lm.json)도
    uv run python eval/samples/ffhq_east_asian.py --golden     # 골든 세트 자리(golden/raw/eaNN/bare.jpg)에도

코드로 만든 합성 얼굴 대신 실제 사람 얼굴 모양(FFHQ 바탕)으로 채점·측정을 시험하려고 둔다 (2026-09-30).
목록 ffhq_east_asian.csv — VLM 선정 실험(eval/vlm)에서 고른 것:
  sel30  맨얼굴 18,370장 → FairFace 분류 East Asian → 확률 상위 240장 → 눈으로 30장
         (화장이 덜 지워진 합성·옆얼굴·안경·어린이·감은 눈·눈을 가린 앞머리 뺌)
  pool   나머지 210장 — 눈으로 보지 않았다. 화장 잔여·옆얼굴·어린이가 섞여 있다
받은 파일은 sha256 으로 목록과 같은지 확인한다 — 다르면 멈춘다.

라이선스: FFHQ-Makeup (cyberagent) CC BY-NC-SA 4.0. **비상업 · 평가·참고만,
학습 데이터(합성 학습의 바탕 얼굴 포함)로 쓰지 않는다** (docs/data-plan-v6.md).
사진은 저장소에 넣지 않는다 — 꺼내는 곳은 $DHE_DATA_DIR 아래.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import shutil
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LIST = HERE / "ffhq_east_asian.csv"
ZIP_URL = "https://huggingface.co/datasets/cyberagent/FFHQ-Makeup/resolve/main/FFHQ-Makeup.zip"
NOTICE = """FFHQ-Makeup (cyberagent) — https://huggingface.co/datasets/cyberagent/FFHQ-Makeup
라이선스 CC BY-NC-SA 4.0. 같은 얼굴의 맨얼굴·화장 쌍을 합성한 데이터 (FFHQ 바탕).
비상업 · 평가·참고만. 학습 데이터로 쓰지 않는다. 다른 곳에 올리거나 퍼뜨리지 않는다.
목록·고른 방법: 저장소 eval/samples/ffhq_east_asian.csv · README.md
"""


def data_dir() -> Path:
    d = os.environ.get("DHE_DATA_DIR")
    if not d:
        sys.exit("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)")
    return Path(d)


def read_list(path: Path = LIST, which: str = "sel30") -> list[dict]:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    return rows if which == "all" else [r for r in rows if r["set"] == which]


def download(zip_path: Path) -> None:
    import httpx  # noqa: PLC0415

    zip_path.parent.mkdir(parents=True, exist_ok=True)
    part = zip_path.with_suffix(".part")
    done = part.stat().st_size if part.exists() else 0  # 끊겼으면 이어 받는다
    headers = {"Range": f"bytes={done}-"} if done else {}
    print(f"받는 중 {ZIP_URL} → {zip_path}")
    with httpx.stream("GET", ZIP_URL, headers=headers, follow_redirects=True, timeout=60) as r:
        r.raise_for_status()
        with part.open("ab" if done else "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    part.rename(zip_path)


def extract(zip_path: Path, rows: list[dict], out: Path) -> list[Path]:
    """zip 에서 목록의 맨얼굴만 꺼낸다. 이름은 ea_<번호>.jpg. sha256 이 다르면 멈춘다"""
    out.mkdir(parents=True, exist_ok=True)
    got = []
    with zipfile.ZipFile(zip_path) as z:
        names = set(z.namelist())
        for r in rows:
            if r["zip_path"] not in names:
                sys.exit(f"zip 에 없음: {r['zip_path']} — FFHQ-Makeup 판이 다를 수 있다")
            data = z.read(r["zip_path"])
            if hashlib.sha256(data).hexdigest() != r["sha256"]:
                sys.exit(f"목록과 다른 파일: {r['zip_path']} (sha256) — FFHQ-Makeup 판이 다를 수 있다")
            p = out / f"ea_{r['ffhq_makeup_id']}.jpg"
            p.write_bytes(data)
            got.append(p)
    (out / "NOTICE.txt").write_text(NOTICE, encoding="utf-8")
    return got


def landmarks(photos: list[Path]) -> list[str]:
    """얼굴 점 478개 → <이름>.lm.json ([{x, y}] 픽셀). 앱·eval/vlm 과 같은 face_landmarker"""
    import json  # noqa: PLC0415

    sys.path.insert(0, str(ROOT / "eval" / "vlm"))
    from landmarks import detect, model_path  # noqa: PLC0415
    from mediapipe.tasks.python import BaseOptions  # noqa: PLC0415
    from mediapipe.tasks.python.vision import (  # noqa: PLC0415
        FaceLandmarker,
        FaceLandmarkerOptions,
        RunningMode,
    )

    opts = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_path())),
        running_mode=RunningMode.IMAGE,
        num_faces=1,
    )
    missed = []
    with FaceLandmarker.create_from_options(opts) as lmk:
        for p in photos:
            r = detect(p, lmk)
            if r is None:
                missed.append(p.name)
                continue
            lm, _, _ = r
            p.with_suffix(".lm.json").write_text(
                json.dumps([{"x": round(q["x"], 2), "y": round(q["y"], 2)} for q in lm]), encoding="utf-8"
            )
    return missed


def to_golden(photos: list[Path], golden_raw: Path) -> None:
    """골든 세트 자리(golden/raw/eaNN/bare.jpg)에 맨얼굴로 — 화장 사진은 없으니 맨얼굴 오채점 시험용"""
    for i, p in enumerate(sorted(photos), start=1):
        d = golden_raw / f"ea{i:02d}"
        d.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, d / "bare.jpg")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, help="기본 $DHE_DATA_DIR/ffhq-makeup/FFHQ-Makeup.zip")
    ap.add_argument("--download", action="store_true", help="zip 이 없으면 받는다 (약 3.6GB)")
    ap.add_argument("--set", default="sel30", choices=["sel30", "pool", "all"], help="sel30 = 눈으로 고른 것")
    ap.add_argument("--out", type=Path, help="꺼낼 곳 (기본 $DHE_DATA_DIR/samples/ffhq-east-asian)")
    ap.add_argument("--landmarks", action="store_true", help="얼굴 점도 (uv run --extra vlm)")
    ap.add_argument("--golden", action="store_true", help="$DHE_DATA_DIR/golden/raw/eaNN/bare.jpg 에도 둔다")
    args = ap.parse_args()

    zip_path = args.zip or data_dir() / "ffhq-makeup" / "FFHQ-Makeup.zip"
    if not zip_path.exists():
        if not args.download:
            sys.exit(f"zip 이 없습니다: {zip_path} — --download 로 받거나 --zip 으로 알려 주세요")
        download(zip_path)
    out = args.out or data_dir() / "samples" / "ffhq-east-asian"
    photos = extract(zip_path, read_list(which=args.set), out)
    print(f"맨얼굴 {len(photos)}장 → {out}")
    if args.landmarks:
        missed = landmarks(photos)
        note = f" · 못 찾음 {', '.join(missed)}" if missed else ""
        print(f"얼굴 점 {len(photos) - len(missed)}장{note}")
    if args.golden:
        to_golden(photos, data_dir() / "golden" / "raw")
        print(f"골든 세트 자리 → {data_dir() / 'golden' / 'raw'}/ea01~ea{len(photos):02d}/bare.jpg")


if __name__ == "__main__":
    main()
