"""모듈 간 데이터 계약 중 서버가 주고받는 것.

클라이언트가 이 모양을 그대로 읽는다. 필드를 바꾸면 양쪽을 같은 PR에서 바꾼다.

JobStatus·Identity·Layer·LookJob·JobBatch(Stable-Makeup 잡 큐 계약)는 VLM 전환(#179·#180)으로
빠졌다 — jobs.py·worker_stable_makeup.py 제거와 같은 정리.
"""

from pydantic import BaseModel


class Health(BaseModel):
    ok: bool
    ver: dict[str, str]
