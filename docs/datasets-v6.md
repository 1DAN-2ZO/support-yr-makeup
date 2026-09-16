# 당화응 — 데이터셋 링크 (v6)

> 2026-09-14 확인 · 2026-09-16 얼굴 파싱·한국인 얼굴 추가. 라이선스는 다운로드 전에 페이지에서 다시 확인할 것. "연구용"은 발표·과제 사용은 되고 사업화 시 교체 필요.
> 어떤 기술에 쓰이는지는 `tech-stack-v6.md` 참조.

## 얼굴형 — 쉐딩·하이라이트 규칙 검증용 (v6)

| 이름 | 규모 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|
| Face Shape Dataset (Kaggle, niten19) | 5,000장, 5분류(Heart·Oblong·Oval·Round·Square) 각 1,000장, train 800/test 200, 여성 연예인 | https://www.kaggle.com/datasets/niten19/face-shape-dataset | 페이지에서 확인 (이전 조사 CC0로 기록, 재확인 필요) | 얼굴형 규칙(쉐딩·하이라이트용) 판정 일치율 확인. 별도 분류 모델은 두지 않음 |
| Face Shape Preprocessed (Kaggle, zeyadkhalid) | 위 데이터 전처리본 | https://www.kaggle.com/datasets/zeyadkhalid/faceshape-processed | 페이지에서 확인 | 같은 용도, 정렬·크롭 완료 |
| Face Shape Oval/Round/Square (Kaggle, attanmhd) | 3분류 | https://www.kaggle.com/datasets/attanmhd/face-shape-oval-round-square/data | 페이지에서 확인 | 보조 |

## 화장 (화장 전/후, 화장 전이)

| 이름 | 규모 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|
| **FFHQ-Makeup** (CyberAgent, 2025) | 18,000명 × (맨얼굴 1 + 화장 5) = 108,000장, 512×512, **같은 얼굴의 맨얼굴·화장 쌍, 기하 정렬됨** | https://huggingface.co/datasets/cyberagent/FFHQ-Makeup · 논문 https://arxiv.org/abs/2508.03241 | CC-BY-NC-SA-4.0 (비상업) | **평가·개발 참고 전용 (2026-09-16 변경).** 맨얼굴-화장 차이가 곧 정답 마스크라 품질은 최고지만, 비상업 조건이 학습한 가중치에 승계되므로 **학습에는 쓰지 않는다.** 학습은 자체 합성 100% (`tech-stack-v6.md` 8-4) |
| MT (Makeup Transfer, BeautyGAN) | 3,834장 (맨얼굴 1,115 + 화장 2,719), 256×256, 68점 정렬 | Drive https://drive.google.com/file/d/18UlvYDL6UGZ2rs0yaDsSzoUlw8KI5ABY/view · 프로젝트 http://colalab.org/projects/BeautyGAN · 코드 https://github.com/wtjiang98/BeautyGAN_pytorch | 연구용 (명시 라이선스 없음) | 화장 전이 모델 참고·평가, 화장 분포 통계 |
| BeautyFace (BeautyREC) | 3,000장, 512×512, 얼굴 파싱 맵 포함 | Drive https://drive.google.com/file/d/1mhoopmi7OlsClOuKocjldGbTYnyDzNMc/view · 코드 https://github.com/learningyan/BeautyREC | 연구용 (명시 라이선스 없음) | 파싱 맵이 있어 부위 마스크 학습·평가에 유용 |
| CPM-Real / Synt-1 / Synt-2 / Stickers (VinAI) | 3,895 / 5,555 / 1,625쌍+1,115 / 577장 | https://public.vinai.io/CPM-datasets/CPM-Real.zip · https://public.vinai.io/CPM-datasets/CPM-Synt-1.zip · https://public.vinai.io/CPM-datasets/CPM-Synt-2.zip · https://public.vinai.io/CPM-datasets/Stickers.zip · 설명 https://github.com/VinAIResearch/CPM/blob/main/about-data.md | 연구·교육 전용, 재배포 금지, 인용 필수 | 실제 환경(in-the-wild) 화장 사진, 진한 화장 평가 |
| LADN | 635장 (화장 전/후 비대응 + 합성 정답), Face++ 랜드마크 포함 | Drive https://drive.google.com/file/d/1Y0AlgKSVZNsjUG4u0YUHzoxtsG0qgexZ/view · 코드 https://github.com/wangguanzhi/LADN | 연구용 (명시 라이선스 없음) | 진한 화장 보조 |
| Makeup-Wild (PSGAN) | 772장, 다양한 자세·표정 | 목록 https://github.com/thaoshibe/awesome-makeup-transfer (OneDrive 링크 있음) · 코드 https://github.com/wtjiang98/PSGAN | 연구용 | ±30° 자세에서 트래킹·채점 평가 |
| Makeup Detection Face Dataset (Kaggle, tapakah68) | 같은 사람의 화장 전/후 사진 | https://www.kaggle.com/datasets/tapakah68/makeup-detection-dataset · HF https://huggingface.co/datasets/TrainingDataPro/makeup-detection-dataset | 페이지에서 확인 (상업 데이터 업체 샘플일 가능성) | 같은 사람 전/후라 ΔE 기준선 검증에 유용, 규모 확인 필요 |
| Makeup or No Makeup (Kaggle, petersunga) | 화장 유무 분류 | https://www.kaggle.com/datasets/petersunga/make-up-vs-no-make-up | 페이지에서 확인 | 보조 |
| Antitza Dantcheva Makeup datasets (YMU·VMU·MIW·MIFS) | 200~600장씩 4종 | http://www.antitza.com/makeup-datasets.html | 연구용, 신청 필요 | 보조 |

