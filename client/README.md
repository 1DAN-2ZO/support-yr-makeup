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
  screens.ts   화면 목록·이름·담당, 방향 규칙, 진행 칩
  looks.ts     룩 템플릿 읽기 (데이터는 rules/looks.json)
  (이전 예정) landmarks.ts guides.ts gate.ts score.ts review.ts flow.ts …  ← poc/full/lib/*.js
src/screens/
  shell.ts     껍데기 — 화면을 갈아 끼우는 틀 (모듈 ⑥)
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

**화면 담당** (`docs/work-split-modules-v6.md` §0-2): 1 촬영 ① · 2·2-b·6·껍데기 ⑥ · 3·4 ② · 5·5-b ③.

**POC → TS 이전 규칙**: `poc/full/lib/*.js`(비율 단위 반영된 정본)를 `src/core/*.ts`로 하나씩 옮긴다. 옮기는 동안 `allowJs`로 JS 그대로 import 가능. 옮긴 파일은 기존 `tests.mjs` 케이스를 vitest로 같이 옮긴다. 채점기(`score.ts`)는 옮긴 뒤 `eval/score/score_cli.mjs`(Node CLI)에서 같은 빌드 산출물을 부른다.
