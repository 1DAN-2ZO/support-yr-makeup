# 메이크업 데이터셋 조사 (원문, 2026-09-16)

# 메이크업 데이터셋 조사 보고 (당화응 프로젝트용, 2026-09-16 기준)

범례: 상업 = 상업적 이용 가능 여부 (예/아니오/불명). 라이선스는 공식 페이지 문구를 그대로 인용. 확인 못한 항목은 "미확인".

## A. 메이크업 전이(Makeup Transfer) 핵심 데이터셋

| 데이터셋 (연도, 논문) | 규모·해상도·페어링 | 다운로드 방법·용량 | 라이선스 (원문 인용) | 상업 | 벤치마크 | 다양성 |
|---|---|---|---|---|---|---|
| **MT (Makeup Transfer)** — BeautyGAN, ACM MM 2018. https://github.com/Honlan/BeautyGAN (비공식 재구현; 원 사이트 liusi-group.com/projects/BeautyGAN 은 현재 접속 불가) | 3,834장 (non-makeup 1,115 / makeup 2,719), 256×256, 68점 랜드마크 정렬. **비페어**(다른 사람). PSGAN 배포판에는 face-parsing(BiSeNet 19클래스) seg + 랜드마크 포함 — 아이섀도/블러셔 전용 마스크는 아님 | Google Drive `makeup_dataset.rar` **627 MB**: https://drive.google.com/file/d/18UlvYDL6UGZ2rs0yaDsSzoUlw8KI5ABY/view ; PSGAN 정리본(images/landmarks/segs) https://drive.google.com/drive/folders/1ubqJ49ev16NbgJjjTt-Q75mNzvZ7sEEn ; Baidu `1wngvgT0qzcKJ5LfLMO7m8A` (pw 7lip) | **미확인** — GitHub/Drive 어디에도 라이선스 문구 없음. 원 저자 사이트 다운으로 약관 확인 불가 | 불명 (사실상 연구용 관행) | EleGANt 논문 사용자연구(MT, 40명): 종합 선호 BeautyGAN 4.75% / LADN 2.75% / PSGAN 9.88% / SCGAN 20.38% / EleGANt 62.25%. CPM 논문 MT 평점(5점): CPM 4.35, BeautyGAN 3.69, PSGAN 3.25 | 여성만, 정면·무표정 위주. 강도: subtle~heavy(한국풍·스모키 포함). 아시아 비율 명시 없음(육안상 동아시아 다수) |
| **Makeup-Wild (M-Wild)** — PSGAN, CVPR 2020. arXiv 1909.06956 https://github.com/wtjiang98/PSGAN | 772장 (makeup 403 / non-makeup 369), 256×256, 정렬 안 함, 비페어. 테스트 전용 | OneDrive(BUAA SharePoint) 링크 — **2021년 issue #34에서 "file not found"**, 현재 HTTP 429. Baidu `1ZF-DN9PvbBteOSfQodWnyw` (pw rtdd) | 코드 **MIT**. 데이터셋 자체 라이선스 문구 없음 → **미확인** | 불명 | Stable-Makeup 논문(M-Wild): CLIP-I 0.768, DINO-I 0.933, SSIM 0.910 (7개 GAN 대비 최고) | 다양한 포즈·표정·복잡 배경. 인종 비율 미기재 |
| **LADN dataset** — ICCV 2019, arXiv 1904.11272 https://github.com/wangguanzhi/LADN | before 333 / after 302 (그중 극단 메이크업 115), 512×512(576 리사이즈→512 크롭), Face++ 랜드마크 pickle 포함, **비페어** + 워핑/블렌딩 합성 GT 포함 | Google Drive `makeup.zip` **4.6 GB**: https://drive.google.com/file/d/1Y0AlgKSVZNsjUG4u0YUHzoxtsG0qgexZ/view (awesome-list의 옛 링크 1gygDQ… 는 404) | 저장소에 LICENSE 파일 없음. 논문은 "release … for non-commercial" 취지(ar5iv 요약, 원문 문구 **미확인**) | 아니오(추정) | EleGANt 사용자연구에서 LADN 2.75%; CPM 논문 CPM-Real 평점 LADN 2.24 | 극단·고주파 메이크업(페이스페인팅) 강점, 정면 필터링 |
| **CPM-Real / CPM-Synt-1 / CPM-Synt-2 / Stickers** — CVPR 2021, arXiv 2104.01867 https://github.com/VinAIResearch/CPM/blob/main/about-data.md | Real 3,895장(테스트 전용, 구글 이미지 크롤). Synt-1 5,555장 256×256 UV텍스처+**패턴 seg 마스크**(train 4,182/test 1,373). Synt-2 1,625 triplet(source·ref·GT, 256×768)+동일컬러 1,115 변형+seg. Stickers 577 RGBA | 직접 HTTP zip: https://public.vinai.io/CPM-datasets/{CPM-Real,CPM-Synt-1,CPM-Synt-2,Stickers}.zip (용량: HEAD 응답 없음 → 미확인) | about-data.md: **"By downloading these dataset, USER agrees: to use the dataset for research or educational purposes only / to not distribute or part of the dataset in any original or modified form / and to cite our paper"**. 코드 BSD-3-Clause | **아니오** | CPM 사용자연구(5점): CPM-Real 4.60 vs PSGAN 2.76·LADN 2.24; Synt-2 MS-SSIM 0.977 vs BeautyGAN 0.918; Synt-1 패턴 mIoU 0.788. Stable-Makeup(CPM-Real): CLIP-I 0.760 | "wide range of makeup styles, ages, head poses"; 글리터·페스티벌·페이스페인팅 검색어 기반 |
| **BeautyFace** — BeautyREC, CVPRW 2023, arXiv 2212.05855 https://github.com/learningyan/BeautyREC | 3,000장 512×512, 비페어, **face parsing map 동봉**(클래스 목록 미확인; 메이크업 부위 마스크 아님) | Google Drive: 데이터 `beautyface.tar` https://drive.google.com/file/d/1mhoopmi7OlsClOuKocjldGbTYnyDzNMc ; parsing maps https://drive.google.com/file/d/1WgadvcV1pUtEMCYxjwWBledEQfDbadn7 ; 시각화 741 MB https://drive.google.com/file/d/1sRE-VvC63Cyn_VNUOKYO4WY762_qEjX2 | 저장소 `License` 파일: **"Redistribution and use for non-commercial purpose in source and binary forms … are permitted … In the event that redistribution and/or use for commercial purpose … is required, please contact the contributor(s) of the work."** 프로젝트 페이지: "We retain all the copyrights of this method." | **아니오**(협의 필요) | 논문은 파라미터 수 비교 위주(BeautyREC 1M vs PSGAN 12.62M); FID/사용자연구 수치 미확인 | "more recent makeup styles … diverse face poses, backgrounds, expressions, races, illumination" |
| **FFHQ-Makeup** — CyberAgent 2025, arXiv 2508.03241 https://huggingface.co/datasets/cyberagent/FFHQ-Makeup | 18,000 ID × (bare 1 + makeup 5) = 108,000장, 512×512 JPEG, **동일인 페어**(합성). 마스크·랜드마크는 미동봉(논문 파이프라인 내부용) | HF 직접, **3.82 GB** | HF 카드 **"license: cc-by-nc-sa-4.0"**, "We inherit the same license from FFHQ" | **아니오** | ArcFace ID 유사도 0.5888 (BeautyBank 0.5034, LADN-Syn 0.4973); DINO-I 0.9448; 선호도 조사(50그룹): 얼굴 일관성 92% vs BeautyBank 8%, 메이크업 사실감 52:48 | FFHQ 상속: 다인종·연령·성별·표정·가림. 스타일은 MT+LADN에서 추출한 2,257개 잔차 중 5종. 아시아 비율 미기재 |
| **BMS (Bare-Makeup Synthesis)** — BeautyBank, WACV 2025, arXiv 2411.11231 https://huggingface.co/datasets/lulululululululululu/Bare-Makeup-Synthesis-Dataset | 319,516장(논문은 324K 쌍) 512×512 PNG, FFHQ bare와 파일명 매칭 페어 | HF, part-aa/ab/ac 3분할 **125 GB** | HF 카드 **"CC BY 4.0"** (단, FFHQ 파생물이므로 FFHQ CC BY-NC-SA 4.0과 충돌 소지 — 법적 판단 필요). 코드 MIT | 표면상 예, 실질 불명 | 벤치마크 수치 미확인 | FFHQ 상속 |
| **MakeUpAnyone** — OpenReview 2025-10 (게재 여부 미확인) https://huggingface.co/datasets/zhengchong/MakeUpAnyone | HF 122,828장 512×512, **3.19 GB**, webdataset. 논문: makeup 77,717 + non-makeup 33,933 비페어 수집 → VLM+편집모델로 pseudo-pair 생성. HF 구조 설명 없음 | HF 직접 | HF 카드 **"license: mit"** (README 본문 비어 있음, 이미지 출처 불명) | 표면상 예, 출처 불명 | 미확인 | 미확인 |
| **MT-Text** — MAD, arXiv 2504.02545 https://github.com/basiclab/MAD/blob/main/data/mt_text_anno.json | MT의 makeup 2,719장에 **부위별(eye / lips / face) 텍스트 라벨** (예: "light eyeliner", "glossy finish"), GPT-4V 생성 후 수작업 검수 | GitHub JSON 1개 파일 | MAD 저장소 라이선스 **미확인**(API 응답 없음); 이미지는 MT 라이선스 종속 | 불명 | CLIP_T 0.266 / CLIP_I 0.931 / CLIP_S 0.662 | MT와 동일 |
| **FCC (Facial Cosmetic Content)** — SPL 2019 https://github.com/ssarfraz/SPL/tree/master/FCC_dataset | 18,425장(strong 6,566 / any 16,319 / no 6,506), 512·256 두 버전, 유튜브 전후(명시 매칭 없음) | 배포 안 함, `create_dataset.py`로 유튜브 재크롤(일부 영상 삭제됨) | **"The dataset (and the sample images shown here) are/should only be used for academic research. The copyright of the images resides with youtube/video-uploaders"** | **아니오** | — | 유튜브 튜토리얼 기반 |
| **YMU / VMU / MIW / MIFS** — Dantcheva 2012–2017 http://www.antitza.com/makeup-datasets.html | YMU 151명 백인 여성 604장(전후 2:2). **VMU 51명 204장: 무화장 / 립스틱만 / 눈화장만 / 풀메이크업 (합성, Taaz)** ← 부위별 조건 유일. MIW 125명 154장. MIFS 107 변신 642장 | Google Form 신청 https://forms.gle/9WBbuE1E9ZSVLJ2w6 (MSU iPRoBe 미러도 동일 안내) | 페이지에 라이선스 문구 없음 → **미확인** (신청서에 약관 있을 가능성) | 불명 | — | 백인 여성 위주(YMU/VMU 명시), 해상도 낮음 |
| **Makeup Detection Dataset** — UniqueData/TrainingDataPro (HF·Kaggle) https://huggingface.co/datasets/UniqueData/makeup-detection-dataset | 샘플 25.3 MB, 1K–10K, **동일인 전후 페어**, CSV: no_makeup, with_makeup, **part(화장 부위)**, gender, age, country | HF/Kaggle 샘플 무료; 전체는 유료 요청 https://unidata.pro/datasets/makeup-detection-dataset-female-images/ | HF·Kaggle 모두 **CC BY-NC-ND 4.0** ("Attribution-NonCommercial-NoDerivatives 4.0 International") | **아니오**(구매 시 별도 계약) | — | "various ages, ethnicities and genders" |
| **Japanese Female Face w/ & w/o Makeup** — Qlean(amanaimages) 2026-09 https://huggingface.co/datasets/qleandataset/image-japanese-female-makeup | 50명 일본 여성, 1,807장, **4032×3024**, 전후 페어, 28.8 GB | HF gated(기관 이메일 필수, 3영업일 심사) | **"Qlean Academic Research License"**: "This dataset is released for academic research purposes only", "Commercial use / 商用利用: not permitted" | **아니오** | — | 동아시아 100% (일본), 고해상도 — 수업 데모용 후보 |

