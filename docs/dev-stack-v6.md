# 당화응 개발 규칙 — 기본 언어·스택·폴더·세팅

당화응 · 2026-09-18 · 분업 시작 전 공통 규칙. 분업안 `work-split-modules-v6.md`, AI 파이프라인 `ai-pipeline-v6.md`와 짝.

> **한눈에**
**기본 언어는 Python 3.11 + FastAPI.** 서버·평가 하네스·학습·데이터 도구·집계 스크립트는 전부 Python으로 쓴다. 다른 언어는 "Python으로 할 수 없는 자리"에만 섞고, 섞을 때는 이 문서 §3 절차를 따른다. 지금 정해진 예외는 하나 — **폰 브라우저에서 도는 것(랜드마크·게이트·가이드·채점·화면)은 TypeScript**다(2026-09-18 확정). 브라우저에는 Python이 없으니 불가피하고, 채점 core는 폰에서 돌아야 하므로 TS로 옮겨 유지한다.
>
> 저장소 루트에 `pyproject.toml`·`server/`·`eval/`·`client/`를 만들어 두었다. `uv sync --extra dev && uv run pytest`로 5개 테스트가 통과하고 `uv run ruff check .`가 깨끗하다. `cd client && npm install && npm run typecheck && npm test`로 타입 검사·테스트 3개가 통과한다. 서버는 모델 없는 스텁 워커로 호출 그래프(큐 → 워커 → 정체성 검사 → 삭제)를 그대로 돌고, 클라이언트는 계약 타입(`types.ts`)과 공통 `log()`까지 있다.

---

## 1. 언어 결정

| 자리 | 언어 | 이유 |
| --- | --- | --- |
| 서버 API·큐·워커 (모듈 ④) | **Python 3.11 + FastAPI** | 모델(PyTorch·diffusers)과 같은 언어. 큐는 Redis + RQ |
| 평가 하네스 `eval/` (모듈 ⑤ + 각 모듈) | **Python** | 결과 CSV·표·통계. 채점기(JS)는 Node를 subprocess로 부른다 |
| 얼굴형 모델 학습·데이터 도구 (모듈 ⑤) | **Python** | scikit-learn / PyTorch |
| 로그 집계·퍼널·서빙 지표 (모듈 ⑥·④) | **Python** | JSONL → 표 |
| 폰 브라우저: 촬영·랜드마크·게이트·가이드·실시간·채점·합산·화면 (모듈 ①②③⑥) | **TypeScript (strict, Vite, Vitest, ESLint)** | 브라우저 필수. MediaPipe Tasks 타입 제공. 계약을 `client/src/core/types.ts`에 타입으로 두고 Pydantic과 1:1 |
| 채점 core (`score.js`·`review.js` → `score.ts`·`review.ts`) | **TS로 이전** | 폰에서 돌아야 함. Python 포팅은 하지 않는다(두 벌 유지 비용). 평가는 Node CLI로 같은 빌드 산출물을 부른다 |
| 얼굴형 모델 추론 (폰) | TS(ONNX Runtime Web) 또는 규칙 | 학습은 Python, 배포는 ONNX로 내보내 브라우저에서 실행 |
| 서버 배포·운영 스크립트 | Python 또는 셸(bash) | Windows 개발자는 Git Bash |

**정하지 않은 것**: WebGL 셰이더(GLSL — 메시 워핑에서 불가피하면 §3 절차로 추가).

## 2. 버전·도구 고정

