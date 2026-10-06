// 라이너 꼬리 — 눈꼬리 부채꼴 훑기(linerFan · eyeShift · scoreLinerWing)를 라이너를 그린 사진 쌍과 맨얼굴 대조에 돌린다
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/liner_wing.mjs        (ONLY=1,3 으로 일부만 · LOOK=edgy · RANGE=0.08 로 미세 맞춤 범위를 바꿔 보기)
//   사진: $DHE_DATA_DIR/work/liner-test/ (저장소 밖 · 읽기만)
//     gpt/pNN_{open,closed}_{bare,made}   생성 4명 — 맨얼굴과 라이너 사진이 1~2px 로 겹친다. 라이너는 검정 · 꼬리가 가이드의 약 2배
//     base + in1 · in2                    실제 셀피에 사람이 덧그린 두 장 (얼굴 점은 base 것)
//     me_open · me_closed                 맨얼굴 (대조)
//     reshoot/{me,me2,me3,me4}_*          따로 찍은 맨얼굴 쌍 — made 도 그린 것이 없다. me · me2 = 다른 날 · 다른 조명, me3 = 같은 자리(세로 맨얼굴 → 가로 확인), me2 · me4 = 방향을 바꾼 것
//     wing_tips_eyeball.json              꼬리 끝을 확대 조각에서 눈으로 읽은 자리 — 사람 라벨이 아니라 눈대중 (읽는 오차 약 1~1.5px)
// 합성으로 칠하지 않는다 — 확인 사진의 얼굴 점은 그 사진에서 뽑은 것을 쓰고, 앱처럼 맨얼굴 점을 확인 사진에 맞춘다(alignedFrame)
//   (1) 그린 20눈: 꼬리를 찾았나 · 눈대중 끝과의 차   (2) 맨얼굴끼리 대조(한 장을 일부러 바꾼 것)의 가짜 꼬리   (3) 꼬리를 가이드 길이에서 잘랐을 때
//   (4) scoreLinerWing 판정   (5) 따로 찍은 맨얼굴 쌍의 가짜 꼬리 · 판정
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = join(DATA, "work/liner-test").replaceAll("\\", "/");
const ONLY = (process.env.ONLY ?? "1,2,3,4,5").split(","), LOOK = process.env.LOOK ?? "edgy";
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: [
  'export { frameOf, sampleForehead } from "./src/core/sampling";',
  'export { planGuide, PERSONAL_LINER } from "./src/core/personal-guide";',
  'export { resolvePlan } from "./src/core/personalize";',
  'export { measureFace } from "./src/core/face-measure";',
  'export { alignedFrame } from "./src/core/score-part";',
  'export { decide, PARAMS } from "./src/core/score";',
  'export { linerFan, eyeShift, scoreLinerWing, LINER_WING, EYE_SHIFT } from "./src/core/score-shape";',
  'export { LOOKS } from "./src/core/looks";',
  'export { LM } from "./src/core/landmarks";',
].join("\n"), resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liner-wing-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "liner-wing-core.mjs")).href);
if (process.env.RANGE) core.EYE_SHIFT.range = Number(process.env.RANGE);

