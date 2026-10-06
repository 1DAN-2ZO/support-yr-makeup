/**
 * 새 흐름 화면 6 — 사진에서 부위별 값을 재서 문장까지 (실험, 앱에 연결하지 않음).
 *   feedbackWhole = 사진 조건 확인(shotCondition) → 부위별로 재기(measureWhole) → 문장 고르기(composeFeedback)
 *
 * 재는 법은 평가 스크립트에서 검증한 것을 옮겼다 (eval/samples/shape/README.md):
 *   입술 구역 = lip_zones.mjs (실험 34) · 섀도우 구역 = whole_feedback.mjs (실험 22 · 24 · 28) · 눈꼬리 바깥 · 눈썹 아래 = zones_more.py (실험 36)
 *   꼬리 끝 = tail_ridge.py (실험 30) · 눈썹 · 볼 · 입술 전체의 양 = scoreWhole (실험 21 · 31)
 * 구역은 사진마다 그 사진의 얼굴 점으로 만든다. 값 = (구역 평균 Lab − 기준 피부 평균 Lab) 이 맨얼굴에서 바뀐 양.
 * 받는 그림의 조건: 정답사진 · 옮긴 그림은 맨얼굴과 같은 크기 · 같은 자리여야 한다 (README "피드백이 받는 그림의 조건")
 */
import { pointInPoly, rgbToLab, type RgbaImage } from "./color";
import { FEEDBACK, composeFeedback, shotCondition, type WholeFeedback, type WholeMeasures } from "./feedback-whole";
import { LM, at } from "./landmarks";
import { frameOf, isHair, type SampleFrame } from "./sampling";
import { scoreWhole } from "./score-shape";
import type { Pt } from "./types";

type V3 = readonly [number, number, number];
type Side2 = "R" | "L";
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mixPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const growAbout = (poly: readonly Pt[], k: number): Pt[] => {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
};

interface Zone { in: readonly (readonly Pt[])[]; out?: readonly (readonly Pt[])[]; keep?: (x: number, y: number) => boolean }
interface Frames { bare: SampleFrame; target: SampleFrame; cur: SampleFrame }

/** 구역 안(out 밖 · keep 을 지나는 칸)의 평균 Lab. 머리카락 칸은 뺀다. 칸이 없으면 null */
function meanIn(f: SampleFrame, z: Zone): V3 | null {
  const step = Math.max(1, Math.round(f.unit.eye / 60));
  let L = 0, a = 0, b = 0, n = 0;
  for (const poly of z.in) {
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.max(...ys)); y += step) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.max(...xs)); x += step) {
        if (!pointInPoly(x, y, poly) || z.out?.some((h) => pointInPoly(x, y, h)) || (z.keep && !z.keep(x, y)) || isHair(f, x, y)) continue;
        const i = (y * f.im.w + x) * 4, lab = rgbToLab(f.im.data[i] ?? 0, f.im.data[i + 1] ?? 0, f.im.data[i + 2] ?? 0);
        L += lab.L; a += lab.a; b += lab.b; n++;
      }
    }
  }
  return n ? [L / n, a / n, b / n] : null;
}

/** 세 장(맨얼굴 · 정답 · 시도)에서 한 구역의 변화: t = 정답 − 맨얼굴, d = 시도 − 맨얼굴 (각각 구역 − 기준 피부) */
function change(fs: Frames, zone: (f: SampleFrame) => Zone, ref: (f: SampleFrame) => Zone): { t: V3; d: V3 } | null {
  const con = (f: SampleFrame): V3 | null => { const a = meanIn(f, zone(f)), b = meanIn(f, ref(f)); return a && b ? sub3(a, b) : null; };
  const b = con(fs.bare), t = con(fs.target), c = con(fs.cur);
  return b && t && c ? { t: sub3(t, b), d: sub3(c, b) } : null;
}