| 항목 | 값 | 비고 |
| --- | --- | --- |
| Python | **3.11.x** (`.python-version` = 3.11, `requires-python = ">=3.11,<3.12"`) | 3.12 이상 금지 — Stable-Makeup 환경이 3.10~3.11 의존성(torch 2.0.1, transformers 4.34)이라 맞춘다 |
| 패키지 관리 | **uv** | `uv sync`가 `.venv` 생성. pip 직접 사용 금지, `requirements.txt` 없음 — `pyproject.toml`이 유일한 목록 |
| 웹 프레임워크 | FastAPI ≥ 0.115, Pydantic v2, uvicorn | |
| 테스트 | pytest (+ httpx TestClient) | `uv run pytest` |
| 린트·포맷 | **ruff** (`E F I B UP`, 줄 110자) | `uv run ruff check . && uv run ruff format .` 커밋 전 필수 |
| Node | 22 LTS | 클라이언트 빌드·테스트 |
| TypeScript | 5.5+, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | `client/tsconfig.json`. `allowJs`는 POC 이전 기간에만 |
| 클라이언트 도구 | Vite 5, Vitest 2, ESLint 9 + typescript-eslint | `npm run typecheck && npm test && npm run lint` 커밋 전 필수 |
| GPU 워커 환경 | conda, `poc/screen2` `server-bench/README.md` 절차 | 의존성이 서로 충돌해 **별도 conda 환경**. FastAPI 프로세스와 워커 프로세스는 분리(큐로 통신) |
| 데이터·모델 파일 | 저장소 밖 `DHE_DATA_DIR` | git에는 `manifest.json`·해시·라이선스만 |

## 3. 다른 언어를 섞는 절차

1. **Python으로 안 되는 이유**를 한 줄로 적는다(브라우저 실행, GPU 셰이더, 성능 실측치).
2. 그 코드는 **자기 폴더**에 두고(예: `client/`, `client/shaders/`), Python 쪽과는 **파일·HTTP·subprocess** 셋 중 하나로만 만난다. 서로 import하지 않는다.
3. 계약(`work-split-modules-v6.md` §2)은 양쪽이 같은 모양으로 둔다. Python은 Pydantic(`server/app/schemas.py`), TS는 `client/src/core/types.ts`. 필드가 바뀌면 같은 PR. (나중에 Pydantic → JSON Schema → TS 타입 자동 생성으로 묶을 수 있다.)
4. 그 언어의 테스트·린트 명령을 `README`에 한 줄 추가한다.
5. 이 문서 §1 표에 한 줄 추가한다.

같은 계산을 두 언어로 유지해야 한다면(예: 합성 생성기 `core.js`/`core.py`) **parity 테스트**(같은 시드 → 같은 출력)를 둔다. 지금 채점기는 TS 한 벌만 두고 Node로 부르는 쪽을 택했다.

## 4. 저장소 폴더

```
support-yr-makeup/
  pyproject.toml            # Python 전체 의존성 (server / eval / train / dev 그룹)
  .python-version           # 3.11
  server/                   # 모듈 ④ — FastAPI
    app/
      main.py               # 엔드포인트: /health, /sessions/{sid}/jobs, /jobs/{id}, /jobs/{id}/promote
      schemas.py            # LookJob·JobBatch·Health (계약)
      jobs.py               # 큐·워커 인터페이스(스텁 워커 포함), 우선순위, TTL, 삭제
      config.py             # 설정·버전 5종 (환경 변수 DHE_*)
    tests/test_api.py       # 흐름·계약·삭제 원칙 스모크 5개
  eval/                     # 모듈 ⑤ 틀 — ai-pipeline-v6.md 2절
    README.md
    common.py               # 골든 세트 읽기, 결과 파일명 규칙(날짜_커밋_이름_모델_골든.csv)
    golden/manifest.json    # 골든 세트 목록 (사진은 저장소 밖)
    score/run.py            # E-1·E-7 (Node로 채점기 호출)
    run_all.py  report.py   # 전부 실행 → docs/eval-results-v6.md 자동 생성
    results/                # CSV (커밋)
    test_harness.py
  docs/eval-results-v6.md   # 자동 생성. 손으로 안 고침 ("실험 노트" 절만 사람이)
  poc/                      # 화면별 POC (통합 후 client/로 옮기고 poc는 동결)
  client/                   # 모듈 ①②③⑥ — TypeScript, Vite
    package.json tsconfig.json vite.config.ts eslint.config.js
    src/core/types.ts       # 모듈 계약 (schemas.py 와 짝)
    src/core/log.ts         # 공통 log() (금지 필드 차단)
    src/screens/ (예정)     # 화면·상태 기계·카메라·저장
    tests/log.test.ts       # vitest 3개
  rules/ (예정)             # score.json · looks.json (버전 필드 포함) — JS·Python이 같이 읽음
  train/ (예정)             # 얼굴형 분류기 학습 (configs/*.json + 시드)
```

## 5. 세팅 (처음 한 번)