const EYE = { R: core.LM.eyeA, L: core.LM.eyeB }, SIDES = ["R", "L"], VALUES = ["hat", "dE", "dark"];
const GUIDE_LEN = core.PERSONAL_LINER.length, LONG = GUIDE_LEN + core.PARAMS.tol.wingShort, RATIO = core.LINER_WING.closedRatio;
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const load = (n, lmFrom = n) => ({ im: png(`${T}/${n}.png`), lm: JSON.parse(readFileSync(`${T}/${lmFrom}.lm.json`, "utf8")) });
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const pc = (v, d = 0) => (v * 100).toFixed(d);
/** 맨얼굴 · 확인 한 쌍. 확인 사진의 얼굴 점은 그 사진에서 뽑은 것(덧그린 사진은 맨얼굴 것)으로 앱처럼 맞춘다 */
const pairOf = (b, m) => { const base = core.frameOf(b.im, b.lm); return { base, cur: core.alignedFrame(base, m.im, m.lm).frame }; };
const span = (f, s) => Math.hypot(f.lm[EYE[s].outer].x - f.lm[EYE[s].inner].x, f.lm[EYE[s].outer].y - f.lm[EYE[s].inner].y);
/** 눈꼬리를 중심으로 한 눈 틀 (linerFan 과 같은 계산) — c 중심 · a 바깥 · n 위 · ue 눈 폭(px) */
function axesOf(f, s, ue, sh = { x: 0, y: 0 }) {
  const c = f.lm[EYE[s].outer], o = f.lm[EYE[s].inner], d = Math.hypot(c.x - o.x, c.y - o.y), a = { x: (c.x - o.x) / d, y: (c.y - o.y) / d };
  let n = { x: -a.y, y: a.x }; if (n.y > 0) n = { x: -n.x, y: -n.y };
  return { c: { x: c.x + sh.x, y: c.y + sh.y }, a, n, ue };
}
const curAxes = (p, s, sh) => axesOf(p.cur, s, (p.base.unit.eye * span(p.cur, s)) / span(p.base, s), sh ?? undefined);
const polar = (x, q) => { const dx = q.x - x.c.x, dy = q.y - x.c.y; return { r: Math.hypot(dx, dy) / x.ue, deg: (Math.atan2(dx * x.n.x + dy * x.n.y, dx * x.a.x + dy * x.a.y) * 180) / Math.PI }; };
/** 꼬리(end = inner 면 눈머리) 찾기. reg = false 면 미세 맞춤 없이 (얼굴 점만) */
const fan = (p, s, { end = "outer", value = "hat", reg = true } = {}) => { const sh = reg ? core.eyeShift(p.base, p.cur, s, end) : null; return { ...core.linerFan(p.base, p.cur, s, { end, value, ...(sh ? { shift: sh } : {}) }), sh }; };
const tipTxt = (t) => (t.found ? `${pc(t.r).padStart(2)}% ${t.deg.toFixed(0).padStart(3)}도` : "   -    ");
const guideOf = (lm) => core.planGuide(core.LOOKS.find((l) => l.id === LOOK).parts, core.resolvePlan(core.measureFace(lm)));
const fold = (s) => (s >= 80 ? "맞음" : s >= 50 ? "조금" : "많이");
const MATCH = { similar: "비슷해요", slight: "조금 달라요", far: "많이 달라요" }, FOLD = { similar: "맞음", slight: "조금", far: "많이" };
/** 판정 한마디 — 가이드와 비슷한가 (세 단계) · 그린 것 없음 · 판정 안 함 */
const verdict = (res) => (!res.present ? "그린 것 없음" : res.metrics.match ? MATCH[res.metrics.match] : "판정 안 함");
const hints = (res) => [...res.codes, ...(res.metrics.endCodes ?? [])];
/** scoreLinerWing 결과 한 줄 — 단계 · 점수 | 눈마다 단계 · 끝 사이 거리 [길이 쪽 · 두 장에서 잰 길이 · 각도 차] | 좌우 차 | 덧붙이는 말. '범위 끝' = 미세 맞춤이 범위 끝에 걸린 눈 */
function say(res) {
  const d = core.decide("liner", res, {}), w = res.metrics.wing, name = { long: "길다", ok: "맞다", short: "짧다", none: "없음" };
  const eye = (k) => { const e = w[k]; return `${k} ${e.match ? MATCH[e.match] : "판정 안 함"}${e.off != null ? ` 끝 차 ${pc(e.off, 1)}%` : ""} [${e.length ? name[e.length] : "-"} · 뜬 ${e.open.found ? pc(e.open.r) + "%" : "-"}${e.closed ? ` · 감은 ${e.closed.found ? pc(e.closed.r) + "% → " + pc(e.closed.r / RATIO) + "%" : "-"}` : ""}${e.dDeg != null ? ` · 각도 차 ${e.dDeg.toFixed(0)}도 (가이드 ${e.guideDeg.toFixed(0)}도)` : ""}]${e.edge ? " 범위 끝" : ""}`; };
  const lr = res.metrics.lrLen, codes = hints(res).map((c) => c.replace("LINER_", "").replace(/_([RL])$/, "·$1"));
  // 점수를 접은 단계(80 · 50)가 판정 단계와 다르면 드러낸다 — 같아야 한다
  const head = d.status === "scored" ? `${verdict(res)} ${d.score}점${fold(d.score) === FOLD[res.metrics.match] ? "" : ` (!! 접으면 ${fold(d.score)})`}` : res.present ? "점수 없음 (판정한 것이 없다)" : "그린 것 없음";
  return `${head} | ${w ? `${eye("R")} · ${eye("L")}` : ""}${lr != null ? ` · 좌우 차 ${(lr * 100).toFixed(1)}%p` : ""} | ${codes.join(" ") || "지적 없음"}`;
}
/** 묶음 요약 한 줄 — 판정별 건수. long = '길어요' 가 붙은 건수도 센다 */
function tally(tag, list, expect, long = false) {
  const n = {}; for (const r of list) n[verdict(r)] = (n[verdict(r)] ?? 0) + 1;
  const order = ["비슷해요", "조금 달라요", "많이 달라요", "그린 것 없음", "판정 안 함"].filter((k) => n[k]).map((k) => `${k} ${n[k]}`).join(" · ");
  console.log(`  => ${tag} ${list.length}건: ${order}${long ? ` | '길어요' 가 붙은 것 ${list.filter((r) => hints(r).some((c) => c.startsWith("LINER_WING_LONG"))).length}건` : ""} (기대: ${expect})`);
}

