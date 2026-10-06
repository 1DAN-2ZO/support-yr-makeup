"""
메모리 지킴이 — PC 의 남은 메모리가 너무 적어지면 이 프로그램을 스스로 끈다.

다른 작업이 같이 도는 PC 에서 돌리려고 넣었다. 2026-10-06 에 모델 전체(16GB)를 한꺼번에 올리다가
PC 메모리가 바닥나 다른 작업까지 위험해진 적이 있고, 같은 날 그래픽카드를 쓰는 다른 예약 작업이 시작됐을 때는
이 지킴이가 서버를 내려서 그 작업이 정상으로 끝났다.

남겨 둘 메모리는 환경 변수 LOOK_GEN_MIN_FREE_GB 로 바꾼다 (기본 4GB).
"""

import os
import threading
import time

import psutil

MIN_FREE_GB = float(os.environ.get("LOOK_GEN_MIN_FREE_GB", "4.0"))


def start_guard(min_free_gb: float = MIN_FREE_GB) -> None:
    def watch() -> None:
        while True:
            free = psutil.virtual_memory().available / 1e9
            if free < min_free_gb:
                print(f"[guard] 남은 메모리 {free:.1f}GB < {min_free_gb}GB — 스스로 종료합니다", flush=True)
                os._exit(3)
            time.sleep(0.3)

    threading.Thread(target=watch, daemon=True).start()


def report(tag: str) -> None:
    """지금 이 프로그램이 쓰는 메모리와 PC 의 남은 메모리를 한 줄로."""
    import torch

    rss = psutil.Process().memory_info().rss / 1e9
    free = psutil.virtual_memory().available / 1e9
    vram = torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0
    peak = torch.cuda.max_memory_allocated() / 1e9 if torch.cuda.is_available() else 0
    print(f"[mem] {tag}: 이 프로그램 {rss:.1f}GB · PC 남은 메모리 {free:.1f}GB · 그래픽 {vram:.1f}GB (최대 {peak:.1f}GB)", flush=True)
