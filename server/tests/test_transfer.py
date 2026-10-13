"""그림 만들기 (POST /transfer) — 맨얼굴 + 화장 사진을 GPU 의 FLUX 서버(Gradio)에 넘기고 그림 한 장을 받는다.
FLUX 서버는 가짜로 세운다 (httpx.MockTransport). 사진은 저장하지 않는다.
"""

import asyncio
import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import flux, main, templates

PNG = b"\x89PNG\r\n\x1a\n" + b"made-picture"
# 사진 종류는 올린 쪽 말이 아니라 내용의 첫머리로 본다 — 진짜 WebP · JPEG 첫머리를 붙인다
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"bare-bytes"
JPEG = b"\xff\xd8\xff\xe0" + b"ref-bytes"
BARE = ("bare.webp", WEBP, "image/webp")
REF = ("ref.jpg", JPEG, "image/jpeg")


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
        "url": "data:image/webp;base64," + base64.b64encode(WEBP).decode(),
        "meta": {"_type": "gradio.FileData"},
    }
    assert data[1]["url"] == "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
    # 단계 수 · 강도 · 원본 크기 유지 · seed — 정답사진과 옮긴 그림이 같은 설정이어야 견줄 수 있다
    # (feedback-input-contract 지킬 것 2)
    assert data[2:] == [flux.STEPS, flux.STRENGTH, True, flux.SEED]


def test_tr3_off_when_no_flux_url(monkeypatch):
    # 주소를 안 넣었으면 꺼져 있다 — 실수로 켜지지 않게
    r = post(client_with(None, monkeypatch))
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "off"


@pytest.mark.parametrize(
    "said",
    [
        '"얼굴 사진에서 얼굴을 못 찾았어요."',
        # 진짜 Gradio 6.29 가 gr.Error 를 주는 모양 (2026-10-08 실제 서버에서 확인) — 문장이 묶음 안에 있다.
        # json.dumps 는 Gradio 처럼 한글을 \uXXXX 로 적는다
        json.dumps({"error": "얼굴 사진에서 얼굴을 못 찾았어요.", "duration": 10, "title": "Error"}),
    ],
)
def test_tr4_flux_says_no_face(monkeypatch, said):
    # FLUX 가 얼굴을 못 찾았다고 하면 사진 탓 — 정해 둔 문장으로 알린다
    fake = FakeFlux(sse=f"event: error\ndata: {said}\n\n")
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 422
    assert r.json()["detail"] == {"code": "rejected", "message": flux.NO_FACE}


@pytest.mark.parametrize(
    "said",
    [
        '"CUDA out of memory. Tried to allocate 2.00 GiB (D:\\\\flux2\\\\model.py)"',
        "null",
        '{"error": "x"}',
        json.dumps({"error": "CUDA out of memory (D:\\flux2\\model.py)", "title": "Error"}),
        '{"error": null, "title": "Error"}',
    ],
)
def test_tr5_other_flux_errors_are_server_faults_and_stay_inside(monkeypatch, said):
    # 얼굴 못 찾음이 아닌 FLUX 오류(그래픽 메모리 부족 등)는 사진 탓이 아니다 — down 으로 답하고,
    # GPU PC 의 경로 · 내부 오류 문장을 밖으로 내보내지 않는다
    fake = FakeFlux(sse=f"event: error\ndata: {said}\n\n")
    r = post(client_with(fake, monkeypatch))
    assert r.status_code == 502
    assert r.json()["detail"] == {"code": "down", "message": ""}
    assert "CUDA" not in r.text and "model.py" not in r.text


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
    # 사진이라고 적어 보내도 내용이 사진이 아니면 받지 않는다
    assert post(c, bare=("a.jpg", b"hello world", "image/jpeg")).json()["detail"]["code"] == "not_image"
    assert post(c, ref=("r.jpg", b"", "image/jpeg")).status_code == 422
    assert c.post("/transfer", files={"bare": BARE}).json()["detail"]["code"] == "missing"
    assert fake.calls == []  # GPU 까지 가지 않는다


