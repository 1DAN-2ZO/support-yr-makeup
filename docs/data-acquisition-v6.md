# 당화응 — 받아올 데이터: 링크·받는 법·차선책 (v6)

> 2026-09-16 · `data-needs-v6.md`에서 "받아오거나 신청할 것"으로 분류한 항목만. 우리가 직접 찍는 것(A-2~A-5)은 촬영 프로토콜 문서로 따로.
> 순서 = 지금 바로 할 것 → 신청해 두고 기다릴 것 → 평가·참고용. 각 항목에 **1순위 → 차선책** 순서로 적었다.
> **2026-09-17 4차 (전제 변경)**: 분할 모델은 MVP 에서 뺐다(채점 정답 = 개인화 렌더). 그래서 **SFHQ·합성 생성기는 확장 단계(B-3)로 내려가고**, **Face Shape 는 참고가 아니라 얼굴형 분류기(B-1) 1차 학습용으로 올라오며**(라이선스 불명 → 최종은 자체 라벨로 다듬기), **EasyPortrait 는 학습이 아니라 랜드마크 영역 겹침 평가(C-3)** 에만 쓴다. 링크·명령은 그대로.
> 2026-09-17: jeakeun 순위표(`datasets-ranked-v6.md`) 정정 반영 — Periorbital 은 CC BY 4.0, Helen 은 라이선스 불명, CPM 링크 사망, CelebAMask-HQ 는 HF 미러, Face Shape 은 참고만, AI Hub 피부색 2종 추가, EasyPortrait 는 평가뿐 아니라 파싱 뼈대 학습에도.

## 한눈에 — 무슨 데이터, 무슨 용도

| 데이터 | 무엇 | 우리 용도 | 학습 | 화면 게시 |
|---|---|---|---|---|
| SFHQ (확장 단계) | StyleGAN2 합성 얼굴 42.5만 장 1024², 랜드마크·파싱 맵·CLIP 벡터 동봉, MIT | 합성 학습 생성기의 **맨얼굴 밑그림** → 화장 영역 분할 모델(B-3, **MVP 제외·보류**). 지금은 안 받는다 | O | O(합성) |
| SFHQ-T2I (차선) | 텍스트→이미지 합성 얼굴 12.3만 장 1024² | 같음. StyleGAN2 이슈 회피 | O | O |
| FairFace (차선) | 실사 10.8만 장, 7인종 균형, CC BY 4.0, 정렬 크롭(저해상도) | 피부톤·조명 분포 통계, 저해상도 보강 | O | △(실존 인물) |
| Generated Photos (차선, 유료) | AI 생성 인물, 상업 라이선스 | 화장 없는 얼굴 골라 구매 → 밑그림 + **룩 참조 이미지(D-1)** 겸용 | O | O |
| **Face Shape Dataset** | 서양 연예인 5,000장, 5분류 라벨(근거·라이선스 불명) | **얼굴형 분류기(B-1) 1차 학습**. 최종 가중치·평가는 **팀원·지인 50~100명 자체 라벨(2인)** 로 다듬는다 | △(1차만) | X |
| **Periorbital** | 눈 크롭 2,842장, 홍채·흰자·눈꺼풀·눈썹 5종 사람 라벨, **CC BY 4.0** | 눈썹·눈꺼풀 마스크 평가, 척도 검증(홍채 12% 오차 실측) | 평가 | X |
| **AI Hub 글로벌 다인종 피부색** | 2,525명 × 조명 4종 + 이마·볼·목 측색기 Lab | ΔE 산식·조명 보정 검증 | O(학습만) | X |
| AI Hub 한국인 피부상태 측정 | 1.4만 장, 스마트폰 포함 3기기, 부위 박스 | ΔE 기준선, 부위별 피부색 | O(학습만) | X |
| **AI Hub 한국인 안면 이미지** | 1,000명 × 3만 장, 각도 20·조도 30·가림 6종 | **조명 30종에서 ΔE·밝기 게이트 검증**, 각도 판정·추적 검증, **얼굴형 분류기(B-1) 한국인 분포 보강** | O(학습만) | X |
| **EasyPortrait** | 폰 셀피 FullHD, 좌/우 눈썹·눈·입술 9클래스, 실측 홍채 25px 스펙 93% | **랜드마크로 잡은 부위 영역의 겹침 평가(C-3)**. 4차: 학습 안 함(분할 모델을 하게 되면 뼈대 학습으로 승격) | 평가 | X |
| LaPa (차선) | 2.2만 장, 11클래스 + 106점, 비상업 | 같음 | X | X |
| CelebAMask-HQ (차선) | 3만 장 512², 19클래스, 비상업 | 같음 | X | X |
| Helen (차선) | 2,330장 380px, 부위 윤곽, **라이선스 문구 없음(불명)** | 소규모 평가 | ? | X |
| **FFHQ-Makeup** | 같은 얼굴 맨얼굴·화장 쌍 10.8만 장, 비상업 | ΔE 분포·화장 영역 통계 **참고**, 화장 전이 모델 비교 | X | X |
| MT · BeautyFace · Makeup-Wild | 화장 전/후·실제 환경 화장 사진, 연구용 | 화장 전이 모델 비교 발표용 참고 | X | X |
| CPM · LFW-Part | — | **링크 사망** (2026-09-16 확인) | — | — |

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

