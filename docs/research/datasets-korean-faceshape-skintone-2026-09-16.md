# 한국인 얼굴·얼굴형·피부톤·조명·셀피 데이터셋 조사 (원문, 2026-09-16)

# 보조 데이터셋 조사 결과 (당화응 — 한국인 얼굴 / 얼굴형 / 피부톤 / 조명·포즈 / 셀피)

모든 인용문은 공식 페이지에서 그대로 옮긴 것. "미확인"은 공식 페이지에서 직접 확인 못 한 항목. 오늘 기준(2026-09).

## 0. AI Hub 공통 이용정책 (모든 AI Hub 행에 적용)
출처: https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105
- 영리 R&D 허용: "지능형 제품・서비스, 챗봇 등 다양한 분야에서 **영리적・비영리적 연구・개발 목적으로 활용**할 수 있습니다."
- 판매·상업적 이용은 별도 협의: "AI 허브에서 제공하는 AI 데이터셋의 **판매 등 상업적 이용을 희망하는 경우 수행기관과 별도 협의**가 필요합니다."
- 국외: "국외에 소재하는 법인, 단체 또는 개인이 AI데이터 등을 이용하기 위해서는 수행기관 등 및 한국지능정보사회진흥원과 별도로 합의가 필요합니다." / "본 AI데이터 등의 국외 반출을 위해서는 … 별도로 합의가 필요합니다."
- 제3자 제공 금지: "승인을 받지 않은 다른 법인, 단체 또는 개인에게 열람하게 하거나 제공, 양도, 대여, 판매하여서는 안됩니다."
- 출처 표기 의무: "반드시 한국지능정보사회진흥원의 사업결과임을 밝혀야 하며, … 2차적 저작물에도 동일하게 밝혀야 합니다."
- 얼굴 데이터셋은 각 페이지에 "※ 내국인만 데이터 신청이 가능합니다" 표기 (아래 전부 해당). 절차: 회원가입 → 데이터 신청 → 기관 승인(보통 수일) → 분할압축 다운로드(리눅스 merge 필요).
- 해석: **모델 학습·앱 서비스(영리 R&D)는 약관상 가능, 데이터 자체 재판매·재배포 불가, 해외 클라우드 반출은 별도 합의 필요** → 서버가 국내 리전이어야 안전.

## A. 한국인 얼굴·피부

