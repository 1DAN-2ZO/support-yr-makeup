// 갈림 규칙을 실제 셀피 300장에 — 화장 10종 × 부위마다 어디로 가나
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname as _dn, resolve as _rs } from "node:path";
import { fileURLToPath as _fu } from "node:url";
const ROOT = _rs(_dn(_fu(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/");
const CLIENT = join(ROOT, "client"), W = join(DATA, "easyportrait/work");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf, boxOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { routeOf } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core5.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core5.mjs")).href);
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const cnt = new Map(); const inc = (k) => cnt.set(k, (cnt.get(k) ?? 0) + 1);
for (const id of readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => (x < 0 || y < 0 || x >= mk.width || y >= mk.height ? 0 : mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4]);
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm)), box = core.boxOf(f.unit.eye);
  const clean = (poly, allow) => { const px = poly.map((q) => q.x), py = poly.map((q) => q.y); let n = 0, bad = 0; for (let y = Math.floor(Math.min(...py)); y <= Math.max(...py); y += box) for (let x = Math.floor(Math.min(...px)); x <= Math.max(...px); x += box) if (inPoly(x, y, poly)) { n++; if (!allow.includes(cls(x, y))) bad++; } return n > 10 && bad / n < 0.1; };
  const lips = core.LM.lipsOuter.map((i) => lm[i]), inner = LIP_INNER.map((i) => lm[i]);
  for (const look of core.LOOKS) {
    const guide = core.planGuide(look.parts, plan);
    if (clean(lips, [7, 8, 2])) inc(`lip|${look.id}|${core.routeOf(f, lips, look.parts.lip.color, { hole: inner })}`);
    for (const part of ["shadow", "cheek"]) { const reg = guide(part, f).regions; for (const s of ["R", "L"]) if (clean(reg[s], [2])) inc(`${part}|${look.id}|${core.routeOf(f, reg[s], look.parts[part].color)}`); }
  }
}
const KO = { lip: "입술", shadow: "섀도우", cheek: "볼" };
console.log("화장        | 입술: 결과모양·원본대조·확인만 | 섀도우 | 볼   (실제 셀피, %)");
const tot = { lip: [0, 0, 0], shadow: [0, 0, 0], cheek: [0, 0, 0] };
for (const look of core.LOOKS) {
  const cell = (part) => { const v = ["shape", "compare", "check_only"].map((k) => cnt.get(`${part}|${look.id}|${k}`) ?? 0), n = v.reduce((a, b) => a + b, 0) || 1; v.forEach((x, i) => tot[part][i] += x); return v.map((x) => String(Math.round(x / n * 100)).padStart(3)).join("·"); };
  console.log(`${(look.id + " " + look.name).padEnd(16)} | ${cell("lip")} | ${cell("shadow")} | ${cell("cheek")}`);
}
console.log("전체            | " + ["lip", "shadow", "cheek"].map((p) => { const n = tot[p].reduce((a, b) => a + b, 0); return tot[p].map((x) => String(Math.round(x / n * 100)).padStart(3)).join("·"); }).join(" | "));