## 얼굴 파싱 — 부위 마스크 (2026-09-16 추가)

서버 얼굴 파싱 모델(F-05)과 분할 모델 평가(F-08)에 쓴다. 우리는 **눈썹·눈·윗입술·아랫입술이 좌우로 나뉜** 라벨이 필요하다.

| 이름 | 규모 | 분류 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|---|
| **CelebAMask-HQ** | 30,000장, 512×512 | **19분류** (피부·코·좌우 눈·좌우 눈썹·입·윗입술·아랫입술·머리카락·안경·귀걸이·목·옷), 전부 수동 라벨 | https://github.com/switchablenorms/CelebAMask-HQ | **비상업** | 얼굴 파싱 **1순위**. BiSeNet 사전학습 가중치가 이걸로 학습됨 |
| **LaPa** | 22,168장 (train 18,176 / val 2,000 / test 2,000) | 11분류, **좌우 눈썹·좌우 눈·윗입술·아랫입술 분리** | 논문·배포처는 `awesome` 목록 참조 | **비상업** | 우리 부위 구분과 가장 잘 맞음. 보조 학습·평가 |
| EasyPortrait | — | 얼굴 파싱 + 인물 분할. **고개 각도·가림이 다양**하도록 만들어짐 | https://arxiv.org/pdf/2304.13509 | 페이지에서 확인 | ±30° 자세·손 가림 평가 |
| **Helen · iBugMask · LFW-Part Labels** | 각 수천 장 | 기본 부위 | `awesome` 목록·각 프로젝트 페이지 | **라이선스 제약 없음** | **사업화 대비 재학습용 — 확보해 둘 것** |

> ⚠️ **가중치에 조건이 따라붙는다.** BiSeNet face-parsing 구현 코드는 MIT여도 **사전학습 가중치는 CelebAMask-HQ(비상업)로 학습**된 것이다. 발표·과제는 문제없지만 사업화 시에는 Helen·iBugMask로 재학습해야 한다. 법선 모델(DSINE)과 같은 종류의 리스크다.

## 한국인 얼굴 — 조명·각도 검증 (2026-09-16 추가)

| 이름 | 규모 | 구성 | 링크 | 조건 | 용도 |
|---|---|---|---|---|---|
| **AI Hub 「한국인 안면 이미지」** | **1,000명 × 약 3만장 = 약 2,860만 장** | 각도 **20종** · 조명 **30종** · 표정 3종 · 가림 6종 · 해상도 3종 | https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=83 | **내국인만 신청 가능**, 승인 후 다운로드. 개인정보 동의 갱신에 따라 일부만 공개 | ① **조명 30종으로 Lab·ΔE 기준이 버티는지 검증**(최대 리스크) ② 각도 20종으로 ±30° 트래킹 평가 ③ 한국인 얼굴형 비율 규칙(F-02) 보정 |
| AI Hub 「마스크 착용 한국인 안면 이미지」 | — | 가림 상황 | https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=469 | 같음 | 보조 (손 가림 판정 참고) |

> 기존 목록은 FFHQ(서양 중심)·연예인 사진이라 **한국인 일반인 기준이 없다.** 발표에서도 "한국인 데이터로 검증"이 강점이 되고 **승인에 시간이 걸리므로 1주차에 신청부터 걸어 둘 것.**

## 부위 전용 — 눈썹·눈·입술 (2026-09-16 추가)

부위별 채점(F-08·F-09)은 얼굴 전체 파싱보다 정밀한 라벨이 필요하다. 특히 눈썹·아이라이너·섀도우는 좌우를 같이 본다.

| 이름 | 규모 | 라벨 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|---|
| **Periorbital Segmentation Dataset** (2024) | 2,842장 (Chicago Facial 827 + CelebAMask-HQ 2,015), 5명이 CVAT로 수동 라벨, 라벨러 간 Dice 0.82 | **홍채 · 공막(흰자) · 눈꺼풀 · 누구 · 눈썹 5종** | Zenodo + GitHub `periorbital-dataset` (AI in Ophthalmology Center) · 논문 https://pmc.ncbi.nlm.nih.gov/articles/PMC12417369/ | **CC BY-NC-ND** (비상업 + **변경 금지**) | 눈썹·섀도우 마스크 평가. **홍채·흰자 라벨이 있어 우리 mm 척도(홍채 11.7mm)와 흰자 흰색 참조를 그대로 검증할 수 있다** |
| Makeup Lips Segmentation 28K (Kaggle, olekslu) | 28,000장, 자동 라벨 | 입술 마스크 | https://www.kaggle.com/datasets/olekslu/makeup-lips-segmentation-28k-samples | 페이지에서 확인 | 입술 부위 분할 보조 학습 |
| Lipstick Image Classification (images.cv) | — | 립스틱 분류 + 마스크 | https://images.cv/dataset/lipstick-image-classification-dataset | **상업 사용 무료** | 색 계열 자동 제안(F-04) 보조 |