| 데이터셋 | 제공/연도/URL | 규모·해상도·주석 | 입수 | 라이선스·상업 | 비고 |
|---|---|---|---|---|---|
| 한국인 안면 이미지 (=K-Face) | KIST / 2017~2019 구축, 2025-09-15 갱신 / https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=83 · GitHub https://github.com/k-face/k-face_2019 · 논문 arXiv 2103.02211 | 1,000명(남500/여501, 20~50대), 약 2,860만 장(1인당 ~30,000). 각도 20종(C1–C20), 조명 30종(L1–L30, lux·방향 변화), 액세서리 6종(안경·선글라스·모자 등), 표정 3종(무표정·활짝웃음·찡그림), 해상도 3종 **High 864×576 / Mid 346×230 / Low 173×115**. 파일명에 ID_액세서리_조명_표정_포즈 인코딩. 얼굴형·피부톤 라벨 없음, 랜드마크 없음 | 내국인만, 승인제. 2025년 공지: "**개인정보활용동의서 갱신에 따라 일부 공개**" → 전체가 아닌 일부만 받을 수 있음 | AI Hub 공통 약관(0장). 상업: 영리 R&D 가능/판매 불가/국외 반출 별도합의 | 스튜디오 DSLR 촬영, 실사용 셀피와 도메인 차이 큼. 해상도 최대 864×576이라 피부 ΔE 계산엔 거칠음. 조명 30종은 조명 강건성 검증용으로 가치 있음. 벤치마크: 논문은 얼굴인식 용도만 보고, 화장/피부 수치 없음 |
| 마스크 착용 한국인 안면 이미지 | ㈜씨유박스 / 2021 구축, 2023-05 갱신 / https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=469 | 5,000명, 1,058,000장. 카메라 각도 9종, 스튜디오 35.7%/실내 12.6%/야외 36.4%/크라우드 15.3%, 마스크 정상착용 41.4%/부분 41.4%/미착용 17.2%, 스튜디오 거리 3종. **68점 랜드마크(JSON)** + 성별·나이·안경·카메라·환경 메타 | 내국인만, 승인제 | AI Hub 공통 | 미착용 17.2%(≈18만 장)만 화장 코칭에 쓸 만함. 68점 랜드마크가 있어 MediaPipe 검증용 GT로 활용 가능 |
| 한국인 피부상태 측정 데이터 | ㈜카이로스랩(+아이이씨코리아, 단국대) / 2023 구축, v1.1 2024-10 / https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&dataSetSn=71645 | 안면 이미지 13,936장, 피부측정값 84,688건, 라벨 125,424건. **디지털카메라·태블릿·스마트폰 3기기, 2136×3216 이상**, 각도 13종(정면·±15°·±30°·상하). 수분·탄력·색소·모공 측정값, 부위(이마·미간·양눈가·양볼·입술·턱·전체) 바운딩박스, 전문의 주름·건조·색소 등급. 남49.8/여50.2, 10대~60대+ | 내국인만, 승인제 | AI Hub 공통 | **스마트폰 촬영 + 부위 박스 + 색소 등급**이라 피부톤 Lab 베이스라인·부위별 ΔE 캘리브레이션에 가장 직접적. 메이크업 없는 민낯 기준 |
| 스킨케어 성분-효능 추천 데이터 | ㈜카이로스랩 / 2025 구축, 2026-06 공개(v1.1) / https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&topMenu=100&aihubDataSe=data&dataSetSn=71886 | 비식별 안면 이미지 10,000장(JPG) + 설문 10,000건 + CoT 라벨(피부타입 4, 고민 8) | 내국인만 | AI Hub 공통 | 이미지 해상도 미확인, 비식별 처리라 얼굴 학습엔 부적합 가능 |
| 안면 인식 에이징 이미지 | ㈜씨유박스 / 2022, 2023-11 / https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71415 | 50,250장, 바운딩박스+5점 키포인트, 촬영 당시 나이 메타, 필름/디지털 혼합 PNG | 내국인만 | AI Hub 공통 | 화장 용도 낮음 |
| 한국인 얼굴 합성을 위한 발화 모습 이미지 (Celeb-K) | ㈜딥브레인AI / 2022, 2023-12 / https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71427 | 2,001명, 1,011,675장, **1024×1024**, 표정 7종, 바운딩박스, **head pose yaw/pitch/roll −30~+30°**, 성별·연령·안경·머리색/스타일·이마노출 메타. 크라우드소싱(온/오프라인) | 내국인만 | AI Hub 공통 | 고해상도+포즈 각도 라벨이라 **포즈 강건성 테스트셋**으로 유용. 자연광 셀피 비중은 미확인 |
| 한국인 감정인식을 위한 복합 영상 | KAIST / 2020, 2023-10 / https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=82 | 50만 장(배우 25만/일반 25만), 감정 7종, 바운딩박스(3인 주석), 장소 맥락, 성별·나이 | 내국인만 | AI Hub 공통 | 해상도 미확인 |
| 가족 관계가 알려진 얼굴 이미지 | ㈜휴먼아이씨티(+KIST) / 2021, 2022-09 / https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=528 | 1,000+가족 3,000+명, 80,700+장(각도별 개인사진 49,800), 바운딩박스+키포인트, 나이 | 내국인만 | AI Hub 공통 | 화장 용도 낮음 |
| AI Hub 메이크업/화장/뷰티/퍼스널컬러 데이터 | — | **검색 결과 없음** (화장품 패키징 OCR dataSetSn=633, 네일/페디큐어만 존재) | — | — | 메이크업 세그멘테이션은 AI Hub에 없음 → 다른 에이전트의 EasyPortrait/CelebAMask 계열에 의존 |
| K-Face 별도 배포(kface.kist.re.kr) | KIST | AI Hub와 동일 데이터 | 사이트 접속·약관 **미확인**(검색 결과에 약관 없음) | 미확인 | 실질적으로 AI Hub 경로 사용 |

## B. 얼굴형 분류

