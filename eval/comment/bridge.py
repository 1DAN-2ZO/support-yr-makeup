"""화면 6 코멘트 실험 — 앱 코드 다리(core.mjs)와 데이터 위치. generate.py · results.py 가 같이 쓴다"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "vlm"))
from landmarks import data_dir  # noqa: E402


def core(reqs: list[dict]) -> list:
    """앱 코드 다리 — core.mjs (채점 타입 · 한 줄 평 · 문구표를 그대로 쓴다)"""
    r = subprocess.run(
        ["node", str(HERE / "core.mjs")],
        input=json.dumps(reqs, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if r.returncode != 0:
        raise RuntimeError(f"core.mjs 실패: {r.stderr[-800:]}")
    return json.loads(r.stdout)


def out_dir() -> Path:
    return data_dir() / "comment-eval"
