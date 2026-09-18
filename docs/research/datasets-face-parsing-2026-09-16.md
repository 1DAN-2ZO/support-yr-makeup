# 얼굴 파싱·부위 세그멘테이션 데이터셋 조사 (원문, 2026-09-16)

## 얼굴 파싱·부위 세그멘테이션 데이터셋 조사 결과 (2026-09-16 확인)

기준: MediaPipe 478pt → 6클래스(배경/눈썹/아이라이너/아이섀도/입술/블러셔) 분할 → 부위 채점. 필요 조건 = 좌/우 눈썹·눈 분리, 윗/아랫입술 분리, 홍채 라벨(mm 스케일), ±30° 포즈, 폰 사진, 상업화 가능 라이선스.

### 한눈에 보기

| # | 데이터셋 (연도) | 규모 · 해상도 | 라벨 (L/R 분리 · 입술 상/하 · 홍채) | 다운로드 방식 · 용량 | 라이선스 (원문 인용) · 상업 | 벤치마크 | 포즈/다양성 |
|---|---|---|---|---|---|---|---|
| 1 | **CelebAMask-HQ** (2019, MaskGAN CVPR'20) | 30,000장 · 이미지 1024², 마스크 512² | 19클래스: background, skin, nose, eye_g, **l_eye, r_eye, l_brow, r_brow**, l_ear, r_ear, mouth, **u_lip, l_lip**, hair, hat, ear_r, neck_l, neck, cloth. L/R ○, 입술 상/하 ○, **홍채 ×** | Google Drive zip **2.94 GB** (Baidu, Kaggle 미러 `ipythonx/celebamaskhq`, HF 미러 `liusq/CelebAMask-HQ`) | "available for **non-commercial research purposes only** … not reproduce, duplicate, copy, sell, trade, resell or exploit for any commercial purposes" → 상업 **불가** | SegFace(AAAI'25) mean F1 **89.22** (ConvNeXt 512) / 88.96 (Swin-B); FaceXFormer(ICCV'25) 92.01 F1 @224 (프로토콜 상이) | 연예인 정면 위주, 포즈 각도 통계 없음. 인종 비율 미공개(미확인). CelebA 유래 → 서구권 편중 지적 있음 |
| 2 | **LaPa** (AAAI 2020, JD) | 22,176장 (18,176/2,000/2,000) · 해상도 가변(미확인) | 11클래스: background, skin, **left/right eyebrow, left/right eye**, nose, **upper lip, inner mouth, lower lip**, hair. L/R ○, 입술 ○, 홍채 × · 106pt 랜드마크 동봉 | Google Drive / Baidu(코드 LaPa) · 용량 미확인 | "made freely available to academic and non-academic entities for **non-commercial purposes** such as academic research, teaching, scientific publications, or personal experimentation" → 상업 **불가** | SegFace mean F1 **93.03** (2025); RTNet 92.5 (2021); FaceSynthetics 합성만 학습 90.1 | "abundant variations in expression, pose and occlusion" (각도 통계 없음). 아시아인 비율 미확인(중국 JD 구축) |
| 3 | **Helen 파싱판** (Smith et al. CVPR 2013) | 2,330장 (2,000/230/100) · 리사이즈본 제공 | 11클래스(라벨 00–10): background, face skin, **left/right eyebrow, left/right eye**, nose, **upper lip, inner mouth, lower lip**, hair. 홍채 × | wisc 프로젝트 페이지 zip (README만 확인, 용량 미확인). 원본 Helen(ifp.illinois.edu)은 확인 시점 접속 불가 | README에 라이선스 문구 **없음(미확인)**. 이미지는 Flickr "portrait" 검색 수집 → 상업 **불명확** | RTNet mean F1 91.8 (2021); FaceSynthetics 합성만 92.0 | 대체로 정면~준정면. 인종 통계 없음 |
| 4 | **iBugMask** (IVC 2021, Imperial iBUG) | 학습 21,866 (Helen 재라벨 + 3DDFA 프로파일링 합성) / 테스트 1,000 (300W·Menpo 유래) | 11클래스(Helen과 동일 L/R·입술 분리) + 14클래스 변형(귀 L/R, 안경). 홍채 × | `https://ibug.doc.ic.ac.uk/download/rtnet/ibugmask_release.zip` 직접 다운로드 + Google Drive · 용량 미확인 | 코드 리포는 MIT. **데이터셋 자체 라이선스 문구 없음(미확인)**; iBUG 페이지에도 없음 → 상업 **불명확** | RTNet F1: inner parts 85.8 / skin 91.8 / hair 81.8 (2021) | **포즈 강점**: 학습 14,692장 \|yaw\|≥30°, 6,880장 ≥60°; 테스트 413장 ≥30°, 241장 ≥60°. 단 큰 각도는 합성(3DDFA) |
| 5 | **LFW Part Labels** (CVPR 2013) | 2,927장 · 250×250 (superpixel 라벨) | hair / skin / background **3클래스만** → 눈썹·입술 없음 | 공식 `vis-www.cs.umass.edu/lfw/part_labels/` — 확인 시점 DNS 실패(미확인). 91 MB 특징 + 1 MB 라벨 tar.gz | 라이선스 미확인 | — | 부위 채점엔 부적합 |
| 6 | **EasyPortrait v2** (SberDevices, 2023→2024 v2) | **40,000장** (30k/4k/6k) · ~FullHD · 13,705명 | 9클래스: 0 background, 1 person, 2 skin, **3 left brow, 4 right brow, 5 left eye, 6 right eye, 7 lips, 8 teeth**. L/R ○, **입술 상/하 ×(단일 lips)**, 홍채 × | 직접 링크(이미지 91.8 GB, 주석 657 MB; train 68.3/val 10.7/test 12.8 GB) + Kaggle + HF `gofixyourself/EasyPortrait`(56 GB, v1 20k) | README: "licensed under a **variant** of Creative Commons Attribution-ShareAlike 4.0". PDF 전문 확인: "This license is **not a Creative Commons license**. The text … is a reworking of a … (Attribution-ShareAlike 4.0) license", 러시아 민법 기준. **비상업 제한 조항 없음**, ShareAlike·저작자표시 의무 → 상업 **가능으로 읽힘(단 SA 전파 범위는 법률 검토 필요)** | 얼굴파싱 mIoU: SegFormer-B0 1024² **85.42**, FPN-R50 85.37, DeepLabv3 79.11 | **폰 전면카메라/모니터 앞 셀피** = 우리 도메인과 가장 유사. "diversity by region, race, human emotions and lighting" 명시, 아시아 비율 수치 미확인. 포즈 각도 통계 없음 |
| 7 | **FaceSynthetics** (Microsoft ICCV 2021) | 100,000장 합성 · 512² | 19클래스: BACKGROUND, SKIN, NOSE, **RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW**, R/L_EAR, MOUTH_INTERIOR, **TOP_LIP, BOTTOM_LIP**, NECK, HAIR, BEARD, CLOTHING, GLASSES, HEADWEAR, FACEWEAR (+IGNORE 255). 홍채 클래스 × (70pt 랜드마크에 **동공 중심** 포함) | 직접 zip: 100장 34 MB / 1,000장 320 MB / 전체 **32 GB**(4분할) | Microsoft **R-UDA**: "use the Data solely for Computational Use for **non-commercial research**" / "may not use the Data or any Results in any commercial offering, including as part of a product or service (or to improve any product or service)" → 상업 **불가(결과물 포함)** | 합성만 학습: Helen F1 92.0(실데이터 92.4), LaPa 90.1(90.9); 300W NME 3.09/4.86 | "randomly position a camera around the head" (각도 범위 수치 미확인). 511명 스캔 "range of age and ethnicity" |
| 8 | **FaceOcc** (2022, TAIMA) | CelebA-HQ 30k+ 가림 마스크 + 인터넷 수집 마스크/스카프 · 256² | 가림(occlusion) 마스크 → CelebAMask-HQ 속성 마스크에서 빼서 얼굴 영역 생성. 부위 라벨 신규 없음 | Google Drive 폴더 · 용량 미확인 | 리포 **MIT**("permission notice shall be included in all copies or portions of the data"). 단 원본 이미지는 CelebAMask-HQ 비상업 상속 → 실질 상업 **불명확** | ResNet18-UNet, COFW 507장 IoU **93.7%** (이전 87.0) | 선글라스·손·마스크·마이크 등 가림 다양. 각도 통계 없음 |
| 9 | **FASSEG** (ICIP 2015 / ICME 2017, Mendeley v2019) | Frontal01/02 70장, Frontal03 150장(쌍둥이), Multipose01 200+장 (Pointing'04) | **6클래스**: mouth, nose, eyes, hair, skin, background → L/R ×, 입술 상/하 ×, 눈썹 × | GitHub 리포 / Mendeley Data · 용량 미확인 | Mendeley: "**CC BY 4.0**" → 상업 **가능** | (구식, 미확인) | Multipose01은 다각도이나 너무 작음(200장) |
| 10 | **Periorbital Segmentation Dataset** (2024, Zenodo, Ophthalmology Science) | 2,842장 (CFD 827 + CelebAMask-HQ 2,015) · 눈 크롭, 정중선 분할 후 256² 학습 | **iris, sclera, lid, caruncle, brow** 5클래스 (좌/우는 분할 이미지로 처리, 별도 라벨 ×) → **홍채 ○(mm 스케일용)** | Zenodo `records/13916845` zip **190.1 MB** + 파이썬 변환 스크립트, pip `periorbital-package` | Zenodo: "**Creative Commons Attribution 4.0 International**" → 상업 **가능**(단 CelebAMask-HQ 유래 2,015장은 원본 NC 상속 위험 → 미확인) | DeepLabV3-R101 Dice: iris 0.93, sclera 0.81, brow 0.85, lid 0.79, caruncle 0.65 (합본) | CFD 정면 스튜디오; CFD 인종: Asian 109/Black 197/Indian 142/Latin 108/Mixed 88/White 183 |
| 11 | **Makeup. Pixel Perfect Lips Segmentation (28K)** (Kaggle `olekslu`, 2020) | 28K+ · 해상도 미확인 · **2.55 GB** | 입술 단일 마스크. "annotated with the custom **semisupervised** image annotation algorithm … 6 hours to prepare whole dataset" → 자동 라벨, 품질 미검증 | Kaggle 다운로드(계정 필요) | 페이지 메타 "**CC0: Public Domain**" → 상업 가능(단 원본 이미지 출처 미표기 → 미확인) | 없음 | 미확인 |
| 12 | **Lips Segmentation Dataset** (Kaggle `remainaplomb`, 2022) | 5,066장 · 673×502~960×1300 | lips 1클래스 | Kaggle · 용량 미확인 | DatasetNinja: "**Unknown**" → 미확인 | — | 남녀 동수, "Male and Female Faces Dataset" 유래 |
| 13 | **WFLW** (CVPR 2018) | 10,000 얼굴 (7,500/2,500) · WIDER FACE 유래 | **98pt 랜드마크** (눈썹 상·하 윤곽, 눈 윤곽, 입술 외·내 윤곽) + 속성: pose, occlusion, **make-up**, illumination, blur, expression | Google Drive / Baidu; images 724 MB + annotations 15.6 MB | 공식 페이지·LAB 리포에 **라이선스 문구 없음(미확인)**; hyper.ai는 "Other" 표기 | — (랜드마크 벤치) | pose/occlusion/make-up 서브셋 있음 → 화장 얼굴 랜드마크 검증용 |
| 14 | **300-W** (ICCV'13 / IMAVIS'16) | 테스트 600장(실내300/실외300) + 훈련(LFPW/Helen/AFW/iBUG 재주석) · 68pt | 68pt (눈썹 5pt 상단선만, 입술 외/내 윤곽) | 직접 zip 4분할(7zip 필요) | "The data are provided for **research purposes only**. Commercial use (i.e., use in training commercial algorithms) is **not allowed**." | — | 인더와일드 |
| 15 | **FFHQ** (NVIDIA 2019) | 70,000장 · 1024² | **파싱 라벨 없음** (dlib 68pt 메타만) | Google Drive / 스크립트; 이미지 89.1 GB, 썸네일 1.95 GB, 전체 2.56 TB | "**Creative Commons BY-NC-SA 4.0** license by NVIDIA … for non-commercial purposes" + 개별 이미지 CC BY/BY-NC/CC0/PD; "should not be used for … facial recognition technologies" → 상업 **불가** | — | Flickr 다양 |
| 16 | **UniqueData/face_segmentation** (HF, 2024) | 샘플 ~20장(44 MB), 본편 유료 | 얼굴 vs 배경 이진 | HF | "**CC-BY-NC-ND-4.0**" → 상업 불가 | — | 셀피 |
| 17 | **Roboflow `jannah/facepart`** (2023) | 미확인 (페이지 403) | eyebrow/lips/nose 인스턴스 분할로 소개됨 | Roboflow Universe | 미확인 | — | 미확인 |
| 18 | **MOBIUS** (Ljubljana 2020) | 16,717장 (폰 3종: Xperia Z5c, iPhone 6s, Poco F1) · 분할 서브셋 3,559장(~700 MB) | **sclera, iris, pupil, periocular** 마스크 | 서명한 동의서 이메일 제출(matej.vitek@fri.uni-lj.si) | 페이지에 라이선스 문구 없음(동의서 내용 미확인) → 상업 **불명확** | SSBC 벤치마크 | 100명 **전원 Caucasian**, 눈 클로즈업(폰) → 홍채 스케일 보조용 |
| 19 | **AI Hub 한국인 안면 이미지 (K-Face)** (2017) | 1,000명 × ~30,000장(20각도 C1–C20, 30조명, 6가림, 3표정, 3해상도) | **세그멘테이션 없음** (얼굴 영역 좌표 txt, 파일명 메타) | AI Hub 승인 후 API 분할압축; "내국인만 데이터 신청이 가능합니다" | 이용정책: "본 AI데이터는 인공지능 학습모델의 학습용으로만 사용할 수 있습니다" / "영리적·비영리적 연구·개발 목적으로 활용할 수 있습니다" / 국외 반출·국외 법인은 "별도로 합의가 필요" | — | 한국인 100%, 각도 20단계 → 포즈 검증용(라벨은 직접 만들어야 함). AI Hub에 **메이크업 부위 분할 데이터셋은 검색되지 않음** |

### 핵심 판단 (당화응 관점)

1. **좌/우 눈썹·눈 + 윗/아랫입술 모두 있는 것**: CelebAMask-HQ, LaPa, Helen, iBugMask, FaceSynthetics — **전부 비상업(또는 미확인)**. 수업/데모용으로만.
2. **상업 가능하면서 부위 라벨이 있는 유일한 대형 셋**: **EasyPortrait**(SA 변형, 폰 셀피 40k, L/R 눈썹·눈 분리). 단점: 입술이 단일 클래스(상/하 없음), 홍채 없음. 아이라이너·아이섀도·블러셔 클래스는 **어느 데이터셋에도 없음** → 자체 라벨링 필수.
3. **홍채(mm 스케일)**: Periorbital(CC BY 4.0, 190 MB, Dice 0.93)가 유일한 RGB 정면 홍채 셋. 단 2,015장은 CelebAMask-HQ 유래라 상업화 시 CFD 827장만 쓰는 게 안전. 실전에서는 MediaPipe 홍채 랜드마크(468–477)로 대체 가능하므로 필수는 아님.
4. **±30° 포즈**: 통계가 공개된 건 iBugMask뿐(≥30° 학습 14,692장, 합성). EasyPortrait·LaPa는 "pose variation" 문구만. 포즈 검증은 K-Face(20각도, 내국인)로 자체 라벨 소량 제작이 현실적.
5. **아시아인 비율**: 어떤 셋도 수치 공개 안 함(미확인). 수치가 있는 건 Periorbital-CFD(Asian 109/827)뿐.
6. 벤치마크 SOTA: LaPa F1 93.03 / CelebAMask-HQ F1 89.22 (SegFace, AAAI 2025, MIT 코드+HF 가중치) — 전이학습 출발점으로 적합. EasyPortrait mIoU 85.42(SegFormer-B0 1024²).

### 출처
- CelebAMask-HQ: https://github.com/switchablenorms/CelebAMask-HQ · 라벨 https://github.com/switchablenorms/CelebAMask-HQ/tree/master/face_parsing · 2.94 GB https://hyper.ai/en/datasets/17755
- LaPa: https://github.com/jd-opensource/lapa-dataset · labelmap https://raw.githubusercontent.com/jd-opensource/lapa-dataset/master/labelmap.txt · 논문 https://ojs.aaai.org/index.php/AAAI/article/view/6832
- Helen 파싱: https://pages.cs.wisc.edu/~lizhang/projects/face-parsing/README.txt · 논문 https://pages.cs.wisc.edu/~lizhang/projects/face-parsing/SmithCVPR2013.pdf
- iBugMask: https://github.com/hhj1897/face_parsing · https://ibug.doc.ic.ac.uk/resources/ibugmask/ · 논문 https://arxiv.org/abs/2102.02717
- LFW Part Labels: http://vis-www.cs.umass.edu/lfw/part_labels/ (접속 불가)
- EasyPortrait: https://github.com/hukenovs/easyportrait · 라이선스 PDF https://github.com/hukenovs/easyportrait/blob/master/license/en_us.pdf · HF https://huggingface.co/datasets/gofixyourself/EasyPortrait · 논문 https://arxiv.org/abs/2304.13509
- FaceSynthetics: https://github.com/microsoft/FaceSynthetics · https://raw.githubusercontent.com/microsoft/FaceSynthetics/main/LICENSE.txt · 논문 https://ar5iv.labs.arxiv.org/html/2109.15102
- FaceOcc: https://github.com/face3d0725/FaceExtraction · https://arxiv.org/abs/2201.08425
- FASSEG: https://github.com/massimomauro/FASSEG-repository · https://data.mendeley.com/datasets/sv7ns5xv7f/1
- Periorbital: https://zenodo.org/records/13916845 · https://github.com/aiolab/periorbital-dataset · https://arxiv.org/abs/2409.20407
- Kaggle 입술: https://www.kaggle.com/datasets/olekslu/makeup-lips-segmentation-28k-samples · https://datasetninja.com/lips-segmentation-dataset
- WFLW: https://wywu.github.io/projects/LAB/WFLW.html · https://github.com/wywu/LAB · https://hyper.ai/en/datasets/17691
- 300-W: https://ibug.doc.ic.ac.uk/resources/300-W/
- FFHQ: https://github.com/NVlabs/ffhq-dataset
- UniqueData: https://huggingface.co/datasets/UniqueData/face_segmentation
- MOBIUS/SBVPI: https://sclera.fri.uni-lj.si/datasets.html
- AI Hub: https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=83 · 이용정책 https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105
- SegFace: https://github.com/Kartik-3004/SegFace · https://arxiv.org/abs/2412.08647 · FaceXFormer https://arxiv.org/abs/2403.12960

비고: 파일은 생성하지 않았음(조사 결과만 반환). 접속 실패로 미확인 처리한 항목: LFW Part Labels 공식 페이지(DNS), Helen 원본 페이지(ifp.illinois.edu), Roboflow facepart(403), web.archive.org(차단).
