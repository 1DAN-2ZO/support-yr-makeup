# 당화응 — 데이터 계획 통합본 (v6)

> 2026-09-16 · `data-needs-v6.md`(1부)와 `data-acquisition-v6.md`(2부)를 한 문서로 묶고, 각 묶음·데이터마다 "쉽게 말하면" 설명을 붙인 것. 두 원본과 내용은 같다. 웹 페이지 판: https://claude.ai/artifact/6j5CrfSZkz1LDgfvuq5Zgm
>
> **쉽게 말하면** 당화응은 "네 맨얼굴 사진을 기준으로, 네가 그린 화장이 가이드랑 얼마나 맞는지" 봐 주는 앱이다. 그러려면 세 종류의 재료가 필요하다. ① **연습 문제**: 컴퓨터에게 "이건 화장이고 이건 피부야"를 가르칠 사진(학습). ② **시험지**: 우리가 만든 게 진짜 얼굴에서도 맞는지 확인할 사진(검증·평가). ③ **화면에 보여줄 것**: 룩 사진·문구·제품 목록(콘텐츠). 남의 사진은 대부분 "연구용으로만"이라, 앱 화면에 띄우거나 학습에 쓰려면 우리가 직접 찍거나 합성 얼굴을 써야 한다.
>
> 상태: **있음** = 이미 확보 · **후보** = 받아올 데이터가 있음(2부) · **미정** = 출처 없음 · **자체** = 우리가 찍거나 만든다 · **보류** = 나중에 우리가 정함.

---

# 1부. 필요한 데이터 — 무엇이 왜, 지금 상태

## 0. 한눈에

| 묶음 | 왜 필요한가 | 항목 수 | 지금 해야 할 것 |
|---|---|---|---|
| A. 개발·검증용 사진 | 촬영·정렬·채점 파이프라인을 실제 얼굴로 확인 | 6 | 자체 촬영 4, 후보 2 |
| B. 학습 데이터 | 자체 학습하는 유일한 모델(화장 영역 분할) | 4 | 맨얼굴 원본 확보 1 |
| C. 모델 평가 데이터 | 공개 모델(화장 전이·법선·파싱)이 우리 조건에서 되는지 | 4 | 참조 사진 1 |
| D. 콘텐츠 데이터 | 화면에 보이는 것(룩·제품·문구·규칙) | 5 | 룩 참조 이미지 1 (룩 값·제품은 보류) |
| E. 규칙의 근거 | 가정값을 무엇으로 정할지 | 3 | 출처 조사 1 |
| F. 사용자 연구 | 서비스가 맞는지(설문·사용자 실험) | 2 | 설문 1 |

**1주차에 반드시 시작해야 하는 것**은 ★ 표시.

---

## A. 개발·검증용 사진 (파이프라인 확인)

> **쉽게 말하면** 지금 POC는 "컴퓨터가 그린 가짜 화장"으로만 시험을 봤다. 진짜 사람이 진짜로 그린 화장 사진이 있어야 채점기가 실제로 맞는지 안다. 집 조명·고개 각도·손이 가리는 상황에서도 버티는지도 봐야 한다.

