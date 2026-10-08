# 화면 2 룩 프리뷰 — 템플릿 색상 블렌드 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `poc/look-tryon/client/`에 서버 화장 전이(diffusion) 의존 없이, 룩 템플릿이 정의한 부위별 색상·투명도를 라이브 얼굴의 랜드마크 폴리곤 안에 Canvas2D 네이티브 블렌드 모드(multiply/overlay)로 칠하는 새 실시간 프리뷰 데모(`template.html`)를 추가한다.

**Architecture:** 기존 `app.js`(v2, 생성사진 워핑)의 랜드마크 검출·스무딩·부위 폴리곤 로직은 그대로 재사용하되, "생성 이미지를 워핑"하는 대신 "템플릿 색을 마스크 모양으로 Canvas2D `globalCompositeOperation`(multiply/overlay)로 합성"하는 방식으로 바꾼다. WebGL/UV 베이크 파이프라인(`app-webgl.js`)과 diffusion 워핑 버전(`app.js`)은 참고용으로 그대로 두고 건드리지 않는다(별도 데모 페이지로 병행).

**Tech Stack:** Vanilla JS(ES modules), MediaPipe FaceLandmarker(CDN, 기존과 동일), Canvas2D(`globalCompositeOperation`), Node(테스트 실행용, DOM 없이 순수 로직만).

**Spec:** 이 세션 채팅에서 합의한 설계(2026-09-17) — 별도 스펙 파일 없음(사용자 요청으로 구현 계획으로 바로 진행). 요지: (1) 룩 템플릿이 부위별 좌표(기존 랜드마크 폴리곤 재사용) + 기본 색상 + 투명도를 가짐, (2) 라이브 프리뷰는 diffusion 서버 호출 없이 템플릿 데이터만으로 동작, (3) 피부 위 합성은 곱연산(multiply)/오버레이 블렌드.

## Global Constraints

- `ctx.filter`의 blur()는 쓰지 않는다 (iOS Safari가 조용히 무시함) — 페더링은 기존 `lib/blur.js`의 박스블러(알파 채널 전용) 그대로 재사용.
- OpenCV.js, 새 외부 CDN 런타임 의존성 추가 금지 — 기존에 쓰던 MediaPipe CDN만 사용, Gradio(`@gradio/client`) 의존은 이 데모에서 아예 제거.
- `lib/affine.js`·`lib/smoothing.js`·`lib/blur.js`·`lib/rasterize.js`의 기존 공식은 "개선"하지 않는다 — 그대로 재사용/재노출만 한다.
- 부위 랜드마크 포인트셋(`BROW`/`EYES`/`CHEEK`/`LIPS`/`EYESHADOW_REACH`)은 `app.js` v2에서 실사용 검증된 값 그대로 옮긴다(수치 변경 금지).
- 중복 구현 금지 — 부위 폴리곤 빌더는 `lib/regions.js` 하나만 두고 `app.js`가 이를 import하도록 리팩터링한다.
- 화면에 각도(°)·길이(mm) 등 숫자 노출 금지(이 기능엔 해당 없음, 확인만).
- 테스트는 이 프로젝트 관례대로 `lib/*.test.js`를 `node lib/x.test.js`로 직접 실행하는 손수 assert 카운터 방식을 따른다(외부 테스트 프레임워크 추가 금지).

---

## 파일 구조

| 파일 | 상태 | 책임 |
|---|---|---|
| `lib/regions.js` | 신규 | 부위 랜드마크 포인트셋 + `buildRegions()` (app.js에서 추출, DOM 비의존·Node 테스트 가능) |
| `lib/regions.test.js` | 신규 | `buildRegions()` 순수 로직 테스트 |
| `lib/lookTemplates.js` | 신규 | POC용 룩 템플릿 2개 (부위별 색상·투명도·블렌드 모드) |
| `lib/lookTemplates.test.js` | 신규 | 템플릿 데이터 형식·범위 검증 |
| `lib/paintRegion.js` | 신규 | `resolveBlendPasses()`(순수) + `paintRegion()`(Canvas2D, 마스크 래스터화→페더링→색칠→블렌드 합성) |
| `lib/paintRegion.test.js` | 신규 | `resolveBlendPasses()` 순수 로직 테스트 |
| `app.js` | 수정 | 로컬 `BROW`/`EYES`/`CHEEK`/`LIPS`/`EYESHADOW_REACH`/`TRACKED_IDX`/`buildRegions`/`REGION_KEYS`/`landmarkPx`/`centroid`/`lerp` 제거, `lib/regions.js`에서 import |
| `app-template.js` | 신규 | 새 데모 진입점: 랜드마크 검출(VIDEO 모드만)·스무딩·템플릿 선택·라이브 페인트 루프 |
| `template.html` | 신규 | `app-template.js` 페이지 셸(룩 선택 + 슬라이더) |
| `README.md` | 수정 | `template.html` 데모 사용법 섹션 추가 |

