# `app-log-residue` 브랜치

끝내기 뒤 로그 저장소가 events 키를 다시 만든다 — 닫고, 다시 시작할 때 연다.

- 날짜: 2026-09-28
- PR: 1개 (병합 1) — #164
- 지금: 브랜치는 지워짐 (내용은 main 에)
- 트러블슈팅 기록: 1건

[← 브랜치 목록](README.md)

## PR 기록

<a id="pr-164"></a>

### #164 [app] 끝내기 뒤 로그 저장소가 events 키를 다시 만든다 — 닫고, 다시 시작할 때 연다
- 브랜치: `app-log-residue` · 병합 2026-09-28 · +51 −1
- 한 일: 끝내기 뒤에 로그 저장소가 지운 데이터를 다시 만들던 것을 막았다. #162 리뷰 중에 찾은 앱 통합 쪽 문제다.
- 결과: 검증 +3(`log-store.test.ts`). `check.sh` 전부 통과(vitest 326).
- 트러블슈팅:
  - 증상: "끝내기 잔존 0" 조건(1-12 #8)이 깨진다 → 원인: 끝내기(`clearAll`) 뒤에 찍히는 `session_end` · `screen_enter(done)` 가 로그 저장소 버퍼에 남아 3초 뒤 `events` 키를 다시 만든다 → `logStore.clear()` 가 버퍼를 비우고 저장소를 닫아 닫힌 동안의 이벤트는 저장하지 않게 했다. `main.ts` 의 `clearAll` 에서 `logStore.clear()` 를 먼저 부르고 `restart` 에서 `reopen()` 한다.
- 남긴 것: #162 도 `main.ts` 의 `clearAll` · `restart` 근처를 고쳐서, 합칠 때 두 줄을 같이 둬야 한다.
