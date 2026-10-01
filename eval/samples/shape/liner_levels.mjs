// 라이너 진단 — 합성 라이너 네 단계를 지금 채점(원본 대조)이 어느 쪽으로 틀리나, 왜 틀리나
//   SET=ffhq node eval/samples/shape/liner_levels.mjs   (FFHQ 동양인 확인한 30장, 눈 폭 약 55px)
//   SET=ep LIMIT=100 node eval/samples/shape/liner_levels.mjs   (EasyPortrait, 눈 폭 약 106px — 사진 크기 탓인지 가르기)
//   SCALE=2 → 사진·얼굴 점을 그 배율로 (작게 줄이기만 — 키우면 흐려진다)
// 칸: 기대 판정 대비 실제 판정(맞음·조금·많이·확인만) + 단계별 잰 값(채움·번짐·두께 차·꼬리 차) + 진단 코드
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const SET = process.env.SET ?? "ffhq", LIMIT = Number(process.env.LIMIT || 0), SCALE = Number(process.env.SCALE ?? 1);
// COVER: 합성 라이너를 덮는 비율 (기본 0.7 = 합성 세트와 같게). 실제 라이너는 더 진하다 — 0.9 로도 본다
const COVER = Number(process.env.COVER ?? 0.7);
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
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-levels-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-levels-core.mjs")).href);
const { shapes, paint, LEVELS, EXPECT } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);
const shrink = (im, k) => {
  const w = Math.round(im.w * k), h = Math.round(im.h * k), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x / k), x1 = Math.min(im.w, Math.max(x0 + 1, Math.floor((x + 1) / k))), y0 = Math.floor(y / k), y1 = Math.min(im.h, Math.max(y0 + 1, Math.floor((y + 1) / k)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * im.w + xx) * 4; r += im.data[i]; g += im.data[i + 1]; b += im.data[i + 2]; n++; }
    const o = (y * w + x) * 4; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255;
  }
  return { data: d, w, h };
};
const fold = (s) => (s >= 80 ? "ok" : s >= 50 ? "slight" : "off");
let ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).filter((id) => existsSync(join(W, `${id}.png`))).sort();
if (LIMIT) ids = ids.slice(0, LIMIT);
const rows = [], eyeW = [];
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`)));
  let im = { data: p.data, w: p.width, h: p.height }, lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  if (SCALE !== 1) { im = shrink(im, SCALE); lm = lm.map((q) => ({ x: q.x * SCALE, y: q.y * SCALE })); }
  const base = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm));
  eyeW.push(base.unit.eye);
  for (const look of core.LOOKS) {
    const guide = core.planGuide(look.parts, plan), geom = guide("liner", base), color = look.parts.liner.color;
    for (const level of ["bare", ...LEVELS]) {
      const cur = level === "bare" ? im : paint(im, shapes(core, "liner", level, lm, look.parts, geom, base.unit), color, COVER).im;
      const { frame, fit } = core.alignedFrame(base, cur, lm);
      const a = core.scorePart("liner", base, frame, guide, { templateColor: color, alignResidual: fit.residual }), d = core.decide("liner", a.result, a.ctx);
      const pe = a.result.metrics?.perEye, avg = (k) => (pe ? (pe.R[k] + pe.L[k]) / 2 : null);
      rows.push({ id, look: look.id, level, status: d.status, reason: d.reason, score: d.score, codes: a.result.codes ?? [], guideThick: geom.liner.thick,
        coverage: avg("coverage"), overflow: avg("overflow"), thickDelta: pe ? avg("thickness") - avg("guideThick") : null, wingDelta: pe ? avg("wingDrawn") - avg("wingGuide") : null });
    }
  }
  process.stderr.write(`liner_levels: ${id}\n`);
}
writeFileSync(join(OUT, `liner-levels-${SET}.json`), JSON.stringify(rows));
const q = (v, p) => (v.length ? v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))] : NaN);
const pc = (n, d) => String(Math.round(n / (d || 1) * 100)).padStart(3) + "%";
const KO = { bare: "맨얼굴", under: "덜 채움", ok: "적당함", slight: "조금 번짐", heavy: "많이 번짐" }, EK = { ok: "맞음", slight: "조금", off: "많이" };
console.log(`# 라이너 진단 — ${SET === "ep" ? "EasyPortrait" : "FFHQ 동양인"} ${ids.length}명 × 화장 10종 · 눈 폭 중앙 ${q(eyeW, 0.5).toFixed(0)}px`);
console.log("\n## 기대 대비 실제 판정\n단계(기대)        | 맞음 · 조금 · 많이 · 확인만 | 점수 중앙 | 확인만 사유");
for (const lv of ["bare", ...LEVELS]) {
  const xs = rows.filter((x) => x.level === lv), sc = xs.filter((x) => x.status === "scored"), by = (k) => sc.filter((x) => fold(x.score) === k).length;
  const rs = {}; for (const x of xs.filter((x) => x.status !== "scored")) rs[x.reason] = (rs[x.reason] ?? 0) + 1;
  console.log(`${(KO[lv] + (EXPECT[lv] ? `(${EK[EXPECT[lv]]})` : "")).padEnd(14)} | ${pc(by("ok"), xs.length)} · ${pc(by("slight"), xs.length)} · ${pc(by("off"), xs.length)} · ${pc(xs.length - sc.length, xs.length)} | ${String(q(sc.map((x) => x.score), 0.5)).padStart(4)} | ${Object.entries(rs).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
}
console.log("\n## 단계별 잰 값 (점수 난 것의 중앙) — 눈 폭 % 단위\n단계        | 채움 | 번짐 | 두께 − 가이드 | 꼬리 − 가이드");
for (const lv of LEVELS) {
  const sc = rows.filter((x) => x.level === lv && x.status === "scored" && x.coverage != null), m = (k, s = 100) => (q(sc.map((x) => x[k]), 0.5) * s).toFixed(1).padStart(5);
  console.log(`${KO[lv].padEnd(8)} | ${m("coverage")} | ${m("overflow")} | ${m("thickDelta")} | ${m("wingDelta")}`);
}
console.log("\n## 가이드 두께별 일치율 (점수 난 것 중)");
for (const t of [...new Set(rows.map((x) => x.guideThick))].sort((a, b) => a - b)) {
  console.log(`가이드 두께 ${(t * 100).toFixed(1)}% (${[...new Set(rows.filter((x) => x.guideThick === t).map((x) => x.look))].join("·")}): ` + LEVELS.map((lv) => { const sc = rows.filter((x) => x.level === lv && x.guideThick === t && x.status === "scored"); return `${KO[lv]} ${pc(sc.filter((x) => fold(x.score) === EXPECT[lv]).length, sc.length)}`; }).join(" · "));
}
console.log("\n## 진단 코드 (그 단계에서 뜬 비율, 좌우 합침)");
for (const lv of LEVELS) {
  const xs = rows.filter((x) => x.level === lv && x.status === "scored"), c = {};
  for (const x of xs) for (const k of new Set(x.codes.map((k) => k.replace(/_[RL]$/, "")))) c[k] = (c[k] ?? 0) + 1;
  console.log(`${KO[lv].padEnd(8)} | ` + (Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pc(v, xs.length).trim()}`).join(" · ") || "없음"));
}
