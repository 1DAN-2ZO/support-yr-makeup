# 개인화 근거 논문 39편

각 폴더에 `원문.pdf`(전부 유지)·`요약.md`(핵심·수치·우리에게 무엇인지, 그림은 "원문 p.N 그림 M" 위치 표기로 대신함 — PNG 사본은 안 둠). 라이선스가 허용한 일부는 원래 `전문번역.md`도 있었지만, 원문이 있으니 뺐다(2026-09-30, ⑥ 제안).

**씀 / 참고** 칸: "씀"은 지금 코드에 수치·상수로 이미 쓰였거나 구체적인 미결 기술 결정(ΔE 재가중 등)을 직접 뒷받침하는 논문. "참고"는 방향성 근거는 되나 지금 결정에 필수인 숫자·임계값은 없는 논문 — 나중에 근거가 될 수 있어 남겨둔다.

---

## 화장 전이 (5)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [WACV 2022] Facial Attribute Transformers for Precise and Robust Makeup Transfer | 씀 | "색만으론 모양 전달 안 됨" 논의에 인용 |
| [arXiv 2024] Content-Style Decoupling for Unsupervised Makeup Transfer without Generating Pseudo Ground Truth (CSD-MT) | 씀 | 아직 코드 미반영 — 저주파/고주파 MSE(280 vs 4)로 ΔE 채점 방식의 이론적 근거 후보 |
| [CVPR 2026] Diffusion-Based Makeup Transfer with Facial Region-Aware Makeup Features | 참고 | 참고할 절차는 있지만 우리 결정에 직접 쓸 숫자는 없음 |
| [CVPRW 2023] BeautyREC - Robust, Efficient, and Component-Specific Makeup Transfer | 참고 | 모델 후보 비교엔 쓸만하나 지금 결정에 필수는 아님 |
| [情報知識学会誌 2026] The effect of facial skeletal morphology on the extent of attractiveness enhancement produced by identical makeup | 참고 | 상호작용 p=0.104로 유의성 없음, 저자도 예고편(4쪽)이라 근거 약함 |

## 개인화 근거 (5)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [AAAI 2017] Examples-Rules Guided Deep Neural Network for Makeup Recommendation | 씀 | `client/src/core/face-measure.ts`에 인용 (Alashkar 2017, 눈모양 분류 정확도 61.1%) |
| [AAPS 2020] Comparison of eye measurements between young Korean women with inborn double eyelids and those with single eyelids | 씀 | 아직 코드 미반영 — MRD1 등 한국 여성 눈 실측값, 라이너 두께 기준을 눈폭→눈높이로 바꿀 근거 |
| [AJBC 2021] 여성의 눈 형태에 컬러 이미지 스케일을 이용한 스모키 메이크업 이미지의 분석 | 참고 | 일러스트 자극, 통계검정 없음, 형용사 빈도만 |
| [Front Psychol 2019] Viewpoint Invariance of Eye Size Illusion Caused by Eyeshadow | 참고 | 효과크기 2.4~3.7%는 확인했으나(메시 워핑 정당화엔 방향성만 도움), 필수 수치는 아님 |
| [PLOS ONE 2016] Facial Cosmetics and Attractiveness - Comparing the Effect Sizes of Professionally-Applied Cosmetics and Identity | 참고 | 제품 존재 이유(비즈니스 피치)지 엔지니어링 파라미터 아님 |

## 눈썹 근거 (3)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [Front Psychol 2019] Data-Driven Research on the Matching Degree of Eyes, Eyebrows and Face Shapes | 씀 | `face-measure.ts`에 인용 (Zhao 2019, 눈썹 굽음 측정 공식) |
| [JKSC 2023] AI 뷰티 서비스 개발을 위한 표준형 눈썹 디자인 연구 | 씀 | `client/src/core/personal-guide.ts`·`personalize.ts` (STANDARD_BROW_MM, JKSC_BROW_ADJUST_MM) |
| [arXiv 2022] ILoveEye - Eyeliner Makeup Guidance System with Eye Shape Features | 씀 | `personal-guide.ts`·`personalize.ts`·`face-measure.ts` (라이너 꼬리 각도 15°·길이 12%, 눈 종횡비 분류, 처짐 판정) |

## 눈화장 근거 (4)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [Front Hum Neurosci 2015] A Real-Life Illusion of Assimilation in the Human Face - Eye Size Illusion Caused by Eyebrows and Eye Shadow | 참고 | 눈꺼풀-눈썹 거리를 섀도 범위 개인화 입력으로 쓸 방향성 근거, 아직 필수 수치는 아님 |
| [Front Psychol 2018] The Role of Regional Contrast Changes and Asymmetry in Facial Attractiveness Related to Cosmetic Use | 참고 | "눈밑 번짐 감점" 채점 규칙의 방향성 근거 |
| [PRS Glob Open 2016] Chen's Double Eyelid Fold Ratio | 참고 | 랜드마크로 뭘 못 재는지는 명확히 구분해 주나, 지금 결정에 쓸 숫자는 없음 |
| [心理学評論 2012] 顔と身体に関連する形状と大きさの錯視研究の新展開 - 化粧錯視と服装錯視 | 참고 | 라이너 스타일(winged/extend/drop) 이론적 틀 — 리뷰 논문이라 원 출처 확인 필요 |