const SIDES2: readonly Side2[] = ["R", "L"];
const pts = (f: SampleFrame, ids: readonly number[]): Pt[] => ids.map((i) => at(f.lm, i));
const eyeOf = (k: Side2) => (k === "R" ? LM.eyeA : LM.eyeB), browOf = (k: Side2) => (k === "R" ? LM.browA : LM.browB);
const eyePoly = (f: SampleFrame, k: Side2): Pt[] => [...pts(f, eyeOf(k).upper), ...pts(f, eyeOf(k).lower).reverse()];
const browPoly = (f: SampleFrame, k: Side2): Pt[] => [...pts(f, browOf(k).upper), ...pts(f, browOf(k).lower).reverse()];
/** 볼 영역 (얼굴 점) — eval/samples/shape/final_whole.py 의 CHEEKS 와 같다 */
const CHEEK_IDS: Record<Side2, readonly number[]> = { R: [116, 117, 118, 119, 100, 142, 203, 206, 216, 192, 213, 147, 123], L: [345, 346, 347, 348, 329, 371, 423, 426, 436, 416, 433, 376, 352] };
/** 눈 틀: o = 눈꼬리, a = 눈머리 → 눈꼬리 방향, n = 그 수직(화면 위쪽), ue = 눈 폭(px) */
function eyeFrame(f: SampleFrame, k: Side2): { o: Pt; a: Pt; n: Pt; ue: number } {
  const o = at(f.lm, eyeOf(k).outer), inn = at(f.lm, eyeOf(k).inner), ue = Math.hypot(o.x - inn.x, o.y - inn.y) || 1, a = { x: (o.x - inn.x) / ue, y: (o.y - inn.y) / ue };
  const n = a.x > 0 ? { x: a.y, y: -a.x } : { x: -a.y, y: a.x };
  return { o, a, n: n.y > 0 ? { x: -n.x, y: -n.y } : n, ue };
}

function lipMeasure(fs: Frames): WholeMeasures["lip"] | undefined {
  const all = scoreWhole(fs.bare, fs.target, fs.cur, (f) => ({ polys: [pts(f, LM.lipsOuter)] }));
  const scaled = (f: SampleFrame, k: number): Pt[] => growAbout(pts(f, LM.lipsOuter), k), ref = (f: SampleFrame): Zone => ({ in: [scaled(f, 1.9)], out: [scaled(f, 1.45)] });
  // 입꼬리(61 · 291)를 잇는 선의 아래쪽인가
  const below = (f: SampleFrame): ((x: number, y: number) => boolean) => { const a = at(f.lm, 61), b = at(f.lm, 291); return (x, y) => ((y - a.y) * (b.x - a.x) - (x - a.x) * (b.y - a.y) > 0) === (b.x > a.x); };
  const whole = change(fs, (f) => ({ in: [scaled(f, 1)] }), ref);
  if (!whole) return undefined;
  const tn2 = dot3(whole.t, whole.t) || 1, amt = (z: { t: V3; d: V3 } | null): { want: number; got: number } => (z ? { want: dot3(z.t, whole.t) / tn2, got: dot3(z.d, whole.t) / tn2 } : { want: 0, got: 0 });
  const out = amt(change(fs, (f) => ({ in: [scaled(f, 1.25)], out: [scaled(f, 1.05)] }), ref));
  const upper = amt(change(fs, (f) => ({ in: [scaled(f, 1)], keep: (x, y) => !below(f)(x, y) }), ref)), lower = amt(change(fs, (f) => ({ in: [scaled(f, 1)], keep: below(f) }), ref));
  return { target: all.target, amount: all.amount ?? amt(whole).got, out: out.got, outTarget: out.want, upper: upper.got, lower: lower.got };
}

/** 눈두덩 구역(눈마다 바깥 · 가운데 · 안쪽 × 아래 · 위)과 그 기준 피부(눈썹 바로 아래 띠 + 눈꼬리 바깥 관자놀이 쪽) */
function lidZones(f: SampleFrame, k: Side2): { zones: Pt[][]; ref: Zone } {
  const lid = pts(f, eyeOf(k).upper), lo = pts(f, browOf(k).lower), eye = f.unit.eye;
  const browAt = (i: number): Pt => { const u = (i / (lid.length - 1)) * (lo.length - 1), j = Math.min(lo.length - 2, Math.floor(u)); return mixPt(lo[j]!, lo[j + 1]!, u - j); };
  const P = (i: number, t: number): Pt => mixPt(lid[i]!, browAt(i), t), idx = lid.map((_, i) => i), dir = Math.sign(lid[0]!.x - lid[lid.length - 1]!.x), oc = lid[0]!;
  const temple: Pt[] = [{ x: oc.x + dir * eye * 0.25, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y - eye * 0.35 }, { x: oc.x + dir * eye * 0.5, y: oc.y + eye * 0.1 }, { x: oc.x + dir * eye * 0.25, y: oc.y + eye * 0.1 }];
  const zones: Pt[][] = [];
  for (const [i0, i1] of [[0, 3], [3, 5], [5, 8]] as const) for (const [t0, t1] of [[0.1, 0.4], [0.4, 0.75]] as const) {
    const ids = idx.slice(i0, i1 + 1);
    zones.push([...ids.map((i) => P(i, t0)), ...ids.map((i) => P(i, t1)).reverse()]);
  }
  return { zones, ref: { in: [[...idx.map((i) => P(i, 0.82)), ...idx.map((i) => P(i, 0.98)).reverse()], temple] } };
}