## B. 논문에는 있으나 미공개/제한 (2025–2026 신규)

| 데이터셋 | 내용 | 공개 상태 |
|---|---|---|
| **Stable-Makeup 학습 데이터** (arXiv 2403.07764, SIGGRAPH 2025) | FFHQ 20,000장에 GPT-4 프롬프트 300종 + LEDITS 편집 → 20,000 페어. 코드 Apache-2.0 | 데이터 **미공개**. 사용자연구 60명 5점: 4.58 (베이스라인 2.85–3.62) |
| **HQMT** (FLUX-Makeup, arXiv 2508.05069) | FFHQ 70k → FLUX-Kontext 350k 생성 → 3단 필터 후 ~56,900 페어. 수동검수 통과율 96.2% (Stable-Makeup 데이터 6.8%) | **미공개**. CLIP-I 0.668 / SSIM 0.879 (Stable-Makeup 0.649/0.792, SHMT 0.634/0.805) |
| **ConsistentBeauty 290,144 triplet + BeautyBench** (arXiv 2605.07861, 2026-05) | 19,639 무화장 초상 기반 triplet; BeautyBench 300 source(정면 70%/측면 30%)+300 ref(light 115/heavy 115/페이스페인팅 70) = 1,000 페어, 피부톤 엔트로피 1.951 bit, 성별 50:50 | 데이터 "**intended exclusively for academic research … requires formal application**"; BeautyBench URL 미확인. Face Sim 0.954 / CLIP-I 0.643 |
| **MakeupQuad** (EvoMakeup, arXiv 2508.05994) | source·ref·결과·텍스트 4중 | "Code and dataset will be released upon acceptance" → **미확인** |
| **MakeupFaces2K (MF2K)** (arXiv 2606.31089) | 8,573장 **2048×2048** in-the-wild | URL **미확인** |
| **MakeupSelfies** (MakeupMirror, arXiv 2606.20094) | 셀피 벤치; Stable-Makeup 대비 ID 유사도 +60%, 피부톤 차이 −50%, 전문가 수용률 94% | URL **미확인** |
| **Supervised MT curated dataset** (ICASSP 2026, arXiv 2602.00729) | train-generate-filter-retrain; 부위별(eyes/lips/face) 텍스트 제어 | 프로젝트 페이지 makeup-adapter.github.io 에 PDF만 → **미확인** |
| **emiliiia/MakeupGrpoRL** (HF 2026-07) | 16.2 GB, RL 샘플 3,200, bare-face anchor + makeup ref, BiSeNet 파싱 코드 포함 | license "other", 논문 없음 → 출처 불명 |
| **EleGANt / SHMT / SSAT / SCGAN** | 자체 데이터 없음(MT+M-Wild 사용). EleGANt·SHMT 코드 **CC BY-NC-SA 4.0** | — |
| "MakeupBench", "M^2 Makeup" | 검색 결과 없음 → **존재 미확인** (BeautyBench와 혼동 가능) | — |

