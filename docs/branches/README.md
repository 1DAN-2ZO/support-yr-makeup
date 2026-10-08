# 브랜치별 작업 기록 — 한 일 · 결과 · 트러블슈팅

앱 통합(⑥)과 채점(③)을 맡은 사람이 만든 브랜치마다, 무엇을 했고 결과가 어땠고 어떤 문제를 어떻게 풀었는지 모은 기록이다. 브랜치 46개, PR 113개 (2026-09-18 ~ 2026-10-08).

가이드(②) 브랜치 30개는 아래 「가이드(②) 브랜치」 표에 따로 모았다.

## 읽는 법

- 브랜치 이름을 누르면 그 브랜치의 기록이 열린다. PR 마다 **한 일 · 결과 · 트러블슈팅(증상 → 원인 → 해결) · 남긴 것** 순서로 적혀 있다
- 내용은 **PR 본문 · 댓글 · 커밋 제목에 적힌 사실**만 옮긴 것이다. 적혀 있지 않은 숫자나 원인은 채우지 않았다 ("본문에 없음" 으로 둔다)
- 날짜는 GitHub 기록의 UTC 날짜다. 한국 시간으로는 하루 늦을 수 있다
- 담당 번호: ① 촬영 · ② 가이드 · ③ 채점 · ④ 서버 · ⑤ 모델 · UI · ⑥ 앱 통합
- "트러블슈팅" 칸의 숫자는 문제를 푼 기록의 건수다. 0 이면 그 브랜치의 PR 에는 문제 이야기가 없었다는 뜻이다
- 이 기록은 2026-10-08 에 한 번 만든 것이다. 그 뒤의 PR 은 들어 있지 않다

## 브랜치 목록 (시작한 날 순서)