| 데이터셋 | 제공/URL | 규모·주석 | 입수 | 라이선스(Kaggle 메타 `license.name` 실측) | 품질·벤치마크 |
|---|---|---|---|---|---|
| Face Shape Dataset (niten19) | Niten Lama / Kaggle / https://www.kaggle.com/datasets/niten19/face-shape-dataset | 5,000장(여성 셀럽), Heart/Oblong/Oval/Round/Square 각 1,000(train 800/test 200). 랜드마크·측정값 없음 | Kaggle 로그인 후 즉시 | **"CC0: Public Domain"** (페이지 JSON-LD에서 확인) | 설명문 원문: "5000 images of the female celebrities from all around the globe which are categorized according to their face-shape" — **라벨링 방법·출처 미기재**. 초상권 있는 셀럽 사진에 CC0를 업로더가 붙인 것이라 실제 권리 근거 없음 → 상업 서비스 학습에 법적 리스크. 라벨 노이즈 정량 감사 논문은 **찾지 못함(미확인)**; 정황: 같은 데이터로 CNN train 96.2%/val 81.1% (Pratch-yani GitHub), Inception v3 train 98–100%/test 84.4–84.8% (arXiv 1911.07916, 그 논문 데이터도 "female celebrities with known face shapes collected from the Internet" 500장), 랜드마크 거리·각도 기반 LDA/SVM/KNN은 **36.4–64.6%**. 2022 서베이("Human Face Shape Classification with ML")는 "need for a more diverse, larger, and properly labeled face shape dataset" 지적 |
| Face Shape Preprocessed (zeyadkhalid) | Kaggle / https://www.kaggle.com/datasets/zeyadkhalid/faceshape-processed | niten19를 크롭/전처리한 파생본; 동일 5클래스 | Kaggle | **"CC0: Public Domain"** | 작성자 노트북 정확도 73% (제목 기준). 원본과 같은 문제 |
| Face Shape (Oval, Round, Square) (attanmhd) | Kaggle / https://www.kaggle.com/datasets/attanmhd/face-shape-oval-round-square | 3클래스; 규모 미확인 | Kaggle | **"MIT"** (JSON-LD) | 출처 미기재 |
| Face shapes (minhquangbui) | Kaggle / https://www.kaggle.com/datasets/minhquangbui/face-shapes | 미확인 | Kaggle | **"Apache 2.0"** | 출처 미기재 |
| hoangthangcdt/face-shape, lucifierx/face-shape-classification(남성), hanakb/men-face-shape | Kaggle | 미확인 | Kaggle | **"Unknown"** 3건 모두 | 사용 불가 권장 |
| dsmlr/faceshape (Pasupa et al.) | KMITL / https://github.com/dsmlr/faceshape · ESWA 2018 doi:10.1016/j.eswa.2018.11.011 | 5클래스 폴더; 규모·라벨링 방법 README 미기재 | GitHub 공개 | **라이선스 파일 없음(미확인)** | 논문: 수작업 특징+VGG-face+MKL로 **70.33%** |
| 학술 얼굴형 정확도(2020–2025) | — | — | — | — | Abdullah et al. 2022 하이브리드 앙상블 86.5%(Kaggle 데이터) · IdentiFace VGG(arXiv 2401.01227) test 88.03% · VIScial 2025 IEEE VGG-16 전이학습 96.83%(자체 데이터, 교차검증 미확인) · ESWA 2025 (S0957417425027320) dlib 68점 → 각도3·비율10·거리7 + BEPO 선택 + HoBDe-GCN, 정확도 수치 초록만으론 미확인 · Swin 2023 (S1877050923017258). **공통 결론: 랜드마크 규칙만으로는 60% 안팎, CNN은 85–90%대지만 모두 셀럽 스크랩 데이터 기준이라 한국인 셀피 일반화 미검증.** 3D 계측 GT 기반 공개 얼굴형 데이터셋은 없음 |

## C. 피부톤

