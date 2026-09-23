# 1-3 공부 기록 — 기기별 카메라 잠금 지원 표 (2026-09-21)

> 이슈 #11. 브랜치 `capture`. **커밋 없이 검증만**. 이 문서도 미커밋.
> 기다리는 쪽: 모듈 ③(색 보정 방식). 이 표가 "잠금으로 막을 수 있나, 보정으로만 막아야 하나" 를 정한다.

## 1. 1-3 이 하는 일 한 줄

폰 브라우저가 카메라의 **화이트밸런스(WB)·노출·초점을 고정(manual)** 시켜 주는지 기기별로 표로 만든다. 4장 찍는 동안 카메라가 스스로 색을 바꾸면 화장 전후 비교가 틀어지기 때문이다. 잠금이 안 되는 기기는 1-6 눈 흰자·이마 참조로 **사후 보정**만 가능하다.

## 2. 들어가는 기술 — 최선·차선·왜

| 요소 | 최선 (쓴 것) | 차선 | 왜 최선인가 |
|---|---|---|---|
| 지원 확인 | `MediaStreamTrack.getCapabilities()` 의 `whiteBalanceMode`·`exposureMode`·`focusMode` 목록에 `"manual"` 이 있는지 | `applyConstraints` 를 그냥 던져 보고 throw 나면 미지원 | 목록을 먼저 보면 실패 없이 판단된다. 던져 보는 방식은 일부 브라우저가 모르는 제약을 **조용히 무시**해서 "성공" 으로 착각한다 |
| 잠금 방법 | `track.applyConstraints({ advanced: [{ whiteBalanceMode: "manual" }] })` — 1-8 `applyCameraLocks` | `ImageCapture` 객체의 `setOptions` (옛 API) | `advanced` 배열은 못 맞추는 제약을 무시하므로 getUserMedia 가 죽지 않는다. `ImageCapture.setOptions` 는 스펙에서 빠졌다 |
| 잠금 순서 | continuous 로 1~2초 안정 → manual 전환 (1-2 프로브는 1.5초) | 처음부터 manual | manual 로 바로 바꾸면 카메라가 덜 맞춰진 값에 고정된다. 첫 장 조명에 맞춘 뒤 고정해야 4장이 같아진다 |
| 잠금이 "유지" 되는지 확인 | 잠금 전/후 각 10초 동안 프레임 가운데 L*·R/G·B/G 폭 + `getSettings()` 의 exposureTime·iso·colorTemperature 값이 바뀌는 횟수 (`probe-lock.html`) | 4장 이마 L* 차이만 보기 (1-2 결과) | `applyConstraints` 가 성공해도 실제로 고정됐는지는 별개. 값이 안 변하고 L* 폭이 줄어야 진짜 잠금 |
| 기기 식별 | UA + `getSettings().label`(트랙 이름) | `navigator.userAgentData.getHighEntropyValues(["model"])` | Android Chrome UA 가 기종을 `"K"` 로 가려서 표에는 손으로 적는다 (1-2 문제 9) |

## 3. 데이터

| 데이터 | 무엇 | 쓴 곳 |
|---|---|---|
| Android 실측 1대 (1-2 프로브가 같이 잰 `lockReportRow`) | Chrome 152, getCapabilities·manual 3종 | 표 1행 |
| 브라우저 지원 문서 (WebKit 릴리스 노트, W3C 구현 현황, caniuse) | iPhone·Firefox·삼성 인터넷은 실기기 없이 문서로 | 표 나머지 행 (실측 아님 표시) |

## 4. 공부할 스킬

| 스킬 | 왜 | 어디서 |
|---|---|---|
| MediaStream Image Capture 스펙의 "constrainable property" (`whiteBalanceMode` 등은 getUserMedia 기본 제약이 아니라 **확장**) | 브라우저마다 있는 속성이 달라서 항상 `getCapabilities` 로 먼저 물어봐야 하는 이유 | `camera-locks.ts applyCameraLocks` |
| `applyConstraints` 의 `advanced` 와 `ideal`/`exact` 차이 | `exact` 는 못 맞추면 OverconstrainedError 로 실패, `advanced` 는 무시 | 같은 파일 |
| `getSettings()` 로 현재 값 읽기 | 잠금 뒤 실제 모드가 manual 로 바뀌었는지, exposureTime·iso 가 고정됐는지 | `probe-lock.html` |
| 카메라 파이프라인: 오토 노출(AE)·오토 WB(AWB)·오토 포커스(AF) 가 프레임마다 도는 것 | 4장 찍는 사이 색이 왜 변하는지 (1-2 에서 정면 두 장 이마 L* 7.4 차) | 1-2 문제 7 |
| UA 축소 (User-Agent Reduction) | 왜 UA 에 기종이 안 나오는지 | 1-2 문제 9 |

## 5. 검증 방법

1. Android: 1-2 프로브가 `applyCameraLocks` 를 돌리고 `lockReportRow` 한 줄을 결과 JSON 에 넣음 → 표 1행
2. iPhone·Firefox·삼성: 실기기 없음 → 문서로 채우고 **"문서"** 라고 표시. 아이폰 사용자 생기면 `probe-lock.html` 로 실측해 바꾼다
3. (선택) `probe-lock.html`: 잠금 없이 10초 / 잠금 켜고 10초 동안 폰을 밝은 쪽·어두운 쪽으로 돌려 L* 폭과 `getSettings` 값 변화 횟수 비교 → 잠금이 **실제로 유지** 되는지

