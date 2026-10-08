# `page-titles-nudy` — 개발 페이지 제목 옛 이름 "당화응" → "nudy"

#311(머리선) 리뷰에서 ⑥ 이 남긴 작은 것. ② 개발 페이지 4개의 제목 한 줄씩만 바꿈. 코드 변경 없음.

- 기간: 2026-10-07
- PR: #339 (머지) — Refs #311

[← 브랜치 목록](README.md)

## 한 일

- `hairline-probe.html` (⑥ 이 짚은 것) · `makeup-extract-probe.html` · `photo-guide-probe.html` · `flow-poc.html`
- 다른 담당 페이지(`camera-check` · `makeup-probe` · `measure-probe` · `ui-preview`)도 아직 "당화응" 이지만 내 것이 아니라 그대로 둠

## 트러블슈팅

- **커밋이 머지된 PR 에서 빠짐**
  - 원인: `flow-poc`(#327) 에 제목 커밋을 올리기 전에 #327 이 머지됨
  - 해결: 그 커밋을 새 브랜치로 옮겨(cherry-pick) 따로 PR
- **"pr311" 을 #331 로 잘못 알아들음** — 실제로 처리할 것은 #331(정답사진 방식 확정)이었음. 이 PR 은 그대로 쓸모 있어서 올려 두고, #331 은 `decide-answer-method` 에서 처리
