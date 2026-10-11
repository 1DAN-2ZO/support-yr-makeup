# eval/samples — 실제 얼굴 모양 샘플 (사진은 저장소 밖)

채점·측정을 코드로 만든 합성 얼굴(`client/tests/helpers/synth-face.ts`)만으로 시험하던 것을 보완한다. **저장소에는 목록과 꺼내는 스크립트만** 두고, 사진은 각자 원본 데이터셋에서 꺼내 `$DHE_DATA_DIR` 아래에 둔다 (얼굴 사진은 저장소에 넣지 않는다).

## FFHQ-Makeup 동양인 맨얼굴 (`ffhq_east_asian.*`)

```bash
export DHE_DATA_DIR=D:/dhe-data
uv run python eval/samples/ffhq_east_asian.py --download                 # zip 받기(약 3.6GB) + 확인한 30장 꺼내기
uv run --extra vlm python eval/samples/ffhq_east_asian.py --landmarks    # 얼굴 점 478개(.lm.json)도
uv run python eval/samples/ffhq_east_asian.py --golden                   # 골든 세트 자리에도 (golden/raw/eaNN/bare.jpg)
```

| 무엇 | 어디 |
|---|---|
| 목록 (번호 · zip 안 경로 · sha256 · 분류 확률 · 확인 여부) | `eval/samples/ffhq_east_asian.csv` |
| 꺼낸 맨얼굴 `ea_<번호>.jpg` (512×512) · 얼굴 점 `ea_<번호>.lm.json` | `$DHE_DATA_DIR/samples/ffhq-east-asian/` |
| 골든 세트 자리 (`--golden`) | `$DHE_DATA_DIR/golden/raw/ea01~/bare.jpg` → `eval/golden/build.py` |

- **sel30** (기본) — 맨얼굴 18,370장 → FairFace 분류(YOLO11x, 공개 정확도 약 73%) East Asian 1,770장 → 확률 상위 240장 → **눈으로 고른 30장**. 화장이 덜 지워진 합성·옆얼굴·안경·어린이·감은 눈·눈을 가린 앞머리를 뺐다. 눈꼬리 기울기 0.8~12.5°, 윗입술÷아랫입술 0.71~1.58, 남성 7장
- **pool** (`--set pool`) — 나머지 210장. **눈으로 보지 않았다** — 화장 잔여·옆얼굴·어린이·안경이 섞여 있다
- 꺼낸 파일은 목록의 sha256 과 대조한다. 다르면 멈춘다 (데이터셋 판이 바뀐 경우)
- 얼굴 점은 `{x, y}` 픽셀 좌표 478개 — 앱 `measureFace`·채점기(`eval/score/score_cli.mjs`)가 그대로 읽는다

### 알고 쓸 것

- **라이선스 CC BY-NC-SA 4.0** (cyberagent/FFHQ-Makeup). 비상업 · **평가·참고만, 학습 데이터(합성 학습의 바탕 얼굴 포함)로 쓰지 않는다** (`docs/archive/data-plan-v6.md`). 다른 곳에 올리거나 퍼뜨리지 않는다
- **합성 이미지다** — FFHQ(Flickr 인물 사진) 얼굴에서 화장을 합성으로 지운 "맨얼굴". 실제 폰 촬영과 조명·해상도(512px)가 다르다. 실제 촬영 기준은 팀원 사진(`poc/samples/phone-portraits-20`, 골든 세트)으로 확인한다
- 정면 위주라 45° 장 시험에는 맞지 않는다
- 이 30장에서 앱 측정은 처진 눈(α−β > 2°)을 26장으로 판정했다 — 측정 기준 점검 거리 (VLM 선정 실험 기록)

## 합성 화장 세트 (`painted.py` · `paint_levels.mjs`)

골든 세트(사람 라벨)가 오기 전에 채점 **논리**를 미리 본다. 위에서 꺼낸 실제 맨얼굴에 화장 템플릿(`rules/looks.json`) 색을 **네 단계**로 칠하고, 앱과 같은 채점 코드로 판정한다. 정답을 우리가 정해 칠하므로 라벨이 필요 없다.

```bash
uv run --extra vlm python eval/samples/ffhq_east_asian.py --landmarks     # 맨얼굴 + 얼굴 점 (먼저)
uv run --extra eval python eval/samples/painted.py                        # 30명 × 화장 10종 (약 6분)
uv run --extra eval python eval/samples/painted.py --looks edgy pure --limit 5
```

| 단계 | 어떻게 칠하나 | 기대 판정 |
|---|---|---|
| 덜 채움 | 눈썹·라이너는 꼬리 쪽 35% 를 비움 · 입술은 80% 로 줄임 · 섀도우는 범위 45% · 볼은 65% | 조금 |
| 적당함 | 채점 가이드 그대로 | 맞음 |
| 조금 번짐 | 허용 한계를 조금 넘게 (눈썹 눈 폭 4% 밖 · 라이너 두께 +2.5% · 입술 폭 3% 밖 · 섀도우 1.35배 · 볼 1.3배) | 조금 |
| 많이 번짐 | 크게 넘게 (눈썹 12% · 라이너 2.5배 두께 + 긴 꼬리 · 입술 9% · 섀도우 1.9배 · 볼 1.7배) | 많이 |

결과는 전부 저장소 밖 `$DHE_DATA_DIR/samples/ffhq-painted/` —
`sheets/<사람>_<화장>.png`(부위 5줄 × 맨얼굴 + 4단계, 칸마다 기대·채점 결과 O/X) · `results.json` · `summary.csv`.
칠한 색은 눈썹·라이너·입술이 템플릿 색 70%(채점 `subtleCover` 와 같은 가정), 섀도우·볼이 템플릿 진하기.

### 읽을 때

- **'확인만' 은 틀린 답이 아니라 무응답**으로 센다 (`eval/score/run.py` 와 같은 규칙) — 일치율 분모에서 빠진다
- **'적당함' 은 채점과 같은 가이드로 칠하니 높게 나오는 게 당연하다.** 스스로 모순이 없는지만 본다. 값어치는 나머지 세 단계를 가르는지에 있다
- **합성 기준이다** — 화장이 고른 색이고, 같은 사진 위에 칠해서 다시 찍은 차이(조명·원근·흔들림)가 없다. 여기 일치율로 기준값을 확정하거나 발표 숫자로 쓰지 않는다 (그건 골든 세트)
- 섀도우·볼은 채점이 진하기·좌우 차를 보고 **밖으로 번진 것은 따로 재지 않는다** — 번짐 단계가 안 잡히는 건 도구 탓이 아니라 채점이 그렇게 생긴 것
