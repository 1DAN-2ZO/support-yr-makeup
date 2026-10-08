"""사용 기록을 사람이 읽는 글로 — 작업마다 몇 초 걸렸나 · 화면마다 얼마나 머물렀나 · 어디까지 갔나.

기록이 쌓이는 곳은 백엔드 PC 의 `D:/nudy-data/events/날짜.jsonl` (도커 안에서는 `/data/events`) 이다.
GitHub 의 "사용 기록 보기" 워크플로(.github/workflows/stats.yml)가 백엔드 PC 에서 이 파일을 돌려
결과를 실행 화면에 보여 준다.
손으로 돌릴 때:

    python eval/funnel/show.py D:/nudy-data/events            # 전부
    python eval/funnel/show.py D:/nudy-data/events --days 1   # 최근 하루치 파일만
    python eval/funnel/show.py 경로 --out 결과.md

표준 라이브러리만 쓴다 — 백엔드 컨테이너 안에서 그대로 돈다.
사진 · 얼굴 점은 기록에 없고, 여기서도 세션 번호(sid)는 내보내지 않는다.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from funnel import aggregate, by_session, parse_jsonl  # noqa: E402

KST = timezone(timedelta(hours=9))
RECENT = 30
# 보여 줄 줄 — 앞머리로 고른다 (집계 전체는 eval/funnel/run.py 가 결과표로 낸다)
SECTIONS = (
    ("작업마다 걸린 시간", "작업 · "),
    ("화면마다 머문 시간", "화면 · "),
    ("어디까지 갔나", "퍼널 · "),
    ("어디서 멈췄나", "이탈 위치 · "),
)


def _when(ms: object) -> str:
    if not isinstance(ms, (int, float)) or isinstance(ms, bool):
        return "?"
    return datetime.fromtimestamp(ms / 1000, UTC).astimezone(KST).strftime("%m-%d %H:%M:%S")


def _sec(ms: object) -> str:
    return f"{ms / 1000:.1f}" if isinstance(ms, (int, float)) and not isinstance(ms, bool) else ""


def load(folder: Path, days: int | None) -> tuple[list[Path], list[dict]]:
    files = sorted(folder.glob("*.jsonl")) if folder.is_dir() else []
    if days:
        files = files[-days:]
    events: list[dict] = []
    for f in files:
        events.extend(parse_jsonl(f.read_text(encoding="utf-8")))
    return files, events


def render(files: list[Path], events: list[dict]) -> str:
    """마크다운 한 덩이"""
    out = ["# nudy 사용 기록", ""]
    if not events:
        out.append("기록이 없습니다 — 폴더가 비었거나 아직 아무도 쓰지 않았습니다.")
        return "\n".join(out) + "\n"
    times = [e["t"] for e in events if isinstance(e.get("t"), (int, float))]
    out += [
        f"- 파일 {len(files)}개 ({files[0].stem} ~ {files[-1].stem})"
        f" · 기록 {len(events)}줄 · 세션 {len(by_session(events))}개",
        f"- 기간 {_when(min(times))} ~ {_when(max(times))} (한국 시간)" if times else "- 기간 알 수 없음",
        "",
    ]
    rows = aggregate(events)
    for title, head in SECTIONS:
        mine = [r for r in rows if str(r["metric"]).startswith(head)]
        if not mine:
            continue
        out += [f"## {title}", "", "| 항목 | 값 | 건수 | 참고 |", "|---|---:|---:|---|"]
        out += [
            f"| {str(r['metric'])[len(head) :]} | {r['current']} | {r['n']} | {r['note']} |" for r in mine
        ]
        out.append("")
    if not any(str(r["metric"]).startswith("작업 · ") for r in rows):
        out += [
            "## 작업마다 걸린 시간",
            "",
            "작업 시간 기록(task)이 아직 없습니다 — 2026-10-08 이후 버전의 앱으로 정답사진을 만들면 생깁니다.",  # noqa: E501
            "",
        ]

    tasks = sorted((e for e in events if e.get("name") == "task"), key=lambda e: e.get("t") or 0)[-RECENT:]
    if tasks:
        out += [
            f"## 최근 작업 {len(tasks)}건 (초)",
            "",
            "| 언제 | 작업 | 걸린 시간 | 결과 | 줄 | FLUX | 서버가 부르고 받기까지 | 개수 | KB |",
            "|---|---|---:|---|---:|---:|---:|---:|---:|",
        ]
        for e in reversed(tasks):
            result = "됨" if e.get("ok") is True else f"안 됨 ({e.get('why')})"
            if e.get("ok") is True and e.get("why"):
                result = f"됨 ({e.get('why')})"
            cells = [
                _when(e.get("t")),
                str(e.get("task")),
                _sec(e.get("ms")),
                result,
                _sec(e.get("queue_ms")),
                _sec(e.get("flux_ms")),
                _sec(e.get("gen_ms")),
            ]
            cells += [str(e["n"]) if "n" in e else "", str(e["kb"]) if "kb" in e else ""]
            out.append("| " + " | ".join(cells) + " |")
        out.append("")
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", nargs="?", default=None, help="jsonl 이 들어 있는 폴더 (기본 DHE_DATA_DIR/events)")
    ap.add_argument("--days", type=int, default=None, help="최근 며칠치 파일만")
    ap.add_argument("--out", default=None, help="결과를 쓸 파일 (없으면 화면에)")
    args = ap.parse_args()
    root = args.dir or (
        str(Path(os.environ["DHE_DATA_DIR"]) / "events") if os.environ.get("DHE_DATA_DIR") else None
    )
    if not root:
        print("폴더를 주세요 (또는 DHE_DATA_DIR)")
        return 2
    text = render(*load(Path(root), args.days))
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
