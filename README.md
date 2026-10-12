# nudy (support-yr-makeup) — 전 이름 당화응

**새로운 화장을 배우고 싶은 사람을 위한 화장 코치.** 따라 하고 싶은 화장 사진 한 장을 올리면, 그 화장을 내 맨얼굴에 옮긴 그림(예상 메이크업)을 만들어 부위별로 어디에 얼마나 그릴지 보여 주고, 다 하고 찍은 사진을 그 그림과 견줘 어느 부분이 어떻게 됐는지 알려 줍니다. 가상으로 입혀 보는 데서 끝나지 않고, 실제로 그 화장을 내 얼굴에 해 보게 하는 것이 목표입니다.

> 부트캠프 파이널 프로젝트 · 6인 · 2026-10-20 마감 · 모바일 웹 · 배포 주소 https://nudy.shelldocs.cloud
>
> 2026-10-06 에 흐름이 바뀌었습니다. 바뀌기 전 흐름(4장 촬영 · 화장 10종 · AR · 부위별 점수)의 문서는 [`docs/archive/`](docs/archive/README.md) 에 있습니다.

## 어떻게 동작하나

```
동의 (사진 처리 안내)
1 맨얼굴 촬영      정면 눈 뜬 사진 한 장 — 조건이 맞으면 자동으로 찍힘
2 참고 사진 올리기  따라 하고 싶은 화장 사진 (본인이 아니어도 됨)
3 예상 메이크업     참고 사진의 화장을 내 맨얼굴에 옮긴 그림 (문서 · 코드에서는 "정답사진")
4 부위별 가이드     그 그림을 부위로 잘라 점 · 선으로 그릴 자리를 보여 줌 → 거울에서 화장
                   (원하면 "실시간 가이드로 보기" — 같은 점 · 선을 카메라 속 내 얼굴 위에)
                   눈썹 → 아이라이너 → 섀도우 → 입술 → 볼터치
5 시도사진         화장을 다 한 뒤 한 번 더 촬영
6 피드백           예상 메이크업과 견줘 부위별로 어떻게 됐는지 문장으로 (점수 없음)
7 저장 · 공유       결과 한 장을 내 폰에 → 끝내기 (폰 안의 사진 삭제)
```

그림: [`docs/flowchart-new-flow.svg`](docs/flowchart-new-flow.svg). 자세한 정의는 [`docs/service-definition-v6.md`](docs/service-definition-v6.md).

### 지키는 원칙

- **점수는 없다.** 부위별로 어느 부분이 어떻게 됐는지 말로 알려 줍니다. 못 재는 것은 지어내지 않고 "이번에는 볼 수 없었어요".
- **화장만 옮긴다.** 예상 메이크업은 눈두덩 · 볼 · 입술만 다시 그려 원본에 되붙입니다. 얼굴 모양은 바꾸지 않습니다.
- **다른 사람 사진은 바로 지운다.** 참고 사진은 예상 메이크업을 만든 뒤 지우고, 어디에도 보관하지 않습니다.
- **사진은 내 폰에.** 서버로 가는 것은 그림을 만들 때뿐입니다. 다만 **테스트 기간에는** 참고 사진을 뺀 사진과 피드백 결과를 서버에 보관합니다 (판정 기준을 맞추는 데만 씀 · 동의해야 사용 · 후기 설문으로 요청하면 삭제). 테스트 기간은 2026-10-19 오후 3시까지이고, 보관한 사진과 사용 기록은 같은 날 오후 5시에 모두 지웁니다. 서비스 정의서 §10.

## 기술 구성

| 어디서 | 무엇을 | 무엇으로 |
|---|---|---|
| 폰 브라우저 (`client/`) | 촬영 조건 판정 · 참고 사진 검사 · 부위 가이드 떠내기 · 피드백 계산 · 저장 | TypeScript + Vite, MediaPipe 얼굴 랜드마크(468점), 규칙 기반 색 비교(Lab) |
| 백엔드 (`server/`) | 그림 만들기 중계 `/transfer` · 사용 기록 `/events` · 테스트 기간 보관 `/keep` | Python 3.11 + FastAPI, Docker |
| GPU PC | 예상 메이크업 · 옮긴 그림 만들기 | FLUX.2 klein 4B(Apache-2.0)로 칠할 영역만 다시 그리기, RTX 3060 12GB (`poc/look-tryon/server-bench/app_klein.py`) |

피드백은 폰에서 돕니다: 예상 메이크업과 시도사진을 각각 맨얼굴과 견줘 부위별 색 변화를 재고, 그 둘을 비교합니다. 라이너는 시도사진의 화장을 같은 방법으로 맨얼굴에 옮긴 그림에서 꼬리를 잽니다 ([`docs/feedback-input-contract.md`](docs/feedback-input-contract.md)).

배포: `main` 에 올리면 GitHub Actions 가 백엔드 PC(프론트 · 백 컨테이너)와 GPU PC 에 자동으로 배포합니다 (`.github/workflows/`). 바깥 길은 Cloudflare 를 거칩니다.