def test_tr7b_type_comes_from_content_not_from_the_sender(monkeypatch):
    # 종류를 엉뚱하게 적어 보내도(또는 안 적어도) 내용의 첫머리로 정한다
    # — 올린 쪽이 적은 글자를 FLUX 로 넘기지 않는다
    fake = FakeFlux()
    c = client_with(fake, monkeypatch)
    png = b"\x89PNG\r\n\x1a\n" + b"p"
    assert (
        post(c, bare=("b", WEBP, 'image/x";,zz'), ref=("r", png, "application/octet-stream")).status_code
        == 200
    )
    data = fake.calls[0]["data"]
    assert data[0]["url"].startswith("data:image/webp;base64,")
    assert data[1]["url"].startswith("data:image/png;base64,")


def test_tr8_rejects_oversized_before_reading(monkeypatch):
    # 크기는 몸통을 받기 전에 Content-Length 로 본다 — 다 받은 뒤에 거절하면 그동안 디스크 · 메모리를 내준다.
    # 몸통이 multipart 가 아닌 쓰레기여도 413 — 읽어 보지 않았다는 뜻
    fake = FakeFlux()
    c = client_with(fake, monkeypatch)
    junk = b"x" * (main.MAX_BODY + 1)
    r = c.post("/transfer", content=junk, headers={"content-type": "multipart/form-data; boundary=zz"})
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "too_large"
    # 한 장만 한도를 넘어도 거절
    big = ("big.jpg", JPEG + b"x" * main.MAX_PHOTO, "image/jpeg")
    assert post(c, ref=big).status_code == 413
    assert fake.calls == []


def test_tr9_busy_before_reading_photos(monkeypatch):
    # 한 번에 한 장만 그린다. 줄이 꽉 차면 더 세우지 않고, 사진을 읽기 전에 바쁘다고 답한다
    # (몸통이 쓰레기여도 503 — 읽어 보지 않았다는 뜻)
    fake = FakeFlux()
    c = client_with(fake, monkeypatch, max_waiting=0)
    main.get_flux()._waiting = 1  # 이미 한 명이 그리는 중
    r = c.post(
        "/transfer", content=b"not multipart", headers={"content-type": "multipart/form-data; boundary=zz"}
    )
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


# ---------- 줄 세우기 · 시간 한도 · 끊김 (FluxClient 를 직접) ----------


class SlowFlux:
    """그리는 데 시간이 걸리는 가짜 — 동시에 몇 개가 들어와 있는지 센다"""

    def __init__(self, draw=0.05, forever=False):
        self.draw, self.forever = draw, forever
        self.inside = self.most = self.started = 0

    async def __call__(self, req: httpx.Request) -> httpx.Response:
        p = req.url.path
        if req.method == "POST":
            return httpx.Response(200, json={"event_id": "ev1"})
        if p.endswith("/ev1"):
            self.started += 1
            self.inside += 1
            self.most = max(self.most, self.inside)
            try:
                await asyncio.sleep(3600 if self.forever else self.draw)
            finally:
                self.inside -= 1
            return httpx.Response(200, text='event: complete\ndata: [{"path": "o.png"}, ""]\n\n')
        return httpx.Response(200, content=PNG, headers={"content-type": "image/png"})


def test_tr12_one_at_a_time():
    async def go():
        fake = SlowFlux()
        f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(fake))
        out = await asyncio.gather(*(f.transfer(WEBP, "image/webp", JPEG, "image/jpeg") for _ in range(4)))
        return fake, f, out

    fake, f, out = asyncio.run(go())
    assert [o[0] for o in out] == [PNG] * 4
    assert fake.most == 1  # GPU 에는 한 번에 한 장만
    assert f._waiting == 0 and not f._lock.locked()