## C. 부위별(eyeshadow/eyeliner/blush) 마스크 — 결론
**공개 데이터셋 중 아이섀도·아이라이너·블러셔 픽셀 마스크를 직접 제공하는 것은 없음.** 근접 대안:
- VMU: 립스틱만 / 눈화장만 / 풀 — 부위 조건은 있으나 마스크 없음, 합성.
- UniqueData `part` 컬럼(부위 텍스트), MT-Text(부위별 텍스트 라벨).
- CPM-Synt-1: 패턴(스티커) seg 마스크만.
- **실용적 방법**: FFHQ-Makeup(동일인 bare/makeup 페어) 에서 Lab ΔE 잔차 ∩ face-parsing(눈/입술/볼 영역) → pseudo 부위 마스크 자동 생성 가능. 단 CC BY-NC-SA → 수업/데모 한정.
- 얼굴 파싱 베이스: **CelebAMask-HQ** 30k 512² 19클래스 — "available for non-commercial research purposes only … not … exploit for any commercial purposes"; **EasyPortrait** 40k FullHD(피부·눈썹·눈·입술·치아 9클래스) — "licensed under a variant of Creative Commons Attribution-ShareAlike 4.0" (variant 문서 확인 필요, 상업 가능성 있음) https://github.com/hukenovs/easyportrait

