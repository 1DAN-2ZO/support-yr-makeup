"""FFHQ-Makeup 샘플 10명으로 임시 시험지 채우기 (#59) — 사진 변환 + 얼굴 점 파일 + manifest items.

스프린트 S1: 실촬영 전까지는 FFHQ-Makeup 샘플 10명을 임시 평가 세트로 쓴다(골든 고정은 뒤로).
화장은 합성이라 사람 정답(label)은 아직 null.
채점기가 화장을 찾는지·맨얼굴을 화장으로 착각하지 않는지만 본다.

  python eval/golden/build_ffhq.py        # DHE_DATA_DIR/ffhq-makeup/images → DHE_DATA_DIR/golden/ffhq/

만드는 것
- <DHE_DATA_DIR>/golden/ffhq/<id>_{bare,makeup_0N}.png   (score_cli 는 PNG 만 읽는다)
- 같은 이름 .lm.json — MediaPipe 478점, 사진 픽셀 좌표 [[x, y], ...]
- eval/golden/manifest.json 의 items (source 가 ffhq-makeup* 인 항목만 새로 쓴다)
  · 화장 항목: 맨얼굴 vs 화장 5종 × 부위 5개
  · 대조 항목(source ffhq-makeup-bare): 맨얼굴 vs 같은 맨얼굴 × 부위 5개 — '화장 없음'이 나와야 정상
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "eval" / "golden" / "manifest.json"
BASE = Path(os.environ.get("DHE_DATA_DIR", Path.home() / "dhe-data"))
SRC = BASE / "ffhq-makeup" / "images"
REL = Path("golden") / "ffhq"
PARTS = ["brow", "liner", "lip", "shadow", "cheek"]


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def sources(pick: str | None) -> list[tuple[str, Path]]:
    """(원본 이름, 경로) — 이름은 <pid>_bare / <pid>_makeup_0N.

    pick 이 있으면 golden/asian_candidates.json 의 순위 번호(1부터)로 사람을 고르고 전체 데이터에서 읽는다.
    없으면 샘플 폴더(ffhq-makeup/images)를 쓴다.
    """
    if not pick:
        return [(p.stem, p) for p in sorted(SRC.glob("*.jpg"))]
    cand = json.loads((BASE / "golden" / "asian_candidates.json").read_text())
    out = []
    for rank in [int(x) for x in pick.split(",") if x.strip()]:
        d = Path(cand[rank - 1]["file"]).parent
        for f in sorted(d.glob("*.jpg")):
            out.append((f"{d.name}_{f.stem}", f))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", default=None, help="asian_candidates.json 순위 번호, 쉼표로 (예: 1,2,5)")
    ap.add_argument("--source", default="ffhq-makeup", help="시험지 source 이름. 대조 항목은 뒤에 -bare")
    args = ap.parse_args()
    fl = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(BASE / "models" / "face_landmarker.task"))
        )
    )
    out_dir = BASE / REL
    out_dir.mkdir(parents=True, exist_ok=True)
    made: dict[str, str] = {}  # 원본 이름 → 상대 경로(확장자 없음)
    for stem, src in sources(args.pick):
        png = out_dir / f"{stem}.png"
        rgb = Image.open(src).convert("RGB")
        rgb.save(png)
        r = fl.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(rgb)))
        if not r.face_landmarks:
            print("얼굴 못 찾음:", stem, flush=True)
            continue
        lm = [[round(q.x * rgb.width, 2), round(q.y * rgb.height, 2)] for q in r.face_landmarks[0]]
        (out_dir / f"{stem}.lm.json").write_text(json.dumps(lm))
        made[stem] = str(REL / stem)

    items = []
    people = sorted({k.split("_")[0] for k in made if k.endswith("_bare")})
    for pid in people:
        bare = made.get(f"{pid}_bare")
        if not bare:
            continue
        for style in sorted(k for k in made if k.startswith(f"{pid}_makeup_")):
            for part in PARTS:
                items.append(
                    {
                        "id": f"ffhq_{pid}_{style.split('_', 1)[1]}_{part}",
                        "person_id": f"ffhq_{pid}",
                        "part": part,
                        "source": args.source,
                        "bare": f"{bare}.png",
                        "makeup": f"{made[style]}.png",
                        "bare_lm": f"{bare}.lm.json",
                        "makeup_lm": f"{made[style]}.lm.json",
                        "sha256": {
                            "bare": sha(BASE / f"{bare}.png"),
                            "makeup": sha(BASE / f"{made[style]}.png"),
                        },
                        "look": None,  # 룩 템플릿 전이라 비움 (manifest item_fields.look 참고)
                        "labels": {"a": None, "b": None},
                        "label": None,
                    }
                )
        for part in PARTS:  # 대조: 맨얼굴 vs 같은 맨얼굴
            items.append(
                {
                    "id": f"ffhq_{pid}_bare_{part}",
                    "person_id": f"ffhq_{pid}",
                    "part": part,
                    "source": f"{args.source}-bare",
                    "bare": f"{bare}.png",
                    "makeup": f"{bare}.png",
                    "bare_lm": f"{bare}.lm.json",
                    "makeup_lm": f"{bare}.lm.json",
                    "sha256": {"bare": sha(BASE / f"{bare}.png"), "makeup": sha(BASE / f"{bare}.png")},
                    "look": None,  # 룩 템플릿 전이라 비움 (manifest item_fields.look 참고)
                    "labels": {"a": None, "b": None},
                    "label": None,
                }
            )

    g = json.loads(MANIFEST.read_text(encoding="utf-8"))
    keep = [it for it in g["items"] if not str(it.get("source", "")).startswith("ffhq-makeup")]
    g["items"] = keep + items
    MANIFEST.write_text(json.dumps(g, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n_mk = sum(it["source"] == args.source for it in items)
    print(
        f"사람 {len(people)}명 · 화장 항목 {n_mk} · 맨얼굴 대조 {len(items) - n_mk}",
        "→",
        MANIFEST.relative_to(ROOT),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
