# 당화응 읽을 논문 목록 (2026-09-18)

분업안(`work-split-modules-v6.md`)의 모델 선정 평가 S-1~S-4 와 모듈별 "해야 할 것"에 직접 걸리는 논문만 골랐다. **★ = 먼저 읽을 것.** 각 항목에 "우리한테 왜 필요한가"와 "가져올 것"을 적었다. 제목·저자·연도·링크는 검색으로 확인했고, 본문 수치는 초록·요약 기준이라 읽으면서 다시 확인할 것.

---

## 1. 화장 전이 (모듈 ④ · S-1 화장 얹어보기 선정)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **Stable-Makeup: When Real-World Makeup Transfer Meets Diffusion Model** (Zhang, Yuan, Song, Liu) | SIGGRAPH 2025 / arXiv 2024 | https://arxiv.org/abs/2403.07764 · https://github.com/Xiaojiu-z/Stable-Makeup | 지금 쓰는 모델. Apache-2.0. 팀 실측 fp16 8 step 2.55초 | 구조(D-P 화장 인코더 + 내용·구조 제어), 학습 데이터 만든 법(우리 LoRA 때 참고), 평가 지표·비교 대상 |
| ★ | **SHMT: Self-supervised Hierarchical Makeup Transfer via Latent Diffusion Models** (Sun 외) | NeurIPS 2024 | https://arxiv.org/abs/2412.11058 · https://github.com/Snowfallingplum/SHMT | 벤치에서 비교한 모델(비상업이라 제품엔 못 씀). "짝 데이터 없이 자기지도"가 핵심 | 짝 데이터 없이 학습하는 방법 → 우리 룩 사진 10장으로 LoRA 할 때의 감독 신호 설계 |
| ★ | **Anchoring on Reality: Breaking the Pseudo-Target Ceiling in Makeup Transfer** (vivo) | ECCV 2026 | https://arxiv.org/abs/2606.31089 | 최신. "가짜 정답으로 학습하면 상한이 있다"는 문제 제기 + 2K 실사 화장 데이터 MF2K 8,573장 | 2단계 학습(가짜 정답 → 실제 참조로 재구성), 정체성 드리프트 측정법, MF2K 라이선스 확인 |
| | **EleGANt: Exquisite and Locally Editable GAN for Makeup Transfer** (Yang 외) | ECCV 2022 | https://arxiv.org/abs/2207.09840 · https://github.com/Chenyu-Yang-2000/EleGANt | S-1 경량 GAN 후보 1. 부위별 편집 가능 | 속도·VRAM, 부위별 국소 편집(우리 "부위별 화장 레이어"와 맞음), 라이선스 |
| | **SSAT: A Symmetric Semantic-Aware Transformer Network for Makeup Transfer and Removal** (Sun, Chen, Xiong) | AAAI 2022 | https://arxiv.org/abs/2112.03631 · https://github.com/Snowfallingplum/SSAT | S-1 경량 GAN 후보 2. 표정·자세 차이·가림·영상에서 검증됨 | 의미 대응(semantic correspondence)으로 화장 위치 맞추기 → 레이어 추출 정렬 참고. **화장 제거**도 됨(맨얼굴 복원) |
| | **BeautyREC: Robust, Efficient, and Content-preserving Makeup Transfer** | arXiv 2022 | https://arxiv.org/abs/2212.05855 | S-1 경량 GAN 후보 3. "효율" 강조 | 폰·저사양 GPU 속도, 내용 보존 지표 |
| | **PSGAN: Pose and Expression Robust Spatial-Aware GAN for Customizable Makeup Transfer** (Jiang 외) | CVPR 2020 oral | https://arxiv.org/abs/1909.06956 | 이 분야 기준선. 자세·표정 강건, 부분 전이·농도 조절 | 화장을 "공간 행렬"로 분리하는 아이디어 → 부위별 레이어·강도 슬라이더의 근거. PSGAN++(2105.12324)도 같이 |
| | **FLUX-Makeup: High-Fidelity, Identity-Consistent, and Robust Makeup Transfer via Diffusion Transformer** | arXiv 2025 | https://arxiv.org/abs/2508.05069 | 정체성 유지를 전면에 내세운 최신 확산 모델 | 정체성 유지 지표와 실패 사례 정의 → E-3 평가 설계 |
| | **EvoMakeup: High-Fidelity and Controllable Makeup Editing with MakeupQuad** | arXiv 2025 | https://arxiv.org/abs/2508.05994 | 화장 "편집"(부위별 조정) 관점 | 부위별 제어 방식, 평가 벤치마크 |
| ★ | **LCM-LoRA: A Universal Stable-Diffusion Acceleration Module** (Luo 외) | arXiv 2023 | https://arxiv.org/abs/2311.05556 | Stable-Makeup이 SD1.5 기반이라 그대로 꽂아 4~8 step 가능. S-1 샘플러 변형 후보 | 적용 방법, 품질 저하 정도, 우리 벤치에 한 줄 추가 |

