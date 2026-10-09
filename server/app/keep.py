"""테스트 기간 사진 보관 (2026-10-09 결정) — 참고 사진을 뺀 사용자 사진과 피드백 결과를 며칠 동안 쌓아 둔다.

쓰는 곳: 판정 기준값을 맞추는 데와 사람이 눈으로 검증하는 데. 테스트 기간에만, 동의한 사용자의 것만.
평소 원칙은 "사진은 서버에 저장하지 않는다" 다 — 그래서 **기본은 꺼져 있다.**
DHE_KEEP_DAYS(보관 일수)를 줘야 받는다.
동의 문구가 보관을 알리기 전에는 켜지 않는다.

- 쌓는 곳: $DHE_DATA_DIR/keep/<받은 날 UTC>/<세션 번호>/<종류>.<확장자> — 저장소 밖
- 받는 종류: bare 맨얼굴 · answer 정답사진 · moved 옮긴 그림 · attempt_open_0~4 시도사진 눈 뜬 장 ·
  attempt_closed 시도사진 눈 감은 장 · feedback 피드백 결과(글).
  **참고 사진은 받는 이름이 없다** (다른 사람의 얼굴)
- 받은 날 기준 DHE_KEEP_DAYS 일이 지나면 날짜 폴더째 지운다 (받을 때마다 · 서버를 켤 때 치운다)
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


def keep_dir() -> Path | None:
    root = os.environ.get("DHE_DATA_DIR")
    return Path(root) / "keep" if root and keep_days() > 0 else None


# 보관을 끈 뒤에도 남아 있는 것을 치울 때 쓰는 일수 (DHE_KEEP_DAYS 가 없을 때)
DEFAULT_DAYS = 7


def stored_root() -> Path | None:
    """사진이 쌓여 있을 수 있는 자리 — 보관이 꺼져 있어도 준다 (끈 뒤에 남은 것을 치우려고)"""
    root = os.environ.get("DHE_DATA_DIR")
    return Path(root) / "keep" if root else None


def purge_stored(at: datetime | None = None) -> list[str]:
    """기한이 지난 것을 치운다 — 새로 들어오는 것이 없어도, 보관을 끈 뒤에도 돈다 (서버가 주기적으로 부름)"""
    root = stored_root()
    return purge(root, keep_days() or DEFAULT_DAYS, at or now()) if root else []


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
    """한 시간에 한 번쯤 치운다 — 받을 때마다 폴더를 다 훑지 않게"""
    global _last_purge
    at = now()
    if _last_purge is None or at - _last_purge >= timedelta(hours=1) or at < _last_purge:
        _last_purge = at
        purge(root, keep_days(), at)


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
            f"보관 중: 세션 {len({r[1] for r in rows})}개 · 폴더 {len(rows)}개 · 보관 일수 설정 {keep_days()}"
        )
        for day, sid, names, size in rows:
            print(f"{day}  {sid}  {size / 1024:.0f}KB  {' '.join(names)}")
        return 0
    if cmd == "delete":
        # 세션 번호는 인자 또는 환경 변수 KEEP_SID (워크플로가 명령 줄을 거치지 않고 넘긴다)
        sid = argv[2] if len(argv) > 2 else os.environ.get("KEEP_SID", "")
        try:
            print(f"지운 파일 {delete_sid(root, sid)}개 (세션 {sid})")
        except ValueError:
            print("세션 번호 모양이 아닙니다 (영문 · 숫자 · 줄표 8~64자)")
            return 2
        return 0
    if cmd == "purge":
        print(f"{keep_days() or DEFAULT_DAYS}일 지난 폴더 지움: {purge_stored() or '없음'}")
        return 0
    print("쓰는 법: list | delete <세션 번호> | purge")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
