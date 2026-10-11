# 옛 흐름 코드 — 지금 안 쓰는 것

2026-10-06 에 흐름이 바뀌었다 (`docs/service-definition-v6.md`). 옛 흐름의 화면과 그 화면만 쓰는 파일은 **지우지 않고 남겨 두었다.** 이 문서는 무엇이 안 쓰이는지와 그렇게 본 근거를 적는다 (2026-10-11 조사).

해당 파일 맨 위에는 `[옛 흐름 · 지금 안 씀]` 표시가 있다. 이 낱말로 찾으면 전부 나온다.

## 지금 흐름이 도는 화면

```
consent → capture → answer → partguide ⇄ live → attempt → feedback → save → done
(denied: 동의하지 않았을 때)
```

순서는 `src/core/screens.ts` 의 `SCREEN_ORDER`. `live`(실시간 가이드)는 옛 흐름의 화면 4 였지만 **지금도 쓴다** — 부위 가이드의 "실시간 가이드로 보기" 가 열고, 보기만 한 뒤 "이전" 으로 돌아온다 (#334).

## 가는 길이 없는 화면 (6개)

| 화면 | 파일 | 옛 흐름에서 하던 일 | 누가 열었나 |
|---|---|---|---|
| `processing` | `screens/processing.ts` | 서버 처리 기다리기 | (옛 흐름에서도 빠진 화면) |
| `looks` | `screens/looks.ts` | 화면 2 화장 10종 고르기 | `processing` · `fullrender` |
| `fullrender` | `screens/fullrender.ts` | 화면 2-b AR 로 입혀 보기 | `looks` |
| `guide` | `screens/guide.ts` | 화면 3 부위 완성본 | `fullrender` |
| `result` | `screens/result.ts` | 화면 5 부위 결과 (점수) | `live` 의 "확인받기" — 지금은 그 버튼이 "이전" 이다 |
| `review` | `screens/review.ts` | 화면 6 전체 리뷰 (합산 점수) | `result` |

**근거**: 화면을 옮기는 호출(`ctx.go("…")` · `next:` · `back:`)을 전부 찾아, 지금 흐름의 화면에서 위 여섯으로 가는 것이 없음을 확인했다. 이 화면에 멈춘 채 폰에 저장된 옛 세션은 앱을 켤 때 가까운 새 화면으로 옮긴다 (`core/screens.ts` 의 `inNewFlow`).

`main.ts` 에는 등록(`shell.register`)과 화면별 설정이 그대로 있다 — 그 자리에도 같은 표시를 달았다.

## 그 화면들만 쓰는 파일 (10개)

`main.ts` 에서 출발하는 import 를 따라가서, 위 여섯 화면을 빼면 닿지 않게 되는 파일과 `main.ts` 가 옛 화면 설정에만 넘기는 파일이다.

| 파일 | 쓰는 곳 | 비고 |
|---|---|---|
| `core/guide-view.ts` | `guide` | |
| `core/look-view.ts` | `looks` · `fullrender` | |
| `screens/completed.ts` | `guide` | |
| `screens/makeup-paint.ts` | `fullrender` · `guide` | |
| `screens/makeup-gl.ts` | `fullrender` · `guide` | 시험 페이지 `makeup-probe.html` 은 지금도 쓴다 |
| `core/look-jobs.ts` | `processing` | `main.ts` 는 빈 것만 넘긴다 |
| `core/review.ts` | `review` | |
| `screens/review-shot.ts` | `review` | |
| `screens/lash-assets.ts` | `fullrender` · `completed` | **앱을 켤 때 `main.ts` 가 속눈썹 그림을 미리 받는 동작은 남아 있다** — 그리는 화면은 없다 |
| `screens/hair-segmenter.ts` | `fullrender` · `guide` · `result` 설정 | 시험 페이지 `hairline-probe.html` · `look-transfer-probe.html` 은 지금도 쓴다 |

시험 페이지 `ui-preview.html` 은 옛 화면도 미리보기로 띄운다.

## 표시하지 않은 것 — 확인하지 않았거나 지금도 불리는 것

- **옛 흐름의 개념이 든 `core/` 파일들** (화장 템플릿 · 표준 계획 · 부위 점수 · 합산 등). `live` 나 세션(`core/flow.ts`) · 시험 페이지가 불러서 import 로는 "쓰는 중"이다. 파일 안의 어느 함수가 실제로 안 불리는지는 하나씩 보지 않았다 — **표시가 없다고 지금 흐름에서 쓴다는 뜻은 아니다**
- **세션에 남아 있는 옛 값** (`lookId` · `parts[].score` · `faceShape` 등) — 저장된 세션을 되살리는 코드가 읽는다
- **테스트** — 옛 화면의 테스트는 그대로 돈다 (`tests/`). 화면을 지우게 되면 같이 지운다
- **서버** (`server/`) · 평가(`eval/`) · `poc/` — 이 문서는 `client/src` 만 봤다

## 지우게 된다면

1. `main.ts` 의 `registerAll` 에서 그 화면의 등록과 설정 인자를 뺀다 (`[옛 흐름 · 지금 안 씀]` 표시가 붙은 곳)
2. 화면 파일과 위 표의 "그 화면들만 쓰는 파일" 을 지운다 — 시험 페이지가 쓰는 두 개(`makeup-gl` · `hair-segmenter`)는 남긴다
3. `core/screens.ts` 의 `RETIRED` 와 `core/flow.ts` 의 화면 목록에서 이름을 뺀다 (저장된 옛 세션을 옮기는 길이 같이 없어진다)
4. `bash scripts/check.sh` — 타입 검사가 남은 참조를 알려 준다

화면 파일은 모듈마다 담당이 다르다 (`core/screens.ts` 의 `SCREEN_OWNER`). 지우는 것은 담당과 정한다.
