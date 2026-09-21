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
  flow.ts      화면 순서·ScreenId, 촬영 4장 게이트(shotGate), 세션 전이, draft 저장 형식 — 1-1
  color.ts     sRGB→Lab, 이마 L*a*b*, 눈 흰자 a*b* 참조(scleraLab), 4장 변동 폭(labDrift) — 1-4·1-6·1-9
  baseline.ts  Baseline 만들기(unit·이마·흰자), 눈꺼풀 기준점(eyelidRef, 1-10), 정면 재촬영 재정렬(retakeFront, 1-11)
  capture-events.ts  consent·capture{shot,ok,retry,reason}·restore 이벤트 + 장별 재촬영 횟수 — 1-5
  session-store.ts   메모리→IndexedDB 세션 저장(draft 2시간 만료, 사진 3장), clearAll 잔존 0 — 1-7·1-11
  screens.ts   화면 담당(§0-2), 방향 규칙, 진행 칩 — 화면 목록·이름은 flow.ts 것을 가져다 쓴다 (6-2)
  looks.ts     룩 템플릿 읽기 (데이터는 rules/looks.json) — 6-2
  versions.ts  버전 5종(app·score·look·faceshape·transfer). 자기 칸만 setVersions 로 알린다 — 6-4·6-5
  log-store.ts 이벤트를 기기 안에 쌓고 JSONL 로 내보내기. ① 의 KvBackend 재사용 — 6-4
  (이전 예정) landmarks.ts guides.ts gate.ts score.ts review.ts …  ← poc/full/lib/*.js
src/screens/
  shell.ts     껍데기 — 화면을 갈아 끼우는 틀 (모듈 ⑥, 6-2)
  camera-locks.ts    WB·노출·초점 manual 잠금(applyConstraints), Wake Lock, visibilitychange·webglcontextlost — 1-8·1-3
  image-encode.ts    저장용 WebP 1024 인코딩 — 1-7
public/probe-camera.html  폰에서 getCapabilities 표 한 줄 뽑기 — 1-3
tests/         vitest. DOM 이 필요하면 파일 맨 위에 `// @vitest-environment jsdom`
```

## 화면을 올리는 법

껍데기가 화면 전환·정리·진행 칩·방향 안내·로그를 맡는다. 각 모듈은 자기 화면만 등록한다.

```ts
shell.register("capture", {
  mount(ctx) {
    ctx.root.append(myCaptureUI());          // ctx.root 안에만 그린다
    const id = setInterval(tick, 33);
    return () => clearInterval(id);          // 정리할 게 있으면 함수를 돌려준다
  },
});
```

`ctx` 로 오는 것: `root`(그릴 자리), `session`, `go(화면)`, `goPart(부위)`, `log`.
등록 안 된 화면은 "담당 모듈이 아직 안 올렸다"는 자리표시가 뜬다 — 통합 전에도 전 흐름이 끊기지 않는다.

## 버전과 로그

버전 5종은 `versions.ts` 한 곳에 모인다. **각 모듈은 자기 칸만 알린다.**

```ts
setVersions({ score: SCORE_VERSION });          // ③ 이 PARAMS 를 옮길 때
setVersions({ transfer: job.ver.transfer });    // ④ 서버 응답에서
setVersions({ faceshape: "faceshape-model-v0.2" }); // ⑤ 가 모델을 올릴 때
```

`app` 은 빌드할 때 git 짧은 해시가 박힌다. `look` 은 `rules/looks.json` 에서 읽는다.
`score` 는 ③ 이 `rules/score.json`(version 필드 포함)을 만들면 거기서 읽도록 바꾼다.

로그는 `log()` → `logStore.sink` 로 기기 안(IndexedDB)에 쌓인다. 버퍼에 모았다가 20개마다 또는 3초마다 저장한다.
사용자 실험 때만 동의받아 `exportJsonl()` 로 내보내고, 끝내기 때 `clear()` 로 지운다.
**사진·좌표·얼굴 데이터는 `log()` 가 막는다.**

**화면 담당** (`docs/work-split-modules-v6.md` §0-2): 1 촬영 ① · 2·2-b·6·껍데기 ⑥ · 3·4 ② · 5·5-b ③.

**POC → TS 이전 규칙**: `poc/full/lib/*.js`(비율 단위 반영된 정본)를 `src/core/*.ts`로 하나씩 옮긴다. 옮기는 동안 `allowJs`로 JS 그대로 import 가능. 옮긴 파일은 기존 `tests.mjs` 케이스를 vitest로 같이 옮긴다. 채점기(`score.ts`)는 옮긴 뒤 `eval/score/score_cli.mjs`(Node CLI)에서 같은 빌드 산출물을 부른다.
