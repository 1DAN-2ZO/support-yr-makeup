"""당화응 서버 API — FastAPI, Python 3.11.

엔드포인트 (ai-pipeline-v6.md 1-2):
  GET  /health                      버커 상태·큐 깊이·버전
  POST /sessions/{sid}/jobs         정면 사진 1장 + look_ids → LookJob N개
                                    (사진은 임시 폴더, 마지막 작업 후 삭제)
  GET  /jobs/{job_id}               폴링
  POST /jobs/{job_id}/promote       사용자가 고른 룩을 앞으로

실행:  uv run uvicorn server.app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from .config import settings
from .jobs import JobQueue, stub_worker
from .schemas import Health, JobBatch, LookJob
from .worker_stable_makeup import stable_makeup_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("dhe.api")

worker = stable_makeup_worker if settings.worker_mode == "gpu" else stub_worker
queue = JobQueue(worker=worker)
os.makedirs(settings.result_dir, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    queue.close()


app = FastAPI(title="당화응 API", version=settings.versions.app, lifespan=lifespan)
app.mount("/results", StaticFiles(directory=settings.result_dir), name="results")


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(
        ok=True, ver=settings.versions.as_dict(), queue_depth=queue.depth(), worker=settings.worker_mode
    )


@app.post("/sessions/{session_id}/jobs", response_model=JobBatch)
async def create_jobs(
    session_id: str,
    photo: UploadFile = File(..., description="정면 눈 뜸 1장, WebP/JPEG, 긴 변 1024"),
    look_ids: str = Form("", description="쉼표로 구분한 룩 ID"),
    chosen: str | None = Form(None, description="사용자가 먼저 고른 룩 ID (우선 생성)"),
) -> JobBatch:
    ids = [s.strip() for s in look_ids.split(",") if s.strip()]
    if not ids:
        raise HTTPException(400, "look_ids empty")
    if len(ids) > settings.max_looks:
        raise HTTPException(400, f"too many looks (max {settings.max_looks})")
    if photo.content_type not in ("image/webp", "image/jpeg", "image/png"):
        raise HTTPException(415, "photo must be webp/jpeg/png")

    os.makedirs(settings.upload_dir, exist_ok=True)
    # 파일명에 세션·원본 이름을 남기지 않는다 (로그·디스크 모두)
    path = os.path.join(settings.upload_dir, uuid.uuid4().hex)
    data = await photo.read()
    if not data:
        raise HTTPException(400, "empty photo")
    with open(path, "wb") as f:
        f.write(data)

    jobs = queue.submit(session_id, path, ids, chosen)
    return JobBatch(session_id=session_id, jobs=jobs)


@app.get("/jobs/{job_id}", response_model=LookJob)
def get_job(job_id: str) -> LookJob:
    job = queue.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found (expired or unknown)")
    return job


@app.post("/jobs/{job_id}/promote")
def promote(job_id: str) -> dict[str, bool]:
    return {"ok": queue.promote(job_id)}