**읽는 순서**: Stable-Makeup → LCM-LoRA → Anchoring on Reality → (GAN 후보 셋은 S-1 비교 직전에 라이선스·속도 절만).

---

## 2. 화장 데이터셋 (모듈 ⑤)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **FFHQ-Makeup: Paired Synthetic Makeup Dataset with Facial Consistency Across Multiple Styles** (CyberAgent) | arXiv 2025 | https://arxiv.org/abs/2508.03241 · https://huggingface.co/datasets/cyberagent/FFHQ-Makeup | 18K명 × 화장 5종 = 90K 짝 데이터. 비상업(CC BY-NC-SA)이라 참고·평가만 | 맨얼굴 짝을 3DMM으로 만든 방법, "화장하면 색이 얼마나 변하나" 통계의 출처, 분할 모델을 꺼낼 때(S-3 C) 라벨 0 학습 데이터 |
| ★ | **EasyPortrait – Face Parsing and Portrait Segmentation Dataset** (Kvanchiani 외, SberDevices) | arXiv 2023 | https://arxiv.org/abs/2304.13509 · https://github.com/hukenovs/easyportrait | 우리 E-4(부위 영역 IoU)의 정답지. 폰 셀피 40K장, 9클래스, 상업 가능 계열 | 라벨 기준(눈썹·입술 경계를 어디까지로 봤나), 학습된 모델 성능표(S-3 C 후보) |
| | **Face shape classification using Inception v3** (Tio) | arXiv 2019 | https://arxiv.org/abs/1911.07916 | Kaggle Face Shape 5,000장의 원 논문(연예인 사진 5분류) | 데이터가 어떻게 모였고 라벨을 누가 붙였는지 → 1차 학습까지만 쓰는 근거 |

---

## 3. 얼굴형 분류 (모듈 ⑤ · S-2)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **Automatic Face Shape Classification Via Facial Landmark Measurements** | 2021 | https://www.researchgate.net/publication/357247661 | 우리 현행 규칙과 같은 접근(랜드마크 비율 4개: 가로세로비, 이마/광대, 턱/광대, 턱 각도). 96% 주장 | 어떤 비율을 썼고 어떤 데이터에서 96%인지(우리 규칙이 36~65%라는 다른 논문과 왜 다른가) → S-2 후보 B(비율 특징 + 분류기)의 특징 설계 |
| | **Human Face Shape Classification with Machine Learning** | 2022 | https://www.researchgate.net/publication/362903132 | 랜드마크 거리·비율·각도 + 고전 ML | 특징 목록, 라벨 방법 |
| | **A Deep Learning Approach To Face Shape Classification For Hairstyle, Beauty And Eyewear Recommendations** | IEEE 2024 | https://ieeexplore.ieee.org/document/10851601 | S-2 후보 C(CNN). GoogLeNet 91%, MobileNetV3 89.7% 등 비교표 | 어떤 백본이 폰에 맞는지, 데이터셋(아마 Kaggle 셋) |
| | **Deep learning based face shape classification system with binary feature selection model** | Expert Systems with Applications 2025 | https://www.sciencedirect.com/science/article/abs/pii/S0957417425027320 | EfficientNetV2S 전이학습 + 특징 선택 | 소형 모델로 가는 방법, 정확도 |
| | **3D-Guided Face Shape Classification** (CSU 석사) | 2020년대 | https://scholarworks.calstate.edu/downloads/p2676x78x | 2D가 자세에 흔들리는 문제를 3D로 | 자세 정규화 아이디어(우리는 정면 게이트로 대신) |

**핵심 질문**: 같은 5분류인데 논문마다 36~96%로 벌어진다. 데이터(연예인 정면 사진 vs 셀피)와 라벨(누가 붙였나) 차이다. 우리 E-2에서 **라벨러 간 일치율을 먼저 재는 이유**가 여기 있다.

