// 라이너 — 지금 방식(띠 전체, 칸 색 차이) vs 양 끝·칸 색 차이(linerEnds) vs 양 끝·획 추출(linerStroke = 조합이 쓰는 것) 을 같은 합성 라이너에
//   SET=ffhq node eval/samples/shape/liner_ends.mjs          (FFHQ 동양인 확인한 30장)
//   SET=ep LIMIT=60 node eval/samples/shape/liner_ends.mjs   (EasyPortrait)
//   COVER=0.9 → 합성 라이너를 더 진하게 (기본 0.7)
// 합성 라이너는 **화면 가이드 윤곽 모양**(눈꺼풀은 두께 그대로, 꼬리는 끝으로 가늘어짐)으로 칠한다 — paint_levels 의 라이너는 꼬리까지 같은 두께
// 단계: 기본 네 단계 + 양 끝 변형(꼬리 길게 · 앞쪽 비움 · 눈머리 넘김 · 가운데 끊김) + 맨얼굴 · 맨얼굴 5% 확대(#261)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const SET = process.env.SET ?? "ffhq", LIMIT = Number(process.env.LIMIT || 0), COVER = Number(process.env.COVER ?? 0.7);
const W = join(DATA, SET === "ep" ? "easyportrait/work" : "samples/ffhq-painted/bare");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { alignedFrame, scorePart } from "./src/core/score-part";',
  'export { decide } from "./src/core/score";',
  'export { scoreHybrid, linerEnds, linerEndsResult } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-ends-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-ends-core.mjs")).href);
const { paint } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);