---

### Task 1: `lib/regions.js` 추출 + `app.js` 리팩터

**Files:**
- Create: `poc/look-tryon/client/lib/regions.js`
- Create: `poc/look-tryon/client/lib/regions.test.js`
- Modify: `poc/look-tryon/client/app.js:15-32, 97-124, 185`

**Interfaces:**
- Produces: `BROW`, `EYES`, `CHEEK`, `LIPS`, `EYESHADOW_REACH`, `REGION_KEYS: string[]`, `TRACKED_IDX: number[]`, `buildRegions(lm, w, h) -> { browR, browL, eyeR, eyeL, lips, cheekR, cheekL }` (각 값은 `[x,y]` 배열)

- [ ] **Step 1: `lib/regions.js` 작성 (app.js:15-32, 97-124의 로직을 그대로 옮김)**

```js
// poc/look-tryon/client/lib/regions.js
// 부위별 랜드마크 폴리곤 — app.js(v2 사진 워핑)·app-template.js(템플릿 블렌드)가 공용으로 쓴다.
// 중복 구현 금지, 여기 하나만. 포인트셋 자체는 app.js v2에서 실사용 검증된 값 그대로.

export const EYES = {
  R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33] },
  L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263] },
};
export const BROW = {
  R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};
export const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
};
export const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const EYESHADOW_REACH = 0.45;

export const REGION_KEYS = ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"];
export const TRACKED_IDX = [...new Set([...BROW.R, ...BROW.L, ...EYES.R.upper, ...EYES.L.upper, ...LIPS, ...CHEEK.R, ...CHEEK.L])];

function landmarkPx(landmarks, idx, w, h) {
  const p = landmarks[idx];
  return [p.x * w, p.y * h];
}
function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

/** 정규화 랜드마크 + 이미지 크기 -> 부위별 폴리곤(픽셀) */
export function buildRegions(lm, w, h) {
  const P = (i) => landmarkPx(lm, i, w, h);
  const browR = BROW.R.map(P), browL = BROW.L.map(P);
  const browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  const eyeR = [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()];
  const eyeL = [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()];
  return { browR, browL, eyeR, eyeL, lips: LIPS.map(P), cheekR: CHEEK.R.map(P), cheekL: CHEEK.L.map(P) };
}
```

- [ ] **Step 2: `lib/regions.test.js` 작성**

```js
// node lib/regions.test.js 로 직접 실행. DOM 불필요(순수 배열 연산).
import { buildRegions, REGION_KEYS, TRACKED_IDX } from "./regions.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

// 478개 더미 랜드마크(격자 배치) — 실제 얼굴 형태는 아니지만 인덱스별로 다른 좌표를 가져
// centroid/lerp 계산이 항등으로 뭉개지지 않는지 확인하기엔 충분하다.
const lm = Array.from({ length: 478 }, (_, i) => ({ x: (i % 30) / 30, y: Math.floor(i / 30) / 16, z: 0 }));

console.log("1) 7개 부위 폴리곤 전부 생성됨");
{
  const regions = buildRegions(lm, 640, 480);
  for (const k of REGION_KEYS) assert(Array.isArray(regions[k]) && regions[k].length > 0, `${k} 폴리곤 점 있음 (${regions[k]?.length}개)`);
}

console.log("2) eyeR/eyeL은 눈꺼풀(9점) + 눈썹 방향 대응점(9점) = 18점(섀도우 밴드)");
{
  const regions = buildRegions(lm, 640, 480);
  assert(regions.eyeR.length === 18, `eyeR 18점 (실제=${regions.eyeR.length})`);
  assert(regions.eyeL.length === 18, `eyeL 18점 (실제=${regions.eyeL.length})`);
}

console.log("3) TRACKED_IDX는 실제 쓰이는 인덱스만 중복 없이 포함");
{
  const set = new Set(TRACKED_IDX);
  assert(set.size === TRACKED_IDX.length, "중복 없음");
  assert(TRACKED_IDX.length > 0 && TRACKED_IDX.length < 478, `478개 미만 (실제=${TRACKED_IDX.length})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 3: 테스트 실행해서 통과 확인**