### 1-1. 얼굴형 분류기 학습·검증 (B-1·C-4) — 우리가 학습하는 유일한 필수 모델

**1순위: Kaggle Face Shape 로 1차 학습 + 자체 라벨로 다듬기·평가** — 팀원·지인 **50~100명**(A-2 촬영 사진 재사용)에 얼굴형 5종(계란·둥근·각진·긴·하트)을 **팀원 2명이 독립으로** 표시, 불일치는 3인 판정, 라벨러 간 일치율(κ)을 기록한다. 학습 **전에** 현행 규칙(랜드마크 비율)의 정확도를 같은 라벨로 먼저 재 둔다(C-4 기준선). 공개 셋은 전부 서양 연예인 스크랩이고 라벨 근거·라이선스가 불명이라 **1차 학습·실험까지만** 쓰고, 최종 가중치는 자체 라벨과 AI Hub(학습 허용)로 파인튜닝한다. 발표 숫자: 규칙 정확도 → 모델 정확도, 라벨러 일치율(상한).

**Face Shape Dataset** (Kaggle niten19, 5분류 × 1,000장, train 800/test 200)
- https://www.kaggle.com/datasets/niten19/face-shape-dataset
```
kaggle datasets download -d niten19/face-shape-dataset -p C:\data\danghwaeung\faceshape --unzip
```
- 페이지 우측 License 칸 확인(이전 조사 CC0 기록, 재확인). 스크랩 사진이므로 **최종 가중치에는 남기지 않는 것을 원칙**으로.

**차선**: 전처리본 https://www.kaggle.com/datasets/zeyadkhalid/faceshape-processed · 3분류 https://www.kaggle.com/datasets/attanmhd/face-shape-oval-round-square/data · 한국인 분포는 AI Hub 한국인 안면(2-1)에 우리가 소량 라벨.

### 1-2. 맨얼굴 원본 — **확장 단계(B-3), 분할 모델을 하게 되면 그때 받는다**

> 4차: MVP 에서는 받지 않는다. 조사 결과는 보존.

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

---

## 2. 신청해 두고 기다릴 것

### 2-1. AI Hub 「한국인 안면 이미지」 (A-3·A-4 후보, B-1 얼굴형 한국인 보강)

- 데이터 페이지: https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=83 (1,000명 × 약 3만 장, 각도 20·조도 30·가림 6·표정 3·해상도 3종. **일부 공개**)
- 절차: AI Hub 회원가입(내국인 휴대폰 인증) → 데이터 페이지 "다운로드" 클릭 → 사용 신청서 제출 → 승인 후 웹 또는 aihubshell로 다운로드. 신청서 양식: https://aihub.or.kr/web-nas/aihub21/files/public/FAQ%20%EC%8B%A0%EA%B7%9C%EB%93%B1%EB%A1%9D/%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5%20%ED%95%99%EC%8A%B5%EC%9A%A9%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AC%EC%9A%A9%EC%8B%A0%EC%B2%AD%EC%84%9C.docx
- 이용정책(영리 가능·학습 전용·재배포 금지·화면 게시 불가): https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105
- aihubshell 안내: https://www.aihub.or.kr/devsport/apishell/list.do (파일키를 지정해 조도·각도 일부만 받을 수 있다. 전체는 수백 GB)
- 문의: safezone1@aihub.kr, 02-525-7708

**차선**: 「마스크 착용 한국인 안면 이미지」 https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=469 (가림 상황), 그리고 승인이 늦으면 A-3·A-4는 **자체 촬영**으로만 간다(원래 계획).

### 2-2. AI Hub 피부톤 2종 (G-1·G-2, 2026-09-17 추가) — 같은 절차로 같이 신청

