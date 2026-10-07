// 실제 화장 시험 — 단계마다 부위가 맨얼굴에서 얼마나 바뀌었나 (정답사진 없이 볼 수 있는 것, 실험 38)
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/trial_stages.mjs <사람>        (사진: work/trial/<사람>/pairs — 저장소 밖)
//   s<단계>k<장>_{open,closed}_{bare,made}.png + .lm.json : 맨얼굴 = 1단계 첫 장, made = 그 단계의 다섯 장
// 정답사진이 없어 feedbackWhole 은 못 돌린다. 대신 '그 부위에 변화가 생긴 단계가 실제로 화장한 단계와 맞는가'를 본다:
//   값 = (부위 평균 Lab − 기준 피부 평균 Lab) 이 맨얼굴에서 바뀐 크기(Lab 거리). 단계마다 다섯 장의 가운데 값.
//   입술 · 눈썹(좌우) = 둘레 띠 기준 (scoreWhole 과 같은 재는 법) · 섀도우(좌우) = 눈두덩 아래 구역, 기준은 눈썹 바로 아래 띠 + 눈꼬리 바깥
//   2단계(아무것도 안 하고 다시 찍음)의 값이 이 사람 · 이 자리의 흔들림이다
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 사람 이름을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = `${DATA}/work/trial/${process.argv[2]}/pairs`;
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { wholeContrast } from "./src/core/score-shape";',
  'export { shotCondition } from "./src/core/feedback-whole";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "trial-stages-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "trial-stages-core.mjs")).href);
const LM = core.LM, load = (n) => { const p = PNG.sync.read(readFileSync(`${T}/${n}.png`)); return core.frameOf({ data: p.data, w: p.width, h: p.height }, JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8"))); };
const pts = (f, ids) => ids.map((i) => f.lm[i]), mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : NaN; };
const EYE = { R: LM.eyeA, L: LM.eyeB }, BROW = { R: LM.browA, L: LM.browB };
const eyePoly = (f, k) => [...pts(f, EYE[k].upper), ...pts(f, EYE[k].lower).reverse()], browPoly = (f, k) => [...pts(f, BROW[k].upper), ...pts(f, BROW[k].lower).reverse()];
function lid(f, k) {
  const up = pts(f, EYE[k].upper), lo = pts(f, BROW[k].lower), eye = f.unit.eye, idx = up.map((_, i) => i);
  const browAt = (i) => { const u = (i / (up.length - 1)) * (lo.length - 1), j = Math.min(lo.length - 2, Math.floor(u)); return mix(lo[j], lo[j + 1], u - j); }, P = (i, t) => mix(up[i], browAt(i), t);
  const dir = Math.sign(up[0].x - up[up.length - 1].x), oc = up[0];
  return { polys: [[...idx.map((i) => P(i, 0.1)), ...idx.map((i) => P(i, 0.4)).reverse()]],
    ref: [[...idx.map((i) => P(i, 0.82)), ...idx.map((i) => P(i, 0.98)).reverse()], [{ x: oc.x + dir * eye * 0.25, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y + eye * 0.1 }, { x: oc.x + dir * eye * 0.25, y: oc.y + eye * 0.1 }]] };
}
const PARTS = {
  "입술": (f) => ({ polys: [pts(f, LM.lipsOuter)] }),
  "눈썹 R": (f) => ({ polys: [browPoly(f, "R")], avoid: [eyePoly(f, "R"), eyePoly(f, "L")] }), "눈썹 L": (f) => ({ polys: [browPoly(f, "L")], avoid: [eyePoly(f, "R"), eyePoly(f, "L")] }),
  "섀도우 R": (f) => lid(f, "R"), "섀도우 L": (f) => lid(f, "L"),
};
const NAME = { 2: "2 맨얼굴 다시", 3: "3 눈썹만", 4: "4 섀도우 한쪽", 5: "5 섀도우 양쪽", 6: "6 라이너 한쪽", 7: "7 라이너 양쪽", 8: "8 완성(입술)", 9: "9 입술선 밖" };
const WORD = { light: "밝기", size: "얼굴 크기", pose: "고개 각도" };
const keys = Object.keys(PARTS);
console.log("값 = 맨얼굴에서 바뀐 크기 (Lab 거리, 다섯 장의 가운데 값). R = 사진에서 왼쪽에 보이는 눈(본인 오른쪽)");
console.log("단계".padEnd(16) + keys.map((k) => k.padStart(9)).join("") + "   사진 조건 (5장)");
for (const s of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const shots = [1, 2, 3, 4, 5].filter((k) => existsSync(`${T}/s${s}k${k}_open_made.png`));
  if (!shots.length) continue;
  const vals = Object.fromEntries(keys.map((k) => [k, []])), cond = [];
  for (const k of shots) {
    const b = load(`s${s}k${k}_open_bare`), c = load(`s${s}k${k}_open_made`);
    cond.push(core.shotCondition(b, c));
    for (const key of keys) { const x = core.wholeContrast(b, PARTS[key]), y = core.wholeContrast(c, PARTS[key]); if (x && y) vals[key].push(Math.hypot(y[0] - x[0], y[1] - x[1], y[2] - x[2])); }
  }
  const bad = cond.filter(Boolean);
  console.log(NAME[s].padEnd(14) + keys.map((k) => med(vals[k]).toFixed(1).padStart(10)).join("") + `   ${bad.length ? `${bad.length}장 걸림 (${[...new Set(bad.map((x) => WORD[x]))].join(" · ")})` : "모두 통과"}`);
}