// ---- 사진 변형 (2 대조용): 두 눈 둘레만 잘라서 한다 — 사진 전체를 다시 뽑으면 무겁다 ----
function cropEyes(im, lm, ue) {
  const xs = [33, 133, 362, 263].map((i) => lm[i].x), ys = [33, 133, 362, 263].map((i) => lm[i].y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - 0.8 * ue)), x1 = Math.min(im.w, Math.ceil(Math.max(...xs) + 0.8 * ue)), y0 = Math.max(0, Math.floor(Math.min(...ys) - 0.8 * ue)), y1 = Math.min(im.h, Math.ceil(Math.max(...ys) + ue));
  const w = x1 - x0, h = y1 - y0, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(im.data.subarray(((y + y0) * im.w + x0) * 4, ((y + y0) * im.w + x1) * 4), y * w * 4);
  return { im: { data, w, h }, lm: lm.map((q) => ({ ...q, x: q.x - x0, y: q.y - y0 })) };
}
/** 가우시안 흐림 (가로 · 세로 따로, 가장자리는 끝 화소를 되풀이) */
function blur(im, sigma) {
  const rad = Math.ceil(sigma * 3), k = Array.from({ length: 2 * rad + 1 }, (_, i) => Math.exp(-((i - rad) ** 2) / (2 * sigma * sigma))), ks = k.reduce((a, b) => a + b, 0);
  const pass = (src, horiz) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = -rad; i <= rad; i++) s += src[((horiz ? y : Math.max(0, Math.min(im.h - 1, y + i))) * im.w + (horiz ? Math.max(0, Math.min(im.w - 1, x + i)) : x)) * 4 + c] * k[i + rad];
      out[(y * im.w + x) * 4 + c] = s / ks;
    }
    return out;
  };
  const f = pass(pass(Float32Array.from(im.data), true), false), data = new Uint8ClampedArray(im.data.length);
  for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : Math.round(f[i]);
  return { data, w: im.w, h: im.h };
}
/** 크기 s 배 (쌍선형). 화소 중심 = 정수 좌표라 얼굴 점은 s 를 곱하면 된다 */
function resize(im, s) {
  const w = Math.round(im.w * s), h = Math.round(im.h * s), data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(im.w - 1, x / s), sy = Math.min(im.h - 1, y / s), x0 = Math.min(im.w - 2, Math.floor(sx)), y0 = Math.min(im.h - 2, Math.floor(sy)), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) { const q = (xx, yy) => im.data[(yy * im.w + xx) * 4 + c]; data[(y * w + x) * 4 + c] = Math.round(q(x0, y0) * (1 - fx) * (1 - fy) + q(x0 + 1, y0) * fx * (1 - fy) + q(x0, y0 + 1) * (1 - fx) * fy + q(x0 + 1, y0 + 1) * fx * fy); }
    data[(y * w + x) * 4 + 3] = 255;
  }
  return { data, w, h };
}
const scaleLm = (lm, s) => lm.map((q) => ({ ...q, x: q.x * s, y: q.y * s })), moveLm = (lm, dx, dy) => lm.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy }));

