// 결과 모양 — 입술·섀도우·볼을 실제 셀피 300장에. 화장 여부는 모른다(대부분 맨얼굴로 보임). 템플릿 5종마다 "물든 칸" 비율
//  주변 피부 기준 두 가지: (가) 부위 둘레 띠  (나) 정답 마스크의 피부 칸 중앙값(이상적인 기준 — 앱에는 없다)
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
  'export { frameOf, sampleForehead, boxOf, labBox } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { tintFill } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core4.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core4.mjs")).href);
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const LOOK_IDS = ["chic", "edgy", "pure", "kitsch", "neutral"];
const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const acc = new Map(); const push = (k, v) => acc.set(k, [...(acc.get(k) ?? []), v]);
const lipIoU = []; let faces = 0;
for (const id of readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).sort()) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const mk = PNG.sync.read(readFileSync(join(W, `${id}.mask.png`)));
  const cls = (x, y) => (x < 0 || y < 0 || x >= mk.width || y >= mk.height ? 0 : mk.data[(Math.round(y) * mk.width + Math.round(x)) * 4]);
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const f = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm)), box = core.boxOf(f.unit.eye);
  // 정답 피부 기준: 얼굴 안 피부 칸(2)의 중앙값
  const xs = lm.map((q) => q.x), ys = lm.map((q) => q.y), skinCells = [];
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += box * 3) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += box * 3) if (cls(x, y) === 2) skinCells.push(core.labBox(im, x, y, box));
  if (skinCells.length < 50) continue;
  const gtSkin = { L: med(skinCells.map((c) => c.L)), a: med(skinCells.map((c) => c.a)), b: med(skinCells.map((c) => c.b)) };
  faces++;
  // 입술: 얼굴 점 다각형이 정답 입술 마스크와 얼마나 겹치나 (칸 단위 IoU)
  const lips = core.LM.lipsOuter.map((i) => lm[i]), inner = LIP_INNER.map((i) => lm[i]);
  { const lx = lips.map((q) => q.x), ly = lips.map((q) => q.y), pad = f.unit.lip * 0.15; let a = 0, b = 0, ab = 0;
    for (let y = Math.floor(Math.min(...ly) - pad); y <= Math.max(...ly) + pad; y += box) for (let x = Math.floor(Math.min(...lx) - pad); x <= Math.max(...lx) + pad; x += box) { const g = cls(x, y) === 7, q = inPoly(x, y, lips) && !inPoly(x, y, inner); if (g) a++; if (q) b++; if (g && q) ab++; }
    if (a + b - ab > 0) lipIoU.push(ab / (a + b - ab)); }
  const clean = (poly, allow) => { const px = poly.map((q) => q.x), py = poly.map((q) => q.y); let n = 0, bad = 0; for (let y = Math.floor(Math.min(...py)); y <= Math.max(...py); y += box) for (let x = Math.floor(Math.min(...px)); x <= Math.max(...px); x += box) if (inPoly(x, y, poly)) { n++; if (!allow.includes(cls(x, y))) bad++; } return n > 10 && bad / n < 0.1; };
  for (const lookId of LOOK_IDS) {
    const look = core.LOOKS.find((l) => l.id === lookId), guide = core.planGuide(look.parts, plan);
    if (clean(lips, [7, 8, 2])) for (const [nm, o] of [["띠", {}], ["정답피부", { skin: gtSkin }]]) { const t = core.tintFill(f, lips, look.parts.lip.color, { ...o, hole: inner }); push(`lip|${lookId}|${nm}`, t); }
    for (const part of ["shadow", "cheek"]) {
      const reg = guide(part, f).regions;
      for (const s of ["R", "L"]) {
        if (!clean(reg[s], [2])) continue;
        for (const [nm, o] of [["띠", {}], ["정답피부", { skin: gtSkin }]]) push(`${part}|${lookId}|${nm}`, core.tintFill(f, reg[s], look.parts[part].color, o));
      }
    }
  }
}
const pct = (v) => (v * 100).toFixed(0).padStart(3);
console.log(`얼굴 ${faces}명 · 입술: 얼굴 점 다각형과 정답 입술 마스크의 겹침(IoU) 중앙 ${med(lipIoU).toFixed(2)} · 하위 10% ${lipIoU.slice().sort((a, b) => a - b)[Math.floor(lipIoU.length * 0.1)].toFixed(2)}`);
const KO = { lip: "입술", shadow: "섀도우", cheek: "볼" };
for (const part of ["lip", "shadow", "cheek"]) {
  console.log(`\n## ${KO[part]} — 물든 칸 비율(중앙) · 50% 넘는 비율 · 밖 번짐(중앙)    [기준: 둘레 띠 | 정답 피부]`);
  for (const lookId of LOOK_IDS) {
    const cell = (nm) => { const xs = acc.get(`${part}|${lookId}|${nm}`) ?? []; if (!xs.length) return "  -"; return `${pct(med(xs.map((t) => t.coverage)))}% · ${pct(xs.filter((t) => t.coverage >= 0.5).length / xs.length)}% · ${pct(med(xs.map((t) => t.spill)))}% (n=${xs.length})`; };
    console.log(`${lookId.padEnd(8)} ${cell("띠")}  |  ${cell("정답피부")}`);
  }
}