---

## 4. 채점·색 (모듈 ③ · S-4 색 보정 · E-1)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **The CIEDE2000 color-difference formula: Implementation notes, supplementary test data, and mathematical observations** (Sharma, Wu, Dalal) | Color Research & Application 2005 | https://doi.org/10.1002/col.20070 · https://www.ece.rochester.edu/~gsharma/ciede2000/ | 우리 ΔE 구현이 맞는지 검증하는 표준 테스트 데이터 | 테스트 쌍으로 `score.js` ΔE 검증(지금은 ΔE76인지 2000인지부터 확인), 피부색 범위에서 둘의 차이 |
| ★ | **Bridging Accessibility and Precision: Evaluating the Reliability and Validity of a Smartphone-Based Skin Colorimeter** | PMC 2025~26 | https://pmc.ncbi.nlm.nih.gov/articles/PMC13050169/ | 폰 카메라로 피부 Lab을 재면 얼마나 믿을 수 있나(ICC 0.85~0.95). 우리 S-4의 근거 | 색 보정 방법(신경망 보정, 플래시 표준 조명), 기기 간 편차 크기 → 우리 "확인만" 임계 |
| | **Accuracy and precision of smartphone colorimetry: RGB, HSV, CIELAB 비교** | 2024 | https://www.tandfonline.com/doi/full/10.1080/20548923.2024.2444168 | 폰 사진 색 측정의 정확도·정밀도 | 색 보정 전후 정확도, 어떤 색 공간이 안정적인가 |
| | **Geometric Feature Enhancement for Robust Facial Landmark Detection in Makeup Paper Templates** | Applied Sciences 2026 | https://doi.org/10.3390/app16020977 | "화장 실기 자동 채점"을 다룬 거의 유일한 논문. 종이 템플릿 11,600장 | 자동 채점의 문제 정의와 평가 방식, 화장이 랜드마크 검출을 어떻게 흔드는지(우리 "화장 편향" 문제와 같음) |
| | **Face Image Quality Assessment: A Literature Survey** | arXiv 2020 | https://arxiv.org/abs/2009.01103 | 품질 게이트(선명·밝기·자세) 지표의 출처 | 선명도·조명·자세 지표 정의, 임계 잡는 법 |

**S-4 관련 특허 메모**: "Automatic white balance with facial color features as reference color surfaces"(US 9,565,410 / RE47,960). 얼굴 피부색을 참조로 화이트밸런스를 잡는 방법이 특허로 있다. 우리 눈 흰자·인접 피부 대비 방식이 어디까지 겹치는지 사업화 때 확인.

---

## 5. 랜드마크·실시간·안정화 (모듈 ②)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **Attention Mesh: High-fidelity Face Mesh Prediction in Real-time** (Grishchenko 외, Google) | arXiv 2020 | https://arxiv.org/abs/2006.10962 | MediaPipe Face Landmarker의 원리. 눈·홍채·입술에 주의 모듈 | 어느 점이 정밀하고 어느 점이 약한지(우리 실측: 눈 바깥 끝·턱이 흔들림), 홍채 추정 방식(12% 작게 나오는 이유) |
| ★ | **Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs** (Kartynnik 외, Google) | arXiv 2019 | https://arxiv.org/abs/1907.06724 | 468점 메시의 원 논문. **시간축 떨림을 점마다 1차원 필터로 잡는다**고 명시 | 그 필터 설계(우리 One-Euro 적용의 근거), 메시 삼각화(④ 텍스처 워핑에 그대로) |
| ★ | **1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems** (Casiez, Roussel, Vogel) | CHI 2012 | https://doi.org/10.1145/2207676.2208639 · https://gery.casiez.net/1euro/ | 흔들림 대응 2순위. 4쪽, 파라미터 2개 | 파라미터(`mincutoff`, `beta`) 튜닝 절차, 구현 코드(공식 저장소) |
| | **Steadiface: Real-Time Face-Centric Stabilization on Mobile Phones** (Google) | arXiv 2019 | https://arxiv.org/abs/1905.01382 | 폰에서 랜드마크 노이즈로 가상 카메라가 떨리는 문제 → 부드러운 머리 궤적 추정 | "확대 크롭 창이 흔들림" 문제의 정석 해법(크롭 데드존·경로 평활화) |
| | **Towards stabilizing facial landmark detection and tracking via hierarchical filtering** | J. Franklin Inst. 2019 | https://www.sciencedirect.com/science/article/abs/pii/S0016003219309561 | 전역 자세는 3D 모델로, 부위별 점은 칼만 + 품질 평가 | 우리 "강체 변환 + 점별 필터" 2단 구조의 근거 |
| | **Blendshapes GHUM: Real-time Monocular Facial Blendshape Prediction** (Google) | arXiv 2023 | https://arxiv.org/abs/2309.05782 | MediaPipe가 주는 블렌드셰이프(눈 감음·입 벌림 계수) | EAR·MAR 대신 블렌드셰이프로 표정 게이트를 만들 수 있는지 |

