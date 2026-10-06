// 입술 범위 — 입술을 구역으로 나눠 정답 그림과 견준다 (실험 34). 입술선 밖으로 나갔나 · 가장자리까지 채웠나 · 윗입술/아랫입술
//   DHE_DATA_DIR=D:/nudy-data WHOLE_WORK=<폴더> WHOLE_IDS=2,3,4 node eval/samples/shape/lip_zones.mjs
//   사진: final_whole.py (WHOLE_CASES=lip) 가 만든 것 — _bare · _made · c<id>_bare · c<id>_1..4 (그대로 · 입술선 밖으로 · 가운데만 · 아랫입술만)
// 구역 (각 사진의 얼굴 점으로): 입술 바깥선을 가운데 기준으로 줄이고 늘려서 만든다
//   안쪽 = 0.7배 안 · 가장자리 = 0.7배 ~ 1배 · 바깥 띠 = 1.05 ~ 1.25배 · 기준 피부 = 1.45 ~ 1.9배 · 위/아래 = 입꼬리를 잇는 선의 위 · 아래
// 값 = 구역 평균 색 − 기준 피부, 그것이 맨얼굴에서 바뀐 양을 정답 그림의 입술 전체 변화 방향으로 잰 것 (1 = 정답 입술만큼)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.env.WHOLE_WORK) { console.error("DHE_DATA_DIR · WHOLE_WORK 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = process.env.WHOLE_WORK.replaceAll("\\", "/"), IDS = (process.env.WHOLE_IDS ?? "2,3,4").split(",");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { rgbToLab, pointInPoly } from "./src/core/color";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "lip-zones-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "lip-zones-core.mjs")).href);

const LM = core.LM, png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n, lmFrom = n) => core.frameOf(png(`${T}/${n}.png`), JSON.parse(readFileSync(`${T}/${lmFrom}.lm.json`, "utf8")));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const ZONES = ["전체", "안쪽", "가장자리", "바깥 띠", "윗입술", "아랫입술"];

/** 구역마다 (평균 Lab − 기준 피부 평균 Lab) */
function zones(f) {
  const O = LM.lipsOuter.map((i) => f.lm[i]), cx = O.reduce((s, p) => s + p.x, 0) / O.length, cy = O.reduce((s, p) => s + p.y, 0) / O.length;
  const sc = (k) => O.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })), S = Object.fromEntries([0.7, 1, 1.05, 1.25, 1.45, 1.9].map((k) => [k, sc(k)]));
  const inP = (k, x, y) => core.pointInPoly(x, y, S[k]);
  const a = f.lm[61], b = f.lm[291], below = (x, y) => (y - a.y) * (b.x - a.x) - (x - a.x) * (b.y - a.y) > 0 === (b.x > a.x);
  const test = {
    전체: (x, y) => inP(1, x, y), 안쪽: (x, y) => inP(0.7, x, y), 가장자리: (x, y) => inP(1, x, y) && !inP(0.7, x, y), "바깥 띠": (x, y) => inP(1.25, x, y) && !inP(1.05, x, y),
    윗입술: (x, y) => inP(1, x, y) && !below(x, y), 아랫입술: (x, y) => inP(1, x, y) && below(x, y), 기준: (x, y) => inP(1.9, x, y) && !inP(1.45, x, y),
  };
  const xs = S[1.9].map((p) => p.x), ys = S[1.9].map((p) => p.y), acc = Object.fromEntries(Object.keys(test).map((k) => [k, [0, 0, 0, 0]]));
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.max(...ys)); y++) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.max(...xs)); x++) {
    const i = (y * f.im.w + x) * 4, lab = core.rgbToLab(f.im.data[i], f.im.data[i + 1], f.im.data[i + 2]);
    for (const k in test) if (test[k](x, y)) { const q = acc[k]; q[0] += lab.L; q[1] += lab.a; q[2] += lab.b; q[3]++; }
  }
  const mean = (k) => acc[k].slice(0, 3).map((v) => v / Math.max(1, acc[k][3])), ref = mean("기준");
  return Object.fromEntries(ZONES.map((k) => [k, sub(mean(k), ref)]));
}
const bare = load("_bare"), zb = zones(bare), zt = zones(load("_made", "_bare")), T0 = sub(zt["전체"], zb["전체"]), tn2 = dot(T0, T0);
const amt = (z) => Object.fromEntries(ZONES.map((k) => [k, dot(sub(z[k], zb[k]), T0) / tn2]));
const row = (name, a) => `${name.padEnd(24)}` + ZONES.map((k) => a[k].toFixed(2).padStart(7)).join("");
console.log(`정답 입술 변화의 크기 ${Math.sqrt(tn2).toFixed(1)}`);
console.log("".padEnd(24) + ZONES.map((k) => k.padStart(7 - Math.max(0, k.length - 3))).join(""));
console.log(row("정답 그림", amt(zt)));
const CASES = ["bare", "1", "2", "3", "4"], NAMES = ["아무것도 안 함 (맨얼굴)", "정답대로", "입술선 밖으로", "가운데만", "아랫입술만"];
for (const n of IDS) {
  console.log(`-- 사진 ${n}`);
  CASES.forEach((c, i) => { if (existsSync(`${T}/c${n}_${c}.png`)) console.log(row(NAMES[i], amt(zones(load(`c${n}_${c}`))))); });
}
