# `app-ci-fix` 브랜치

main CI 고침 — VLM 평가지가 mediapipe 없이도 그려지게 (#258 뒤로 빨갰다).

- 날짜: 2026-10-01
- PR: 1개 (병합 1) — #265
- 지금: main 에 다 들어감
- 트러블슈팅 기록: 1건

[← 브랜치 목록](README.md)

## PR 기록

<a id="pr-265"></a>

### #265 [app] main CI 고침 — VLM 평가지가 mediapipe 없이도 그려지게 (#258 뒤로 빨갰다)
- 브랜치: `app-ci-fix` · 병합 2026-10-01 · +23 −10
- 한 일: `eval/vlm/report.py` 의 `hair_masks` 가 `mediapipe` 가 없으면 빈 마스크를 돌려주고 한 줄 안내를 낸다. 평가지는 머리카락 가림 없이 그려진다. 머리카락 모델을 못 받을 때(오프라인)도 같은 처리다. 앱 코드 변경 없음.
- 결과: CI 와 같은 조건(`uv sync --extra dev --extra eval`, mediapipe 없음)의 따로 된 작업 폴더에서 `scripts/check.sh` 통과. 고치기 전에는 같은 곳에서 `test_end_to_end_with_fake_server` 실패를 재현했다. pytest 86 · vitest 797.
- 트러블슈팅:
  - main 의 CI 가 #258 병합 뒤로 계속 빨갰다 → VLM 평가지 테스트가 `mediapipe` 패키지를 무조건 쓰는데 CI 는 그 패키지 없이(dev·eval 묶음만) 돌린다. 작성자 컴퓨터에는 그 패키지가 깔려 있어 병합 전 검사(`check.sh`)가 통과했고 그래서 못 봤다 → 패키지가 없으면 빈 마스크로 넘어가게 했다.
  - 다시 안 생기게: 병합 뒤 main 의 CI 결과까지 확인하기로 했다. 로컬 검사는 깔린 패키지에 따라 CI 와 다를 수 있다.
