# VLM 서버 인수인계 — 개인화 `/plan` (모듈 ④ → 중간 서버)

앱(모듈 ⑥)은 개인화를 VLM 에게 묻고 규칙 관문으로 거른다. VLM 이 없으면 이용 불가다. 이 문서는 **앱과 llama-server 사이의 중간 서버**를 만드는 사람을 위한 것이다. 모델·설정은 VLM 선정 실험(`eval/vlm`, 2026-09-29~10-01)에서 정했다.

## 한 줄 요약

학원 PC(RTX 3060 12GB)에서 **llama-server + Gemma 4 E4B**를 띄우고, 중간 서버가 앱의 `POST /plan`을 받아 **앱이 준 프롬프트·스키마·이미지를 그대로** llama-server 에 넘긴 뒤 모델이 낸 JSON 원문을 돌려준다. 관문(검사)은 앱이 한다. **사진은 저장하지 않는다.**

## 1. 앱과의 계약 (`client/src/core/vlm-client.ts` 머리말과 같다)

| 요청 | 응답 |
|---|---|
| `GET /health` | `200 { ok: true, vlm: { ok: true, model: "<모델 이름>" } }` — 서버와 모델이 둘 다 살아 있어야 앱이 시작한다. 모델이 내려가 있으면 `vlm.ok: false` |
| `POST /plan` 본문 `{ image, prompt, schema, prompt_ver, look_id }` | `200 { proposal, ms, model }` — `proposal` 은 모델이 낸 **JSON 문자열 원문**(파싱·검사하지 않는다) |
| 대기열이 찼을 때 | `503 { reason: "busy" }` |
| 모델이 내려갔을 때 | `503 { reason: "<아무 말>" }` |
| 서버 쪽 시간 초과 | `504` |

- `image`: 얼굴 가운데를 자른 **512×512 JPEG data URL** (앱 `screens/vlm-image.ts` 가 만든다). 서버가 다시 자르거나 줄이지 않는다
- `prompt`: 앱이 만든 글 전체 (`core/vlm-prompt.ts`, 형식 E). 서버가 고치지 않는다
- `schema`: 제약 디코딩용 JSON 스키마 (`core/vlm-flow.ts vlmSchema`). **얼굴마다 다르다** — 이 얼굴에서 관문이 받아 주는 값만 enum 으로 들어 있다. 캐시하지 말고 요청마다 그대로 쓴다
- `prompt_ver`: 지금 `vlm-prompt-v2`. 로그에 남긴다
- 앱 시간 제한은 **25초** (`PLAN_TIMEOUT_MS`). 관문에서 거절되면 앱이 **한 번 더** 묻는다 — 한 사용자가 최대 두 번 연달아 부른다
- CORS: 앱 주소에서 부를 수 있게 (개발용 가짜 서버 `scripts/dev-vlm-mock.mjs` 가 같은 계약이다 — 앱 쪽 시험에 쓰면 된다)

## 2. llama-server