/** 칠할 자리로 보는 정답 변화 · 안 칠한 자리 · 넘쳤다 (실험 22 · 28) */
const SHADOW_ZONE = { paint: 6, blank: 4, over: 0.4 };
function shadowMeasure(fs: Frames): WholeMeasures["shadow"] | undefined {
  const all: { side: Side2; t: V3; d: V3 }[] = [];
  for (const k of SIDES2) {
    const n = lidZones(fs.bare, k).zones.length;
    for (let i = 0; i < n; i++) {
      const z = change(fs, (f) => ({ in: [lidZones(f, k).zones[i]!] }), (f) => lidZones(f, k).ref);
      if (z) all.push({ side: k, ...z });
    }
  }
  if (!all.length) return undefined;
  const mag = (v: V3): number => Math.hypot(v[0], v[1], v[2]), paint = all.filter((z) => mag(z.t) >= SHADOW_ZONE.paint), blank = all.filter((z) => mag(z.t) < SHADOW_ZONE.blank);
  // 칠할 구역이 둘도 안 되면 견줄 것이 없다
  if (paint.length < 2) return { target: 0, amountR: 0, amountL: 0, higher: false, outer: 0, outerTarget: 0 };
  const T: V3 = [paint.reduce((s, z) => s + z.t[0], 0) / paint.length, paint.reduce((s, z) => s + z.t[1], 0) / paint.length, paint.reduce((s, z) => s + z.t[2], 0) / paint.length], tn2 = dot3(T, T) || 1;
  const sideAmt = (k: Side2): number => { const zs = paint.filter((z) => z.side === k); return zs.length ? zs.reduce((s, z) => s + dot3(z.d, z.t) / (dot3(z.t, z.t) || 1), 0) / zs.length : 0; };
  // 눈꼬리 바깥: 눈 축 기준 바깥 8~35% · 아래 5% ~ 위 22%. 기준 피부는 그 아래 광대 쪽
  const quad = (f: SampleFrame, k: Side2, u0: number, u1: number, v0: number, v1: number): Pt[] => {
    const e = eyeFrame(f, k);
    return ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const).map(([u, v]) => ({ x: e.o.x + (e.a.x * u + e.n.x * v) * f.unit.eye, y: e.o.y + (e.a.y * u + e.n.y * v) * f.unit.eye }));
  };
  const outer = change(fs, (f) => ({ in: SIDES2.map((k) => quad(f, k, 0.08, 0.35, -0.05, 0.22)) }), (f) => ({ in: SIDES2.map((k) => quad(f, k, 0.1, 0.35, -0.42, -0.26)) }));
  return {
    target: paint.reduce((s, z) => s + mag(z.t), 0) / paint.length, amountR: sideAmt("R"), amountL: sideAmt("L"),
    higher: blank.some((z) => dot3(z.d, T) / tn2 >= SHADOW_ZONE.over),
    outer: outer ? dot3(outer.d, T) / tn2 : 0, outerTarget: outer ? dot3(outer.t, T) / tn2 : 0,
  };
}

function browMeasure(fs: Frames): WholeMeasures["brow"] | undefined {
  const reg = (ks: readonly Side2[]) => (f: SampleFrame) => ({ polys: ks.map((k) => browPoly(f, k)), avoid: SIDES2.map((k) => eyePoly(f, k)) });
  const all = scoreWhole(fs.bare, fs.target, fs.cur, reg(SIDES2)), r = scoreWhole(fs.bare, fs.target, fs.cur, reg(["R"])), l = scoreWhole(fs.bare, fs.target, fs.cur, reg(["L"]));
  // 눈썹 바로 아래 띠 (아랫선에서 눈 폭의 3~10% 아래). 기준 피부는 눈썹 위 이마 (윗선에서 22~34% 위)
  const band = (line: readonly Pt[], a: number, b: number): Pt[] => [...line.map((p) => ({ x: p.x, y: p.y + a })), ...line.map((p) => ({ x: p.x, y: p.y + b })).reverse()];
  const fore = (f: SampleFrame): Zone => ({ in: SIDES2.map((k) => band(pts(f, browOf(k).upper), -0.34 * f.unit.eye, -0.22 * f.unit.eye)) });
  const core = change(fs, (f) => ({ in: SIDES2.map((k) => browPoly(f, k)) }), fore), below = change(fs, (f) => ({ in: SIDES2.map((k) => band(pts(f, browOf(k).lower), 0.03 * f.unit.eye, 0.1 * f.unit.eye)) }), fore);
  const tn2 = core ? dot3(core.t, core.t) || 1 : 1;
  return { target: all.target, amountR: r.amount ?? 0, amountL: l.amount ?? 0, below: core && below ? dot3(below.d, core.t) / tn2 : 0, belowTarget: core && below ? dot3(below.t, core.t) / tn2 : 0 };
}