| # | 데이터 | 쓰는 기능 | 필요한 형태·양 | 상태 | 비고 |
|---|---|---|---|---|---|
| A-1 | 촬영 세트 샘플 (정면 눈 뜸·감음·좌45·우45) | F-01 촬영, 화면 3 크롭, 화면 4 추적 | 5명 × 4장 이상. 3:4 셀카, 1080×1440 | **있음** (20장, AI 생성) | 실제 사람이 아니라 텍스처가 매끈함. 실촬영으로 보강 필요 |
| A-2 ★ | **같은 사람 맨얼굴 + 화장 후 쌍** (같은 자리·같은 조명) | F-08·F-09 채점 전체, 화면 5 POC 실제 입력 | 팀원·지인 5~10명. 한 사람당 맨얼굴 4장 + 화장 후 부위별 1장 | **자체** | 지금 POC는 가상 화장으로만 검증됨. 실제 화장 사진이 있어야 채점이 실제로 도는지 본다 |
| A-3 ★ | **조명 변화 세트** (같은 사람, 조명 3종 이상: 형광등·창가·백열) | F-01 밝기 게이트, 조명 보정(이마 L*), ΔE 기준선 | 3명 × 조명 3종 × 맨얼굴/화장 | **자체** + 후보(AI Hub 한국인 안면 조명 30종) | 최대 리스크(웹은 노출 고정 불가). AI Hub는 승인에 시간 걸림 → 1주차 신청 |
| A-4 | 각도 변화 세트 (정면·±15°·±30°·±45°) | 촬영 45° 판정, 화면 4 추적 유지, 정면 게이트 ±15° | 3명 × 7각도 | **자체** + 후보(AI Hub 각도 20종) | 45° 장의 yaw 허용 범위(현재 22~60 가정) 확정용 |
| A-5 | 손·머리카락 가림 세트 | F-07 손 가림 판정, 품질 게이트 | 3명 × 가림 5상황 | **자체** + 후보(EasyPortrait, AI Hub 마스크) | 화면 4 손 감지 임계 |
| A-6 | 화장 후 랜드마크 이동 측정용 (진한 아이라인·오버립 전/후) | 화면 5 정렬(안정 점 유사변환) 검증 | A-2에서 진한 화장 케이스 포함하면 됨 | **자체** | POC 실측: 가상 화장 기준 편향 3.4px. 실제 화장으로 재측정 |

## B. 학습 데이터 (화장 영역 분할 모델, 직접 학습하는 유일한 모델)

> **쉽게 말하면** 우리가 가르치는 모델은 딱 하나, "사진에서 화장 발린 곳만 오려내기"다. 가르치려면 정답이 표시된 사진이 수천 장 필요한데, 사람이 칠하는 대신 컴퓨터가 맨얼굴 위에 화장을 그려 넣으면서 정답도 같이 만드는 생성기(B-1)가 이미 있다. 그 생성기에 넣을 깨끗한 맨얼굴 사진(B-2)만 있으면 된다.

### B-1. 합성 학습 데이터 생성기 — 어디 있고 무엇인가

**위치**: 브랜치 `docs/tech-stack-and-datasets`(jeakeun)의 `poc/synth/`. main 에는 아직 없다. 설명 문서는 같은 브랜치의 `docs/synth-training-v6.md`.

**무엇인가**: 맨얼굴 사진 한 장에 MediaPipe 랜드마크(468점)를 찍고, 그 위에 눈썹·아이라이너·섀도우·입술·볼터치 5부위를 **절차적으로 그린다**. 그린 폴리곤이 곧 정답 마스크라 사람이 라벨을 달 필요가 없다.

| 항목 | 내용 |
|---|---|
| 출력 | `photo_XXXX.png`(합성 사진) + `label_XXXX.png`(픽셀값 = 클래스 0~5) + `manifest.json`(시드·파라미터·면적) |
| 변형 | 부위별 크기·두께·꼬리 각도·색(48색 팔레트, 조합 69,888)·농도·유무, 좌우 비대칭 ±18% (초보자 흉내 + 좌우 차이 학습) |
| 재현성 | 시드 고정. JS(`core.js`)와 Python(`core.py`)이 같은 결과 (`parity.py` 시드 500개 대조) |
| 검증 | Node 27개 |
| 0차 학습 | `train.py`로 분할 모델(U-Net 계열) 학습 → **mIoU 0.899** (파이프라인이 돈다는 확인용, 품질 목표 아님) |
| 라이선스 | 코드는 우리 것. **맨얼굴 원본이 우리 것이면 결과물에 제약 없음** — 그래서 B-2 가 필요하다 |
| 한계 | 지금 밑그림인 샘플 20장은 AI 생성 168×364 원본을 확대한 것이라 홍채 지름이 기준(25px) 미달. **학습용으로는 못 쓴다** |

즉 B-1 은 "생성기"이지 "데이터"가 아니다. 데이터가 되려면 B-2 의 맨얼굴 원본을 넣어야 한다.

### B-2. 합성의 밑그림이 되는 맨얼굴 원본 — 후보 (2026-09-16 조사)

필요한 조건: **화장 안 한 얼굴**, 정면에 가까움, 홍채 지름 25px 이상(얼굴 폭 400px 이상), **학습·앱 화면 모두 가능한 라이선스**, 다양한 피부톤·조명. 수백~수천 장.