/**
 * 확인 사진의 꼬리를 눈꼬리에서 len(눈 폭 비율) 밖은 맨얼굴 화소로 되돌린다 — 그 길이까지만 그린 것처럼 (3).
 * 두 사진의 같은 자리는 눈 틀로 짝짓고, 눈꼬리는 미세 맞춤으로 옮긴 자리를 쓴다. 눈꼬리 바깥쪽 반(꼬리를 찾는 부채꼴 전부)만 손댄다
 */
function cutWing(p, len) {
  const im = { data: Uint8ClampedArray.from(p.cur.im.data), w: p.cur.im.w, h: p.cur.im.h }, B = p.base.im, FAR = 0.62;
  for (const s of SIDES) {
    const xc = curAxes(p, s, core.eyeShift(p.base, p.cur, s)), xb = axesOf(p.base, s, p.base.unit.eye), R = FAR * xc.ue;
    for (let y = Math.max(0, Math.floor(xc.c.y - R)); y <= Math.min(im.h - 1, Math.ceil(xc.c.y + R)); y++) for (let x = Math.max(0, Math.floor(xc.c.x - R)); x <= Math.min(im.w - 1, Math.ceil(xc.c.x + R)); x++) {
      const dx = x - xc.c.x, dy = y - xc.c.y, u = (dx * xc.a.x + dy * xc.a.y) / xc.ue, v = (dx * xc.n.x + dy * xc.n.y) / xc.ue, rr = Math.hypot(u, v);
      if (u < 0 || rr <= len || rr > FAR) continue;
      const bx = Math.round(xb.c.x + xb.ue * (u * xb.a.x + v * xb.n.x)), by = Math.round(xb.c.y + xb.ue * (u * xb.a.y + v * xb.n.y));
      if (bx < 0 || by < 0 || bx >= B.w || by >= B.h) continue;
      for (let c = 0; c < 3; c++) im.data[(y * im.w + x) * 4 + c] = B.data[(by * B.w + bx) * 4 + c];
    }
  }
  return { base: p.base, cur: { ...p.cur, im } };
}

// ---- 그린 쌍 10개 (눈 20개) ----
const PEOPLE = ["p01", "p02", "p03", "p04"], drawn = {};
if (ONLY.some((k) => k === "1" || k === "3" || k === "4")) {
  for (const id of PEOPLE) for (const st of ["open", "closed"]) drawn[`${id}_${st}`] = { ...pairOf(load(`gpt/${id}_${st}_bare`), load(`gpt/${id}_${st}_made`)), closed: st === "closed" };
  const base = load("base");
  for (const n of ["in1", "in2"]) drawn[n] = { ...pairOf(base, load(n, "base")), closed: false };
}

