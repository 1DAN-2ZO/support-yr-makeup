# 서버·생성 모듈(④) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub 프로젝트 "Team Project"(#6)에 등록된 `[server]` 이슈 13개 중 백로그를 제외한 8개(#45·#47·#48·#49·#50·#51·#52·#53)를 스프린트 1~3(9/21~10/8) 순서로 구현한다. 완료 시 서버는 실제 Stable-Makeup으로 룩을 생성하고, 화장 레이어를 뽑고, 정체성을 검사하고, 클라이언트는 그 결과를 라이브 얼굴에 워핑하며, 전체가 `eval/transfer`로 재평가 가능하다.

**Architecture:** FastAPI 서버(`server/app/`, Python 3.11)는 큐·API·삭제 원칙만 갖고 있고 워커는 함수 하나(`Worker` 타입)로 주입된다. Stable-Makeup은 별도 conda 환경(Python 3.10, 충돌하는 오래된 diffusers 포크)이라 메인 프로세스에 못 넣는다 — `poc/look-tryon/server-bench/model_server.py`가 그 환경 안에서 상주 FastAPI 서버로 뜨고, 메인 서버의 `worker_stable_makeup.py`가 HTTP로 위임한다. 클라이언트는 이미 POC(`poc/look-tryon/client/`)로 검증된 부위별 아핀 워핑을 `client/src/core/tryon.ts`로 옮긴다.

**Tech Stack:** Python 3.11 + FastAPI + pydantic + pytest (서버), Python 3.10 + torch/diffusers(vendored) + Stable-Makeup(별도 conda env, `makeup-bench-sm`), TypeScript + Vite + Vitest (클라이언트), Node(`eval/score/score_cli.mjs`) + Python(`eval/*/run.py`) 평가 하네스.

