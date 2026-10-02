// 실제로(또는 생성으로) 라이너를 그린 사진 쌍을 채점 — 눈 뜬 쌍 · 눈 감은 쌍 · 두 장 합침 · 지금 채점
//   PAIR_DIR=$DHE_DATA_DIR/work/liner-test/gpt IDS=p01,p02 LOOKS=edgy node eval/samples/shape/liner_real.mjs
//   파일: <id>_open_bare · <id>_open_made · <id>_closed_bare · <id>_closed_made (.png + .lm.json 얼굴 점 478개 px). 사진은 저장소 밖에만
// 합성으로 칠하지 않는다 — 확인 사진의 얼굴 점은 그 사진에서 뽑은 것을 쓰고, 앱처럼 맨얼굴 점을 확인 사진에 맞춘다(alignedFrame)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.env.PAIR_DIR) { console.error("DHE_DATA_DIR · PAIR_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), DIR = process.env.PAIR_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const IDS = (process.env.IDS ?? "p01").split(","), LOOK_IDS = (process.env.LOOKS ?? "edgy").split(",");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { alignedFrame, scorePart } from "./src/core/score-part";',
  'export { decide } from "./src/core/score";',
  'export { scoreHybrid, scoreLinerPair, lidEdge } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-real-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-real-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n) => (existsSync(join(DIR, `${n}.png`)) ? { im: png(join(DIR, `${n}.png`)), lm: JSON.parse(readFileSync(join(DIR, `${n}.lm.json`), "utf8")) } : null);
const fold = (s) => (s >= 80 ? "맞음" : s >= 50 ? "조금" : "많이");
const short = (c) => c.replace("LINER_", "").replace(/_([RL])$/, "·$1");
const say = (h) => { const d = core.decide("liner", h.result, h.ctx); return (d.status === "scored" ? `${fold(d.score)} ${d.score}` : `확인만(${d.reason})`) + " | " + ([...h.result.codes, ...(h.result.metrics?.endCodes ?? [])].map(short).join(" ") || "지적 없음"); };
for (const id of IDS) {
  const ob = load(`${id}_open_bare`), om = load(`${id}_open_made`), cb = load(`${id}_closed_bare`), cm = load(`${id}_closed_made`);
  if (!ob || !om) { console.log(id, "눈 뜬 쌍이 없다"); continue; }
  const plan = core.resolvePlan(core.measureFace(ob.lm));
  const pairOf = (b, m) => { const base = core.frameOf(b.im, b.lm), { frame, fit } = core.alignedFrame(base, m.im, m.lm); return { base, cur: frame, residual: fit.residual }; };
  const O = pairOf(ob, om), C = cb && cm ? pairOf(cb, cm) : null, e = O.base.unit.eye;
  console.log(`\n===== ${id} — 눈 폭 ${e.toFixed(0)}px · 꼬리 스타일 ${plan.liner.plan.style}`);
  for (const lookId of LOOK_IDS) {
    const look = core.LOOKS.find((l) => l.id === lookId), guide = core.planGuide(look.parts, plan), g = guide("liner", O.base).liner, o = { templateColor: look.parts.liner.color };
    const px = (v, u = e) => `${(v * u).toFixed(0)}px`;
    console.log(`[${lookId}] 가이드 두께 ${px(g.thick)} · 꼬리 ${px(Math.hypot(g.wing.R[1].x - g.wing.R[0].x, g.wing.R[1].y - g.wing.R[0].y) / e)}`);
    console.log(`  지금 채점 (눈 뜸): ${say(core.scorePart("liner", O.base, O.cur, guide, { ...o, alignResidual: O.residual }))}`);
    const ho = core.scoreHybrid("liner", O.base, O.cur, guide, { ...o, alignResidual: O.residual });
    console.log(`  조합 · 눈 뜸만   : ${say(ho)}`);
    for (const s of ["R", "L"]) { const m = ho.result.metrics?.perEye?.[s]; if (m) console.log(`      ${s}: 채움 ${(m.coverage * 100).toFixed(0)}% · 번짐 ${(m.overflow * 100).toFixed(0)}% · 두께 ${px(m.thickness)} · 꼬리 ${px(m.wingDrawn)} · 앞쪽 시작 ${px(m.innerStart)}`); }
    if (!C) continue;
    const eC = C.base.unit.eye, hc = core.scoreHybrid("liner", C.base, C.cur, guide, { ...o, alignResidual: C.residual });
    console.log(`  조합 · 눈 감음만 : ${say(hc)}`);
    for (const s of ["R", "L"]) { const m = hc.result.metrics?.ends?.[s]; if (m) console.log(`      ${s}: 눈꼬리 채움 ${(m.outerCoverage * 100).toFixed(0)}% · 앞트임 채움 ${(m.innerCoverage * 100).toFixed(0)}% · 가운데 ${(m.midCoverage * 100).toFixed(0)}% · 번짐 ${(m.overflow * 100).toFixed(0)}% · 두께 ${px(m.thickness, eC)} · 꼬리 ${px(m.wingDrawn, eC)}/${px(m.wingGuide, eC)} · 앞쪽 시작 ${px(m.innerStart, eC)}`); }
    console.log(`  조합 · 두 장     : ${say(core.scoreLinerPair({ base: O.base, cur: O.cur }, { base: C.base, cur: C.cur }, guide, o))}`);
  }
  const bb = core.scoreHybrid("liner", O.base, O.base, core.planGuide(core.LOOKS[0].parts, plan), {});
  console.log(`  (대조) 맨얼굴끼리: ${bb.result.present ? "그린 것 있음 ← 오판" : "그린 것 없음"}`);
}