if (ONLY.includes("1")) {
  const TIPS = JSON.parse(readFileSync(`${T}/wing_tips_eyeball.json`, "utf8")).tips;
  console.log(`\n===== (1) 그린 20눈 — 꼬리 끝 (칸 값 hat · 미세 맞춤). 눈대중 = 확대 조각에서 눈으로 읽은 끝 (사람 라벨 아님). 거리 = 눈 폭 %, 각도 = 눈 축 기준 · 위가 +`);
  console.log("눈            눈 폭 | 눈대중: 거리 각도 | 잰 값: 거리 각도 (보이기 시작) | 차: 거리 %p · 각도 · 끝 자리 % | 미세 맞춤 px (무늬 상관) | 눈머리 쪽");
  const rows = [];
  for (const [name, p] of Object.entries(drawn)) for (const s of SIDES) {
    const tip = { x: TIPS[`${name}_${s}`][0], y: TIPS[`${name}_${s}`][1] }, row = { name, s, closed: p.closed };
    for (const [key, o] of [["hat", {}], ["raw", { reg: false }], ["dE", { value: "dE" }], ["dark", { value: "dark" }]]) {
      const t = fan(p, s, o), x = curAxes(p, s, t.sh), eye = polar(x, tip);
      row[key] = { t, eye, dr: t.found ? (t.r - eye.r) * 100 : NaN, dd: t.found ? t.deg - eye.deg : NaN, pos: t.found ? (Math.hypot(t.at.x - tip.x, t.at.y - tip.y) / x.ue) * 100 : NaN, ue: x.ue };
    }
    const h = row.hat, inner = fan(p, s, { end: "inner" });
    row.inner = inner.found;
    rows.push(row);
    console.log(`${(name + " " + s).padEnd(13)} ${h.ue.toFixed(0).padStart(4)}px | ${pc(h.eye.r, 1).padStart(5)} ${h.eye.deg.toFixed(1).padStart(6)} | ${h.t.found ? `${pc(h.t.r).padStart(3)} ${h.t.deg.toFixed(1).padStart(6)} (${pc(h.t.from)}%~)` : "못 찾음".padEnd(17)} | ${h.dr.toFixed(1).padStart(5)} ${h.dd.toFixed(1).padStart(5)} ${h.pos.toFixed(1).padStart(4)} | (${h.t.sh.x},${h.t.sh.y}) ${h.t.sh.fit.toFixed(2)}${h.t.sh.edge ? " 범위 끝" : ""} | ${inner.found ? `잡힘 ${pc(inner.r)}%` : "-"}`);
  }
  for (const [key, tag] of [["hat", "hat · 미세 맞춤 (기본)"], ["raw", "hat · 얼굴 점만"], ["dE", "dE · 미세 맞춤"], ["dark", "dark · 미세 맞춤"]]) {
    const got = rows.filter((q) => q[key].t.found).map((q) => q[key]), abs = (k) => got.map((g) => Math.abs(g[k]));
    console.log(`[${tag}] 찾음 ${got.length}/${rows.length} · 끝 거리 차 중앙 ${med(got.map((g) => g.dr)).toFixed(1)} · 절대 중앙 ${med(abs("dr")).toFixed(1)} · 최대 ${Math.max(...abs("dr")).toFixed(1)}%p | 끝 각도 차 절대 중앙 ${med(abs("dd")).toFixed(1)} · 최대 ${Math.max(...abs("dd")).toFixed(1)}도 | 끝 자리 차 중앙 ${med(abs("pos")).toFixed(1)} · 최대 ${Math.max(...abs("pos")).toFixed(1)}%`);
  }
  console.log(`눈머리 쪽에서 잡힌 눈 (넘긴 사진은 없다 = 헛잡기) ${rows.filter((q) => q.inner).length}/${rows.length}`);
  const ratio = PEOPLE.flatMap((id) => SIDES.map((s) => { const o = rows.find((q) => q.name === `${id}_open` && q.s === s).hat, c = rows.find((q) => q.name === `${id}_closed` && q.s === s).hat; return [c.t.r / o.t.r, c.eye.r / o.eye.r]; }));
  console.log(`같은 꼬리의 눈 감은 장 길이 ÷ 눈 뜬 장 길이 (4명 8눈): 잰 값 ${ratio.map((v) => v[0].toFixed(2)).join(" ")} → 중앙 ${med(ratio.map((v) => v[0])).toFixed(2)} | 눈대중 ${ratio.map((v) => v[1].toFixed(2)).join(" ")} → 중앙 ${med(ratio.map((v) => v[1])).toFixed(2)} (LINER_WING.closedRatio = ${RATIO})`);
  const g = (f) => rows.filter(f).map((q) => q.hat.t);
  console.log(`끝의 범위 — 눈 뜬 장 12눈: 거리 ${pc(Math.min(...g((q) => !q.closed).map((t) => t.r)))}~${pc(Math.max(...g((q) => !q.closed).map((t) => t.r)))}% · 각도 ${Math.min(...g((q) => !q.closed).map((t) => t.deg)).toFixed(0)}~${Math.max(...g((q) => !q.closed).map((t) => t.deg)).toFixed(0)}도 | 눈 감은 장 8눈: 거리 ${pc(Math.min(...g((q) => q.closed).map((t) => t.r)))}~${pc(Math.max(...g((q) => q.closed).map((t) => t.r)))}% · 각도 ${Math.min(...g((q) => q.closed).map((t) => t.deg)).toFixed(0)}~${Math.max(...g((q) => q.closed).map((t) => t.deg)).toFixed(0)}도`);
}