| 후보 | 규모·해상도 | 라이선스 | 비용 | 판단 |
|---|---|---|---|---|
| **SFHQ** (Synthetic Faces High Quality, Kaggle 4파트 + GitHub) | 약 425,000장, **1024×1024**, StyleGAN2 기반 합성. 110점 랜드마크·BiSeNet 파싱 맵·CLIP 벡터 동봉 | 저장소 **MIT**. 합성 얼굴이라 초상권 없음. 단, StyleGAN2(NVIDIA 비상업 라이선스) 출력물이라는 점은 사업화 시 법적 확인 권장 | 무료 | **1순위.** 해상도·양·라벨 모두 충분. 화장 있는 얼굴이 섞여 있으니 CLIP 벡터로 "no makeup" 필터링 후 사용 |
| **FairFace** | 108,501장, dlib 정렬 크롭(패딩 0.25 / 1.25), 7인종 균형 | **CC BY 4.0** (상업 가능, 출처 표기) | 무료 | 2순위. 인종·조명 다양성은 최고지만 **해상도가 낮아**(정렬 크롭) 홍채 25px 기준을 못 맞출 수 있음. 저해상도 보강·색 통계용 |
| **AI Hub 한국인 안면 이미지** | 1,000명 × 약 3만 장, 각도 20·조도 30·가림 6·해상도 3종 | AI Hub 이용정책: **영리 이용 가능**, 학습용으로만, 재배포 금지, 내국인 신청·승인 필요. 현재 "일부 공개" | 무료 | **한국인 기준 1순위, 단 앱 화면 게시 불가(학습 전용).** A-3·A-4 검증과 겸용. 승인 대기 → 1주차 신청 |
| **EasyPortrait** | 20,000장, 대부분 FullHD, 9클래스(좌우 눈썹·눈·입술·치아) 파싱 라벨 | **CC BY-SA 4.0 변형** (상업 가능, 파생물 동일 라이선스) | 무료 | 3순위. 파싱 라벨이 우리 부위 구분과 맞음. SA 조건이 학습 가중치에 걸리는지 확인 필요 |
| **Generated Photos** (generated.photos) | AI 생성 인물, 고해상도, 나이·성별 균형 데이터셋 판매 | 상업 라이선스 구매 시 가능 | 소액: 51~250장 $5/장, 251~1,000장 $2.5/장, 1,000장↑ $1/장. 학술 데이터셋은 Kaggle 무료(비상업) | 화장 없는 얼굴을 골라 살 수 있어 **룩 참조 이미지(D-1) 밑그림으로도 검토** |
| Pexels / Unsplash 인물 사진 | 다양, 고해상도 | 사용은 무료·상업 가능이나 **모델 릴리스 미검증**, 실존 인물 | 무료 | 학습 밑그림으로는 가능하지만 앱 화면 게시는 피할 것 |
| FFHQ · CelebA-HQ · Microsoft FaceSynthetics · Face Shape Dataset 등 | 고품질 | **비상업**(FFHQ CC BY-NC-SA, FaceSynthetics 연구 전용) | 무료 | 학습 밑그림 **불가**(가중치에 조건 승계). 평가·참고만 |

**권장 조합**: SFHQ(화장 없는 것 필터, 수천 장)를 주력으로 하고, 한국인 편향 보정은 AI Hub(승인되면), 실제 조명·카메라 노이즈는 A-2·A-3 자체 촬영으로 보강한다. 돈을 쓴다면 Generated Photos 200~300장(약 $1,000 이하)으로 D-1 참조 이미지까지 겸한다.

### B-3·B-4

| # | 데이터 | 쓰는 기능 | 필요한 형태·양 | 상태 | 비고 |
|---|---|---|---|---|---|
| B-3 | 실제 화장 사진 라벨 (평가용) | 분할 모델 평가 mIoU (합성→실제 일반화) | 200~500장 수동 라벨 | **자체** (A-2 사진에 라벨) | 라벨 도구 CVAT/Label Studio. 라벨 기준서 필요 |
| B-4 | 공개 화장 쌍 데이터 (참고·비교) | 학습 대신 참고, 사업화 전까지 평가 | FFHQ-Makeup, BeautyFace 파싱 맵 | **후보** | 전부 비상업 → 학습에는 안 씀 |