| 항목 | 값 |
|---|---|
| 프로그램 | llama.cpp **b11243** Windows CUDA 12.4 빌드 (`llama-b11243-bin-win-cuda-12.4-x64.zip` + `cudart-llama-bin-win-cuda-12.4-x64.zip`). 실험 PC 에는 `C:\llama.cpp\llama-server.exe` |
| 모델 | **Gemma 4 E4B-it** — `ggml-org/gemma-4-E4B-it-GGUF` 의 `gemma-4-E4B-it-Q4_0.gguf`(4.3GB) + `mmproj-gemma-4-E4B-it-BF16.gguf`(0.9GB). 실험 PC 에는 `D:\vlm-models\gemma4_e4b\` |
| 띄우는 인자 | `-m <gguf> --mmproj <mmproj> -ngl 99 -np 1 -c 8192 --seed 42 --temp 0 --host 127.0.0.1 --port 8090` |
| 밖에 열지 않는다 | llama-server 는 `127.0.0.1` 에만. 앱은 중간 서버만 본다 |

`-np 1`(슬롯 하나)로 쟀다. 슬롯을 늘리면 요청당 시간·메모리가 늘고 같은 입력에 같은 답이 보장되지 않는다(조사 보고서). 늘리려면 다시 재야 한다.

## 3. llama-server 로 넘기는 요청 (실험 `eval/vlm/run.py Server.ask` 와 같다)

```json
POST http://127.0.0.1:8090/v1/chat/completions
{
  "messages": [{ "role": "user", "content": [
    { "type": "image_url", "image_url": { "url": "<앱이 준 image 그대로>" } },
    { "type": "text", "text": "<앱이 준 prompt 그대로>" }
  ]}],
  "temperature": 0,
  "seed": 42,
  "max_tokens": 500,
  "cache_prompt": false,
  "response_format": { "type": "json_schema", "json_schema": { "name": "plan", "schema": <앱이 준 schema>, "strict": true } },
  "chat_template_kwargs": { "enable_thinking": false }
}
```

응답의 `choices[0].message.content` 를 `proposal` 로 돌려준다.

**꼭 지킬 것**

- **`enable_thinking: false`** — Gemma 4 는 생각 모드가 있다. 켜 두면 답 전체가 `reasoning_content` 로 가고 `content` 가 **빈 문자열**이 된다 (실험에서 100% 빈 출력이었다). `content` 가 비었는데 `reasoning_content` 가 있으면 이 설정을 의심한다
- **`max_tokens` 500** — 관찰·근거 문장이 들어가 300 으로는 잘린다. `finish_reason: "length"` 면 JSON 이 깨진다 (앱은 관문에서 "JSON 객체가 아님" 으로 거절하고 다시 묻는다)
- 스키마는 **`strict: true`** 로. 숫자는 이미 enum 이라 범위가 강제된다 (llama.cpp 는 소수 `minimum`/`maximum` 을 강제하지 않는다 — 그래서 앱이 enum 으로 바꿨다)
- `temperature 0` · `seed 42` · `cache_prompt false` — 같은 입력이면 같은 답 (실험: 반복·서버 재시작 전후 모두 같은 답)

## 4. 성능 (실험 PC RTX 3060 12GB, 512px, 형식 E)

| | 값 |
|---|---|
| 응답 시간 | p50 약 5.2~5.6초 · **p95 약 5.5~5.8초** (출력 약 350토큰) |
| VRAM | 최대 약 8.3GB (12GB 중) — 같은 GPU 에 다른 모델을 올리면 모자랄 수 있다 |
| 관문 통과 | 100% (결정 값·근거 문장 모두) — 재질문이 거의 안 일어난다 |

한 사람당 5~6초라 슬롯 하나로 **25초 안에 4명 정도**가 줄을 설 수 있다. 대기열이 그보다 길면 `503 busy` 로 빨리 돌려주는 편이 앱 시간 초과(25초)보다 낫다. 서버 쪽 제한은 20초 안팎으로 두고 넘으면 `504`.

## 5. 지킬 것

- **사진을 저장하지 않는다** — 메모리에서 모델로 넘기고 버린다. 요청 본문을 로그에 남기지 않는다 (data URL 이 통째로 남는다)
- 로그에는 `prompt_ver` · `look_id` · `ms` · 모델 이름 · 상태 코드 · `finish_reason` · `proposal` 길이 정도만
- `/health` 는 llama-server `/health` 가 200 이고 모델이 실려 있을 때만 `vlm.ok: true`. 모델이 내려가면 다시 띄우는 것까지 해 주면 좋다 (띄우는 데 수십 초)

## 6. 확인하는 법

```bash
# llama-server 만 — 이미지 없이 글 한 줄
curl http://127.0.0.1:8090/health
# 실제 요청 모양 — 실험 코드가 같은 요청을 만든다 (얼굴 사진·측정값 필요: eval/vlm/README.md)
uv run --extra vlm python eval/vlm/run.py --model <models.json 항목> --stages 0 --variant E --smoke 10
```

- 앱 쪽 흐름 시험: `node scripts/dev-vlm-mock.mjs` (가짜 `/plan`, 빈 제안 → 앱이 전부 규칙값)
- 실제 얼굴로 시험하려면 `eval/samples/ffhq_east_asian.py` 로 FFHQ-Makeup 동양인 맨얼굴을 꺼내 쓸 수 있다 (사진은 저장소 밖, 비상업·평가용)

## 7. 바뀌면 다시 재야 하는 것

- 모델·양자화(지금 Q4_0 — 공식 변환본에 Q4_K_M 이 없다), llama.cpp 판, `-np` 슬롯 수
- 앱이 `PROMPT_VER` 를 올리면 (프롬프트·스키마가 바뀐 것)
- 다시 재는 법과 기준: `eval/vlm/README.md` (선정 비교 `report.py --compare`)

## 근거

- 선정 실험 코드·결과: `eval/vlm/`, `eval/results/2026-09-30_vlm_compare-{sel,fin,chk}.csv`
- 후보 조사 보고서: `docs/research/vlm-2026-09-29/보고서.md`
- 앱 쪽: `client/src/core/vlm-client.ts`(계약) · `vlm-flow.ts`(재질문·스키마) · `vlm-prompt.ts`(프롬프트) · `screens/vlm-image.ts`(사진 자르기)