if (ONLY.includes("2")) {
  console.log(`\n===== (2) 맨얼굴끼리 대조 — 한 장을 일부러 바꾼 것 (그린 것 없음). 가짜 꼬리 = 꼬리 쪽 부채꼴에서 잡힌 눈, 긴 것 = ${pc(LONG, 1)}% 넘어 '길다' 로 읽힐 것`);
  const BARE = [...PEOPLE.flatMap((id) => [`gpt/${id}_open_bare`, `gpt/${id}_closed_bare`]), "base", "me_open", "me_closed"];
  const DIRS = [0, 45, 90, 135, 180, 225, 270, 315], S = 0.68;
  const conds = { "그대로 (같은 사진)": [], "5% 확대": [], [`${S}배 + 흐림 (맨얼굴이 작고 흐림)`]: [], "그대로 + 눈 폭 3% 어긋남 (8방향)": [], [`${S}배 + 흐림 + 눈 폭 3% 어긋남 (8방향)`]: [] }, names = Object.keys(conds);
  for (const n of BARE) {
    const src = load(n), c = cropEyes(src.im, src.lm, core.frameOf(src.im, src.lm).unit.eye), same = core.frameOf(c.im, c.lm), ue = same.unit.eye;
    const small = core.frameOf(resize(blur(c.im, 1.2), S), scaleLm(c.lm, S));
    conds[names[0]].push({ base: same, cur: same });
    conds[names[1]].push({ base: same, cur: core.frameOf(resize(c.im, 1.05), scaleLm(c.lm, 1.05)) });
    conds[names[2]].push({ base: small, cur: same });
    for (const deg of DIRS) {
      const off = core.frameOf(c.im, moveLm(c.lm, 0.03 * ue * Math.cos((deg * Math.PI) / 180), 0.03 * ue * Math.sin((deg * Math.PI) / 180)));
      conds[names[3]].push({ base: same, cur: off });
      conds[names[4]].push({ base: small, cur: off });
    }
  }
  console.log(`맨얼굴 ${BARE.length}장 (생성 8 · 실제 3) × 두 눈 = ${BARE.length * 2}눈, 어긋남은 눈마다 8방향. 흐림 = 가우시안 1.2px 뒤 줄임. 칸마다: 미세 맞춤 전 → 뒤, 가짜 꼬리 수(그중 긴 것) · 눈머리 쪽`);
  for (const name of names) {
    let line = `${name.padEnd(34)} ${String(conds[name].length * 2).padStart(3)}회 |`;
    for (const value of VALUES) {
      const cnt = (reg) => { let w = 0, long = 0, inner = 0; for (const p of conds[name]) for (const s of SIDES) { const t = fan(p, s, { value, reg }); if (t.found) { w++; if (t.r > LONG) long++; } if (fan(p, s, { value, reg, end: "inner" }).found) inner++; } return `${w}(${long}) · ${inner}`; };
      line += ` ${value}: ${cnt(false)} → ${cnt(true)} |`;
    }
    console.log(line);
  }
}

