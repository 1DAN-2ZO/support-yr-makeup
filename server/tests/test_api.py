"""서버 API 스모크 테스트 — /health·CORS.
실행: uv run pytest

Stable-Makeup 잡 큐(/sessions/*/jobs · /jobs/*) 시험은 VLM 전환(#179·#180)으로
그 라우트 자체를 뺀 것과 같이 제거.
"""

from fastapi.testclient import TestClient

from server.app import main


def test_health_has_four_versions():
    client = TestClient(main.app)
    r = client.get("/health")
    assert r.status_code == 200
    ver = r.json()["ver"]
    assert set(ver) == {"app", "score", "look", "faceshape"}


def test_cors_allows_dev_client_origin():
    client = TestClient(main.app)
    r = client.options(
        "/health",
        headers={"origin": "http://localhost:5173", "access-control-request-method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
