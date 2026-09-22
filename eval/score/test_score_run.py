"""run.py 세는 규칙 검사 — 채점기(Node) 없이 가짜 결과로."""

from eval.score.run import kappa, summarize


def _p(i, part, label, pred, status="scored", **kw):
    return {"id": i, "part": part, "label": label, "pred": pred, "status": status, "ms": 10, **kw}


def _metrics(rows):
    return {r["metric"]: r for r in rows}


def test_check_only_is_not_wrong():
    preds = [
        _p("1", "liner", "ok", "ok"),
        _p("2", "liner", "off", "off"),
        _p("3", "cheek", "ok", None, status="check_only", check_reason="no_band"),
        _p("4", "cheek", "slight", None, status="check_only", check_reason="no_band"),
    ]
    m = _metrics(summarize(preds, []))
    assert m["부위 판정 일치율 (점수 낸 것만)"]["current"] == 1.0  # 무응답 2장은 오답으로 세지 않는다
    assert m["부위 판정 일치율 (점수 낸 것만)"]["n"] == 2
    assert m["무응답(확인만) 비율"]["current"] == 0.5
    assert "no_band 2" in m["무응답(확인만) 비율"]["note"]


def test_danger_and_near():
    preds = [
        _p("1", "lip", "off", "ok"),  # 위험한 오답
        _p("2", "lip", "off", "slight"),  # 한 칸 차이
        _p("3", "lip", "ok", "slight"),
    ]
    m = _metrics(summarize(preds, []))
    assert m["위험한 오답 (사람 off → 채점기 ok)"]["current"] == 0.5
    assert m["부위 판정 일치율 (점수 낸 것만)"]["current"] == 0.0
    assert m["부위 판정 일치율 · 한 칸 차이까지 허용"]["current"] == round(2 / 3, 3)


def test_labeler_agreement():
    items = [
        {"id": str(i), "labels": {"a": a, "b": b}}
        for i, (a, b) in enumerate([("ok", "ok"), ("off", "off"), ("ok", "slight")])
    ]
    preds = [_p(str(i), "brow", "ok", "ok") for i in range(3)]
    m = _metrics(summarize(preds, items))
    assert m["사람끼리 일치율 (a vs b)"]["current"] == round(2 / 3, 3)
    assert "카파" in m["사람끼리 일치율 (a vs b)"]["note"]


def test_kappa_perfect_and_empty():
    assert kappa(["ok", "off"], ["ok", "off"]) == 1.0
    assert kappa([], []) is None
