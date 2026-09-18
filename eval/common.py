"""평가 스크립트 공통: 골든 세트 읽기, 결과 CSV 이름 규칙, 버전 수집."""

from __future__ import annotations

import csv
import datetime as dt
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = ROOT / "eval" / "golden" / "manifest.json"
RESULTS = ROOT / "eval" / "results"


def git_short() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "nogit"


def load_golden() -> dict:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))


def data_dir(manifest: dict) -> Path | None:
    p = os.environ.get(manifest.get("data_dir_env", "DHE_DATA_DIR"))
    return Path(p) if p else None


def result_path(name: str, model_version: str, golden_version: str) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    stamp = dt.date.today().isoformat()
    return RESULTS / f"{stamp}_{git_short()}_{name}_{model_version}_{golden_version}.csv"


def write_rows(path: Path, rows: list[dict]) -> Path:
    if not rows:
        parts = path.stem.split("_")
        rows = [
            {
                "eval": parts[2] if len(parts) > 2 else path.stem,
                "metric": "-",
                "baseline": "",
                "current": "",
                "pass": "",
                "n": 0,
                "note": "skipped",
            }
        ]
    keys = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    return path