/** 볼을 재서 넘길지 — 정답에서 바뀐 자리(①②④ 가 떠낸 칠한 자리)를 받게 되면 켠다 */
const CHEEK_READY = false;
function cheekMeasure(fs: Frames): WholeMeasures["cheek"] | undefined {
  const w = scoreWhole(fs.bare, fs.target, fs.cur, (f) => ({ polys: SIDES2.map((k) => pts(f, CHEEK_IDS[k])), avoid: SIDES2.map((k) => eyePoly(f, k)) }));
  return { target: w.target, amount: w.amount ?? 0 };
}

/** side = 양옆 폭(눈 폭 비율) · min = 선 값(L) · dark = 맨얼굴보다 어두워진 정도(L) · reach = 눈꼬리에서 이어졌다고 보는 거리 · far = 보는 범위 */
export const TAIL_RIDGE = { side: 0.025, min: 6, dark: 8, reach: 0.22, far: 0.5 } as const;

/**
 * 라이너 꼬리 끝 — 맨얼굴과 같은 크기 · 같은 자리인 그림(정답사진 · 모델이 옮긴 시도 화장)에서, 눈꼬리 둘레에 새로 생긴 가는 선의 가장 바깥까지.
 * 길이는 눈꼬리 얼굴 점에서 바깥으로 잰 값(눈 폭 비율)이라 눈마다 치우침이 있다 — 정답 그림과 같은 틀에서 견줄 때만 뜻이 있다. 못 찾으면 null.
 * 칸마다 선 값 = 양옆(네 방향, side 떨어진 두 칸) 중 더 어두운 쪽보다 얼마나 더 어두운가. 넓은 그늘(섀도우 띠)은 양옆도 어두워 0 이다.
 * 맨얼굴의 선 값을 뺀 것이 min 이상이고 맨얼굴보다 dark 넘게 어두워진 칸이 새 선. 눈꼬리 얼굴 점에서 reach 안에 닿는 덩어리만 본다.
 * 시작점은 보지 않는다 — 얼굴 점의 눈꼬리가 실제 눈꼬리보다 안쪽일 수 있고, 모델은 실제 눈꼬리에서 그린다.
 * 기준값은 눈 폭 146px 사진에서 맞춘 것 (실험 30) — 폭을 넓히면 섀도우 띠를 다시 읽는다. 눈 폭의 10% 아래 꼬리는 못 찾는다
 */