def test_tr13_total_time_limit_frees_the_line():
    # GPU 서버가 살아는 있는데 그리기가 안 끝나면(계속 "기다리는 중" 만 보냄)
    # 읽기 한도는 매번 새로 시작돼 영영 안 끝난다.
    # 전체 시간 한도로 끊고 줄을 비운다 — 안 그러면 뒤 요청이 전부 busy 가 된다
    async def go():
        fake = SlowFlux(forever=True)
        f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(fake), total=0.1)
        with pytest.raises(flux.FluxDown):
            await f.transfer(WEBP, "image/webp", JPEG, "image/jpeg")
        return f

    f = asyncio.run(go())
    assert f._waiting == 0 and not f._lock.locked()


def test_tr14_waiting_in_line_counts_toward_the_limit():
    # 줄에서 기다린 시간도 한도에 들어간다 — 앞사람이 안 끝나면 뒷사람도 한도에서 끊긴다
    async def go():
        fake = SlowFlux(forever=True)
        f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(fake), total=0.15)
        r = await asyncio.gather(
            *(f.transfer(WEBP, "image/webp", JPEG, "image/jpeg") for _ in range(2)), return_exceptions=True
        )
        return fake, f, r

    fake, f, r = asyncio.run(go())
    assert all(isinstance(x, flux.FluxDown) for x in r)
    assert fake.started == 1  # 뒷사람은 GPU 까지 가지도 않았다
    assert f._waiting == 0 and not f._lock.locked()


def test_tr15_gives_up_when_the_app_is_gone():
    # 앱이 연결을 끊으면(화면을 떠남 · 시간 초과) 받을 사람이 없다 — 줄에서 빼고 그만둔다
    async def go():
        fake = SlowFlux(forever=True)
        f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(fake))
        gone = False

        async def is_gone():
            return gone

        async def leave():
            nonlocal gone
            await asyncio.sleep(0.05)
            gone = True

        asyncio.ensure_future(leave())
        with pytest.raises(flux.Gone):
            await flux.unless_gone(f.transfer(WEBP, "image/webp", JPEG, "image/jpeg"), is_gone, poll=0.02)
        await asyncio.sleep(0)
        return f

    f = asyncio.run(go())
    assert f._waiting == 0 and not f._lock.locked()


def test_tr16_unless_gone_returns_the_result_when_the_app_stays():
    async def go():
        async def work():
            await asyncio.sleep(0.03)
            return "done"

        async def here():
            return False

        return await flux.unless_gone(work(), here, poll=0.01)

    assert asyncio.run(go()) == "done"


def test_tr17_needs_a_length(monkeypatch):
    # 길이를 안 밝힌 올리기(끊어 보내기)는 받지 않는다 — 크기를 미리 볼 수 없다
    c = client_with(FakeFlux(), monkeypatch)

    def chunks():
        yield b"x" * 10

    r = c.post("/transfer", content=chunks(), headers={"content-type": "multipart/form-data; boundary=zz"})
    assert r.status_code == 411


# ---------- 시간 나눠 보기 (2026-10-08) — 줄 선 시간 · FLUX 가 스스로 잰 시간 ----------


def test_tr18_tells_how_long_flux_itself_took(monkeypatch):
    # app_klein 은 그림과 함께 "8.6초 (FLUX.2 klein 4B …) · VRAM peak 8.7GB" 같은 측정 문장을 준다.
    # 맨 앞의 초를 읽어 넘긴다.
    # x-gen-ms(부르고 받기까지)와 견주면 GPU 가 느린지 오가는 길이 느린지 갈린다
    said = "8.6초 (FLUX.2 klein 4B 영역 다시 그리기, steps=4, 강도=0.70, 얼굴 512px → 768) · VRAM peak 8.7GB"
    done = "event: complete\ndata: " + json.dumps([{"path": "o.png"}, said]) + "\n\n"
    r = post(client_with(FakeFlux(sse=done), monkeypatch))
    assert r.status_code == 200
    assert r.headers["x-flux-ms"] == "8600"
    assert int(r.headers["x-queue-ms"]) >= 0