## C. 모델 평가 데이터 (공개 모델을 우리 조건에서 검증)

> **쉽게 말하면** 얼굴 부위 나누기, 화장 얹어보기, 얼굴형 판단은 남이 만든 모델이나 우리 규칙을 쓴다. "우리 사진에서도 잘 되나"를 재려면 정답이 붙은 사진이 필요하다. 시험지로만 쓰지 가르치는 데 안 쓰므로 남의 데이터를 써도 된다.

| # | 데이터 | 쓰는 기능 | 필요한 형태·양 | 상태 | 비고 |
|---|---|---|---|---|---|
| C-1 ★ | 화장 전이 입력 쌍 (우리 맨얼굴 + 룩 참조 사진) | F-03 룩 10개, F-04 전체 완성 예상 | 맨얼굴 5명 × 룩 참조 10장 | **미정** (참조 사진 10장 = D-1) | 서버 벤치는 저장소 번들 샘플로만 함(3초 달성). 우리 사진으로 정체성 유지 확인 필요 |
| C-2 | 법선 추정 입력 (정면·좌·우 3장) | F-02 쉐딩 위치, 얼굴형 | A-1·A-4로 충분 | **있음** | 법선 모델 후보(DSINE·Marigold) 미검증 |
| C-3 | 얼굴 파싱 평가 (좌우 눈썹·눈·윗입술·아랫입술 분리 라벨) | F-05 부위 마스크 | CelebAMask-HQ·LaPa 일부 + 우리 사진 소량 | **후보** | 가중치 비상업 승계 주의 |
| C-4 | 얼굴형 규칙 일치율 검증 | F-02 얼굴형 5분류 | Face Shape Dataset 5,000장 + 한국인(AI Hub) | **후보** | POC 규칙(2D 비율)의 정답률 측정 |

## D. 콘텐츠 데이터 (화면에 보이는 것)

> **쉽게 말하면** 앱에 실제로 뜨는 룩 사진·문구·제품 이름이다. 룩 사진 10장은 사용자 눈에 보이는 얼굴이라 연구용 사진은 절대 못 쓰고, 우리가 찍거나 만들어야 한다.

| # | 데이터 | 쓰는 기능 | 필요한 형태·양 | 상태 | 비고 |
|---|---|---|---|---|---|
| D-1 ★ | **룩 참조 이미지 10장** | 화면 2 썸네일, 화장 전이 입력 | 룩 10개 × 정면 참조 1장(+가능하면 부위 확대) | **미정** | 연구 데이터셋 불가, 스톡 초상권 위험 → 팀원 자체 촬영 + 서면 동의, 생성 이미지, 또는 Generated Photos 구매. **방법부터 결정** |
| D-2 | 룩 템플릿 값 10개 + 제품 목록 (부위별 파라미터·색·강도 밴드, 룩별 제품 5줄) | 화면 2·3 표시, 화면 5 채점 기준 | 룩 10 × 부위 5 | **보류** — 우리가 직접 만들 예정, 시점은 나중에 정함 | POC 초안 `poc/full/lib/looks.js` 를 출발점으로. (구 D-3 제품 목록을 여기에 합침) |
| D-3 | 근거 한 줄 문장 (룩 10 × 부위 5) + 얼굴형 멘트 5 | 화면 3 | 55문장, 숫자 없음 | **부분** (POC 초안) | D-2 와 함께 확정 |
| D-4 | 진단 코드표 + 한 줄 평 문장 | 화면 5·6 | 코드 ~40개 (POC `score.js DIAG_TEXT`) | **부분** | 채점 담당과 확정. 방향 표현만, 숫자 없음 |
| D-5 | 촬영·게이트 안내 문구 | 화면 1·4 | ~15문장 | **있음** (POC) | 사용자 테스트로 이해도 확인 |

## E. 규칙의 근거

> **쉽게 말하면** "꼬리가 이만큼 벗어나면 틀린 거다" 같은 기준값과 "둥근 얼굴은 여기에 쉐딩" 같은 규칙의 출처다. 기준값은 우리가 나중에 정하기로 했고, 규칙 출처는 교재에서 찾는다.