- 「글로벌 다인종 피부색」: 2,525명 × 조명 4종, 이마·볼·목의 **측색기 Lab 값** + Monk·Fitzpatrick 등급. 우리 ΔE 산식이 기계값과 맞는지 검증. AI Hub 검색에서 이름으로 찾기.
- 「한국인 피부상태 측정」: 1.4만 장, **스마트폰 포함 3기기**, 이마·볼·입술 부위 박스 + 수분·색소 등급. ΔE 기준선·부위별 피부색.
- 둘 다 영리 R&D 허용, 승인제. 링크와 규모 확인은 `datasets-ranked-v6.md` 2장.

---

## 3. 평가·참고용 (학습에는 안 넣음)

### 3-1. 얼굴 파싱 평가 라벨 (C-3) — 랜드마크 영역 겹침 시험

**1순위: EasyPortrait** (폰 전면카메라 셀피, FullHD, 9클래스, **CC BY-SA 4.0 변형** — 상업 가능 계열. 4차: **랜드마크로 잡은 눈썹·눈·입술 영역이 사람 라벨과 얼마나 겹치는지(IoU) 평가**에만 쓴다. 분할 모델을 하게 되면(B-3) 뼈대 학습용으로 승격. 실측 200장: 검출 100%, 홍채 25px 스펙 93% 충족)
- https://huggingface.co/datasets/gofixyourself/EasyPortrait · https://github.com/hukenovs/easyportrait
```
hf download gofixyourself/EasyPortrait --repo-type dataset --local-dir C:\data\danghwaeung\easyportrait
```

**차선 1: LaPa** (2.2만 장, 11클래스 + 106점 랜드마크, **비상업**) — https://github.com/JDAI-CV/lapa-dataset (README의 Drive 링크, `gdown`)

**차선 2: CelebAMask-HQ** (3만 장, 19클래스, **비상업**) — https://github.com/switchablenorms/CelebAMask-HQ (Google Drive 는 **쿼터 초과로 막힘** → HF 미러 사용) · Kaggle 미러 https://www.kaggle.com/datasets/ipythonx/celebamaskhq
```
kaggle datasets download -d ipythonx/celebamaskhq -p C:\data\danghwaeung\celebamask --unzip
```

**차선 3: Helen** (2,330장 380px, 부위 라벨) — http://www.ifp.illinois.edu/~vuongle2/helen/ · **라이선스 문구가 없어 불명**(2026-09-17 정정). 소규모 평가만.

**추가: Periorbital** (눈 크롭 2,842장, 홍채·흰자·눈꺼풀·누구·눈썹 5종 사람 라벨, **CC BY 4.0**) — Zenodo + GitHub `periorbital-dataset` · 눈썹·눈꺼풀 마스크 평가. 이걸로 MediaPipe 홍채가 사람 라벨보다 12% 작게 잡힌다는 것을 확인했다(`poc/datasets-eval/probe_iris.py`).

### 3-2. 화장 전/후 쌍 (채점 참고·전이 모델 비교) — 전부 비상업
- FFHQ-Makeup: https://huggingface.co/datasets/cyberagent/FFHQ-Makeup (`hf download cyberagent/FFHQ-Makeup --repo-type dataset`)
- MT·BeautyFace·LADN·Makeup-Wild 는 `datasets-v6.md` 표의 링크. **CPM 은 링크 사망.** 전부 학습 제외, 화장 전이 비교 발표용.

---

## 4. 받은 뒤 기록할 것 (저장소에 넣는 건 이것뿐)

`docs/data-inventory.md`(만들 예정)에 한 줄씩: 이름 · 받은 날 · 버전/파트 · 저장 경로 · 파일 수 · 라이선스 원문 링크 · 우리 용도(학습/평가/참고) · 화면 게시 가능 여부.

## 5. 라이선스 요약

| 용도 | 가능 | 불가 |
|---|---|---|
| 학습(가중치에 승계) | **자체 촬영·자체 라벨(동의서)**, AI Hub(학습만), Generated Photos(구매), SFHQ, SFHQ-T2I, FairFace(CC BY), EasyPortrait(SA) | FFHQ, CelebA-HQ, LaPa, FaceSynthetics, FFHQ-Makeup, MT, Helen(불명). **Face Shape(불명)는 1차 학습·실험까지만** |
| 앱 화면 게시 | 자체 촬영(동의서), 생성 이미지, Generated Photos(구매) | 위 전부(연구·비상업), Pexels/Unsplash 실존 인물(모델 릴리스 미검증) |
| 평가·참고 | 전부 가능(인용 조건 준수) | — |
