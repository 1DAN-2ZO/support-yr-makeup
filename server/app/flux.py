"""그림 만들기 — GPU PC 의 FLUX 서버(②, poc/look-tryon/server-bench/app_klein.py)에 다녀온다.

맨얼굴 + 화장 사진 → 화장을 입힌 내 얼굴 한 장.
정답사진(화장 사진 = 참고 사진)과 옮긴 그림(화장 사진 = 시도사진)이 같은 길이다.
앱은 FLUX 서버를 직접 부르지 않는다 — 그 서버는 로그인이 없어 바깥에 열지 않고,
부르는 방식(Gradio: 요청 → 번호 → 결과 기다리기 → 파일 받기, 세 번 오감)도 여기에 가둔다.

- 주소는 DHE_FLUX_URL (예: http://100.110.57.95:7861). 없으면 꺼져 있다 — 실수로 켜지지 않게
- 한 번에 한 장만 보낸다 (그래픽카드 한 장). 줄이 꽉 차면 더 세우지 않고 "바쁘다"
- 받은 사진 · 만든 그림은 메모리에서만 쓴다. 저장하지 않고 로그에도 남기지 않는다
- 단계 수 · 강도 · seed 는 고정 — 정답사진과 옮긴 그림이 같은 설정이어야 견줄 수 있다
  (docs/feedback-input-contract.md 지킬 것 2)

GPU PC 를 여러 대로 늘리면 여기서 "비어 있는 PC 로 보내기" 를 하면 된다 (지금은 한 대).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import time
from urllib.parse import quote

import httpx

# app_klein.py 의 기본값과 같다 (steps 4 · 강도 0.7 · 원본 크기 유지 · seed 1234)
STEPS = 4
STRENGTH = 0.7
SEED = 1234


class FluxError(Exception):
    """앱에 전할 실패 — code 는 앱이 안내를 고르는 데 쓴다"""

    status = 502
    code = "down"

    def __init__(self, message: str = "") -> None:
        super().__init__(message)
        self.message = message


class FluxBusy(FluxError):
    status = 503
    code = "busy"


class FluxRejected(FluxError):
    """FLUX 가 그리지 않은 것 — 얼굴을 못 찾음 등. message 는 FLUX 가 한 말 그대로"""

    status = 422
    code = "rejected"


class FluxDown(FluxError):
    status = 502
    code = "down"


_SSE = re.compile(r"event: (\w+)\ndata: (.*)")


def _file_data(photo: bytes, media_type: str) -> dict:
    return {
        "url": f"data:{media_type};base64,{base64.b64encode(photo).decode()}",
        "meta": {"_type": "gradio.FileData"},
    }


class FluxClient:
    def __init__(
        self,
        url: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 150.0,
        max_waiting: int = 6,
    ) -> None:
        self.url = url.rstrip("/")
        self._transport = transport
        self._timeout = timeout
        self._max_waiting = max_waiting
        self._lock = asyncio.Lock()
        # 그리는 중 + 기다리는 중인 요청 수
        self._waiting = 0

    async def transfer(
        self, bare: bytes, bare_type: str, ref: bytes, ref_type: str
    ) -> tuple[bytes, str, int]:
        """(그림, 종류, 걸린 ms). 실패는 FluxError"""
        if self._waiting > self._max_waiting:
            raise FluxBusy()
        self._waiting += 1
        try:
            async with self._lock:
                t0 = time.perf_counter()
                picture, media_type = await self._call(bare, bare_type, ref, ref_type)
                return picture, media_type, round((time.perf_counter() - t0) * 1000)
        finally:
            self._waiting -= 1

    async def _call(self, bare: bytes, bare_type: str, ref: bytes, ref_type: str) -> tuple[bytes, str]:
        body = {"data": [_file_data(bare, bare_type), _file_data(ref, ref_type), STEPS, STRENGTH, True, SEED]}
        try:
            async with httpx.AsyncClient(
                base_url=self.url, transport=self._transport, timeout=self._timeout
            ) as c:
                r = await c.post("/gradio_api/call/predict", json=body)
                r.raise_for_status()
                event_id = r.json()["event_id"]
                r = await c.get(f"/gradio_api/call/predict/{event_id}")
                r.raise_for_status()
                kind, data = "", None
                for m in _SSE.finditer(r.text):
                    kind, data = m.group(1), (json.loads(m.group(2)) if m.group(2) else None)
                    if kind in ("complete", "error"):
                        break
                if kind == "error":
                    raise FluxRejected(data if isinstance(data, str) else "")
                if kind != "complete":
                    raise FluxDown("no result")
                path = data[0]["path"]
                r = await c.get(f"/gradio_api/file={quote(path, safe='')}")
                r.raise_for_status()
                media_type = r.headers.get("content-type", "")
                # Gradio 가 종류를 안 알려 주면 webp 다 (app_klein 의 기본 출력)
                return r.content, media_type if media_type.startswith("image/") else "image/webp"
        except FluxError:
            raise
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as e:
            raise FluxDown(type(e).__name__) from e


def flux_url() -> str:
    return os.environ.get("DHE_FLUX_URL", "").strip()


_client: FluxClient | None = None


def get_flux() -> FluxClient | None:
    """주소가 있으면 하나를 만들어 계속 쓴다 (줄 세우기가 한곳에서 돌게). 없으면 None — 꺼짐"""
    global _client
    url = flux_url().rstrip("/")
    if not url:
        return None
    if _client is None or _client.url != url:
        _client = FluxClient(url)
    return _client