| # | 데이터 | 쓰는 기능 | 어떻게 | 상태 |
|---|---|---|---|---|
| E-1 | 채점 임계·밴드·허용 오차 (유무 임계, 지수 밴드, 꼬리 ±mm, 두께, 비움 …) | 화면 5 채점 | **덧바름 실측은 하지 않는다(불가).** 값은 우리가 나중에 정한다. POC 가정값(`score.js PARAMS`)이 출발점 | **보류** |
| E-2 | 전문가 평정 (부위별 점수 1~5) | 채점식 계수와 전문가 점수 상관 (수용 기준 "거짓 점수 금지") | 화장 전문가 3~5명 × 사진 30~50장. A-2 사진 사용 | **자체** (선택) |
| E-3 | 얼굴형별 쉐딩·하이라이트 규칙 출처 | F-05 규칙 5종(화면 3 POC 가정값) | 업계 교재·브랜드 가이드 3곳 이상 공통분모 + 전문가 동의율 | **미정** |

촬영 게이트 각도·밝기 허용치(yaw ±15°, pitch ±10°, 밝기 ±12)는 A-3·A-4 세트로 확인한다.

## F. 사용자 연구

| # | 데이터 | 쓰는 기능 | 형태·양 | 상태 |
|---|---|---|---|---|
| F-1 | 전 성별 설문 100명 | 서비스 정의 검증(1주차 일정) | 온라인 설문 | **자체** |
| F-2 | 사용자 실험 (4주차) | 흐름 이해도, 문구, 점수 납득 | 10명 내외, 세션 로그 + 인터뷰 | **자체** |

---

## 1주차에 시작할 것 (★)

1. **A-2·A-3 한 번의 촬영 세션으로** — 팀원 3~5명이 같은 자리에서 맨얼굴 4장 → 부위별 화장 후 → 조명 바꿔 재촬영. 촬영 프로토콜(거리·조명·순서)과 **서면 동의서**를 먼저.
2. **B-2 확보** — SFHQ 4파트 내려받아 화장 없는 얼굴 필터링(수천 장). AI Hub 한국인 안면 이미지 신청.
3. **D-1 룩 참조 이미지 방법 결정** (자체 촬영 / 생성 / Generated Photos 구매).
4. **C-1** — 참조 사진이 생기면 서버 화장 전이를 우리 맨얼굴로 돌려 정체성 유지 확인.

## 라이선스 한 줄 규칙
- 화면에 띄우는 사진(D-1)과 학습에 넣는 사진(B)은 **비상업 데이터셋 불가**. 평가·참고(C, B-4)는 가능.
- AI Hub 데이터는 학습에만 쓰고 화면 게시·재배포 금지.
- 자체 촬영은 **서면 동의서**(사용 범위: 발표·학습·앱 화면) 필수. 양식을 1주차에 만든다.

---

# 2부. 받아오는 법 — 링크·명령·차선책

## 한눈에 — 무슨 데이터, 무슨 용도

