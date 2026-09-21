"""Stable-Makeup 실제 워커 — server-bench 모델 서버(별도 conda 프로세스, #45 설계)에 HTTP로 위임한다.

jobs.py의 Worker 계약: (source_path, look_id) -> (result_url | None, layer_url | None, identity_cos | None)
레이어 추출(#49)은 여기서 메인 프로세스가 직접 한다(랜드마크는 MediaPipe, 모델 서버 env엔 없다).
정체성 검사(#50)는 아직 이 함수에 없다 — 그 태스크가 이 자리를 채운다.
"""

from __future__ import annotations

import logging
import os
import re

import httpx

from .config import settings
from .layer import extract_layer

log = logging.getLogger(__name__)

# look_id는 클라이언트가 보내는 원시 폼 입력이라 경로 조합 전에 반드시 검증한다 (path traversal 방지).
_LOOK_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# 모델 서버 result_url(/results/<이름>.jpg) 형식. 파일명만 허용해 result_dir 밖으로 못 나가게 한다.
_RESULT_URL_RE = re.compile(r"^/results/([A-Za-z0-9_.-]+\.jpg)$")


def _layer_url(source_path: str, result_url: str) -> str | None:
    """레이어 추출 시도 -> /results/<이름>_layer.png. 어떤 실패도 None (예외·경로를 밖으로 내지 않는다)."""
    try:
        m = _RESULT_URL_RE.match(result_url)
        if not m or ".." in m.group(1):
            log.warning("layer: unexpected result_url from model server")
            return None
        layer_path = extract_layer(source_path, os.path.join(settings.result_dir, m.group(1)))
        if not layer_path:
            return None
        return f"/results/{os.path.basename(layer_path)}"
    except Exception as e:  # noqa: BLE001 — 레이어 문제로 룩 생성 결과를 버리지 않는다
        log.warning("layer: failed (%s)", type(e).__name__)
        return None


def stable_makeup_worker(source_path: str, look_id: str) -> tuple[str | None, str | None, float | None]:
    if not os.path.exists(source_path):
        # 사진 경로는 로그에 절대 안 남긴다 (jobs.py의 log.exception이 이 메시지를 그대로 찍는다).
        raise FileNotFoundError("source photo not found")
    if not _LOOK_ID_RE.match(look_id):
        # 원본 look_id를 그대로 메시지에 넣지 않는다 — 검증에 실패한 값일수록 신뢰할 수 없다.
        raise ValueError("invalid look_id")
    ref_path = os.path.join(settings.look_ref_dir, f"{look_id}.jpg")
    if not os.path.exists(ref_path):
        # look_id는 카탈로그 토큰일 뿐 개인 데이터가 아니라 메시지에 넣어도 된다. 실제 경로는 넣지 않는다.
        raise FileNotFoundError(f"look reference missing for look_id={look_id}")

    resp = httpx.post(
        f"{settings.model_server_url}/infer",
        json={
            "source_path": source_path,
            "ref_path": ref_path,
            "steps": settings.transfer_steps,
            "guidance_scale": settings.transfer_guidance,
        },
        timeout=settings.look_budget_sec + 10,
    )
    resp.raise_for_status()
    body = resp.json()
    result_url = body["result_url"]
    return result_url, _layer_url(source_path, result_url), None