Run: `cd poc/look-tryon/client && node lib/regions.test.js`
Expected: `9 passed, 0 failed` (없으면 표시된 FAIL 메시지 보고 수정)

- [ ] **Step 4: `app.js`를 `lib/regions.js` 사용하도록 리팩터**

`app.js:15-32`(랜드마크 인덱스 상수 + `TRACKED_IDX`)와 `app.js:97-124`(`canvasToBlob`/`landmarkPx`/`centroid`/`lerp`/`buildRegions` 중 지오메트리 부분)를 지우고 import로 교체. `app.js:185`의 로컬 `REGION_KEYS` 선언도 제거.

```js
// app.js 상단 import 블록에 추가
import { REGION_KEYS, TRACKED_IDX, buildRegions } from "./lib/regions.js";
```

`landmarkPx`/`centroid`/`lerp`/`buildRegions`/`BROW`/`EYES`/`CHEEK`/`LIPS`/`EYESHADOW_REACH`/`TRACKED_IDX` 로컬 정의와 `app.js:185`의 `const REGION_KEYS = [...]`는 전부 삭제. `canvasToBlob`(97-100)는 diffusion 워핑용 로직이라 그대로 둔다.

- [ ] **Step 5: 브라우저에서 `index.html` 수동 확인 (회귀 없는지)**

`cd poc/look-tryon/client && python -m http.server 8010` → `http://localhost:8010` 접속 → 얼굴 촬영·룩 참조 업로드·생성까지는 서버(Gradio)가 없으면 실패해도 되지만, **카메라 프리뷰가 뜨고 콘솔에 import 에러가 없는지**만 확인 (regions.js 리팩터가 문법/경로 오류 없는지 검증하는 목적).

- [ ] **Step 6: 커밋**

```bash
git add poc/look-tryon/client/lib/regions.js poc/look-tryon/client/lib/regions.test.js poc/look-tryon/client/app.js
git commit -m "refactor: 부위 폴리곤 로직을 lib/regions.js로 추출 (app.js/app-template.js 공용)"
```

---

### Task 2: `lib/lookTemplates.js` — 룩 템플릿 데이터

**Files:**
- Create: `poc/look-tryon/client/lib/lookTemplates.js`
- Create: `poc/look-tryon/client/lib/lookTemplates.test.js`

**Interfaces:**
- Consumes: `REGION_KEYS` from `./regions.js` (Task 1)
- Produces: `LOOK_TEMPLATES: Array<{ id: string, name: string, regions: Record<RegionKey, { color: '#rrggbb', opacity: number, blend: 'multiply'|'overlay'|'multiply+overlay' }> }>`

- [ ] **Step 1: `lib/lookTemplates.js` 작성**

```js
// poc/look-tryon/client/lib/lookTemplates.js
// 룩 템플릿 — 부위별 기본 색상·투명도·블렌드 모드. 서버 생성(diffusion) 의존 없이 라이브
// 프리뷰에 바로 쓴다. POC 표본 2개 — 정식 서비스에서는 화면 2 룩 10개 데이터로 교체.

export const LOOK_TEMPLATES = [
  {
    id: "natural",
    name: "내추럴",
    regions: {
      browR: { color: "#8B5A3C", opacity: 0.35, blend: "multiply" },
      browL: { color: "#8B5A3C", opacity: 0.35, blend: "multiply" },
      eyeR: { color: "#C68B5D", opacity: 0.30, blend: "multiply" },
      eyeL: { color: "#C68B5D", opacity: 0.30, blend: "multiply" },
      lips: { color: "#C96A5E", opacity: 0.45, blend: "multiply+overlay" },
      cheekR: { color: "#E8A0A0", opacity: 0.25, blend: "multiply" },
      cheekL: { color: "#E8A0A0", opacity: 0.25, blend: "multiply" },
    },
  },
  {
    id: "coral",
    name: "코랄 포인트",
    regions: {
      browR: { color: "#7A4A2E", opacity: 0.40, blend: "multiply" },
      browL: { color: "#7A4A2E", opacity: 0.40, blend: "multiply" },
      eyeR: { color: "#D9784F", opacity: 0.35, blend: "multiply" },
      eyeL: { color: "#D9784F", opacity: 0.35, blend: "multiply" },
      lips: { color: "#E8593F", opacity: 0.55, blend: "multiply+overlay" },
      cheekR: { color: "#F0876A", opacity: 0.35, blend: "multiply" },
      cheekL: { color: "#F0876A", opacity: 0.35, blend: "multiply" },
    },
  },
];
```

