"""사용 기록 받기 (POST /events) — 앱이 보낸 로그 줄을 날짜별 JSONL 로 쌓는다.
사진·얼굴 점은 받지 않는다. 쌓는 곳은 저장소 밖(DHE_DATA_DIR/events) — eval/funnel 이 그대로 읽는다.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import events, main

VER = {"app": "t", "score": "s", "look": "l", "faceshape": "f", "transfer": "x"}


def ev(**over):
    return {
        "sid": "s1",
        "t": 1759800000000,
        "screen": "capture",
        "part": None,
        "ver": VER,
        "name": "screen_enter",
        **over,
    }


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(events, "events_dir", lambda: tmp_path / "events")
    return TestClient(main.app)


def lines(tmp_path: Path) -> list[dict]:
    out = []
    for f in sorted((tmp_path / "events").glob("*.jsonl")):
        out += [json.loads(s) for s in f.read_text(encoding="utf-8").splitlines()]
    return out


def test_ev1_stores_each_event_as_one_line(client, tmp_path):
    r = client.post("/events", json={"events": [ev(), ev(screen="answer", t=1759800005000)]})
    assert r.status_code == 204
    got = lines(tmp_path)
    assert [e["screen"] for e in got] == ["capture", "answer"]
    assert got[0]["sid"] == "s1" and got[0]["name"] == "screen_enter" and got[0]["ver"] == VER
    assert isinstance(got[0]["rt"], int)  # 서버가 받은 시각 — 폰 시계가 틀려도 순서를 본다


def test_ev2_file_is_named_by_received_date(client, tmp_path, monkeypatch):
    monkeypatch.setattr(events, "now_ms", lambda: 1759800000000)  # 2025-10-07 01:20 UTC
    client.post("/events", json={"events": [ev()]})
    assert [f.name for f in (tmp_path / "events").iterdir()] == ["2025-10-07.jsonl"]


def test_ev3_appends_across_requests(client, tmp_path):
    client.post("/events", json={"events": [ev()]})
    client.post("/events", json={"events": [ev(screen="save")]})
    assert len(lines(tmp_path)) == 2


def test_ev4_accepts_text_plain_body(client, tmp_path):
    # 화면을 떠날 때 sendBeacon 으로 보내면 content-type 이 text/plain 이다
    r = client.post(
        "/events",
        content=json.dumps({"events": [ev()]}),
        headers={"content-type": "text/plain;charset=UTF-8"},
    )
    assert r.status_code == 204
    assert len(lines(tmp_path)) == 1


@pytest.mark.parametrize("key", ["lm", "pts", "frames", "image", "bareImage", "photo", "path", "filename"])
def test_ev5_rejects_face_data_keys_and_stores_nothing(client, tmp_path, key):
    # 값이 글자여도 키 이름만으로 거절
    r = client.post("/events", json={"events": [ev(), ev(**{key: "x"})]})
    assert r.status_code == 422
    assert lines(tmp_path) == []


def test_ev6_rejects_nested_values_other_than_ver(client, tmp_path):
    # 값은 글자·숫자·참거짓·null 만 — 배열·객체에 좌표를 숨겨 보낼 수 없다
    assert client.post("/events", json={"events": [ev(extra={"x": 1})]}).status_code == 422
    assert client.post("/events", json={"events": [ev(extra=[0.1, 0.2])]}).status_code == 422
    assert client.post("/events", json={"events": [ev(ver={"app": {"deep": 1}})]}).status_code == 422
    assert lines(tmp_path) == []


@pytest.mark.parametrize(
    "bad",
    [
        {"sid": ""},
        {"sid": "x" * 65},
        {"sid": 3},
        {"t": "now"},
        {"t": True},
        {"screen": None},
        {"name": ""},
        {"name": "x" * 41},
        {"msg": "x" * 501},
    ],
)
def test_ev7_rejects_malformed_events(client, tmp_path, bad):
    assert client.post("/events", json={"events": [ev(**bad)]}).status_code == 422
    assert lines(tmp_path) == []


def test_ev8_rejects_bad_shapes(client, tmp_path):
    assert (
        client.post("/events", content="not json", headers={"content-type": "text/plain"}).status_code == 422
    )
    assert client.post("/events", json=[ev()]).status_code == 422
    assert client.post("/events", json={"events": []}).status_code == 422
    assert client.post("/events", json={"events": [ev()] * (events.MAX_EVENTS + 1)}).status_code == 422
    assert client.post("/events", json={"events": ["x"]}).status_code == 422
    assert lines(tmp_path) == []


def test_ev9_rejects_oversized_body(client, tmp_path):
    big = json.dumps({"events": [ev(msg="가" * 400)] * 100})
    assert len(big.encode()) > events.MAX_BODY
    assert (
        client.post("/events", content=big, headers={"content-type": "application/json"}).status_code == 413
    )
    assert lines(tmp_path) == []


def test_ev10_off_when_no_data_dir(monkeypatch):
    # 쌓을 곳이 없으면 받지 않는다 — 저장소 안에 실수로 쌓지 않게
    monkeypatch.delenv("DHE_DATA_DIR", raising=False)
    assert events.events_dir() is None
    assert TestClient(main.app).post("/events", json={"events": [ev()]}).status_code == 503


def test_ev11_data_dir_env_points_to_events_folder(monkeypatch, tmp_path):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    assert events.events_dir() == tmp_path / "events"


def test_ev12_stores_no_request_metadata(client, tmp_path):
    # 주소(IP)·브라우저 정보는 남기지 않는다
    client.post(
        "/events", json={"events": [ev()]}, headers={"user-agent": "PhoneX", "x-forwarded-for": "1.2.3.4"}
    )
    raw = next((tmp_path / "events").glob("*.jsonl")).read_text(encoding="utf-8")
    assert "PhoneX" not in raw and "1.2.3.4" not in raw
    assert set(lines(tmp_path)[0]) == {"sid", "t", "screen", "part", "ver", "name", "rt"}


def test_ev13_cors_allows_post_from_dev_client(client):
    r = client.options(
        "/events",
        headers={
            "origin": "http://localhost:5173",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_ev_task_timing_line_is_stored_as_is(client, tmp_path):
    # 작업 시간 기록 (2026-10-08, client/src/core/task-timer.ts) — 앱이 보내는 모양 그대로 쌓인다.
    # 집계는 eval/funnel
    times = {"gen_ms": 21000, "queue_ms": 0, "flux_ms": 8600, "kb": 16}
    task = ev(screen="answer", name="task", task="answer_make", ms=23400, ok=True, why=None, **times)
    failed = ev(name="task", task="ref_shrink", ms=40, ok=False, why="error")
    r = client.post("/events", json={"events": [task, failed]})
    assert r.status_code == 204
    got = lines(tmp_path)
    assert got[0]["task"] == "answer_make" and got[0]["ms"] == 23400 and got[0]["ok"] is True
    assert {k: got[0][k] for k in times} == times
    assert got[1]["ok"] is False and got[1]["why"] == "error"
