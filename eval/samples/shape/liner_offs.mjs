// 라이너 띠를 높이(속눈썹 선에서 위로)별로 — 맨얼굴이 원래 얼마나 어두운지, 가이드대로 그린 라이너가 그 높이에서 감지되는 비율
//   SET=ffhq|ep LIMIT=30 LOOK=chic node eval/samples/shape/liner_offs.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const SET = process.env.SET ?? "ffhq", LIMIT = Number(process.env.LIMIT || 0), LOOK = process.env.LOOK ?? "chic";
const W = join(DATA, SET === "ep" ? "easyportrait/work" : "samples/ffhq-painted/bare");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf, sampleLiner } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { PARAMS } from "./src/core/score";',
  'export { deltaE } from "./src/core/color";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-offs-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-offs-core.mjs")).href);
const { shapes, paint } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);
let ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).filter((id) => existsSync(join(W, `${id}.png`))).sort();
if (LIMIT) ids = ids.slice(0, LIMIT);
const look = core.LOOKS.find((l) => l.id === LOOK), th = core.PARAMS.dEThresh.liner;
let offs = null, thick = 0; const baseL = [], skinL = [], hit = [], dE = [];
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`))), im = { data: p.data, w: p.width, h: p.height };
  const lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  const base = core.frameOf(im, lm), guide = core.planGuide(look.parts, core.resolvePlan(core.measureFace(lm))), geom = guide("liner", base), g = geom.liner;
  const cur = core.frameOf(paint(im, shapes(core, "liner", "ok", lm, look.parts, geom, base.unit), look.parts.liner.color, 0.7).im, lm);
  thick = g.thick;
  for (const s of ["R", "L"]) {
    const sb = core.sampleLiner(base, s, g.wing[s], g.thick), sc = core.sampleLiner(cur, s, g.wing[s], g.thick);
    offs ??= sb.meta.offs;
    const top = sb.lab.map((row) => row[row.length - 1].L);   // 띠 맨 위 칸 = 눈두덩 피부
    for (let i = 0; i < sb.lab.length; i++) {
      if (sb.meta.isWing[i]) continue;
      for (let j = 0; j < offs.length; j++) {
        const d = core.deltaE(sb.lab[i][j], sc.lab[i][j]);
        (baseL[j] ??= []).push(top[i] - sb.lab[i][j].L); (hit[j] ??= []).push(d >= th ? 1 : 0); (dE[j] ??= []).push(d);
      }
    }
  }
}
const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)], mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`# ${SET} ${ids.length}명 · ${LOOK} (가이드 두께 ${(thick * 100).toFixed(1)}%, 감지 기준 ΔE ${th}) — 눈꺼풀 줄만`);
console.log("높이(눈 폭 %) | 맨얼굴이 눈두덩 피부보다 어두운 정도(L, 중앙) | 그린 뒤 ΔE 중앙 | 감지 비율 | 그린 자리");
offs.forEach((o, j) => console.log(`${(o * 100).toFixed(1).padStart(6)} | ${med(baseL[j]).toFixed(0).padStart(4)} | ${med(dE[j]).toFixed(0).padStart(4)} | ${String(Math.round(mean(hit[j]) * 100)).padStart(3)}% | ${o >= 0 && o <= thick ? "■" : ""}`));
