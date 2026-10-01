# eval/samples/shape — 결과 모양 채점 실험 (score-shape 브랜치)

지금 채점은 "맨얼굴과 비교해 새로 그린 곳"을 본다. 여기는 **지금 사진 한 장에서 결과 모양**을 재는 쪽(채점 목적 2안)을
끝까지 만들어 보고, 부위마다 어디까지 되는지 숫자로 본 실험이다. 계산은 `client/src/core/score-shape.ts` (앱에 아직 연결 안 함).

사진은 전부 저장소 밖 `$DHE_DATA_DIR`. 묶음·중간 결과는 `$DHE_DATA_DIR/work/shape-out/`.

| 스크립트 | 사진 | 무엇을 보나 |
|---|---|---|
| `easyportrait_prep.py` | EasyPortrait 검증 세트 | 정면·눈 폭 80px 이상 300장 고르기 + 얼굴 점 + 정답 마스크 |
| `ep_brow.mjs` · `ep_brow-grid.mjs` | EasyPortrait | 눈썹 채움(`shapeFill`)을 정답 눈썹 마스크와 비교 · 기준값 맞추기 (사람 단위로 반 나눔) |
| `ep_brow-score.mjs` | EasyPortrait | 결과 모양 눈썹 점수(`browShape`) — 아무것도 안 그린 얼굴이 몇 점, 어떤 지적 |
| `ep_liner.mjs` | EasyPortrait | 라이너 띠(`linerBand`) 꼬리·두께 분포 |
| `ep_tint.mjs` | EasyPortrait | 입술·섀도우·볼 "물든 칸"(`tintFill`) — 맨얼굴에서 발랐다고 읽는 비율 |
| `ep_route.mjs` | EasyPortrait | 갈림 규칙(`routeOf`) — 화장 10종 × 부위가 결과 모양 / 원본 대조 / 확인만 으로 얼마씩 |
| `ffhq_levels.mjs` | FFHQ 맨얼굴 30장 + 합성 화장 | 결과 모양으로 보낸 경우 네 단계(덜 채움·적당·조금·많이 번짐)를 가르나. `RING=2.0,2.6 SCALE=1` 로 기준 바꿔 보기 |

```bash
export DHE_DATA_DIR=D:/nudy-data
uv run --extra vlm --extra eval python eval/samples/shape/easyportrait_prep.py 300
node eval/samples/shape/ep_brow.mjs && node eval/samples/shape/ep_brow-grid.mjs
node eval/samples/shape/ep_brow-score.mjs
```

## 결과 (2026-10-01)

| 부위 | 결과 모양으로 | 근거 |
|---|---|---|
| 눈썹 채움 | 쓸 만함 — 칸 단위 맞은 비율 83% · 찾은 비율 84% (성긴 꼬리는 71%) | EasyPortrait 300장 + 정답 마스크 |
| 눈썹 넘침 | **못 씀** — 아무것도 안 그린 눈썹의 92% 가 "테두리 밖으로 나갔어요", 80점 이상 0% (정답 기준으로도 72% 가 밖에 걸림) | 〃 |
| 라이너 | **못 씀** — 꼬리 0% 는 믿을 만하나, 80% 이상으로 나온 눈의 3분의 2 가 맨눈(눈꼬리 주름·접힌 선). 속눈썹 띠 두께 중앙 2.4% (가이드 2~6%) | EasyPortrait 눈 542개 + 눈으로 확인 |
| 볼 | 쓸 만함 — 맨얼굴 오판 0~4%, 범위(밖 번짐)도 잡힘 | EasyPortrait + FFHQ 합성 |
| 섀도우 | 색에 따라 — 핑크·베이지·라벤더는 오판 0~1%, 브라운·차콜은 28~43% | 〃 |
| 입술 | 색에 따라 — 밝은 색·누드는 오판 1~6%, 진한 붉은 립은 25~67%. 가릴 수 있는 경우엔 네 단계 순서 100% | 〃 |

- 실제 셀피에서 갈림 규칙: 결과 모양으로 가는 비율 볼 91% · 섀도우 67% · 입술 61% (화장 10종 평균)
- 원래 눈썹이 표준 눈썹 테두리를 70% 이상 채운 사람 70% · 50% 이상 94% (정답 마스크 기준)
- 한계: EasyPortrait 는 화장 여부 표시가 없고 화장 전후 쌍이 아니다. 합성 화장은 고른 색이라 실제보다 쉽다.
  기준값(`SHAPE_FILL` · `TINT_FILL` · `ROUTE`)은 가정값 — 골든 세트로 맞춘다
