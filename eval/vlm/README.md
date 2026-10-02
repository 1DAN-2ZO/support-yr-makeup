# eval/vlm — 개인화 VLM 선정 실험

조사 보고서(`docs/research/vlm-2026-09-29/보고서.md`)의 실험 계획을 그대로 돌리는 코드. **학원 PC(RTX 3060 12GB)에서 돌린다** — GPU 가 다르면 속도·메모리 숫자가 달라서 비교가 안 된다.

앱과 다른 것을 재지 않게 **측정·프롬프트·관문·화장 템플릿·렌더러는 앱 코드를 그대로 쓴다** (`entry.ts` 가 `client/src/core` 를 불러오고 `vlm_core.mjs` 가 esbuild 로 묶는다). 새로 만든 것은 실험 조건(입력 형식 B~F, 제약 디코딩 스키마, 측정값 뒤집기, 대조군)뿐이다.

**정리 문서 (2026-10-02, 보류 — VLM 역할이 바뀔 수 있음)**: `docs/reports/vlm-personalization-retrospective.md` — 한 것 · 결과 · 된 것과 안 된 것 · 다시 한다면.

**2026-09-30 결과**: 후보 5개 1차 선별 → Gemma 4 E4B · Qwen3.5-9B 2차 → **잠정 Gemma 4 E4B + 형식 E**. 숫자는 `eval/results/2026-09-30_vlm_compare-{sel,fin}.csv`. 사람 평가(5·6단계)는 새 화장 템플릿이 나온 뒤에 한다.

## 준비 (학원 PC, 한 번)

