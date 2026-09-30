"""FFHQ-Makeup 동양인 목록·꺼내기 — 진짜 zip 없이 작은 가짜 zip 으로"""

from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ffhq_east_asian as fe  # noqa: E402


def test_list_is_well_formed():
    rows = fe.read_list(which="all")
    assert len(rows) == 240
    sel = [r for r in rows if r["set"] == "sel30"]
    assert len(sel) == 30 and all(r["reviewed"] == "yes" for r in sel)
    assert len({r["ffhq_makeup_id"] for r in rows}) == 240  # 겹치는 사람 없음
    for r in rows:
        assert r["zip_path"] == f"{r['ffhq_makeup_id']}/bare.jpg"
        assert len(r["sha256"]) == 64 and float(r["p_east_asian"]) >= 0.8


def _zip(tmp: Path, files: dict[str, bytes]) -> Path:
    z = tmp / "fake.zip"
    with zipfile.ZipFile(z, "w") as f:
        for n, b in files.items():
            f.writestr(n, b)
    return z


def test_extract_checks_hash(tmp_path):
    ok, other = b"face-a", b"face-b"
    rows = [
        {"ffhq_makeup_id": "000001", "zip_path": "000001/bare.jpg", "sha256": hashlib.sha256(ok).hexdigest()},
    ]
    z = _zip(tmp_path, {"000001/bare.jpg": ok, "000001/makeup_01.jpg": b"x"})
    got = fe.extract(z, rows, tmp_path / "out")
    assert [p.name for p in got] == ["ea_000001.jpg"] and got[0].read_bytes() == ok
    assert "CC BY-NC-SA" in (tmp_path / "out" / "NOTICE.txt").read_text(encoding="utf-8")

    bad = _zip(tmp_path, {"000001/bare.jpg": other})
    with pytest.raises(SystemExit, match="sha256"):
        fe.extract(bad, rows, tmp_path / "out2")


def test_to_golden_layout(tmp_path):
    photos = []
    for n in ("ea_000002.jpg", "ea_000001.jpg"):
        p = tmp_path / n
        p.write_bytes(n.encode())
        photos.append(p)
    fe.to_golden(photos, tmp_path / "raw")
    assert (tmp_path / "raw" / "ea01" / "bare.jpg").read_bytes() == b"ea_000001.jpg"
    assert (tmp_path / "raw" / "ea02" / "bare.jpg").exists()