## 6. 결과 — 기기별 카메라 잠금 지원 표

| 기기 · 브라우저 | 근거 | getCapabilities | WB manual | 노출 manual | 초점 manual | 최대 해상도 | 결론 |
|---|---|---|---|---|---|---|---|
| Android 10 · Chrome 152 (트랙 "camera 1, facing front") | **실측** 2026-09-21 | O | **O** | **O** | **O** | 4000×3000 | 잠금 가능. 4장 동안 3종 다 고정 |
| Android · 삼성 인터넷 | 문서 (Chromium 기반, Image Capture 지원) | O | O(추정) | O(추정) | O(추정) | 기기별 | Chrome 과 같을 것. 실측 필요 |
| Android · Firefox | 문서 (getCapabilities 는 155부터, Image Capture 확장 제약은 미구현) | O | X | X | X | — | 잠금 불가 → 보정만 |
| iPhone · iOS 18.7 · Safari | **실측** 2026-09-22 (트랙 "Front Ultra Wide Camera") | O | **O** | **X** | **X** | 4032×4032 | 문서 예상대로. **WB 만 잠기고 노출·초점은 못 잠근다** → 보정 필수 |
| iPhone · Safari 17.3 이하 | 문서 | O (해상도·facingMode 만) | X | X | X | — | 잠금 불가 → 보정만 |
| iPhone · Chrome/기타 앱 | iOS 는 모든 브라우저가 WebKit | Safari 와 같음 | | | | | |

### 모듈 ③ 에 주는 답

- **잠금만 믿을 수 없다.** Android Chrome 은 3종 다 되지만, iPhone 은 노출을 못 잠그고 Firefox 는 아무것도 못 잠근다.
- 따라서 색 보정 방식은 **"잠금 + 참조 보정" 2중**: 잠금이 되는 기기는 잠그고(변동 자체를 줄임), 모든 기기에서 1-6 눈 흰자 a*b* + 이마 L* 참조로 장마다 보정한다. 잠금 여부는 `LockReport` 로 세션에 남겨 ③ 이 보정 세기를 정할 수 있게 한다.
- 잠금이 성공한 Android 에서도 1-2 에서 정면 두 장 이마 L* 가 7.4 차이 났다 (고개 각도 영향으로 보이나 잠금 유지 여부는 미확인). 1-4 조명 3종 실측에서 잠금 유무를 나눠서 잰다.

## 7. 발견한 문제

| # | 문제 | 어떻게 할까 |
|---|---|---|
| 1 | `docs/capture-checklist-v6.md` 1-3 읽는 법에 "getCapabilities 가 X 면 iOS 사파리" 라고 썼는데 **틀림**. iOS 도 getCapabilities 는 있다 (11부터). 없는 건 `exposureMode` 같은 확장 제약 | 문구 고침 (이 기록과 같은 날). `applyCameraLocks` 의 `capsSupported` 는 "함수가 있나" 만 보므로 iOS 에서 O 로 나오고, 모드별로 unsupported 가 찍힌다 — 코드 동작은 맞음 |
| 2 | 잠금 "성공" ≠ 잠금 "유지". `applyConstraints` 가 resolve 돼도 카메라가 실제 고정됐는지는 `getSettings` 와 프레임 값으로 봐야 한다 | `probe-lock.html` 준비. Android 에서 한 번 돌리면 답이 나옴 (선택) |
| 3 | iPhone 행이 문서 기반 | **닫음 (2026-09-22)**: 실측 WB O · 노출 X · 초점 X — 문서 예상과 일치 |
| 4 | UA 로 기종을 못 적는다 | 표에 손으로 기종 기입. 필요하면 `userAgentData` |

## 8. 1-4 로 넘어가는 조건

- [x] Android 실측 1행 + 나머지 기기 문서 근거로 표 완성, ③ 에 줄 결론 정리
- [x] 체크리스트 1-3 표·읽는 법 정정
- [x] iPhone 실측 (2026-09-22, iOS 18.7 Safari — WB O · 노출 X · 초점 X)
- [ ] (선택) `probe-lock.html` 로 잠금 유지 확인 — 1-4 측정과 같은 날 같이 하면 한 번에 끝남
- 1-4 는 보류 (2026-09-21 사용자 결정: 사람 3명 모일 때). 1-5 로 진행

## 9. 참고 자료

- WebKit Features in Safari 17.4 — whiteBalanceMode 추가: https://webkit.org/blog/15063/webkit-features-in-safari-17-4/
- WebKit Features in Safari 18.4 — torch·whiteBalanceMode getSettings 버그 수정: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- W3C mediacapture-image 구현 현황 (Chrome Android ✓, 나머지 없음): https://github.com/w3c/mediacapture-image/blob/main/implementation-status.md
- caniuse MediaStreamTrack.getCapabilities: https://caniuse.com/mdn-api_mediastreamtrack_getcapabilities
- 스펙: https://www.w3.org/TR/image-capture/

## 10. 오늘 만든 검증 도구 (미커밋, `.git/info/exclude` 등록)

| 파일 | 내용 |
|---|---|
| `client/public/probe-lock.html` | 잠금 없이/켜고 10초씩 L*·R/G·B/G 폭과 getSettings 값 변화 횟수 → `/__probe` 로 전송 |
