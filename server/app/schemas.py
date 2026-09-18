"""모듈 간 데이터 계약 중 서버가 주고받는 것 (work-split-modules-v6.md §2 `LookJob`).

클라이언트 `lib/tryon.js`가 이 모양을 그대로 읽는다. 필드를 바꾸면 양쪽을 같은 PR에서 바꾼다.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class JobStatus(StrEnum):
    queued = "queued"  # 큐에 들어감
    waiting_long = "waiting_long"  # 큐 대기가 queue_warn_sec 초과 → 클라이언트가 "잠시 후" 안내
    running = "running"
    done = "done"
    fallback = "fallback"  # 생성은 됐지만 정체성 유지 미달 → 결과 폐기, 썸네일 "준비 중"
    error = "error"


class Identity(BaseModel):
    cos: float | None = Field(None, description="ArcFace 코사인 유사도, 원본 vs 결과. 미측정이면 null")


class Layer(BaseModel):
    """화장 레이어. 부위 마스크별 ΔLab + 알파, 메시 좌표계.
    추출 실패면 LookJob.layer = null → 클라이언트는 3점 아핀 폴백."""

    mesh: str = Field("mediapipe-468", description="좌표계 식별자")
    url: str = Field(..., description="레이어 텍스처(PNG, RGBA = ΔL,Δa,Δb,alpha) 경로")


class LookJob(BaseModel):
    job_id: str
    look_id: str
    status: JobStatus
    result_url: str | None = None
    layer: Layer | None = None
    identity: Identity = Field(default_factory=Identity)
    ms: int | None = Field(None, description="생성에 걸린 시간(ms). 큐 대기 제외")
    queue_ms: int | None = Field(None, description="큐 대기 시간(ms)")
    error: str | None = None
    ver: dict[str, str] = Field(default_factory=dict, description="app/score/look/faceshape/transfer 버전")


class JobBatch(BaseModel):
    """세션 시작 시 정면 사진 1장 + 룩 N개 → 작업 N개. 클라이언트는 job_id 목록으로 폴링."""

    session_id: str
    jobs: list[LookJob]


class Health(BaseModel):
    ok: bool
    ver: dict[str, str]
    queue_depth: int
    worker: str = Field(description="stub | gpu")