export function ridgeTail(bare: SampleFrame, im: RgbaImage, k: Side2): number | null {
  if (im.w !== bare.im.w || im.h !== bare.im.h) return null;
  const C = TAIL_RIDGE, { o, a, n, ue } = eyeFrame(bare, k);
  const s = Math.max(2, Math.round(C.side * ue)), pad = s + 2, R = Math.ceil(0.7 * ue);
  const x0 = Math.max(0, Math.floor(o.x - R) - pad), y0 = Math.max(0, Math.floor(o.y - R) - pad), x1 = Math.min(im.w - 1, Math.ceil(o.x + R) + pad), y1 = Math.min(im.h - 1, Math.ceil(o.y + R) + pad), w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w < 3 * pad || h < 3 * pad) return null;
  /** 창 안의 밝기(L) — 3×3 으로 한 번 흐린다 */
  const light = (g: RgbaImage): Float32Array => {
    const raw = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y + y0) * g.w + (x + x0)) * 4; raw[y * w + x] = rgbToLab(g.data[i] ?? 0, g.data[i + 1] ?? 0, g.data[i + 2] ?? 0).L; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0, q = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
        const wt = (dx ? 1 : 2) * (dy ? 1 : 2);
        v += raw[yy * w + xx]! * wt; q += wt;
      }
      out[y * w + x] = v / q;
    }
    return out;
  };
  const ridge = (L: Float32Array, x: number, y: number): number => {
    let best = -1e9;
    for (const [dy, dx] of [[0, s], [s, 0], [s, s], [s, -s]] as const) best = Math.max(best, Math.min(L[(y + dy) * w + (x + dx)]!, L[(y - dy) * w + (x - dx)]!) - L[y * w + x]!);
    return best;
  };
  const LB = light(bare.im), LI = light(im), isNew = new Uint8Array(w * h), U = new Float32Array(w * h), V = new Float32Array(w * h);
  for (let y = s; y < h - s; y++) for (let x = s; x < w - s; x++) {
    const px = x + x0 - o.x, py = y + y0 - o.y, u = (px * a.x + py * a.y) / ue, v = (px * n.x + py * n.y) / ue, i = y * w + x;
    U[i] = u; V[i] = v;
    if (u <= -0.25 || u >= C.far || v <= -0.3 || v >= 0.4) continue;
    if (LI[i]! - LB[i]! <= -C.dark && ridge(LI, x, y) - Math.max(ridge(LB, x, y), 0) >= C.min) isNew[i] = 1;
  }
  // 이어진 덩어리(8방향)마다: 눈꼬리 둘레에 닿는가 · 크기 · 가장 바깥
  const seen = new Uint8Array(w * h), minSize = Math.max(6, (0.03 * ue) ** 2);
  let tip = 0;
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!isNew[i0] || seen[i0]) continue;
    const stack = [i0];
    seen[i0] = 1;
    let size = 0, near = false, far = -9;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      size++; far = Math.max(far, U[i]!);
      if (Math.hypot(U[i]!, V[i]!) < C.reach) near = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !isNew[j] || seen[j]) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    if (near && size >= minSize) tip = Math.max(tip, far);
  }
  return tip >= 0.04 ? tip : null;
}

export interface WholeInput {
  /** 맨얼굴 눈 뜬 장 */
  bare: SampleFrame;
  /** 정답사진 — 맨얼굴과 같은 크기 · 같은 자리 (맨얼굴의 얼굴 점을 쓴다) */
  target: RgbaImage;
  /** 시도사진 눈 뜬 장 — 그 사진에서 뽑은 얼굴 점 (실험 21: 맨얼굴 점을 옮겨 쓰는 것보다 낫다) */
  cur: SampleFrame;
  /** 시도사진의 화장을 같은 모델로 맨얼굴에 옮긴 그림 — 맨얼굴과 같은 크기 · 같은 자리. 없으면 라이너는 "이번에는 볼 수 없었어요" */
  moved?: RgbaImage | null;
}

/** 사진 네 장에서 부위별 값을 잰다 (사진 조건은 보지 않는다 — feedbackWhole 이 먼저 본다) */
export function measureWhole(i: WholeInput): WholeMeasures {
  const fs: Frames = { bare: i.bare, target: frameOf(i.target, i.bare.lm), cur: i.cur };
  // 볼은 아직 넘기지 않는다: 볼 다각형 전체의 평균으로는 블러셔가 묽어져 정답 변화가 1.1 로 읽힌다 (파이썬 실험은 정답에서 바뀐 칸에만 무게를 줬다 — 그 자리를 받아야 한다)
  const lip = lipMeasure(fs), shadow = shadowMeasure(fs), brow = browMeasure(fs), cheek = CHEEK_READY ? cheekMeasure(fs) : undefined;
  const liner = i.moved ? { targetR: ridgeTail(i.bare, i.target, "R"), targetL: ridgeTail(i.bare, i.target, "L"), R: ridgeTail(i.bare, i.moved, "R"), L: ridgeTail(i.bare, i.moved, "L") } : undefined;
  return { ...(lip ? { lip } : {}), ...(shadow ? { shadow } : {}), ...(brow ? { brow } : {}), ...(cheek ? { cheek } : {}), ...(liner ? { liner } : {}) };
}

/** 화면 6 한 번에: 사진 조건 확인 → 부위별로 재기 → 문장 고르기. skipCondition = 조건 확인을 건너뛴다 (평가용) */
export function feedbackWhole(i: WholeInput, skipCondition = false): WholeFeedback {
  const condition = skipCondition ? null : shotCondition(i.bare, i.cur);
  return composeFeedback(condition ? { condition } : measureWhole(i));
}

export { FEEDBACK };
