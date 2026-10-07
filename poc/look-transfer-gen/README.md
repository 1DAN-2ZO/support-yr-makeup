# 룩 옮기기 실험 — 생성 모델 서버

배우고 싶은 화장 사진 한 장과 내 맨얼굴 사진 한 장으로 **"화장한 내 얼굴"(정답사진 후보)** 을 만드는 실험용 서버다.
새 흐름(#313 · #314)의 "참고 사진 → 정답사진 → 부위 가이드" 자리를 실제로 돌려 보려고 만들었다. 제품 코드가 아니다.

받는 쪽은 `client/look-transfer-probe.html` (dev 전용 실험 화면)이다. 화면은 받은 그림을 그대로 쓰지 않고,
**색이 바뀐 것만 떼어 내 맨얼굴 위에 다시 입힌다** — 얼굴 모양 · 머리 · 배경은 원본 그대로 남는다 (#313 §7).
그 다음 떼어 낸 화장에서 부위 가이드(눈썹 · 섀도우 · 아이라인 · 꼬리 · 블러셔 · 입술)를 뽑는다 (`client/src/core/look-guide.ts`, 꼬리는 `look-wing.ts`).
가이드는 사진 위에 그려 보거나, 얼굴 점에 묶어 카메라 화면의 얼굴 위에 얹어 본다 (AR 로 보기 — `look-anchor.ts`).
AR 화면은 기본으로 따라 그릴 것만(바를 자리 · 테두리 · 선) 화면 크기에 맞춰 그린다 — 웹캠 영상 크기 그대로 전부 그리면 선이 굵게 뭉치고 겹친다. 안경 · 눈썹을 덮는 앞머리 · 어두운 곳에서는 얼굴 점이 틀리게 잡힐 수 있다 (사진을 찍을 때와 같은 조건).

## 모델

- FLUX.2 [klein] 4B — `black-forest-labs/FLUX.2-klein-4B`, **Apache-2.0** (상업 이용 가능, 신청 없이 받을 수 있다).
- 4 단계, guidance 1.0, bfloat16 (줄인 판 아님). 사진 두 장을 같이 넣는 편집 방식(`image=[맨얼굴, 화장 사진]`).
- 모델 파일은 약 15GB — 저장소에 넣지 않는다 (`models/` 는 `.gitignore`).

## 필요한 것

- NVIDIA 그래픽카드. **잰 값(RTX 4080 16GB): 올려 둔 상태 7.9GB, 만들 때 최대 9.9GB**, 한 장에 4.4 ~ 7초(1024px).
  RTX 3060 12GB 에서는 아직 안 돌려 봤다.
- PC 메모리: 서버는 1.5GB 쯤 쓴다. 단, 지시문을 해석하는 `embed.py` 는 한 번 돌릴 때 8GB 부품을 그래픽카드에 올린다.
- Python 3.12 에서 돌렸다 (저장소의 3.11 환경과 따로, 이 폴더에 가상 환경을 만든다).

## 설치와 실행

```
cd poc/look-transfer-gen
python -m venv .venv
.venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\pip install -r requirements.txt
hf download black-forest-labs/FLUX.2-klein-4B --local-dir models/FLUX.2-klein-4B

.venv\Scripts\python embed.py                                              # 처음 한 번 — 지시문을 해석해 embeds/ 에 저장
.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8189    # 서버
```

화면은 다른 터미널에서:

```
cd client
npx vite --config vite.lt.config.ts      # /__gen → 127.0.0.1:8189 프록시가 붙은 dev 서버
```

그리고 `https://localhost:5173/look-transfer-probe.html` 을 연다.

모델 · 해석해 둔 지시문의 자리는 환경 변수로 바꿀 수 있다: `LOOK_GEN_MODEL_DIR`, `LOOK_GEN_EMBEDS_DIR`.

## 지켜야 할 것

- **127.0.0.1 로만 연다.** 서버도, 프록시가 붙은 dev 서버(`vite.lt.config.ts`)도 LAN 에 열지 않는다. 얼굴 사진이 오가는 길이다.
- 받은 사진과 만든 사진은 **메모리에서만 쓰고 저장하지 않는다.** 외부 서비스로 보내지 않는다.
- **메모리 지킴이**(`guard.py`): PC 의 남은 메모리가 4GB 아래로 떨어지면 서버가 스스로 꺼진다 (`LOOK_GEN_MIN_FREE_GB`).
  글 해석 부품(8GB)과 그림 생성 부품(8GB)을 같이 올렸다가 32GB PC 의 메모리가 바닥난 적이 있어, 지시문은 미리 해석해 두고
  서버는 그림 생성 부품만 올린다.

## 주소

| 주소 | 하는 일 |
|---|---|
| `GET /health` | 모델을 올렸는지, 그래픽 메모리, 지시문 이름들 |
| `POST /transfer` | `bare`(맨얼굴) · `ref`(화장 사진) 파일 + `seed` · `steps` · `size` · `prompt`(지시문 이름) · `raw` → PNG 한 장 |
| `POST /unload` | 모델을 그래픽카드에서 내린다 |

모델은 첫 `/transfer` 때 올린다.

## 알려진 한계 (2026-10-06 ~ 07, 사진 몇 장으로 본 것)

- **블러셔를 거의 안 옮긴다.** 기본 지시문(`short`)에서 볼의 붉어진 정도가 1 ~ 3 (눈에 띄려면 5 이상).
  `list` 지시문은 블러셔를 진하게 옮기지만 화장 사진에 없는 아이라인 꼬리 · 다른 색 섀도우까지 지어낸다.
- **짧은 아이라인 꼬리를 줄이거나 빼먹는다.** 눈 폭의 30% 꼬리는 25% 쯤으로, 15% 는 한쪽 눈에만, 8% 는 거의 안 그렸다.
- **진한 화장(스모키)은 약하게 옮기고, 시작값(seed)에 따라 달라진다.**
- 화장이 없는 사진을 넣어도 속눈썹 선을 조금 진하게 그린다 (가이드 쪽에서 걸러 낸다).
- **화장 사진의 앞머리를 화장으로 옮긴다.** 앞머리 가닥이 눈까지 내려온 화장 사진이면 그 가닥을 내 눈두덩에 검은 줄(금발이면 누런 섀도)로 그렸다
  (2026-10-07, 화장 사진 5장 × 얼굴 3명). 그래서 화면이 화장 사진의 머리카락을 눈 폭의 20% 만큼 넓혀 가린 뒤 보낸다 (`core/look-transfer.ts` hairCover) —
  거의 사라졌지만, 앞머리에 가린 눈썹 · 눈두덩의 화장은 모델이 볼 수 없어 옮기지 못한다 (화면이 그렇게 알린다).

같은 사진으로 다른 모델(FLUX.2 klein base 4B, Stable-Makeup 등)과 견줘 보는 것은 아직 안 했다.
