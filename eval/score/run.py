"""E-1·E-7 채점 평가 — 골든 세트의 PartResult(사람 판정) vs 채점기 판정.

채점기(`poc/full/lib/score.js` → 통합 후 `src/core/score.js`)는 폰에서 도는 JS라 Python으로 옮기지 않는다.
이 스크립트는 Node로 `eval/score/score_cli.mjs`(만들 예정)를 불러 결과 JSON을 받고, 사람 판정과 맞춘다.

지금은 골든 세트가 비어 있어 'skipped' 한 줄을 남긴다. 촬영 세션 뒤 items가 차면 그대로 동작하게 채운다.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import ROOT, data_dir, load_golden, result_path, write_rows  # noqa: E402

SCORE_VERSION = "score-v0.1"
CLI = ROOT / "eval" / "score" / "score_cli.mjs"


def run_node(items: list[dict], base: Path) -> list[dict]:
    if shutil.which("node") is None:
        raise RuntimeError("node not found — 채점기는 JS라 Node가 필요하다")
    payload = json.dumps({"items": items, "data_dir": str(base)})
    out = subprocess.run(["node", str(CLI)], input=payload, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidate", default=None, help="S-4 색 보정 후보 등 채점기 변형 이름")
    args = ap.parse_args()

    g = load_golden()
    base = data_dir(g)
    rows: list[dict] = []
    if g["items"] and base and CLI.exists():
        preds = run_node(g["items"], base)
        agree = sum(1 for p in preds if p["pred"] == p["label"])
        rows.append(
            {
                "eval": "E-1",
                "metric": "부위 판정 일치율",
                "baseline": "",
                "current": round(agree / len(preds), 3),
                "pass": "",
                "n": len(preds),
                "note": args.candidate or "",
            }
        )
    path = result_path("score", (args.candidate or SCORE_VERSION), g["golden_version"])
    write_rows(path, rows)
    print(path.name, "rows" if rows else "skipped (golden empty or score_cli.mjs missing)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
