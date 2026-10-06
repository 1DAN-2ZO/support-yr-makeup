// 피드백 문장 뽑기 시험 — 정답 그림 대 시도사진에서 부위별로 "어느 부분이 어떻게 됐나" (실험 22, 점수 없음)
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/whole_feedback.mjs
//   사진: $DHE_DATA_DIR/work/final-whole/ (저장소 밖 · final_whole.py 가 만든다) — whole_score.mjs 와 같은 사진 + 섀도우 위로 더 · 한쪽만
// 전부 규칙이다 (모델 없음):
//   입술    입술 다각형 평균 색 − 둘레 피부 띠 평균 색. 그 값이 맨얼굴에서 얼마나 바뀌었나를 정답 그림과 견준다 (scoreWhole)
//   섀도우  눈두덩을 얼굴 점으로 눈마다 6구역(바깥 · 가운데 · 안쪽 × 아래 · 위)으로 나눈다. 기준 피부는 눈 가까운 피부.
//           (기준 피부는 REF 로 바꿔 볼 수 있다 — 기본 near = 눈썹 바로 아래 띠 + 눈꼬리 바깥. 이마(fore)는 조명 방향에 따라 눈두덩과 따로 놀았다)
//           정답 그림에서 바뀐 구역 = 칠할 자리. 칠할 자리의 평균 양 → 안 함 / 옅음 / 진함 / 색 다름 / 잘 됨,
//           칠할 자리인데 안 바뀐 구역 → 비었어요, 칠할 자리가 아닌데 바뀐 구역 → 더 칠했어요, 좌우 양의 차 → 한쪽이 옅어요
// 시도사진의 얼굴 점은 그 사진에서 뽑은 것을 그대로 쓴다 (실험 21: 맨얼굴 점을 옮겨 쓰는 것보다 낫다)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = (process.env.WHOLE_WORK ?? join(DATA, "work/final-whole")).replaceAll("\\", "/");
const IDS = (process.env.WHOLE_IDS ?? "4,2,1").split(",");   // 다른 묶음: WHOLE_WORK · WHOLE_IDS (final_whole.py 와 같게)
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { scoreWhole, wholeContrast, WHOLE } from "./src/core/score-shape";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "whole-feedback-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "whole-feedback-core.mjs")).href);

