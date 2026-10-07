// 입술이 입꼬리 옆으로 번진 것을 따로 잴 수 있는가 (실험 42) — 실제 화장 시험 9단계는 옆으로 번지게 칠했다 (화장한 사람 확인)
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/lip_side.mjs <사람>      (사진: work/trial/<사람>/pairs — 저장소 밖)
// 지금의 "입술선 밖"(입술 둘레 1.05~1.25배 띠 전체)과, 입꼬리 바깥 네모(입 폭의 NEAR~FAR, 위아래 ±HALF)를 단계 · 장마다 잰다
// 값 = 그 구역이 입술의 정답 변화 방향으로 바뀐 양 (입술 전체의 정답 변화 = 1). 기준 피부는 입술 둘레 1.45~1.9배 띠
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 사람 이름을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = `${DATA}/work/trial/${process.argv[2]}/pairs`;
const NEAR = Number(process.env.NEAR ?? 0.03), FAR = Number(process.env.FAR ?? 0.18), HALF = Number(process.env.HALF ?? 0.1);
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf, isHair } from "./src/core/sampling";\nexport { pointInPoly, rgbToLab } from "./src/core/color";\nexport { LM, at } from "./src/core/landmarks";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "lip-side-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "lip-side-core.mjs")).href);
const frame = (n) => { const p = PNG.sync.read(readFileSync(`${T}/${n}.png`)); return core.frameOf({ data: p.data, w: p.width, h: p.height }, JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8"))); };
const grow = (poly, k) => { const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length; return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })); };
function mean(f, inn, out = []) {
  const step = Math.max(1, Math.round(f.unit.eye / 60)), xs = inn.map((p) => p.x), ys = inn.map((p) => p.y); let L = 0, a = 0, b = 0, n = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.max(...ys)); y += step) for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.max(...xs)); x += step) {
    if (!core.pointInPoly(x, y, inn) || out.some((h) => core.pointInPoly(x, y, h)) || core.isHair(f, x, y)) continue;
    const i = (y * f.im.w + x) * 4, lab = core.rgbToLab(f.im.data[i], f.im.data[i + 1], f.im.data[i + 2]); L += lab.L; a += lab.a; b += lab.b; n++;
  }
  return [L / n, a / n, b / n];
}
const lips = (f) => core.LM.lipsOuter.map((i) => core.at(f.lm, i)), sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
// 입꼬리 바깥 네모: c = 그 쪽 입꼬리, 반대쪽 입꼬리에서 멀어지는 방향으로 입 폭의 NEAR~FAR, 수직으로 ±HALF
function sideQuad(f, k) {
  const c = core.at(f.lm, k === "R" ? 61 : 291), o = core.at(f.lm, k === "R" ? 291 : 61), w = Math.hypot(c.x - o.x, c.y - o.y), a = { x: (c.x - o.x) / w, y: (c.y - o.y) / w }, n = { x: -a.y, y: a.x };
  const p = (u, v) => ({ x: c.x + (a.x * u + n.x * v) * w, y: c.y + (a.y * u + n.y * v) * w });
  return [p(NEAR, -HALF), p(FAR, -HALF), p(FAR, HALF), p(NEAR, HALF)];
}
const zones = (f) => { const l = lips(f), ref = mean(f, grow(l, 1.9), [grow(l, 1.45)]); return { whole: sub(mean(f, l), ref), ring: sub(mean(f, grow(l, 1.25), [grow(l, 1.05)]), ref), R: sub(mean(f, sideQuad(f, "R")), ref), L: sub(mean(f, sideQuad(f, "L")), ref) }; };
const bare = zones(frame("s2k1_open_bare")), TB = existsSync(`${T}/_tbare.png`), tb = TB ? zones(frame("_tbare")) : bare;
const tg = (() => { const p = PNG.sync.read(readFileSync(`${T}/${TB ? "_target2" : "_target"}.png`)), b = frame(TB ? "_tbare" : "s2k1_open_bare"); return zones({ ...b, im: { data: p.data, w: p.width, h: p.height } }); })();
const t = sub(tg.whole, tb.whole), tn2 = dot(t, t), amt = (z, base, key) => dot(sub(z[key], base[key]), t) / tn2;
const f2 = (v) => v.toFixed(2).padStart(6), med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log(`입꼬리 바깥 네모 — 입 폭의 ${NEAR}~${FAR}, 위아래 ±${HALF} | 정답 변화 크기 ${Math.sqrt(tn2).toFixed(1)}`);
console.log(`정답사진: 입술 ${f2(amt(tg, tb, "whole"))} · 둘레 띠 ${f2(amt(tg, tb, "ring"))} · 옆 R ${f2(amt(tg, tb, "R"))} L ${f2(amt(tg, tb, "L"))}`);
for (const s of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const zs = [1, 2, 3, 4, 5].filter((k) => existsSync(`${T}/s${s}k${k}_open_made.png`)).map((k) => zones(frame(`s${s}k${k}_open_made`)));
  if (!zs.length) continue;
  const col = (key) => { const v = zs.map((z) => amt(z, bare, key)); return `${f2(med(v))} (${f2(Math.min(...v))}~${f2(Math.max(...v))})`; };
  console.log(`${s}단계: 입술 ${col("whole")} · 둘레 띠 ${col("ring")} · 옆 R ${col("R")} · L ${col("L")}`);
}
