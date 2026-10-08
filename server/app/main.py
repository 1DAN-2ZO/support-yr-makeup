"""당화응 서버 API — FastAPI, Python 3.11.

엔드포인트:
  GET  /health   상태·버전
  POST /events   사용 기록 받기 (어느 화면에서 나갔는지) — 사진·얼굴 점은 받지 않는다. events.py
  POST /transfer 그림 만들기 (맨얼굴 + 화장 사진 → GPU 의 FLUX 서버 → 그림 한 장). 저장하지 않는다. flux.py

실행:  uv run uvicorn server.app.main:app --reload --port 8000

Stable-Makeup 잡 큐(/sessions/*/jobs · /jobs/*)는 VLM 개인화 전환(#179·#180)으로
앱이 더 이상 부르지 않아 뺐다. jobs.py·worker_stable_makeup.py도 같이 제거.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import UploadFile

from . import events
from .config import settings
from .flux import FluxError, Gone, get_flux, unless_gone
from .schemas import Health

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("dhe.api")

app = FastAPI(title="당화응 API", version=settings.versions.app)

# CORS 설정 — 개발 클라이언트(localhost:5173) 허용
_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173"
)
_origins = os.environ.get("DHE_CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(ok=True, ver=settings.versions.as_dict())


@app.post("/events", status_code=204)
async def post_events(request: Request) -> Response:
    out = events.events_dir()
    if out is None:
        raise HTTPException(503, "events off (DHE_DATA_DIR)")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > events.MAX_BODY:
            raise HTTPException(413, "too large")
    try:
        evs = events.parse(body)
    except events.BadEvents as err:
        raise HTTPException(422, str(err)) from err
    events.store(evs, out)
    return Response(status_code=204)


# 사진 한 장의 크기 한도. 폰 원본 크기 사진(2160x3840 JPEG · WebP)이 넉넉히 들어간다
MAX_PHOTO = 15 * 1024 * 1024
# 올리는 몸통 전체의 한도 — 사진 두 장 + multipart 머리말. 몸통을 받기 전에 Content-Length 로 본다
MAX_BODY = 2 * MAX_PHOTO + 64 * 1024


def _fail(status: int, code: str, message: str = "", headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message}, headers=headers)


def _kind(data: bytes) -> str | None:
    """사진 종류를 내용의 첫머리로 정한다 — 올린 쪽이 적은 종류는 믿지 않고 FLUX 로 넘기지도 않는다"""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _photo(f: object) -> tuple[bytes, str]:
    if not isinstance(f, UploadFile):
        raise _fail(422, "missing")
    data = await f.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        raise _fail(413, "too_large")
    if not data:
        raise _fail(422, "empty")
    kind = _kind(data)
    if kind is None:
        raise _fail(422, "not_image")
    return data, kind


@app.post("/transfer")
async def transfer(request: Request) -> Response:
    """맨얼굴(bare)에 화장 사진(ref)의 화장을 입힌 그림 한 장. 정답사진 · 옮긴 그림이 같은 길이다.

    몸통(사진 두 장)을 받기 전에 걸러 낸다 — 꺼짐 · 너무 큼 · 줄이 꽉 참.
    다 받은 뒤에 거절하면 그동안 디스크와 메모리를 내준다
    """
    flux = get_flux()
    if flux is None:
        raise _fail(503, "off", "transfer off (DHE_FLUX_URL)")
    length = request.headers.get("content-length", "")
    if not length.isdigit():
        raise _fail(411, "length")
    if int(length) > MAX_BODY:
        raise _fail(413, "too_large")
    if flux.full():
        raise _fail(503, "busy", headers={"Retry-After": "10"})
    try:
        form = await request.form()
    except Exception as e:  # noqa: BLE001 — 깨진 multipart 는 종류가 여럿이다
        raise _fail(422, "missing") from e
    b, bt = await _photo(form.get("bare"))
    r, rt = await _photo(form.get("ref"))
    try:
        # 앱이 끊으면(화면을 떠남 · 시간 초과) 그만둔다 — 받을 사람이 없는 요청이 줄을 차지하지 않게
        picture, media_type, ms = await unless_gone(flux.transfer(b, bt, r, rt), request.is_disconnected)
    except Gone:
        log.info("transfer gone (bare %d · ref %d bytes)", len(b), len(r))
        return Response(status_code=499)
    except FluxError as e:
        # 사진 내용은 남기지 않는다 — 무슨 일이었는지와 크기만.
        # FLUX 가 한 말(note)은 로그에만 두고 밖으로는 안 내보낸다
        log.warning("transfer %s %s (bare %d · ref %d bytes)", e.code, e.note[:120], len(b), len(r))
        raise _fail(e.status, e.code, e.message, {"Retry-After": "10"} if e.code == "busy" else None) from e
    log.info("transfer ok %dms (bare %d · ref %d → %d bytes)", ms, len(b), len(r), len(picture))
    return Response(
        picture, media_type=media_type, headers={"x-gen-ms": str(ms), "cache-control": "no-store"}
    )
