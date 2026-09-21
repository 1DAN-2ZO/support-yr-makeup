"""look_job 로그가 구조화 JSON 형식인지 확인."""

import io
import json
import logging

from fastapi.testclient import TestClient

from server.app import main


def test_look_job_log_is_structured_json(caplog):
    """look_job 로그가 파일명·경로 없이 JSON 한 줄(job/look/status/ms/queue_ms/cos/ver)로 나가는지 확인."""
    client = TestClient(main.app)
    import time

    with caplog.at_level(logging.INFO, logger="dhe.jobs"):
        files = {"photo": ("front.webp", io.BytesIO(b"x"), "image/webp")}
        r = client.post("/sessions/s9/jobs", files=files, data={"look_ids": "look_01"})
        job_id = r.json()["jobs"][0]["job_id"]

        # 폴링으로 작업 상태 터미널 대기
        terminal_status = None
        for _ in range(100):
            status = client.get(f"/jobs/{job_id}").json()["status"]
            if status in ("done", "error", "fallback"):
                terminal_status = status
                break
            time.sleep(0.02)

        assert terminal_status is not None, "작업이 터미널 상태에 도달하지 못함"

        # 워커 스레드가 JSON 로그를 내보낼 때까지 대기 (finally 블록 실행)
        deadline = time.time() + 2.0
        while time.time() < deadline:
            look_job_records = [
                rec
                for rec in caplog.records
                if rec.message.startswith("look_job {") and job_id in rec.message
            ]
            if look_job_records:
                break
            time.sleep(0.01)

    # look_job JSON 로그를 찾기 (JSON 형식만)
    look_job_lines = [rec.message for rec in caplog.records if rec.message.startswith("look_job {")]
    job_log_lines = [line for line in look_job_lines if job_id in line]
    assert job_log_lines, f"job_id {job_id}의 look_job JSON 로그가 없음"

    # JSON 파싱
    payload = json.loads(job_log_lines[0][len("look_job ") :])

    # 키 검증 (ver 포함)
    expected_keys = {"job", "look", "status", "ms", "queue_ms", "cos", "ver"}
    assert set(payload) == expected_keys, f"Expected keys {expected_keys}, got {set(payload)}"

    # ver 구조 검증 - 5개의 버전 키
    assert isinstance(payload["ver"], dict), "ver should be a dict"
    assert set(payload["ver"].keys()) == {"app", "score", "look", "faceshape", "transfer"}, (
        f"ver should have 5 keys (app/score/look/faceshape/transfer), got {set(payload['ver'].keys())}"
    )

    # 파일명 미포함 확인
    assert "front.webp" not in json.dumps(payload), "파일명이 로그에 남음"


def test_look_job_error_log_no_path_leak(caplog):
    """look_job 에러 로그에서 파일 경로가 노출되지 않는지 확인."""

    def failing_worker(source_path: str, look_id: str):
        """특정 경로를 포함하는 FileNotFoundError를 발생시키는 워커."""
        raise FileNotFoundError("/some/secret/path/photo.webp")

    # 메인 큐의 워커를 임시로 교체
    original_worker = main.queue._worker
    main.queue._worker = failing_worker

    try:
        client = TestClient(main.app)
        import time

        with caplog.at_level(logging.INFO, logger="dhe.jobs"):
            files = {"photo": ("front.webp", io.BytesIO(b"x"), "image/webp")}
            r = client.post("/sessions/s10/jobs", files=files, data={"look_ids": "look_02"})
            job_id = r.json()["jobs"][0]["job_id"]

            # 폴링으로 작업 에러 상태 대기
            terminal_status = None
            for _ in range(100):
                status = client.get(f"/jobs/{job_id}").json()["status"]
                if status in ("done", "error", "fallback"):
                    terminal_status = status
                    break
                time.sleep(0.02)

            assert terminal_status is not None, "작업이 터미널 상태에 도달하지 못함"
            assert terminal_status == "error", f"Expected error status, got {terminal_status}"

            # 워커 스레드가 JSON 로그를 내보낼 때까지 대기 (finally 블록 실행)
            deadline = time.time() + 2.0
            while time.time() < deadline:
                look_job_records = [
                    rec
                    for rec in caplog.records
                    if rec.message.startswith("look_job {") and job_id in rec.message
                ]
                if look_job_records:
                    break
                time.sleep(0.01)

        # 전체 로그에서 경로/파일명이 없는지 확인
        full_log = caplog.text
        assert "/some/secret/path" not in full_log, "경로가 로그에 노출됨"
        assert "photo.webp" not in full_log, "파일명이 로그에 노출됨"

        # look_job JSON 로그를 찾기 (JSON 형식만, 에러 로그 제외)
        look_job_lines = [rec.message for rec in caplog.records if rec.message.startswith("look_job {")]
        job_log_lines = [line for line in look_job_lines if job_id in line]
        assert job_log_lines, f"job_id {job_id}의 look_job JSON 로그가 없음"

        payload = json.loads(job_log_lines[0][len("look_job ") :])
        assert payload["status"] == "error", f"Expected status 'error', got {payload['status']}"

    finally:
        # 워커 복원
        main.queue._worker = original_worker
