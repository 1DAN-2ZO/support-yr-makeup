"""하네스 자체가 돈다는 검사 (골든 세트가 비어도)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_run_all_and_report(tmp_path, monkeypatch):
    r = subprocess.run(
        [sys.executable, str(ROOT / "eval" / "run_all.py"), "--only", "score"], capture_output=True, text=True
    )
    assert r.returncode == 0, r.stdout + r.stderr
    out = ROOT / "docs" / "eval-results-v6.md"
    assert out.exists()
    assert "자동 생성" in out.read_text(encoding="utf-8")
