"""stable_makeup_worker 단위 테스트 — 실제 GPU/모델 서버 없이 httpx 호출만 가짜로 검증한다.
model_server.py 자체(별도 conda env, GPU 필요)는 여기서 못 돌린다 — server-bench/README.md의
수동 재현 절차 + curl http://127.0.0.1:8100/health 로 별도 확인한다."""

import os

import httpx
import numpy as np
import pytest
from PIL import Image

from server.app import layer as layer_mod
from server.app.config import settings
from server.app.worker_stable_makeup import stable_makeup_worker


@pytest.fixture()
def look_ref(tmp_path, monkeypatch):
    ref_dir = tmp_path / "refs"
    ref_dir.mkdir()
    (ref_dir / "look_01.jpg").write_bytes(b"fake-ref")
    monkeypatch.setattr(settings.__class__, "look_ref_dir", str(ref_dir), raising=False)
    object.__setattr__(settings, "look_ref_dir", str(ref_dir))
    return ref_dir


def test_missing_source_raises(look_ref, tmp_path):
    with pytest.raises(FileNotFoundError):
        stable_makeup_worker(str(tmp_path / "nope.jpg"), "look_01")


def test_missing_source_message_has_no_raw_path(look_ref, tmp_path):
    """사진 경로는 로그에 절대 안 남긴다 — 예외 메시지에 원본 경로 문자열이 있으면 안 된다."""
    missing = str(tmp_path / "nope.jpg")
    with pytest.raises(FileNotFoundError) as exc_info:
        stable_makeup_worker(missing, "look_01")
    assert missing not in str(exc_info.value)


def test_missing_look_ref_raises(look_ref, tmp_path):
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")
    with pytest.raises(FileNotFoundError):
        stable_makeup_worker(str(source), "look_99")


def test_missing_look_ref_message_has_no_raw_path(look_ref, tmp_path):
    """look_ref_dir 경로도 사진과 마찬가지로 로그에 남기면 안 된다 — look_id(토큰)는 있어도 된다."""
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")
    unresolved_ref_path = str(look_ref / "look_99.jpg")
    with pytest.raises(FileNotFoundError) as exc_info:
        stable_makeup_worker(str(source), "look_99")
    assert unresolved_ref_path not in str(exc_info.value)
    assert "look_99" in str(exc_info.value)


@pytest.mark.parametrize(
    "bad_look_id",
    ["../../etc/passwd", "look_01/../../secret", "../secret", "look 01", "look.01"],
)
def test_unsafe_look_id_rejected_before_path_construction(look_ref, tmp_path, monkeypatch, bad_look_id):
    """path traversal 성격의 look_id는 파일 경로를 만들기 전에 거부돼야 하고, 모델 서버 호출도 없어야 한다."""
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")

    def fail_post(*args, **kwargs):
        raise AssertionError("httpx.post must not be called for an unsafe look_id")

    monkeypatch.setattr(httpx, "post", fail_post)

    with pytest.raises(ValueError) as exc_info:
        stable_makeup_worker(str(source), bad_look_id)
    assert bad_look_id not in str(exc_info.value)


def test_posts_expected_payload_and_returns_result(look_ref, tmp_path, monkeypatch):
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"result_url": "/results/abc.jpg", "ms": 3100}

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    result_url, layer_url, cos = stable_makeup_worker(str(source), "look_01")

    assert captured["url"] == f"{settings.model_server_url}/infer"
    assert captured["json"]["source_path"] == str(source)
    assert captured["json"]["ref_path"] == str(look_ref / "look_01.jpg")
    assert captured["json"]["steps"] == settings.transfer_steps
    assert result_url == "/results/abc.jpg"
    assert layer_url is None
    assert cos is None


@pytest.fixture()
def fake_model_server(look_ref, tmp_path, monkeypatch):
    """result_dir을 tmp로 돌리고 모델 서버 응답을 고정한다. (source 경로, result_dir) 반환."""
    result_dir = tmp_path / "results"
    result_dir.mkdir()
    old = settings.result_dir
    object.__setattr__(settings, "result_dir", str(result_dir))

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"result_url": "/results/1700000000.jpg", "ms": 3100}

    monkeypatch.setattr(httpx, "post", lambda url, json, timeout: FakeResponse())
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")
    yield source, result_dir
    object.__setattr__(settings, "result_dir", old)


