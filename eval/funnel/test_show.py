"""사용 기록 보기 (show.py) — 가짜 기록으로 확인한다."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.funnel import show  # noqa: E402

VER = {"app": "t", "score": "s", "look": "l", "faceshape": "f", "transfer": "x"}
T0 = 1759900000000  # 2025-10-08 05:06:40 UTC


def ev(sid: str, t: int, name: str, screen: str = "answer", **kw) -> dict:
    return {"sid": sid, "t": T0 + t, "screen": screen, "part": None, "ver": VER, "name": name, **kw}


def write(folder: Path, day: str, events: list[dict]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events)
    (folder / f"{day}.jsonl").write_text(text, encoding="utf-8")


def session(sid: str) -> list[dict]:
    make = {"gen_ms": 21000, "queue_ms": 0, "flux_ms": 8600, "kb": 16}
    return [
        ev(sid, 0, "consent", screen="consent", ok=True),
        ev(sid, 1000, "screen_enter", screen="capture"),
        ev(sid, 31000, "screen_enter", screen="answer"),
        ev(sid, 32000, "task", task="ref_analyze", ms=800, ok=True, why=None, n=4),
        ev(sid, 56000, "task", task="answer_make", ms=23400, ok=True, why=None, **make),
        ev(sid, 60000, "screen_enter", screen="partguide"),
        ev(sid, 61200, "task", screen="partguide", task="guide_build", ms=1200, ok=True, why=None, n=4),
    ]


def test_작업_시간과_화면_머문_시간을_표로_보여_준다(tmp_path):
    write(tmp_path, "2025-10-08", session("s-secret-1"))
    files, events = show.load(tmp_path, None)
    text = show.render(files, events)
    assert "파일 1개 (2025-10-08 ~ 2025-10-08) · 기록 7줄 · 세션 1개" in text
    assert "## 작업마다 걸린 시간" in text
    assert "| answer_make 시간 중앙값(ms) | 23400 | 1 |" in text
    assert "| answer_make FLUX 그리는 시간 중앙값(ms) | 8600 | 1 |" in text
    assert "## 화면마다 머문 시간" in text
    assert "| capture 머문 시간 중앙값(초) | 30 | 1 |" in text
    # 최근 작업은 새것부터, 초로
    recent = text[text.index("## 최근 작업 3건") :]
    assert recent.index("guide_build") < recent.index("answer_make") < recent.index("ref_analyze")
    assert "| answer_make | 23.4 | 됨 | 0.0 | 8.6 | 21.0 |  | 16 |" in recent
    # 한국 시간으로 (UTC 05:07 → 14:07)
    assert "10-08 14:07:36" in recent


def test_세션_번호는_내보내지_않는다(tmp_path):
    write(tmp_path, "2025-10-08", session("s-secret-1"))
    assert "s-secret-1" not in show.render(*show.load(tmp_path, None))


def test_못_한_작업은_까닭과_함께(tmp_path):
    busy = ev("a", 70000, "task", task="answer_make", ms=900, ok=False, why="busy")
    write(tmp_path, "2025-10-08", [*session("a"), busy])
    text = show.render(*show.load(tmp_path, None))
    assert "| answer_make | 0.9 | 안 됨 (busy) |" in text
    assert "| answer_make 실패 · busy(회) | 1 |" in text


def test_days_는_최근_파일만_본다(tmp_path):
    write(tmp_path, "2025-10-07", session("old"))
    write(tmp_path, "2025-10-08", session("new"))
    files, events = show.load(tmp_path, 1)
    assert [f.stem for f in files] == ["2025-10-08"]
    assert {e["sid"] for e in events} == {"new"}


def test_기록이_없으면_없다고_말한다(tmp_path):
    assert "기록이 없습니다" in show.render(*show.load(tmp_path / "없는폴더", None))


def test_작업_기록이_아직_없으면_그렇다고_말한다(tmp_path):
    write(tmp_path, "2025-10-08", [e for e in session("a") if e["name"] != "task"])
    text = show.render(*show.load(tmp_path, None))
    assert "작업 시간 기록(task)이 아직 없습니다" in text
    assert "## 화면마다 머문 시간" in text


def test_main_은_파일로_쓴다(tmp_path, monkeypatch):
    write(tmp_path / "events", "2025-10-08", session("a"))
    out = tmp_path / "out.md"
    monkeypatch.setattr(sys, "argv", ["show.py", str(tmp_path / "events"), "--out", str(out)])
    assert show.main() == 0
    assert "## 작업마다 걸린 시간" in out.read_text(encoding="utf-8")


def test_어느_링크로_들어왔는지에_따라_도착_동의_촬영_저장을_센다(tmp_path):
    def came(sid: str, t: int, **utm) -> dict:
        return ev(sid, t, "landing", screen="consent", **utm)

    yt = {"utm_source": "youtube", "utm_campaign": "tester-flow", "utm_content": "description"}
    events = [
        # 유튜브에서 온 두 사람 — 한 사람은 저장까지, 한 사람은 동의만
        came("a", 0, **yt),
        ev("a", 10, "consent", screen="consent", ok=True),
        ev("a", 20, "capture", screen="capture", shot="front_open", ok=True, retry=0, reason=None),
        ev("a", 30, "button", screen="save", button="save_image"),
        came("b", 100, **yt),
        ev("b", 110, "consent", screen="consent", ok=True),
        # 주소를 바로 치고 온 사람
        came("c", 200, utm_source="direct", utm_campaign=None, utm_content=None),
        # 이 기록이 생기기 전 버전의 앱
        ev("d", 300, "consent", screen="consent", ok=True),
    ]
    write(tmp_path, "2025-10-08", events)
    text = show.render(*show.load(tmp_path, None))
    assert "## 어디서 왔나" in text
    assert "| youtube | tester-flow | description | 2 | 2 | 1 | 1 |" in text
    assert "| direct |  |  | 1 | 0 | 0 | 0 |" in text
    assert "| (기록 없음) |  |  | 1 | 1 | 0 | 0 |" in text


def test_들어온_길_기록이_하나도_없으면_그_표를_안_그린다(tmp_path):
    write(tmp_path, "2025-10-08", session("s1"))
    assert "어디서 왔나" not in show.render(*show.load(tmp_path, None))


def test_무엇을_눌렀나_버튼마다_누른_세션_수와_횟수(tmp_path):
    def press(sid: str, t: int, button: str, screen: str = "partguide") -> dict:
        return ev(sid, t, "button", screen=screen, button=button)

    events = [
        ev("a", 0, "screen_enter", screen="partguide"),
        press("a", 10, "slot_live:brow"),
        press("a", 20, "slot_live:lip"),
        press("a", 30, "survey_open", screen="save"),
        ev("b", 0, "screen_enter", screen="partguide"),
        press("b", 10, "slot_live:brow"),
        ev("c", 0, "screen_enter", screen="partguide"),
        ev("d", 0, "screen_enter", screen="capture"),
    ]
    write(tmp_path, "2025-10-08", events)
    text = show.render(*show.load(tmp_path, None))
    assert "## 무엇을 눌렀나" in text
    # 부위 이름(: 뒤)은 떼고 센다 — 세션 2개가 3번
    assert "| slot_live | 2 | 3 |" in text
    assert "| survey_open | 1 | 1 |" in text
    # 실시간 가이드는 부위 가이드에 들어간 세션 가운데 몇이 눌렀나도 적는다
    assert "부위 가이드에 들어간 세션 3개 중 2개(66.7%)가 실시간 가이드를 열었다" in text


def test_버튼_기록이_없으면_그_표를_안_그린다(tmp_path):
    write(tmp_path, "2025-10-08", session("s1"))
    assert "무엇을 눌렀나" not in show.render(*show.load(tmp_path, None))


def test_촬영에서_무엇에_막혔나_사유마다_막힌_세션_수와_끝내_못_찍은_세션(tmp_path):
    def stuck(sid: str, t: int, reason: str) -> dict:
        return ev(sid, t, "capture", screen="capture", shot="front_open", ok=False, retry=0, reason=reason)

    def done(sid: str, t: int) -> dict:
        return ev(sid, t, "capture", screen="capture", shot="front_open", ok=True, retry=0, reason=None)

    events = [
        # a: 크기에 두 번 막혔다가 찍음
        ev("a", 0, "screen_enter", screen="capture"),
        stuck("a", 10, "size"),
        stuck("a", 20, "size"),
        done("a", 30),
        # b: 크기 · 밝기에 막히고 끝내 못 찍음
        ev("b", 0, "screen_enter", screen="capture"),
        stuck("b", 10, "size"),
        stuck("b", 20, "bright"),
        # c: 한 번도 안 막히고 찍음
        ev("c", 0, "screen_enter", screen="capture"),
        done("c", 10),
        # d: 막힌 기록도 없이 떠남
        ev("d", 0, "screen_enter", screen="capture"),
    ]
    write(tmp_path, "2025-10-08", events)
    text = show.render(*show.load(tmp_path, None))
    assert "## 촬영에서 무엇에 막혔나" in text
    # 사유 | 막힌 세션 | 그중 끝내 못 찍은 세션 | 막힌 횟수 — 막힌 세션이 많은 것부터
    assert "| size | 2 | 1 | 3 |" in text
    assert "| bright | 1 | 1 | 1 |" in text
    assert text.index("| size |") < text.index("| bright |")
    assert "촬영 화면에 들어간 세션 4개 중 2개가 찍었다. 못 찍은 2개 중 1개는 막힌 기록도 없이 떠났다" in text


def test_촬영_기록이_없으면_그_표를_안_그린다(tmp_path):
    write(tmp_path, "2025-10-08", session("a"))
    assert "## 촬영에서 무엇에 막혔나" not in show.render(*show.load(tmp_path, None))
