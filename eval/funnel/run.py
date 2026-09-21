"""E-8 사용자 흐름(퍼널) — 이벤트 로그를 모아 결과표 행으로 낸다.

로그는 앱에서 `logStore.exportJsonl()` 로 내보낸 `.jsonl` 파일이다.
사용자 실험 때 **동의받아** 내보낸 것만 쓴다. 저장소에 넣지 않는다 — `DHE_DATA_DIR` 아래.

    uv run python eval/funnel/run.py                      # DHE_DATA_DIR/events/*.jsonl
    uv run python eval/funnel/run.py --dir 경로 --out 이름
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import load_golden, result_path, write_rows  # noqa: E402
from eval.funnel.funnel import aggregate, parse_jsonl  # noqa: E402

DEFAULT_SUBDIR = "events"


def find_logs(explicit: str | None) -> list[Path]:
    if explicit:
        base = Path(explicit)
    else:
        import os

        root = os.environ.get("DHE_DATA_DIR")
        if not root:
            return []
        base = Path(root) / DEFAULT_SUBDIR
    return sorted(base.glob("*.jsonl")) if base.is_dir() else []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=None, help="jsonl 이 들어 있는 폴더 (기본 DHE_DATA_DIR/events)")
    ap.add_argument("--out", default="funnel", help="결과 파일 이름 조각")
    args = ap.parse_args()

    files = find_logs(args.dir)
    events = []
    for f in files:
        events.extend(parse_jsonl(f.read_text(encoding="utf-8")))

    rows = aggregate(events) if events else []
    g = load_golden()
    path = result_path(args.out, "app", g["golden_version"])
    write_rows(path, rows)
    if rows:
        print(f"{path.name}: 파일 {len(files)}개, 이벤트 {len(events)}개 → 지표 {len(rows)}줄")
    else:
        print(f"{path.name}: skipped — 로그 파일이 없습니다 (DHE_DATA_DIR/{DEFAULT_SUBDIR}/*.jsonl)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