## D. 피부톤 주석 / Lab 기준선
| 자원 | 내용 | 라이선스 |
|---|---|---|
| **Monk Skin Tone(MST) 10단계** https://skintone.google | hex: #f6ede4 #f3e7db #f7ead0 #eadaba #d7bd96 #a07e56 #825c43 #604134 #3a312a #292420 | "The Monk scale is open source. Its ten tones are licensed under the Creative Commons Attribution 4.0 International license." (Wikipedia가 skintone.google 인용; 원 페이지는 JS 렌더라 직접 인용 미확인) → **상업 가능(CC BY 4.0)** |
| **MST-E** (1,515장+31영상, 19명) | 주석자 훈련용 | "The images are not to be used to train ML models" / "research or human-annotator-training purposes only" → **ML 학습 금지** |
| **AI허브 「글로벌 다인종 피부색 데이터」** (2025, dataSetSn=71963) https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71963 | **2,525명 × 4조명 = 10,100 정면 이미지 + 이마/좌우볼/목 4부위 CIE Lab·sRGB 측색(xlsx) + Fitzpatrick I–VI + Monk 등급 + 인종·국적**. 당화응 Lab 기준선에 가장 직접적 | "내국인만 데이터 신청이 가능합니다". AI허브 이용정책: "AI 허브에서 제공하는 AI 데이터셋의 판매 등 상업적 이용을 희망하는 경우 수행기관과 별도 협의가 필요합니다", "국외 반출을 위해서는 … 별도로 합의가 필요합니다" → 연구·개발 이용 가능, 판매형 상업화는 협의 |
| AI허브 「문제성 피부 메이크업 추천 데이터」 (dataSetSn=71961) | 텍스트 QA 10,043쌍(피부고민별 메이크업 방법·성분), 이미지 아님 | 위와 동일 |
| FairFace https://github.com/joojs/fairface | 인종(East Asian 포함)·성별·연령 라벨, 피부톤 아님 | "CC BY 4.0" |
| TrueSkin (arXiv 2509.10980) | 7,299장 6단계 시각 피부톤 | 공개 URL 미확인 |
| Casual Conversations(Meta) | 45,186 영상, Fitzpatrick 제3자 주석 | 약관 미확인(연구용) |

