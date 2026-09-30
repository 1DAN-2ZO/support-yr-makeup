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

- **라이선스 CC BY-NC-SA 4.0** (cyberagent/FFHQ-Makeup). 비상업 · **평가·참고만, 학습 데이터(합성 학습의 바탕 얼굴 포함)로 쓰지 않는다** (`docs/data-plan-v6.md`). 다른 곳에 올리거나 퍼뜨리지 않는다
- **합성 이미지다** — FFHQ(Flickr 인물 사진) 얼굴에서 화장을 합성으로 지운 "맨얼굴". 실제 폰 촬영과 조명·해상도(512px)가 다르다. 실제 촬영 기준은 팀원 사진(`poc/samples/phone-portraits-20`, 골든 세트)으로 확인한다
- 정면 위주라 45° 장 시험에는 맞지 않는다
- 이 30장에서 앱 측정은 처진 눈(α−β > 2°)을 26장으로 판정했다 — 측정 기준 점검 거리 (VLM 선정 실험 기록)
