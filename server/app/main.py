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

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import events
from .config import settings
from .flux import FluxError, get_flux
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


def _fail(status: int, code: str, message: str = "", headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message}, headers=headers)


async def _photo(f: UploadFile) -> tuple[bytes, str]:
    media_type = f.content_type or ""
    if not media_type.startswith("image/"):
        raise _fail(422, "not_image")
    data = await f.read(MAX_PHOTO + 1)
    if len(data) > MAX_PHOTO:
        raise _fail(413, "too_large")
    if not data:
        raise _fail(422, "empty")
    return data, media_type


@app.post("/transfer")
async def transfer(bare: UploadFile = File(...), ref: UploadFile = File(...)) -> Response:
    """맨얼굴(bare)에 화장 사진(ref)의 화장을 입힌 그림 한 장. 정답사진 · 옮긴 그림이 같은 길이다"""
    flux = get_flux()
    if flux is None:
        raise _fail(503, "off", "transfer off (DHE_FLUX_URL)")
    b, bt = await _photo(bare)
    r, rt = await _photo(ref)
    try:
        picture, media_type, ms = await flux.transfer(b, bt, r, rt)
    except FluxError as e:
        # 사진 내용은 남기지 않는다 — 무슨 일이었는지와 크기만
        log.warning("transfer %s %s (bare %d · ref %d bytes)", e.code, e.message[:80], len(b), len(r))
        raise _fail(e.status, e.code, e.message, {"Retry-After": "10"} if e.code == "busy" else None) from e
    log.info("transfer ok %dms (bare %d · ref %d → %d bytes)", ms, len(b), len(r), len(picture))
    return Response(
        picture, media_type=media_type, headers={"x-gen-ms": str(ms), "cache-control": "no-store"}
    )
