"""당화응 서버 API — FastAPI, Python 3.11.

엔드포인트:
  GET  /health   상태·버전
  POST /events   사용 기록 받기 (어느 화면에서 나갔는지) — 사진·얼굴 점은 받지 않는다. events.py

실행:  uv run uvicorn server.app.main:app --reload --port 8000

Stable-Makeup 잡 큐(/sessions/*/jobs · /jobs/*)는 VLM 개인화 전환(#179·#180)으로
앱이 더 이상 부르지 않아 뺐다. jobs.py·worker_stable_makeup.py도 같이 제거.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from . import events
from .config import settings
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
