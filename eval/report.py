"""results/*.csv → docs/eval-results-v6.md. 손으로 쓰지 않는다.
평가 이름별로 가장 최근 파일 하나씩만 표에 올리고, 이전 결과는 '이력' 절에 파일명만.
"""

from __future__ import annotations

import csv
import os
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eval.common import RESULTS, ROOT  # noqa: E402

OUT = Path(os.environ.get("DHE_EVAL_OUT", ROOT / "docs" / "eval-results-v6.md"))
HEAD = "| 평가 | 지표 | 기준선 | 현재 | 통과 기준 | n | 비고 | 파일 |\n|---|---|---|---|---|---|---|---|\n"


def main() -> int:
    files = sorted(RESULTS.glob("*.csv")) if RESULTS.exists() else []
    latest: dict[str, Path] = {}
    for f in files:  # 이름 규칙: 날짜_커밋_이름_모델_골든.csv → 이름은 3번째
        parts = f.stem.split("_")
        if len(parts) >= 3:
            latest[parts[2]] = f  # sorted라 뒤가 최신
    rows_by_name: dict[str, list[dict]] = defaultdict(list)
    for name, f in latest.items():
        with f.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                r["file"] = f.name
                rows_by_name[name].append(r)

    lines = [
        "# 평가 결과 (자동 생성 — eval/report.py)",
        "",
        "> 손으로 고치지 않는다. `uv run python eval/run_all.py` 가 갱신한다.",
        "",
    ]
    lines.append("## 최신")
    lines.append("")
    lines.append(HEAD.rstrip("\n"))
    for name in sorted(rows_by_name):
        for r in rows_by_name[name]:
            cells = [r.get(k, "") for k in ("eval", "metric", "baseline", "current", "pass", "n", "note")]
            lines.append("| " + " | ".join(str(c) for c in cells) + f" | `{r['file']}` |")
    if not rows_by_name:
        lines.append("| — | 아직 결과 없음 | | | | | 골든 세트를 채우면 채워진다 | |")
    lines += ["", "## 이력", ""]
    lines += [f"- `{f.name}`" for f in files] or ["- 없음"]
    lines += ["", "## 실험 노트", ""]
    lines += ["날짜 · 설정 이름 · 바뀐 것 · 결과 · 채택 여부 — 사람이 한 줄씩 적는 유일한 절.", ""]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("wrote", OUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
