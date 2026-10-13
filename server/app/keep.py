"""테스트 기간 사진 보관 (2026-10-09 결정) — 참고 사진을 뺀 사용자 사진과 피드백 결과를 며칠 동안 쌓아 둔다.

쓰는 곳: 판정 기준값을 맞추는 데와 사람이 눈으로 검증하는 데. 테스트 기간에만, 동의한 사용자의 것만.
평소 원칙은 "사진은 서버에 저장하지 않는다" 다 — 그래서 **기본은 꺼져 있다.**
DHE_KEEP_UNTIL(언제까지 — 시간대가 붙은 시각) 이나 DHE_KEEP_DAYS(보관 일수)를 줘야 받는다.
**지금은 DHE_KEEP_UNTIL 을 쓴다** (2026-10-12 결정): 받은 날부터 며칠이 아니라,
그 시각까지 다 두었다가 그때 한꺼번에 지운다.
그 시각이 지나면 받지도 않는다. DHE_KEEP_UNTIL 이 있으면 DHE_KEEP_DAYS 는 보지 않는다.
동의 문구가 보관을 알리기 전에는 켜지 않는다.

- 쌓는 곳: $DHE_DATA_DIR/keep/<받은 날 UTC>/<세션 번호>/<종류>.<확장자> — 저장소 밖
- 받는 종류: bare 맨얼굴 · answer 정답사진 · moved 옮긴 그림 · attempt_open_0~4 시도사진 눈 뜬 장 ·
  attempt_closed 시도사진 눈 감은 장 · feedback 피드백 결과(글).
  **참고 사진은 받는 이름이 없다** (다른 사람의 얼굴)
- DHE_KEEP_UNTIL 이 있으면 그 시각에 전부 지운다.
  없으면 받은 날 기준 DHE_KEEP_DAYS 일이 지난 날짜 폴더를 지운다
  (서버가 켤 때 · 1분마다 본다)
- 지워 달라는 요청: 세션 번호로 그 사람의 것을 전부 지운다 (delete_sid). 세션 번호는 앱이 만든 무작위 값이라
  이름 · 주소(IP) 같은 것은 같이 두지 않는다

손으로 볼 때 (백엔드 컨테이너 안에서):

    python -m server.app.keep list
    python -m server.app.keep delete <세션 번호>     (또는 환경 변수 KEEP_SID)
    python -m server.app.keep purge
"""

from __future__ import annotations

import os
import re
import shutil
import sys
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

# 사진 한 장 · 피드백 결과(글)의 크기 한도
MAX_FILE = 15 * 1024 * 1024
MAX_FEEDBACK = 64 * 1024

PHOTO_KINDS = frozenset(
    {"bare", "answer", "moved", "attempt_closed", *(f"attempt_open_{i}" for i in range(5))}
)
KINDS = PHOTO_KINDS | {"feedback"}
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

_SID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_lock = threading.Lock()


class BadKeep(ValueError):
    """받을 수 없는 것 — 세션 번호나 종류가 정해 둔 모양이 아니다"""


def keep_days() -> int:
    """보관 일수. 0 이면 꺼짐 (없거나 숫자가 아니거나 0 이하)"""
    try:
        return max(0, int(os.environ.get("DHE_KEEP_DAYS", "0")))
    except ValueError:
        return 0


def keep_until() -> datetime | None:
    """언제까지 보관하나 (DHE_KEEP_UNTIL, 예: 2026-10-19T17:00:00+09:00). 없거나 읽을 수 없으면 None.

    시간대가 없는 값은 받지 않는다 — 서버 시계(UTC)로 읽혀 아홉 시간 어긋난 때에 지우지 않게
    """
    raw = os.environ.get("DHE_KEEP_UNTIL", "").strip()
    if not raw:
        return None
    try:
        t = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return t if t.tzinfo is not None else None


def keep_dir() -> Path | None:
    """받는 자리. 꺼져 있으면 None — 기한(DHE_KEEP_UNTIL)이 있으면 그때까지만, 없으면 일수가 있을 때"""
    root = os.environ.get("DHE_DATA_DIR")
    if not root:
        return None
    until = keep_until()
    on = now() < until if until else keep_days() > 0
    return Path(root) / "keep" if on else None


# 보관을 끈 뒤에도 남아 있는 것을 치울 때 쓰는 일수 (DHE_KEEP_DAYS 가 없을 때)
DEFAULT_DAYS = 7


def stored_root() -> Path | None:
    """사진이 쌓여 있을 수 있는 자리 — 보관이 꺼져 있어도 준다 (끈 뒤에 남은 것을 치우려고)"""
    root = os.environ.get("DHE_DATA_DIR")
    return Path(root) / "keep" if root else None


def purge_stored(at: datetime | None = None) -> list[str]:
    """기한이 지난 것을 치운다 — 새로 들어오는 것이 없어도, 보관을 끈 뒤에도 돈다 (서버가 주기적으로 부름)"""
    root = stored_root()
    if not root:
        return []
    at, until = at or now(), keep_until()
    if until:
        # 기한이 있으면 그때까지는 며칠이 지났든 두고, 그때가 되면 전부 지운다
        return purge_all(root) if at >= until else []
    return purge(root, keep_days() or DEFAULT_DAYS, at)


def now() -> datetime:
    return datetime.now(UTC)


def check(sid: object, kind: object) -> tuple[str, str]:
    if not isinstance(sid, str) or not _SID.match(sid):
        raise BadKeep("sid")
    if not isinstance(kind, str) or kind not in KINDS:
        raise BadKeep("kind")
    return sid, kind