if (ONLY.includes("3")) {
  console.log(`\n===== (3) 그린 꼬리를 가이드 길이에서 잘랐을 때 (그 밖은 맨얼굴 화소로 되돌림) — 잡히는 눈 수. 가이드 = 눈 뜬 눈 기준 ${pc(GUIDE_LEN)}%`);
  const open = Object.values(drawn).filter((p) => !p.closed), closed = Object.values(drawn).filter((p) => p.closed);
  const count = (pairs, len) => VALUES.map((value) => {
    const cut = pairs.map((p) => cutWing(p, len)), got = cut.flatMap((p) => SIDES.map((s) => fan(p, s, { value }))).filter((t) => t.found), raw = cut.flatMap((p) => SIDES.map((s) => fan(p, s, { value, reg: false }))).filter((t) => t.found);
    return `${value} ${got.length}/${cut.length * 2}${got.length ? ` (잰 길이 중앙 ${pc(med(got.map((t) => t.r)))}%)` : ""} · 얼굴 점만 ${raw.length}`;
  }).join(" | ");
  console.log(`눈 뜬 장 ${open.length * 2}눈 (생성 8 · 덧그림 4) — ${pc(GUIDE_LEN)}% 에서 자름: ${count(open, GUIDE_LEN)}`);
  console.log(`눈 감은 장 ${closed.length * 2}눈 (생성) — ${pc(GUIDE_LEN * RATIO, 1)}% (= ${pc(GUIDE_LEN)}% × ${RATIO}, 같은 꼬리가 감은 눈에서 보이는 길이)에서 자름: ${count(closed, GUIDE_LEN * RATIO)}`);
  console.log(`눈 감은 장 ${closed.length * 2}눈 (생성) — ${pc(GUIDE_LEN)}% 에서 자름: ${count(closed, GUIDE_LEN)}`);
}

if (ONLY.includes("4")) {
  const NEAR = core.PARAMS.tol.wingShort, FAR = core.LINER_WING.far;
  console.log(`\n===== (4) scoreLinerWing 판정 — 가이드와 비슷한가. 화장 ${LOOK} · 가이드 꼬리 ${pc(GUIDE_LEN)}%. 끝 차 = 그린 꼬리 끝과 가이드 꼬리 끝 사이 거리(눈 폭 %): ${pc(NEAR, 1)}% 까지 비슷해요 · ${pc(FAR, 1)}% 까지 조금 달라요 · 그 위 많이 달라요`);
  console.log(`  길이 = 눈 뜬 장에서 ${pc(LONG, 1)}% 넘으면 그 값, 아니면 눈 감은 장 ÷ ${RATIO}. 각도 차 = 눈 뜬 장에서 꼬리를 찾았을 때만`);
  const run = (tag, expect, rows, long = false) => { console.log(tag); const out = rows.map(([name, res]) => { console.log(`  ${name.padEnd(14)}: ${say(res)}`); return res; }); tally(tag.split(" (")[0], out, expect, long); };
  run("그린 그대로 (눈으로 본 것: 네 명 · 덧그린 두 장 모두 꼬리가 가이드의 약 2배)", "달라요 · 길어요", [
    ...PEOPLE.map((id) => { const o = drawn[`${id}_open`]; return [id, core.scoreLinerWing(o, drawn[`${id}_closed`], guideOf(o.base.lm))]; }),
    ...["in1", "in2"].map((n) => [`${n} (눈 뜬 장만)`, core.scoreLinerWing(drawn[n], null, guideOf(drawn[n].base.lm))])], true);
  run(`꼬리를 가이드 길이에서 자른 것 (눈 뜬 장 ${pc(GUIDE_LEN)}% · 눈 감은 장 ${pc(GUIDE_LEN * RATIO, 1)}%. 각도는 그린 그대로 — 가이드 각도로 그린 것이 아니다)`, "비슷해요",
    PEOPLE.map((id) => { const o = cutWing(drawn[`${id}_open`], GUIDE_LEN), c = cutWing(drawn[`${id}_closed`], GUIDE_LEN * RATIO); return [id, core.scoreLinerWing(o, c, guideOf(o.base.lm))]; }));
  run("맨얼굴끼리 (같은 사진)", "그린 것 없음",
    PEOPLE.map((id) => { const o = drawn[`${id}_open`], c = drawn[`${id}_closed`]; return [id, core.scoreLinerWing({ base: o.base, cur: o.base }, { base: c.base, cur: c.base }, guideOf(o.base.lm))]; }));
}