| 데이터셋 | 제공/URL | 규모·주석 | 입수 | 라이선스(원문) | 비고 |
|---|---|---|---|---|---|
| Monk Skin Tone (MST) 스케일 | Google / Ellis Monk, 2022 / https://skintone.google | 10단계 스와치(헥스값) | 공개 | 공식 페이지(skintone.google)는 JS 렌더링이라 curl로 원문 인용 실패 → **미확인(직접)**. 2차 확인: JAAD 2025 논문·Wikipedia "licensed under Creative Commons Attribution 4.0 International License (CC BY 4.0)", Google 블로그 "We're openly releasing the scale so anyone can use it for research and product development." | 스케일 자체는 상업 사용 OK(출처 표기) |
| MST-E (Monk Skin Tone Examples) | Google Research + TONL, 2023 / https://skintone.google/mste-dataset · arXiv 2305.09073 | 19명, 1,515장 + 31영상, 10단계 전체, 다양한 포즈·표정·**조명 조건(Golden/Challenging 세트)** | 공개 다운로드 | research.google 블로그 원문: "TONL has given permission for these images to be released as part of MST-E and used **for research or human-annotator-training purposes only. The images are not to be used to train ML models.**" | **학습 금지, 상업 불가.** 주석자 교육·조명별 톤 변화 관찰용만 |
| Casual Conversations v2 | Meta, 2023 / https://ai.meta.com/datasets/casual-conversations-v2-dataset/ · arXiv 2303.04838 | 5,567명, 26,467영상(~1분), 7개국(브라질·인도·인도네시아·멕시코·필리핀·미국·베트남 — **한국 없음**). 주석: **Fitzpatrick + Monk 피부톤**(훈련된 주석자), 음성 timbre, 촬영환경, 자가보고 나이·성별·언어 등 | Meta 포털, 무료, 라이선스 동의 | Meta 페이지 원문: License "Limited" — "You can evaluate models on the provided labels. You can only train your model on certain labels—refer to license permissions." / "intended mainly to be used for assessing the performance of already trained models". 논문: "certain labels age, gender, disability, physical adornments & attributes may not be used for training". 상업: **불명확(미확인, 전문 라이선스 문서 확인 필요)** | 평가 전용으로 보는 게 안전. 동아시아 비중 낮음 |
| Fitzpatrick17k | Groh et al. (MIT), 2021 / https://github.com/mattgroh/fitzpatrick17k | 16,577장, 114 피부질환, FST I–VI(Scale AI·Centaur Labs 비전문 주석). **병변 사진, 얼굴 아님** | GitHub 링크 공개 | 원문: "This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License." (이미지 원출처 DermaAmin·Atlas Dermatologico) | **비상업.** 품질: Sci. Data 2025 (s41597-025-04382-5, arXiv 2401.14497) 감사에서 중복·오라벨·train/test 누수 보고(정량 수치는 본문 접근 불가로 미확인). 화장 앱엔 부적합 |
| FairFace | Kärkkäinen & Joo, 2019 / https://github.com/joojs/fairface · HF HuggingFaceM4/FairFace | 108,501장(YFCC-100M Flickr), 인종 7종(East Asian 포함)·성별·나이, 크롭 padding 0.25/1.25 | GitHub/HF 공개 | GitHub 원문: **"CC BY 4.0"** | 피부톤 라벨은 없고 인종 라벨. 상업 OK. 저해상도 크롭이라 ΔE 베이스라인엔 부적합 |
| Chicago Face Database (CFD) | U. Chicago CDR, 2015~ / https://www.chicagofaces.org | CFD 597명(Asian/Black/Latino/White, 표정별), CFD-MR 88, CFD-INDIA 142. 표준화 스튜디오 고해상도, **객관 측정치(얼굴 median luminance, 광대폭·fWHR 등 랜드마크 거리)** + 평가자 norming | 등록 폼 후 다운로드 | 원문: "The database materials may be used for **non-commercial scientific research purposes only**." / "shall not be published … without written consent from the copyright holder." | **비상업.** L*a*b* 직접값은 없고 luminance median (Photoshop 측정). 한국인 비중 미확인 |
| SCUT-FBP5500 | SCUT HCII Lab, 2018 / https://github.com/HCIILAB/SCUT-FBP5500-Database-Release | 5,500장 정면(아시아 여2000/남2000, 백인 각750), **86점 랜드마크**, 미모 점수(60명), 256×256 | GitHub 공개 | 원문: "The SCUT-FBP5500 database can be only used for non-commercial research purpose." | **비상업.** 아시아 정면+랜드마크라 얼굴형 규칙 프로토타입엔 편리하나 상용 불가 |
| 피부톤+얼굴 Lab 베이스라인용 공개·상업가능 데이터셋 | — | — | — | — | **없음.** 실용 대안: AI Hub 한국인 피부상태 측정(스마트폰 촬영·부위박스) 또는 자체 수집 + MST 스와치 기준 |

