# 당화응 (support-yr-makeup)

**새로운 화장을 배우고 싶은 사람을 위한, 한 부위씩 잡아주는 화장 코치.**

운동 코치가 동작 하나씩 잡아주듯, 오늘의 내 맨얼굴을 기준으로 룩을 얹어 보고 고른 뒤 눈썹 → 아이라이너 → 섀도우 → 입술 → 볼터치 → 쉐딩·하이라이트 순으로 "완성본 → 그릴 자리 테두리 → 거울에서 화장 → 확인받기 → 점수·한 줄 평"을 반복합니다. 가상으로 입혀 보는 데서 끝나지 않고, 실제 화장을 한 부위씩 제대로 하게 만드는 것이 목표입니다.

> 부트캠프 파이널 프로젝트 · 6인 · 2026-10-20 마감 · 플랫폼은 지금은 모바일 웹, 안드로이드 앱은 이후

## 어떻게 동작하나

```
1 맨얼굴 촬영 4장 (정면 눈 뜸·눈 감음, 좌·우 45°, 자동 촬영)
2 룩 얹어보기 (룩 10개, 카메라 속 내 얼굴에 실시간 트래킹, 쓰이는 제품 목록)
2-b 전체 완성 예상 한 장 → 시작
3 부위 완성본 (완성 예상을 그 부위로 줌, 근거 한 줄, 필요한 제품)
4 실시간 테두리 (라이브 화면 전체에 그릴 자리가 얼굴을 따라 뜸, 구석의 "확인받기") → 거울에서 화장
5 부위 결과 (점수 + 가이드 테두리 겹침 + 한 줄 평) → 다음 / 건너뛰기
   … 부위마다 반복, 진행 칩으로 어느 단계든 이동 …
6 전체 리뷰 (부위별 점수·합산, 쌩얼 vs 내 화장) → 결과 저장(선택) → 끝내기(세션 삭제)
```

### 지키는 원칙

- **채점은 사용자가 "확인받기"를 눌렀을 때만.** 가이드만 보러 왔을 때 점수가 남지 않습니다.
- **화면에는 점수와 한 줄 평만.** mm·각도 같은 숫자는 내부 계산에만 씁니다. 못 재는 항목은 점수 없이 "확인만".
- **룩은 그대로.** 얼굴형 개인화는 쉐딩·하이라이트 위치에만 적용합니다.
- **사진은 기기 안에서.** 서버는 얹어보기 생성과 쉐딩 위치 산출에만 정면·좌·우 3장을 쓰고 원본은 즉시 삭제, 세션이 끝나면 결과도 지웁니다. 서버 처리에 동의해야 사용할 수 있습니다.

## 기술 구성

| 어디서 | 무엇을 | 모델 (AI 분야 · 역할) |
|---|---|---|
| 클라이언트 (모바일 웹) | 촬영·추적·품질 게이트, 실시간 테두리, 규칙 채점, 얹어보기 합성 | CV 얼굴 랜드마크 검출(468점+홍채), CV 손 검출, **자체 학습** CV 화장 영역 시맨틱 분할 |
| GPU 서버 (자체) | 룩 생성, 쉐딩 위치용 굴곡 맵, 부위 마스크 | 생성 AI 확산 기반 화장 전이, CV 단안 표면 법선 추정, CV 얼굴 파싱 |
| 학습·규칙 | 합성 데이터로 분할 모델 학습, 룩 템플릿·얼굴형 쉐딩 규칙 | FFHQ-Makeup·MT·BeautyFace 등 공개 데이터 + 실제 라벨(평가 전용) |

채점은 맨얼굴 대비 Lab 색 차이(ΔE)와 랜드마크 기준 mm 척도(홍채 지름 11.7mm)로 계산하는 규칙 엔진입니다. 채점·가이드는 폰에서 돌고, 서버는 세션 시작 때 한 번 씁니다.

## 저장소 구성

