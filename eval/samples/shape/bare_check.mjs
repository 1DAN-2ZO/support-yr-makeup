// 맨얼굴 묶음 두 개(FFHQ 동양인 · EasyPortrait)를 **같은 방법으로** 나란히 — 정답 마스크를 쓰지 않는다
//   SET=ffhq node eval/samples/shape/bare_check.mjs   ($DHE_DATA_DIR/samples/ffhq-east-asian-all — ffhq_east_asian.py --set all --landmarks, jpg → png)
//   SET=ep   node eval/samples/shape/bare_check.mjs   ($DHE_DATA_DIR/easyportrait/work)
//   ONLY=sel30|pool → FFHQ 목록(ffhq_east_asian.csv)의 그 묶음만 (sel30 = 눈으로 확인한 맨얼굴, pool = 안 본 것 — 화장 잔여·옆얼굴 섞임)
//   SCALE=0.54 → 사진·얼굴 점을 그 배율로 줄여서 (해상도 차이 가르기) · BANGS=0 → 앞머리 얼굴도 빼지 않고
// 아무것도 안 그린 얼굴에서: 눈썹 결과 모양 점수·지적 / 라이너 꼬리 / 입술·섀도우·볼을 "발랐다"고 읽는 비율 / 갈림 규칙
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname as _dn, resolve as _rs } from "node:path";
import { fileURLToPath as _fu } from "node:url";
const ROOT = _rs(_dn(_fu(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/");
const SET = process.env.SET ?? "ffhq";
const CLIENT = join(ROOT, "client"), W = join(DATA, SET === "ep" ? "easyportrait/work" : "samples/ffhq-east-asian-all");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf, sampleLiner, boxOf, labBox } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { shapeFill, browShape, linerBand, tintFill, routeOf } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "core7.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "core7.mjs")).href);
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const chic = core.LOOKS.find((l) => l.id === "chic");
const q = (v, p) => v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))];
const pct = (v) => (v * 100).toFixed(0);
// 앞머리: 눈썹 테두리 위쪽(눈 폭 0.3~0.6)에 둘레 피부보다 훨씬 어두운 칸(L 20 이상)이 30% 넘으면 그 얼굴은 눈썹 계산에서 뺀다 (마스크 없이)
const bangs = (f, poly, skin) => {
  const box = core.boxOf(f.unit.eye), e = f.unit.eye, xs = poly.map((p) => p.x), top = Math.min(...poly.map((p) => p.y)); let n = 0, dark = 0;
  for (let y = top - 0.6 * e; y <= top - 0.3 * e; y += box) for (let x = Math.min(...xs); x <= Math.max(...xs); x += box) { if (y < 0) continue; n++; if (skin.L - core.labBox(f.im, x, y, box).L >= 20) dark++; }
  return n > 0 && dark / n > 0.3;
};
const SCALE = Number(process.env.SCALE ?? 1), BANGS = process.env.BANGS !== "0";
// 칸 평균으로 줄이기 (폰 카메라가 작게 찍은 것에 가깝게)
const shrink = (im, k) => {
  const w = Math.round(im.w * k), h = Math.round(im.h * k), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x / k), x1 = Math.min(im.w, Math.max(x0 + 1, Math.floor((x + 1) / k))), y0 = Math.floor(y / k), y1 = Math.min(im.h, Math.max(y0 + 1, Math.floor((y + 1) / k)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * im.w + xx) * 4; r += im.data[i]; g += im.data[i + 1]; b += im.data[i + 2]; n++; }
    const o = (y * w + x) * 4; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255;
  }
  return { data: d, w, h };
};
const ONLY = SET === "ep" ? "" : process.env.ONLY ?? "";
const only = ONLY ? new Set(readFileSync(join(ROOT, "eval/samples/ffhq_east_asian.csv"), "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(",")).filter((c) => c[4] === ONLY).map((c) => `ea_${c[0]}`)) : null;
const ids = readdirSync(W).filter((f) => f.endsWith(".lm.json")).map((f) => f.slice(0, -8)).filter((id) => existsSync(join(W, `${id}.png`))).filter((id) => !only || only.has(id)).sort();
const eyeW = [], cover = [], tailC = [], spill = [], scores = [], codeFaces = new Map(), wing = [], thick = [];
const tint = new Map(), route = new Map(); const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1), push = (k, v) => tint.set(k, [...(tint.get(k) ?? []), v]);
let browFaces = 0, hairy = 0;
for (const id of ids) {
  const p = PNG.sync.read(readFileSync(join(W, `${id}.png`)));
  let im = { data: p.data, w: p.width, h: p.height }, lm = JSON.parse(readFileSync(join(W, `${id}.lm.json`), "utf8"));
  if (SCALE !== 1) { im = shrink(im, SCALE); lm = lm.map((q) => ({ x: q.x * SCALE, y: q.y * SCALE })); }
  const f = core.frameOf(im, lm), plan = core.resolvePlan(core.measureFace(lm)), guide = core.planGuide(chic.parts, plan);
  eyeW.push(f.unit.eye);
  // 눈썹
  const reg = guide("brow", f).regions;
  if (reg) {
    const mid = { x: (lm[133].x + lm[362].x) / 2, y: (lm[133].y + lm[362].y) / 2 };
    const fill = { R: core.shapeFill(f, reg.R, undefined, mid), L: core.shapeFill(f, reg.L, undefined, mid) };
    if (!fill.R.skin || !fill.L.skin || (BANGS && (bangs(f, reg.R, fill.R.skin) || bangs(f, reg.L, fill.L.skin)))) hairy++;
    else {
      browFaces++;
      for (const s of ["R", "L"]) { cover.push(fill[s].coverage); spill.push(fill[s].spill); if (fill[s].tailCoverage != null) tailC.push(fill[s].tailCoverage); }
      const res = core.browShape(f, reg);
      if (res.score != null) scores.push(res.score);
      for (const c of new Set(res.codes.map((c) => c.replace(/_[RL]$/, "")))) inc(codeFaces, c);
    }
  }
  // 라이너
  const g = guide("liner", f).liner;
  for (const s of ["R", "L"]) { const b = core.linerBand(core.sampleLiner(f, s, g.wing[s], g.thick)); wing.push(b.wingCoverage); thick.push(b.thickness * 100); }
  // 입술·섀도우·볼 — 맨얼굴인데 "발랐다"(50% 이상 물듦)로 읽는 비율 · 갈림
  const lips = core.LM.lipsOuter.map((i) => lm[i]), inner = LIP_INNER.map((i) => lm[i]);
  for (const look of core.LOOKS) {
    const lg = core.planGuide(look.parts, plan);
    push(`lip|${look.id}`, core.tintFill(f, lips, look.parts.lip.color, { hole: inner }).coverage);
    inc(route, `lip|${look.id}|${core.routeOf(f, lips, look.parts.lip.color, { hole: inner })}`);
    for (const part of ["shadow", "cheek"]) { const rg = lg(part, f).regions; for (const s of ["R", "L"]) { push(`${part}|${look.id}`, core.tintFill(f, rg[s], look.parts[part].color).coverage); inc(route, `${part}|${look.id}|${core.routeOf(f, rg[s], look.parts[part].color)}`); } }
  }
}
console.log(`# ${SET === "ep" ? "EasyPortrait" : `FFHQ 동양인${ONLY ? ` (${ONLY})` : ""}`} 맨얼굴 ${ids.length}장${SCALE !== 1 ? ` (×${SCALE} 로 줄임)` : ""} · 눈 폭 중앙 ${q(eyeW, 0.5).toFixed(0)}px (하위 10% ${q(eyeW, 0.1).toFixed(0)}px) — 정답 마스크 없이`);
console.log(`\n## 눈썹 (앞머리로 뺀 ${hairy}명 → ${browFaces}명)`);
console.log(`원래 눈썹이 표준 테두리를 채운 정도(추정): 중앙 ${pct(q(cover, 0.5))}% · ` + [0.3, 0.5, 0.7, 0.9].map((t) => `${t * 100}% 이상 ${pct(cover.filter((v) => v >= t).length / cover.length)}%`).join(" · ") + ` · 꼬리 채움 중앙 ${pct(q(tailC, 0.5))}%`);
console.log(`넘침(테두리 바로 밖 띠, 추정): 중앙 ${pct(q(spill, 0.5))}% · 30% 넘는 눈썹 ${pct(spill.filter((v) => v > 0.3).length / spill.length)}%`);
console.log(`결과 모양 눈썹 점수(아무것도 안 그림): 중앙 ${q(scores, 0.5)} · 하위 10% ${q(scores, 0.1)} · 상위 10% ${q(scores, 0.9)} | 80점 이상 ${pct(scores.filter((s) => s >= 80).length / browFaces)}% · 50~79 ${pct(scores.filter((s) => s >= 50 && s < 80).length / browFaces)}% · 50 미만 ${pct(scores.filter((s) => s < 50).length / browFaces)}%`);
console.log("지적이 뜬 얼굴: " + [...codeFaces].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / browFaces)}%`).join(" · "));
console.log(`\n## 라이너 (눈 ${wing.length}개, 거르지 않음)`);
console.log(`꼬리 채움: 0% 인 눈 ${pct(wing.filter((v) => v === 0).length / wing.length)}% · 30% 넘는 눈 ${pct(wing.filter((v) => v > 0.3).length / wing.length)}% · 50% 넘는 눈 ${pct(wing.filter((v) => v > 0.5).length / wing.length)}% · 80% 넘는 눈 ${pct(wing.filter((v) => v > 0.8).length / wing.length)}% | 어두운 띠 두께(눈 폭 %) 중앙 ${q(thick, 0.5).toFixed(1)} · 상위 10% ${q(thick, 0.9).toFixed(1)}`);
console.log(`\n## 입술·섀도우·볼 — 화장별 [맨얼굴을 발랐다고 읽는 비율 %] / [갈림: 결과모양·원본대조·확인만 %]`);
const tot = { lip: [0, 0, 0], shadow: [0, 0, 0], cheek: [0, 0, 0] };
for (const look of core.LOOKS) {
  const cell = (part) => { const xs = tint.get(`${part}|${look.id}`), v = ["shape", "compare", "check_only"].map((k) => route.get(`${part}|${look.id}|${k}`) ?? 0), n = v.reduce((a, b) => a + b, 0) || 1; v.forEach((x, i) => tot[part][i] += x); return `${pct(xs.filter((c) => c >= 0.5).length / xs.length).padStart(3)} / ${v.map((x) => String(Math.round(x / n * 100)).padStart(3)).join("·")}`; };
  console.log(`${(look.id + " " + look.name).padEnd(16)} | 입술 ${cell("lip")} | 섀도우 ${cell("shadow")} | 볼 ${cell("cheek")}`);
}
console.log("갈림 전체       | " + ["lip", "shadow", "cheek"].map((p) => { const n = tot[p].reduce((a, b) => a + b, 0); return tot[p].map((x) => String(Math.round(x / n * 100)).padStart(3)).join("·"); }).join(" | "));
