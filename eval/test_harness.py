"""하네스 자체가 돈다는 검사 (골든 세트가 비어도)."""

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_run_all_and_report(tmp_path):
    # 테스트는 저장소의 results/·docs/ 를 건드리지 않는다
    env = {
        **os.environ,
        "DHE_EVAL_RESULTS": str(tmp_path / "results"),
        "DHE_EVAL_OUT": str(tmp_path / "out.md"),
    }
    r = subprocess.run(
        [sys.executable, str(ROOT / "eval" / "run_all.py"), "--only", "score"],
        capture_output=True,
        text=True,
        env=env,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    out = tmp_path / "out.md"
    assert out.exists()
    assert "자동 생성" in out.read_text(encoding="utf-8")