**Spec:** `docs/work-split-modules-v6.md` §3 모듈④, `docs/ai-pipeline-v6.md` §1-2·§2·§3·§4, GitHub 프로젝트 "Team Project"(https://github.com/orgs/1DAN-2ZO/projects/6) 이슈 #45·#47~#53. (`c:\Users\hi\Downloads\workplan.md`는 위 저장소 문서와 동일 내용의 사용자 로컬 사본.)

## Global Constraints

- 사진·얼굴 좌표·얼굴 데이터는 로그에 절대 남기지 않는다 — 작업 ID·시간·상태·버전만 (`ai-pipeline-v6.md` "기록 규칙").
- 룩 1개 생성 예산 3초, 큐 대기 20초 넘으면 클라이언트에 안내(`settings.look_budget_sec=3.0`, `settings.queue_warn_sec=20`).
- 정체성 유지 임계 미달(`identity_min_cos=0.6`) → 결과 폐기, `status=fallback`.
- 룩 하나 실패해도 나머지 룩은 계속 진행한다. 서버 전체가 죽어도 촬영·가이드·채점(클라이언트 로컬 로직)은 계속 동작해야 한다.
- 응답 `ver`와 로그 한 줄에 버전 다섯 개(`app/score/look/faceshape/transfer`)를 항상 찍는다.
- 브랜치 `server`, 작은 단위로 자주 `main`에 PR, CI 초록(`bash scripts/check.sh`), PR 본문에 `Closes #이슈번호`.
- `client/src/core/*.ts`를 바꿀 때 `server/app/schemas.py`의 `LookJob`/`Layer`도 같은 PR에서 맞춘다(계약 동시 변경 원칙).

## 사전 확인 (코드 아님, 팀 결정 대기)

- 이슈 #6(룩 참조 사진 10장 방법)이 아직 `Todo`다. Task 1~3은 임시로 `poc/look-tryon/server-bench/stable_makeup/test_imgs/makeup/*.jpg`를 룩 참조로 쓰고, 실제 10장이 정해지면 `settings.look_ref_dir` 한 값만 바꾸면 되게 설계한다.
- 이슈 #8(서버 장애 시 "이용 불가" → "룩 준비 중")도 `Todo`다. `ai-pipeline-v6.md` 1-2절은 이미 "룩 준비 중" 쪽으로 원칙을 적어놨으므로 서버 쪽 구현(Task 1, 4)은 그 방향으로 만든다 — 클라이언트 문구는 ⑥ 담당이라 이 계획에서 안 건드린다.

## Setup (Task 1 시작 전에 한 번)

```bash
git fetch origin
git checkout main && git pull --ff-only origin main   # 로컬 main이 origin보다 79 커밋 뒤처져 있음
git checkout -b server origin/server                    # 지금은 main과 동일한 지점
uv sync --extra dev --extra eval --extra server
```

Stable-Makeup 쪽 conda 환경은 `poc/look-tryon/server-bench/README.md`의 "재현 방법 → Stable-Makeup" 절 그대로 이미 로컬에 구성돼 있다(env 이름 `makeup-bench-sm`). 없으면 그 절차를 먼저 따른다.

---

### Task 1: Stable-Makeup을 실제 워커로 연결 (#45, 스프린트 1, P0)

**Files:**
- Create: `poc/look-tryon/server-bench/model_server.py` — makeup-bench-sm conda env 안에서 상주하는 추론 서버
- Create: `server/app/worker_stable_makeup.py` — 메인 프로세스에서 위 서버로 HTTP 위임하는 `Worker`
- Modify: `server/app/config.py` — `worker_mode`, `model_server_url`, `look_ref_dir`, `result_dir`, `transfer_steps`, `transfer_guidance` 추가
- Modify: `server/app/main.py` — `worker_mode`에 따라 워커 선택, `/results` 정적 서빙 추가
- Test: `server/tests/test_worker_stable_makeup.py`

**Interfaces:**
- Consumes: `server/app/jobs.py`의 `Worker = Callable[[str, str], tuple[str | None, str | None, float | None]]`, `server/app/config.py`의 `settings`
- Produces: `stable_makeup_worker(source_path: str, look_id: str) -> tuple[str | None, str | None, float | None]` — Task 3(#49)이 세 번째 반환값을 채우기 전까지는 레이어 `None`, Task 6(#50)이 identity를 실제로 계산하기 전까지는 코사인 `None`

- [ ] **Step 1: `config.py`에 설정 추가 (실패하는 테스트 없음 — 순수 설정값이라 다음 스텝의 테스트로 같이 검증)**

`server/app/config.py`의 `Settings`에 추가:

```python
    # stub | gpu — gpu면 stable_makeup_worker를 씀 (health 응답에도 그대로 노출)
    worker_mode: str = _env("WORKER_MODE", "stub")
    # 별도 conda 프로세스로 뜨는 상주 모델 서버 (poc/look-tryon/server-bench/model_server.py)
    model_server_url: str = _env("MODEL_SERVER_URL", "http://127.0.0.1:8100")
    # 룩 ID -> 참조 사진 매핑 폴더. 이슈 #6 결정 전까지는 벤치마크 샘플로 대체
    look_ref_dir: str = _env(
        "LOOK_REF_DIR",
        os.path.join("poc", "look-tryon", "server-bench", "stable_makeup", "test_imgs", "makeup"),
    )
    # 결과 이미지 저장 폴더. 모델 서버와 메인 서버가 같은 경로를 봐야 함(같은 머신 전제)
    result_dir: str = _env("RESULT_DIR", os.path.join(os.path.abspath(os.sep), "tmp", "danghwaeung", "results"))
    # 벤치마크 결론(server-bench/README.md): fp16 + 10 step = 3.15초, 3초 목표 안
    transfer_steps: int = int(_env("TRANSFER_STEPS", "10"))
    transfer_guidance: float = float(_env("TRANSFER_GUIDANCE", "1.6"))
```

- [ ] **Step 2: 실패하는 테스트 작성 — `worker_stable_makeup`이 입력을 검증하고 모델 서버에 위임하는지**

`server/tests/test_worker_stable_makeup.py`:

```python
"""stable_makeup_worker 단위 테스트 — 실제 GPU/모델 서버 없이 httpx 호출만 가짜로 검증한다.
model_server.py 자체(별도 conda env, GPU 필요)는 여기서 못 돌린다 — server-bench/README.md의
수동 재현 절차 + curl http://127.0.0.1:8100/health 로 별도 확인한다."""

import os

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
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `uv run pytest server/tests/test_worker_stable_makeup.py -v`
Expected: FAIL — `server.app.worker_stable_makeup` 모듈이 없어 `ModuleNotFoundError`

- [ ] **Step 4: `worker_stable_makeup.py` 구현**

```python
"""Stable-Makeup 실제 워커 — server-bench 모델 서버(별도 conda 프로세스, #45 설계)에 HTTP로 위임한다.

jobs.py의 Worker 계약: (source_path, look_id) -> (result_url | None, layer_url | None, identity_cos | None)
레이어 추출(#49)·정체성 검사(#50)는 아직 이 함수에 없다 — 그 태스크들이 이 자리를 채운다.
"""

from __future__ import annotations

import os

import httpx

from .config import settings


def stable_makeup_worker(source_path: str, look_id: str) -> tuple[str | None, str | None, float | None]:
    if not os.path.exists(source_path):
        raise FileNotFoundError(source_path)
    ref_path = os.path.join(settings.look_ref_dir, f"{look_id}.jpg")
    if not os.path.exists(ref_path):
        raise FileNotFoundError(f"look reference missing: {ref_path}")

    resp = httpx.post(
        f"{settings.model_server_url}/infer",
        json={
            "source_path": source_path,
            "ref_path": ref_path,
            "steps": settings.transfer_steps,
            "guidance_scale": settings.transfer_guidance,
        },
        timeout=settings.look_budget_sec + 10,
    )
    resp.raise_for_status()
    body = resp.json()
    return body["result_url"], None, None
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `uv run pytest server/tests/test_worker_stable_makeup.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: `httpx`를 dev 전용에서 메인 의존성으로 옮기기**

`pyproject.toml`의 `[project] dependencies`에 `"httpx>=0.27",` 추가 (지금 `dev`에만 있음 — 워커가 런타임에 씀). `[project.optional-dependencies].dev`에서는 남겨도 무해하니 그대로 둔다.

- [ ] **Step 7: `main.py`에서 워커 모드 분기 + 결과 정적 서빙**

`server/app/main.py` 수정:

```python
from fastapi.staticfiles import StaticFiles

from .config import settings
from .jobs import JobQueue, stub_worker
from .schemas import Health, JobBatch, LookJob
from .worker_stable_makeup import stable_makeup_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("dhe.api")

worker = stable_makeup_worker if settings.worker_mode == "gpu" else stub_worker
queue = JobQueue(worker=worker)
os.makedirs(settings.result_dir, exist_ok=True)
```

`lifespan`으로 앱 생성 이후, 라우트 등록 전에:

```python
app.mount("/results", StaticFiles(directory=settings.result_dir), name="results")
```

`health()`의 `worker="stub"` 하드코딩을 `worker=settings.worker_mode`로 바꾼다.

- [ ] **Step 8: 기존 API 테스트가 여전히 통과하는지 확인 (회귀 없음)**

Run: `uv run pytest server/tests/test_api.py -v`
Expected: PASS — `worker_mode` 기본값이 `"stub"`이라 기존 스텁 흐름은 그대로 동작해야 함

- [ ] **Step 9: `model_server.py` 작성 (makeup-bench-sm conda env 전용, 메인 pytest 스위트 대상 아님)**

`poc/look-tryon/server-bench/model_server.py`:

```python
"""Stable-Makeup 상주 모델 서버 — makeup-bench-sm conda env 안에서만 돈다(#45, 별도 프로세스).
server/app/worker_stable_makeup.py가 이 서버로 HTTP 위임한다.

SPIGA 포즈 이미지는 source_path(mtime 포함)로 캐싱한다 — 같은 사진에 룩 여러 개를 얹을 때
SPIGA 랜드마크 추출을 세션당 1회만 하기 위함(#45 산출물 요구사항).

실행 (이 디렉터리에서):
    conda run -n makeup-bench-sm python model_server.py --port 8100

가중치·SD1.5 스냅샷 경로는 app_demo.py/bench.py와 동일 (README "재현 방법" 절 참고).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

SERVER_BENCH_DIR = Path(__file__).resolve().parent
SM_DIR = SERVER_BENCH_DIR / "stable_makeup"
RESULT_DIR = Path(os.environ.get("DHE_RESULT_DIR", "/tmp/danghwaeung/results"))

DEFAULT_SD15_SNAPSHOT = (
    Path.home()
    / ".cache/huggingface/hub/models--stable-diffusion-v1-5--stable-diffusion-v1-5"
    / "snapshots"
    / "451f4fe16113bff5a5d2269ed5ad43b0592e9a14"
)

os.chdir(SM_DIR)
sys.path.insert(0, str(SM_DIR))

from diffusers import UNet2DConditionModel as OriginalUNet2DConditionModel  # noqa: E402
from pipeline_sd15 import StableDiffusionControlNetPipeline  # noqa: E402
from diffusers import DDIMScheduler, ControlNetModel  # noqa: E402
from detail_encoder.encoder_plus import detail_encoder  # noqa: E402
from spiga_draw import spiga_process, spiga_segmentation  # noqa: E402
from spiga.inference.config import ModelConfig  # noqa: E402
from spiga.inference.framework import SPIGAFramework  # noqa: E402
from facelib import FaceDetector  # noqa: E402

DTYPE = torch.float16
SD15_SNAPSHOT = os.environ.get("SD15_SNAPSHOT", str(DEFAULT_SD15_SNAPSHOT))

print(f"모델 로딩 중... ({SD15_SNAPSHOT})")
processor = SPIGAFramework(ModelConfig("300wpublic"))
detector = FaceDetector(weight_path="./models/mobilenet0.25_Final.pth")
Unet = OriginalUNet2DConditionModel.from_pretrained(SD15_SNAPSHOT, subfolder="unet").to("cuda", DTYPE)
id_encoder = ControlNetModel.from_unet(Unet)
pose_encoder = ControlNetModel.from_unet(Unet)
makeup_encoder = detail_encoder(Unet, "openai/clip-vit-large-patch14", "cuda", dtype=DTYPE)
makeup_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model.bin", map_location="cuda"), strict=False
)
id_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model_1.bin", map_location="cuda"), strict=False
)
pose_encoder.load_state_dict(
    torch.load(SM_DIR / "models/stablemakeup/pytorch_model_2.bin", map_location="cuda"), strict=False
)
id_encoder.to("cuda", DTYPE)
pose_encoder.to("cuda", DTYPE)
makeup_encoder.to("cuda", DTYPE)
pipe = StableDiffusionControlNetPipeline.from_pretrained(
    SD15_SNAPSHOT,
    safety_checker=None,
    unet=Unet,
    controlnet=[id_encoder, pose_encoder],
    torch_dtype=DTYPE,
).to("cuda")
pipe.scheduler = DDIMScheduler.from_config(pipe.scheduler.config)
print("로딩 완료.")

_pose_cache: dict[str, tuple[float, Image.Image]] = {}


def _get_pose(source_path: str, id_image: Image.Image) -> Image.Image:
    mtime = os.path.getmtime(source_path)
    cached = _pose_cache.get(source_path)
    if cached and cached[0] == mtime:
        return cached[1]
    spigas = spiga_process(id_image, detector)
    pose = (
        spiga_segmentation(spigas, size=512)
        if spigas is not False
        else Image.new("RGB", id_image.size, (0, 0, 0))
    )
    _pose_cache[source_path] = (mtime, pose)
    return pose


class InferRequest(BaseModel):
    source_path: str
    ref_path: str
    steps: int = 10
    guidance_scale: float = 1.6


class InferResponse(BaseModel):
    result_url: str
    ms: int


app = FastAPI(title="stable-makeup-model-server")


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    if not os.path.exists(req.source_path):
        raise HTTPException(404, "source_path not found")
    if not os.path.exists(req.ref_path):
        raise HTTPException(404, "ref_path not found")

    id_image = Image.open(req.source_path).convert("RGB").resize((512, 512))
    ref_image = Image.open(req.ref_path).convert("RGB").resize((512, 512))
    pose_image = _get_pose(req.source_path, id_image)

    torch.cuda.synchronize()
    t0 = time.perf_counter()
    result = makeup_encoder.generate(
        id_image=[id_image, pose_image],
        makeup_image=ref_image,
        pipe=pipe,
        guidance_scale=req.guidance_scale,
        num_inference_steps=req.steps,
    )
    torch.cuda.synchronize()
    ms = int((time.perf_counter() - t0) * 1000)

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULT_DIR / f"{int(time.time() * 1000)}.jpg"
    result.save(out_path)
    return InferResponse(result_url=f"/results/{out_path.name}", ms=ms)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "cached_poses": len(_pose_cache)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8100)
    args = ap.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port)
```

- [ ] **Step 10: 수동 검증 (GPU 머신에서, pytest 대상 아님)**

```bash
cd poc/look-tryon/server-bench
export SD15_SNAPSHOT=...   # README 참고
conda run -n makeup-bench-sm python model_server.py --port 8100 &
curl http://127.0.0.1:8100/health
curl -X POST http://127.0.0.1:8100/infer -H "Content-Type: application/json" \
  -d '{"source_path":"stable_makeup/test_imgs/id/1.jpg","ref_path":"stable_makeup/test_imgs/makeup/1.jpg","steps":10}'
```

Expected: `/health` → `{"ok": true, "cached_poses": 0}`, `/infer` → `{"result_url": "/results/....jpg", "ms": <3200}` (bench 결론 3.15초 근처)

- [ ] **Step 11: 같은 소스로 두 번째 룩 요청 — SPIGA 캐싱 확인**

같은 `source_path`, 다른 `ref_path`로 `/infer` 재호출 → `/health`의 `cached_poses`가 여전히 1이어야 함(캐시 히트, 재계산 안 함).

- [ ] **Step 12: end-to-end 수동 확인 (메인 서버 gpu 모드)**

```bash
DHE_WORKER_MODE=gpu DHE_MODEL_SERVER_URL=http://127.0.0.1:8100 DHE_RESULT_DIR=/tmp/danghwaeung/results \
  uv run uvicorn server.app.main:app --port 8000
```
`POST /sessions/s1/jobs`로 실제 사진 업로드 → `GET /jobs/{id}` 폴링 → `status=done`, `result_url` 응답, `ms` ≈ 3~4초.

- [ ] **Step 13: 커밋**

```bash
git add server/app/config.py server/app/main.py server/app/worker_stable_makeup.py \
        server/tests/test_worker_stable_makeup.py poc/look-tryon/server-bench/model_server.py pyproject.toml
git commit -m "feat(server): Stable-Makeup을 별도 프로세스 워커로 연결 (#45)"
```

---

### Task 2: S-1 확정 — 후보 확장 + 정체성 지표 + 선정 (#47, #52, 스프린트 2, P1/P0)

두 이슈를 한 태스크로 묶는다: #47(벤치 확장)의 결과가 없으면 #52(확정)를 할 수 없다. `server-bench/README.md`에 이미 Stable-Makeup fp16+8~10step과 SHMT(참고용, 비상업) 결과가 있다 — 여기 남은 건 **LCM-LoRA**와 **ArcFace 코사인 실측**.

**Files:**
- Modify: `poc/look-tryon/server-bench/bench.py` — `--candidate lcm_lora` 추가, 5회 반복 뒤 ArcFace 코사인 계산 추가
- Create: `poc/look-tryon/server-bench/identity.py` — ArcFace 코사인 유틸(벤치 전용, Task 6에서 운영용으로 승격)
- Modify: `poc/look-tryon/server-bench/results/results.csv` — 새 후보 행 추가(스크립트가 append)
- Modify: `poc/look-tryon/server-bench/README.md` — "선정 표" 절 추가(탈락 후보 포함)

**Interfaces:**
- Consumes: Task 1의 `settings.transfer_steps`/`transfer_guidance` (선정 결과가 다르면 이 기본값을 갱신)
- Produces: 선정된 `(모델, step, guidance)` 조합 — Task 1의 `config.py` 기본값과 `docs/ai-pipeline-v6.md` §3 `transfer-v0.N` 버전 문자열에 반영

- [ ] **Step 1: `identity.py` 작성 — ArcFace 코사인 (라이선스 확인: `insightface` buffalo_l은 연구용 라이선스라 제품에 못 씀 → 상업 가능한 `facenet-pytorch`(MIT, VGGFace2 사전학습)로 대체)**

```python
"""원본 vs 결과 사진의 얼굴 임베딩 코사인 유사도. facenet-pytorch(MIT)로 상업 사용 가능."""

from __future__ import annotations

import torch
from facenet_pytorch import InceptionResnetV1, MTCNN
from PIL import Image

_mtcnn = MTCNN(image_size=160, margin=0, device="cuda")
_resnet = InceptionResnetV1(pretrained="vggface2").eval().to("cuda")


def face_cosine(img_a: Image.Image, img_b: Image.Image) -> float | None:
    face_a = _mtcnn(img_a)
    face_b = _mtcnn(img_b)
    if face_a is None or face_b is None:
        return None
    with torch.no_grad():
        emb_a = _resnet(face_a.unsqueeze(0).to("cuda"))
        emb_b = _resnet(face_b.unsqueeze(0).to("cuda"))
    return torch.nn.functional.cosine_similarity(emb_a, emb_b).item()
```

- [ ] **Step 2: `bench.py`의 `bench_stable_makeup`·`bench_shmt` 끝에 코사인 계산 추가**

각 함수의 `result_img` 확보 뒤:

```python
from identity import face_cosine

cos = face_cosine(id_image if "id_image" in dir() else source_image_pil, result_img)
rows.append(
    {
        "candidate": ...,
        "variant": variant_label,
        "run_number": "-",
        "phase": "identity",
        "time_sec": "",
        "vram_peak_mb": "",
        "notes": f"arcface_cos={cos}",
    }
)
```

(정확한 원본 이미지 변수명은 각 함수 로컬 변수에 맞춘다 — `bench_stable_makeup`은 `id_image`, `bench_shmt`는 `source_image`를 PIL로 되돌린 것.)

- [ ] **Step 3: LCM-LoRA 후보 추가**

```bash
conda run -n makeup-bench-sm pip install peft
```

`bench.py`에 `bench_lcm_lora()` 추가 — `bench_stable_makeup`과 동일 파이프라인 로드 후 `pipe.load_lora_weights("latent-consistency/lcm-lora-sdv1-5")`, `pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)`, `num_inference_steps=4~8`, `guidance_scale=1.0~2.0`로 5회 반복. `argparse`의 `choices`에 `"lcm_lora"` 추가.

- [ ] **Step 4: 실측 실행 (GPU 머신)**

```bash
conda run -n makeup-bench-sm python bench.py --candidate stable_makeup --variant fp16 --steps 10   # 코사인 포함 재실측
conda run -n makeup-bench-sm python bench.py --candidate lcm_lora --steps 4
conda run -n makeup-bench-sm python bench.py --candidate lcm_lora --steps 8
```

경량 GAN 후보(EleGANt·SSAT·BeautyREC)는 라이선스 확인이 이슈 본문에 "먼저" 라고 명시돼 있다 — 셋 다 라이선스 파일을 확인해 상업 가능한 것만 시도한다(비상업이면 SHMT처럼 "참고용"으로만 표에 남기고 후보에서 제외).

- [ ] **Step 5: README에 선정 표 추가, `config.py` 기본값 갱신**

`results.csv`의 새 행들을 `README.md`에 표로 옮기고, "결론" 절을 다시 쓴다(탈락 후보 포함 — SHMT는 이미 있음). 선정된 조합이 Task 1의 기본값(`transfer_steps=10`)과 다르면 `server/app/config.py`의 기본값과 `model_server.py`의 `guidance_scale`/스케줄러를 그 결정에 맞춰 수정한다.

- [ ] **Step 6: 커밋**

```bash
git add poc/look-tryon/server-bench/bench.py poc/look-tryon/server-bench/identity.py \
        poc/look-tryon/server-bench/results/results.csv poc/look-tryon/server-bench/README.md
git commit -m "docs(server-bench): S-1 확정 — LCM-LoRA·ArcFace 코사인 추가 실측, 최종 후보 선정 (#47 #52)"
```

---

### Task 3: 화장 레이어 추출 (#49, 스프린트 2, P0)

**Files:**
- Create: `server/app/layer.py` — 부위 마스크 내 ΔLab + 알파 추출
- Modify: `server/app/worker_stable_makeup.py` — 추출 결과를 `LookJob.layer`로 반환
- Modify: `server/app/config.py` — `layer_alpha_threshold` 추가
- Test: `server/tests/test_layer.py`

**Interfaces:**
- Consumes: `server/app/schemas.py`의 `Layer(mesh: str, url: str)`. 부위 마스크는 `guide` 모듈(②)의 랜드마크 폴리곤 좌표계(`mediapipe-468`)와 동일해야 함 — `poc/look-tryon/client/lib/regions.js`의 `BROW`/`EYES`/`LIPS`/`CHEEK` 인덱스를 Python 쪽에도 그대로 옮긴다(중복 정의 금지 원칙 위반이지만 서버·클라이언트가 서로 다른 언어라 상수만 복제, 값 자체는 규칙에 따라 규정된 랜드마크 인덱스라 바뀔 일이 거의 없음. 바뀌면 두 파일을 같은 PR에서 고친다).
- Produces: `extract_layer(source_path: str, result_path: str) -> str | None` — RGBA PNG(ΔL·Δa·Δb·alpha) 경로, 실패 시 `None`

- [ ] **Step 1: 랜드마크 인덱스를 서버 쪽에도 정의 — 실패하는 테스트 먼저**

`server/tests/test_layer.py`:

```python
"""화장 레이어 추출 테스트. Pillow로 만든 순수 색 이미지 2장(원본=회색, 결과=원본+부위만 붉게)으로
"부위 밖은 알파 0, 부위 안은 색 차이 반영"만 검증한다 — 실제 얼굴 랜드마크는 통합 테스트(Task 1 Step 12)에서."""

import numpy as np
from PIL import Image

from server.app.layer import REGION_LANDMARKS, extract_layer_from_arrays


def test_region_outside_alpha_zero():
    h, w = 64, 64
    source = np.full((h, w, 3), 128, dtype=np.uint8)
    result = source.copy()
    # 왼쪽 위 8x8 블록만 화장이 발린 것처럼 붉게 바꿈
    result[0:8, 0:8] = [200, 100, 100]
    mask = np.zeros((h, w), dtype=bool)
    mask[0:8, 0:8] = True

    layer = extract_layer_from_arrays(source, result, mask)

    assert layer.shape == (h, w, 4)
    assert (layer[10:, 10:, 3] == 0).all()  # 마스크 밖 알파 0
    assert (layer[0:8, 0:8, 3] > 0).any()  # 마스크 안 알파 있음


def test_weak_change_gets_zero_alpha():
    h, w = 32, 32
    source = np.full((h, w, 3), 128, dtype=np.uint8)
    result = source.copy()  # 완전히 동일 — 화장 없음
    mask = np.ones((h, w), dtype=bool)

    layer = extract_layer_from_arrays(source, result, mask, alpha_threshold=2.0)

    assert (layer[..., 3] == 0).all()
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `uv run pytest server/tests/test_layer.py -v`
Expected: FAIL — `server.app.layer` 없음

- [ ] **Step 3: `layer.py` 구현**

```python
"""화장 레이어 추출 — 부위 마스크(랜드마크 폴리곤) 안에서만 ΔLab, 약한 변화는 알파 0.
`LookJob.layer`(schemas.Layer)로 나간다. 좌표계는 mediapipe-468, 클라이언트
poc/look-tryon/client/lib/regions.js의 BROW/EYES/LIPS/CHEEK와 같은 인덱스를 쓴다(중복 정의,
바뀌면 두 파일을 같은 PR에서 고친다)."""

from __future__ import annotations

import numpy as np
from PIL import Image
from skimage import color

# regions.js와 동일 — 눈썹·눈(섀도우 밴드)·입술·볼
REGION_LANDMARKS = {
    "browR": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "browL": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
    "lips": [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
    "cheekR": [116, 117, 118, 101, 36, 205, 187, 123],
    "cheekL": [345, 346, 347, 330, 266, 425, 411, 352],
}


def extract_layer_from_arrays(
    source_rgb: np.ndarray, result_rgb: np.ndarray, mask: np.ndarray, alpha_threshold: float = 3.0
) -> np.ndarray:
    """source/result: HxWx3 uint8. mask: HxW bool. 반환: HxWx4 (ΔL, Δa, Δb를 0~255로 재매핑 + alpha)."""
    lab_s = color.rgb2lab(source_rgb / 255.0)
    lab_r = color.rgb2lab(result_rgb / 255.0)
    delta = lab_r - lab_s  # HxWx3, L in [-100,100], a/b roughly [-128,128]
    mag = np.linalg.norm(delta, axis=-1)

    alpha = np.where(mask & (mag >= alpha_threshold), np.clip(mag / 40.0, 0, 1) * 255, 0).astype(np.uint8)
    out = np.zeros((*mask.shape, 4), dtype=np.uint8)
    out[..., 0] = np.clip(delta[..., 0] * 1.275 + 128, 0, 255)  # L: -100..100 -> 0..255
    out[..., 1] = np.clip(delta[..., 1] + 128, 0, 255)  # a: -128..128 -> 0..255
    out[..., 2] = np.clip(delta[..., 2] + 128, 0, 255)  # b
    out[..., 3] = alpha
    return out


def polygon_mask(h: int, w: int, points_px: list[tuple[float, float]]) -> np.ndarray:
    from PIL import ImageDraw

    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).polygon(points_px, fill=255)
    return np.array(img) > 0


def extract_layer(
    source_path: str, result_path: str, landmarks_px: dict[str, list[tuple[float, float]]]
) -> str | None:
    """source_path/result_path: 512x512 정렬된 사진. landmarks_px: REGION_LANDMARKS 키 -> 픽셀 좌표 리스트.
    실패(마스크 전부 비어있음 등) -> None, 호출자(worker)는 layer=None으로 두고 클라이언트가 3점 아핀 폴백."""
    source = np.array(Image.open(source_path).convert("RGB"))
    result = np.array(Image.open(result_path).convert("RGB"))
    if source.shape != result.shape:
        return None

    h, w = source.shape[:2]
    mask = np.zeros((h, w), dtype=bool)
    for pts in landmarks_px.values():
        mask |= polygon_mask(h, w, pts)
    if not mask.any():
        return None

    layer = extract_layer_from_arrays(source, result, mask)
    if layer[..., 3].max() == 0:
        return None  # 변화가 전부 임계 미달 — 화장이 안 보였다는 뜻, 레이어 없이 결과 이미지만

    out_path = result_path.rsplit(".", 1)[0] + "_layer.png"
    Image.fromarray(layer, mode="RGBA").save(out_path)
    return out_path
```

`pyproject.toml` `[project] dependencies`에 `"scikit-image>=0.24",` 추가(Lab 변환용, `numpy`/`pillow`는 이미 `eval` extra에 있으니 메인으로 승격하거나 `server` extra에 추가).

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `uv run pytest server/tests/test_layer.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: `worker_stable_makeup.py`에 연결**

모델 서버 응답에 랜드마크 좌표가 없으므로, `model_server.py`의 `/infer` 응답에 `landmarks_px`(SPIGA 또는 MediaPipe로 이미 갖고 있는 468점 중 `REGION_LANDMARKS`가 쓰는 것만) 필드를 추가하고, `worker_stable_makeup.py`에서:

```python
    from .layer import extract_layer

    layer_url = None
    if "landmarks_px" in body:
        layer_path = extract_layer(source_path, body["result_local_path"], body["landmarks_px"])
        if layer_path:
            layer_url = f"/results/{os.path.basename(layer_path)}"
    return body["result_url"], layer_url, None
```

(`model_server.py`도 `InferResponse`에 `landmarks_px: dict[str, list[list[float]]] | None`, `result_local_path: str` 필드를 추가해야 한다 — Task 1 코드를 이 태스크에서 확장.)

- [ ] **Step 6: `test_worker_stable_makeup.py`에 레이어 케이스 추가**

기존 `test_posts_expected_payload_and_returns_result`의 `FakeResponse.json()`에 `landmarks_px`를 넣지 않는 버전과 넣는 버전 둘 다 테스트해서, 없으면 `layer_url is None`, 있으면 `extract_layer`가 호출되는지 확인(간단히는 `monkeypatch`로 `extract_layer`를 스텁해서 반환값 매핑만 검증).

- [ ] **Step 7: 커밋**

```bash
git add server/app/layer.py server/app/worker_stable_makeup.py server/tests/test_layer.py \
        server/tests/test_worker_stable_makeup.py poc/look-tryon/server-bench/model_server.py pyproject.toml
git commit -m "feat(server): 화장 레이어 추출 (부위 마스크 ΔLab + 알파) (#49)"
```

---

### Task 4: 서버 로그를 `Event` 형식과 통일 (#48, 스프린트 2, P1)

**Files:**
- Modify: `server/app/jobs.py` — `_run()`의 `log.info(...)` 호출을 구조화 로그로
- Test: `server/tests/test_jobs_logging.py`

**Interfaces:**
- Consumes: `docs/ai-pipeline-v6.md` "기록 규칙" — 사진·좌표 없이 숫자 요약만
- Produces: `look_job` 로그 한 줄이 `{job, look, status, ms, queue_ms, cos}` 키를 가진 JSON 문자열(⑥의 `Event` 파서가 그대로 읽을 수 있게)

- [ ] **Step 1: 실패하는 테스트 작성**

```python
"""look_job 로그가 파일명·경로 없이 JSON 한 줄(job/look/status/ms/queue_ms/cos)로 나가는지 확인."""

import json
import logging

from fastapi.testclient import TestClient

from server.app import main


def test_look_job_log_is_structured_json(caplog):
    client = TestClient(main.app)
    with caplog.at_level(logging.INFO, logger="dhe.jobs"):
        files = {"photo": ("front.webp", __import__("io").BytesIO(b"x"), "image/webp")}
        r = client.post("/sessions/s9/jobs", files=files, data={"look_ids": "look_01"})
        job_id = r.json()["jobs"][0]["job_id"]
        import time

        for _ in range(100):
            if client.get(f"/jobs/{job_id}").json()["status"] in ("done", "error", "fallback"):
                break
            time.sleep(0.02)

    look_job_lines = [rec.message for rec in caplog.records if rec.message.startswith("look_job ")]
    assert look_job_lines, "look_job 로그가 없음"
    payload = json.loads(look_job_lines[-1][len("look_job ") :])
    assert set(payload) == {"job", "look", "status", "ms", "queue_ms", "cos"}
    assert "front.webp" not in json.dumps(payload)  # 파일명 절대 안 남김
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `uv run pytest server/tests/test_jobs_logging.py -v`
Expected: FAIL — 지금은 `"look_job job=%s look=%s status=%s ..."` 형식이라 `startswith("look_job ")` 이후가 JSON이 아님

- [ ] **Step 3: `jobs.py`의 `_run()` finally 블록 수정**

```python
        finally:
            log.info(
                "look_job %s",
                json.dumps(
                    {
                        "job": job_id,
                        "look": j.job.look_id,
                        "status": j.job.status,
                        "ms": j.job.ms,
                        "queue_ms": j.job.queue_ms,
                        "cos": j.job.identity.cos,
                    }
                ),
            )
            self._release_source(job_id)
```

파일 맨 위 `import json` 추가.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `uv run pytest server/tests/test_jobs_logging.py -v`
Expected: PASS

- [ ] **Step 5: 기존 테스트 회귀 확인 + 커밋**

Run: `uv run pytest server/tests/ -v`
Expected: 전부 PASS

```bash
git add server/app/jobs.py server/tests/test_jobs_logging.py
git commit -m "feat(server): look_job 로그를 구조화 JSON으로 (Event 형식 통일) (#48)"
```

---

### Task 5: ArcFace 정체성 코사인 실제 계산 (#50, 스프린트 3, P1)

Task 2에서 이미 `poc/look-tryon/server-bench/identity.py`(facenet-pytorch)를 벤치용으로 만들었다 — 여기서는 그 함수를 운영 경로(모델 서버)로 승격하고, 임계 미달 시 `fallback` 처리가 실제로 되는지 확인한다.

**Files:**
- Modify: `poc/look-tryon/server-bench/model_server.py` — `/infer` 응답에 `identity_cos` 추가(Task 2의 `identity.face_cosine` 재사용)
- Modify: `server/app/worker_stable_makeup.py` — 세 번째 반환값을 실제 코사인으로
- Test: `server/tests/test_worker_stable_makeup.py`에 케이스 추가, `server/tests/test_api.py`에 fallback 통합 케이스 추가

**Interfaces:**
- Consumes: `server/app/jobs.py`의 `_run()` — 이미 `cos < settings.identity_min_cos`면 `status=fallback` 처리하는 로직이 있음(수정 불필요, 지금은 코사인이 항상 `None`이라 그 분기를 안 탐)
- Produces: `stable_makeup_worker`가 반환하는 `cos: float | None`이 실제 측정값

- [ ] **Step 1: `test_worker_stable_makeup.py`에 실패하는 테스트 추가**

```python
def test_returns_identity_cos_from_response(look_ref, tmp_path, monkeypatch):
    source = tmp_path / "source.jpg"
    source.write_bytes(b"fake-source")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"result_url": "/results/abc.jpg", "ms": 3100, "identity_cos": 0.42}

    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse())

    _, _, cos = stable_makeup_worker(str(source), "look_01")
    assert cos == 0.42
```

- [ ] **Step 2: 실행해서 실패 확인 (지금은 항상 `None` 반환)**

Run: `uv run pytest server/tests/test_worker_stable_makeup.py::test_returns_identity_cos_from_response -v`
Expected: FAIL — `assert None == 0.42`

- [ ] **Step 3: `worker_stable_makeup.py` 수정**

```python
    return body["result_url"], layer_url, body.get("identity_cos")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `uv run pytest server/tests/test_worker_stable_makeup.py -v`
Expected: PASS (5 passed — Task 1의 3개 + Task 3의 레이어 + 이번 코사인)

- [ ] **Step 5: `model_server.py`의 `/infer`에 코사인 계산 추가**

```python
from identity import face_cosine  # Task 2에서 만든 벤치 유틸, 이제 운영 경로에서도 씀

...


class InferResponse(BaseModel):
    result_url: str
    ms: int
    identity_cos: float | None = None
    landmarks_px: dict[str, list[list[float]]] | None = None
    result_local_path: str | None = None
```

`infer()` 안, `result.save(out_path)` 뒤:

```python
cos = face_cosine(id_image, result)
return InferResponse(
    result_url=f"/results/{out_path.name}", ms=ms, identity_cos=cos, result_local_path=str(out_path)
)
```

- [ ] **Step 6: fallback 경로 통합 테스트 (jobs.py는 이미 처리하지만 회귀 확인용)**

`server/tests/test_api.py`에 추가:

```python
def test_low_identity_cos_becomes_fallback(client, monkeypatch):
    from server.app import jobs as jobs_module

    def low_cos_worker(source_path, look_id):
        return "/results/x.jpg", None, 0.1  # settings.identity_min_cos=0.6 미달

    monkeypatch.setattr(main.queue, "_worker", low_cos_worker)

    files = {"photo": ("front.webp", io.BytesIO(b"x"), "image/webp")}
    r = client.post("/sessions/s3/jobs", files=files, data={"look_ids": "look_01"})
    job_id = r.json()["jobs"][0]["job_id"]
    body = _wait_done(client, job_id)
    assert body["status"] == "fallback"
    assert body["result_url"] is None
```

- [ ] **Step 7: 실행 확인 + 커밋**

Run: `uv run pytest server/tests/ -v`
Expected: 전부 PASS

```bash
git add poc/look-tryon/server-bench/model_server.py server/app/worker_stable_makeup.py \
        server/tests/test_worker_stable_makeup.py server/tests/test_api.py
git commit -m "feat(server): ArcFace(facenet-pytorch) 정체성 코사인 실제 계산, 미달 시 fallback 확인 (#50)"
```

---

### Task 6: 클라이언트 워핑을 TS로 이전 (#51, 스프린트 3, P1)

`poc/look-tryon/client/` POC(부위별 아핀, 팬 삼각분할)는 이미 실사용 검증됐다(v3까지 반복, One Euro Filter로 흔들림 완화). 이슈 본문의 "3점 아핀 → 부위별 아핀 → `FACE_LANDMARKS_TESSELATION` 삼각형(WebGL)"에서 앞 두 단계는 끝났다 — 이 태스크는 그 둘을 TS로 옮기고, 세 번째(전체 얼굴 삼각형 메시 WebGL)는 **조사 스파이크**로만 다룬다: `docs/superpowers/plans/2026-09-17-template-blend-lookpreview.md`의 C4 작업(canonical UV 메시 + three.js)이 이미 이 방향을 시도했다가 템플릿 블렌드로 전환하며 보류됐다(커밋 `3aa662c`→`7ca19b1`) — 같은 함정(왜곡·경계 블렌딩)을 다시 밟을 위험이 있어서, E-3(#53) 결과가 "부위별 아핀으로는 부족하다"고 나올 때만 착수하는 게 낫다.

**Files:**
- Create: `client/src/core/affine.ts`
- Create: `client/src/core/smoothing.ts`
- Create: `client/src/core/regions.ts`
- Create: `client/src/core/tryon.ts`
- Test: `client/tests/affine.test.ts`, `client/tests/smoothing.test.ts`, `client/tests/regions.test.ts`, `client/tests/tryon.test.ts`

**Interfaces:**
- Consumes: `client/src/core/types.ts`의 기존 계약 타입(있다면 `Landmark`/`LookJob` 등 — 없으면 이 태스크에서 `Landmark = { x: number; y: number; z: number }` 추가)
- Produces: `buildRegions(lm: Landmark[], w: number, h: number): Record<RegionKey, [number, number][]>`, `solveAffine(src, dst): number[] | null`, `class LandmarkSmoother`, `warpPolygon(ctx, srcPts, dstPts, srcImg, alpha): void` — ⑥이 화면 통합에서 그대로 import

- [ ] **Step 1: `affine.ts` 실패하는 테스트**

`client/tests/affine.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { solveAffine } from "../src/core/affine";

describe("solveAffine", () => {
  it("恒등 변환(같은 삼각형) -> 항등 행렬 근사", () => {
    const tri: [number, number][] = [[0, 0], [10, 0], [0, 10]];
    const m = solveAffine(tri, tri);
    expect(m).not.toBeNull();
    const [a, b, c, d, e, f] = m!;
    expect(a).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(0, 5);
    expect(d).toBeCloseTo(1, 5);
    expect(e).toBeCloseTo(0, 5);
    expect(f).toBeCloseTo(0, 5);
  });

  it("퇴화 삼각형(일직선) -> null", () => {
    const line: [number, number][] = [[0, 0], [1, 0], [2, 0]];
    expect(solveAffine(line, [[0, 0], [1, 1], [2, 2]])).toBeNull();
  });
});
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `cd client && npm test -- affine.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: `affine.ts` 구현 (POC `lib/affine.js` 그대로 타입만 붙임)**

```typescript
// 3점 대응 아핀 변형. app.js(v2 Canvas2D 워핑) POC에서 실사용 검증된 수식 그대로 TS로 이전.
export type Pt = [number, number];

export function solveAffine(src: [Pt, Pt, Pt], dst: [Pt, Pt, Pt]): number[] | null {
  const [[x0, y0], [x1, y1], [x2, y2]] = src;
  const [[u0, v0], [u1, v1], [u2, v2]] = dst;
  const d = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
  if (Math.abs(d) < 1e-6) return null;
  const solveRow = (p0: number, p1: number, p2: number) => {
    const a = (p0 * (y1 - y2) - p1 * (y0 - y2) + p2 * (y0 - y1)) / d;
    const b = (x0 * (p1 - p2) - x1 * (p0 - p2) + x2 * (p0 - p1)) / d;
    const c = (x0 * (y1 * p2 - y2 * p1) - x1 * (y0 * p2 - y2 * p0) + x2 * (y0 * p1 - y1 * p0)) / d;
    return [a, b, c];
  };
  const [a, c, e] = solveRow(u0, u1, u2);
  const [b, dd, f] = solveRow(v0, v1, v2);
  return [a, b, c, dd, e, f];
}
```

- [ ] **Step 4: 실행해서 통과 확인**

Run: `cd client && npm test -- affine.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: `smoothing.ts` — 실패하는 테스트**

`client/tests/smoothing.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "../src/core/smoothing";

describe("OneEuroFilter", () => {
  it("첫 값은 그대로 통과", () => {
    const f = new OneEuroFilter();
    expect(f.filter(10, 0)).toBe(10);
  });

  it("떨리는 입력을 원래보다 덜 움직이게 완화", () => {
    const f = new OneEuroFilter(1.0, 0.0);
    f.filter(0, 0);
    const noisy = [10, -8, 12, -9, 11];
    let t = 16;
    const outputs = noisy.map((x) => {
      const y = f.filter(x, t);
      t += 16;
      return y;
    });
    const rawSpread = Math.max(...noisy) - Math.min(...noisy);
    const outSpread = Math.max(...outputs) - Math.min(...outputs);
    expect(outSpread).toBeLessThan(rawSpread);
  });
});
```

- [ ] **Step 6: 실행해서 실패 확인 → `smoothing.ts` 구현 (POC `lib/smoothing.js` 그대로, `LowPassFilter`·`OneEuroFilter`·`LandmarkSmoother` 세 클래스, 타입만 추가) → 재실행해서 통과 확인**

Run: `cd client && npm test -- smoothing.test.ts`
Expected: 구현 전 FAIL(모듈 없음) → 구현 후 PASS (2 passed)

- [ ] **Step 7: `regions.ts` — 실패하는 테스트**

```typescript
import { describe, expect, it } from "vitest";
import { buildRegions, centroid, REGION_KEYS } from "../src/core/regions";

function fakeLandmarks(n = 468) {
  return Array.from({ length: n }, (_, i) => ({ x: (i % 10) / 10, y: (i % 7) / 7, z: 0 }));
}

describe("buildRegions", () => {
  it("모든 REGION_KEYS에 대해 3점 이상의 폴리곤을 만든다", () => {
    const regions = buildRegions(fakeLandmarks(), 100, 100);
    for (const key of REGION_KEYS) {
      expect(regions[key].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("centroid는 점들의 평균", () => {
    expect(centroid([[0, 0], [10, 0], [0, 10]])).toEqual([10 / 3, 10 / 3]);
  });
});
```

- [ ] **Step 8: 실행해서 실패 확인 → `regions.ts` 구현 (POC `lib/regions.js`의 `BROW`/`EYES`/`CHEEK`/`LIPS`/`REGION_KEYS`/`TRACKED_IDX`/`centroid`/`buildRegions` 그대로 타입 붙임, Task 3의 `server/app/layer.py`의 `REGION_LANDMARKS`와 인덱스 값이 같아야 함 — 다르면 둘 다 이 커밋에서 맞춘다) → 재실행해서 통과 확인**

Run: `cd client && npm test -- regions.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 9: `tryon.ts` — 부위별 아핀 워핑 조립. 실패하는 테스트**

Canvas2D는 jsdom에 없으니 `warpPolygon`이 호출하는 컨텍스트 메서드 시퀀스만 검증(POC와 같은 계약):

```typescript
import { describe, expect, it, vi } from "vitest";
import { warpPolygon } from "../src/core/tryon";

describe("warpPolygon", () => {
  it("삼각형 개수만큼 clip·setTransform·drawImage를 호출한다", () => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      closePath: () => calls.push("closePath"),
      clip: () => calls.push("clip"),
      setTransform: () => calls.push("setTransform"),
      drawImage: () => calls.push("drawImage"),
      restore: () => calls.push("restore"),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    warpPolygon(ctx, square, square, {} as CanvasImageSource, 0.8);

    expect(calls.filter((c) => c === "drawImage")).toHaveLength(4); // 정점 4개 -> 팬 삼각분할 4번
  });
});
```

- [ ] **Step 10: 실행해서 실패 확인 → `tryon.ts` 구현 (POC `app.js`의 `warpPolygon` 함수 그대로, `regions.ts`/`affine.ts` import) → 재실행해서 통과 확인**

Run: `cd client && npm test -- tryon.test.ts`
Expected: PASS

- [ ] **Step 11: 전체 클라이언트 검사 + 커밋**

Run: `cd client && npm run typecheck && npm test && npm run lint`
Expected: 전부 통과

```bash
git add client/src/core/affine.ts client/src/core/smoothing.ts client/src/core/regions.ts client/src/core/tryon.ts \
        client/tests/affine.test.ts client/tests/smoothing.test.ts client/tests/regions.test.ts client/tests/tryon.test.ts
git commit -m "feat(client): 룩 얹어보기 부위별 아핀 워핑을 POC에서 core/tryon.ts로 이전 (#51)"
```

- [ ] **Step 12 (조사 스파이크, 코드 아님): FACE_LANDMARKS_TESSELATION 전체 얼굴 워핑 여지 기록**

`docs/eval-results-v6.md`의 실험 노트에 한 줄: "부위별 아핀(#51) vs 전체 삼각형 메시 — E-3(#53) 결과가 부위 경계에서 부자연스러움을 보이면 재검토, 아니면 백로그로 유지(C4 UV 메시 시도가 이미 보류된 선례 있음)."

---

### Task 7: E-3 평가 하네스 — 전이 시간·닮음·색 반영·실패 분류 (#53, 스프린트 3, P1)

**Files:**
- Create: `eval/transfer/run.py`
- Modify: `eval/run_all.py` — 이미 `ORDER`에 `"transfer"`가 있어 수정 불필요, `eval/transfer/run.py`가 생기면 자동으로 실행됨
- Test: `server/tests/test_eval_transfer.py` (골든 세트 비었을 때 skip 경로만 — 실측은 실촬영 200장 확보 후 별도로 돌림)

**Interfaces:**
- Consumes: `eval/common.py`의 `load_golden()`, `data_dir()`, `result_path()`, `write_rows()`; `server.app.worker_stable_makeup.stable_makeup_worker` 또는 `settings.model_server_url`로 직접 API 호출
- Produces: `eval/results/<날짜>_<커밋>_transfer_<transfer버전>_<golden버전>.csv` — 열: `eval,metric,baseline,current,pass,n,note`

- [ ] **Step 1: 실패하는 테스트 — 골든 세트가 비었을 때 skip 행이 나오는지 (다른 `eval/*/run.py`와 동일 패턴)**

`server/tests/test_eval_transfer.py`:

```python
"""eval/transfer/run.py — 골든 세트가 비어 있으면(지금 상태) 'skipped' 한 줄만 남기고 끝나야 한다.
실측(E-3, 실촬영 200장)은 촬영 세션 완료 후 별도로 돌린다 — 여기서는 하네스 배선만 검증."""

import csv
import subprocess
import sys

from eval.common import ROOT


def test_transfer_run_skips_when_golden_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("DHE_EVAL_RESULTS", str(tmp_path))
    r = subprocess.run(
        [sys.executable, str(ROOT / "eval" / "transfer" / "run.py")],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    assert r.returncode == 0, r.stderr
    csvs = list(tmp_path.glob("*_transfer_*.csv"))
    assert len(csvs) == 1
    rows = list(csv.DictReader(csvs[0].open(encoding="utf-8")))
    assert rows[0]["note"] == "skipped"
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `uv run pytest server/tests/test_eval_transfer.py -v`
Expected: FAIL — `eval/transfer/run.py` 없음

- [ ] **Step 3: `eval/transfer/run.py` 구현 — `eval/score/run.py`와 같은 골격**

```python
"""E-3·S-1 — 서버 화장 전이 시간·ArcFace 닮음·부위 ΔE·실패 분류.

골든 세트가 비어 있으면(지금) 'skipped' 한 줄만 남긴다. 실촬영 20명 × 룩 10 = 200장이 채워지면
그대로 동작한다(#53 산출물). 서버는 uv run uvicorn server.app.main:app 로 미리 gpu 모드로 띄워둔다.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from eval.common import data_dir, load_golden, result_path, write_rows  # noqa: E402

TRANSFER_VERSION = "transfer-v0.1"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--server-url", default="http://127.0.0.1:8000")
    ap.add_argument("--candidate", default=None, help="S-1 후보 비교용 라벨 (예: lcm_lora_8step)")
    args = ap.parse_args()

    g = load_golden()
    base = data_dir(g)
    rows: list[dict] = []

    if base is None or not g.get("items"):
        write_rows(result_path("transfer", TRANSFER_VERSION, g["golden_version"]), rows)
        print("[transfer] golden set empty — skipped")
        return 0

    times_ms: list[float] = []
    coses: list[float] = []
    failures: dict[str, int] = {}

    for item in g["items"]:
        photo_path = base / item["photo"]
        for look_id in item.get("look_ids", []):
            t0 = time.perf_counter()
            try:
                r = httpx.post(
                    f"{args.server_url}/sessions/{item['person_id']}/jobs",
                    files={"photo": open(photo_path, "rb")},
                    data={"look_ids": look_id},
                    timeout=30,
                )
                r.raise_for_status()
                job_id = r.json()["jobs"][0]["job_id"]
                job = _poll(args.server_url, job_id)
            except Exception as e:  # 이 룩만 실패, 나머지는 계속
                failures[type(e).__name__] = failures.get(type(e).__name__, 0) + 1
                continue
            times_ms.append((time.perf_counter() - t0) * 1000)
            if job["status"] == "done":
                coses.append(job["identity"]["cos"] or 0.0)
            else:
                failures[job["status"]] = failures.get(job["status"], 0) + 1

    n = len(times_ms)
    rows.append(
        {
            "eval": "transfer",
            "metric": "ms_p50",
            "baseline": "",
            "current": _pct(times_ms, 50),
            "pass": "",
            "n": n,
            "note": args.candidate or "",
        }
    )
    rows.append(
        {
            "eval": "transfer",
            "metric": "ms_p95",
            "baseline": "",
            "current": _pct(times_ms, 95),
            "pass": "",
            "n": n,
            "note": "",
        }
    )
    rows.append(
        {
            "eval": "transfer",
            "metric": "identity_cos_median",
            "baseline": "",
            "current": _pct(coses, 50),
            "pass": "",
            "n": len(coses),
            "note": "",
        }
    )
    for k, v in failures.items():
        rows.append(
            {
                "eval": "transfer",
                "metric": f"failure_{k}",
                "baseline": "",
                "current": v,
                "pass": "",
                "n": n,
                "note": "",
            }
        )

    write_rows(result_path("transfer", TRANSFER_VERSION, g["golden_version"]), rows)
    return 0


def _poll(server_url: str, job_id: str, timeout: float = 15.0) -> dict:
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < timeout:
        r = httpx.get(f"{server_url}/jobs/{job_id}", timeout=5)
        r.raise_for_status()
        body = r.json()
        if body["status"] in ("done", "fallback", "error"):
            return body
        time.sleep(0.5)
    raise TimeoutError(job_id)


def _pct(values: list[float], p: int) -> float | str:
    if not values:
        return ""
    s = sorted(values)
    return round(s[min(len(s) - 1, int(len(s) * p / 100))], 2)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `uv run pytest server/tests/test_eval_transfer.py -v`
Expected: PASS

- [ ] **Step 5: `run_all.py`로 전체 하네스에서도 도는지 확인**

Run: `uv run python eval/run_all.py --only transfer`
Expected: `[transfer] running` 뒤 skip 행 하나 있는 CSV 생성, `eval/report.py`가 `docs/eval-results-v6.md`에 그 줄을 붙임

- [ ] **Step 6: 커밋**

```bash
git add eval/transfer/run.py server/tests/test_eval_transfer.py
git commit -m "test(eval): E-3 전이 평가 하네스 배선 (골든 세트 확보 전 skip 경로) (#53)"
```

실측 실행(팀이 20명 × 룩 10 촬영을 마친 뒤): `uv run python eval/transfer/run.py --server-url http://<gpu서버>:8000`.

---

## 백로그 (이 계획 범위 밖 — 프로젝트에 "백로그·범위 밖"으로 이미 마일스톤 지정됨)

시간이 남으면 위에서부터 순서대로: #46(프로세스 안 큐 → Redis+RQ), #54(삭제 정책 완성 — nginx tmpfs·TTL 크론·검증 스크립트), #55(헬스체크·재시작·운영 지표 집계), #57(배포), #56(룩 전용 LoRA 추가 학습, 선택). 지금 계획엔 포함하지 않는다 — Task별 근거 코드가 없는데 미리 스텝을 적으면 자리채우기 플레이스홀더가 된다.

## Self-Review 체크

- [x] `docs/work-split-modules-v6.md` §3 모듈④의 "해야 할 것" 6개 항목 — 대기열(Task1 진입점, 우선순위는 이미 jobs.py에 있음)·화장 레이어(Task3)·정교한 붙이기(Task6)·닮음 검사(Task5)·삭제 규칙(jobs.py에 이미 있음, Task1에서 재확인)·서버 숫자(Task7의 E-3 + Task4의 로그) 전부 태스크에 매핑됨.
- [x] `docs/ai-pipeline-v6.md` §1-2 호출 그래프의 각 단계(큐→전이→닮음 검사→레이어 추출→삭제)가 Task 1·3·5의 코드로 실제 구현됨.
- [x] 플레이스홀더 스캔: "TODO"·"적절히 처리" 문구 없음. 코드가 없는 백로그 항목은 태스크로 만들지 않고 별도 절로 분리.
- [x] 타입 일관성: `Worker` 튜플 `(result_url, layer_url, cos)` 순서가 Task 1·3·5에서 동일, `REGION_LANDMARKS`(서버)와 `REGION_KEYS`/`BROW`/`EYES`/`LIPS`/`CHEEK`(클라이언트)가 같은 랜드마크 인덱스를 쓰도록 Task 3·6에서 명시.
