// 갈림 규칙으로 '결과 모양' 에 보낸 경우만 — 네 단계(덜 채움·적당·조금 번짐·많이 번짐)를 가르나. FFHQ 맨얼굴 30장 × 화장 10종
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname as _dn, resolve as _rs } from "node:path";
import { fileURLToPath as _fu } from "node:url";
const ROOT = _rs(_dn(_fu(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/");
const CLIENT = join(ROOT, "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { tintFill, routeOf } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "shape-route.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "shape-route.mjs")).href);
const { shapes, paint, LEVELS } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);
const BARE = join(DATA, "samples/ffhq-painted/bare");
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const PARTS = ["lip", "shadow", "cheek"];
const acc = new Map(), routes = new Map(); const push = (k, v) => acc.set(k, [...(acc.get(k) ?? []), v]); const inc = (k) => routes.set(k, (routes.get(k) ?? 0) + 1);
for (const id of readdirSync(BARE).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const p = PNG.sync.read(readFileSync(join(BARE, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const lm = JSON.parse(readFileSync(join(BARE, `${id}.lm.json`), "utf8"));
  const base = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm));
  for (const look of core.LOOKS) {
    const guide = core.planGuide(look.parts, plan);
    for (const part of PARTS) {
      const geom = guide(part, base), lp = look.parts[part], color = lp.color;
      const polys = part === "lip" ? [core.LM.lipsOuter.map((i) => lm[i])] : [geom.regions.R, geom.regions.L];
      const expect = part === "lip" ? 0.7 : (lp.alphaR ?? lp.alpha ?? 0.7);
      const RING = process.env.RING ? process.env.RING.split(",").map(Number) : [1.3, 1.8];
      const opt = { ...(part === "lip" ? { hole: LIP_INNER.map((i) => lm[i]) } : {}), ring: RING, minProgress: process.env.SCALE ? expect * 0.5 : 0.35 };
      const route = polys.map((poly) => core.routeOf(base, poly, color, opt));
      const r1 = route.includes("check_only") ? "check_only" : route.includes("compare") ? "compare" : "shape";
      inc(`${part}|${r1}`);
      if (r1 !== "shape") continue;
      const m = (f) => { const t = polys.map((poly) => core.tintFill(f, poly, color, opt)); return { cover: t.reduce((a, x) => a + x.coverage, 0) / t.length, spill: t.reduce((a, x) => a + x.spill, 0) / t.length }; };
      push(`${part}|bare`, m(base));
      const cover = part === "lip" ? 0.7 : (lp.alphaR ?? lp.alpha ?? 0.7);
      for (const level of LEVELS) { const { im: painted } = paint(im, shapes(core, part, level, lm, look.parts, geom, base.unit), color, cover); push(`${part}|${level}`, m(core.frameOf(painted, lm))); }
    }
  }
}
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)], pct = (v) => (v * 100).toFixed(0).padStart(3);
const KO = { lip: "입술", shadow: "섀도우", cheek: "볼" };
for (const part of PARTS) {
  const n = ["shape", "compare", "check_only"].map((k) => routes.get(`${part}|${k}`) ?? 0), tot = n.reduce((a, b) => a + b, 0);
  console.log(`\n## ${KO[part]} — 결과 모양 ${Math.round(n[0] / tot * 100)}% · 원본 대조 ${Math.round(n[1] / tot * 100)}% · 확인만 ${Math.round(n[2] / tot * 100)}%  (300칸)`);
  console.log("결과 모양으로 보낸 경우:   맨얼굴 · 덜 채움 · 적당함 · 조금 번짐 · 많이 번짐");
  console.log("  채움(중앙)     " + ["bare", ...LEVELS].map((lv) => pct(med(acc.get(`${part}|${lv}`).map((x) => x.cover)))).join("% · ") + "%");
  console.log("  밖 번짐(중앙)  " + ["bare", ...LEVELS].map((lv) => pct(med(acc.get(`${part}|${lv}`).map((x) => x.spill)))).join("% · ") + "%");
  const g = (lv) => acc.get(`${part}|${lv}`);
  const ord = g("ok").map((_, i) => ({ u: g("under")[i], o: g("ok")[i], s: g("slight")[i], h: g("heavy")[i], b: g("bare")[i] }));
  const rate = (f) => Math.round(ord.filter(f).length / ord.length * 100);
  console.log(`  순서: 적당 채움 > 덜 채움 ${rate((x) => x.o.cover > x.u.cover)}% · 조금 번짐 밖 > 적당 밖 ${rate((x) => x.s.spill > x.o.spill)}% · 많이 번짐 밖 ≥ 조금 번짐 밖 ${rate((x) => x.h.spill >= x.s.spill)}% · 적당 채움이 50% 넘음 ${rate((x) => x.o.cover >= 0.5)}%`);
}
