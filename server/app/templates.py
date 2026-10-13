"""화장 템플릿 사진 (#420) — 템플릿 번호로 서버가 직접 꺼내는 참고 사진.

앱이 템플릿을 골랐을 때는 사진을 올리지 않고 번호(1~10)만 보낸다 (POST /transfer 의 `template`).
사진은 서버 폴더 `server/app/templates/NN.webp` 에 있다 — 두 자리 번호. 사용자 사진은 아니고
우리가 만든 템플릿 사진이다. 앱 쪽 색 팔레트와 번호가 같다 (client/public/templates/prep/templates.json).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).parent / "templates"
# 템플릿은 10종 — 번호는 1~10. 늘리면 여기와 앱의 core/templates.ts 를 같이 바꾼다
COUNT = 10
_TYPES = {".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png"}


def parse(value: object) -> int | None:
    """폼 값 → 템플릿 번호. 숫자 아님 · 범위 밖이면 None ("03" 처럼 앞 0 이 붙은 것도 숫자로 읽는다)"""
    if not isinstance(value, str) or not value.strip().isdecimal():
        return None
    n = int(value)
    return n if 1 <= n <= COUNT else None


@lru_cache(maxsize=COUNT)
def photo(n: int) -> tuple[bytes, str] | None:
    """번호의 사진 (내용, 종류). 파일이 없으면 None — 서버 폴더가 비어 있다는 뜻이다"""
    for ext, kind in _TYPES.items():
        f = DIR / f"{n:02d}{ext}"
        if f.is_file():
            return f.read_bytes(), kind
    return None
