"""서버 설정. 값은 환경 변수로 덮어쓴다 (DHE_ 접두).

버전 다섯 개는 ai-pipeline-v6.md 3절 규칙. 응답 `ver`와 로그 한 줄에 그대로 들어간다.
"""

import os
from dataclasses import dataclass, field


def _env(name: str, default: str) -> str:
    return os.environ.get(f"DHE_{name}", default)


@dataclass(frozen=True)
class Versions:
    app: str = _env("VER_APP", "dev")
    score: str = _env("VER_SCORE", "score-v0.1")
    look: str = _env("VER_LOOK", "look-v0.1")
    faceshape: str = _env("VER_FACESHAPE", "faceshape-rule-v1")
    transfer: str = _env("VER_TRANSFER", "transfer-stub-v0")

    def as_dict(self) -> dict[str, str]:
        return {
            "app": self.app,
            "score": self.score,
            "look": self.look,
            "faceshape": self.faceshape,
            "transfer": self.transfer,
        }


@dataclass(frozen=True)
class Settings:
    versions: Versions = field(default_factory=Versions)
    # 업로드 임시 폴더. 운영에서는 tmpfs 마운트 경로로 (ai-pipeline-v6.md 1-2 삭제 정책)
    upload_dir: str = _env("UPLOAD_DIR", os.path.join(os.path.abspath(os.sep), "tmp", "danghwaeung"))
    # 룩 1개 생성 시간 예산(초). 실측 fp16 8 step 2.55초
    look_budget_sec: float = float(_env("LOOK_BUDGET_SEC", "3.0"))
    # 큐 대기가 이 시간을 넘으면 클라이언트에 "잠시 후" 안내 (status=waiting_long)
    queue_warn_sec: float = float(_env("QUEUE_WARN_SEC", "20"))
    # 정체성 유지 임계 (ArcFace 코사인). 미달이면 fallback
    identity_min_cos: float = float(_env("IDENTITY_MIN_COS", "0.6"))
    # 작업 결과 보관 TTL(초). 지나면 삭제 (세션 삭제 원칙)
    job_ttl_sec: int = int(_env("JOB_TTL_SEC", str(2 * 3600)))
    # 세션당 룩 수 상한
    max_looks: int = int(_env("MAX_LOOKS", "10"))


settings = Settings()
