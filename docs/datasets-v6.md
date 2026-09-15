# 당화응 — 데이터셋 링크 (v6)

> 2026-09-14 확인. 라이선스는 다운로드 전에 페이지에서 다시 확인할 것. "연구용"은 발표·과제 사용은 되고 사업화 시 교체 필요.

## 얼굴형 — 쉐딩·하이라이트 규칙 검증용 (v6)

| 이름 | 규모 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|
| Face Shape Dataset (Kaggle, niten19) | 5,000장, 5분류(Heart·Oblong·Oval·Round·Square) 각 1,000장, train 800/test 200, 여성 연예인 | https://www.kaggle.com/datasets/niten19/face-shape-dataset | 페이지에서 확인 (이전 조사 CC0로 기록, 재확인 필요) | 얼굴형 규칙 검증용 분류 모델 |
| Face Shape Preprocessed (Kaggle, zeyadkhalid) | 위 데이터 전처리본 | https://www.kaggle.com/datasets/zeyadkhalid/faceshape-processed | 페이지에서 확인 | 같은 용도, 정렬·크롭 완료 |
| Face Shape Oval/Round/Square (Kaggle, attanmhd) | 3분류 | https://www.kaggle.com/datasets/attanmhd/face-shape-oval-round-square/data | 페이지에서 확인 | 보조 |

## 화장 (화장 전/후, 화장 전이)

| 이름 | 규모 | 링크 | 라이선스 | 용도 |
|---|---|---|---|---|
| **FFHQ-Makeup** (CyberAgent, 2025) | 18,000명 × (맨얼굴 1 + 화장 5) = 108,000장, 512×512, **같은 얼굴의 맨얼굴·화장 쌍, 기하 정렬됨** | https://huggingface.co/datasets/cyberagent/FFHQ-Makeup · 논문 https://arxiv.org/abs/2508.03241 | CC-BY-NC-SA-4.0 (비상업) | **분할 모델 학습 1순위.** 맨얼굴-화장 차이가 곧 정답 마스크. 합성 데이터 생성 부담을 크게 줄임 |
| MT (Makeup Transfer, BeautyGAN) | 3,834장 (맨얼굴 1,115 + 화장 2,719), 256×256, 68점 정렬 | Drive https://drive.google.com/file/d/18UlvYDL6UGZ2rs0yaDsSzoUlw8KI5ABY/view · 프로젝트 http://colalab.org/projects/BeautyGAN · 코드 https://github.com/wtjiang98/BeautyGAN_pytorch | 연구용 (명시 라이선스 없음) | 화장 전이 모델 참고·평가, 화장 분포 통계 |
| BeautyFace (BeautyREC) | 3,000장, 512×512, 얼굴 파싱 맵 포함 | Drive https://drive.google.com/file/d/1mhoopmi7OlsClOuKocjldGbTYnyDzNMc/view · 코드 https://github.com/learningyan/BeautyREC | 연구용 (명시 라이선스 없음) | 파싱 맵이 있어 부위 마스크 학습·평가에 유용 |
| CPM-Real / Synt-1 / Synt-2 / Stickers (VinAI) | 3,895 / 5,555 / 1,625쌍+1,115 / 577장 | https://public.vinai.io/CPM-datasets/CPM-Real.zip · https://public.vinai.io/CPM-datasets/CPM-Synt-1.zip · https://public.vinai.io/CPM-datasets/CPM-Synt-2.zip · https://public.vinai.io/CPM-datasets/Stickers.zip · 설명 https://github.com/VinAIResearch/CPM/blob/main/about-data.md | 연구·교육 전용, 재배포 금지, 인용 필수 | 실제 환경(in-the-wild) 화장 사진, 진한 화장 평가 |
| LADN | 635장 (화장 전/후 비대응 + 합성 정답), Face++ 랜드마크 포함 | Drive https://drive.google.com/file/d/1Y0AlgKSVZNsjUG4u0YUHzoxtsG0qgexZ/view · 코드 https://github.com/wangguanzhi/LADN | 연구용 (명시 라이선스 없음) | 진한 화장 보조 |
| Makeup-Wild (PSGAN) | 772장, 다양한 자세·표정 | 목록 https://github.com/thaoshibe/awesome-makeup-transfer (OneDrive 링크 있음) · 코드 https://github.com/wtjiang98/PSGAN | 연구용 | ±30° 자세에서 트래킹·채점 평가 |
| Makeup Detection Face Dataset (Kaggle, tapakah68) | 같은 사람의 화장 전/후 사진 | https://www.kaggle.com/datasets/tapakah68/makeup-detection-dataset · HF https://huggingface.co/datasets/TrainingDataPro/makeup-detection-dataset | 페이지에서 확인 (상업 데이터 업체 샘플일 가능성) | 같은 사람 전/후라 ΔE 기준선 검증에 유용, 규모 확인 필요 |
| Makeup or No Makeup (Kaggle, petersunga) | 화장 유무 분류 | https://www.kaggle.com/datasets/petersunga/make-up-vs-no-make-up | 페이지에서 확인 | 보조 |
| Antitza Dantcheva Makeup datasets (YMU·VMU·MIW·MIFS) | 200~600장씩 4종 | http://www.antitza.com/makeup-datasets.html | 연구용, 신청 필요 | 보조 |

## 목록 페이지
- awesome-makeup-transfer (데이터셋·논문 총정리): https://github.com/thaoshibe/awesome-makeup-transfer

## 우리 용도 매핑

| 우리 작업 | 1순위 | 보조 |
|---|---|---|
| CV 화장 영역 시맨틱 분할 모델 학습 | FFHQ-Makeup (쌍 데이터로 정답 자동) + 자체 합성 | BeautyFace 파싱 맵, MT |
| 분할 모델 평가 (실제 사진) | 자체 라벨 200~500장 | CPM-Real, Makeup-Wild |
| 화장 전이(얹어보기) 모델 참고·평가 | MT, BeautyFace | CPM, LADN |
| ΔE 기준선·조명 검증 | 팀원 자가 촬영 | Makeup Detection (같은 사람 전/후) |

## 주의
- FFHQ-Makeup·CPM은 비상업·연구 전용. 발표와 과제는 가능하나 사업화 시 학습 데이터 교체 또는 자체 데이터로 재학습 필요.
- Kaggle 라이선스는 페이지 우측 "License" 칸에서 직접 확인. CC0가 아니면 위와 같은 조건.
- Google Drive 링크는 소유자가 닫을 수 있으니 받는 즉시 팀 저장소에 사본 보관(재배포 금지 조건은 지킬 것).
