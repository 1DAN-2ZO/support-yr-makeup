"""퍼널 집계 — 가짜 로그로 확인한다 (파일 없이)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.funnel.funnel import aggregate, by_session, parse_jsonl, summarize_session  # noqa: E402

VER = {"app": "t", "score": "s", "look": "l", "faceshape": "f", "transfer": "x"}


def ev(sid: str, t: int, name: str, screen: str = "consent", part=None, **kw) -> dict:
    return {"sid": sid, "t": t, "screen": screen, "part": part, "ver": VER, "name": name, **kw}


def full_session(sid: str, *, save: bool = True, end: str = "finish") -> list[dict]:
    """동의 → 촬영 4장 → 룩 → 부위 → 리뷰까지 끝까지 간 세션"""
    out = [ev(sid, 0, "consent", ok=True)]
    t = 1
    for sc in ["consent", "capture", "looks", "fullrender", "guide", "live", "result", "review"]:
        out.append(ev(sid, t, "screen_enter", screen=sc))
        t += 1
    for shot in ["front_open", "front_closed", "left_45", "right_45"]:
        out.append(ev(sid, t, "capture", screen="capture", shot=shot, ok=True, retry=0, reason=None))
        t += 1
    for part in ["brow", "liner", "shadow", "lip", "cheek", "contour"]:
        st = "check_only" if part == "contour" else "passed"
        out.append(ev(sid, t, "part_status", part=part, **{"from": "in_progress", "to": st, "score": 80}))
        out.append(
            ev(
                sid,
                t,
                "score",
                part=part,
                status=st,
                check_reason="contour" if part == "contour" else None,
                ms=40,
            )
        )
        t += 1
    if save:
        out.append(ev(sid, t, "button", screen="review", button="save_result"))
    out.append(ev(sid, t + 1, "session_end", screen="review", reason=end, last_screen="review"))
    out.append(ev(sid, 60_000, "screen_leave", screen="review"))
    return out


def rows_by_metric(rows: list[dict]) -> dict[str, object]:
    return {r["metric"]: r["current"] for r in rows}


def test_깨진_줄은_버린다():
    text = "\n".join(
        [json.dumps(ev("a", 1, "consent", ok=True)), "{깨짐", "", "[]", json.dumps({"no": "sid"})]
    )
    assert len(parse_jsonl(text)) == 1


def test_세션별로_나누고_시간순으로_정렬한다():
    events = [ev("b", 5, "consent", ok=True), ev("a", 9, "consent", ok=True), ev("a", 2, "consent", ok=True)]
    g = by_session(events)
    assert set(g) == {"a", "b"}
    assert [e["t"] for e in g["a"]] == [2, 9]


def test_끝까지_간_세션_요약():
    s = summarize_session(full_session("a"))
    assert s.consented is True
    assert len(s.shots_ok) == 4
    assert s.furthest == "review"
    assert s.saved_result is True
    assert s.end_reason == "finish"
    assert s.part_status["contour"] == "check_only"
    assert s.duration_ms == 60_000


def test_중간에_나간_세션():
    sid = "b"
    events = [ev(sid, 0, "consent", ok=True)]
    for i, sc in enumerate(["consent", "capture", "looks"]):
        events.append(ev(sid, i + 1, "screen_enter", screen=sc))
    events.append(
        ev(sid, 9, "capture", screen="capture", shot="front_open", ok=False, retry=1, reason="bright")
    )
    s = summarize_session(events)
    assert s.furthest == "looks"
    assert "review" not in s.reached
    assert s.retries["front_open"] == 1
    assert s.end_reason is None  # 닫기 전에 못 남김


def test_동의_거부와_재확인_세기():
    a = [ev("a", 0, "consent", ok=False), ev("a", 1, "screen_enter", screen="consent")]
    b = [
        ev("b", 0, "consent", ok=True),
        ev("b", 1, "part_status", part="lip", **{"from": "in_progress", "to": "passed", "score": 70}),
        ev("b", 2, "part_status", part="lip", **{"from": "passed", "to": "in_progress", "score": None}),
        ev("b", 3, "part_status", part="lip", **{"from": "in_progress", "to": "passed", "score": 85}),
    ]
    assert summarize_session(a).consented is False
    assert summarize_session(b).reconfirms["lip"] == 1


def test_퍼널_비율():
    events = full_session("a") + full_session("b")
    sid = "c"
    events += [ev(sid, 0, "consent", ok=True), ev(sid, 1, "screen_enter", screen="capture")]
    m = rows_by_metric(aggregate(events))
    assert m["퍼널 · capture 도달률(%)"] == 100.0
    assert m["퍼널 · review 도달률(%)"] == round(200 / 3, 1)
    assert m["촬영 4장 완주율(%)"] == round(200 / 3, 1)
    assert m["결과 저장 클릭률(%)"] == round(200 / 3, 1)


def test_게이트_실패_분포는_실패_횟수_기준():
    sid = "a"
    events = [ev(sid, 0, "consent", ok=True)]
    for i, cond in enumerate(["bright", "bright", "bright", "angle"]):
        events.append(ev(sid, i + 1, "gate_fail", screen="live", first_fail=cond))
    m = rows_by_metric(aggregate(events))
    assert m["게이트 첫 실패 · bright(%)"] == 75.0
    assert m["게이트 첫 실패 · angle(%)"] == 25.0


def test_확인만_이유와_부위_상태():
    m = rows_by_metric(aggregate(full_session("a")))
    assert m["부위 · passed(%)"] == round(100 * 5 / 6, 1)
    assert m["부위 · check_only(%)"] == round(100 * 1 / 6, 1)
    assert m["확인만 이유 · contour(회)"] == 1


def test_종료_이유_없는_세션은_기록_없음으로_센다():
    events = full_session("a") + [
        ev("b", 0, "consent", ok=True),
        ev("b", 1, "screen_enter", screen="capture"),
    ]
    m = rows_by_metric(aggregate(events))
    assert m["세션 종료 · finish(%)"] == 50.0
    assert m["세션 종료 · 기록 없음(%)"] == 50.0


def test_운영_숫자():
    events = full_session("a")
    events.append(ev("a", 5, "landmark_lost", screen="live", ms=1200))
    events.append(ev("a", 6, "restore", screen="capture", ok=True, had_images=True))
    m = rows_by_metric(aggregate(events))
    assert m["세션 시간 중앙값(초)"] == 60
    assert m["얼굴 놓침 중앙값(ms)"] == 1200
    assert m["채점 시간 중앙값(ms)"] == 40
    assert m["복원 성공률(%)"] == 100.0


def test_로그가_없으면_빈_결과():
    assert aggregate([]) == []


def vlm(
    sid: str, t: int, *, ms: int = 3000, tries: int = 1, fail=None, left: int = 0, model="qwen3-vl-8b"
) -> dict:
    return ev(
        sid,
        t,
        "vlm_plan",
        screen="looks",
        look_id="daily",
        ms=ms,
        tries=tries,
        first_rejected=1 if tries > 1 else 0,
        left_rejected=left,
        model=model,
        fail=fail,
    )


def test_개인화_성공률과_실패_이유():
    """성공 = fail 없음 또는 retry_failed(재질문은 실패했지만 첫 답으로 계획이 나옴).
    복원 때 규칙 계획은 VLM 호출이 아니라 따로 센다"""
    events = [
        vlm("a", 1),
        vlm("a", 2, tries=2, fail="retry_failed", ms=6000),
        vlm("a", 3, fail="busy", ms=1500),
        vlm("b", 1, fail="timeout", ms=25000),
        ev(
            "b",
            2,
            "vlm_plan",
            screen="looks",
            look_id="daily",
            ms=0,
            tries=0,
            first_rejected=0,
            left_rejected=0,
            model=None,
            fail="restored_rule",
        ),
    ]
    m = rows_by_metric(aggregate(events))
    assert m["개인화 성공률(%)"] == 50.0
    assert m["개인화 실패 · busy(회)"] == 1
    assert m["개인화 실패 · timeout(회)"] == 1
    assert m["개인화 · 재질문 실패로 첫 답 사용(회)"] == 1
    assert m["개인화 · 앱 다시 켜 규칙 계획으로 봄(회)"] == 1
    assert "개인화 실패 · restored_rule(회)" not in m


def test_개인화_시간과_재질문():
    """시간은 계획이 나온 호출만 (실패는 시간 제한까지 기다린 값이라 섞으면 흐려진다)"""
    events = [
        vlm("a", i, ms=ms, tries=2 if i == 0 else 1, left=1 if i == 1 else 0)
        for i, ms in enumerate([2000, 3000, 4000, 5000])
    ]
    events.append(vlm("a", 9, fail="timeout", ms=25000))
    m = rows_by_metric(aggregate(events))
    assert m["개인화 시간 중앙값(ms)"] == 3500
    assert m["개인화 시간 p95(ms)"] == 5000
    assert m["개인화 · 재질문 비율(%)"] == 25.0
    assert m["개인화 · 재질문해도 거절 남음(%)"] == 25.0
    assert m["개인화 모델 · qwen3-vl-8b(회)"] == 4


def test_개인화_실패_뒤_이탈():
    """개인화가 한 번이라도 실패한 세션 중 2-b(fullrender)까지 못 간 비율"""
    stay = [
        ev("a", 0, "screen_enter", screen="looks"),
        vlm("a", 1, fail="busy"),
        vlm("a", 2),
        ev("a", 3, "screen_enter", screen="fullrender"),
    ]
    left = [ev("b", 0, "screen_enter", screen="looks"), vlm("b", 1, fail="unavailable")]
    m = rows_by_metric(aggregate(stay + left))
    assert m["개인화 실패 뒤 이탈(%)"] == 50.0


def test_개인화_기록이_없으면_개인화_줄도_없다():
    m = rows_by_metric(aggregate(full_session("a")))
    assert not [k for k in m if k.startswith("개인화")]


def test_옛_이름_hand_는_occluded_로_센다():
    """#155 로 가림 이름이 hand → occluded. 폰에 남은 옛 로그도 같은 줄로 센다"""
    events = [
        ev("a", 1, "gate_fail", screen="live", first_fail="hand"),
        ev("a", 2, "gate_fail", screen="live", first_fail="occluded"),
        ev("a", 3, "score", screen="result", part="brow", status="check_only", check_reason="hand", ms=10),
    ]
    m = rows_by_metric(aggregate(events))
    assert m["게이트 첫 실패 · occluded(%)"] == 100.0
    assert m["확인만 이유 · occluded(회)"] == 1
    assert "게이트 첫 실패 · hand(%)" not in m