def test_layer_url_mapped_on_success(fake_model_server, monkeypatch):
    source, result_dir = fake_model_server
    calls = {}

    def fake_extract(src, res):
        calls["args"] = (src, res)
        return res.rsplit(".", 1)[0] + "_layer.png"

    monkeypatch.setattr("server.app.worker_stable_makeup.extract_layer", fake_extract)
    result_url, layer_url, cos = stable_makeup_worker(str(source), "look_01")
    assert result_url == "/results/1700000000.jpg"
    assert layer_url == "/results/1700000000_layer.png"
    assert cos is None
    assert calls["args"] == (str(source), os.path.join(str(result_dir), "1700000000.jpg"))


def test_layer_none_when_extractor_returns_none(fake_model_server, monkeypatch):
    source, _ = fake_model_server
    monkeypatch.setattr("server.app.worker_stable_makeup.extract_layer", lambda s, r: None)
    assert stable_makeup_worker(str(source), "look_01") == ("/results/1700000000.jpg", None, None)


def test_layer_exception_never_escapes(fake_model_server, monkeypatch):
    source, _ = fake_model_server

    def boom(s, r):
        raise RuntimeError("boom")

    monkeypatch.setattr("server.app.worker_stable_makeup.extract_layer", boom)
    assert stable_makeup_worker(str(source), "look_01") == ("/results/1700000000.jpg", None, None)


def _real_source_and_result(source, result_dir):
    """진짜 RGB 사진 2장 — 레이어 실패가 이미지 문제가 아니라 랜드마커 조건에서 나오게 한다."""
    n = layer_mod.ALIGNED_SIZE
    base = np.full((n, n, 3), (200, 170, 150), dtype=np.uint8)
    made = base.copy()
    made[200:260, 120:200] = (200, 30, 60)
    Image.fromarray(base).save(source, format="JPEG", quality=100)
    Image.fromarray(made).save(result_dir / "1700000000.jpg", quality=100, subsampling=0)


def test_absent_landmarker_gives_no_layer_but_would_with_landmarks(fake_model_server, monkeypatch):
    """I1: 같은 실사진 설정에서 랜드마커만 비우면 None, 랜드마크가 나오면 layer_url이 붙는다."""
    source, result_dir = fake_model_server
    _real_source_and_result(source, result_dir)
    old = settings.face_landmarker_path
    object.__setattr__(settings, "face_landmarker_path", "")
    try:
        assert stable_makeup_worker(str(source), "look_01") == ("/results/1700000000.jpg", None, None)

        n = layer_mod.ALIGNED_SIZE
        lips = np.zeros((n, n), dtype=bool)
        lips[200:260, 120:200] = True
        fore = np.zeros((n, n), dtype=bool)
        fore[20:80, 100:220] = True
        monkeypatch.setattr(layer_mod, "_region_masks", lambda rgb: ({"lips": lips}, fore))
        url, layer_url, cos = stable_makeup_worker(str(source), "look_01")
        assert layer_url == "/results/1700000000_layer.png"
        assert os.path.exists(result_dir / "1700000000_layer.png")
    finally:
        object.__setattr__(settings, "face_landmarker_path", old)


@pytest.mark.parametrize(
    "bad_url", ["/results/../secret.jpg", "/results/a/b.jpg", "/results/..jpg.x/", "http://x/results/a.jpg"]
)
def test_unsafe_result_url_skips_layer(fake_model_server, monkeypatch, bad_url):
    source, _ = fake_model_server

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"result_url": bad_url}

    monkeypatch.setattr(httpx, "post", lambda url, json, timeout: R())

    def fail(s, r):
        raise AssertionError("extract_layer must not run for an unsafe result_url")

    monkeypatch.setattr("server.app.worker_stable_makeup.extract_layer", fail)
    assert stable_makeup_worker(str(source), "look_01") == (bad_url, None, None)
