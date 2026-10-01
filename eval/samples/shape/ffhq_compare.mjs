// 비교 표 — 지금 방식(원본 대조) / 결과 모양만 / 조합. FFHQ 맨얼굴 30장 × 화장 10종 × 부위 5 × (맨얼굴 + 네 단계)
// 가이드 = 개인화(규칙 계획) 가이드. 눈썹은 화면 테두리(표준 눈썹)대로 칠한다. 합성 화장이라 숫자는 방향만 본다
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { alignedFrame, scorePart } from "./src/core/score-part";',
  'export { decide, scoreForm } from "./src/core/score";',
  'export { scoreHybrid, browShape, tintFill } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "compare.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "compare.mjs")).href);
const { shapes, paint, LEVELS, EXPECT, PARTS } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);
const BARE = join(DATA, "samples/ffhq-painted/bare");
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const fold = (s) => (s >= 80 ? "ok" : s >= 50 ? "slight" : "off");
const rows = [];
const limit = Number(process.env.LIMIT || 0);
let ids = readdirSync(BARE).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort();
if (limit) ids = ids.slice(0, limit);
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(BARE, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const lm = JSON.parse(readFileSync(join(BARE, `${id}.lm.json`), "utf8"));
  const base = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm));
  for (const look of core.LOOKS) {
    const guide = core.planGuide(look.parts, plan);
    for (const part of PARTS) {
      const lp = look.parts[part], color = lp.color, alpha = lp.alphaR ?? lp.alpha ?? 0.7;
      const cover = part === "shadow" || part === "cheek" ? alpha : 0.7;
      const opts = { templateColor: color, ...(part === "shadow" || part === "cheek" ? { templateAlpha: alpha } : {}) };
      const geom = guide(part, base);
      const judgeAll = (curIm) => {
        const { frame, fit } = core.alignedFrame(base, curIm, lm);
        const o = { ...opts, alignResidual: fit.residual };
        const a = core.scorePart(part, base, frame, guide, o), da = core.decide(part, a.result, a.ctx);
        const h = core.scoreHybrid(part, base, frame, guide, o), dh = core.decide(part, h.result, h.ctx);
        let db = null;   // 결과 모양만
        if (part === "brow" && geom.regions) { const b = core.browShape(frame, geom.regions); db = core.decide(part, b, {}); }
        else if (part === "lip" || part === "shadow" || part === "cheek") {
          const polys = part === "lip" ? [{ poly: core.LM.lipsOuter.map((i) => frame.lm[i]), hole: LIP_INNER.map((i) => frame.lm[i]) }] : ["R", "L"].map((s) => ({ poly: guide(part, frame).regions[s] }));
          const t = polys.map((g) => core.tintFill(frame, g.poly, color, { ...(g.hole ? { hole: g.hole } : {}), ...(opts.templateAlpha ? { minProgress: opts.templateAlpha * 0.5 } : {}) }));
          const cv = t.reduce((s, x) => s + x.coverage, 0) / t.length, sp = t.reduce((s, x) => s + x.spill, 0) / t.length;
          db = cv >= 0.15 ? { status: "scored", score: core.scoreForm({ coverage: cv, overflow: sp }), reason: null } : { status: "check_only", score: null, reason: "faint" };
        }
        return { A: da, B: db, H: dh, route: h.route };
      };
      const add = (level, d) => rows.push({ id, look: look.id, part, level, A: d.A, B: d.B, H: d.H, route: d.route });
      add("bare", judgeAll(im));
      for (const level of LEVELS) add(level, judgeAll(paint(im, shapes(core, part, level, lm, look.parts, geom, base.unit), color, cover).im));
    }
  }
  process.stderr.write(`ffhq_compare: ${id}\n`);
}
writeFileSync(join(OUT, "compare-rows.json"), JSON.stringify(rows));
const KO = { brow: "눈썹", liner: "라이너", shadow: "섀도우", lip: "입술", cheek: "볼" }, MK = { A: "지금 방식", B: "결과 모양만", H: "조합" };
const cell = (xs, m, level) => { const v = xs.map((x) => x[m]).filter(Boolean); if (!v.length) return "   -   "; const sc = v.filter((d) => d.status === "scored"); if (level === "bare") return `점수 ${String(Math.round(sc.length / v.length * 100)).padStart(3)}%`; const hit = sc.filter((d) => fold(d.score) === EXPECT[level]).length; return `${sc.length ? String(Math.round(hit / sc.length * 100)).padStart(3) : "  -"}% (${String(Math.round((1 - sc.length / v.length) * 100)).padStart(2)}%)`; };
console.log(`\nFFHQ ${ids.length}명 × 화장 10종 — 칸: 점수를 낸 것 중 기대 판정과 같은 비율 (괄호 = 확인만 비율). 맨얼굴 칸은 점수가 난 비율`);
console.log("부위 · 방식        | 맨얼굴      | 덜 채움(조금) | 적당함(맞음) | 조금 번짐(조금) | 많이 번짐(많이)");
for (const part of PARTS) for (const m of ["A", "B", "H"]) {
  const xs = (lv) => rows.filter((x) => x.part === part && x.level === lv);
  console.log(`${(KO[part] + " " + MK[m]).padEnd(14)} | ${cell(xs("bare"), m, "bare")} | ${LEVELS.map((lv) => cell(xs(lv), m, lv)).join(" | ")}`);
}
const rt = {}; for (const x of rows.filter((x) => x.level === "bare")) { rt[x.part] ??= {}; rt[x.part][x.route] = (rt[x.part][x.route] ?? 0) + 1; }
console.log("\n조합이 보낸 곳: " + PARTS.map((p) => `${KO[p]} ` + Object.entries(rt[p]).map(([k, v]) => `${k} ${Math.round(v / (ids.length * 10) * 100)}%`).join("·")).join(" | "));
