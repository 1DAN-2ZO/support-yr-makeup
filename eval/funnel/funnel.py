"""이벤트 로그(JSONL) → 퍼널·운영 숫자. 순수 함수라 파일 없이도 시험할 수 있다.

로그 형식은 `client/src/core/types.ts` 의 `Event` 다. 한 줄에 하나씩 JSON.
자동으로 붙는 것: sid, t, screen, part, ver.

여기서 내는 숫자 (E-8, work-split-modules-v6.md §3):
  동의 거부율 · 촬영 완주율과 장별 재촬영 · 룩 대기 중 이탈 · 게이트 첫 실패 분포
  · 부위별 확인만·재확인·건너뜀과 이유 · 리뷰 도달률 · 결과 저장 클릭률 · 세션 시간
  · 얼굴 놓침 · 복원 성공률 · 채점 걸린 시간
  · VLM 개인화(vlm_plan, 2026-09-29): 성공률 · 걸린 시간 · 재질문 · 실패 이유 · 실패 뒤 이탈
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

Event = dict[str, Any]

# 옛 이름 → 지금 이름 (#155: 가림은 손만이 아니라 무엇이든 — hand → occluded). 폰에 남은 옛 로그도 같은 줄로
RENAMED = {"hand": "occluded"}


def _name(v: Any) -> str:
    s = str(v)
    return RENAMED.get(s, s)


# 사용자가 흘러가는 순서. 퍼널은 이 순서로 "어디까지 왔나"를 센다
FUNNEL_SCREENS = ["consent", "capture", "looks", "fullrender", "guide", "live", "result", "review"]


def parse_jsonl(text: str) -> list[Event]:
    """깨진 줄은 조용히 버린다 — 기기에서 끊긴 파일이 올 수 있다"""
    out: list[Event] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(ev, dict) and "name" in ev and "sid" in ev:
            out.append(ev)
    return out


def by_session(events: Iterable[Event]) -> dict[str, list[Event]]:
    g: dict[str, list[Event]] = defaultdict(list)
    for e in events:
        g[str(e["sid"])].append(e)
    for v in g.values():
        v.sort(key=lambda e: e.get("t", 0))
    return dict(g)


@dataclass
class SessionSummary:
    sid: str
    consented: bool | None = None
    """도달한 화면 (FUNNEL_SCREENS 중)"""
    reached: set[str] = field(default_factory=set)
    furthest: str | None = None
    shots_ok: set[str] = field(default_factory=set)
    retries: Counter = field(default_factory=Counter)
    gate_fails: Counter = field(default_factory=Counter)
    part_status: dict[str, str] = field(default_factory=dict)
    check_reasons: Counter = field(default_factory=Counter)
    reconfirms: Counter = field(default_factory=Counter)
    saved_result: bool = False
    end_reason: str | None = None
    duration_ms: int | None = None
    lost_face_ms: int = 0
    restore_ok: bool | None = None
    score_ms: list[int] = field(default_factory=list)
    """VLM 개인화 호출 (복원 때 규칙 계획 restored_rule 은 호출이 아니라 빼고 따로 센다)"""
    vlm: list[Event] = field(default_factory=list)
    vlm_restored_rule: int = 0


def summarize_session(events: list[Event]) -> SessionSummary:
    if not events:
        raise ValueError("빈 세션")
    s = SessionSummary(sid=str(events[0]["sid"]))
    times = [e["t"] for e in events if isinstance(e.get("t"), (int, float))]
    if times:
        s.duration_ms = int(max(times) - min(times))

    for e in events:
        name = e.get("name")
        if name == "consent":
            s.consented = bool(e.get("ok"))
        elif name == "screen_enter":
            sc = e.get("screen")
            if sc in FUNNEL_SCREENS:
                s.reached.add(sc)
        elif name == "capture":
            if e.get("ok"):
                s.shots_ok.add(str(e.get("shot")))
            else:
                s.retries[str(e.get("shot"))] += 1
        elif name == "gate_fail":
            s.gate_fails[_name(e.get("first_fail"))] += 1
        elif name == "landmark_lost":
            s.lost_face_ms += int(e.get("ms") or 0)
        elif name == "part_status":
            part, to = str(e.get("part")), str(e.get("to"))
            # 이미 끝난 부위를 다시 진행 중으로 = 재확인
            if s.part_status.get(part) in {"passed", "check_only"} and to == "in_progress":
                s.reconfirms[part] += 1
            s.part_status[part] = to
        elif name == "score":
            if e.get("check_reason"):
                s.check_reasons[_name(e["check_reason"])] += 1
            if isinstance(e.get("ms"), (int, float)):
                s.score_ms.append(int(e["ms"]))
        elif name == "button" and str(e.get("button")).startswith("save"):
            s.saved_result = True
        elif name == "restore":
            s.restore_ok = bool(e.get("ok"))
        elif name == "vlm_plan":
            if e.get("fail") == "restored_rule":
                s.vlm_restored_rule += 1
            else:
                s.vlm.append(e)
        elif name == "session_end":
            s.end_reason = str(e.get("reason"))

    for sc in FUNNEL_SCREENS:
        if sc in s.reached:
            s.furthest = sc
    return s


def _pct(part: int, whole: int) -> float | str:
    return round(100 * part / whole, 1) if whole else "-"


def _median(xs: list[int]) -> int | str:
    if not xs:
        return "-"
    ys = sorted(xs)
    n = len(ys)
    return ys[n // 2] if n % 2 else (ys[n // 2 - 1] + ys[n // 2]) // 2


def _p95(xs: list[int]) -> int | str:
    if not xs:
        return "-"
    ys = sorted(xs)
    return ys[math.ceil(0.95 * len(ys)) - 1]


# 계획이 나온 호출: 실패 없음, 또는 재질문만 실패해 첫 답을 쓴 것
VLM_PLANNED = {None, "retry_failed"}


def aggregate(events: Iterable[Event]) -> list[dict]:
    """세션 여러 개 → 결과표 행들. `eval/common.write_rows` 형식"""
    sessions = [summarize_session(v) for v in by_session(events).values() if v]
    n = len(sessions)
    rows: list[dict] = []

    def row(metric: str, current: Any, note: str = "", count: int = n) -> None:
        rows.append(
            {
                "eval": "E-8",
                "metric": metric,
                "baseline": "",
                "current": current,
                "pass": "",
                "n": count,
                "note": note,
            }
        )

    if n == 0:
        return rows

    # 1. 퍼널 — 각 화면까지 온 비율
    for sc in FUNNEL_SCREENS:
        reached = sum(1 for s in sessions if sc in s.reached)
        row(f"퍼널 · {sc} 도달률(%)", _pct(reached, n), f"{reached}/{n}")

    # 2. 동의
    denied = sum(1 for s in sessions if s.consented is False)
    row("동의 거부율(%)", _pct(denied, n), f"{denied}/{n}")

    # 3. 촬영
    done4 = sum(1 for s in sessions if len(s.shots_ok) >= 4)
    row("촬영 4장 완주율(%)", _pct(done4, n), f"{done4}/{n}")
    retries: Counter = Counter()
    for s in sessions:
        retries.update(s.retries)
    for shot, c in retries.most_common():
        row(f"재촬영 · {shot}(회)", c, "세션 합계")

    # 4. 게이트 — 무엇이 사람을 막는가
    gate: Counter = Counter()
    for s in sessions:
        gate.update(s.gate_fails)
    total_gate = sum(gate.values())
    for cond, c in gate.most_common():
        row(f"게이트 첫 실패 · {cond}(%)", _pct(c, total_gate), f"{c}/{total_gate}", total_gate)

    # 5. 부위 결과
    status: Counter = Counter()
    for s in sessions:
        status.update(s.part_status.values())
    total_part = sum(status.values())
    for st in ("passed", "check_only", "skipped"):
        row(
            f"부위 · {st}(%)",
            _pct(status.get(st, 0), total_part),
            f"{status.get(st, 0)}/{total_part}",
            total_part,
        )
    reasons: Counter = Counter()
    for s in sessions:
        reasons.update(s.check_reasons)
    for r, c in reasons.most_common():
        row(f"확인만 이유 · {r}(회)", c, "세션 합계")
    reconf = sum(sum(s.reconfirms.values()) for s in sessions)
    row("재확인(회/세션)", round(reconf / n, 2), f"합계 {reconf}")

    # 6. 끝
    row("리뷰 도달률(%)", _pct(sum(1 for s in sessions if "review" in s.reached), n))
    row("결과 저장 클릭률(%)", _pct(sum(1 for s in sessions if s.saved_result), n))
    ends: Counter = Counter(s.end_reason for s in sessions if s.end_reason)
    for r, c in ends.most_common():
        row(f"세션 종료 · {r}(%)", _pct(c, n), f"{c}/{n}")
    abandoned = n - sum(ends.values())
    if abandoned:
        row("세션 종료 · 기록 없음(%)", _pct(abandoned, n), f"{abandoned}/{n} — 닫기 전에 못 남김")

    # 7. 운영 숫자
    row("세션 시간 중앙값(초)", _median([s.duration_ms // 1000 for s in sessions if s.duration_ms]))
    row("얼굴 놓침 중앙값(ms)", _median([s.lost_face_ms for s in sessions]))
    row("채점 시간 중앙값(ms)", _median([m for s in sessions for m in s.score_ms]))
    tried = [s for s in sessions if s.restore_ok is not None]
    row(
        "복원 성공률(%)",
        _pct(sum(1 for s in tried if s.restore_ok), len(tried)),
        f"시도 {len(tried)}",
        len(tried),
    )

    # 8. VLM 개인화 — 기록이 있을 때만 (규칙 모드·옛 로그엔 줄을 안 만든다)
    calls = [e for s in sessions for e in s.vlm]
    restored = sum(s.vlm_restored_rule for s in sessions)
    if calls or restored:
        ok = [e for e in calls if e.get("fail") in VLM_PLANNED]
        row("개인화 성공률(%)", _pct(len(ok), len(calls)), f"{len(ok)}/{len(calls)}", len(calls))
        fails: Counter = Counter(str(e.get("fail")) for e in calls if e.get("fail") not in VLM_PLANNED)
        for r, c in fails.most_common():
            row(f"개인화 실패 · {r}(회)", c, "세션 합계")
        # 시간은 계획이 나온 호출만 — 실패는 시간 제한까지 기다린 값이라 섞으면 흐려진다
        ms = [int(e["ms"]) for e in ok if isinstance(e.get("ms"), (int, float))]
        row("개인화 시간 중앙값(ms)", _median(ms), "계획이 나온 호출만", len(ms))
        row("개인화 시간 p95(ms)", _p95(ms), "계획이 나온 호출만", len(ms))
        retried = sum(1 for e in ok if int(e.get("tries") or 0) >= 2)
        row("개인화 · 재질문 비율(%)", _pct(retried, len(ok)), f"{retried}/{len(ok)}", len(ok))
        left = sum(1 for e in ok if int(e.get("left_rejected") or 0) > 0)
        row(
            "개인화 · 재질문해도 거절 남음(%)",
            _pct(left, len(ok)),
            f"{left}/{len(ok)} — 관문이 규칙값으로 채움",
            len(ok),
        )
        row(
            "개인화 · 재질문 실패로 첫 답 사용(회)",
            sum(1 for e in ok if e.get("fail") == "retry_failed"),
            "세션 합계",
        )
        row("개인화 · 앱 다시 켜 규칙 계획으로 봄(회)", restored, "세션 합계 — ① #181 계획 저장 전까지")
        models: Counter = Counter(str(e.get("model")) for e in ok if e.get("model"))
        for mname, c in models.most_common():
            row(f"개인화 모델 · {mname}(회)", c, "계획이 나온 호출")
        failed = [s for s in sessions if any(e.get("fail") not in VLM_PLANNED for e in s.vlm)]
        gone = sum(1 for s in failed if "fullrender" not in s.reached)
        row(
            "개인화 실패 뒤 이탈(%)",
            _pct(gone, len(failed)),
            f"{gone}/{len(failed)} — 실패 한 번 이상인 세션 중 2-b 못 감",
            len(failed),
        )

    return rows