| 데이터 | 무엇 | 우리 용도 | 학습 | 화면 게시 |
|---|---|---|---|---|
| **SFHQ** | StyleGAN2 합성 얼굴 42.5만 장 1024², 랜드마크·파싱 맵·CLIP 벡터 동봉, MIT | 합성 학습 생성기(B-1)의 **맨얼굴 밑그림** → 화장 영역 분할 모델 학습 | O | O(합성) |
| SFHQ-T2I (차선) | 텍스트→이미지 합성 얼굴 12.3만 장 1024² | 같음. StyleGAN2 이슈 회피 | O | O |
| FairFace (차선) | 실사 10.8만 장, 7인종 균형, CC BY 4.0, 정렬 크롭(저해상도) | 피부톤·조명 분포 통계, 저해상도 보강 | O | △(실존 인물) |
| Generated Photos (차선, 유료) | AI 생성 인물, 상업 라이선스 | 화장 없는 얼굴 골라 구매 → 밑그림 + **룩 참조 이미지(D-1)** 겸용 | O | O |
| **Face Shape Dataset** | 연예인 5,000장, 5분류 라벨 | **얼굴형 규칙(F-02) 일치율** 측정 | 평가 | X |
| **AI Hub 한국인 안면 이미지** | 1,000명 × 3만 장, 각도 20·조도 30·가림 6종 | **조명 30종에서 ΔE·밝기 게이트 검증**, 각도 판정·추적 검증, 한국인 얼굴형 보정 | O(학습만) | X |
| **EasyPortrait** | 2만 장 FullHD, 좌/우 눈썹·눈·입술 9클래스 | 부위 마스크(F-05·F-08) **평가** | SA 조건 확인 | X |
| LaPa (차선) | 2.2만 장, 11클래스 + 106점, 비상업 | 같음 | X | X |
| CelebAMask-HQ (차선) | 3만 장 512², 19클래스, 비상업 | 같음 | X | X |
| Helen (차선) | 2,330장, 부위 윤곽, 제약 없음 | 사업화 때 파싱 모델 재학습용 확보 | O | △ |
| **FFHQ-Makeup** | 같은 얼굴 맨얼굴·화장 쌍 10.8만 장, 비상업 | ΔE 분포·화장 영역 통계 **참고**, 분할 모델 실제 화장 평가 | X | X |
| MT · BeautyFace · CPM · Makeup-Wild | 화장 전/후·실제 환경 화장 사진, 연구용 | 화장 전이 모델·채점 평가 참고 | X | X |

## 0. 공통 준비 (한 번만)

