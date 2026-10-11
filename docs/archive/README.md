# 옛 흐름 문서 (보관)

2026-10-06 에 흐름이 바뀌기 전의 문서다. **지금 서비스의 기준이 아니다** — 지금 흐름은 [`../README.md`](../README.md) 와 [`../service-definition-v6.md`](../service-definition-v6.md) 를 본다. 왜 그렇게 정했는지 · 무엇을 해 봤는지의 기록이라 지우지 않고 여기 둔다 (2026-10-11 옮김).

## 무엇이 달라졌나

| | 옛 흐름 (2026-09-16 ~ 10-05) | 지금 |
|---|---|---|
| 촬영 | 맨얼굴 4장 (정면 눈 뜸 · 감음, 좌 · 우 45°) | 정면 눈 뜬 장 하나 |
| 무엇을 따라 하나 | 정해진 화장 10종에서 고르기 | 내가 올린 참고 사진 한 장 |
| 미리 보기 | AR 로 실시간 입혀 보기 (2-b) | 정답사진 한 장 (서버가 만든 그림) |
| 따라 하기 | 부위마다 실시간 테두리 → 확인받기 → 점수 | 부위별 정지 사진 가이드, 중간 확인 없음 |
| 결과 | 부위 점수 · 합산 점수 | 점수 없이 부위별 문장 |
| 서버 | 화장 생성(Stable-Makeup) → VLM 개인화(09-29) → 안 씀(10-05) | 정답사진 · 옮긴 그림 만들기 (FLUX.2 klein) |

여기 문서에 나오는 것 중 **지금 없는 것**: 화장 템플릿 10종 · 얼굴형별 쉐딩 규칙 · VLM 개인화 · AR 입혀 보기 · 부위 점수와 합산 · 합성 데이터로 분할 모델 학습 · mm 척도.

## 기능 · 화면 정의

| 파일 | 내용 |
|---|---|
| `feature-spec-v6.md` | 기능 정의서 (F-01 ~ F-14, 모델 목록, 지표, 담당, 일정, 리스크) |
| `screen-image-brief-v6.md` | 화면 목업 이미지 생성 브리프 |
| `screen-mockup-v6-a.png` · `-b` · `-c` | 그 브리프로 만든 화면 목업 세 장 (2026-09-16. 전 이름 "Codex 이미지 …") |
| `impl-screen1-5-definition-v6.md` | 화면 1 ~ 5 구현 요소 정의 |
| `impl-screen6-review-v6.md` | 화면 6(전체 리뷰) 구현 요소 · 방법 · 검증 |
| `tech-definition-prod-screen1-2.md` | 화면 1 · 2 기술 정의 |
| `call-graph-check-v6.md` | 호출 그래프가 실제로 그렇게 동작하는지 확인표 (#81) |
| `vlm-server-handoff.md` | VLM 개인화 서버(`/plan`) 인수인계 — 2026-10-05 에 안 쓰기로 함. 회고는 `../reports/vlm-personalization-retrospective.md` |

## 초기 기술 검토 · 조사 (2026-09-16 ~ 18)

| 파일 | 내용 |
|---|---|
| `tech-stack-v6.md` | 필요 기술 목록 (모델 후보 · 라이선스 · 속도 목표) |
| `tech-review-full-flow-v6.md` | 기술 검토 — 화면 1 → 6 전체 |
| `tech-review-screen5-v6.md` · `tech-review-screen6-v6.md` | 화면 5 · 6 기술 검토 |
| `screen3-tech-v6.md` · `screen3-tech-study-v6.md` · `screen3-summary-v6.md` · `screen3-share-v6.md` | 화면 3(부위 완성본) 기술 정리 · 공부 노트 · 요약 · 공유용 |
| `related-work-v6.md` · `reading-list-v6.md` | 선행 연구 크로스체크 · 읽을 논문 목록 |
| `synth-training-v6.md` | 합성 데이터와 분할 모델 학습 (MVP 에서 뺌) |

## 데이터 계획 · 데이터셋 조사

| 파일 | 내용 |
|---|---|
| `data-plan-v6.md` · `data-plan-notion.md` · `data-plan.html` | 데이터 계획 통합본 · 쉬운 말 판 · 웹 판 |
| `data-needs-v6.md` · `data-acquisition-v6.md` | 필요한 데이터 목록 · 받아올 데이터(링크 · 받는 법) |
| `datasets-v6.md` · `datasets-ranked-v6.md` · `datasets-share-v6.md` | 데이터셋 링크 · 순위표(실측) · 공유용 정리 |
| `eval-public-dataset-plan-v1.md` | 공개 데이터셋으로 채점 먼저 확인하기 |

## 일정 · 분업 기록

| 파일 | 내용 |
|---|---|
| `sprints-v6.md` | 스프린트 (2026-09-21 ~ 10-09) |
| `tasks-by-module-v6.md` | 모듈별 전체 할 일 |
| `work-split-notion.md` | 분업안 노션용 (지금 쓰는 판은 `../work-split-modules-v6.md`) |
| `worklog-2026-09-16-17.md` | 작업 일지 |

## 그림

| 파일 | 내용 |
|---|---|
| `flowchart-v6.png` | 사용자 흐름 플로우차트 — 옛 흐름 |
| `processing-flow-v6.png` · `processing-flow-eli5-v6.png` | 처리 흐름 (기술판 · 쉬운 설명판) |
| `system-architecture-v6.png` | 시스템 아키텍처 |

## 경로가 바뀐 것

이 파일들은 전에 `docs/` 바로 아래에 있었다. 저장소 안의 경로는 옮기면서 고쳤지만, **깃허브 이슈 · PR 본문에 적힌 링크는 옛 경로 그대로**라 눌러도 안 열린다 — 파일 이름 앞에 `archive/` 를 넣으면 된다.
