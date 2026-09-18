"""Stable-Makeup 실제 워커 — server-bench 모델 서버(별도 conda 프로세스, #45 설계)에 HTTP로 위임한다.

jobs.py의 Worker 계약: (source_path, look_id) -> (result_url | None, layer_url | None, identity_cos | None)
레이어 추출(#49)·정체성 검사(#50)는 아직 이 함수에 없다 — 그 태스크들이 이 자리를 채운다.
"""

from __future__ import annotations

import os

import httpx

from .config import settings


def stable_makeup_worker(source_path: str, look_id: str) -> tuple[str | None, str | None, float | None]:
    if not os.path.exists(source_path):
        raise FileNotFoundError(source_path)
    ref_path = os.path.join(settings.look_ref_dir, f"{look_id}.jpg")
    if not os.path.exists(ref_path):
        raise FileNotFoundError(f"look reference missing: {ref_path}")

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
    return body["result_url"], None, None