## 볼·입술 근거 (7)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [AAPS 2023] Achieving attractive and healthy-looking lips through a central lip lift | 씀 | 아직 코드 미반영 — LTW·ULR·VUL 비율 수치, 립 오버라인 파라미터 후보 |
| [대한성형외과학회지 2005] 한국 청년층 구순의 사진 계측학적 연구 | 씀 | 아직 코드 미반영 — 20대 한국 여성 입술 실측 baseline |
| [AJBC 2017] 얼굴형과 메이크업의 색상변화에 따른 이미지 지각에 관한 연구 | 참고 | 분위기→색톤 매핑 방향성 근거, 화장 10종 무드 설계와 약하게 연결 |
| [Int J Primatol 2009] Facial Skin Coloration Affects Perceived Health of Human Faces | 참고 | PLOS ONE 2009(Stephen)와 중복, 백인 대상 |
| [PLOS ONE 2009] Skin Blood Perfusion and Oxygenation Colour Affect Perceived Human Health | 참고 | "상대비교(볼 vs 이마) 채점" 아이디어의 원출처이긴 하나 지금 결정에 필수 수치는 아님 |
| [PLOS ONE 2011] Oxygenated-Blood Colour Change Thresholds for Perceived Facial Redness, Health, and Attractiveness | 참고 | 본문 스스로 "이 숫자를 채점 기준으로 쓰면 안 된다"고 명시 |
| [i-Perception 2017] Effects of Lip Color on Perceived Lightness of Human Facial Skin | 참고 | "픽셀 밝기로만 채점 시 사람이 느끼는 효과를 놓친다"는 채점 설계 경고성 참고 |

## 색·진하기 근거 (10)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [Biomed Dermatol 2017] Facial Lab values and preferred base makeup products among native Korean women - a clinical study | 씀 | 아직 코드 미반영 — 한국 여성 L\*58~69 등 L\*a\*b\* baseline, sanity-check 기준값 |
| [CCID 2026] Bridging Accessibility and Precision - Evaluating the Reliability and Validity of a Smartphone-Based Skin Colorimeter | 씀 | 아직 코드 미반영 — `server/app/layer.py` ΔE 재가중 근거(폰 카메라 a\*/b\* 신뢰도 r=0.21~0.28 vs L\* r=0.71~0.87) |
| [복식문화연구 2012] 여대생의 퍼스널 컬러 시스템 유형에 따른 얼굴색 분석 | 씀 | 아직 코드 미반영 — 한국 얼굴 L\*a\*b\* baseline, "웜쿨 분류기 만들지 말자"는 근거 |
| [Br J Psychol 2019] Differential Effects of Makeup on Perceived Age | 참고 | 20대엔 "진하게=나이들어 보임" 방향성, VLM 제안 검증용 참고 |
| [Evol Psychol 2015] Cosmetics Alter Biologically-Based Factors of Beauty - Evidence from Facial Contrast | 참고 | 측정 공식은 파이프라인화 가능하나 지금 결정에 필수는 아님 |
| [Front Psychol 2017] Facial Contrast Is a Cross-Cultural Cue for Perceiving Age | 참고 | 동아시아 얼굴 립 코칭 방향("어둡게"가 아니라 "붉게") 참고 |
| [PLOS ONE 2011] Cosmetics as a Feature of the Extended Human Phenotype | 참고 | 배수 상한 규칙(글래머룩 신뢰도 하락) 설계 참고, 필수 수치는 아님 |
| [PLOS ONE 2021] Skin coloration is a culturally-specific cue for attractiveness, healthiness, and youthfulness | 참고 | 동아시아인 L\* 중심 근거, CCID 2026과 방향은 겹치나 필수 수치는 CCID 쪽에 있음 |
| [Perception 2009] A Sex Difference in Facial Contrast and Its Exaggeration by Cosmetics | 참고 | 대비 측정 공식의 원출처, 여러 논문의 기반이나 직접 쓸 숫자는 없음 |
| [基礎心理学研究 2017] Color illusion on complexion by lipsticks and its impression | 참고 | "화장 전 사진에서만 피부색 측정" 같은 아키텍처 제약 참고 |

## 쉐딩·하이라이트 근거 (5)

| 논문 | 씀/참고 | 한 줄 |
|---|---|---|
| [Int J Cosmet Sci 2021] Facial radiance influences facial attractiveness and affective impressions of faces | 참고 | 볼+T존 하이라이트 위치의 인상 실험 근거, 필수 수치는 아님 |
| [JKSC 2025] 중년 여성의 동안 효과를 위한 디지털 기반 메이크업 디자인 연구 - 베이스 메이크업을 중심으로 | 참고 | 얼굴형별 쉐딩·하이라이트 위치 방향성, 랜드마크 대응은 가능하나 아직 참고 단계 |
| [PLOS ONE 2013] Aspects of Facial Contrast Decrease with Age and Are Cues for Age Perception | 참고 | 눈썹·입술 대비 측정 재사용 가능하나 필수 수치는 아님 |
| [PLOS ONE 2013] Depth Structure from Asymmetric Shading Supports Face Discrimination | 참고 | 본문 스스로 "대칭 셰딩엔 효과 없음, 화장 셰딩에 그대로 옮기면 과장"이라 명시 |
| [人間工学 2020] Impact of Lower Facial Features on Perceived Face Size | 참고 | 턱선·광대 셰딩 위치 방향성, 다구간 얼굴폭 측정 제안이나 필수 수치는 아님 |

---

## 이전 정리(2026-09-30)와 달라진 점

처음엔 "씀 12편만 남기고 나머지 27편은 원문·요약까지 통째로 뺀다"(PR #249)로 갔다가, ⑥ 제안으로 **전부 남기되 용량을 먹던 그림 PNG(131장, 45.5MB)·중복 렌더 PDF(66개, 84.3MB)·전문번역 md(27개, 0.8MB)만 뺐다.** 원문 PDF(39개, 66.9MB)는 용량이 크지 않아 전부 유지 — 39편 다 있어도 이전에 그림까지 포함한 12편(약 49MB)과 비슷한 크기다.
