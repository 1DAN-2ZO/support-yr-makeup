"""골든 세트 만들기 — 사진 폴더 → 시험지(eval/golden/manifest.json items) + 라벨 표(labels.csv).

    uv run --extra eval python eval/golden/build.py          # 사진 → PNG·얼굴 점·지문 → 시험지 + 라벨 표
    uv run --extra eval python eval/golden/build.py --check  # 검사만 (빠진·바뀐 사진, 잘못된 라벨)

사진은 저장소 밖 $DHE_DATA_DIR 에 둔다 (얼굴 사진은 저장소에 넣지 않는다). 설명서: docs/golden-set-guide.md

넣는 곳   $DHE_DATA_DIR/golden/raw/<person_id>/bare.jpg                  맨얼굴 (한 사람에 한 장)
          $DHE_DATA_DIR/golden/raw/<person_id>/<부위>[_<화장>][_<메모>].jpg  화장 사진 (부위마다)
          예) p01/bare.jpg · p01/liner_smoky.jpg · p01/liner_smoky_off.jpg · p01/lip.jpg
          - 부위: brow · liner · lip · shadow · cheek (manifest parts)
          - 화장: rules/looks.json 의 id (daily·edgy…). 없으면 null → 채점기가 기본 화장으로 잰다
          - 메모: 아무 말 (off·test2 등) — 같은 부위를 여러 장 찍을 때 이름이 겹치지 않게
          - person_id 는 이름 대신 p01 같은 번호로 (결과 표에 남는다)
만드는 것 $DHE_DATA_DIR/golden/work/<person_id>/<이름>.png · .lm.json  — 채점기가 읽는 PNG 와 얼굴 점 478개
          eval/golden/manifest.json 의 items                        — 경로·지문·라벨 (사진은 없음)
          $DHE_DATA_DIR/golden/labels.csv                           — 사람 두 명이 채우는 라벨 표
라벨 표   id · part · look · a · b · final — a·b 에 각자 ok / slight / off. 같으면 그 값이 정답,
          다르면 둘이 상의해 final 에 적는다. 다시 돌려도 이미 적은 라벨은 지워지지 않는다

얼굴 점 모델은 eval/vlm/landmarks.py 와 같은 것 (앱과 같은 face_landmarker.task).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import GOLDEN, ROOT, load_golden  # noqa: E402

PHOTO_EXT = {".jpg", ".jpeg", ".png"}
LABELS = ("ok", "slight", "off")
CSV_FIELDS = ("id", "part", "look", "a", "b", "final")

# 사진 경로 → (얼굴 점 [[x, y], …], 폭, 높이). 못 찾으면 None
Detect = Callable[[Path], "tuple[list[list[float]], int, int] | None"]


def look_ids() -> set[str]:
    return {
        lk["id"] for lk in json.loads((ROOT / "rules" / "looks.json").read_text(encoding="utf-8"))["looks"]
    }


def parse_name(stem: str, parts: list[str], looks: set[str]) -> tuple[str, str | None, str] | None:
    """liner_smoky_off → (liner, smoky, off). 부위가 아니면 None (bare 등)"""
    bits = stem.split("_")
    if bits[0] not in parts:
        return None
    look = bits[1] if len(bits) > 1 and bits[1] in looks else None
    tag = "_".join(bits[2:] if look else bits[1:])
    return bits[0], look, tag


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def to_png(src: Path, dst: Path) -> None:
    """폰 사진(JPG, 회전 정보)을 채점기가 읽는 PNG 로. 회전 정보를 픽셀에 반영한다 — 안 하면 얼굴이 눕는다"""
    from PIL import Image, ImageOps

    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        ImageOps.exif_transpose(im).convert("RGB").save(dst, "PNG")


def prepare(src: Path, work: Path, rel_root: Path, detect: Detect) -> dict | str:
    """사진 한 장 → PNG + 얼굴 점 파일. 성공이면 {png, lm, sha}(data_dir 기준 상대 경로), 실패면 이유"""
    png = work / f"{src.stem}.png"
    lm = work / f"{src.stem}.lm.json"
    to_png(src, png)
    r = detect(png)
    if r is None:
        return f"얼굴을 못 찾음: {src.relative_to(rel_root)}"
    pts, w, h = r
    if len(pts) < 478:
        return f"얼굴 점이 {len(pts)}개: {src.relative_to(rel_root)}"
    lm.write_text(json.dumps([[round(x, 2), round(y, 2)] for x, y in pts]), encoding="utf-8")
    return {
        "png": png.relative_to(rel_root).as_posix(),
        "lm": lm.relative_to(rel_root).as_posix(),
        "sha": sha256(png),
    }


def build(data: Path, detect: Detect, parts: list[str], looks: set[str]) -> tuple[list[dict], list[str]]:
    """raw/ 폴더 → 시험지 항목 (라벨은 비워 둠). 문제는 모아서 돌려준다 — 한 장이 틀려도 나머지는 만든다"""
    raw = data / "golden" / "raw"
    items: list[dict] = []
    problems: list[str] = []
    if not raw.is_dir():
        return items, [f"사진 폴더가 없습니다: {raw}"]
    for person in sorted(p for p in raw.iterdir() if p.is_dir()):
        photos = sorted(p for p in person.iterdir() if p.suffix.lower() in PHOTO_EXT)
        bare_src = next((p for p in photos if p.stem.lower() == "bare"), None)
        if bare_src is None:
            problems.append(f"{person.name}: 맨얼굴(bare.jpg)이 없어 건너뜀")
            continue
        work = data / "golden" / "work" / person.name
        bare = prepare(bare_src, work, data, detect)
        if isinstance(bare, str):
            problems.append(bare)
            continue
        for src in photos:
            if src is bare_src:
                continue
            name = parse_name(src.stem, parts, looks)
            if name is None:
                problems.append(f"이름을 모름(부위로 시작해야 함): {src.relative_to(data)}")
                continue
            part, look, _tag = name
            mk = prepare(src, work, data, detect)
            if isinstance(mk, str):
                problems.append(mk)
                continue
            items.append(
                {
                    "id": f"{person.name}_{src.stem}",
                    "person_id": person.name,
                    "part": part,
                    "source": "self",
                    "look": look,
                    "bare": bare["png"],
                    "makeup": mk["png"],
                    "bare_lm": bare["lm"],
                    "makeup_lm": mk["lm"],
                    "sha256": {"bare": bare["sha"], "makeup": mk["sha"]},
                    "labels": {"a": None, "b": None},
                    "label": None,
                }
            )
    return items, problems


def read_labels(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {row["id"]: row for row in csv.DictReader(f) if row.get("id")}


def apply_labels(items: list[dict], rows: dict[str, dict]) -> list[str]:
    """라벨 표 → 항목. a·b 가 같으면 그 값, 다르면 final. 잘못된 값은 문제로 돌려준다"""
    problems: list[str] = []
    for it in items:
        row = rows.get(it["id"])
        if not row:
            continue
        vals = {}
        for k in ("a", "b", "final"):
            v = (row.get(k) or "").strip().lower()
            if v and v not in LABELS:
                problems.append(f"{it['id']}: {k} 값 '{v}' — ok / slight / off 중 하나")
                v = ""
            vals[k] = v or None
        it["labels"] = {"a": vals["a"], "b": vals["b"]}
        if vals["final"]:
            it["label"] = vals["final"]
        elif vals["a"] and vals["a"] == vals["b"]:
            it["label"] = vals["a"]
        else:
            it["label"] = None
            if vals["a"] and vals["b"]:
                problems.append(
                    f"{it['id']}: 두 사람 라벨이 달라요({vals['a']}·{vals['b']}) — final 에 정해 주세요"
                )
    return problems


def write_labels(path: Path, items: list[dict], rows: dict[str, dict]) -> None:
    """라벨 표 틀 — 이미 적은 값은 그대로, 새 사진은 빈 줄로"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        for it in items:
            old = rows.get(it["id"], {})
            w.writerow(
                {
                    "id": it["id"],
                    "part": it["part"],
                    "look": it["look"] or "",
                    **{k: old.get(k, "") for k in ("a", "b", "final")},
                }
            )