> ⚠️ Periorbital은 **ND(변경 금지)**라서 크롭·리사이즈한 파생본을 배포할 수 없다. 학습보다는 **내부 평가 전용**으로 쓰고, 결과 수치만 발표에 싣는다.

## 룩 참조 이미지 10장 — 아직 미정 (F-04 콘텐츠)

룩 템플릿 10개의 참조 이미지는 **화장 전이 모델 입력이자 화면 2 썸네일로 사용자에게 보이는 이미지**다. 학습 데이터와 라이선스 조건이 다르다.

| 방법 | 가능 여부 | 근거 |
|---|---|---|
| MT · BeautyFace · CPM · FFHQ-Makeup 사진 사용 | **불가** | 전부 연구·비상업 전용. 앱 화면에 띄우는 건 연구 용도가 아니다 |
| Unsplash · Pexels 무료 사진 | **위험** | 상업 사용은 되지만 **초상권(모델 릴리스)은 별도**이고, Unsplash는 "유사 서비스를 만들기 위한 이미지 수집"을 금지한다. 실제 인물 얼굴을 룩 샘플로 띄우는 건 피할 것 |
| **팀원·지인 자체 촬영 + 서면 동의** | **추천** | 초상권·라이선스 둘 다 깨끗. 10개 룩이면 감당 가능한 분량 |
| 화장 전이 모델로 생성한 이미지 | 가능 | 참조 스타일은 문서로 정의하고 이미지는 생성본 사용. 얼굴이 실존 인물이 아님 |

> 1주차 "룩 4개 템플릿·제품 목록 정의" 때 **어느 방법으로 갈지 먼저 정해야** 이후 작업이 안 꼬인다.

## 목록 페이지
- awesome-makeup-transfer (데이터셋·논문 총정리): https://github.com/thaoshibe/awesome-makeup-transfer

## 우리 용도 매핑

| 우리 작업 | 1순위 | 보조 |
|---|---|---|
| CV 화장 영역 시맨틱 분할 모델 학습 | **자체 합성 100%** (맨얼굴 = 팀원 촬영·샘플 20장) | FFHQ-Makeup·BeautyFace·MT는 **평가·개발 참고 전용** |
| 분할 모델 평가 (실제 사진) | 자체 라벨 200~500장 | CPM-Real, Makeup-Wild |
| **얼굴 파싱 모델 (서버, F-05)** | **CelebAMask-HQ** | LaPa, EasyPortrait |
| **눈썹·섀도우 마스크 평가** | **Periorbital** (평가 전용, ND) | LaPa |
| **홍채 mm 척도·흰자 참조 검증** | **Periorbital** (홍채·공막 라벨) | 팀원 자가 촬영 |
| **입술 마스크** | Makeup Lips Segmentation 28K | LaPa, CelebAMask-HQ |
| **사업화 대비 재학습** | **Helen · iBugMask · LFW-Part** (라이선스 제약 없음) | — |
| 화장 전이(얹어보기) 모델 참고·평가 | MT, BeautyFace | CPM, LADN |
| ΔE 기준선·조명 검증 | **AI Hub 한국인 안면 이미지 (조명 30종)** | 팀원 자가 촬영, Makeup Detection (같은 사람 전/후) |
| ±30° 트래킹 평가 | AI Hub 한국인 안면 이미지 (각도 20종) | Makeup-Wild, EasyPortrait |
| 얼굴형 규칙 일치율 (쉐딩·하이라이트) | Face Shape Dataset | Preprocessed 판, AI Hub(한국인 비율 보정) |

## 주의
- FFHQ-Makeup·CPM은 비상업·연구 전용. 발표와 과제는 가능하나 사업화 시 학습 데이터 교체 또는 자체 데이터로 재학습 필요.
- Kaggle 라이선스는 페이지 우측 "License" 칸에서 직접 확인. CC0가 아니면 위와 같은 조건.
- Google Drive 링크는 소유자가 닫을 수 있으니 받는 즉시 팀 저장소에 사본 보관(재배포 금지 조건은 지킬 것).
- **학습용 데이터와 화면에 보이는 이미지는 조건이 다르다.** 비상업·연구 전용 데이터셋은 모델 학습·평가에는 쓸 수 있어도 앱 화면(룩 썸네일 등)에 그대로 띄울 수 없다. 위 "룩 참조 이미지" 항목 참조.
- AI Hub는 **내국인만 신청** 가능하고 승인에 시간이 걸린다. 1주차에 신청부터 걸어 둘 것.