| 브랜치 | 기간 | PR | 상태 | 트러블슈팅 | 무엇 |
|---|---|---|---|---|---|
| [`poc/full`](poc-full.md) | 09-16 ~ 09-18 | 커밋 32 | 실험 · 보관 — 병합 안 함 | 0 | 본 개발 전에 화면별로 만든 시험판(POC)을 한곳에 모아 둔 보관 브랜치. 병합하지 않는다 |
| [`app`](app.md) | 09-18 ~ 10-01 | 66 | 병합 66 | 90 | 앱 통합 담당의 주 브랜치. 화면 껍데기 · 로그 · 화면 2 · 6 부터 머리카락 가림 · 채점 조명 보정 · 문서 정정… |
| [`app-integrate-research`](app-integrate-research.md) | 09-18 | 1 | 병합 1 | 3 | jeakeun 조사·POC 통합 (PR #1 + #2 충돌 해결) |
| [`docs/branch-policy`](docs-branch-policy.md) | 09-18 | 1 | 병합 1 | 5 | 브랜치 규칙 정리 + 강제 푸시 차단 (2026-09-18 사고 대응) |
| [`app-log-residue`](app-log-residue.md) | 09-28 | 1 | 병합 1 | 1 | 끝내기 뒤 로그 저장소가 events 키를 다시 만든다 — 닫고, 다시 시작할 때 연다 |
| [`app-paper-techniques`](app-paper-techniques.md) | 09-28 | PR 없음 | `app` 으로 들어감 | 0 | 9월 28일 그물 필터 · 눈썹 · 입술 규칙을 되돌려 가며 맞춘 작업 브랜치. 내용은 `app` 을 거쳐 main 에 들… |
| [`app-score-owner`](app-score-owner.md) | 09-28 | 1 | 병합 1 | 0 | ③ 채점·합산 담당 변경 — e9on (2026-09-28) |
| [`score`](score.md) | 09-28 ~ 09-29 | 6 | 병합 6 | 14 | 채점 담당 브랜치. 확인받기 묶음 채점 · 맨얼굴 오채점 수정 · 채점 가정값을 한 파일로 모으기 · 평가 도구를 앱과 같… |
| [`ar-frame`](ar-frame.md) | 09-29 | 1 | 병합 1 | 1 | 2-b AR 한 장면 저장 — 화면 3 완성본용 (#182) |
| [`vlm-eval`](vlm-eval.md) | 09-29 ~ 10-01 | 2 | 병합 2 | 10 | 개인화에 쓸 공개 VLM 을 고르는 실험 — 후보 조사 · 실험 코드 · 프롬프트 형식 확정 · 서버 인수인계 문서 |
| [`vlm-flow`](vlm-flow.md) | 09-29 | 1 | 병합 1 | 3 | 새 흐름 — 서버 처리 화면 없이 화장 선택 · 개인화는 VLM 이 정하고 규칙이 거름 · VLM 없으면 이용 불가 |
| [`guide-crop`](guide-crop.md) | 09-30 | 1 | 병합 1 | 0 | 눈·눈썹은 가로 화면에서만 — 세로면 막는다 (#204 후속, 팀 협의) |
| [`samples/ffhq-east-asian`](samples-ffhq-east-asian.md) | 09-30 | 1 | 병합 1 | 1 | FFHQ-Makeup 동양인 맨얼굴 샘플 — 목록과 꺼내는 스크립트 (사진은 저장소 밖) |
| [`server`](server.md) | 09-30 | 1 | 병합 1 | 1 | 화장 대표 이미지에서 부위별 색·진하기 뽑는 함수 look_values_from_arrays (#121 1번) |
| [`app-bench-images`](app-bench-images.md) | 10-01 | 1 | 병합 1 | 2 | 벤치 샘플 이미지 16장을 저장소에서 뺌 — 숫자와 글만 남김 (#118) |
| [`app-ci-fix`](app-ci-fix.md) | 10-01 | 1 | 병합 1 | 1 | main CI 고침 — VLM 평가지가 mediapipe 없이도 그려지게 (#258 뒤로 빨갰다) |
| [`app-frame-loop`](app-frame-loop.md) | 10-01 | 1 | 병합 1 | 4 | 2-b AR · 리뷰 정면 1장도 공용 카메라 루프로 — 카메라 새 장면에만 얼굴 찾기 (#245) |
| [`app-prompt-faceshape-name`](app-prompt-faceshape-name.md) | 10-01 | 1 | 병합 1 | 1 | VLM 프롬프트의 얼굴형 이름 하트형 → 역삼각형 (vlm-prompt-v4) |
| [`app-safari-blur`](app-safari-blur.md) | 10-01 | 1 | 병합 1 | 4 | 사파리에서 화장이 딱딱한 도형으로 나오던 것 — 번짐 기능이 없으면 줄였다 키워 번지게 (2-b AR · 화면 3) |
| [`eval/sheet-baseline`](eval-sheet-baseline.md) | 10-01 ~ 10-06 | 1 | 닫힘 1 | 1 | VLM 평가지 — 개인화 없는 화장을 기준 그림으로 같이 보여 줌 |
| [`fix/droop-tilt-4deg`](fix-droop-tilt-4deg.md) | 10-01 | 1 | 병합 1 | 3 | 처진 눈 경계 4° — 사람 표시로 맞춤 (#264 후속) |
| [`fix/droop-tilt-5deg`](fix-droop-tilt-5deg.md) | 10-01 | 1 | 병합 1 | 2 | 처진 눈 경계 5° — Lee 2020 class I 경계 · 논문 근거 (#266 후속) |
| [`score-shape`](score-shape.md) | 10-01 ~ 10-08 | 커밋 57 | 실험 · 보관 — 병합 안 함 | 8 | 채점을 "그린 모양이 맞는가" 로 바꿔 보는 실험 브랜치 (실험 1 ~ 46). 병합하지 않고 기록으로 둔다. 여기서 검증… |
| [`try/droop-tilt`](try-droop-tilt.md) | 10-01 | 1 | 병합 1 | 4 | 처진 눈을 눈꼬리 기울기 < 4° 로 판정 (ILoveEye α>β 대신, 사람 표시로 맞춤) · vlm-prompt-v3 |
| [`docs/vlm-retrospective`](docs-vlm-retrospective.md) | 10-02 | 1 | 병합 1 | 0 | VLM 개인화 정리 — 한 것 · 결과 · 된 것과 안 된 것 (보류) |
| [`exp/screen6-comment`](exp-screen6-comment.md) | 10-02 ~ 10-06 | 1 | 닫힘 1 | 5 | 화면 6 한줄평 확인 실험 (#287) — 규칙 한줄평 대 텍스트 LLM |
| [`vlm-freedom`](vlm-freedom.md) | 10-02 | 커밋 1 | 실험 · 보관 — 병합 안 함 | 2 | VLM 에게 자유를 더 주면 개인화가 나아지는지 본 기록용 실험. 병합하지 않았다 |
| [`app-no-personalize`](app-no-personalize.md) | 10-05 | 1 | 병합 1 | 3 | "개인화"를 뺌 — 모두 같은 표준 계획, 화장을 누르면 바로 2-b AR, VLM 없어도 앱이 돎 |
| [`app-attempt-shots`](app-attempt-shots.md) | 10-06 ~ 10-07 | 1 | 병합 1 | 2 | 화면 5 시도사진 — 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 자동 촬영 (새 흐름) |
| [`app-flow-skeleton`](app-flow-skeleton.md) | 10-06 | 1 | 병합 1 | 1 | 새 흐름 뼈대 — 촬영 → 참고 사진·정답사진 → 부위 가이드 → 시도사진 → 피드백 → 저장·공유 (빈 자리 화면) |
| [`docs-new-flow`](docs-new-flow.md) | 10-06 | 1 | 병합 1 | 0 | 서비스 정의서를 새 흐름으로 — 참고 사진 → 정답사진 → 부위별 사진 가이드 → 시도사진 → 피드백 |
| [`docs-split-fix`](docs-split-fix.md) | 10-06 | 1 | 병합 1 | 0 | 부위별 칠한 자리 떠내기는 ①②④ 담당 — ③ 은 비교 · 피드백만 |
| [`app-attempt-burst`](app-attempt-burst.md) | 10-07 | 1 | 병합 1 | 3 | 시도사진 — 원본 크기로 · 눈 뜬 장은 다섯 장 묶음 (피드백이 받는 그림 조건 #328) |
| [`app-attempt-gap`](app-attempt-gap.md) | 10-07 | 1 | 병합 1 | 1 | 시도사진 묶음 간격을 0.2초로 — ATTEMPT_BURST.minGapMs 80 → 200 (#333) |
| [`app-feedback-wire`](app-feedback-wire.md) | 10-07 | 1 | 병합 1 | 6 | 화면 6 피드백 잇기 — 맨얼굴 · 정답사진 · 시도사진 묶음을 feedbackWhole 에 넣어 화면에 넘기기 (연결 부… |
| [`app-save-share`](app-save-share.md) | 10-07 | 1 | 병합 1 | 2 | 화면 7 저장 · 공유 잇기 — 결과 한 장(정답사진 · 내 화장 · 부위별 문장)을 만들어 폰에 내보내기 (연결 부분) |
| [`capture-two-shots`](capture-two-shots.md) | 10-07 | 1 | 병합 1 | 2 | 맨얼굴 촬영을 정면 2장으로 — 옆얼굴 45° 두 장을 뺀다 (새 흐름) |
| [`docs-flowchart-new-flow`](docs-flowchart-new-flow.md) | 10-07 | 1 | 병합 1 | 0 | 플로우차트를 새 흐름으로 — 옛 그림은 "옛 흐름" 으로 표시 |
| [`docs/feedback-input-contract`](docs-feedback-input-contract.md) | 10-07 | 1 | 병합 1 | 5 | 피드백(화면 6)이 받는 그림 — 첫 배포는 지금 것으로, 그다음 요청은 "옮긴 그림" 하나 (① · ②) |
| [`eval-funnel-new-flow`](eval-funnel-new-flow.md) | 10-07 | 1 | 병합 1 | 1 | 퍼널 집계를 새 흐름 화면으로 — 이탈 위치 줄 추가 |
| [`feedback-core`](feedback-core.md) | 10-07 | 1 | 병합 1 | 2 | 화면 6 피드백 — 시도사진을 정답사진과 견줘 부위별 문장 내기 (첫 배포용 계산 부분) |
| [`server-events`](server-events.md) | 10-07 | 1 | 병합 1 | 4 | 사용 기록 받기 — POST /events (어느 화면에서 나갔는지 · 받는 쪽만) |
| [`app-answer-persist`](app-answer-persist.md) | 10-08 | 1 | 병합 1 | 5 | 정답사진 · 옮긴 그림을 폰 세션 저장소에 — 새로고침해도 남게 (#331, ① 파일 수정 포함) |
| [`app-attempt-preview-fit`](app-attempt-preview-fit.md) | 10-08 | 1 | 병합 1 | 1 | 시도사진 미리보기 — 사진이 화면 폭 안에 두 장 나란히 들어오게 (폰 확인 10/8, #344) |
| [`app-transfer-wire`](app-transfer-wire.md) | 10-08 | 1 | 열림 1 | 12 | 그림 만들기 잇기 — 앱 → 백엔드 POST /transfer → GPU 의 FLUX 서버 (꺼진 채로 미리 만듦) |
| [`ci-notify-nudy-name`](ci-notify-nudy-name.md) | 10-08 | 1 | 열림 1 | 0 | 디스코드 PR 알림 이름을 "당화응 PR" → "nudy PR" |

## 가이드(②) 브랜치 — 30개 (시작한 날 순서)

가이드 담당(②)이 2026-10-08 에 따로 정리해 더한 표다. 파일 모양은 위와 조금 다르다: 브랜치마다 **한 일 · 트러블슈팅(문제 → 원인 → 해결) · 남긴 것**. PR 본문 · 커밋 기록과 그때 작업 대화에서 옮겼다. 사진은 넣지 않았다.

| 브랜치 | 기간 | PR | 상태 | 무엇 |
|---|---|---|---|---|
| [`guide`](guide.md) | 09-21 ~ 09-29 | 7 | 병합 7 | 모듈 ② 기본 브랜치 — 초기 설계 · 화면 3 · 4 첫 구현 |
| [`guide-jitter`](guide-jitter.md) | 09-28 ~ 09-29 | 1 | 닫힘 1 | 화면 4 흔들림 1차 · 이벤트 · 표정 게이트. 내용은 ⑥ 이 main 에 직접 합침, 빠진 커밋은 `guide-rigid` 로 |
| [`guide-rigid`](guide-rigid.md) | 09-29 | 1 | 병합 1 | 입을 벌려도 "같은 각도로" 안 뜨게 (강체 점 13개) |
| [`guide-arframe`](guide-arframe.md) | 09-29 | 1 | 병합 1 | 화면 3 완성본 = 2-b AR 장면 |
| [`guide-bare-paint`](guide-bare-paint.md) | 09-29 | 1 | 병합 1 | 화면 3 완성본 = 쌩얼 정면 + 개인화 화장 |
| [`guide-crop`](guide-crop.md) | 09-30 | 2 | 병합 2 | 눈 부위 확대 창 · 가로 화면에서만 (자동 회전 꺼짐 대응) |
| [`guide-paint-safe`](guide-paint-safe.md) | 09-30 | 1 | 병합 1 | 화면 3: 화장을 그리다 오류가 나도 쌩얼 + 테두리 |
| [`guide-light`](guide-light.md) | 09-30 | 1 | 병합 1 | 화면 4 조명: 밝기는 채점 한계까지 통과 · 조명 색은 안내만 |
| [`guide-pose`](guide-pose.md) | 09-30 | 1 | 병합 1 | 화면 4 정면 각도도 턱 없이 |
| [`guide-rotate-lock`](guide-rotate-lock.md) | 09-30 | 1 | 병합 1 | 눈 부위는 화면 3 · 5 도 가로에서만 (빠진 커밋 다시) |
| [`guide-gate-readout`](guide-gate-readout.md) | 09-30 | 1 | 병합 1 | 화면 4 개발용 `?gate`: 게이트가 본 숫자 표시 |
| [`guide-pose-dir`](guide-pose-dir.md) | 09-30 | 1 | 병합 1 | 화면 4 각도 안내에 방향 (가로로 들면 카메라가 옆) |
| [`guide-frame-loop`](guide-frame-loop.md) | 10-01 | 1 | 병합 1 | 공용 카메라 루프: 카메라 새 장면에만 얼굴 찾기 |
| [`guide-gate-relax`](guide-gate-relax.md) | 10-01 | 1 | 병합 1 | 화면 4 완화: 3초 규칙 · 한계 완화 · 테두리 떨림 필터 |
| [`guide-portrait-lock`](guide-portrait-lock.md) | 10-01 | 1 | 병합 1 | 입술 · 볼 · 쉐딩은 세로에서만 · 섀도 꼬리를 테두리에도 |
| [`guide-mesh-pin`](guide-mesh-pin.md) | 10-02 | 1 | 병합 1 | 화면 4 테두리를 얼굴 그물에 붙이기 · 크게 돌려도 먼 쪽 눈에 붙게 |
| [`guide-dev-options`](guide-dev-options.md) | 10-02 ~ 10-05 | 1 | 병합 1 | 개발용 `?norotate` · `?jump` |
| [`guide-shadow-score-tail`](guide-shadow-score-tail.md) | 10-05 | 1 | 병합 1 | 섀도 채점 영역도 꼬리까지 |
| [`guide-live-run-tidy`](guide-live-run-tidy.md) | 10-05 | 1 | 병합 1 | `live-run.ts` 정리 (#288 리뷰) |
| [`guide-spread-marks`](guide-spread-marks.md) | 10-05 | 1 | 병합 1 | 블러셔 · 섀도우 · 쉐딩 테두리 안에 퍼지는 방향 표시 |
| [`guide-fade-25-40`](guide-fade-25-40.md) | 10-05 | 1 | 병합 1 | 먼 쪽 눈 흐리게 구간을 5° 씩 일찍 |
| [`guide-hairline-probe`](guide-hairline-probe.md) | 10-05 | 1 | 병합 1 | 머리선 점: 머리카락 분할로 이마 위 끝 찾기 (2-b 용) |
| [`guide-photo-poc`](guide-photo-poc.md) | 10-06 ~ 10-07 | 1 | 병합 1 | 정답사진에서 부위별 화장을 떼서 4 부위 가이드 모양으로 |
| [`flow-poc`](flow-poc.md) | 10-07 | 1 | 병합 1 | 부위 가이드 사진 · 실시간 같이 보기 · 새 흐름 한 바퀴 POC |
| [`page-titles-nudy`](page-titles-nudy.md) | 10-07 | 1 | 병합 1 | 개발 페이지 제목 "당화응" → "nudy" |
| [`decide-answer-method`](decide-answer-method.md) | 10-07 | 1 | 병합 1 | 정답사진 만드는 방식 확정 (#331) · `makeup-fit` 지우기 |
| [`klein-stable`](klein-stable.md) | 10-08 | 1 | 병합 1 | klein 서버 안 꺼지게 · 2배 빠르게 · 임시 파일 2분 뒤 지우기 |
| [`live-perf`](live-perf.md) | 10-08 | 1 | 병합 1 | 실시간 가이드 끊김 (#343) · 개발용 `?perf` |
| [`pin-spike`](pin-spike.md) | 10-08 | 1 | 병합 1 | 실시간 가이드 볼 테두리 점 튐 (#343) |
| [`klein-brow`](klein-brow.md) | 10-08 | 1 | 병합 1 | 정답사진에 눈썹도 옮기기 (#371) |

`guide-crop` 은 위 표에도 있다 (⑥ 이 #217 을 열어서). 파일은 #213 까지 넣은 이 판으로 바꿨다.

## 문제를 푼 기록이 많은 곳

- [`app`](app.md) — 90건
- [`score`](score.md) — 14건
- [`vlm-eval`](vlm-eval.md) — 10건
- [`score-shape`](score-shape.md) — 8건
- [`app-feedback-wire`](app-feedback-wire.md) — 6건
- [`docs/branch-policy`](docs-branch-policy.md) — 5건
- [`exp/screen6-comment`](exp-screen6-comment.md) — 5건
- [`docs/feedback-input-contract`](docs-feedback-input-contract.md) — 5건

## 같이 보면 좋은 문서

- 지금 흐름: [`../service-definition-v6.md`](../service-definition-v6.md) · [`../flowchart-new-flow.svg`](../flowchart-new-flow.svg)
- VLM 개인화를 해 보고 뺀 과정: [`../reports/vlm-personalization-retrospective.md`](../reports/vlm-personalization-retrospective.md)
- 피드백이 받는 그림의 조건: [`../feedback-input-contract.md`](../feedback-input-contract.md)
