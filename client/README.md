# client/ — 당화응 모바일 웹 (TypeScript)

모듈 ①②③⑥(촬영·가이드·채점·화면)이 여기서 산다. 규칙은 `docs/dev-stack-v6.md`.

```bash
cd client
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run lint           # eslint
npm run dev            # vite, http://localhost:5173 (카메라는 localhost/https)
```

```
src/core/      순수 함수·계약 타입. 브라우저 API 없음. 전부 테스트 가능
  types.ts     모듈 계약 (server/app/schemas.py 와 짝)
  log.ts       공통 log() — 전 모듈이 이것만 부른다
  flow.ts      화면 순서, 촬영 4장 게이트(shotGate), 세션 전이, draft 저장 형식 — poc/full/lib/flow.js 이전 완료 (1-1)
  color.ts     sRGB→Lab, 이마 L*a*b*, 눈 흰자 a*b* 참조(scleraLab), 4장 변동 폭(labDrift) — 1-4·1-6·1-9
  baseline.ts  Baseline 만들기(unit·이마·흰자), 눈꺼풀 기준점(eyelidRef, 1-10), 정면 재촬영 재정렬(retakeFront, 1-11)
  capture-events.ts  consent·capture{shot,ok,retry,reason}·restore 이벤트 + 장별 재촬영 횟수 — 1-5
  session-store.ts   메모리→IndexedDB 세션 저장(draft 2시간 만료, 사진 3장), clearAll 잔존 0 — 1-7·1-11
src/screens/
  camera-locks.ts    WB·노출·초점 manual 잠금(applyConstraints), Wake Lock, visibilitychange·webglcontextlost — 1-8·1-3
  image-encode.ts    저장용 WebP 1024 인코딩 — 1-7
public/probe-camera.html  폰에서 getCapabilities 표 한 줄 뽑기 — 1-3
  (통합 시) landmarks.ts guides.ts gate.ts score.ts review.ts looks.ts …  ← poc/full/lib/*.js 를 옮긴다
src/screens/   화면·상태 기계·카메라·저장 (I/O)
tests/         vitest
```

**POC → TS 이전 규칙**: `poc/full/lib/*.js`(비율 단위 반영된 정본)를 `src/core/*.ts`로 하나씩 옮긴다. 옮기는 동안 `allowJs`로 JS 그대로 import 가능. 옮긴 파일은 기존 `tests.mjs` 케이스를 vitest로 같이 옮긴다. 채점기(`score.ts`)는 옮긴 뒤 `eval/score/score_cli.mjs`(Node CLI)에서 같은 빌드 산출물을 부른다.