@pytest.mark.parametrize("said", ["", "측정 없음", None, 12, "초"])
def test_tr19_no_flux_time_when_it_does_not_say(monkeypatch, said):
    # 측정 문장이 없거나 모양이 달라도 그림은 그대로 준다 — 시간만 비운다
    done = "event: complete\ndata: " + json.dumps([{"path": "o.png"}, said]) + "\n\n"
    r = post(client_with(FakeFlux(sse=done), monkeypatch))
    assert r.status_code == 200
    assert "x-flux-ms" not in r.headers


def test_tr20_waiting_in_line_is_counted_apart():
    # 앞사람이 그리는 동안 기다린 시간은 그리는 시간과 따로 센다
    async def go():
        f = flux.FluxClient("http://gpu:7861", transport=httpx.MockTransport(SlowFlux(draw=0.15)))
        return await asyncio.gather(*(f.transfer(WEBP, "image/webp", JPEG, "image/jpeg") for _ in range(2)))

    first, second = asyncio.run(go())
    assert first.queue_ms < 80
    assert second.queue_ms >= 120
    # 그리는 시간에는 줄 선 시간이 들어가지 않는다
    assert second.ms < 300


# ── 템플릿 번호로 요청 (#420) — 화장 사진을 올리는 대신 `template` 번호 하나 ──


def post_template(c: TestClient, template, bare=BARE, **more):
    return c.post("/transfer", files={"bare": bare}, data={"template": template, **more})


def test_tr21_template_number_sends_the_server_side_photo(monkeypatch):
    fake = FakeFlux()
    r = post_template(client_with(fake, monkeypatch), "3")
    assert r.status_code == 200
    assert r.content == PNG
    data = fake.calls[0]["data"]
    want, kind = templates.photo(3)
    # 올린 맨얼굴은 그대로, 화장 사진 자리에는 서버가 가진 03 번 사진 — 설정은 사진을 올렸을 때와 같다
    assert data[0]["url"] == "data:image/webp;base64," + base64.b64encode(WEBP).decode()
    assert data[1]["url"] == f"data:{kind};base64," + base64.b64encode(want).decode()
    assert data[2:] == [flux.STEPS, flux.STRENGTH, True, flux.SEED]


@pytest.mark.parametrize("n", [str(i) for i in range(1, templates.COUNT + 1)])
def test_tr22_every_template_has_a_photo_on_the_server(n):
    # 번호를 받고도 줄 사진이 없으면 안 된다 — 사진 폴더가 비었거나 이름이 틀린 것을 배포 전에 잡는다
    found = templates.photo(templates.parse(n))
    assert found is not None
    data, kind = found
    assert main._kind(data) == kind


@pytest.mark.parametrize("bad", ["0", "11", "-1", "abc", "", "1.5", "01x", " "])
def test_tr23_bad_template_number_is_rejected_before_flux(monkeypatch, bad):
    fake = FakeFlux()
    r = post_template(client_with(fake, monkeypatch), bad)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "bad_template"
    assert fake.calls == []


def test_tr24_leading_zero_is_the_same_number(monkeypatch):
    fake = FakeFlux()
    assert post_template(client_with(fake, monkeypatch), "03").status_code == 200
    assert templates.parse("03") == 3


def test_tr25_ref_and_template_together_is_rejected(monkeypatch):
    fake = FakeFlux()
    c = client_with(fake, monkeypatch)
    r = c.post("/transfer", files={"bare": BARE, "ref": REF}, data={"template": "1"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "both"
    assert fake.calls == []


def test_tr26_neither_ref_nor_template_is_missing(monkeypatch):
    r = client_with(FakeFlux(), monkeypatch).post("/transfer", files={"bare": BARE})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "missing"


def test_tr27_missing_server_photo_is_a_server_fault(monkeypatch):
    fake = FakeFlux()
    monkeypatch.setattr(templates, "photo", lambda n: None)
    r = post_template(client_with(fake, monkeypatch), "2")
    assert r.status_code == 500
    assert r.json()["detail"]["code"] == "template_missing"
    assert fake.calls == []


def test_tr28_template_still_needs_the_bare_photo(monkeypatch):
    r = client_with(FakeFlux(), monkeypatch).post("/transfer", data={"template": "2"})
    assert r.status_code == 422
