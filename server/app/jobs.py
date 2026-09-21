"""작업 큐 — 기본은 프로세스 안 큐(개발·테스트용). 운영은 Redis + RQ로 교체 (같은 인터페이스).

호출 그래프(ai-pipeline-v6.md 1-2):
  큐(우선순위: 사용자가 고른 룩 > 나머지) → 워커 → 전이 → 정체성 검사 → 레이어 추출 → finally 삭제
여기서 워커는 `worker` 함수 하나로 추상화한다. `stub_worker`는 모델 없이 흐름만 검증한다.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from .config import settings
from .schemas import Identity, JobStatus, LookJob

log = logging.getLogger("dhe.jobs")

# 워커 계약: (source_path, look_id) -> (result_url | None, layer_url | None, identity_cos | None)
Worker = Callable[[str, str], tuple[str | None, str | None, float | None]]


def stub_worker(source_path: str, look_id: str) -> tuple[str | None, str | None, float | None]:
    """모델 없는 워커. 파일이 존재하는지만 확인하고 즉시 '결과'를 돌려준다.
    Stable-Makeup 워커는 poc/screen2 server-bench 환경에서 이 함수 자리에 꽂는다."""
    if not os.path.exists(source_path):
        raise FileNotFoundError(source_path)
    time.sleep(0.01)
    return f"/results/{look_id}/{os.path.basename(source_path)}", None, 0.99


@dataclass
class _Job:
    job: LookJob
    source_path: str
    priority: int  # 0 = 사용자가 고른 룩, 1 = 나머지
    created: float = field(default_factory=time.time)
    started: float | None = None


class JobQueue:
    def __init__(self, worker: Worker = stub_worker) -> None:
        self._worker = worker
        self._jobs: dict[str, _Job] = {}
        self._pending: list[str] = []
        self._lock = threading.Lock()
        self._sources: dict[str, tuple[str, set[str]]] = {}  # session_id -> (path, 남은 job_id)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._stop = False
        self._thread.start()

    # ---- API 쪽 ----
    def submit(
        self, session_id: str, source_path: str, look_ids: list[str], chosen: str | None
    ) -> list[LookJob]:
        out: list[LookJob] = []
        with self._lock:
            self._sources[session_id] = (source_path, set())
            for look_id in look_ids:
                job_id = uuid.uuid4().hex
                lj = LookJob(
                    job_id=job_id, look_id=look_id, status=JobStatus.queued, ver=settings.versions.as_dict()
                )
                self._jobs[job_id] = _Job(
                    job=lj, source_path=source_path, priority=0 if look_id == chosen else 1
                )
                self._sources[session_id][1].add(job_id)
                self._pending.append(job_id)
                out.append(lj)
            self._pending.sort(key=lambda j: (self._jobs[j].priority, self._jobs[j].created))
        log.info("submit session=%s jobs=%d chosen=%s", session_id, len(look_ids), chosen)
        return out

    def get(self, job_id: str) -> LookJob | None:
        with self._lock:
            j = self._jobs.get(job_id)
            if not j:
                return None
            if j.job.status == JobStatus.queued and time.time() - j.created > settings.queue_warn_sec:
                j.job.status = JobStatus.waiting_long
            return j.job.model_copy()

    def promote(self, job_id: str) -> bool:
        """사용자가 다른 룩을 고르면 그 작업을 앞으로."""
        with self._lock:
            j = self._jobs.get(job_id)
            if not j or job_id not in self._pending:
                return False
            j.priority = 0
            self._pending.sort(key=lambda k: (self._jobs[k].priority, self._jobs[k].created))
            return True

    def depth(self) -> int:
        with self._lock:
            return len(self._pending)

    def purge_expired(self) -> int:
        """TTL 지난 작업 삭제 (크론이 부른다). 반환: 지운 수."""
        now = time.time()
        with self._lock:
            dead = [k for k, j in self._jobs.items() if now - j.created > settings.job_ttl_sec]
            for k in dead:
                self._jobs.pop(k, None)
        return len(dead)

    def close(self) -> None:
        self._stop = True

    # ---- 워커 루프 ----
    def _loop(self) -> None:
        while not self._stop:
            job_id = None
            with self._lock:
                if self._pending:
                    job_id = self._pending.pop(0)
            if job_id is None:
                time.sleep(0.02)
                continue
            self._run(job_id)

    def _run(self, job_id: str) -> None:
        j = self._jobs[job_id]
        j.started = time.time()
        j.job.status = JobStatus.running
        j.job.queue_ms = int((j.started - j.created) * 1000)
        try:
            result_url, layer_url, cos = self._worker(j.source_path, j.job.look_id)
            j.job.ms = int((time.time() - j.started) * 1000)
            j.job.identity = Identity(cos=cos)
            if cos is not None and cos < settings.identity_min_cos:
                j.job.status = JobStatus.fallback  # 결과 폐기, 썸네일 "준비 중"
                j.job.result_url = None
            else:
                j.job.status = JobStatus.done
                j.job.result_url = result_url
                if layer_url:
                    from .schemas import Layer

                    j.job.layer = Layer(url=layer_url)
            if j.job.ms > settings.look_budget_sec * 1000:
                log.warning("look_job over budget job=%s ms=%d", job_id, j.job.ms)
        except Exception as e:  # 룩 하나 실패해도 나머지는 계속
            j.job.status = JobStatus.error
            j.job.error = type(e).__name__
            log.error("look_job error job=%s type=%s", job_id, type(e).__name__)
        finally:
            # 로그엔 작업 ID·시간·상태만. 파일명·사진은 남기지 않는다.
            log.info(
                "look_job %s",
                json.dumps(
                    {
                        "job": job_id,
                        "look": j.job.look_id,
                        "status": j.job.status,
                        "ms": j.job.ms,
                        "queue_ms": j.job.queue_ms,
                        "cos": j.job.identity.cos,
                        "ver": j.job.ver,
                    }
                ),
            )
            self._release_source(job_id)

    def _release_source(self, job_id: str) -> None:
        """이 세션의 마지막 작업이 끝나면 원본 사진 삭제 (즉시 삭제 원칙)."""
        with self._lock:
            for sid, (path, remaining) in list(self._sources.items()):
                if job_id in remaining:
                    remaining.discard(job_id)
                    if not remaining:
                        self._sources.pop(sid, None)
                        try:
                            os.remove(path)
                        except OSError:
                            log.error("source delete failed session=%s", sid)
                    break
