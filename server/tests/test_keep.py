"""테스트 기간 사진 보관 (POST /keep) — 참고 사진을 뺀 사진과 피드백 결과를 받은 날 폴더에 쌓고,
7일 지나면 지운다.
기본은 꺼져 있다 (DHE_KEEP_DAYS 가 없으면 받지 않는다). 쌓는 곳은 저장소 밖(DHE_DATA_DIR/keep).
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import keep, main

JPEG = b"\xff\xd8\xff\xe0" + b"face-bytes"
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"made-bytes"
SID = "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab"
NOW = datetime(2026, 10, 9, 3, 0, tzinfo=UTC)


@pytest.fixture
def root(tmp_path, monkeypatch) -> Path:
    r = tmp_path / "keep"
    monkeypatch.setattr(keep, "keep_dir", lambda: r)
    monkeypatch.setattr(keep, "keep_days", lambda: 7)
    monkeypatch.setattr(keep, "now", lambda: NOW)
    # 치우기는 한 시간에 한 번만 돈다 — 시험마다 처음부터
    monkeypatch.setattr(keep, "_last_purge", None)
    return r


@pytest.fixture
def client(root) -> TestClient:
    return TestClient(main.app)


def post(c: TestClient, kind="bare", data=JPEG, sid=SID, name="x"):
    return c.post(
        "/keep", data={"sid": sid, "kind": kind}, files={"file": (name, data, "application/octet-stream")}
    )


def files(root: Path) -> list[str]:
    return sorted(str(p.relative_to(root)).replace("\\", "/") for p in root.rglob("*") if p.is_file())


def test_kp1_stores_under_receive_day_and_session(client, root):
    assert post(client, "bare", JPEG).status_code == 204
    assert post(client, "answer", WEBP).status_code == 204
    assert files(root) == [f"2026-10-09/{SID}/answer.webp", f"2026-10-09/{SID}/bare.jpg"]
    assert (root / "2026-10-09" / SID / "bare.jpg").read_bytes() == JPEG


def test_kp2_off_by_default(tmp_path, monkeypatch):
    # 설정(DHE_KEEP_DAYS)이 없으면 받지 않는다 — 동의 문구가 보관을 알리기 전에 실수로 쌓이지 않게
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("DHE_KEEP_DAYS", raising=False)
    r = post(TestClient(main.app))
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "off"
    assert not (tmp_path / "keep").exists()


@pytest.mark.parametrize("days", ["0", "-1", "abc", ""])
def test_kp2b_bad_days_means_off(tmp_path, monkeypatch, days):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", days)
    assert post(TestClient(main.app)).status_code == 503


def test_kp2c_env_turns_it_on(tmp_path, monkeypatch):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", "7")
    assert post(TestClient(main.app)).status_code == 204
    assert [p.name for p in (tmp_path / "keep").rglob("bare.jpg")] == ["bare.jpg"]


@pytest.mark.parametrize(
    "kind", ["ref", "reference", "참고", "", "bare/../x", "attempt_open_5", "attempt_open_-1"]
)
def test_kp3_never_takes_the_reference_photo(client, root, kind):
    # 참고 사진은 다른 사람의 얼굴이다 — 받는 이름이 아예 없다. 정해 둔 이름만 받는다
    assert post(client, kind).status_code == 422
    assert files(root) == []


@pytest.mark.parametrize(
    "kind", ["bare", "answer", "moved", "attempt_open_0", "attempt_open_4", "attempt_closed"]
)
def test_kp3b_takes_every_other_photo(client, root, kind):
    assert post(client, kind, WEBP).status_code == 204
    assert files(root) == [f"2026-10-09/{SID}/{kind}.webp"]


@pytest.mark.parametrize(
    "sid", ["", "short", "../../etc", "a" * 65, "has space-1234", "x/y-12345678", "..\\..\\12345678"]
)
def test_kp4_session_id_must_be_plain(client, root, sid):
    # 세션 번호가 폴더 이름이 된다 — 글자 · 숫자 · 줄표만
    assert post(client, sid=sid).status_code == 422
    assert files(root) == []


def test_kp5_photo_type_comes_from_content(client, root):
    # 올린 쪽이 적은 이름 · 종류는 믿지 않는다. 사진이 아니면 받지 않는다
    assert post(client, "bare", b"<html>not a photo</html>", name="x.jpg").status_code == 422
    assert post(client, "bare", b"").status_code == 422
    assert post(client, "bare", WEBP, name="x.jpg").status_code == 204
    assert files(root) == [f"2026-10-09/{SID}/bare.webp"]


def test_kp6_same_kind_again_replaces(client, root):
    # 다시 찍으면 앞의 것을 바꾼다 — 종류가 달라져도(jpg → webp) 한 장만 남는다
    post(client, "bare", JPEG)
    post(client, "bare", WEBP)
    assert files(root) == [f"2026-10-09/{SID}/bare.webp"]


def test_kp7_feedback_result_is_text_only(client, root):
    body = json.dumps(
        {
            "ok": ["입술"],
            "fix": ["섀도우"],
            "parts": [{"name": "입술", "tone": "ok", "line": "정답과 비슷해요"}],
        }
    ).encode()
    assert post(client, "feedback", body).status_code == 204
    assert files(root) == [f"2026-10-09/{SID}/feedback.json"]
    # JSON 이 아니거나 너무 크면 받지 않는다 (사진을 글 자리에 끼워 넣지 못하게)
    assert post(client, "feedback", JPEG).status_code == 422
    assert post(client, "feedback", b"[" + b"1," * 40000 + b"1]").status_code == 413


def test_kp8_too_big_is_refused(client, root, monkeypatch):
    monkeypatch.setattr(keep, "MAX_FILE", 20)
    assert post(client, "bare", JPEG + b"x" * 30).status_code == 413
    assert files(root) == []


def test_kp8b_too_big_is_refused_before_reading(client, root, monkeypatch):
    monkeypatch.setattr(main, "MAX_KEEP_BODY", 100)
    r = post(client, "bare", JPEG + b"x" * 500)
    assert r.status_code == 413


def test_kp9_a_session_cannot_fill_the_disk(client, root, monkeypatch):
    # 한 세션이 정해 둔 종류(9가지 + 피드백)를 넘겨 쌓을 수 없고, 같은 종류는 바뀔 뿐이다
    for k in range(5):
        post(client, f"attempt_open_{k}", WEBP)
        post(client, f"attempt_open_{k}", WEBP)
    assert len(files(root)) == 5


def make(root: Path, day: str, sid: str = SID, name: str = "bare.jpg") -> Path:
    p = root / day / sid / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")
    return p


def test_kp10_purge_removes_folders_older_than_seven_days(root):
    # 받은 날 기준 7일 — 10/9 에 보면 10/2 것은 남고(7일째) 10/1 것부터 지운다
    for day in ("2026-09-25", "2026-10-01", "2026-10-02", "2026-10-08", "2026-10-09"):
        make(root, day)
    gone = keep.purge(root, 7, NOW)
    assert sorted(gone) == ["2026-09-25", "2026-10-01"]
    assert sorted(p.name for p in root.iterdir()) == ["2026-10-02", "2026-10-08", "2026-10-09"]


def test_kp10b_purge_leaves_anything_it_does_not_recognise(root):
    # 날짜 모양이 아닌 폴더 · 파일은 건드리지 않는다 (누가 손으로 둔 것일 수 있다)
    make(root, "2026-09-01")
    make(root, "메모")
    (root / "README.txt").write_text("x", encoding="utf-8")
    assert keep.purge(root, 7, NOW) == ["2026-09-01"]
    assert sorted(p.name for p in root.iterdir()) == ["README.txt", "메모"]
    assert keep.purge(root / "없는폴더", 7, NOW) == []


def test_kp11_storing_purges_old_days(client, root):
    make(root, "2026-09-20")
    post(client, "bare")
    assert not (root / "2026-09-20").exists()


def test_kp12_delete_one_session_everywhere(root):
    # 지워 달라는 요청 — 그 세션의 것을 날짜와 상관없이 전부 지운다. 다른 세션은 그대로
    other = "99999999-aaaa-4bbb-8ccc-1234567890ab"
    make(root, "2026-10-08")
    make(root, "2026-10-09", name="answer.webp")
    make(root, "2026-10-09", name="feedback.json")
    keep_other = make(root, "2026-10-09", sid=other)
    assert keep.delete_sid(root, SID) == 3
    assert keep_other.exists()
    assert files(root) == [f"2026-10-09/{other}/bare.jpg"]
    # 날짜 폴더가 비면 같이 치운다
    assert not (root / "2026-10-08").exists()
    assert keep.delete_sid(root, SID) == 0


@pytest.mark.parametrize("sid", ["..", "../x", "", "a/b", "*"])
def test_kp12b_delete_refuses_odd_ids(root, sid):
    make(root, "2026-10-09")
    with pytest.raises(ValueError):
        keep.delete_sid(root, sid)
    assert len(files(root)) == 1


def test_kp13_listing_shows_sessions_without_content(root):
    make(root, "2026-10-08")
    make(root, "2026-10-09", name="answer.webp")
    rows = keep.listing(root)
    assert rows == [("2026-10-08", SID, ["bare.jpg"], 1), ("2026-10-09", SID, ["answer.webp"], 1)]


def test_kp14_cors_allows_post(client):
    r = client.options(
        "/keep",
        headers={"origin": "http://localhost:5173", "access-control-request-method": "POST"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_kp15_seven_days_counts_from_the_receive_day(root):
    # 10/2 23:00 UTC 에 받은 것은 10/9 까지 남고 10/10 에 지워진다
    make(root, "2026-10-02")
    assert keep.purge(root, 7, datetime(2026, 10, 9, 23, 59, tzinfo=UTC)) == []
    assert keep.purge(root, 7, datetime(2026, 10, 9, 23, 59, tzinfo=UTC) + timedelta(minutes=2)) == [
        "2026-10-02"
    ]


def test_kp16_app_can_ask_before_uploading(client, tmp_path, monkeypatch):
    # 앱은 사진을 올리기 전에 켜져 있는지 묻는다 — 꺼져 있는데 큰 사진을 올려 보지 않게
    assert client.get("/keep").json() == {"on": True, "days": 7, "until": None}
    monkeypatch.undo()
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("DHE_KEEP_DAYS", raising=False)
    r = TestClient(main.app).get("/keep")
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "off"


def test_kp17_old_photos_go_even_after_keeping_is_turned_off(tmp_path, monkeypatch):
    # 보관을 끄면 새로 올라오는 것이 없다 — 그래도 남은 것은 기한이 지나면 지워져야 한다
    # (서버가 주기적으로 부른다)
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("DHE_KEEP_DAYS", raising=False)
    root = tmp_path / "keep"
    make(root, "2026-09-30")
    make(root, "2026-10-05")
    assert keep.purge_stored(NOW) == ["2026-09-30"]
    assert [p.name for p in root.iterdir()] == ["2026-10-05"]


def test_kp17b_configured_days_win(tmp_path, monkeypatch):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", "2")
    make(tmp_path / "keep", "2026-10-05")
    assert keep.purge_stored(NOW) == ["2026-10-05"]


def test_kp17c_nothing_to_purge_without_a_data_dir(monkeypatch):
    monkeypatch.delenv("DHE_DATA_DIR", raising=False)
    assert keep.purge_stored(NOW) == []


def test_kp18_server_purges_on_startup(tmp_path, monkeypatch):
    # 서버가 뜰 때 한 번 치운다 — 재배포가 잦아도 기한 지난 것이 남지 않는다
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", "7")
    old = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    make(tmp_path / "keep", old)
    make(tmp_path / "keep", today)
    with TestClient(main.app) as c:
        assert c.get("/health").status_code == 200
        for _ in range(50):
            if not (tmp_path / "keep" / old).exists():
                break
            import time

            time.sleep(0.02)
    assert [p.name for p in (tmp_path / "keep").iterdir()] == [today]


def test_kp19_cli_lists_deletes_and_purges(tmp_path, monkeypatch, capsys):
    # 백엔드 PC 에서 손으로(또는 "보관 사진 관리" 워크플로로) 돌리는 명령
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", "7")
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    make(tmp_path / "keep", today)
    make(tmp_path / "keep", "2026-01-01")
    assert keep.main(["keep", "list", "--full"]) == 0
    out = capsys.readouterr().out
    assert SID in out and "bare.jpg" in out and "세션 1개" in out
    assert keep.main(["keep", "purge"]) == 0
    assert not (tmp_path / "keep" / "2026-01-01").exists()
    # 세션 번호는 환경 변수로도 받는다 — 워크플로가 명령 줄을 거치지 않고 넘긴다
    monkeypatch.setenv("KEEP_SID", SID)
    assert keep.main(["keep", "delete"]) == 0
    out = capsys.readouterr().out
    assert "지운 파일 1개" in out
    assert SID not in out and f"{SID[:4]}…" in out
    assert files(tmp_path / "keep") == []


def test_kp19c_cli_does_not_print_whole_session_ids(tmp_path, monkeypatch, capsys):
    # 저장소가 공개라 워크플로의 실행 화면은 누구나 본다 (2026-10-13) — 세션 번호는 앞 네 글자만 찍는다.
    # 전부 보려면 서버 PC 에서 직접 list --full
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    make(tmp_path / "keep", "2026-10-09")
    assert keep.main(["keep", "list"]) == 0
    out = capsys.readouterr().out
    assert SID not in out
    assert f"{SID[:4]}…" in out and "bare.jpg" in out and "세션 1개" in out


@pytest.mark.parametrize("sid", ["", "x; rm -rf /", "a & del b", "../.."])
def test_kp19b_cli_refuses_odd_session_ids(tmp_path, monkeypatch, sid):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("KEEP_SID", sid)
    kept = make(tmp_path / "keep", "2026-10-09")
    assert keep.main(["keep", "delete"]) == 2
    assert kept.exists()


# ── 정해 둔 때까지 보관 (2026-10-12 결정) — 받은 날부터 며칠이 아니라 테스트가 끝나는 때에 한꺼번에 지운다 ──
UNTIL = "2026-10-19T17:00:00+09:00"
BEFORE = datetime(2026, 10, 19, 7, 59, tzinfo=UTC)  # 한국 시간 16:59
AFTER = datetime(2026, 10, 19, 8, 0, tzinfo=UTC)  # 한국 시간 17:00


def test_kp20_until_alone_turns_it_on_and_stops_at_that_time(tmp_path, monkeypatch):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("DHE_KEEP_DAYS", raising=False)
    monkeypatch.setenv("DHE_KEEP_UNTIL", UNTIL)
    monkeypatch.setattr(keep, "_last_purge", None)
    monkeypatch.setattr(keep, "now", lambda: BEFORE)
    c = TestClient(main.app)
    assert c.get("/keep").json() == {"on": True, "days": 0, "until": UNTIL}
    assert post(c).status_code == 204
    monkeypatch.setattr(keep, "now", lambda: AFTER)
    assert c.get("/keep").status_code == 503
    assert post(c).status_code == 503


def test_kp21_until_keeps_everything_until_then_and_removes_everything_after(tmp_path, monkeypatch):
    # 10/9 에 받은 것도 7일(10/16)에 지워지지 않고 10/19 오후 5시까지 남는다. 그때가 되면 전부 지운다
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_DAYS", "7")
    monkeypatch.setenv("DHE_KEEP_UNTIL", UNTIL)
    root = tmp_path / "keep"
    for day in ("2026-10-09", "2026-10-15", "2026-10-19"):
        make(root, day)
    make(root, "메모")
    assert keep.purge_stored(BEFORE) == []
    assert sorted(p.name for p in root.iterdir()) == ["2026-10-09", "2026-10-15", "2026-10-19", "메모"]
    assert keep.purge_stored(AFTER) == ["2026-10-09", "2026-10-15", "2026-10-19"]
    assert [p.name for p in root.iterdir()] == ["메모"]


def test_kp21b_storing_does_not_purge_by_age_while_until_is_set(tmp_path, monkeypatch):
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DHE_KEEP_UNTIL", UNTIL)
    monkeypatch.setattr(keep, "_last_purge", None)
    monkeypatch.setattr(keep, "now", lambda: BEFORE)
    make(tmp_path / "keep", "2026-10-09")
    assert post(TestClient(main.app)).status_code == 204
    assert (tmp_path / "keep" / "2026-10-09").exists()


@pytest.mark.parametrize("bad", ["", "내일", "2026-10-19", "2026-10-19T17:00:00"])
def test_kp22_until_without_a_clear_time_is_ignored(tmp_path, monkeypatch, bad):
    # 시간대가 없으면 받지 않는다 — 서버 시계(UTC)로 읽혀 아홉 시간 어긋난 때에 지우지 않게
    monkeypatch.setenv("DHE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("DHE_KEEP_DAYS", raising=False)
    monkeypatch.setenv("DHE_KEEP_UNTIL", bad)
    assert keep.keep_until() is None
    assert post(TestClient(main.app)).status_code == 503
