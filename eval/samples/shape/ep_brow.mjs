// EasyPortrait(실제 셀피 + 사람이 그린 눈썹 마스크)로 결과 모양 눈썹 채움(shapeFill)을 검증한다
//  참값 = 개인화 표준 눈썹 테두리 안에서 정답 눈썹 마스크가 차지하는 비율 / 추정 = shapeFill.coverage
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
  'export { frameOf, sampleLiner, sampleForehead, boxOf, labBox } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { shapeFill, linerBand } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core.mjs")).href);
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const look = core.LOOKS.find((l) => l.id === "chic");
const rows = [];
const ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort();
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4];
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), reg = core.planGuide(look.parts, core.resolvePlan(core.measureFace(lm)))("brow", f).regions;
  if (!reg) continue;
  const box = core.boxOf(f.unit.eye);
  for (const s of ["R", "L"]) {
    const poly = reg[s], xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
    let n = 0, brow = 0, hair = 0;
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += box) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += box) {
      if (x < 0 || y < 0 || x >= im.w || y >= im.h || !inPoly(x, y, poly)) continue;
      n++; const c = cls(x, y); if (c === 3 || c === 4) brow++; else if (c !== 2) hair++;   // 2 = 피부. 그 밖(사람·배경) = 머리카락 등
    }
    if (n < 20) continue;
    rows.push({ id, s, truth: brow / n, est: core.shapeFill(f, poly).coverage, other: hair / n, eye: f.unit.eye });
  }
}
const clean = rows.filter((r) => r.other < 0.1);   // 테두리 안에 머리카락·배경이 거의 없는 눈썹만
const mae = (xs) => xs.reduce((a, r) => a + Math.abs(r.est - r.truth), 0) / xs.length;
const corr = (xs) => { const mx = xs.reduce((a, r) => a + r.truth, 0) / xs.length, my = xs.reduce((a, r) => a + r.est, 0) / xs.length; let sxy = 0, sx = 0, sy = 0; for (const r of xs) { sxy += (r.truth - mx) * (r.est - my); sx += (r.truth - mx) ** 2; sy += (r.est - my) ** 2; } return sxy / Math.sqrt(sx * sy); };
const med = (xs, k) => xs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`사진 ${ids.length}장 · 눈썹 ${rows.length}개 (머리카락 안 걸린 것 ${clean.length}개) · 눈 폭 중앙 ${med(rows, "eye").toFixed(0)}px`);
for (const [name, xs] of [["전체", rows], ["머리카락 안 걸린 것", clean], ["머리카락 걸린 것", rows.filter((r) => r.other >= 0.1)]]) {
  if (!xs.length) continue;
  console.log(`${name}: 정답 채움 중앙 ${(med(xs, "truth") * 100).toFixed(0)}% · 추정 중앙 ${(med(xs, "est") * 100).toFixed(0)}% · 평균 오차 ${(mae(xs) * 100).toFixed(1)}%p · 상관 ${corr(xs).toFixed(2)}`);
}
const bins = [0.3, 0.5, 0.7, 0.9].map((t) => `${t * 100}% 이상 ${(clean.filter((r) => r.truth >= t).length / clean.length * 100).toFixed(0)}%`);
console.log(`원래 눈썹이 표준 눈썹 테두리를 채운 정도(정답 기준): ${bins.join(" · ")}`);
writeFileSync(join(OUT, "brow-rows.json"), JSON.stringify(rows));