## D. 조명·포즈 강건성 (통제 조명)

| 데이터셋 | 제공/URL | 규모·주석 | 입수·비용 | 라이선스(원문) | 비고 |
|---|---|---|---|---|---|
| CMU Multi-PIE | CMU, 2008–2010 / http://multipie.org (페이지 콘텐츠 사실상 비어 있음) · CMU Flintbox 2009-056 https://cmu.flintbox.com/technologies/67027840-27d5-4570-86dd-ad4715ef3c09 | 337명, 4세션/6개월, **15 카메라 뷰(13개 15° 간격+2 오버헤드), 18 플래시 조명**, 표정 6, 정면 3072×2048, 755,370장/305 GB, 아시아 35% | 논문(PMC2873597) 원문: "Multi-PIE is available to all interested researchers for the cost of media (a 400GB hard drive) and shipping." 현재는 Flintbox 라이선스(JS 페이지라 금액 미확인) | 2022 서베이(arXiv 2211.08030) 분류: "Royalty-bearing" 라이선스. **상업: 유료 협의(미확인 금액)** | 조명 방향별 ΔE 변동 벤치마크에 최적이나 비용·절차 부담 |
| CMU PIE (원본) | CMU RI, 2000–2002 / https://publications.ri.cmu.edu/the-cmu-pose-illumination-and-expression-pie-database | 68명, 포즈 13, 조명 43, 표정 4, 4만+장 | 배포 절차·라이선스 **미확인** | 미확인 | Multi-PIE로 대체 |
| Yale Face Database B / Extended Yale B | Yale CVC 2001 / UCSD https://vision.ucsd.edu/datasets/extended-yale-face-database-b-b · 원본 https://www.cs.yale.edu/cvc/projects/yalefacesB/yalefacesB.html | B: 10명×9포즈×64조명=5,760장; Extended: 28명, 9포즈, 64조명, 16,128장, 흑백 저해상도 | 공개 다운로드 | Yale 원문: "You are free to use the Yale Face Database B for research purposes." / "Without permission from Yale University, images from within the database cannot be incorporated into a larger database which is then publicly distributed." | **흑백·연구용** → 색 평가 불가, 알고리즘 조명 불변성 확인용에만 |
| FaceScape | NJU 3DV, CVPR 2020/PAMI 2023 / https://github.com/zhuhao-nju/facescape · https://nju-3dv.github.io/projects/FaceScape/ | 847명×20표정, 다시점 40만+장(359명×20×~60뷰, 4–12MP), 16,940 3D 모델, 4K 디스플레이스먼트/텍스처 | 라이선스 서명 후 nju3dv@nju.edu.cn 이메일(지도교수/기관) | GitHub 원문: "The datasets are only released for non-commercial research use." 검색 인용: "any use to manufacture or sell products … for any for-profit purposes is strictly prohibited." | **상업 불가**, 중국인 피험자 |
| BIWI Kinect Head Pose | ETH Zurich, 2011 / https://huggingface.co/datasets/ETHZurich/biwi_kinect_head_pose | 20명, 15,000프레임, yaw ±75°/pitch ±60°, 640×480 RGB+깊이 | HF 공개 | README 원문: "This database is made available for non-commercial use such as university research and education." | 비상업 |
| AFLW | TU Graz ICG, 2011 / https://www.tugraz.at/institute/icg/research/team-bischof/learning-recognition-surveillance/downloads/aflw | ~25,993장(Flickr), 21점 랜드마크 ~38만, POSIT 기반 대략적 head pose | 신청 후 다운로드 | 원문: "The AFLW database is available for non-commercial research purposes only." / "You agree not to further copy, publish or distribute any portion of the AFLW database." | 비상업 |
| 300W-LP / AFLW2000-3D | CBSR (Zhu et al.) http://www.cbsr.ia.ac.cn/users/xiangyuzhu/projects/3DDFA/main.htm | 300W-LP 61,225장(합성 대포즈), AFLW2000 2,000장, 3DMM 파라미터·pose | 공개 링크 | **미확인** — GitHub issue cleardusk/3DDFA#221 "License of 300-W-LP and AFLW2000-3D?" 답변 없음. 원본 300W/AFLW은 비상업 | 비상업으로 간주 권장 |
| LPFF (Large-Pose Flickr Faces) | 2023 / https://huggingface.co/datasets/onethousand/LPFF | 19,590장 대포즈 인물, 239 GB | HF 공개 | HF license 필드: **"cc-by-nc-2.0"** | 비상업 |

