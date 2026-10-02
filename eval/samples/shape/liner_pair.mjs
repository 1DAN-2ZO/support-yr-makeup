// 한 사람의 맨얼굴 두 장(눈 뜸 · 눈 감음)에 합성 라이너를 단계별로 칠해, 조합 채점(scoreHybrid)이 가려내는지 본다
//   PAIR_DIR=$DHE_DATA_DIR/work/liner-test OPEN=me_open CLOSED=me_closed node eval/samples/shape/liner_pair.mjs
//   (<이름>.png · <이름>.lm.json — 얼굴 점 478개 px. 사진은 저장소 밖에만 둔다)   COVER=0.9 → 더 진하게 (기본 0.7)
// 라이너는 **맨얼굴의 어두운 띠 윗경계(lidEdge) 위 피부**에 화면 가이드 윤곽 모양으로 칠한다 — 실제로 그리는 자리.
// 눈 뜬 장끼리는 섞기(liner_mix), 눈 감은 장끼리는 양 끝·획 추출(liner_closed)로 채점된다. '지금' = 앱의 지금 채점(기준선 안 옮김)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.env.PAIR_DIR) { console.error("DHE_DATA_DIR · PAIR_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), DIR = process.env.PAIR_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client");
const COVER = Number(process.env.COVER ?? 0.7), LOOK_IDS = (process.env.LOOKS ?? "edgy,chic,pure").split(",");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf } from "./src/core/sampling";',
  'export { planGuide } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { scorePart } from "./src/core/score-part";',
  'export { decide } from "./src/core/score";',
  'export { scoreHybrid, lidEdge, liftLid } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-pair-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-pair-core.mjs")).href);
const { paint } = await import(pathToFileURL(join(ROOT, "eval/samples/paint_levels.mjs")).href);

