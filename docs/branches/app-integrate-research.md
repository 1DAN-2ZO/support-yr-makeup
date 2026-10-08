# `app-integrate-research` 브랜치

jeakeun 조사·POC 통합 (PR #1 + #2 충돌 해결).

- 날짜: 2026-09-18
- PR: 1개 (병합 1) — #87
- 지금: 브랜치는 지워짐 (내용은 main 에)
- 트러블슈팅 기록: 3건

[← 브랜치 목록](README.md)

## PR 기록

<a id="pr-87"></a>

### #87 jeakeun 조사·POC 통합 (PR #1 + #2 충돌 해결)
- 브랜치: `app-integrate-research` · 병합 2026-09-18 · +11089 −85
- 한 일: 열려 있던 PR 두 개(`docs/tech-stack-and-datasets` 커밋 18개, `feat/screen3-finished-look` 커밋 10개)를 main 에 올리려고 충돌을 푼 통합 브랜치를 만들었다. 팀원 브랜치는 건드리지 않았다. 문서(`tech-stack-v6` 등), 시험판(`poc/synth` · `poc/datasets-eval` · `poc/screen3` · `poc/samples`), 기능 정의서 정정 3건이 들어왔다.
- 결과: `bash scripts/check.sh` 통과(ruff · pytest 5 · tsc · vitest 3 · eslint). 이 PR 이 합쳐지면 PR #1 · #2 는 자동으로 merged 로 닫힌다고 적혀 있다.
- 트러블슈팅:
  - `README.md` 폴더 목록 충돌 → main 의 최신 구조(server · eval · client)와 jeakeun 브랜치의 폴더가 서로 달랐다 → main 구조에 `poc/synth` · `poc/datasets-eval` · `poc/samples` 를 더했다.
  - `docs/README.md` 충돌 → 문서 색인은 양쪽 행을 모두 남기고, POC 경로 줄은 합쳤다.
  - `docs/impl-screen1-5-definition-v6.md` 의 화면 5 문장 충돌 → jeakeun 브랜치에는 "재시도 버튼 없음", main 에는 "다시 확인받기" 규칙(31b1ce9)이 있었다 → 나중에 내린 결정인 main 쪽을 유지했다.
  - 샘플 사진 20장의 rename/delete 충돌 → jeakeun 은 `danghaeung_phone_portraits_20_v2` 를 `poc/samples/phone-portraits-20` 으로 옮겼는데, main 에서는 그 폴더가 업스케일본(`danghaeung_poc_3x4_20`)으로 바뀌어 있었다 → 두 벌을 다 남겼다. jeakeun 도구 9개가 `poc/samples` 경로를 참조해서 지우면 깨지기 때문이다.
- 남긴 것: 사진 두 벌을 한 벌로 합치는 일은 별도 이슈로 미뤘다. 기능 정의서 9장의 분할 모델 줄이 "데이터 계획 4차"(분할 모델을 MVP 에서 빼고 확장 단계로)와 아직 어긋나며, 정의서 정정 이슈 `[app] 6-12` 에서 다른 9건과 함께 맞추기로 했다.
