"""화면 6 코멘트 실험 코드 시험 — GPU · 모델 없이 (세션 · B · 관문 · 평가지 가림 · 집계)"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from bridge import core  # noqa: E402


@pytest.fixture(scope="module")
def S() -> list[dict]:
    return core([{"op": "sessions"}])[0]


def test_sessions_cover_the_cases(S):
    from collections import Counter

    assert len(S) == 30
    assert Counter(s["kind"] for s in S) == {
        "all_good": 5,
        "one_big": 8,
        "lr": 5,
        "check_only": 6,
        "skipped": 3,
        "many": 3,
    }
    assert all(len(s["parts"]) == 6 for s in S)  # 화장 5부위 + 쉐딩
    assert any(p["status"] == "skipped" for s in S for p in s["parts"])
    assert any(p["status"] == "check_only" and p["partId"] != "contour" for s in S for p in s["parts"])
    assert core([{"op": "sessions"}])[0] == S  # 같은 seed → 같은 세션


def test_b_is_short_numberless_and_names_the_fix(S):
    meta = core([{"op": "meta"}])[0]
    for s in S:
        assert len(s["B"]) <= meta["maxChars"]
        assert not any(ch.isdigit() for ch in s["B"])
        assert len(s["A"].splitlines()) == 6  # A = 지금 화면 6 부위 줄


def _gate(s, comment, praise="none", fix="none"):
    raw = json.dumps({"praise_part": praise, "fix_part": fix, "comment": comment}, ensure_ascii=False)
    return core([{"op": "gate", "session": s, "raw": raw}])[0]


def test_gate_catches_what_the_first_runs_got_wrong(S):
    good = next(s for s in S if s["kind"] == "all_good")
    one = next(s for s in S if s["kind"] == "one_big")
    fix = one["schema"]["properties"]["fix_part"]["enum"][0]
    ko = {"brow": "눈썹", "liner": "아이라이너", "shadow": "섀도우", "lip": "입술", "cheek": "볼터치"}[fix]
    assert _gate(one, f"다음엔 {ko}부터 다시 해 봐요.", fix=fix)["ok"]
    assert "숫자" in _gate(one, f"{ko}가 3점 낮아요. 다시 해 봐요.", fix=fix)["reasons"]
    assert "문장이 잘림" in _gate(one, f"다음엔 {ko}부터 다시 해 보는 것을 권", fix=fix)["reasons"]
    assert "영어 섞임" in _gate(one, f"눈 liner 는 좋아요. {ko}부터 봐요.", fix=fix)["reasons"]
    assert (
        "고칠 부위를 글에서 말하지 않음"
        in _gate(one, "전체적으로 좋아요. 다음에도 힘내요.", fix=fix)["reasons"]
    )
    # 전부 잘된 세션에서 잘된 부위를 고치라고 함 (Gemma 첫 실행)
    r = _gate(good, "눈썹은 잘 됐어요. 섀도우와 볼터치는 다음엔 조금 더 신경 써주시면 좋을 것 같아요.")
    assert "잘된 부위를 고치라고 함" in r["reasons"]
    assert _gate(good, "전체적으로 잘 됐어요. 섀도우도 깔끔하게 잘 됐어요.")["ok"]


def test_sheet_hides_which_is_which_and_ratings_use_ci(tmp_path, monkeypatch, S):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    import results as report

    d = tmp_path / "comment-eval"
    (d / "runs").mkdir(parents=True)
    (d / "sessions.json").write_text(json.dumps(S, ensure_ascii=False), encoding="utf-8")
    rows = []
    for s in S:  # 가짜 LLM: 앞 절반은 관문 통과, 뒤 절반은 숫자가 들어가 거절
        fix = s["schema"]["properties"]["fix_part"]["enum"][0]
        name = {
            "brow": "눈썹",
            "liner": "아이라이너",
            "shadow": "섀도우",
            "lip": "입술",
            "cheek": "볼터치",
            "none": "",
        }[fix]
        text = f"다음엔 {name}부터 다시 해 봐요." if int(s["id"][1:]) <= 15 else "1번부터 다시 해요."
        raw = json.dumps({"praise_part": "none", "fix_part": fix, "comment": text}, ensure_ascii=False)
        rows.append({"session": s["id"], "kind": s["kind"], "rep": 0, "ms": 100, "content": raw})
    (d / "runs" / "fake.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8"
    )
    page = report.sheet("fake").read_text(encoding="utf-8")
    # 정답표는 key.json 에만
    assert '"C"' not in page and '"B"' not in page and '"map":' not in page and "c_fallback" not in page
    key = json.loads((d / "out" / "comment-fake.key.json").read_text(encoding="utf-8"))
    assert sum(k["c_fallback"] for k in key) == 15 and all(len(k["map"]) == 2 for k in key if k["c_fallback"])
    # 평가자 하나가 C 가 있는 문항에서 늘 C 를 고름
    items = []
    for k in key:
        inv = {v: c for c, v in k["map"].items()}
        items.append({"id": k["id"], "order": 1, "shown": list(k["map"]), "pick": inv.get("C", inv["B"])})
    f = tmp_path / "r.json"
    f.write_text(
        json.dumps({"sheet": "comment-fake", "who": "t", "seed": 1, "items": items}, ensure_ascii=False),
        encoding="utf-8",
    )
    text = report.ratings([str(f)])
    assert "C 15/15" in text  # 대신 쓴 문항(B 만 고를 수 있음)은 C 대 B 에서 빠진다
    assert "통과" in text