const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function lidPart(lid, u0, u1, n = 28) {
  const cum = [0]; for (let i = 1; i < lid.length; i++) cum.push(cum[i - 1] + Math.hypot(lid[i].x - lid[i - 1].x, lid[i].y - lid[i - 1].y));
  const total = cum[cum.length - 1], out = [];
  for (let k = 0; k < n; k++) { const t = (u0 + ((u1 - u0) * k) / (n - 1)) * total; let i = 1; while (i < cum.length - 1 && cum[i] < t) i++; out.push(mix(lid[i - 1], lid[i], (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1))); }
  return out;
}
function band(pts, off, tip) {
  const top = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; let n = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d }; if (n.y > 0) n = { x: -n.x, y: -n.y }; return { x: p.x + n.x * off, y: p.y + n.y * off }; });
  const poly = [...pts, ...(tip ? [tip] : []), ...top.reverse()];
  return { poly, grow: 0, test: (x, y) => inPoly(x, y, poly) };
}
// 단계 → [기대 판정, (눈꺼풀 선(눈머리 → 눈꼬리), 꼬리 [눈꼬리, 끝], 두께 px, 눈 폭) → 칠할 모양] — liner_ends.mjs 와 같다
const LEVELS = {
  ok: ["ok", (lid, w, t) => [band(lidPart(lid, 0, 1), t, w[1])]],
  mid_gap: ["ok", (lid, w, t) => [band(lidPart(lid, 0, 0.35), t), band(lidPart(lid, 0.65, 1), t, w[1])]],
  under: ["slight", (lid, w, t) => [band(lidPart(lid, 0, 0.75), t)]],
  slight: ["slight", (lid, w, t, e) => [band(lidPart(lid, 0, 1), t + 0.025 * e, w[1])]],
  wing_long: ["slight", (lid, w, t) => [band(lidPart(lid, 0, 1), t, mix(w[0], w[1], 1.5))]],
  inner_short: ["slight", (lid, w, t) => [band(lidPart(lid, 0.25, 1), t, w[1])]],
  inner_over: ["slight", (lid, w, t, e) => { const d = Math.hypot(lid[1].x - lid[0].x, lid[1].y - lid[0].y) || 1; return [band([mix(lid[0], lid[1], -(0.07 * e) / d), ...lidPart(lid, 0, 1)], t, w[1])]; }],
  heavy: ["off", (lid, w, t) => [band(lidPart(lid, 0, 1), t * 2.5, mix(w[0], w[1], 1.8))]],
};
const KO = { bare: "맨얼굴", ok: "가이드대로", mid_gap: "가운데 끊김", under: "꼬리 비움", slight: "2.5% 두껍게", wing_long: "꼬리 1.5배", inner_short: "앞쪽 비움", inner_over: "눈머리 넘김", heavy: "많이 번짐" };
const EK = { ok: "맞음", slight: "조금", off: "많이" };
const fold = (s) => (s >= 80 ? "맞음" : s >= 50 ? "조금" : "많이");
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n) => ({ im: png(join(DIR, `${n}.png`)), lm: JSON.parse(readFileSync(join(DIR, `${n}.lm.json`), "utf8")) });
const open = load(process.env.OPEN ?? "open"), closed = load(process.env.CLOSED ?? "closed");
const plan = core.resolvePlan(core.measureFace(open.lm));   // 개인화 계획은 눈 뜬 얼굴로
const short = (c) => c.replace("LINER_", "").replace(/_([RL])$/, "·$1");
const tally = { open: [0, 0], closed: [0, 0], now: [0, 0] };
for (const [key, name, ph] of [["open", "눈 뜸", open], ["closed", "눈 감음", closed]]) {
  const base = core.frameOf(ph.im, ph.lm), e = base.unit.eye;
  const lift = { R: core.lidEdge(base, "R"), L: core.lidEdge(base, "L") }, lifted = core.liftLid(base, lift);
  console.log(`\n===== ${name} (눈 폭 ${e.toFixed(0)}px) — 기준선 옮김: R ${lift.R.map((v) => (v * e).toFixed(0)).join(" ")}px · L ${lift.L.map((v) => (v * e).toFixed(0)).join(" ")}px (바깥 → 안쪽)`);
  for (const lookId of LOOK_IDS) {
    const look = core.LOOKS.find((l) => l.id === lookId), guide = core.planGuide(look.parts, plan), g = guide("liner", lifted).liner, color = look.parts.liner.color, o = { templateColor: color };
    console.log(`\n[${lookId}] 가이드 두께 ${(g.thick * e).toFixed(0)}px · 색 ${color}`);
    console.log("단계 (기대)          | 조합: 판정 점수 · 지적                                   | 지금: 판정 점수");
    for (const level of ["bare", ...Object.keys(LEVELS)]) {
      const shapes = level === "bare" ? [] : ["R", "L"].flatMap((s) => LEVELS[level][1]((s === "R" ? core.LM.eyeA : core.LM.eyeB).upper.map((i) => lifted.lm[i]).reverse(), g.wing[s], g.thick * e, e));
      const cur = core.frameOf(level === "bare" ? ph.im : paint(ph.im, shapes, color, COVER).im, ph.lm);
      const h = core.scoreHybrid("liner", base, cur, guide, o), dh = core.decide("liner", h.result, h.ctx);
      const a = core.scorePart("liner", base, cur, guide, o), da = core.decide("liner", a.result, a.ctx);
      const exp = LEVELS[level]?.[0], say = (d) => (d.status === "scored" ? `${fold(d.score)} ${String(d.score).padStart(3)}` : `확인만(${d.reason})`);
      const hit = (d) => (level === "bare" ? d.status !== "scored" : d.status === "scored" && fold(d.score) === EK[exp]);
      tally[key][1]++; if (hit(dh)) tally[key][0]++;
      tally.now[1]++; if (hit(da)) tally.now[0]++;
      const codes = [...h.result.codes, ...(h.result.metrics?.endCodes ?? [])].map(short).join(" ");
      console.log(`${(KO[level] + (exp ? ` (${EK[exp]})` : " (점수 없음)")).padEnd(16)} | ${hit(dh) ? "O" : "X"} ${say(dh).padEnd(14)} ${codes.padEnd(46)} | ${hit(da) ? "O" : "X"} ${say(da)}`);
    }
  }
}
console.log(`\n기대와 같은 칸: 눈 뜸·조합 ${tally.open[0]}/${tally.open[1]} · 눈 감음·조합 ${tally.closed[0]}/${tally.closed[1]} · 지금 채점(두 눈 상태 합) ${tally.now[0]}/${tally.now[1]}`);
