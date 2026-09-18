"""서버 API 스모크 테스트 — 모델 없이 흐름·계약·삭제 원칙만 확인한다.
실행: uv run pytest
"""

import io
import os
import time

import pytest
from fastapi.testclient import TestClient

from server.app import main
from server.app.config import settings


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings.__class__, "upload_dir", str(tmp_path), raising=False)
    object.__setattr__(settings, "upload_dir", str(tmp_path))
    return TestClient(main.app)


def _wait_done(client: TestClient, job_id: str, timeout: float = 3.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/jobs/{job_id}")
        assert r.status_code == 200
        body = r.json()
        if body["status"] in ("done", "fallback", "error"):
            return body
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def test_health_has_five_versions(client):
    r = client.get("/health")
    assert r.status_code == 200
    ver = r.json()["ver"]
    assert set(ver) == {"app", "score", "look", "faceshape", "transfer"}


def test_jobs_flow_and_source_deleted(client, tmp_path):
    files = {"photo": ("front.webp", io.BytesIO(b"fake-image-bytes"), "image/webp")}
    data = {"look_ids": "look_01,look_02,look_03", "chosen": "look_02"}
    r = client.post("/sessions/s1/jobs", files=files, data=data)
    assert r.status_code == 200, r.text
    jobs = r.json()["jobs"]
    assert [j["look_id"] for j in jobs] == ["look_01", "look_02", "look_03"]
    assert all(j["status"] == "queued" for j in jobs)
    assert all(j["ver"]["transfer"] for j in jobs)

    results = [_wait_done(client, j["job_id"]) for j in jobs]
    assert all(b["status"] == "done" for b in results)
    assert all(b["result_url"] for b in results)
    assert all(b["ms"] is not None and b["queue_ms"] is not None for b in results)

    # 마지막 작업이 끝나면 원본 사진은 임시 폴더에서 사라진다 (즉시 삭제 원칙)
    time.sleep(0.05)
    assert os.listdir(tmp_path) == []


def test_rejects_bad_input(client):
    r = client.post(
        "/sessions/s2/jobs",
        files={"photo": ("a.webp", io.BytesIO(b"x"), "image/webp")},
        data={"look_ids": ""},
    )
    assert r.status_code == 400
    r = client.post(
        "/sessions/s2/jobs",
        files={"photo": ("a.gif", io.BytesIO(b"x"), "image/gif")},
        data={"look_ids": "l1"},
    )
    assert r.status_code == 415
    too_many = ",".join(f"l{i}" for i in range(settings.max_looks + 1))
    r = client.post(
        "/sessions/s2/jobs",
        files={"photo": ("a.webp", io.BytesIO(b"x"), "image/webp")},
        data={"look_ids": too_many},
    )
    assert r.status_code == 400


def test_unknown_job_404(client):
    assert client.get("/jobs/nope").status_code == 404