1. **저장소** — `git pull`, `npm --prefix client ci`, `uv sync --extra vlm --extra dev`
2. **llama.cpp** — [릴리스](https://github.com/ggml-org/llama.cpp/releases)에서 Windows CUDA 12 빌드를 받아 풀기 (예: `C:/llama.cpp/llama-server.exe`)
3. **모델** — `models.example.json` 의 `_출처` 를 보고 GGUF(Q4_K_M) 와 mmproj 를 저장소 밖(예: `D:/models`)에 받기. **"확인 필요" 표시는 조사로 위치를 확인 못 한 것** — 받을 때 공식 저장소인지 확인
4. **설정** — `models.example.json` 을 `models.json` 으로 복사해 경로 채우기 (커밋 안 됨)
5. **사진** — 환경 변수 `DHE_DATA_DIR` (예: `D:/dhe-data`). 사진은 `$DHE_DATA_DIR/vlm-eval/photos/` 에 **팀원 동의 받은 맨얼굴 정면 20~30장**. 무쌍·속쌍·겉쌍, 눈꼬리 올라감·내려감, 입술 비율이 고르게, 눈꼬리 0° 근처 3~5장, 같은 사람 다른 날 몇 쌍. **저장소에 넣지 않는다**

## 실행

```bash
# 1) 사진 → 얼굴 점 → 측정값 (앱과 같은 measureFace)
uv run --extra vlm python eval/vlm/landmarks.py

# 2) 모델마다 — 먼저 요청 수·예상 시간 보기
uv run --extra vlm python eval/vlm/run.py --model qwen3vl8b --dry-run
uv run --extra vlm python eval/vlm/run.py --model qwen3vl8b --stages 0          # 구동 확인만 먼저
uv run --extra vlm python eval/vlm/run.py --model qwen3vl8b --stages 1,2,3,4

# 3) 요약 (0~4단계)
uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b

# 4) 선정 — 모델 여럿을 같은 조건으로 (형식 E·F, 다른 사람 사진 대조군) 돌리고 비교표
uv run --extra vlm python eval/vlm/run.py --model <모델> --stages 0,2,3,4 --variant E,F \
  --conds E,F,E.swap,F.swap --reps 1 --reps-det 2 --perturb-reps 1 --max-tokens 500
uv run --extra vlm python eval/vlm/report.py --compare <모델1> <모델2> ...

# 5) 5·6단계 사람 평가 — 평가지 두 개 (HTML 파일, 인터넷 필요 없음)
uv run --extra vlm python eval/vlm/report.py --model <모델> --sheet --sheet-variant E
uv run --extra vlm python eval/vlm/report.py --ratings rating-*.json why-*.json
```

- 0단계에서 이미지가 안 들어가거나 깨진 출력이 나오는 모델은 그다음 단계를 돌리지 않는다
- 1단계 결과로 `--res`(512/768)와 `--max-tokens` 를 정하고 2~4단계에 넘긴다
- 시간이 모자라면 `--photos 15 --looks daily --conds E,E.swap,E.bright` 로 먼저 거른다 (1차 선별, 모델당 약 115건)
- **생각 모드가 있는 모델(Gemma 4 · MiniCPM-V 4.5 · Qwen3.5)은 `models.json` 에 `"request_extra": {"chat_template_kwargs": {"enable_thinking": false}}`** — 켜 두면 답이 전부 생각 칸으로 가서 본문이 빈다. 응답 기록의 `reasoning_chars` 로 확인
- 2단계 조건 표기: 형식 글자, 꼬리 `u` = 제약 끔, `.swap` = 같은 글에 다른 사람 사진(후보 풀 `$DHE_DATA_DIR/pool/vlm-eval`, 바꾸려면 `DHE_SWAP_POOL`), `.blank` = 회색 빈 사진, `.bright`·`.crop` = 같은 사진 조금 바꿈

## 프롬프트 형식

| 형식 | 무엇 |
|---|---|
| A | 앱 프롬프트 그대로 (`client/src/core/vlm-prompt.ts`) |
| B · C · D | 측정값 칸만 바꿈 — 말만 · 숫자만 · 없음 |
| E | 예시 JSON·예시 문장 없음 · 관찰 → 근거 → 결정 순서 · 숫자는 0.1 단위 선택지(llama.cpp 는 소수 min/max 를 강제하지 않는다) · 관문이 거절할 값은 얼굴마다 선택지에서 뺌 · 규칙 출발점 |
| F | E 에서 규칙 출발점만 뺌 |

## 사람 평가지

- **화장 비교(6단계)** `sheet-<모델>.html` — 사진마다 규칙 계획과 VLM 계획을 **앱 렌더러(`paintMakeup` · `MakeupGl`)로 평가자 브라우저에서 그려** A·B 로 보여 주고 A · 비슷함 · B 하나만 고른다. 누가 VLM 인지는 정답표 `sheet-<모델>.key.json` 에만 있다 (평가자에게 주지 않는다. 페이지 안 계획에서도 `source` 칸을 지운다)
- **근거 문장(5단계)** `why-<모델>.html` — VLM 근거 문장만, 자연스러움 1~5 · 지어냄. 한두 명이면 된다
- 렌더러 묶기는 `sheet_bundle.mjs`(esbuild) · 그리는 코드는 `render_sheet.ts`

## 단계와 통과 기준 (보고서 표)

| 단계 | 무엇 | 통과 |
|---|---|---|
| 0 구동 | 연속 이미지 요청 100회 | 깨진 출력 0 |
| 1 속도 | 512/768 · 출력 150/300 · prompt 캐시 켬/끔 | 기준 아님 — 비교 항목 (기획 예산 5초는 참고로 표시. 상한은 팀이 정한다) |
| 2 형식 | 형식 A~F × 제약 디코딩 · 대조군. 관문은 결정 값·근거 문장으로 나눠 보고, 값 쏠림·근거-값 불일치·사진 근거 간격도 센다 | 스키마 100%, 관문 ≥ 95% |
| 3 결정론 | 같은 입력 반복 + 서버 재시작 전후 + 밝기·자르기 조금 | 필드 일치 ≥ 90% |
| 4 뒤집기 | 눈꼬리 처짐·눈두덩·윗입술 하나씩 | 규칙과 같은 방향 ≥ 90% |
| 5 한국어 | 평가지 — 자연스러움, 지어냄 표시 | 평균 ≥ 4, 지어냄 0 |
| 6 선호 | 평가지 — VLM 계획 대 규칙 계획 (누가 누군지 모르게) | 승률 > 50% |

기준은 공개 표준이 아니라 첫 실험용이다. 결과를 보고 조정한다. 시간은 2단계 표에도 조건별 p50/p95 로 나란히 적어 품질과 함께 비교한다 (2026-09-29 — 5초 통과 기준을 뺐다).

## 어디에 무엇이 남나

| 무엇 | 어디 | 커밋 |
|---|---|---|
| 사진·얼굴 점·측정값 | `$DHE_DATA_DIR/vlm-eval/photos`, `work` | ✗ |
| 응답 원본 | `$DHE_DATA_DIR/vlm-eval/runs/<모델>/stage<N>.jsonl` (사진은 해시 id 로만) | ✗ |
| 요약·평가지 | `$DHE_DATA_DIR/vlm-eval/out/` (평가지에 사진이 들어 있다) | ✗ |
| 숫자 요약 | `eval/results/<날짜>_vlm_<모델>.csv` · 비교표 `_vlm_compare-<앞머리>.csv` (시험은 `DHE_RESULTS_DIR` 로 다른 곳에) | ○ |

## 이 PC 에서 코드만 확인 (GPU 필요 없음)

```bash
uv run --extra vlm --extra dev pytest eval/vlm
```

가짜 llama-server(`fake_server.py`)로 실행기 → 관문 → 요약 → 대조군 → 비교표 → 평가지 → 집계까지 한 번 돈다. 지표 계산은 `metrics.py`. 평가지의 화장 그림은 브라우저가 필요해 시험에서는 데이터·가림만 본다.