const LM = core.LM, W = core.WHOLE, png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n) => ({ im: png(`${T}/${n}.png`), lm: JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8")) });
const pts = (f, ids) => ids.map((i) => f.lm[i]);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(...a), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN), meanV = (vs) => [0, 1, 2].map((i) => mean(vs.map((v) => v[i])));

// ── 섀도우 구역 ── 눈마다 6개: 윗눈꺼풀 선에서 눈썹 아래 선까지를 비율로 자른다
const SIDES = { R: [LM.eyeA, LM.browA], L: [LM.eyeB, LM.browB] }, COLS = { 바깥쪽: [0, 3], 가운데: [3, 5], 안쪽: [5, 8] }, ROWS = { 아래: [0.1, 0.4], 위: [0.4, 0.75] };
const ZONE = { paint: 6, blank: 4, miss: 0.25, over: Number(process.env.OVER ?? 0.4), lr: 0.4 };   // 칠할 자리로 보는 정답 변화 · 안 칠한 자리 · 비었다 · 넘쳤다 · 좌우 차
function zonesOf(f, side) {
  const [e, b] = SIDES[side], lid = pts(f, e.upper), lo = pts(f, b.lower), up = pts(f, b.upper);
  const browAt = (i) => { const u = (i / (lid.length - 1)) * (lo.length - 1), k = Math.min(lo.length - 2, Math.floor(u)); return mix(lo[k], lo[k + 1], u - k); };
  const P = (i, t) => mix(lid[i], browAt(i), t), eye = f.unit.eye;
  // 기준 피부 (REF): fore 눈썹 위 이마 · brow 눈썹 바로 아래 띠 · temple 눈꼬리 바깥 관자놀이 쪽 · near = brow + temple
  const all = lid.map((_, i) => i), dir = Math.sign(lid[0].x - lid[lid.length - 1].x), oc = lid[0];
  const REFS = {
    fore: [[...up.map((p) => ({ x: p.x, y: p.y - eye * 0.3 })), ...up.map((p) => ({ x: p.x, y: p.y - eye * 0.6 })).reverse()]],
    brow: [[...all.map((i) => P(i, 0.82)), ...all.map((i) => P(i, 0.98)).reverse()]],
    temple: [[{ x: oc.x + dir * eye * 0.25, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y + eye * 0.1 }, { x: oc.x + dir * eye * 0.25, y: oc.y + eye * 0.1 }]],
  };
  REFS.near = [...REFS.brow, ...REFS.temple];
  const ref = REFS[process.env.REF ?? "near"];
  const out = [];
  for (const [col, [i0, i1]] of Object.entries(COLS)) for (const [row, [t0, t1]] of Object.entries(ROWS)) {
    const idx = Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k);
    out.push({ col, row, regions: () => ({ polys: [[...idx.map((i) => P(i, t0)), ...idx.map((i) => P(i, t1)).reverse()]], ref }) });
  }
  return out;
}
/** 구역마다 정답 변화 t · 시도 변화 d (기준 피부 대비 Lab) */
function shadowZones(bare, target, cur) {
  const out = [];
  for (const side of ["R", "L"]) {
    const zb = zonesOf(bare, side), zc = zonesOf(cur, side);
    zb.forEach((z, i) => {
      const b = core.wholeContrast(bare, z.regions), tg = core.wholeContrast(target, z.regions), c = core.wholeContrast(cur, zc[i].regions);
      const ch = (v) => (process.env.CH ? [0, v[1], v[2]] : v);   // CH=1 이면 밝기를 빼고 색만
      if (b && tg && c) out.push({ side, col: z.col, row: z.row, t: ch(sub(tg, b)), d: ch(sub(c, b)) });
    });
  }
  return out;
}
function shadowFeedback(zs) {
  const paint = zs.filter((z) => len(z.t) >= ZONE.paint), blank = zs.filter((z) => len(z.t) < ZONE.blank);
  if (paint.length < 2) return { say: ["확인만 (정답 그림의 섀도우가 옅어요)"], num: "" };
  const T = meanV(paint.map((z) => z.t)), amt = (z) => dot(z.d, z.t) / dot(z.t, z.t), sideAmt = (s) => mean(paint.filter((z) => z.side === s).map(amt));
  const all = mean(paint.map(amt)), D = meanV(paint.map((z) => z.d)), cos = dot(D, T) / (len(D) * len(T) || 1), aR = sideAmt("R"), aL = sideAmt("L");
  const over = blank.filter((z) => dot(z.d, T) / dot(T, T) >= ZONE.over);
  const say = [], where = (list) => [...new Set(list.map((z) => `${z.side === "R" ? "오른쪽" : "왼쪽"} 눈 ${z.col} ${z.row}`))].join(", ");
  const lr = Math.abs(aR - aL) >= ZONE.lr && Math.max(aR, aL) >= W.none;
  if (Math.max(aR, aL) < W.none) say.push("섀도우를 안 했어요");
  else {
    if (lr) say.push(`${aR < aL ? "오른쪽" : "왼쪽"} 눈이 ${Math.min(aR, aL) < W.none ? "비었어요" : "더 옅어요"}`);
    const base = lr ? Math.max(aR, aL) : all;
    if (cos < W.minCos) say.push("색이 정답과 달라요");
    else if (base < W.weak) say.push("정답보다 옅어요");
    else if (base > W.strong) say.push("정답보다 진해요");
    else if (!lr) say.push("잘 됐어요");
    const miss = lr ? [] : paint.filter((z) => amt(z) < ZONE.miss);
    if (miss.length && miss.length < paint.length) say.push(`${where(miss)}가 비었어요`);
  }
  if (over.length) say.push(`${where(over)}까지 더 칠했어요`);
  return { say, num: `양 오 ${aR.toFixed(2)} 왼 ${aL.toFixed(2)} · 색 ${cos.toFixed(2)} · 칠할 구역 ${paint.length} · 넘친 구역 ${over.length}/${blank.length}` };
}
const LIP_SAY = { similar: "잘 됐어요", none: "입술을 안 발랐어요", weak: "정답보다 옅어요", strong: "정답보다 진해요", color: "색이 정답과 달라요", check_only: "확인만 (정답 그림의 입술이 옅어요)" };
const lipRegions = (f) => ({ polys: [pts(f, LM.lipsOuter)] });

