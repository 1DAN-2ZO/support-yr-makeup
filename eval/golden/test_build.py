"""골든 세트 만들기 — 가짜 얼굴 점으로 사진 폴더 → 시험지 → 라벨 합치기 → 검사까지 (실제 사진·모델 없이)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.golden.build import apply_labels, build, check, parse_name, read_labels, write_labels  # noqa: E402

PARTS = ["brow", "liner", "lip", "shadow", "cheek"]
LOOKS = {"daily", "smoky"}


def fake_detect(path: Path):
    """얼굴 점 478개 (이름에 noface 가 있으면 못 찾음)"""
    if "noface" in path.stem:
        return None
    with Image.open(path) as im:
        w, h = im.size
    return [[w / 2 + i % 10, h / 2 + i // 10] for i in range(478)], w, h


def photo(path: Path, color=(200, 160, 140), exif_rotate: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", (40, 20), color)
    if exif_rotate:
        exif = Image.Exif()
        exif[0x0112] = 6  # 폰 세로 사진: 90° 돌려 보라는 표시
        im.save(path, "JPEG", exif=exif)
    else:
        im.save(path)


def test_이름에서_부위_화장_메모를_읽는다():
    assert parse_name("liner_smoky_off", PARTS, LOOKS) == ("liner", "smoky", "off")
    assert parse_name("lip", PARTS, LOOKS) == ("lip", None, "")
    assert parse_name("brow_test2", PARTS, LOOKS) == ("brow", None, "test2")
    assert parse_name("bare", PARTS, LOOKS) is None


def test_사진_폴더에서_시험지를_만든다(tmp_path: Path):
    raw = tmp_path / "golden" / "raw"
    photo(raw / "p01" / "bare.jpg")
    photo(raw / "p01" / "liner_smoky.jpg", (60, 40, 40))
    photo(raw / "p01" / "lip_off.png", (180, 60, 80))
    photo(raw / "p02" / "liner.jpg")  # 맨얼굴이 없다
    photo(raw / "p03" / "bare.jpg")
    photo(raw / "p03" / "cheek_noface.jpg")  # 얼굴을 못 찾는다
    photo(raw / "p03" / "hello.jpg")  # 부위로 시작하지 않는다

    items, problems = build(tmp_path, fake_detect, PARTS, LOOKS)
    assert [it["id"] for it in items] == ["p01_liner_smoky", "p01_lip_off"]
    it = items[0]
    assert it["part"] == "liner" and it["look"] == "smoky" and it["person_id"] == "p01"
    # 채점기가 읽는 PNG 와 얼굴 점, data_dir 기준 상대 경로
    assert it["bare"] == "golden/work/p01/bare.png" and it["makeup"] == "golden/work/p01/liner_smoky.png"
    assert len(json.loads((tmp_path / it["makeup_lm"]).read_text(encoding="utf-8"))) == 478
    assert len(it["sha256"]["bare"]) == 64 and it["label"] is None
    assert any("p02" in p and "맨얼굴" in p for p in problems)
    assert any("얼굴을 못 찾음" in p for p in problems)
    assert any("hello" in p for p in problems)


def test_폰_사진의_회전_정보를_픽셀에_반영한다(tmp_path: Path):
    photo(tmp_path / "golden" / "raw" / "p01" / "bare.jpg", exif_rotate=True)
    photo(tmp_path / "golden" / "raw" / "p01" / "brow.jpg", exif_rotate=True)
    items, _ = build(tmp_path, fake_detect, PARTS, LOOKS)
    with Image.open(tmp_path / items[0]["bare"]) as im:
        assert im.size == (20, 40)  # 40×20 가로 사진이 세로로 섰다


def test_라벨_표를_합친다_같으면_그_값_다르면_final(tmp_path: Path):
    items = [
        {"id": x, "part": "lip", "look": None, "labels": {}, "label": None} for x in ("a1", "a2", "a3", "a4")
    ]
    csv_path = tmp_path / "labels.csv"
    write_labels(csv_path, items, {})
    rows = read_labels(csv_path)
    rows["a1"].update(a="ok", b="ok")
    rows["a2"].update(a="ok", b="off")
    rows["a3"].update(a="slight", b="off", final="slight")
    rows["a4"].update(a="good")
    problems = apply_labels(items, rows)
    assert [it["label"] for it in items] == ["ok", None, "slight", None]
    assert items[1]["labels"] == {"a": "ok", "b": "off"}
    assert any("a2" in p and "final" in p for p in problems)
    assert any("a4" in p and "good" in p for p in problems)


def test_다시_돌려도_적어_둔_라벨은_남는다(tmp_path: Path):
    items = [{"id": "x1", "part": "lip", "look": "daily"}]
    csv_path = tmp_path / "labels.csv"
    write_labels(csv_path, items, {"x1": {"a": "ok", "b": "slight", "final": ""}})
    write_labels(csv_path, items + [{"id": "x2", "part": "brow", "look": None}], read_labels(csv_path))
    rows = read_labels(csv_path)
    assert rows["x1"]["a"] == "ok" and rows["x1"]["b"] == "slight"
    assert rows["x2"]["a"] == ""


def test_검사는_빠진_사진과_바뀐_사진을_찾는다(tmp_path: Path):
    photo(tmp_path / "golden" / "raw" / "p01" / "bare.jpg")
    photo(tmp_path / "golden" / "raw" / "p01" / "brow.jpg")
    items, _ = build(tmp_path, fake_detect, PARTS, LOOKS)
    manifest = {"items": items}
    assert check(manifest, tmp_path) == []
    Image.new("RGB", (40, 20), (0, 0, 0)).save(tmp_path / items[0]["makeup"])  # 사진이 바뀜
    (tmp_path / items[0]["bare"]).unlink()  # 사진이 없어짐
    problems = check(manifest, tmp_path)
    assert any("makeup 사진이 바뀜" in p for p in problems)
    assert any("bare 사진 없음" in p for p in problems)
