"""합성 화장 세트 — 표·그림 (진짜 사진 없이)"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import painted as pt  # noqa: E402


def row(part, level, score, pred, person="p1", look="edgy", reason=None):
    scored = reason is None
    return {
        "person": person,
        "look": look,
        "part": part,
        "level": level,
        "expect": {"under": "slight", "ok": "ok", "slight": "slight", "heavy": "off"}[level],
        "pred": pred if scored else None,
        "score": score if scored else None,
        "status": "scored" if scored else "check_only",
        "check_reason": reason,
        "codes": [],
        "crop": f"crops/{person}/{look}/{part}_{level}.png",
    }


def test_확인만은_틀린_답이_아니라_무응답으로_센다():
    rows = [row("lip", "ok", 92, "ok"), row("lip", "ok", None, None, person="p2", reason="subtle")]
    s = pt.summarize(rows)[0]
    assert s["칸 수"] == 2 and s["점수 낸 칸"] == 1
    assert s["기대와 일치"] == "100%"  # 확인만 한 칸은 분모에서 빠진다
    assert "피부와 가까움 1" in s["확인만"]
    assert pt.hit(rows[1]) is None and pt.hit(rows[0]) is True


def test_기대와_다른_판정을_센다():
    rows = [row("lip", "heavy", 70, "slight"), row("lip", "heavy", 30, "off", person="p2")]
    s = pt.summarize(rows)[0]
    assert s["기대"] == "많이" and s["기대와 일치"] == "50%" and s["맞음·조금·많이"] == "0·1·1"


def test_점수_순서는_네_단계가_다_점수를_낸_묶음만_본다():
    good = [row("lip", lv, sc, "ok") for lv, sc in [("under", 58), ("ok", 92), ("slight", 70), ("heavy", 40)]]
    flat = [
        row("lip", lv, sc, "ok", person="p2")
        for lv, sc in [("under", 58), ("ok", 92), ("slight", 70), ("heavy", 70)]
    ]
    part = [
        row("lip", "ok", 90, "ok", person="p3"),
        row("lip", "heavy", None, None, person="p3", reason="faint"),
    ]
    o = next(r for r in pt.ordering(good + flat + part) if r["부위"] == "입술")
    assert o["묶음"] == 2  # p3 은 빠진다
    assert o["적당 > 덜 채움"] == "100%" and o["조금 번짐 > 많이 번짐"] == "50%" and o["셋 다"] == "50%"


def test_그림_한_장에_맨얼굴과_네_단계를_나란히(tmp_path: Path):
    from PIL import Image

    rows = []
    for part in pt.PARTS:
        (tmp_path / "crops" / "p1" / "edgy").mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (60, 30), "pink").save(tmp_path / "crops" / "p1" / f"bare_{part}.png")
        for lv in pt.LEVELS:
            r = row(part, lv, 90, "ok")
            Image.new("RGB", (60, 30), "tan").save(tmp_path / r["crop"])
            rows.append(r)
    out = tmp_path / "sheets" / "p1_edgy.png"
    pt.sheet(tmp_path, "p1", "edgy", "세미 스모키", rows, out)
    with Image.open(out) as im:
        assert im.width >= 300 * 5 and im.height > 5 * 150  # 5칸 × 5줄