| 도구 | 설치·설정 | 쓰는 곳 |
|---|---|---|
| Kaggle CLI | `pip install kaggle` → https://www.kaggle.com/settings/api 에서 "Create New Token" → `kaggle.json`을 `C:\Users\<이름>\.kaggle\` 에 두기 | SFHQ, Face Shape, CelebAMask-HQ 미러 |
| Hugging Face CLI | `pip install -U huggingface_hub` → `hf auth login`(토큰은 https://huggingface.co/settings/tokens) | FairFace, EasyPortrait, SFHQ 미러 |
| gdown | `pip install gdown` | Google Drive 배포(CelebAMask-HQ, FairFace 원본, LaPa) |
| aihubshell | AI Hub 로그인 후 https://www.aihub.or.kr/devsport/apishell/list.do 에서 받기. **Windows는 WSL 필요** | AI Hub 대용량 다운로드 |
| 저장 위치 | 저장소 밖 `C:\data\danghwaeung\<이름>\` 에 두고 **git에는 넣지 않는다**(용량·라이선스). 저장소에는 경로·해시·라이선스 메모만 | 전체 |

---

## 1. 지금 바로 받을 것

### 1-1. 맨얼굴 원본 (B-2) — 합성 학습 데이터의 밑그림

> **쉽게 말하면** 세상에 없는 사람 얼굴을 컴퓨터가 만든 사진 42만 장. 실존 인물이 아니라 초상권 걱정이 없고 크기도 크다. 우리 생성기에 넣을 "빈 도화지" 맨얼굴로 쓴다. 화장한 얼굴도 섞여 있으니 같이 딸려 오는 검색 벡터로 "화장 없음"만 골라낸다.

**1순위: SFHQ** (합성 얼굴 약 42.5만 장, 1024×1024, 랜드마크·파싱 맵·CLIP 벡터 동봉, 저장소 MIT)
- 설명·라이선스: https://github.com/SelfishGene/SFHQ-dataset
- Kaggle 4파트 (파트당 수십 GB이므로 **파트 1만 먼저**):
  - https://www.kaggle.com/datasets/selfishgene/synthetic-faces-high-quality-sfhq-part-1
  - https://www.kaggle.com/datasets/selfishgene/synthetic-faces-high-quality-sfhq-part-2
  - https://www.kaggle.com/datasets/selfishgene/synthetic-faces-high-quality-sfhq-part-3
  - https://www.kaggle.com/datasets/selfishgene/synthetic-faces-high-quality-sfhq-part-4
```
kaggle datasets download -d selfishgene/synthetic-faces-high-quality-sfhq-part-1 -p C:\data\danghwaeung\sfhq --unzip
```
- 받은 뒤 할 일: 동봉된 CLIP 벡터로 "no makeup", "bare face" 텍스트 검색 → 화장 없는 얼굴 수천 장만 고른다. 정면(yaw ±15°)만 남기려면 우리 POC의 `anglesFromLandmarks`를 쓰면 된다.
- 주의: StyleGAN2 출력물. 저자는 "라이선스 문제 없음"이라 하지만 사업화 전에 법적 확인.

**차선 1: SFHQ-T2I** (텍스트→이미지 모델로 만든 12.3만 장, 1024×1024) — Kaggle 파트가 막히거나 StyleGAN2 이슈를 피하고 싶을 때
- https://github.com/SelfishGene/SFHQ-T2I-dataset
- HF 미러: https://huggingface.co/datasets/bitmind/SyntheticFacesHQ
```
hf download bitmind/SyntheticFacesHQ --repo-type dataset --local-dir C:\data\danghwaeung\sfhq-t2i
```

**차선 2: FairFace** (실사 10.8만 장, CC BY 4.0, 인종 균형. 정렬 크롭이라 해상도 낮음 → 저해상도 보강·색 통계용)
- https://github.com/joojs/fairface (Google Drive 링크: padding 0.25 / 1.25 두 종)
- HF 미러: https://huggingface.co/datasets/HuggingFaceM4/FairFace
```
hf download HuggingFaceM4/FairFace --repo-type dataset --local-dir C:\data\danghwaeung\fairface
```

**차선 3: Generated Photos 구매** (합성 인물, 상업 라이선스 포함) — 위가 전부 안 되거나 화장 없는 얼굴을 확실히 고르고 싶을 때
- 가격: https://generated.photos/pricing (51~250장 $5/장, 251~1,000장 $2.5/장, 1,000장↑ $1/장)
- 데이터셋: https://generated.photos/datasets · 학술용 무료판(비상업): https://www.kaggle.com/datasets/generatedphotos/generated-photos-academic-dataset
- 200~300장이면 약 $500~1,500. 룩 참조 이미지(D-1) 밑그림까지 겸할 수 있다.

**쓰면 안 되는 것(학습용)**: FFHQ(CC BY-NC-SA), CelebA-HQ(비상업), Microsoft FaceSynthetics(비상업). 평가·참고만.

### 1-2. 얼굴형 규칙 검증 (C-4)

> **쉽게 말하면** 사람이 "이 얼굴은 둥근형, 이건 계란형" 하고 미리 적어 둔 사진 5,000장. 우리가 자로 재듯 계산한 얼굴형이 사람 판단과 몇 %나 같은지 채점하는 시험지.

**1순위: Face Shape Dataset** (Kaggle niten19, 5분류 × 1,000장)
- https://www.kaggle.com/datasets/niten19/face-shape-dataset
```
kaggle datasets download -d niten19/face-shape-dataset -p C:\data\danghwaeung\faceshape --unzip
```
- 페이지 우측 License 칸 확인(이전 조사 CC0 기록, 재확인).

**차선**: 전처리본 https://www.kaggle.com/datasets/zeyadkhalid/faceshape-processed · 3분류 https://www.kaggle.com/datasets/attanmhd/face-shape-oval-round-square/data

---

## 2. 신청해 두고 기다릴 것

### 2-1. AI Hub 「한국인 안면 이미지」 (A-3·A-4 후보, B-2 한국인 보정)

> **쉽게 말하면** 정부가 스튜디오에서 한국인 1,000명을 조명 30가지, 고개 각도 20가지로 찍어 둔 사진. 우리가 집 조명 3가지밖에 못 찍을 때 "조명이 바뀌어도 채점이 흔들리지 않나"를 넓게 시험할 수 있다. 학습에만 쓰고 앱에 띄우거나 남에게 넘기면 안 된다. 신청하고 승인을 기다린다.


- 데이터 페이지: https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=83 (1,000명 × 약 3만 장, 각도 20·조도 30·가림 6·표정 3·해상도 3종. **일부 공개**)
- 절차: AI Hub 회원가입(내국인 휴대폰 인증) → 데이터 페이지 "다운로드" 클릭 → 사용 신청서 제출 → 승인 후 웹 또는 aihubshell로 다운로드. 신청서 양식: https://aihub.or.kr/web-nas/aihub21/files/public/FAQ%20%EC%8B%A0%EA%B7%9C%EB%93%B1%EB%A1%9D/%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%20%ED%95%99%EC%8A%B5%EC%9A%A9%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AC%EC%9A%A9%EC%8B%A0%EC%B2%AD%EC%84%9C.docx
- 이용정책(영리 가능·학습 전용·재배포 금지·화면 게시 불가): https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105
- aihubshell 안내: https://www.aihub.or.kr/devsport/apishell/list.do (파일키를 지정해 조도·각도 일부만 받을 수 있다. 전체는 수백 GB)
- 문의: safezone1@aihub.kr, 02-525-7708

**차선**: 「마스크 착용 한국인 안면 이미지」 https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=469 (가림 상황), 그리고 승인이 늦으면 A-3·A-4는 **자체 촬영**으로만 간다(원래 계획).

---

## 3. 평가·참고용 (학습에는 안 넣음)

### 3-1. 얼굴 파싱 평가 라벨 (C-3) — 좌우 눈썹·눈·윗입술·아랫입술 분리

> **쉽게 말하면** 사진마다 "여기는 왼쪽 눈썹, 여기는 입술" 하고 색칠해 둔 정답지 2만 장. 우리 모델이 부위를 얼마나 정확히 오리는지 채점할 때 쓴다. 가르치는 데는 안 쓴다(라이선스 조건).

**1순위: EasyPortrait** (2만 장 FullHD, 9클래스, **CC BY-SA 4.0 변형** — SA 조건 확인)
- https://huggingface.co/datasets/gofixyourself/EasyPortrait · https://github.com/hukenovs/easyportrait
```
hf download gofixyourself/EasyPortrait --repo-type dataset --local-dir C:\data\danghwaeung\easyportrait
```

**차선 1: LaPa** (2.2만 장, 11클래스 + 106점 랜드마크, **비상업**) — https://github.com/JDAI-CV/lapa-dataset (README의 Drive 링크, `gdown`)

**차선 2: CelebAMask-HQ** (3만 장, 19클래스, **비상업**) — https://github.com/switchablenorms/CelebAMask-HQ (README의 Google Drive) · Kaggle 미러 https://www.kaggle.com/datasets/ipythonx/celebamaskhq
```
kaggle datasets download -d ipythonx/celebamaskhq -p C:\data\danghwaeung\celebamask --unzip
```

**차선 3: Helen** (2,330장, 부위 라벨, 제약 없음) — http://www.ifp.illinois.edu/~vuongle2/helen/ · 사업화 대비 재학습용으로 확보해 둘 가치.

### 3-2. 화장 전/후 쌍 (B-4, 채점 참고) — 전부 비상업

> **쉽게 말하면** 같은 사람의 "화장 전"과 "화장 후"가 짝지어진 사진 10만 장. 화장하면 색이 보통 얼마나 변하는지 통계를 내서 우리 기준값의 출발점으로 삼는다. 연구용이라 참고만 한다.

- FFHQ-Makeup: https://huggingface.co/datasets/cyberagent/FFHQ-Makeup (`hf download cyberagent/FFHQ-Makeup --repo-type dataset`)
- 나머지(MT, BeautyFace, CPM, LADN, Makeup-Wild)는 `datasets-v6.md` 표의 링크.

---

## 4. 받은 뒤 기록할 것 (저장소에 넣는 건 이것뿐)

`docs/data-inventory.md`(만들 예정)에 한 줄씩: 이름 · 받은 날 · 버전/파트 · 저장 경로 · 파일 수 · 라이선스 원문 링크 · 우리 용도(학습/평가/참고) · 화면 게시 가능 여부.

## 5. 라이선스 요약

| 용도 | 가능 | 불가 |
|---|---|---|
| 학습(가중치에 승계) | SFHQ, SFHQ-T2I, FairFace(CC BY), 자체 촬영, Generated Photos(구매) | FFHQ, CelebA-HQ, LaPa, FaceSynthetics, FFHQ-Makeup, AI Hub(학습은 가능하나 재배포·게시 불가) |
| 앱 화면 게시 | 자체 촬영(동의서), 생성 이미지, Generated Photos(구매) | 위 전부(연구·비상업), Pexels/Unsplash 실존 인물(모델 릴리스 미검증) |
| 평가·참고 | 전부 가능(인용 조건 준수) | — |