```bash
# 1. Python 3.11 확인 (없으면 uv가 받아 준다)
python --version            # 3.11.x
# 2. 가상환경 + 의존성
uv sync --extra dev         # 개발 도구까지. 평가까지 하려면 --extra dev --extra eval
# 3. 검사
uv run ruff check . && uv run pytest
# 4. 서버 (스텁 워커)
uv run uvicorn server.app.main:app --reload --port 8000
#    → http://localhost:8000/docs 에서 /health, /sessions/{sid}/jobs 시험
# 5. 평가 하네스 (골든 세트 비어 있으면 skipped 로 표만 만든다)
uv run python eval/run_all.py
# 6. 클라이언트 (TypeScript)
cd client && npm install
npm run typecheck && npm test && npm run lint
npm run dev                  # http://localhost:5173 (카메라는 localhost/https)
# 7. 화면별 POC (동결, 참고용)
python -m http.server 8000   # 저장소 루트 → http://localhost:8000/poc/full/
cd poc/full && node tests.mjs
```

환경 변수(선택): `DHE_DATA_DIR`(사진·모델 폴더), `DHE_UPLOAD_DIR`(업로드 임시 폴더, 운영은 tmpfs), `DHE_VER_*`(버전 5종), `DHE_IDENTITY_MIN_COS`, `DHE_QUEUE_WARN_SEC`, `DHE_JOB_TTL_SEC`.

## 6. 코드 규칙 (짧게)

- **계약 먼저.** 모듈 경계 데이터는 `schemas.py`(Python)·`client/src/core/types.ts`(TS)에 먼저 적고 코드를 쓴다.
- **POC → TS 이전.** `poc/full/lib/*.js`(비율 단위 정본)를 `client/src/core/*.ts`로 파일 단위로 옮기고 `tests.mjs` 케이스를 vitest로 같이 옮긴다. 이전 기간에만 `allowJs`. 옮긴 파일부터 `poc/`는 동결.
- **순수 함수와 I/O를 나눈다.** 채점·합산·가이드·큐 우선순위는 입력→출력 함수. 카메라·파일·네트워크는 바깥에서.
- **로그는 `log()`/`logging` 하나로, 숫자 요약만.** 사진·랜드마크 좌표·파일명은 로그에 안 남긴다(`jobs.py`가 예시).
- **버전은 코드가 아니라 설정에.** `config.py Versions`, `rules/*.json`의 `version`. 응답·로그·결과 카드에 같이 찍힌다.
- **테스트 없는 PR 없음.** Python은 pytest, TS는 vitest. 골든 세트가 생기면 채점 변경은 `eval/score/run.py`까지.
- **가정값은 `PARAMS`/`rules/*.json` 한 곳.** 코드 여기저기 숫자를 박지 않는다.
- **커밋 메시지 한국어**, 첫 줄에 무엇이 어떻게 나아졌는지. 브랜치는 모듈 이름(`server/queue`, `eval/score`, `client/gate`).

## 7. 서버 뼈대가 이미 하는 것 / 아직 안 하는 것

| 하는 것 | 안 하는 것 (다음 작업) |
| --- | --- |
| 사진 1장 + 룩 N개 → 작업 N개, 사용자가 고른 룩 우선 | Stable-Makeup 워커 연결 (`jobs.py` `Worker` 자리에 conda 환경 워커를 프로세스로 분리해 꽂기) |
| 폴링, 대기 20초 넘으면 `waiting_long` | Redis + RQ (지금은 프로세스 안 큐) |
| 정체성 코사인 < 0.6이면 `fallback` (결과 폐기) | ArcFace 실제 계산 |
| 룩 하나 실패해도 나머지 계속, `error` | 화장 레이어 추출 → `layer` 채우기 |
| 마지막 작업 후 원본 즉시 삭제, TTL 정리 함수 | 결과 이미지 저장소·정적 서빙, 크론, nginx tmpfs |
| 로그에 작업 ID·시간·상태만 | 서버 지표 집계 스크립트 (p50/p95·실패율·닮음 분포) |
| 버전 5종을 `/health`·모든 `LookJob.ver`에 | — |

이 표의 오른쪽이 모듈 ④의 2주차 목록이다.