def store(root: Path, sid: str, kind: str, data: bytes, ext: str, at: datetime) -> Path:
    """받은 날 폴더에 쓴다. 같은 종류가 이미 있으면 바꾼다 (확장자가 달라도 한 장만 남긴다)"""
    sid, kind = check(sid, kind)
    folder = root / at.astimezone(UTC).strftime("%Y-%m-%d") / sid
    with _lock:
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob(f"{kind}.*"):
            old.unlink()
        path = folder / f"{kind}.{ext}"
        path.write_bytes(data)
    return path


def _day_of(p: Path) -> date | None:
    if not p.is_dir() or not _DAY.match(p.name):
        return None
    try:
        return date.fromisoformat(p.name)
    except ValueError:
        return None


def purge(root: Path, days: int, at: datetime) -> list[str]:
    """받은 날 기준 days 일이 지난 날짜 폴더를 지운다. 날짜 모양이 아닌 것은 안 건드린다. 지운 폴더 이름들"""
    if days <= 0 or not root.is_dir():
        return []
    cutoff = at.astimezone(UTC).date() - timedelta(days=days)
    gone = []
    with _lock:
        for p in sorted(root.iterdir()):
            d = _day_of(p)
            if d is not None and d < cutoff:
                shutil.rmtree(p, ignore_errors=True)
                gone.append(p.name)
    return gone


def purge_all(root: Path) -> list[str]:
    """날짜 폴더를 전부 지운다 (기한이 됐을 때). 날짜 모양이 아닌 것은 안 건드린다. 지운 폴더 이름들"""
    if not root.is_dir():
        return []
    gone = []
    with _lock:
        for p in sorted(root.iterdir()):
            if _day_of(p) is not None:
                shutil.rmtree(p, ignore_errors=True)
                gone.append(p.name)
    return gone


def delete_sid(root: Path, sid: str) -> int:
    """한 세션의 것을 날짜와 상관없이 전부 지운다. 지운 파일 수"""
    if not _SID.match(sid):
        raise ValueError("세션 번호 모양이 아니다")
    n = 0
    if not root.is_dir():
        return 0
    with _lock:
        for day in sorted(root.iterdir()):
            folder = day / sid
            if _day_of(day) is None or not folder.is_dir():
                continue
            n += sum(1 for f in folder.rglob("*") if f.is_file())
            shutil.rmtree(folder, ignore_errors=True)
            if not any(day.iterdir()):
                day.rmdir()
    return n


def listing(root: Path) -> list[tuple[str, str, list[str], int]]:
    """(받은 날, 세션 번호, 파일 이름들, 바이트 합) — 내용은 읽지 않는다"""
    rows = []
    if not root.is_dir():
        return rows
    for day in sorted(root.iterdir()):
        if _day_of(day) is None:
            continue
        for folder in sorted(p for p in day.iterdir() if p.is_dir()):
            fs = sorted(f for f in folder.iterdir() if f.is_file())
            rows.append((day.name, folder.name, [f.name for f in fs], sum(f.stat().st_size for f in fs)))
    return rows


_last_purge: datetime | None = None


def purge_sometimes(root: Path) -> None:
    """한 시간에 한 번쯤 치운다 — 받을 때마다 폴더를 다 훑지 않게.

    기한(DHE_KEEP_UNTIL)이 있으면 일수로는 안 치운다
    """
    global _last_purge
    at = now()
    if _last_purge is None or at - _last_purge >= timedelta(hours=1) or at < _last_purge:
        _last_purge = at
        if keep_until() is None:
            purge(root, keep_days(), at)


def short(sid: str) -> str:
    """세션 번호의 앞 네 글자만 — 공개 저장소의 실행 화면에 번호를 다 찍지 않으려고 (2026-10-13)"""
    return f"{sid[:4]}…"


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    root_env = os.environ.get("DHE_DATA_DIR")
    if not root_env:
        print("DHE_DATA_DIR 가 없습니다")
        return 2
    root = Path(root_env) / "keep"
    cmd = argv[1] if len(argv) > 1 else "list"
    if cmd == "list":
        rows = listing(root)
        print(
            f"보관 중: 세션 {len({r[1] for r in rows})}개 · 폴더 {len(rows)}개"
            f" · 기한 {keep_until() or '없음'} · 보관 일수 설정 {keep_days()}"
        )
        # 세션 번호는 앞 네 글자만 찍는다 — 워크플로의 실행 화면은 누구나 본다.
        # 전부 보려면 서버 PC 에서 list --full
        full = "--full" in argv[2:]
        for day, sid, names, size in rows:
            print(f"{day}  {sid if full else short(sid)}  {size / 1024:.0f}KB  {' '.join(names)}")
        return 0
    if cmd == "delete":
        # 세션 번호는 인자 또는 환경 변수 KEEP_SID (워크플로가 명령 줄을 거치지 않고 넘긴다)
        sid = argv[2] if len(argv) > 2 else os.environ.get("KEEP_SID", "")
        try:
            print(f"지운 파일 {delete_sid(root, sid)}개 (세션 {short(sid)})")
        except ValueError:
            print("세션 번호 모양이 아닙니다 (영문 · 숫자 · 줄표 8~64자)")
            return 2
        return 0
    if cmd == "purge":
        until = keep_until()
        rule = f"기한({until})이 지났으면 전부" if until else f"{keep_days() or DEFAULT_DAYS}일 지난 폴더"
        print(f"{rule} 지움: {purge_stored() or '없음'}")
        return 0
    print("쓰는 법: list [--full] | delete <세션 번호> | purge")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