## E. 셀피·폰 인물 (in the wild)

| 데이터셋 | 제공/URL | 규모·주석 | 입수 | 라이선스 | 비고 |
|---|---|---|---|---|---|
| Selfie Dataset (Kalayeh et al., ACMMM 2015) | UCF CRCV / https://www.crcv.ucf.edu/data/Selfie/ | 46,836장(Instagram 수집), 36속성: 성별·나이대·인종(white/black/asian)·표정·머리색/형태·**lipstick**·안경·모자·거울셀피·부분얼굴 등. 해상도 미확인 | 페이지의 "can be downloaded by clicking here" 직링크(약관 클릭 없음) | 페이지에 **라이선스 문구 없음(미확인)**. Instagram 스크랩이라 초상·저작권 근거 없음 | 상업 학습 부적합. 속성 통계 참고용 |
| WSD (Wild Selfie Dataset) | IIIT Allahabad, CVIP 2023 / https://github.com/shivram1987/WildSelfieDataset · arXiv 2302.07245 | 45,424장(train 40,862/test 4,562), 42명(여24/남18), 다양한 스마트폰, AR필터·거울·가림·조명·스케일·표정·시점·블러·회전 변화 | 라이선스 폼을 "faculty who is Lab Incharge/Head of Department/Head of Institute"가 작성해 srdubey@iiita.ac.in 송부 | 원문 조건 GitHub에 미게시(미확인), 인용 필수 | 교수 서명 필요 → 부트캠프 팀은 사실상 불가 |
| RECOD Selfie (RCD-Selfie) | Unicamp / https://figshare.com/articles/online_resource/RECOD_Selfie_Dataset_RCD_/5427142 | 56명 전면카메라 영상, 조명·포즈·표정 변화 | EULA 서명 필요 (figshare 403으로 원문 미확인) | 미확인 | — |
| SiW (Spoof in the Wild) | MSU CVLab, 2018 / http://cvlab.cse.msu.edu/siw-spoof-in-the-wild-database.html · DRA http://cvlab.cse.msu.edu/pdfs/DRA_form_SiW.pdf | 165명, 4,478영상, 30fps 15초 **1080p**, 실영상은 "four sessions with variations of distance, pose, illumination and expression" | DRA 서명 후 온라인 신청 | 페이지 원문: "SiW database is available under a license from Michigan State University **for research purposes**." | 비상업, 안티스푸핑 목적 |
| 2023–2026 공개 라이선스(CC BY) 폰 인물 데이터셋 | — | — | — | — | **검색에서 CC BY급 셀피/조명·포즈 라벨 데이터셋 발견 못 함.** 상용 판매 데이터(Unidata, Axon, TrainingDataPro 등)만 존재 |

## 핵심 결론 (당화응 관점)
1. **상업 서비스에 실제로 쓸 수 있는 것**: AI Hub 얼굴 계열(영리 R&D 허용, 국내 서버·출처표기·재배포 금지 조건), MST 스케일 스와치(CC BY 4.0, 2차 확인), FairFace(CC BY 4.0, 단 피부톤 라벨 없음). 나머지 얼굴형·조명·셀피 데이터셋은 전부 비상업 또는 라이선스 근거 부재.
2. **피부톤 Lab 베이스라인**: 공개 상업가능 데이터 없음 → AI Hub "한국인 피부상태 측정"(스마트폰 촬영·부위 박스·색소 등급) 신청이 최선. MST-E는 학습 금지(주석자 교육용만).
3. **얼굴형**: Kaggle niten19는 메타상 CC0지만 셀럽 스크랩·라벨링 근거 없음, 랜드마크 규칙 정확도 36–65%, CNN 85–90%(같은 노이즈 데이터 기준). 규칙 기반 얼굴형 판정은 자체 소규모 라벨링(한국인 셀피)으로 검증하는 게 현실적.
4. **조명 강건성**: 한국인 안면 이미지의 조명 30종(864×576)이 무료 중 최선; Multi-PIE는 유료·절차 부담, Yale B는 흑백.
5. **포즈**: AI Hub Celeb-K(1024×1024, yaw/pitch/roll −30~+30° 라벨)가 국내 셀피 포즈 테스트셋으로 적합.