if (ONLY.includes("5") && existsSync(`${T}/reshoot`)) {
  console.log(`\n===== (5) 따로 찍은 맨얼굴 쌍 (실제로 두 번 찍음 · 그린 것 없음) — 가짜 꼬리 · 가짜 눈머리 넘김 · 판정 (기대: '비슷해요' 가 나오면 안 된다 — 안 그린 얼굴은 '가이드와 달라요' 가 정답이고, 덧붙이는 말은 틀려도 된다). 칸 값 hat`);
  const judged = [], names = [];
  let SETS = [["다른 날 · 다른 장소 · 다른 조명", ["me", "me2"]], ["같은 자리 · 몇 분 간격 · 앱과 같은 크기 비 (세로 맨얼굴 → 가로 확인)", ["me3"]], ["〃 방향을 바꾼 것 (가로가 맨얼굴, 참고)", ["me4"]]];
  if (process.env.EXTRA) SETS = [["추가 쌍 (EXTRA — 그린 사진일 수 있다, 아래 기대 문구는 맨얼굴 쌍 기준)", process.env.EXTRA.split(",")]]; // work/liner-test 기준 경로/id
  const pre = (id) => (id.includes("/") ? id : `reshoot/${id}`);
  const tilt = (lm) => (Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x) * 180) / Math.PI;
  for (const [tag, ids] of SETS) {
    console.log(`-- ${tag}`);
    const sum = { n: 0, w0: 0, w1: 0, i0: 0, i1: 0, edge: 0, inN: 0, inFake: 0 };
    for (const id of ids) {
      const P = {};
      for (const st of ["open", "closed"]) {
        const b = load(`${pre(id)}_${st}_bare`), m = load(`${pre(id)}_${st}_made`), p = (P[st] = pairOf(b, m)), fb = core.sampleForehead(p.base), fm = core.sampleForehead(core.frameOf(m.im, m.lm));
        console.log(`  ${id}_${st}: 눈 폭 ${p.base.unit.eye.toFixed(0)} → ${core.frameOf(m.im, m.lm).unit.eye.toFixed(0)}px · 이마 밝기 L ${fb?.L.toFixed(0)} → ${fm?.L.toFixed(0)} · 눈 기울기 ${tilt(b.lm).toFixed(1)} → ${tilt(m.lm).toFixed(1)}도`);
        for (const s of SIDES) {
          const w0 = fan(p, s, { reg: false }), w1 = fan(p, s), i0 = fan(p, s, { reg: false, end: "inner" }), i1 = fan(p, s, { end: "inner" }), sh = (t) => `(${t.sh.x},${t.sh.y}) ${t.sh.fit.toFixed(2)}${t.sh.edge ? " 범위 끝" : ""}`;
          sum.n++; sum.w0 += w0.found; sum.w1 += w1.found; sum.i0 += i0.found; sum.i1 += i1.found; sum.edge += w1.sh.edge + i1.sh.edge;
          for (const t of [w1, i1]) if (!t.sh.edge) { sum.inN++; sum.inFake += t.found; }
          console.log(`      ${s} 꼬리: 얼굴 점만 ${tipTxt(w0)} → 미세 맞춤 ${sh(w1)} ${tipTxt(w1)} | 눈머리: ${tipTxt(i0)} → ${sh(i1)} ${tipTxt(i1)}`);
        }
      }
      const g = guideOf(P.open.base.lm);
      console.log(`    판정 — 얼굴 점만: ${say(core.scoreLinerWing(P.open, P.closed, g, { register: false }))}`);
      const res = core.scoreLinerWing(P.open, P.closed, g);
      judged.push(res); names.push(`${id} ${verdict(res)}`);
      console.log(`    판정 — 미세 맞춤: ${say(res)}`);
    }
    console.log(`  => ${sum.n}눈: 가짜 꼬리 ${sum.w0} → ${sum.w1} · 가짜 눈머리 ${sum.i0} → ${sum.i1} (얼굴 점만 → 미세 맞춤) · 미세 맞춤이 범위(±${pc(core.EYE_SHIFT.range)}%) 끝에 걸린 것 ${sum.edge}/${sum.n * 2} — 안 걸린 ${sum.inN}곳만 보면 가짜 ${sum.inFake}`);
  }
  tally(`따로 찍은 맨얼굴 쌍 (미세 맞춤 · ${names.join(" / ")})`, judged, "'비슷해요' 0건");
}