// NOISE=1: 아무것도 안 그린 사진 쌍에서 섀도우 구역 값이 얼마나 흔들리나 (눈 뜬 쌍 · 눈 감은 쌍). WHOLE_WORK = <id>_{open,closed}_{bare,made}.png 가 있는 폴더, WHOLE_IDS = id 들
if (process.env.NOISE) {
  console.log("아무것도 안 그린 쌍의 구역 변화 크기 (Lab 거리, 0 이어야 한다) — 눈마다 바깥 · 가운데 · 안쪽 × 아래 · 위");
  for (const st of ["open", "closed"]) {
    const all = [];
    for (const id of IDS) {
      const bb = load(`${id}_${st}_bare`), mm = load(`${id}_${st}_made`), fb = core.frameOf(bb.im, bb.lm), fm = core.frameOf(mm.im, mm.lm);
      const zs = shadowZones(fb, fb, fm).map((z) => ({ ...z, n: len(z.d) }));
      all.push(...zs);
      console.log(`  ${st === "open" ? "눈 뜬" : "눈 감은"} ${id}: ` + ["R", "L"].map((sd) => `${sd === "R" ? "오" : "왼"} ` + zs.filter((z) => z.side === sd).map((z) => z.n.toFixed(1)).join(" ")).join(" | "));
    }
    const of = (row) => all.filter((z) => z.row === row).map((z) => z.n), mx = (v) => Math.max(...v);
    console.log(`  => ${st === "open" ? "눈 뜬" : "눈 감은"} 쌍: 아래 구역 평균 ${mean(of("아래")).toFixed(1)} · 최대 ${mx(of("아래")).toFixed(1)} | 위 구역 평균 ${mean(of("위")).toFixed(1)} · 최대 ${mx(of("위")).toFixed(1)}`);
  }
  process.exit(0);
}
const b = load("_bare"), bare = core.frameOf(b.im, b.lm), target = core.frameOf(png(`${T}/_made.png`), b.lm);
const zt = shadowZones(bare, target, target);
console.log("정답 그림의 섀도우 구역별 변화 크기 (6 이상 = 칠할 자리, 4 미만 = 안 칠한 자리):");
for (const s of ["R", "L"]) console.log(`  ${s === "R" ? "오른쪽" : "왼쪽"} 눈: ` + zt.filter((z) => z.side === s).map((z) => `${z.col} ${z.row} ${len(z.t).toFixed(1)}`).join(" · "));
// 눈썹: 좌우 눈썹 다각형(위 · 아래 선)의 평균 색 − 둘레 피부(눈은 뺌). 양쪽 합친 양으로 했나 · 옅은가 · 진한가, 좌우를 따로 재서 한쪽이 옅은가
const browPoly = (f, b) => [...pts(f, b.upper), ...pts(f, b.lower).reverse()], eyeAll = (f) => [LM.eyeA, LM.eyeB].map((e) => [...pts(f, e.upper), ...pts(f, e.lower).reverse()]);
const browRegions = (sides) => (f) => ({ polys: sides.map((k) => browPoly(f, k === "R" ? LM.browA : LM.browB)), avoid: eyeAll(f) });
const BROW_SAY = { similar: "잘 됐어요", none: "눈썹을 안 그렸어요", weak: "정답보다 옅어요", strong: "정답보다 진해요", color: "색이 정답과 달라요", check_only: "확인만 (정답 그림의 눈썹이 맨얼굴과 거의 같아요)" };
function browFeedback(bare, target, cur) {
  const all = core.scoreWhole(bare, target, cur, browRegions(["R", "L"])), r = core.scoreWhole(bare, target, cur, browRegions(["R"])), l = core.scoreWhole(bare, target, cur, browRegions(["L"]));
  const say = [BROW_SAY[all.verdict]], num = all.amount == null ? `정답 크기 ${all.target.toFixed(1)}` : `양 ${all.amount.toFixed(2)} (오 ${r.amount?.toFixed(2)} 왼 ${l.amount?.toFixed(2)}) · 색 ${all.cos.toFixed(2)} · 정답 크기 ${all.target.toFixed(1)}`;
  if (r.amount != null && l.amount != null && Math.abs(r.amount - l.amount) >= ZONE.lr && Math.max(r.amount, l.amount) >= W.none) {
    say.length = 0; say.push(`${r.amount < l.amount ? "오른쪽" : "왼쪽"} 눈썹이 ${Math.min(r.amount, l.amount) < W.none ? "비었어요" : "더 옅어요"}`);
  }
  return { say, num };
}
const BROW = process.env.WHOLE_CASES === "brow";
const CASES = BROW ? ["bare", "1", "2", "3", "4"] : ["bare", "1", "2", "3", "6", "7"], NAMES = BROW ? ["아무것도 안 함 (진짜 맨얼굴)", "정답대로", "눈썹 안 그림", "눈썹 옅게", "눈썹 오른쪽만"] : ["아무것도 안 함 (진짜 맨얼굴)", "정답대로", "입술 빼먹음", "섀도우 색 다름", "섀도우 위로 더 칠함", "섀도우 오른쪽 눈만"];
for (const n of IDS) {
  console.log(`\n===== 사진 ${n}${process.env.WHOLE_WORK ? "" : ` (${{ 4: "같은 자리 가로", 2: "집 낮", 1: "학원" }[n]})`}`);
  CASES.forEach((c, i) => {
    if (!existsSync(`${T}/c${n}_${c}.png`)) return;
    const m = load(`c${n}_${c}`), cur = core.frameOf(m.im, m.lm);
    const lip = core.scoreWhole(bare, target, cur, lipRegions), sh = shadowFeedback(shadowZones(bare, target, cur));
    if (BROW) { const bw = browFeedback(bare, target, cur); console.log(`  ${NAMES[i].padEnd(22)} 눈썹: ${bw.say.join(' · ').padEnd(16)} (${bw.num})`); return; }
    if (process.env.SUM) { console.log(`  ${NAMES[i].padEnd(20)} ${sh.num.slice(0, 22)} | ${sh.say.join(' · ')}`); return; }
    console.log(`[${NAMES[i]}]`);
    console.log(`   입술: ${LIP_SAY[lip.verdict]}${lip.amount == null ? "" : `   (양 ${lip.amount.toFixed(2)} · 색 ${lip.cos.toFixed(2)})`}`);
    console.log(`   섀도우: ${sh.say.join(" · ")}   (${sh.num})`);
  });
}