- [ ] **Step 2: `lib/lookTemplates.test.js` 작성**

```js
// node lib/lookTemplates.test.js 로 직접 실행.
import { LOOK_TEMPLATES } from "./lookTemplates.js";
import { REGION_KEYS } from "./regions.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_BLEND = new Set(["multiply", "overlay", "multiply+overlay"]);
const sortedRegionKeys = [...REGION_KEYS].sort();

for (const t of LOOK_TEMPLATES) {
  console.log(`템플릿 "${t.id}"`);
  const keys = Object.keys(t.regions).sort();
  assert(JSON.stringify(keys) === JSON.stringify(sortedRegionKeys), "부위 키 7개 전부 REGION_KEYS와 일치");
  for (const k of REGION_KEYS) {
    const layer = t.regions[k];
    assert(!!layer, `${k} 정의됨`);
    if (!layer) continue;
    assert(HEX_RE.test(layer.color), `${k} color 형식 #rrggbb (실제=${layer.color})`);
    assert(layer.opacity > 0 && layer.opacity <= 1, `${k} opacity 0<x<=1 (실제=${layer.opacity})`);
    assert(VALID_BLEND.has(layer.blend), `${k} blend 값 유효 (실제=${layer.blend})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 3: 테스트 실행해서 통과 확인**

Run: `cd poc/look-tryon/client && node lib/lookTemplates.test.js`
Expected: 모든 라인 `ok`, 마지막 줄 `N passed, 0 failed`

- [ ] **Step 4: 커밋**

```bash
git add poc/look-tryon/client/lib/lookTemplates.js poc/look-tryon/client/lib/lookTemplates.test.js
git commit -m "feat: 룩 템플릿 데이터(부위별 색상·투명도·블렌드) 추가"
```

---

### Task 3: `lib/paintRegion.js` — Canvas2D 블렌드 페인트

**Files:**
- Create: `poc/look-tryon/client/lib/paintRegion.js`
- Create: `poc/look-tryon/client/lib/paintRegion.test.js`

**Interfaces:**
- Consumes: `rasterizePolygon(pts, w, h) -> {width,height,data:Float32Array}` from `./rasterize.js` (existing); `featherAlpha(canvas, radius)` from `./blur.js` (existing)
- Produces: `resolveBlendPasses(blend: string) -> Array<{op: string, alphaScale: number}>`; `paintRegion(ctx: CanvasRenderingContext2D, polygonPts: [number,number][], layer: {color,opacity,blend}, feather: number) -> void`

- [ ] **Step 1: `lib/paintRegion.js` 작성**

```js
// poc/look-tryon/client/lib/paintRegion.js
// 템플릿 색상+투명도를 랜드마크 폴리곤 영역에 Canvas2D 네이티브 블렌드 모드(multiply/overlay)로
// 칠한다. diffusion 생성 사진 없이 동작 — 색은 항상 템플릿이 정의한 값, 피부 톤은 destination
// 픽셀(라이브 카메라 프레임)에서 그대로 가져오므로 조명이 달라도 "따로 노는 사진을 붙인" 느낌이
// 안 생긴다.

import { rasterizePolygon } from "./rasterize.js";
import { featherAlpha } from "./blur.js";

/** blend 이름 -> Canvas2D globalCompositeOperation 패스 배열. 순서대로 겹쳐 그린다.
 * alphaScale은 페더링+템플릿 opacity가 이미 반영된 마스크 알파에 이 패스에서 추가로 곱하는 계수
 * (보조 패스를 옅게 얹을 때 씀). */
export function resolveBlendPasses(blend) {
  switch (blend) {
    case "multiply": return [{ op: "multiply", alphaScale: 1 }];
    case "overlay": return [{ op: "overlay", alphaScale: 1 }];
    case "multiply+overlay": return [{ op: "multiply", alphaScale: 1 }, { op: "overlay", alphaScale: 0.35 }];
    default: throw new Error(`알 수 없는 blend: ${blend}`);
  }
}

/** ctx에 이미 라이브 프레임이 그려진 상태에서, polygonPts 영역 안에 layer.color를
 * layer.opacity·feather(px)로 페더링해서 layer.blend 모드로 얹는다. */
export function paintRegion(ctx, polygonPts, layer, feather) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const mask = rasterizePolygon(polygonPts, w, h);

  // 1) 커버리지 * 템플릿 opacity 를 알파로 갖는 마스크 캔버스, 페더링으로 가장자리 부드럽게
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w; maskCanvas.height = h;
  const mctx = maskCanvas.getContext("2d");
  const maskImg = mctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) maskImg.data[i * 4 + 3] = Math.round(mask.data[i] * layer.opacity * 255);
  mctx.putImageData(maskImg, 0, 0);
  featherAlpha(maskCanvas, feather);

  // 2) 그 알파 모양 그대로 template.color를 채운 "칠할 레이어"
  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = w; paintCanvas.height = h;
  const pctx = paintCanvas.getContext("2d");
  pctx.drawImage(maskCanvas, 0, 0);
  pctx.globalCompositeOperation = "source-in";
  pctx.fillStyle = layer.color;
  pctx.fillRect(0, 0, w, h);

  // 3) 라이브 프레임(ctx) 위에 블렌드 모드로 합성
  for (const { op, alphaScale } of resolveBlendPasses(layer.blend)) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alphaScale;
    ctx.drawImage(paintCanvas, 0, 0);
    ctx.restore();
  }
}
```

- [ ] **Step 2: `lib/paintRegion.test.js` 작성 (순수 함수 `resolveBlendPasses`만 — `paintRegion`은 Canvas2D 필요해서 Node 불가, Task 4 수동 확인에서 검증)**

```js
// node lib/paintRegion.test.js 로 직접 실행. resolveBlendPasses()는 DOM 불필요.
import { resolveBlendPasses } from "./paintRegion.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