def check(manifest: dict, data: Path) -> list[str]:
    """시험지 검사 — 사진이 있나, 지문이 같나, 얼굴 점이 478개인가, 라벨 값이 맞나"""
    problems: list[str] = []
    for it in manifest.get("items", []):
        for key in ("bare", "makeup"):
            p = data / it[key]
            if not p.exists():
                problems.append(f"{it['id']}: {key} 사진 없음 ({it[key]})")
            elif sha256(p) != it["sha256"][key]:
                problems.append(f"{it['id']}: {key} 사진이 바뀜 (지문 다름)")
        for key in ("bare_lm", "makeup_lm"):
            p = data / it[key]
            if not p.exists() or len(json.loads(p.read_text(encoding="utf-8"))) < 478:
                problems.append(f"{it['id']}: {key} 얼굴 점 없음·모자람")
        if it.get("label") not in (None, *LABELS):
            problems.append(f"{it['id']}: label '{it['label']}'")
    return problems


def mediapipe_detect() -> Detect:
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

    from eval.vlm.landmarks import model_path

    lmk = FaceLandmarker.create_from_options(
        FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path())),
            running_mode=RunningMode.IMAGE,
            num_faces=1,
        )
    )

    def detect(path: Path):
        import mediapipe as mp

        img = mp.Image.create_from_file(str(path))
        res = lmk.detect(img)
        if not res.face_landmarks:
            return None
        return [[p.x * img.width, p.y * img.height] for p in res.face_landmarks[0]], img.width, img.height

    return detect


def main(argv: list[str] | None = None, detect: Detect | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="고치지 않고 검사만")
    args = ap.parse_args(argv)

    import os

    manifest = load_golden()
    d = os.environ.get(manifest.get("data_dir_env", "DHE_DATA_DIR"))
    if not d:
        print("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둡니다)", file=sys.stderr)
        return 2
    data = Path(d)

    if args.check:
        problems = check(manifest, data)
        n = len(manifest.get("items", []))
        labeled = sum(1 for it in manifest.get("items", []) if it.get("label"))
        print(f"시험지 {n}개 · 정답 있음 {labeled}개 · 문제 {len(problems)}개")
        for p in problems:
            print(f"  - {p}")
        return 1 if problems else 0

    items, problems = build(data, detect or mediapipe_detect(), manifest["parts"], look_ids())
    labels_csv = data / "golden" / "labels.csv"
    rows = read_labels(labels_csv)
    problems += apply_labels(items, rows)
    write_labels(labels_csv, items, rows)
    manifest["items"] = items
    GOLDEN.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    people = len({it["person_id"] for it in items})
    labeled = sum(1 for it in items if it["label"])
    print(f"사람 {people}명 · 시험지 {len(items)}개 · 정답 있음 {labeled}개 → {GOLDEN.relative_to(ROOT)}")
    print(f"라벨 표: {labels_csv}  (a·b 채우고 다시 돌리면 합쳐져요)")
    for p in problems:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