## E. 제품 색상(립스틱 등) 데이터
| 자원 | 내용 | 라이선스 |
|---|---|---|
| The Pudding `makeup-shades/shades.csv` https://github.com/the-pudding/data/tree/master/makeup-shades | **파운데이션** 셰이드 brand/product/hex/H/S/V/**L(CIE Lab)**/group (Fenty, MUFE, 미국·나이지리아·일본·인도 베스트셀러) | 저장소 MIT; Kaggle 미러(shivamb/makeup-shades-dataset, utkarshx27/makeup-shades) "CC0: Public Domain" |
| Sephora Products & Skincare Reviews (Kaggle nadyinky) | 8k+ 제품(스킨케어 리뷰 중심; 메이크업 컬럼 여부 미확인) | "Attribution 4.0 International (CC BY 4.0)" |
| theBigDataDigest/lipsticks_detect `lipstick.json` | 5브랜드(YSL·Chanel·Dior·Maybelline·Givenchy) 271 립스틱 hex | 라이선스 없음(스크레이핑 추정) |
| Nadaly/Makeup_lipstick_Data (HF) | 이름과 달리 인도 커머스 리뷰 78만행, hex 없음 | apache-2.0 |
| **립스틱 hex 공개 데이터셋은 사실상 없음** → 10개 룩 템플릿 색은 자체 정의(Lab) 권장 |

## F. 당화응 권고 (수업/데모 vs 상용)
- 수업·데모 학습용 1순위: **FFHQ-Makeup**(3.8 GB, 동일인 페어, HF 즉시) + **MT**(627 MB, 클래식 벤치) + **CPM-Real**(포즈·강도 다양, 테스트).
- 부위 채점 GT: 부위 마스크 데이터 없음 → FFHQ-Makeup ΔE 잔차 + 파싱으로 자체 생성.
- Lab 피부톤 기준선: **AI허브 다인종 피부색(측색 Lab 포함)** 신청(내국인 가능) + MST hex(CC BY).
- 상용 전환 시 재검토 필수: MT(라이선스 미확인), CPM·FFHQ-Makeup·BeautyFace·CelebAMask-HQ 모두 비상업. 상업 가능 후보는 MST 스케일, FairFace, EasyPortrait(variant 확인), Sephora Kaggle, The Pudding — 메이크업 전이용 상업 가능 이미지 데이터는 현재 **없음**(BMS/MakeUpAnyone은 표기상 CC BY/MIT이나 출처 충돌 위험).
- Makeup-Wild는 공식 링크가 죽어 있어 Baidu 또는 저자 문의 필요.

주요 출처: https://github.com/thaoshibe/awesome-makeup-transfer , https://github.com/VinAIResearch/CPM/blob/main/about-data.md , https://huggingface.co/datasets/cyberagent/FFHQ-Makeup , https://github.com/learningyan/BeautyREC , https://github.com/wangguanzhi/LADN , https://github.com/wtjiang98/PSGAN , https://www-sop.inria.fr/members/Antitza.Dantcheva/makeup-datasets.html , https://arxiv.org/html/2605.07861v2 , https://arxiv.org/html/2508.05069 , https://arxiv.org/html/2403.07764 , https://aihub.or.kr/intrcn/guid/usagepolicy.do , https://en.wikipedia.org/wiki/Monk_Skin_Tone_Scale , https://research.google/blog/consensus-and-subjectivity-of-skin-tone-annotation-for-ml-fairness/
