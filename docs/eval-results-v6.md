# 평가 결과 (자동 생성 — eval/report.py)

> 손으로 고치지 않는다. `uv run python eval/run_all.py` 가 갱신한다.

## 최신

| 평가 | 지표 | 기준선 | 현재 | 통과 기준 | n | 비고 | 파일 |
|---|---|---|---|---|---|---|---|
| E-2 | 겹침 점검 · 가장 비슷한 학습 사진 라벨 베끼기 | 0.765 | 0.566 |  | 643 | 낮을수록 겹침이 적다. v1 은 시험 사진이 학습 사진의 흑백 가공본이라 76.5% | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형 정확도 · (v1 정정) CNN 80.8% | 0.222 |  |  | 998 | v1 CNN 80.8% 는 데이터 누수(학습·시험 겹침)로 과대평가된 숫자. 정리 후 아래 줄 참고 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형 정확도 · 얼굴 점 478점 + 로지스틱 회귀 | 0.222 | 0.722 |  | 643 | 정리한 공개 얼굴형 시험 643장(컬러·앱 여백, 서양·동양 혼합, 학습과 묶음 단위 분리) | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형 정확도 · CNN 파인튜닝 efficientnet_b0 | 0.222 | 0.717 |  | 643 | 정리한 공개 얼굴형 시험 643장(컬러·앱 여백, 서양·동양 혼합, 학습과 묶음 단위 분리). 학습 4248장, 8에폭. 앞머리 있음 0.715 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형 정확도 · 얼굴 점 478점 + MLP (5회 평균) | 0.222 | 0.798 |  | 643 | 정리한 공개 얼굴형 시험 643장(컬러·앱 여백, 서양·동양 혼합, 학습과 묶음 단위 분리). 앞머리 있음 0.682 / 없음 0.829 (검증을 무작위로 뗀 1회 측정) | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형 정확도 · 얼굴 점 478점 + 머리선 점 10개 + MLP (5회 평균) — 최종 | 0.222 | 0.815 | 촬영 기준: 앞머리 넘기고 촬영 | 643 | 정리한 공개 얼굴형 시험 643장(컬러·앱 여백, 서양·동양 혼합, 학습과 묶음 단위 분리). ±0.006, 5회 모두 머리선 없는 MLP 보다 높음. 앞머리 없음 0.829 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형별 정확도 · 최종 MLP · 각진형 | 0.222 | 0.842 |  | 129 | 5회 평균 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형별 정확도 · 최종 MLP · 긴형 | 0.222 | 0.839 |  | 129 | 5회 평균 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형별 정확도 · 최종 MLP · 둥근형 | 0.222 | 0.812 |  | 129 | 5회 평균 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형별 정확도 · 최종 MLP · 역삼각형 | 0.222 | 0.802 |  | 129 | 5회 평균 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-2 | 얼굴형별 정확도 · 최종 MLP · 계란형 | 0.222 | 0.78 |  | 129 | 5회 평균 | `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv` |
| E-1 | 부위 판정 일치율 (점수 낸 것만) |  |  |  | 0 |  | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 부위 판정 일치율 · 한 칸 차이까지 허용 |  |  |  | 0 |  | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 무응답(확인만) 비율 |  | 0.423 |  | 300 | 이유: faint 127 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 위험한 오답 (사람 off → 채점기 ok) |  |  |  | 0 |  | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 화장 찾음 비율 · brow |  | 1.0 |  | 50 | 판정 ok 2 · slight 46 · off 2 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 화장 찾음 비율 · liner |  | 1.0 |  | 50 | 판정 ok 0 · slight 27 · off 23 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 화장 찾음 비율 · lip |  | 1.0 |  | 50 | 판정 ok 2 · slight 47 · off 1 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 화장 찾음 비율 · shadow |  | 0.34 |  | 50 | 판정 ok 10 · slight 3 · off 4 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 화장 찾음 비율 · cheek |  | 0.12 |  | 50 | 판정 ok 1 · slight 5 · off 0 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 맨얼굴 대조 · '화장 없음'(확인만) 비율 |  | 1.0 |  | 50 | 1.0 이 정상 | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |
| E-1 | 채점 시간 중앙값(ms) |  | 28.0 |  | 300 |  | `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv` |

## 이력

- `2026-09-18_686d91a_score_score-v0.1_golden-v0.csv`
- `2026-09-21_b418878_faceshape_pub-v0_faceshape-test998.csv`
- `2026-09-22_21a3d78_score_score-v0.1_golden-v0.csv`
- `2026-09-22_71c01ea_faceshape_clean-v1_faceshape-clean643.csv`

## 실험 노트

날짜 · 설정 이름 · 바뀐 것 · 결과 · 채택 여부 — 사람이 한 줄씩 적는 유일한 절.

