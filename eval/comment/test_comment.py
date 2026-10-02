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


def test_rule_totals_are_short_numberless_and_b2_names_a_product(S):
    meta = core([{"op": "meta"}])[0]
    looks = {
        lk["id"]: " ".join(lk["products"])
        for lk in json.loads((HERE.parent.parent / "rules" / "looks.json").read_text(encoding="utf-8"))[
            "looks"
        ]
    }
    for s in S:
        for k in ("B", "B2"):
            assert len(s[k]) <= meta["maxChars"]
            assert not any(ch.isdigit() for ch in s[k])
        assert len(s["A"].splitlines()) == 6  # 부위별 한 줄 = 화면 6 맥락
        if s["kind"] in ("one_big", "many"):  # 고칠 것이 있으면 B′ 는 이 화장 제품으로 할 일을 말한다
            assert "봐요" in s["B2"]
            assert any(
                w in looks[s["lookId"]]
                for w in ("펜슬", "라이너", "섀도우", "립", "틴트", "블러셔")
                if w in s["B2"]
            )
        assert (
            "섀도우도 섀도우" not in s["B2"] and "부터, 섀도우를" not in s["B2"]
        )  # 도구 = 부위 이름이면 되풀이 안 함


def _gate(s, comment, praise="none", fix="none"):
    raw = json.dumps({"praise_part": praise, "fix_part": fix, "comment": comment}, ensure_ascii=False)
    return core([{"op": "gate", "session": s, "raw": raw}])[0]


def test_gate_catches_what_the_first_runs_got_wrong(S):
    good = next(s for s in S if s["kind"] == "all_good")
    one = next(s for s in S if s["kind"] == "one_big")
    fix = one["schema"]["properties"]["fix_part"]["enum"][0]
    ko = {"brow": "눈썹", "liner": "아이라이너", "shadow": "섀도우", "lip": "입술", "cheek": "볼터치"}[fix]
    assert _gate(one, one["B2"], fix=fix)["ok"]  # 진단을 말하는 글은 통과
    assert (
        "고칠 부위의 진단과 상관없는 말" in _gate(one, f"다음엔 {ko}부터 다시 해 봐요.", fix=fix)["reasons"]
    )
    assert "숫자" in _gate(one, f"{ko}가 3점 낮아요. 다시 해 봐요.", fix=fix)["reasons"]
    assert "문장이 잘림" in _gate(one, f"다음엔 {ko}부터 다시 해 보는 것을 권", fix=fix)["reasons"]
    assert "영어 섞임" in _gate(one, f"눈 liner 는 좋아요. {ko}부터 봐요.", fix=fix)["reasons"]
    assert (
        "고칠 부위를 글에서 말하지 않음"
        in _gate(one, "전체적으로 좋아요. 다음에도 힘내요.", fix=fix)["reasons"]
    )
    # 전부 잘된 세션에서 잘된 부위를 고치라고 함 (Gemma 첫 실행)
    r = _gate(good, "눈썹은 잘 됐어요, 섀도우와 볼터치는 조금 더 신경 써주시면 좋을 것 같아요.")
    assert "잘된 부위를 고치라고 함" in r["reasons"]
    assert _gate(good, "전체적으로 잘 됐어요, 섀도우도 깔끔하게 잘 됐어요.")["ok"]
    # 한 문장에 칭찬 + 할 일 — 칭찬 마디는 걸리지 않는다
    praise = one["schema"]["properties"]["praise_part"]["enum"][0]
    pko = {"brow": "눈썹", "liner": "아이라이너", "shadow": "섀도우", "lip": "입술", "cheek": "볼터치"}[
        praise
    ]
    todo = one["B2"].split("다음엔 ", 1)[1]  # B′ 의 할 일 (진단을 말한다)
    assert _gate(one, f"{pko}는 잘 되셨어요, 다음엔 {todo}", praise=praise, fix=fix)["ok"]
    assert "총평이 너무 김" in _gate(one, f"좋아요. 정말요. 다음엔 {ko}. 해 봐요.", fix=fix)["reasons"]
    # 제품 목록에 없는 도구 · 부위를 제품 이름으로 말하기
    kit = next(s for s in S if s["lookId"] == "chic")  # 어른 여자: 펜슬 · 젤 라이너 · 섀도우 · 립 · 블러셔
    assert any("목록에 없는 도구" in x for x in _gate(kit, "다음엔 면봉으로 정리해 봐요.")["reasons"])
    if "liner" in kit["schema"]["properties"]["fix_part"]["enum"]:
        assert _gate(kit, "다음엔 젤 라이너로 눈꼬리를 길게 빼 봐요.", fix="liner")["ok"]


def test_sheet_hides_which_is_which_and_ratings_use_ci(tmp_path, monkeypatch, S):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    import results as report

    d = tmp_path / "comment-eval"
    (d / "runs").mkdir(parents=True)
    (d / "sessions.json").write_text(json.dumps(S, ensure_ascii=False), encoding="utf-8")
    rows = []
    for s in S:  # 가짜 LLM: 앞 절반은 관문 통과, 뒤 절반은 숫자가 들어가 거절
        fix = s["schema"]["properties"]["fix_part"]["enum"][0]
        text = s["B2"] if int(s["id"][1:]) <= 15 else "1번부터 다시 해요."
        raw = json.dumps({"praise_part": "none", "fix_part": fix, "comment": text}, ensure_ascii=False)
        rows.append({"session": s["id"], "kind": s["kind"], "rep": 0, "ms": 100, "content": raw})
    lines = (json.dumps(r, ensure_ascii=False) for r in rows)
    (d / "runs" / "fake.jsonl").write_text("\n".join(lines), encoding="utf-8")
    page = report.sheet("fake").read_text(encoding="utf-8")
    # 정답표는 key.json 에만
    assert '"C"' not in page and '"B"' not in page and '"map":' not in page and "c_fallback" not in page
    key = json.loads((d / "out" / "total-fake.key.json").read_text(encoding="utf-8"))
    assert sum(k["c_fallback"] for k in key) == 15  # C 가 거절된 세션은 평가지에서 빠진다 (B 대 B 가 되므로)
    assert "1번부터" not in page  # 거절된 LLM 글은 평가지에 안 나온다
    # 평가자 하나: C 가 있는 15문항 중 10번 C, 3번 B, 2번 비슷함
    items = []
    for i, k in enumerate(x for x in key if not x["c_fallback"]):
        inv = {v: c for c, v in k["map"].items()}
        pick = inv["C"] if i < 10 else inv["B"] if i < 13 else "same"
        items.append({"id": k["id"], "order": i + 1, "shown": list(k["map"]), "pick": pick})
    f = tmp_path / "r.json"
    f.write_text(
        json.dumps({"sheet": "total-fake", "who": "t", "seed": 1, "items": items}, ensure_ascii=False),
        encoding="utf-8",
    )
    text = report.ratings([str(f)])
    assert "C 10/13" in text  # 비슷함은 뺀다
    assert "못 넘음" in text  # 10/13 의 95% 하한은 50% 아래