console.log("1) multiply -> 패스 1개, alphaScale 1");
{
  const passes = resolveBlendPasses("multiply");
  assert(passes.length === 1, `길이 1 (실제=${passes.length})`);
  assert(passes[0].op === "multiply" && passes[0].alphaScale === 1, "op=multiply, alphaScale=1");
}

console.log("2) overlay -> 패스 1개, alphaScale 1");
{
  const passes = resolveBlendPasses("overlay");
  assert(passes.length === 1 && passes[0].op === "overlay" && passes[0].alphaScale === 1, "op=overlay, alphaScale=1");
}

console.log("3) multiply+overlay -> 패스 2개, 두 번째는 약하게(alphaScale<1)");
{
  const passes = resolveBlendPasses("multiply+overlay");
  assert(passes.length === 2, `길이 2 (실제=${passes.length})`);
  assert(passes[0].op === "multiply" && passes[0].alphaScale === 1, "1번째 multiply, alphaScale=1");
  assert(passes[1].op === "overlay" && passes[1].alphaScale > 0 && passes[1].alphaScale < 1, `2번째 overlay, 0<alphaScale<1 (실제=${passes[1].alphaScale})`);
}

console.log("4) 알 수 없는 blend는 throw");
{
  let threw = false;
  try { resolveBlendPasses("bogus"); } catch { threw = true; }
  assert(threw, "throw 발생");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 3: 테스트 실행해서 통과 확인**

Run: `cd poc/look-tryon/client && node lib/paintRegion.test.js`
Expected: `6 passed, 0 failed`

- [ ] **Step 4: 커밋**

```bash
git add poc/look-tryon/client/lib/paintRegion.js poc/look-tryon/client/lib/paintRegion.test.js
git commit -m "feat: 템플릿 색상을 Canvas2D multiply/overlay로 합성하는 paintRegion 추가"
```

---

### Task 4: `template.html` + `app-template.js` — 새 라이브 데모

**Files:**
- Create: `poc/look-tryon/client/template.html`
- Create: `poc/look-tryon/client/app-template.js`

**Interfaces:**
- Consumes: `REGION_KEYS, TRACKED_IDX, buildRegions` from `./lib/regions.js` (Task 1); `LOOK_TEMPLATES` from `./lib/lookTemplates.js` (Task 2); `paintRegion` from `./lib/paintRegion.js` (Task 3); `LandmarkSmoother` from `./lib/smoothing.js` (existing, 변경 없음)
- Produces: 브라우저 전역 `window.__poctemplate = { buildRegions, paintRegion, state, smoother, LOOK_TEMPLATES }` (콘솔 디버그/수동 확인용, 기존 `window.__poc`/`window.__pocgl` 관례와 동일)

- [ ] **Step 1: `template.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>당화응 POC — 룩 템플릿 색상 블렌드</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>룩 템플릿 색상 블렌드 (서버 생성 없음)</h1>
  <p class="note">서버 화장 전이(diffusion) 호출 없이, 룩 템플릿의 부위별 색상·투명도를 라이브 얼굴의 랜드마크 영역 안에 Canvas2D multiply/overlay 블렌드로 바로 칠합니다.</p>
  <div id="status" class="status">초기화 중…</div>

  <video id="video" playsinline muted class="camPreview"></video>

  <section id="pickStage">
    <h2>룩 선택</h2>
    <select id="lookSelect"></select>
    <button id="btnStart" disabled>이 룩으로 실시간 보기</button>
  </section>

  <section id="liveStage" hidden>
    <h2>실시간 매핑 <span id="liveStatus"></span></h2>
    <canvas id="liveCanvas"></canvas>
    <label>강도(전역 투명도 배율)
      <input type="range" id="intensity" min="0" max="1.5" step="0.05" value="1" />
      <span id="intensityVal"></span>
    </label>
    <label>페더링 배율 — 높을수록 경계가 더 부드럽게 퍼짐
      <input type="range" id="featherScale" min="0.3" max="2.5" step="0.1" value="1" />
      <span id="featherScaleVal"></span>
    </label>
    <label>반응성(beta) — 높을수록 얼굴에 딱 붙지만 떨림 더 남음
      <input type="range" id="beta" min="0.01" max="0.3" step="0.01" value="0.08" />
      <span id="betaVal"></span>
    </label>
    <label>기준 스무딩(minCutoff) — 높을수록 가만히 있을 때도 덜 부드러움(더 딱 붙음)
      <input type="range" id="minCutoff" min="0.5" max="5" step="0.1" value="2.5" />
      <span id="minCutoffVal"></span>
    </label>
  </section>

  <button id="btnReset">초기화</button>

  <script type="module" src="app-template.js"></script>
</body>
</html>
```

- [ ] **Step 2: `app-template.js` 작성**

```js
// poc/look-tryon/client/app-template.js
// 룩 템플릿 색상 블렌드 — 서버 화장 전이(diffusion) 없이, 템플릿이 정의한 부위별 색상을
// 라이브 얼굴의 랜드마크 폴리곤 안에 Canvas2D multiply/overlay로 합성한다.
// 랜드마크 검출·스무딩은 app.js(v2)와 동일한 방식/값 재사용 — 중복 구현 금지, lib/*.js 공용.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { REGION_KEYS, TRACKED_IDX, buildRegions } from "./lib/regions.js";
import { LandmarkSmoother } from "./lib/smoothing.js";
import { paintRegion } from "./lib/paintRegion.js";
import { LOOK_TEMPLATES } from "./lib/lookTemplates.js";

// 라이브 비디오 해상도(가로 약 1280px) 기준 페더링 반경(px). 눈썹·입술은 경계가 또렷해야 하는
// 부위라 좁게, 섀도우·볼터치는 넓게 퍼지는 게 자연스러워서 넓게.
const FEATHER = { browR: 3, browL: 3, lips: 3, eyeR: 10, eyeL: 10, cheekR: 10, cheekL: 10 };

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t, cls = "") => { statusEl.textContent = t; statusEl.className = "status " + cls; };

const state = { videoLandmarker: null, stream: null, liveOn: false, template: null };

async function initLandmarker() {
  setStatus("얼굴 인식 모델 로딩 중…");
  const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
    runningMode: "VIDEO", numFaces: 1,
  });
  try { state.videoLandmarker = await FaceLandmarker.createFromOptions(files, opts("GPU")); }
  catch { state.videoLandmarker = await FaceLandmarker.createFromOptions(files, opts("CPU")); }
  setStatus("준비 완료. 룩을 고르고 시작하세요", "ok");
}

async function startCamera() {
  const video = $("video");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }, audio: false });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  $("liveCanvas").width = video.videoWidth;
  $("liveCanvas").height = video.videoHeight;
  $("btnStart").disabled = false;
}

function populateLookSelect() {
  const sel = $("lookSelect");
  for (const t of LOOK_TEMPLATES) {
    const opt = document.createElement("option");
    opt.value = t.id; opt.textContent = t.name;
    sel.appendChild(opt);
  }
}

const smoother = new LandmarkSmoother(TRACKED_IDX);
function updateSmoothingParams() {
  const minCutoff = parseFloat($("minCutoff").value);
  const beta = parseFloat($("beta").value);
  smoother.setParams(minCutoff, beta);
  $("minCutoffVal").textContent = minCutoff.toFixed(1);
  $("betaVal").textContent = beta.toFixed(2);
}
function updateFeatherLabel() { $("featherScaleVal").textContent = parseFloat($("featherScale").value).toFixed(1); }
function updateIntensityLabel() { $("intensityVal").textContent = parseFloat($("intensity").value).toFixed(2); }

let lastT = -1;
function liveLoop() {
  if (!state.liveOn) return;
  const video = $("video"), cv = $("liveCanvas"), ctx = cv.getContext("2d");
  if (video.readyState >= 2) {
    const now = performance.now();
    if (now !== lastT) {
      lastT = now;
      const res = state.videoLandmarker.detectForVideo(video, now);
      const lm = smoother.smooth(res.faceLandmarks && res.faceLandmarks[0], now);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      if (lm && state.template) {
        const regions = buildRegions(lm, cv.width, cv.height);
        const featherScale = parseFloat($("featherScale").value);
        const intensity = parseFloat($("intensity").value);
        for (const key of REGION_KEYS) {
          const base = state.template.regions[key];
          if (!base) continue;
          paintRegion(ctx, regions[key], { ...base, opacity: base.opacity * intensity }, FEATHER[key] * featherScale);
        }
        $("liveStatus").textContent = "얼굴 추적 중";
      } else {
        $("liveStatus").textContent = lm ? "룩 없음" : "얼굴 미검출";
      }
    }
  }
  requestAnimationFrame(liveLoop);
}

function goLive() {
  const id = $("lookSelect").value;
  state.template = LOOK_TEMPLATES.find((t) => t.id === id) || null;
  $("pickStage").hidden = true;
  $("liveStage").hidden = false;
  state.liveOn = true;
  requestAnimationFrame(liveLoop);
}

function reset() {
  state.liveOn = false;
  state.template = null;
  $("pickStage").hidden = false;
  $("liveStage").hidden = true;
  setStatus("초기화됨. 룩을 고르고 시작하세요", "ok");
}

$("minCutoff").oninput = updateSmoothingParams;
$("beta").oninput = updateSmoothingParams;
$("featherScale").oninput = updateFeatherLabel;
$("intensity").oninput = updateIntensityLabel;
updateSmoothingParams(); updateFeatherLabel(); updateIntensityLabel();
populateLookSelect();
$("btnStart").onclick = goLive;
$("btnReset").onclick = reset;

window.__poctemplate = { buildRegions, paintRegion, state, smoother, LOOK_TEMPLATES };

(async () => {
  try {
    await initLandmarker();
    await startCamera();
  } catch (e) {
    setStatus("초기화 실패: " + e.message, "err");
  }
})();
```

- [ ] **Step 3: 로컬 서버로 브라우저에서 수동 확인 (자동화 불가 — 카메라·Canvas2D 블렌드는 브라우저 전용, 이 저장소 관례상 `lib/rasterize.js`·`lib/blur.js`도 Node 테스트 없음)**

```bash
cd poc/look-tryon/client
python -m http.server 8010
```
`http://localhost:8010/template.html` 접속 → 카메라 허용 → 확인할 것:
1. 콘솔에 import/런타임 에러 없음.
2. 룩 선택(`내추럴`/`코랄 포인트`) 후 "이 룩으로 실시간 보기" → 눈썹·눈섀도우·입술·볼터치 영역에만 색이 올라오고 피부 질감(모공·음영)이 그대로 비쳐 보임(사진을 붙인 느낌이 아니라 화장이 "된" 느낌인지 — 이게 이번 전환의 핵심 목표).
3. 고개를 좌우로 움직여도 색 영역이 해당 부위를 따라오고, 눈 감았다 뜨는 정도의 움직임에 심하게 흔들리지 않음(One Euro Filter 슬라이더로 튜닝).
4. "페더링 배율"·"강도" 슬라이더가 실시간으로 반영됨.
5. **iOS Safari가 있으면 별도로 열어서 `multiply`/`overlay` 블렌드가 정상 렌더링되는지 확인** (Canvas2D 블렌드 모드는 `ctx.filter`와 다른 기능이라 대부분 지원되지만, 이 프로젝트가 iOS Safari 이슈를 여러 번 겪었으므로 실기기 확인 전엔 "확인됨"으로 간주하지 않는다).

- [ ] **Step 4: 커밋**

```bash
git add poc/look-tryon/client/template.html poc/look-tryon/client/app-template.js
git commit -m "feat: 룩 템플릿 색상 블렌드 라이브 데모(template.html) 추가"
```

---

### Task 5: 문서 갱신

**Files:**
- Modify: `poc/look-tryon/client/README.md`

**Interfaces:**
- (문서 전용, 코드 인터페이스 없음)

- [ ] **Step 1: README.md에 새 데모 섹션 추가**

`README.md` 끝(현재 "## 파일" 섹션 다음)에 추가:

```markdown
## 템플릿 색상 블렌드 버전 (`template.html`)

서버 화장 전이(diffusion) 호출 없이 동작하는 버전. `LookLayer.regions[partId]`에
좌표(랜드마크 폴리곤, 기존과 동일) 대신 **색상+투명도+블렌드 모드**를 넣고,
Canvas2D `globalCompositeOperation`(`multiply`/`overlay`)으로 라이브 프레임 위에
바로 칠한다. 서버가 없어도 실행 가능:

```bash
cd poc/look-tryon/client
python -m http.server 8010
```
`http://localhost:8010/template.html` 접속 → 카메라 허용 → 룩 선택 → "이 룩으로 실시간 보기".

- `lib/regions.js` 부위 랜드마크 폴리곤(기존 `app.js`와 공용)
- `lib/lookTemplates.js` 룩 템플릿 표본 2개(색상·투명도·블렌드)
- `lib/paintRegion.js` 마스크 래스터화 → 페더링(`lib/blur.js`) → 블렌드 합성
- `app-template.js` 랜드마크 검출(VIDEO 모드)·스무딩(`lib/smoothing.js`)·라이브 루프
```

- [ ] **Step 2: 커밋**

```bash
git add poc/look-tryon/client/README.md
git commit -m "docs: template.html 데모 사용법 추가"
```

---

## Self-Review 메모 (작성자용, 실행 시 참고)

- **스펙 커버리지**: (1) diffusion 의존 제거 → Task 4에서 Gradio import 자체가 없음. (2) 템플릿이 좌표(기존 폴리곤 재사용)+색상+투명도 소유 → Task 2. (3) multiply/overlay 블렌드 → Task 3. 세 가지 모두 태스크로 매핑됨.
- **중복 제거**: `buildRegions`류 구현이 `app.js`/`app-webgl.js`/(과거) `poc/full`의 `lib/tryon.js`까지 3곳에 있었는데, 이번엔 `app.js`만 `lib/regions.js`를 쓰도록 리팩터한다. `app-webgl.js`는 C0~C6 파이프라인이 살아있는 별도 데모라 이번 범위에서 건드리지 않는다(불필요한 리팩터 확대 방지).
- **타입 일관성**: `RegionKey`(`browR` 등 7개)가 `lib/regions.js`(`REGION_KEYS`)·`lib/lookTemplates.js`(`regions` 객체 키)·`lib/paintRegion.js`(`layer` 매개변수 모양) 전부에서 동일하게 `{color, opacity, blend}` 형태로 맞춰져 있음.
