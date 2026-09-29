# eval/vlm — 개인화 VLM 선정 실험

조사 보고서(`docs/research/vlm-2026-09-29/보고서.md`)의 실험 계획을 그대로 돌리는 코드. **학원 PC(RTX 3060 12GB)에서 돌린다** — GPU 가 다르면 속도·메모리 숫자가 달라서 비교가 안 된다.

앱과 다른 것을 재지 않게 **측정·프롬프트·관문·화장 템플릿은 앱 코드를 그대로 쓴다** (`entry.ts` 가 `client/src/core` 를 불러오고 `vlm_core.mjs` 가 esbuild 로 묶는다). 새로 만든 것은 실험 조건(입력 형식 B·C·D, 제약 디코딩 스키마, 측정값 뒤집기)뿐이다.

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

# 4) 5·6단계 사람 평가 — 평가지를 만들어 평가자 3명 이상에게 (HTML 파일 하나, 인터넷 필요 없음)
uv run --extra vlm python eval/vlm/report.py --model qwen3vl8b --sheet
uv run --extra vlm python eval/vlm/report.py --ratings rating-가.json rating-나.json rating-다.json
```

- 0단계에서 이미지가 안 들어가거나 깨진 출력이 나오는 모델은 그다음 단계를 돌리지 않는다
- 1단계 결과로 `--res`(512/768)와 `--max-tokens` 를 정하고 2~4단계에 넘긴다
- 시간이 모자라면 `--photos 10 --reps 3` 으로 줄여 먼저 훑는다

## 단계와 통과 기준 (보고서 표)

| 단계 | 무엇 | 통과 |
|---|---|---|
| 0 구동 | 연속 이미지 요청 100회 | 깨진 출력 0 |
| 1 속도 | 512/768 · 출력 150/300 · prompt 캐시 켬/끔 | 캐시 끔 p95 ≤ 5초 |
| 2 형식 | A 숫자+말(앱 그대로) · B 말만 · C 숫자만 · D 측정 없음 × 제약 디코딩 | 스키마 100%, 관문 ≥ 95% |
| 3 결정론 | 같은 입력 반복 + 서버 재시작 전후 + 밝기·자르기 조금 | 필드 일치 ≥ 90% |
| 4 뒤집기 | 눈꼬리 처짐·눈두덩·윗입술 하나씩 | 규칙과 같은 방향 ≥ 90% |
| 5 한국어 | 평가지 — 자연스러움, 지어냄 표시 | 평균 ≥ 4, 지어냄 0 |
| 6 선호 | 평가지 — VLM 계획 대 규칙 계획 (누가 누군지 모르게) | 승률 > 50% |

기준은 공개 표준이 아니라 첫 실험용이다. 결과를 보고 조정한다.

## 어디에 무엇이 남나

| 무엇 | 어디 | 커밋 |
|---|---|---|
| 사진·얼굴 점·측정값 | `$DHE_DATA_DIR/vlm-eval/photos`, `work` | ✗ |
| 응답 원본 | `$DHE_DATA_DIR/vlm-eval/runs/<모델>/stage<N>.jsonl` (사진은 해시 id 로만) | ✗ |
| 요약·평가지 | `$DHE_DATA_DIR/vlm-eval/out/` (평가지에 사진이 들어 있다) | ✗ |
| 숫자 요약 | `eval/results/<날짜>_vlm_<모델>.csv` | ○ |

## 이 PC 에서 코드만 확인 (GPU 필요 없음)

```bash
uv run --extra vlm --extra dev pytest eval/vlm
```

가짜 llama-server(`fake_server.py`)로 실행기 → 관문 → 요약 → 평가지까지 한 번 돈다. 지표 계산은 `metrics.py`.
