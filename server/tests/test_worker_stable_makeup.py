"""stable_makeup_worker 단위 테스트 — 실제 GPU/모델 서버 없이 httpx 호출만 가짜로 검증한다.
model_server.py 자체(별도 conda env, GPU 필요)는 여기서 못 돌린다 — server-bench/README.md의
수동 재현 절차 + curl http://127.0.0.1:8100/health 로 별도 확인한다."""

import httpx
import pytest

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


def test_missing_look_ref_raises(look_ref, tmp_path):
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")
    with pytest.raises(FileNotFoundError):
        stable_makeup_worker(str(source), "look_99")


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
