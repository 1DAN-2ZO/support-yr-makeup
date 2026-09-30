"""서버 설정. 값은 환경 변수로 덮어쓴다 (DHE_ 접두).

버전 네 개는 ai-pipeline-v6.md 3절 규칙. 응답 `ver`와 로그 한 줄에 그대로 들어간다.
transfer 버전(Stable-Makeup)과 잡 큐 전용 설정은 VLM 전환(#179·#180)으로 뺐다.
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

    def as_dict(self) -> dict[str, str]:
        return {
            "app": self.app,
            "score": self.score,
            "look": self.look,
            "faceshape": self.faceshape,
        }


@dataclass(frozen=True)
class Settings:
    versions: Versions = field(default_factory=Versions)
    # MediaPipe Face Landmarker(.task) 경로. 바이너리라 저장소 밖 — 비면 레이어 추출은 None을 돌려준다(#49)
    face_landmarker_path: str = _env("FACE_LANDMARKER_PATH", "")
    # 화장 레이어 ΔE 절단 임계 (POC client/lib/extractLayer.js 기본값과 동일 6)
    layer_de_threshold: float = float(_env("LAYER_DE_THRESHOLD", "6"))


settings = Settings()
