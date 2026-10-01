// 결과 모양 눈썹 점수를 실제 셀피 300장에 — 아무것도 안 그린 상태에서 몇 점, 어떤 지적이 나오나. 넘침은 정답 마스크와 맞나
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
  'export { frameOf, boxOf, labBox } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { shapeFill, browShape, SHAPE_FILL } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core2.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core2.mjs")).href);
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const dEdge = (x, y, poly) => { let best = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy)); } return best; };
const look = core.LOOKS.find((l) => l.id === "chic");
const scores = [], codes = new Map(), spill = [];
let faces = 0, hairy = 0;
for (const id of readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4];
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), reg = core.planGuide(look.parts, core.resolvePlan(core.measureFace(lm)))("brow", f).regions;
  if (!reg) continue;
  // 정답: 가이드 바로 밖 띠(눈 폭 10% 안)에서 눈썹 마스크가 차지하는 비율. 머리카락이 걸린 얼굴은 뺀다
  const box = core.boxOf(f.unit.eye), near = core.SHAPE_FILL.band[0] * f.unit.eye;
  let bad = false; const truth = {};
  for (const s of ["R", "L"]) {
    const poly = reg[s], xs = poly.map((q) => q.x), ys = poly.map((q) => q.y); let n = 0, b = 0, other = 0, inN = 0;
    for (let y = Math.max(0, Math.floor(Math.min(...ys) - near)); y <= Math.min(im.h - 1, Math.ceil(Math.max(...ys) + near)); y += box) for (let x = Math.max(0, Math.floor(Math.min(...xs) - near)); x <= Math.min(im.w - 1, Math.ceil(Math.max(...xs) + near)); x += box) {
      const c = cls(x, y);
      if (inPoly(x, y, poly)) { inN++; if (c !== 2 && c !== 3 && c !== 4) other++; continue; }
      if (dEdge(x, y, poly) < near) { n++; if (c === 3 || c === 4) b++; else if (c !== 2) other++; }
    }
    if (other / Math.max(1, n + inN) >= 0.1) bad = true;
    truth[s] = n ? b / n : 0;
  }
  if (bad) { hairy++; continue; }
  faces++;
  const res = core.browShape(f, reg);
  if (res.score != null) scores.push(res.score);
  for (const c of res.codes) codes.set(c.replace(/_[RL]$/, ""), (codes.get(c.replace(/_[RL]$/, "")) ?? 0) + 1);
  for (const s of ["R", "L"]) spill.push({ truth: truth[s], est: core.shapeFill(f, reg[s]).spill });
}
const q = (v, p) => v.slice().sort((a, b) => a - b)[Math.floor(v.length * p)];
console.log(`얼굴 ${faces}명 (머리카락이 눈썹에 걸려 뺀 ${hairy}명) — 아무것도 안 그린 상태의 결과 모양 눈썹 점수`);
console.log(`점수: 중앙 ${q(scores, 0.5)} · 하위 10% ${q(scores, 0.1)} · 상위 10% ${q(scores, 0.9)} | 80점 이상(맞음) ${(scores.filter((s) => s >= 80).length / faces * 100).toFixed(0)}% · 50~79(조금) ${(scores.filter((s) => s >= 50 && s < 80).length / faces * 100).toFixed(0)}% · 50 미만(많이) ${(scores.filter((s) => s < 50).length / faces * 100).toFixed(0)}% · 점수 없음 ${((faces - scores.length) / faces * 100).toFixed(0)}%`);
console.log("지적(눈썹 한쪽이라도): " + [...codes].map(([k, v]) => `${k} ${v}건`).join(" · "));
const withOut = spill.filter((r) => r.est > 0.3).length, truthOut = spill.filter((r) => r.truth > 0.3).length;
const mx = spill.reduce((a, r) => a + r.truth, 0) / spill.length, my = spill.reduce((a, r) => a + r.est, 0) / spill.length; let sxy = 0, sx = 0, sy = 0; for (const r of spill) { sxy += (r.truth - mx) * (r.est - my); sx += (r.truth - mx) ** 2; sy += (r.est - my) ** 2; }
console.log(`넘침(가이드 바로 밖 띠) — 정답 중앙 ${(q(spill.map((r) => r.truth), 0.5) * 100).toFixed(0)}% · 추정 중앙 ${(q(spill.map((r) => r.est), 0.5) * 100).toFixed(0)}% · 상관 ${(sxy / Math.sqrt(sx * sy)).toFixed(2)} · 30% 넘는 눈썹: 정답 ${(truthOut / spill.length * 100).toFixed(0)}% / 추정 ${(withOut / spill.length * 100).toFixed(0)}%`);
