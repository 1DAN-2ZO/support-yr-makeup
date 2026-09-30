"""당화응 서버 API — FastAPI, Python 3.11.

엔드포인트:
  GET  /health   상태·버전

실행:  uv run uvicorn server.app.main:app --reload --port 8000

Stable-Makeup 잡 큐(/sessions/*/jobs · /jobs/*)는 VLM 개인화 전환(#179·#180)으로
앱이 더 이상 부르지 않아 뺐다. jobs.py·worker_stable_makeup.py도 같이 제거.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