const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** 눈꺼풀 선(눈머리 → 눈꼬리)의 u0~u1 구간을 n점으로 */
function lidPart(lid, u0, u1, n = 28) {
  const cum = [0]; for (let i = 1; i < lid.length; i++) cum.push(cum[i - 1] + Math.hypot(lid[i].x - lid[i - 1].x, lid[i].y - lid[i - 1].y));
  const total = cum[cum.length - 1], out = [];
  for (let k = 0; k < n; k++) { const t = (u0 + ((u1 - u0) * k) / (n - 1)) * total; let i = 1; while (i < cum.length - 1 && cum[i] < t) i++; out.push(mix(lid[i - 1], lid[i], (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1))); }
  return out;
}
/** 가이드 윤곽 모양의 띠: 아래 = 눈꺼풀 선, 위 = 수직으로 off px, 끝점(tip)이 있으면 거기서 만난다 */
function band(pts, off, tip) {
  const top = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; let n = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d }; if (n.y > 0) n = { x: -n.x, y: -n.y }; return { x: p.x + n.x * off, y: p.y + n.y * off }; });
  const poly = [...pts, ...(tip ? [tip] : []), ...top.reverse()];
  return { poly, grow: 0, test: (x, y) => inPoly(x, y, poly) };
}
// 단계 → [기대 판정, (눈꺼풀 선, 꼬리 [눈꼬리, 끝], 두께 px, 눈 폭) → 칠할 모양들]
const LEVELS = {
  under: ["slight", (lid, w, t) => [band(lidPart(lid, 0, 0.75), t)]],                                   // 눈꼬리 쪽 25% 와 꼬리를 비움
  ok: ["ok", (lid, w, t) => [band(lidPart(lid, 0, 1), t, w[1])]],
  slight: ["slight", (lid, w, t, e) => [band(lidPart(lid, 0, 1), t + 0.025 * e, w[1])]],               // 2.5% 두껍게
  heavy: ["off", (lid, w, t) => [band(lidPart(lid, 0, 1), t * 2.5, mix(w[0], w[1], 1.8))]],            // 2.5배 두껍고 꼬리 1.8배
  wing_long: ["slight", (lid, w, t) => [band(lidPart(lid, 0, 1), t, mix(w[0], w[1], 1.5))]],           // 꼬리만 1.5배
  inner_short: ["slight", (lid, w, t) => [band(lidPart(lid, 0.25, 1), t, w[1])]],                      // 눈머리 쪽 25% 를 비움
  inner_over: ["slight", (lid, w, t, e) => { const d = Math.hypot(lid[1].x - lid[0].x, lid[1].y - lid[0].y) || 1; return [band([mix(lid[0], lid[1], -(0.07 * e) / d), ...lidPart(lid, 0, 1)], t, w[1])]; }],   // 눈머리 너머 7%
  mid_gap: ["ok", (lid, w, t) => [band(lidPart(lid, 0, 0.35), t), band(lidPart(lid, 0.65, 1), t, w[1])]],   // 가운데 30% 가 끊김 — 양 끝은 가이드대로
};
const KO = { bare: "맨얼굴", zoom: "맨얼굴 5% 확대", under: "꼬리 비움", ok: "가이드대로", slight: "2.5% 두껍게", heavy: "많이 번짐", wing_long: "꼬리 1.5배", inner_short: "앞쪽 비움", inner_over: "눈머리 넘김", mid_gap: "가운데 끊김" };
const EK = { ok: "맞음", slight: "조금", off: "많이" };
/** 가운데를 기준으로 k배 (겹선형) — 맨얼굴과 확인 사진의 거리·초점 차이 흉내 (#261) */
function zoom(im, lm, k) {
  const cx = im.w / 2, cy = im.h / 2, d = new Uint8ClampedArray(im.data.length);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const sx = Math.max(0, Math.min(im.w - 1.001, cx + (x - cx) / k)), sy = Math.max(0, Math.min(im.h - 1.001, cy + (y - cy) / k)), x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * im.w + x) * 4;
    for (let c = 0; c < 3; c++) { const g = (xx, yy) => im.data[(yy * im.w + xx) * 4 + c]; d[o + c] = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy; }
    d[o + 3] = 255;
  }
  return { im: { data: d, w: im.w, h: im.h }, lm: lm.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })) };
}
const fold = (s) => (s >= 80 ? "ok" : s >= 50 ? "slight" : "off");
let ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).filter((id) => existsSync(join(W, `${id}.png`))).sort();
if (LIMIT) ids = ids.slice(0, LIMIT);
const rows = [], eyeW = [];
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const base = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm)), e = base.unit.eye;
  eyeW.push(e);
  const z = zoom(im, lm, 1.05);
  for (const look of core.LOOKS) {
    const guide = core.planGuide(look.parts, plan), g = guide("liner", base).liner, color = look.parts.liner.color;
    const judge = (level, curIm, curLm) => {
      const { frame, fit } = core.alignedFrame(base, curIm, curLm), o = { templateColor: color, alignResidual: fit.residual };
      const a = core.scorePart("liner", base, frame, guide, o), h = core.scoreHybrid("liner", base, frame, guide, o);
      const gc = guide("liner", frame).liner, e = core.linerEndsResult({ R: core.linerEnds(base, frame, "R", g, gc), L: core.linerEnds(base, frame, "L", g, gc) });
      const da = core.decide("liner", a.result, a.ctx), dh = core.decide("liner", h.result, h.ctx), de = core.decide("liner", e, a.ctx);
      rows.push({ id, look: look.id, level, guideThick: g.thick, A: da, E: de, S: dh, codesA: a.result.codes, codesE: [...h.result.codes, ...(h.result.metrics?.endCodes ?? [])], ends: h.result.metrics?.ends ?? null });
    };
    judge("bare", im, lm);
    judge("zoom", z.im, z.lm);
    for (const [level, [, make]] of Object.entries(LEVELS)) {
      const shapes = ["R", "L"].flatMap((s) => make((s === "R" ? core.LM.eyeA : core.LM.eyeB).upper.map((i) => lm[i]).reverse(), g.wing[s], g.thick * e, e));
      judge(level, paint(im, shapes, color, COVER).im, lm);
    }
  }
  process.stderr.write(`liner_ends: ${id}\n`);
}
writeFileSync(join(OUT, `liner-ends-${SET}.json`), JSON.stringify(rows));
const q = (v, p) => (v.length ? v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))] : NaN);
const pc = (n, d) => String(Math.round((n / (d || 1)) * 100)).padStart(3) + "%";
console.log(`# 라이너 — 지금 방식 vs 양 끝(칸 색 차이) vs 양 끝(획 추출) · ${SET === "ep" ? "EasyPortrait" : "FFHQ 동양인"} ${ids.length}명 × 화장 10종 · 눈 폭 중앙 ${q(eyeW, 0.5).toFixed(0)}px · 덮는 비율 ${COVER}`);
console.log("\n분포 = 전체 중 맞음·조금·많이·확인만 비율, 일치 = 기대 판정과 같은 비율, 점수 = 중앙");
console.log("단계 (기대)            | 지금 방식: 분포 | 일치 | 점수 || 양 끝·칸 색 차이: 일치 | 점수 || 양 끝·획 추출: 분포 | 일치 | 점수");
for (const lv of ["bare", "zoom", ...Object.keys(LEVELS)]) {
  const xs = rows.filter((x) => x.level === lv), exp = LEVELS[lv]?.[0];
  const cell = (m, dist = true) => { const sc = xs.filter((x) => x[m].status === "scored"), by = (k) => sc.filter((x) => fold(x[m].score) === k).length; return `${dist ? `${pc(by("ok"), xs.length)}·${pc(by("slight"), xs.length)}·${pc(by("off"), xs.length)}·${pc(xs.length - sc.length, xs.length)} | ` : ""}${exp ? pc(by(exp), xs.length) : `점수 남 ${pc(sc.length, xs.length)}`} | ${String(q(sc.map((x) => x[m].score), 0.5)).padStart(4)}`; };
  console.log(`${(KO[lv] + (exp ? ` (${EK[exp]})` : " (점수 없음)")).padEnd(18)} | ${cell("A")} || ${cell("E", false)} || ${cell("S")}`);
}
console.log("\n## 획 추출이 잰 값 (중앙, 눈 폭 %)\n단계          | 꼬리 − 가이드 | 앞쪽 시작 | 눈꼬리 채움 | 앞트임 채움 | 가운데 채움 | 번짐 | 두께 − 가이드");
for (const lv of Object.keys(LEVELS)) {
  const es = rows.filter((x) => x.level === lv && x.ends).flatMap((x) => [x.ends.R, x.ends.L]).filter((e) => e.present), m = (f) => (q(es.map(f), 0.5) * 100).toFixed(1).padStart(6);
  console.log(`${KO[lv].padEnd(10)} | ${m((e) => e.wingDrawn - e.wingGuide)} | ${m((e) => e.innerStart)} | ${m((e) => e.outerCoverage)} | ${m((e) => e.innerCoverage)} | ${m((e) => e.midCoverage)} | ${m((e) => e.overflow)} | ${m((e) => e.thickness - e.guideThick)}`);
}
console.log("\n## 진단 코드 (점수 난 것 중 뜬 비율, 좌우 합침) — 지금 방식 / 획 추출");
for (const lv of Object.keys(LEVELS)) for (const [m, k] of [["A", "codesA"], ["S", "codesE"]]) {
  const xs = rows.filter((x) => x.level === lv && x[m].status === "scored"), c = {};
  for (const x of xs) for (const code of new Set(x[k].map((s) => s.replace(/_[RL]$/, "")))) c[code] = (c[code] ?? 0) + 1;
  console.log(`${KO[lv].padEnd(10)} ${m === "A" ? "지금" : "획  "} | ` + (Object.entries(c).filter(([, v]) => v / xs.length >= 0.1).sort((a, b) => b[1] - a[1]).map(([code, v]) => `${code.replace("LINER_", "")} ${pc(v, xs.length).trim()}`).join(" · ") || "없음"));
}
console.log("\n## 가이드 두께별 '가이드대로' 일치율 — 지금 / 획 추출");
for (const t of [...new Set(rows.map((x) => x.guideThick))].sort((a, b) => a - b)) {
  const xs = rows.filter((x) => x.level === "ok" && x.guideThick === t), hit = (m) => xs.filter((x) => x[m].status === "scored" && fold(x[m].score) === "ok").length;
  console.log(`두께 ${(t * 100).toFixed(1)}%: ${pc(hit("A"), xs.length)} / ${pc(hit("S"), xs.length)}`);
}
