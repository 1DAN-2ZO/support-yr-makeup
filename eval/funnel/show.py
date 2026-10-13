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
from funnel import aggregate, by_session, parse_jsonl, summarize_session  # noqa: E402

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


def sources(events: list[dict]) -> list[str]:
    """어디서 왔나 — 들어온 링크(landing 줄의 utm)마다 도착 · 동의 · 촬영 · 저장한 세션 수.

    앱이 켤 때 남긴다 (client/src/core/utm.ts).

    landing 줄이 하나도 없으면 빈 목록 (그 기록이 생기기 전의 기록만 있을 때).
    """
    if not any(e.get("name") == "landing" for e in events):
        return []
    count: dict[tuple[str, str, str], list[int]] = {}
    for evs in by_session(events).values():
        land = next((e for e in evs if e.get("name") == "landing"), None)
        key = ("(기록 없음)", "", "")
        if land:
            src, camp, cont = (land.get(k) for k in ("utm_source", "utm_campaign", "utm_content"))
            key = (str(src or "direct"), str(camp or ""), str(cont or ""))
        s = summarize_session(evs)
        row = count.setdefault(key, [0, 0, 0, 0])
        for i, hit in enumerate((True, s.consented is True, bool(s.shots_ok), s.saved_result)):
            row[i] += int(hit)
    out = [
        "## 어디서 왔나",
        "",
        "| 출처 | 캠페인 | 내용 | 도착 | 동의 | 촬영 | 저장 |",
        "|---|---|---|---:|---:|---:|---:|",
    ]
    for key, row in sorted(count.items(), key=lambda kv: (-kv[1][0], kv[0])):
        out.append("| " + " | ".join([*key, *map(str, row)]) + " |")
    out += ["", "동의하지 않은 사람의 기록은 서버로 오지 않아, 도착은 대부분 동의한 사람 수와 같다.", ""]
    return out


def buttons(events: list[dict]) -> list[str]:
    """무엇을 눌렀나 — 버튼마다 누른 세션 수 · 누른 횟수. 이름의 `:` 뒤(부위 · 까닭)는 떼고 센다.

    버튼 기록이 없으면 빈 목록.
    """
    sessions: dict[str, set[str]] = {}
    presses: dict[str, int] = {}
    guide: set[str] = set()
    for e in events:
        sid = str(e.get("sid"))
        if e.get("name") == "screen_enter" and e.get("screen") == "partguide":
            guide.add(sid)
        if e.get("name") != "button" or not isinstance(e.get("button"), str):
            continue
        key = e["button"].split(":", 1)[0]
        sessions.setdefault(key, set()).add(sid)
        presses[key] = presses.get(key, 0) + 1
    if not presses:
        return []
    out = ["## 무엇을 눌렀나", "", "| 버튼 | 누른 세션 | 누른 횟수 |", "|---|---:|---:|"]
    for key in sorted(presses, key=lambda k: (-len(sessions[k]), k)):
        out.append(f"| {key} | {len(sessions[key])} | {presses[key]} |")
    out.append("")
    if guide:
        live = len(sessions.get("slot_live", set()) & guide)
        out += [
            f"부위 가이드에 들어간 세션 {len(guide)}개 중 {live}개({live / len(guide) * 100:.1f}%)가"
            " 실시간 가이드를 열었다.",
            "",
        ]
    return out


def capture_blocks(events: list[dict]) -> list[str]:
    """촬영에서 무엇에 막혔나 — 사유마다 막힌 세션 수 · 그중 끝내 못 찍은 세션 수 · 막힌 횟수.

    앱은 같은 조건에 3초 넘게 막히면 capture{ok: false, reason} 을 한 번 남긴다 (client core/capture-events).
    찍으면 capture{ok: true}. 촬영 기록이 하나도 없으면 빈 목록.
    """
    entered: set[str] = set()
    shot: set[str] = set()
    stuck: dict[str, set[str]] = {}
    count: dict[str, int] = {}
    for e in events:
        sid = str(e.get("sid"))
        if e.get("name") == "screen_enter" and e.get("screen") == "capture":
            entered.add(sid)
        if e.get("name") != "capture":
            continue
        entered.add(sid)
        if e.get("ok") is True:
            shot.add(sid)
        elif isinstance(e.get("reason"), str):
            stuck.setdefault(e["reason"], set()).add(sid)
            count[e["reason"]] = count.get(e["reason"], 0) + 1
    if not shot and not count:
        return []
    out = ["## 촬영에서 무엇에 막혔나", ""]
    if count:
        out += ["| 사유 | 막힌 세션 | 그중 끝내 못 찍은 세션 | 막힌 횟수 |", "|---|---:|---:|---:|"]
        for key in sorted(count, key=lambda k: (-len(stuck[k]), k)):
            out.append(f"| {key} | {len(stuck[key])} | {len(stuck[key] - shot)} | {count[key]} |")
        out.append("")
    missed = entered - shot
    silent = missed - set().union(*stuck.values()) if stuck else missed
    out += [
        f"촬영 화면에 들어간 세션 {len(entered)}개 중 {len(shot & entered)}개가 찍었다."
        f" 못 찍은 {len(missed)}개 중 {len(silent)}개는 막힌 기록도 없이 떠났다"
        " (3초 넘게 같은 조건에 막혀야 기록이 남는다).",
        "",
    ]
    return out


def errors(events: list[dict]) -> list[str]:
    """오류 — 어디서 · 무슨 오류가 몇 세션에서 몇 번.

    카메라를 못 연 것(camera:NotAllowedError 등)이 여기 나온다.
    글은 80자까지만, 표를 깨는 글자는 바꾼다. 오류 기록이 없으면 빈 목록.
    """
    sessions: dict[tuple[str, str], set[str]] = {}
    count: dict[tuple[str, str], int] = {}
    for e in events:
        if e.get("name") != "error":
            continue
        msg = " ".join(str(e.get("msg")).replace("|", "/").split())[:80]
        key = (str(e.get("where")), msg)
        sessions.setdefault(key, set()).add(str(e.get("sid")))
        count[key] = count.get(key, 0) + 1
    if not count:
        return []
    out = ["## 오류", "", "| 어디서 | 무슨 오류 | 세션 | 횟수 |", "|---|---|---:|---:|"]
    for key in sorted(count, key=lambda k: (-len(sessions[k]), k)):
        out.append(f"| {key[0]} | {key[1]} | {len(sessions[key])} | {count[key]} |")
    out.append("")
    return out


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
    out += sources(events)
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
    out += capture_blocks(events)
    out += errors(events)
    out += buttons(events)
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
