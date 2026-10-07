# eval/ — 평가 하네스 (ai-pipeline-v6.md 2절)

한 명령으로 전부 다시 잰다. 결과는 `results/`에 CSV, 결과표는 `docs/eval-results-v6.md`에 자동 생성.

```
uv run python eval/run_all.py            # 전부 (골든 세트 없으면 각 단계가 "skipped"로 표시)
uv run python eval/run_all.py --only score
uv run python eval/report.py             # results/*.csv → docs/eval-results-v6.md
```

| 폴더 | 평가 | 언어 | 비고 |
|---|---|---|---|
| `golden/` | 골든 세트 `manifest.json` (사진은 저장소 밖, 경로·해시·person_id·라벨 버전만) | — | 30장 고정, 버전 `golden-vN` |
| `score/` | E-1·E-7 채점 일치율·반복 편차·대칭 보정 방향 | Python이 Node를 부른다 (`score.js`는 폰에서 도는 JS라 그대로 두고 subprocess로 실행) | |
| `faceshape/` | E-2·S-2 규칙 vs 후보 모델 | Python | |
| `transfer/` | E-3·S-1 시간·ArcFace·부위 ΔE | Python (서버 API 호출) | |
| `region/` | E-4·S-3 EasyPortrait·Periorbital IoU | Python | jeakeun `poc/datasets-eval` 이식 |
| `funnel/` | **E-8 사용자 흐름** — 퍼널(새 흐름 화면별 도달률), 이탈 위치(끝까지 못 간 세션이 멈춘 화면), 동의 거부, 촬영 완주·재촬영, 게이트 첫 실패 분포, 부위 상태·확인만 이유·재확인, 피드백 도달·저장 클릭, 세션 시간·얼굴 놓침·채점 시간·복원 성공률 | Python. 앱에서 `logStore.exportJsonl()` 로 내보낸 `.jsonl` 을 읽는다 | 집계는 `funnel.py`(순수 함수), 실행은 `run.py` |
| `gate/` `live/` | E-5·E-6 | Python | |
| `results/` | `<날짜>_<커밋>_<모델버전>_<골든버전>.csv` | — | 커밋한다 (작음) |

규칙: 골든 세트는 고정, 사람 단위 분할, 결과 파일명에 버전 셋, 손으로 결과표 쓰지 않기.

### `score/` 채점 CLI 가 받는 골든 항목 (초안 · ③⑤ 합의 중)

`run.py` 는 `manifest.json` 의 `items` 를 그대로 `node eval/score/score_cli.mjs` 의 stdin 에 넣는다. 항목 하나:

```json
{ "id": "ffhq_0001_liner", "person_id": "ffhq_0001", "part": "liner",
  "bare": "ffhq/0001_bare.png", "makeup": "ffhq/0001_makeup.png",
  "bare_lm": "ffhq/0001_bare.lm.json", "makeup_lm": "ffhq/0001_makeup.lm.json",
  "label": "ok" }
```

- 경로는 `DHE_DATA_DIR` 기준 상대 경로. 사진은 PNG
- `look`: `rules/looks.json` 의 id. 라이너 두께 등 잣대가 룩을 따라간다. 비어 있으면 기본 룩 `smoky` 로 재고 결과 행 `look` 에 적힌다
- `sha256: { bare, makeup }` 이 있으면 사진 지문을 대조한다. 다르면 그 행은 `error` (사진이 바뀌면 정답이 더는 그 사진의 정답이 아니다)
- 랜드마크는 MediaPipe 478점 JSON (`[{x,y}]` 또는 `[[x,y]]`, 픽셀 또는 0~1). Node 에서는 MediaPipe 가 안 돌아 ⑤ 가 파이썬으로 뽑는다
- `label` 은 `ok | slight | off`. CLI 는 점수를 같은 3단계로 접어 `pred` 로 낸다 (경계 80·50 — E-1 첫 결과 뒤 확정)
- 못 잰 항목은 `status: "check_only"` + `check_reason`, `pred: null`. 일치율 분모에서 빼고 비율을 따로 세는 것을 제안
- 채점 코드는 `client/src/core/score-part.ts` 를 그대로 묶어 쓴다(앱과 같은 것을 잰다). 가이드 기하도 앱과 같은 파일(`client/src/core/guide-poc.ts`, ② `guides.ts` 전까지의 임시본)을 묶어 쓴다

**이벤트 로그 위치**: `DHE_DATA_DIR/events/*.jsonl`. 사용자 실험 때 **동의받아** 내보낸 것, 또는 서버가 받은 것(`POST /events` — `server/app/events.py`, 같은 폴더에 날짜별로 쌓인다). 저장소에 넣지 않는다. 같은 세션을 두 길로 다 받으면 줄이 겹친다.

```bash
uv run python eval/funnel/run.py                 # 기본 위치
uv run python eval/funnel/run.py --dir 경로
```