## 미확인 항목 요약
MST 공식 페이지 라이선스 원문(JS 렌더링), Multi-PIE 현재 금액, CMU PIE 배포조건, 300W-LP 라이선스, UCF Selfie 약관, WSD/RECOD 약관 원문, K-Face KIST 사이트 약관, Fitzpatrick17k 감사 정량치, Kaggle 얼굴형 라벨 노이즈 정량 감사(없음), CCv2 상업 조항 전문.

## 출처
- AI Hub 이용정책 https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105
- AI Hub 83 / 469 / 71645 / 71886 / 71415 / 71427 / 82 / 528 (위 표 URL)
- K-Face GitHub https://github.com/k-face/k-face_2019 · arXiv https://arxiv.org/abs/2103.02211
- Kaggle niten19 / zeyadkhalid / attanmhd / minhquangbui / hoangthangcdt / lucifierx / hanakb (위 표 URL; license는 각 페이지 JSON-LD `license.name`)
- arXiv 1911.07916 https://arxiv.org/abs/1911.07916 · dsmlr/faceshape https://github.com/dsmlr/faceshape · VIScial https://ieeexplore.ieee.org/document/10759179/ · ESWA 2025 https://www.sciencedirect.com/science/article/abs/pii/S0957417425027320 · IdentiFace https://arxiv.org/pdf/2401.01227 · 2022 서베이 https://www.researchgate.net/publication/362903132_Human_Face_Shape_Classification_with_Machine_Learning
- MST https://skintone.google · Google 블로그 https://blog.google/products/search/monk-skin-tone-scale/ · MST-E https://research.google/blog/consensus-and-subjectivity-of-skin-tone-annotation-for-ml-fairness/ · arXiv 2305.09073 · JAAD https://www.jaad.org/article/S0190-9622(25)02226-1/fulltext
- CCv2 https://ai.meta.com/datasets/casual-conversations-v2-dataset/ · https://ar5iv.labs.arxiv.org/html/2303.04838
- Fitzpatrick17k https://github.com/mattgroh/fitzpatrick17k · https://arxiv.org/abs/2401.14497
- FairFace https://github.com/joojs/fairface · CFD https://www.chicagofaces.org/ · SCUT-FBP5500 https://github.com/HCIILAB/SCUT-FBP5500-Database-Release
- Multi-PIE https://pmc.ncbi.nlm.nih.gov/articles/PMC2873597/ · https://cmu.flintbox.com/technologies/67027840-27d5-4570-86dd-ad4715ef3c09 · https://arxiv.org/pdf/2211.08030
- CMU PIE https://publications.ri.cmu.edu/the-cmu-pose-illumination-and-expression-pie-database
- Yale B https://www.cs.yale.edu/cvc/projects/yalefacesB/yalefacesB.html · Extended https://vision.ucsd.edu/datasets/extended-yale-face-database-b-b
- FaceScape https://github.com/zhuhao-nju/facescape · BIWI https://huggingface.co/datasets/ETHZurich/biwi_kinect_head_pose · AFLW https://www.tugraz.at/institute/icg/research/team-bischof/learning-recognition-surveillance/downloads/aflw · 3DDFA issue https://github.com/cleardusk/3DDFA/issues/221 · LPFF https://huggingface.co/datasets/onethousand/LPFF
- UCF Selfie https://www.crcv.ucf.edu/data/Selfie/ · WSD https://github.com/shivram1987/WildSelfieDataset · RECOD https://figshare.com/articles/online_resource/RECOD_Selfie_Dataset_RCD_/5427142 · SiW http://cvlab.cse.msu.edu/siw-spoof-in-the-wild-database.html
