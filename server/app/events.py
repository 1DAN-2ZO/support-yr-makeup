"""사용 기록 받기 — 앱 로그 줄(client/src/core/log.ts 의 Event)을 날짜별 JSONL 로 쌓는다.

어느 화면에서 나갔는지(이탈 위치)를 보려는 것. 사진·얼굴 점·결과는 받지 않는다 — 금지 키는 앱과 같은 목록이고,
값은 글자·숫자·참거짓·null 만 받는다(ver 만 글자 사전). 요청의 주소(IP)·브라우저 정보도 남기지 않는다.

쌓는 곳: $DHE_DATA_DIR/events/<받은 날 UTC>.jsonl — 저장소 밖. eval/funnel/run.py 가 그대로 읽는다.
DHE_DATA_DIR 가 없으면 받지 않는다(503).
"""

from __future__ import annotations

import json
import os
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

# 한 번에 받는 양 — 화면 이동 몇 줄이면 충분하다. 넘으면 거절
MAX_BODY = 64 * 1024
MAX_EVENTS = 200
MAX_STR = 500
MAX_KEYS = 24

# client/src/core/log.ts FORBIDDEN_KEYS 와 같은 목록 — 바꾸면 양쪽을 같이
FORBIDDEN_KEYS = frozenset({"lm", "pts", "frames", "image", "bareImage", "photo", "path", "filename"})

_lock = threading.Lock()


class BadEvents(ValueError):
    """받을 수 없는 모양 — 한 줄이라도 틀리면 묶음 전체를 거절한다"""


def events_dir() -> Path | None:
    root = os.environ.get("DHE_DATA_DIR")
    return Path(root) / "events" if root else None


def now_ms() -> int:
    return int(time.time() * 1000)


def _text(v: object, lo: int, hi: int) -> bool:
    return isinstance(v, str) and lo <= len(v) <= hi


def _scalar(v: object) -> bool:
    if isinstance(v, str):
        return len(v) <= MAX_STR
    return v is None or isinstance(v, (bool, int, float))


def _check(e: object) -> dict:
    if not isinstance(e, dict) or len(e) > MAX_KEYS:
        raise BadEvents("event")
    if FORBIDDEN_KEYS & e.keys():
        raise BadEvents("forbidden key")
    t = e.get("t")
    if not _text(e.get("sid"), 1, 64) or not _text(e.get("screen"), 1, 40) or not _text(e.get("name"), 1, 40):
        raise BadEvents("sid/screen/name")
    if isinstance(t, bool) or not isinstance(t, (int, float)):
        raise BadEvents("t")
    for k, v in e.items():
        if not _text(k, 1, 40):
            raise BadEvents("key")
        if k == "ver":
            if (
                not isinstance(v, dict)
                or len(v) > 8
                or not all(_text(a, 1, 40) and _text(b, 0, 64) for a, b in v.items())
            ):
                raise BadEvents("ver")
        elif not _scalar(v):
            raise BadEvents(k)
    return e


def parse(body: bytes) -> list[dict]:
    """요청 몸통 → 검사한 이벤트들. content-type 은 보지 않는다 (sendBeacon 은 text/plain)"""
    try:
        data = json.loads(body)
    except ValueError as err:
        raise BadEvents("json") from err
    evs = data.get("events") if isinstance(data, dict) else None
    if not isinstance(evs, list) or not 1 <= len(evs) <= MAX_EVENTS:
        raise BadEvents("events")
    return [_check(e) for e in evs]


def store(evs: list[dict], out: Path) -> None:
    rt = now_ms()
    day = datetime.fromtimestamp(rt / 1000, UTC).strftime("%Y-%m-%d")
    text = "".join(json.dumps({**e, "rt": rt}, ensure_ascii=False, separators=(",", ":")) + "\n" for e in evs)
    with _lock:
        out.mkdir(parents=True, exist_ok=True)
        with (out / f"{day}.jsonl").open("a", encoding="utf-8") as f:
            f.write(text)
