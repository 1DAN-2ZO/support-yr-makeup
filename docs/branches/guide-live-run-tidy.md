# `guide-live-run-tidy` — `live-run.ts` 정리 (#288 리뷰)

#288(화면 4 테두리 그물 붙이기) 리뷰에서 남은 작은 정리. 동작은 안 바뀜.

- 기간: 2026-10-05
- PR: #297 (머지) — Refs #288

[← 브랜치 목록](README.md)

## 한 일

- `./landmarks` 를 두 줄로 따로 불러오던 것(`partInRect` · `LM`)을 한 줄로
- `farEyeAlpha` 와 `createLiveRun` 사이 빈 줄 두 개 → 하나

## 트러블슈팅

- **리뷰 세 가지 중 하나는 이미 고쳐져 있었음** — "C안" 주석 위치는 #291 이 같은 곳을 고치며 `farEyeFit` 위로 옮겨 둠. 그래서 #291 이 합쳐질 때까지 기다렸다가 남은 둘만 올림 (같은 줄을 두 PR 이 고쳐 충돌 나지 않게)
- 검사: client `typecheck` · `lint` · `vitest` 897