## 저장소 구성

```
client/   모바일 웹 앱 (TypeScript, Vite) — src/core 계산 · src/screens 화면 · tests
server/   백엔드 API (FastAPI) — /transfer · /events · /keep
eval/     평가 하네스 · 사용 기록 집계(eval/funnel)
poc/      실험 — 그림 서버(poc/look-tryon/server-bench) · 촬영 세트 샘플(poc/samples) · 옛 화면별 POC
docs/     문서 — 색인은 docs/README.md, 옛 흐름 문서는 docs/archive/
scripts/  세팅 · 검사(check.sh) · 인증서
```

문서는 [`docs/README.md`](docs/README.md) 에서 시작하세요. 작업 항목은 GitHub 이슈에 있습니다.

## 개발 환경 (기본 언어 Python 3.11 + FastAPI)

서버·평가·학습·집계는 Python, 폰 브라우저에서 도는 것은 TypeScript. 규칙은 [`docs/dev-stack-v6.md`](docs/dev-stack-v6.md).

```bash
bash scripts/setup.sh                     # 처음 한 번: uv sync --frozen + npm ci + 검사 전부 (Windows는 Git Bash)
bash scripts/check.sh                     # 커밋 전: ruff·pytest·tsc·vitest·eslint (CI 와 동일)

uv run uvicorn server.app.main:app --reload --port 8000   # 서버 → http://localhost:8000/docs (그림 만들기는 DHE_FLUX_URL 이 있어야 켜짐)
cd client && npm run dev                  # 클라이언트 (TypeScript, Vite) → http://localhost:5173
uv run python eval/run_all.py             # 평가 하네스 → docs/eval-results-v6.md
```

기준선은 `main`. **작업은 자기 모듈 브랜치**(`capture` `guide` `score` `server` `model` `app`)에서 하고, **준비되면 PR 을 올리고 리뷰를 요청**한다. ⑥ 이 가능할 때 브랜치를 **로컬 main 에 받아 `bash scripts/check.sh` 로 실제로 돌려 본 뒤** 밀어 올린다. main 에 푸시하는 사람은 ⑥ 뿐이다. 내 브랜치가 뒤처지면 내가 `git merge origin/main` 으로 따라간다.

머지는 병합 커밋이라 내 브랜치가 갈라지지 않는다 — `git pull` 이 그냥 붙는다. 2026-09-21 이전 squash 머지로 이미 갈라진 브랜치만 `git merge origin/main --no-edit` 으로 한 번 정리한다. `rebase` 나 `reset --hard` 는 쓰지 않는다.

**남이 쓸 수 있는 브랜치에 `push --force` 를 쓰지 않는다.** 2026-09-18 에 모듈 브랜치를 강제 푸시로 main 에 맞추다가 팀원 커밋 두 건이 사라졌다. `bash scripts/setup.sh` 가 이를 막는 git 훅을 깔아 준다. 규칙은 [`docs/work-split-modules-v6.md`](docs/work-split-modules-v6.md) §0-1.

## POC 실행 (옛 흐름의 실험 — 참고용)

```bash
# 아이라이너·볼터치 채점 POC (카메라 또는 사진 2장)
cd poc && python -m http.server 8000      # → http://localhost:8000  (저장소 루트 기준)

# 화면 6 전체 리뷰 POC + 자동 검증 24개 → 브랜치 poc/screen6
git checkout poc/screen6 && cd poc/screen6 && node tests.mjs
python -m http.server 8000                # → http://localhost:8000

# 합성 학습 데이터 생성기 POC + 자동 검증 27개
cd poc/synth && node tests.mjs            # (저장소 루트 기준)
cd .. && python -m http.server 8000       # 샘플 사진을 쓰므로 poc/ 에서 띄운다
                                          # → http://localhost:8000/synth/
```

랜드마크 검출은 브라우저에서 MediaPipe를 CDN으로 받아 돌리므로 인터넷이 필요합니다. 카메라 모드는 HTTPS 또는 localhost에서만 열립니다.

## 다이어그램

| | |
|---|---|
| **사용자 흐름 (2026-10-06 ~)** | `docs/flowchart-new-flow.svg` (그림 파일 `.png`) |
| 옛 흐름의 그림 네 장 | `docs/archive/` — 사용자 흐름 · 처리 흐름(기술판 · 쉬운 설명판) · 시스템 아키텍처 |

## 상태 (2026-10-11)

- 새 흐름이 처음부터 끝까지 이어져 배포돼 있습니다 (동의 → 촬영 → 예상 메이크업 → 부위 가이드 → 시도사진 → 피드백 → 저장)
- 테스트 기간 (2026-10-19 오후 3시까지) — 사용 기록과 사진(참고 사진 제외)을 모아 판정 기준을 맞추는 중. 둘 다 10-19 오후 5시에 모두 지움
- 라이선스: MIT (`LICENSE`). 사용하는 공개 데이터셋 · 모델 중 비상업 라이선스인 것은 연구 · 발표 용도로만 씁니다
