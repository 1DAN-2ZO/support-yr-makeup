# eval/comment — 화면 6 종합 코멘트는 LLM 이어야 하나 (#287)

VLM 개인화 보류(#286) 뒤, 텍스트 LLM 을 **화면 6(리뷰) 종합 코멘트** 자리로 옮기자는 제안의 확인 실험. 사진은 넘기지 않고 채점 결과만 글로 넘긴다.

**묻는 것**: 부위별 한 줄 평을 이어 붙인 것(A) · 규칙 요약(B)보다 LLM 코멘트(C)가 "다음에 화장할 때 무엇을 고칠지" 더 잘 알려 주나.
B 를 넣는 이유 — 간단한 규칙으로 같은 효과가 나면 LLM 자리가 아니다 (개인화가 무너진 이유와 같다).

| | 만드는 법 |
|---|---|
| A 이어 붙이기 | 지금 화면 6 — 부위마다 `review.ts` `reviewLine` 한 줄 |
| B 규칙 요약 | 가장 잘된 부위 하나 + 먼저 고칠 부위 하나와 할 일 + (좌우 균형 · 다음 부위 · 건너뛴 부위) — 두세 문장 |
| C LLM 코멘트 | 같은 채점 결과(상태 · 잘됨/보통/아쉬움 · 한 줄 평 · 좌우 차)를 글로 → `praise_part` · `fix_part` · `comment` (제약 디코딩) |

- **앱 코드를 그대로 쓴다** — 채점 타입(`PartResult` · `SessionSummary`) · 한 줄 평 · 문구표 · 합산. `comment.ts` 를 `core.mjs` 가 esbuild 로 묶는다
- B · C 는 **같은 길이 상한(100자)** — 첫 실행(150자)에서 C 가 B 의 두 배라 긴 쪽이 뽑힐 수 있었다
- C 는 **관문**을 지난다. 거절되면 앱은 B 를 보여 준다 (평가지도 그 문항은 A · B 만, C 대 B 계산에서 뺀다)

## 관문 (comment.ts `gateC`)

| 거절 | 왜 넣었나 |
|---|---|
| 길이 · 숫자 (화면 6 은 숫자 없이) | 화면 규칙 |
| 문장이 잘림 | 길이 상한에 걸려 "…권" 으로 끝남 (Gemma) |
| 영어 섞임 | "눈 liner" (Qwen3-14B) |
| 칭찬 부위가 잘된 부위가 아님 · 고칠 부위가 결과에 없음 · 고칠 부위를 글에서 말하지 않음 | 결과와 다른 말 |
| 잘된 부위를 고치라고 함 | 전부 잘된 세션에서 "적당해요" 부위를 "더 신경 쓰라" (Gemma) |
| 건너뛴 부위를 칭찬함 · 반대 방향 (진한데 더 진하게 등) | 지어낸 말 |

관문이 못 잡는 것: 오타("셔도우"), 결과에 없는 도구·방법("펜슬로 정리", "더 밝은 색으로 바꿔") — 사람 평가에서 본다.

## 실행

```bash
# LLM 코멘트 (모델 설정은 eval/vlm/models.json — gguf 만, mmproj 없음). 세션 30개 × 2번
uv run --extra vlm python eval/comment/generate.py --model text-gemma4_e4b
uv run --extra vlm python eval/comment/generate.py --model text-qwen3_14b

uv run --extra vlm python eval/comment/results.py                          # 자동 지표 (관문은 지금 코드로 다시 건다)
uv run --extra vlm python eval/comment/results.py --sheet text-gemma4_e4b   # 평가지 (사진 없음)
uv run --extra vlm python eval/comment/results.py --ratings comment-rating-*.json
```

## 가짜 세션 30개 (`makeSessions`, seed 고정)

전부 잘됨 5 · 한 부위만 크게 틀림 8 · 좌우 비대칭 5 · 확인만 섞임 6 · 건너뜀 섞임 3 · 여럿 아쉬움 3. 진단 코드는 `score.ts` 코드표에서만 고른다.

## 자동 지표 (2026-10-02, 학원 PC RTX 3060, temperature 0)

| 모델 | 관문 통과 | 같은 입력 같은 답 | p50 | p95 | 글 길이 | 거절 이유 |
|---|---|---|---|---|---|---|
| **Gemma 4 E4B** (사진 없이) | 48/60 (80%) | 30/30 | 1.5초 | 1.8초 | 77자 | 잘된 부위를 고치라고 함 12 · 잘림 2 |
| Qwen3-14B (공식 Q4_K_M) | 54/60 (90%) | 30/30 | 2.3초 | 3.0초 | 44자 | 영어 섞임 4 · 고칠 부위 안 말함 2 |
| (B 규칙 요약) | — | — | — | — | 57자 | — |

**평가지 C 는 Gemma** — 글이 자연스럽고 빠르며 지금 서버 모델과 같다. Qwen3-14B 는 관문 통과율은 높지만 관문이 못 잡는 오타 · 영어 · 지어낸 방법이 많았다.
Gemma 의 거절은 대부분 "전부 잘됨" 세션(5개 모두)에서 나왔다 — "적당해요" 를 부족하다는 뜻으로 읽는다. 그 세션은 B 로 대신.

## 사람 평가 · 통과 기준 (미리 정함)

- 평가지 `$DHE_DATA_DIR/comment-eval/out/comment-text-gemma4_e4b.html` — 문항마다 채점 결과(막대) + 코멘트 두세 개, 하나만 고름. **평가자마다 문항 순서와 글 자리를 섞는다** (seed 를 브라우저에 저장, 결과 파일에 기록). 누가 어느 글인지는 `.key.json` 에만
- **평가자 3명 이상**
- **C 를 B 보다 고른 비율의 95% 신뢰구간(Wilson) 하한 > 50% 이면 LLM 을 넣는다.** 못 넘으면 B 를 넣고 LLM 은 MVP 에서 뺀다
- 같이 보는 것: 세션 종류별 고른 수, 자리 쏠림(보인 순서 1·2·3번)

## 어디에 무엇이 남나

| 무엇 | 어디 | 커밋 |
|---|---|---|
| 세션 · LLM 응답 | `$DHE_DATA_DIR/comment-eval/sessions.json`, `runs/<모델>.jsonl` | ✗ |
| 평가지 · 정답표 · 집계 | `$DHE_DATA_DIR/comment-eval/out/` | ✗ |
| 코드 · 시험 | `eval/comment/` (`pytest eval/comment` — 모델 없이) | ○ |
