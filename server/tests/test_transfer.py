"""그림 만들기 (POST /transfer) — 맨얼굴 + 화장 사진을 GPU 의 FLUX 서버(Gradio)에 넘기고 그림 한 장을 받는다.
FLUX 서버는 가짜로 세운다 (httpx.MockTransport). 사진은 저장하지 않는다.
"""

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import flux, main

PNG = b"\x89PNG\r\n\x1a\n" + b"made-picture"
BARE = ("bare.webp", b"BARE-BYTES", "image/webp")
REF = ("ref.jpg", b"REF-BYTES", "image/jpeg")


class FakeFlux:
    """Gradio 의 세 단계: 요청 → 번호, 번호로 결과 기다리기(SSE), 파일 받기"""

    def __init__(self, *, sse=None, call_status=200, file_status=200, boom=None):
        self.calls: list[dict] = []
        self.paths: list[str] = []
        self.sse = sse
        self.call_status = call_status
        self.file_status = file_status
        self.boom = boom

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.paths.append(f"{req.method} {req.url.path}")
        if self.boom:
            raise self.boom
        p = req.url.path
        if req.method == "POST" and p == "/gradio_api/call/predict":
            self.calls.append(json.loads(req.content))
            return httpx.Response(self.call_status, json={"event_id": "ev1"})
        if req.method == "GET" and p == "/gradio_api/call/predict/ev1":
            done = 'event: complete\ndata: [{"path": "C:\\\\tmp\\\\out.png", "url": null}, "8.6초"]\n\n'
            return httpx.Response(
                200, text="event: heartbeat\ndata: null\n\n" + (self.sse if self.sse is not None else done)
            )
        if req.method == "GET" and p.startswith("/gradio_api/file="):
            return httpx.Response(self.file_status, content=PNG, headers={"content-type": "image/png"})
        return httpx.Response(404)


def client_with(fake: FakeFlux | None, monkeypatch, **kw) -> TestClient:
    f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(fake), **kw) if fake else None
    monkeypatch.setattr(main, "get_flux", lambda: f)
    return TestClient(main.app)


def post(c: TestClient, bare=BARE, ref=REF):
    return c.post("/transfer", files={"bare": bare, "ref": ref})


def test_tr1_returns_the_picture(monkeypatch):
    fake = FakeFlux()
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 200
    assert r.content == PNG
    assert r.headers["content-type"] == "image/png"
    assert r.headers["cache-control"] == "no-store"
    assert int(r.headers["x-gen-ms"]) >= 0
    assert fake.paths == [
        "POST /gradio_api/call/predict",
        "GET /gradio_api/call/predict/ev1",
        "GET /gradio_api/file=C:\\tmp\\out.png",
    ]


def test_tr2_sends_both_photos_and_fixed_settings(monkeypatch):
    fake = FakeFlux()
    post(client_with(fake, monkeypatch))
    data = fake.calls[0]["data"]
    # 사진 두 장은 data URL 로 (Gradio FileData) — 맨얼굴 · 화장 사진 순서
    assert data[0] == {
        "url": "data:image/webp;base64," + base64.b64encode(b"BARE-BYTES").decode(),
        "meta": {"_type": "gradio.FileData"},
    }
    assert data[1]["url"] == "data:image/jpeg;base64," + base64.b64encode(b"REF-BYTES").decode()
    # 단계 수 · 강도 · 원본 크기 유지 · seed — 정답사진과 옮긴 그림이 같은 설정이어야 견줄 수 있다
    # (feedback-input-contract 지킬 것 2)
    assert data[2:] == [flux.STEPS, flux.STRENGTH, True, flux.SEED]


def test_tr3_off_when_no_flux_url(monkeypatch):
    # 주소를 안 넣었으면 꺼져 있다 — 실수로 켜지지 않게
    r = post(client_with(None, monkeypatch))
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "off"


def test_tr4_flux_says_no_face(monkeypatch):
    # FLUX 가 거절한 까닭(얼굴을 못 찾음 등)을 그대로 전한다
    fake = FakeFlux(sse='event: error\ndata: "얼굴 사진에서 얼굴을 못 찾았어요."\n\n')
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 422
    assert r.json()["detail"] == {"code": "rejected", "message": "얼굴 사진에서 얼굴을 못 찾았어요."}


def test_tr5_flux_error_without_message(monkeypatch):
    fake = FakeFlux(sse="event: error\ndata: null\n\n")
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "rejected"


@pytest.mark.parametrize(
    "fake",
    [
        FakeFlux(boom=httpx.ConnectError("refused")),
        FakeFlux(boom=httpx.ReadTimeout("slow")),
        FakeFlux(call_status=500),
        FakeFlux(file_status=404),
        FakeFlux(sse=""),  # 결과 없이 끊김
        FakeFlux(sse="event: complete\ndata: []\n\n"),  # 모양이 다름
    ],
)
def test_tr6_flux_down(monkeypatch, fake):
    # GPU 서버가 꺼졌거나 이상하면 502 — 앱이 "지금 만들 수 없어요" 로 안내한다
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == "down"


def test_tr7_rejects_non_images_and_empty(monkeypatch):
    fake = FakeFlux()
    c = client_with(fake, monkeypatch)
    assert post(c, bare=("a.txt", b"hello", "text/plain")).status_code == 422
    assert post(c, ref=("r.jpg", b"", "image/jpeg")).status_code == 422
    assert c.post("/transfer", files={"bare": BARE}).status_code == 422
    assert fake.calls == []  # GPU 까지 가지 않는다


def test_tr8_rejects_oversized_photo(monkeypatch):
    fake = FakeFlux()
    c = client_with(fake, monkeypatch)
    big = ("big.jpg", b"x" * (main.MAX_PHOTO + 1), "image/jpeg")
    r = post(c, ref=big)
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "too_large"
    assert fake.calls == []


def test_tr9_busy_when_too_many_waiting(monkeypatch):
    # 한 번에 한 장만 그린다. 기다리는 줄이 꽉 차면 줄을 더 세우지 않고 바쁘다고 답한다
    fake = FakeFlux()
    c = client_with(fake, monkeypatch, max_waiting=0)
    f = main.get_flux()
    f._waiting = 1  # 이미 한 명이 그리는 중
    r = post(c)
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "busy"
    assert r.headers["retry-after"]
    assert fake.calls == []


def test_tr10_env_decides_on_off(monkeypatch):
    monkeypatch.setattr(flux, "_client", None)
    monkeypatch.setattr(flux, "flux_url", lambda: "")
    assert flux.get_flux() is None
    monkeypatch.setattr(flux, "flux_url", lambda: "http://100.110.57.95:7861/")
    got = flux.get_flux()
    assert got is not None and got.url == "http://100.110.57.95:7861"
    assert flux.get_flux() is got  # 한 번 만든 것을 다시 쓴다 (줄 세우기가 한곳에서 돌게)


def test_tr11_cors_allows_post(monkeypatch):
    c = client_with(FakeFlux(), monkeypatch)
    r = c.options(
        "/transfer", headers={"origin": "http://localhost:5173", "access-control-request-method": "POST"}
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