```
docs/   서비스 정의, 기능 정의서, 화면 브리프, 구현 요소 정의, 데이터셋 목록, 다이어그램 4장
poc/    브라우저 POC — 화면별 POC는 브랜치로 분리 (`poc/screen2`~`poc/screen6`), 전체 흐름 POC는 `poc/full/`. 통합 후 동결(참고용)
server/ 서버 API (FastAPI, Python 3.11) — 큐·워커 인터페이스·삭제 정책. 스텁 워커로 흐름이 돈다
eval/   평가 하네스 — 골든 세트·한 명령 재평가·결과표 자동 생성 (docs/eval-results-v6.md)
client/ 모바일 웹 클라이언트 (TypeScript, Vite) — 모듈 계약 타입·공통 log(). POC lib 를 여기로 옮긴다
danghaeung_poc_3x4_20/  촬영 세트 샘플 20장 (5명 × 정면 눈 뜸·감음·좌45·우45, 셀카 3:4 1080×1440, Real-ESRGAN 4배 초해상도) + 원본 시트
```

일정·스프린트는 [`docs/sprints-v6.md`](docs/sprints-v6.md), 모듈별 할 일은 [`docs/tasks-by-module-v6.md`](docs/tasks-by-module-v6.md). 작업 항목은 GitHub 이슈·마일스톤에 들어가 있다.

문서 색인과 확정 사항은 [`docs/README.md`](docs/README.md)에서 시작하세요. 화면별 결정 이력은 [`docs/service-definition-v6.md`](docs/service-definition-v6.md) 부록에 있습니다.

## 개발 환경 (기본 언어 Python 3.11 + FastAPI)

서버·평가·학습·집계는 Python, 폰 브라우저에서 도는 것은 TypeScript. 규칙은 [`docs/dev-stack-v6.md`](docs/dev-stack-v6.md).

```bash
bash scripts/setup.sh                     # 처음 한 번: uv sync --frozen + npm ci + 검사 전부 (Windows는 Git Bash)
bash scripts/check.sh                     # 커밋 전: ruff·pytest·tsc·vitest·eslint (CI 와 동일)

uv run uvicorn server.app.main:app --reload --port 8000   # 서버 (스텁 워커) → http://localhost:8000/docs
cd client && npm run dev                  # 클라이언트 (TypeScript, Vite) → http://localhost:5173
uv run python eval/run_all.py             # 평가 하네스 → docs/eval-results-v6.md
```

기준선은 `main`. 모듈 브랜치 6개(`capture` `guide` `score` `server` `model` `app`)에서 작업하고 작은 단위로 자주 `main`에 PR, CI가 초록이어야 합친다. 잠금 파일(`uv.lock`, `client/package-lock.json`)은 커밋한다.

## POC 실행

```bash
# 아이라이너·볼터치 채점 POC (카메라 또는 사진 2장)
cd poc && python -m http.server 8000      # → http://localhost:8000  (저장소 루트 기준)

# 화면 6 전체 리뷰 POC + 자동 검증 24개 → 브랜치 poc/screen6
git checkout poc/screen6 && cd poc/screen6 && node tests.mjs
python -m http.server 8000                # → http://localhost:8000
```

랜드마크 검출은 브라우저에서 MediaPipe를 CDN으로 받아 돌리므로 인터넷이 필요합니다. 카메라 모드는 HTTPS 또는 localhost에서만 열립니다.

## 다이어그램

| | |
|---|---|
| 처리 흐름 (기술판) | `docs/processing-flow-v6.png` |
| 처리 흐름 (쉬운 설명판) | `docs/processing-flow-eli5-v6.png` |
| 시스템 아키텍처 | `docs/system-architecture-v6.png` |
| 사용자 플로우차트 | `docs/flowchart-v6.png` |

## 상태

- 화면 1~6 기능·목업 브리프 확정 (2026-09-16). 화면 6 POC v6 완료 (2026-09-16). 남은 일: 화면 1~5 구현 방법·검증 문서(보류)
- 라이선스: MIT (`LICENSE`). 사용하는 공개 데이터셋·모델 중 비상업 라이선스(FFHQ-Makeup, 법선 추정 모델 등)는 연구·발표 용도로만 씁니다.
