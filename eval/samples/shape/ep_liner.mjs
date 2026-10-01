// 결과 모양 라이너(꼬리·두께)를 실제 셀피 300장에 — 화장 여부는 모른다(섞여 있음). 분포를 본다
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
  'export { frameOf, sampleLiner } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { linerBand } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core3.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core3.mjs")).href);
const look = core.LOOKS.find((l) => l.id === "chic");
const eyes = []; let skipped = 0;
for (const id of readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => (x < 0 || y < 0 || x >= mk.width || y >= mk.height ? 0 : mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4]);
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), g = core.planGuide(look.parts, core.resolvePlan(core.measureFace(lm)))("liner", f).liner;
  for (const s of ["R", "L"]) {
    // 꼬리 선 둘레(눈 폭 11%)에 피부가 아닌 것(머리카락·배경·눈썹)이 걸리면 그 눈은 뺀다
    const [a, b] = g.wing[s], e = f.unit.eye; let n = 0, bad = 0;
    for (let t = 0.2; t <= 1; t += 0.1) for (const o of [-0.11, -0.05, 0, 0.05, 0.11]) { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; const x = a.x + dx * t - (dy / len) * o * e, y = a.y + dy * t + (dx / len) * o * e; n++; if (cls(x, y) !== 2) bad++; }
    if (bad / n > 0.15) { skipped++; continue; }
    const band = core.linerBand(core.sampleLiner(f, s, g.wing[s], g.thick));
    eyes.push({ ...band, eye: e, guide: g.thick, id, s, cx: (a.x + lm[s === 'R' ? 133 : 362].x) / 2, cy: a.y, wing: [a, b] });
  }
}
const q = (v, p) => v.slice().sort((a, b) => a - b)[Math.floor(v.length * p)];
const pct = (v) => (v * 100).toFixed(0);
console.log(`눈 ${eyes.length}개 (꼬리 자리에 머리카락 등이 걸려 뺀 ${skipped}개) · 눈 폭 중앙 ${q(eyes.map((e) => e.eye), 0.5).toFixed(0)}px`);
const w = eyes.map((e) => e.wingCoverage);
console.log(`꼬리 채움: 중앙 ${pct(q(w, 0.5))}% · 상위 25% ${pct(q(w, 0.75))}% · 상위 10% ${pct(q(w, 0.9))}% | 0% 인 눈 ${pct(w.filter((v) => v === 0).length / w.length)}% · 30% 넘는 눈 ${pct(w.filter((v) => v > 0.3).length / w.length)}% · 50% 넘는 눈 ${pct(w.filter((v) => v > 0.5).length / w.length)}% · 80% 넘는 눈 ${pct(w.filter((v) => v > 0.8).length / w.length)}%`);
const th = eyes.map((e) => e.thickness * 100);
console.log(`어두운 띠 두께(눈 폭 %): 하위 10% ${q(th, 0.1).toFixed(1)} · 중앙 ${q(th, 0.5).toFixed(1)} · 상위 25% ${q(th, 0.75).toFixed(1)} · 상위 10% ${q(th, 0.9).toFixed(1)}  (가이드: 청순·출근 2.0 · 어른 여자 4.0 · 세미 스모키 6.0)`);
console.log(`눈꺼풀 줄 중 어두운 띠가 있는 비율: 중앙 ${pct(q(eyes.map((e) => e.lidCoverage), 0.5))}%`);

writeFileSync(join(OUT, "liner-eyes.json"), JSON.stringify(eyes));