---

## 6. 서버 쪽 선택 모델 (모듈 ④, MVP 밖)

| 논문 | 어디 | 링크 | 왜 |
|---|---|---|---|
| **Rethinking Inductive Biases for Surface Normal Estimation (DSINE)** (Bae, Davison) | CVPR 2024 oral | https://github.com/baegwangbin/DSINE | 법선 1순위였으나 비상업. 확장 단계에 Marigold-Normals와 비교할 때 |
| **BiSeNet: Bilateral Segmentation Network for Real-time Semantic Segmentation** | ECCV 2018 | https://arxiv.org/abs/1808.00897 | S-3 후보 B(얼굴 파싱). 가중치는 CelebAMask-HQ 조건 |
| **ArcFace: Additive Angular Margin Loss for Deep Face Recognition** | CVPR 2019 | https://arxiv.org/abs/1801.07698 | E-3 정체성 유지 지표(코사인 유사도)의 출처. 임계 0.6의 근거를 여기서 |

---

## 7. 우리 서비스와 같은 문제를 다룬 것 (HCI, 발표 "관련 연구" 절용)

| ★ | 논문 | 어디 | 링크 | 왜 읽나 | 가져올 것 |
|---|---|---|---|---|---|
| ★ | **OperARtistry: An AR-based Interactive Application to Assist the Learning of Chinese Traditional Opera Makeup** (Fan 외) | Chinese CHI 2023 | https://arxiv.org/abs/2311.11269 | **단계별 지시 + 보조선 + 색 안내를 얼굴 점에 맞춰 띄우는 AR 화장 학습 앱.** 우리와 구조가 가장 가깝다 | 사용자 실험 설계(초보자, 가이드 유무 비교), 보조선 표현, 한계 절 → 우리 F-2 사용자 실험 10명 설계 |
| | **WeldAR: Augmenting Live Hands-On Training with In-Situ Guidance for Novice Learners** | arXiv 2026 | https://arxiv.org/abs/2603.07959 | 손 기술을 실시간 AR로 코칭. "초보자에겐 연속 안내, 숙련자에겐 요청 시 피드백" | 피드백 타이밍 설계(우리는 "확인받기" 버튼만) 근거 |
| | 특허 **Digital makeup artist / Digital makeup palette / Makeup compact for guiding makeup application** (L'Oréal 계열 등) | USPTO | 검색 결과의 US 11,776,187 · 12,136,173 · 10,537,165 | 사업화 시 회피 설계. 이미 문서에 있는 US 10,650,224(쉐딩)와 함께 | 청구항 범위만 |

---

## 8. 읽는 순서 제안

1. **이번 주**: Stable-Makeup, LCM-LoRA, Attention Mesh + Face Mesh(1907.06724), 1€ Filter, CIEDE2000 구현 노트, OperARtistry. — 지금 코드에 바로 닿는 것.
2. **S-1·S-2 비교 직전**: Anchoring on Reality, SHMT, EleGANt·SSAT·BeautyREC(라이선스·속도 절), 얼굴형 논문 셋(96%·91%·36~65%가 왜 다른가).
3. **E-3·S-4 설계 때**: FLUX-Makeup(정체성 지표), 폰 피부색 측정 논문 둘, 화장 템플릿 채점 논문.
4. **확장 단계**: FFHQ-Makeup(분할 모델 라벨 0 학습), DSINE, BiSeNet.

읽고 나면 각 논문에서 "우리 가정값을 바꿔야 하는 숫자"가 나오는지만 한 줄씩 `docs/eval-results-v6.md` 옆에 적어 두면 된다.
