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
import { frameOf, isHair, labBox, type SampleFrame } from "./sampling";
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
/** bare · cur = 내 맨얼굴과 시도사진 (같은 촬영) / tBare · target = 정답사진을 만들 때 쓴 맨얼굴과 정답사진 (서로 겹친다). 한 장으로 다 만들었으면 tBare = bare */
interface Frames { bare: SampleFrame; cur: SampleFrame; tBare: SampleFrame; target: SampleFrame }

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

/**
 * 한 구역의 변화: t = 정답 − 정답의 맨얼굴, d = 시도 − 내 맨얼굴 (각각 구역 − 기준 피부).
 * 각자 자기 짝과 견준다 — 정답사진이 다른 촬영에서 만들어졌을 때 두 촬영의 차가 정답의 변화에 섞이지 않게 (실험 39 · 40)
 */
function change(fs: Frames, zone: (f: SampleFrame) => Zone, ref: (f: SampleFrame) => Zone): { t: V3; d: V3 } | null {
  const con = (f: SampleFrame): V3 | null => { const a = meanIn(f, zone(f)), b = meanIn(f, ref(f)); return a && b ? sub3(a, b) : null; };
  const b = con(fs.bare), c = con(fs.cur), tb = con(fs.tBare), t = con(fs.target);
  return b && c && tb && t ? { t: sub3(t, tb), d: sub3(c, b) } : null;
}

/**
 * 부위 전체의 양 — scoreWhole 과 같은 재는 법(부위 − 둘레 1.3~1.8배 띠, avoid 는 띠에서 뺌)을 두 쌍으로.
 * target = 정답 변화의 크기(Lab 거리), amount = 그 방향으로 바뀐 시도의 크기 ÷ target (잴 수 없으면 null)
 */
function ringAmount(fs: Frames, polys: (f: SampleFrame) => Pt[][], avoid: (f: SampleFrame) => Pt[][] = () => []): { target: number; amount: number | null } {
  const z = change(fs, (f) => ({ in: polys(f) }), (f) => ({ in: polys(f).map((q) => growAbout(q, 1.8)), out: [...polys(f).map((q) => growAbout(q, 1.3)), ...avoid(f)] }));
  if (!z) return { target: 0, amount: null };
  const tn2 = dot3(z.t, z.t);
  return { target: Math.sqrt(tn2), amount: tn2 ? dot3(z.d, z.t) / tn2 : null };
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

/** 입꼬리 바깥 네모 (입 폭 비율): 반대쪽 입꼬리에서 멀어지는 쪽으로 near~far, 위아래 ±half — eval/samples/shape/lip_side.mjs (실험 42) */
const LIP_SIDE = { near: 0.03, far: 0.18, half: 0.1 };
function lipSideQuad(f: SampleFrame, k: Side2): Pt[] {
  const c = at(f.lm, k === "R" ? 61 : 291), o = at(f.lm, k === "R" ? 291 : 61), w = Math.hypot(c.x - o.x, c.y - o.y) || 1, a = { x: (c.x - o.x) / w, y: (c.y - o.y) / w };
  const p = (u: number, v: number): Pt => ({ x: c.x + (a.x * u - a.y * v) * w, y: c.y + (a.y * u + a.x * v) * w });
  return [p(LIP_SIDE.near, -LIP_SIDE.half), p(LIP_SIDE.far, -LIP_SIDE.half), p(LIP_SIDE.far, LIP_SIDE.half), p(LIP_SIDE.near, LIP_SIDE.half)];
}

function lipMeasure(fs: Frames): WholeMeasures["lip"] | undefined {
  const all = ringAmount(fs, (f) => [pts(f, LM.lipsOuter)]);
  const scaled = (f: SampleFrame, k: number): Pt[] => growAbout(pts(f, LM.lipsOuter), k), ref = (f: SampleFrame): Zone => ({ in: [scaled(f, 1.9)], out: [scaled(f, 1.45)] });
  // 입꼬리(61 · 291)를 잇는 선의 아래쪽인가
  const below = (f: SampleFrame): ((x: number, y: number) => boolean) => { const a = at(f.lm, 61), b = at(f.lm, 291); return (x, y) => ((y - a.y) * (b.x - a.x) - (x - a.x) * (b.y - a.y) > 0) === (b.x > a.x); };
  const whole = change(fs, (f) => ({ in: [scaled(f, 1)] }), ref);
  if (!whole) return undefined;
  const tn2 = dot3(whole.t, whole.t) || 1, amt = (z: { t: V3; d: V3 } | null): { want: number; got: number } => (z ? { want: dot3(z.t, whole.t) / tn2, got: dot3(z.d, whole.t) / tn2 } : { want: 0, got: 0 });
  const out = amt(change(fs, (f) => ({ in: [scaled(f, 1.25)], out: [scaled(f, 1.05)] }), ref));
  const upper = amt(change(fs, (f) => ({ in: [scaled(f, 1)], keep: (x, y) => !below(f)(x, y) }), ref)), lower = amt(change(fs, (f) => ({ in: [scaled(f, 1)], keep: below(f) }), ref));
  // 둘레 띠 전체의 평균으로는 한쪽 입꼬리의 번짐이 묽어진다 — 입꼬리 바깥을 좌우 따로
  const sideR = amt(change(fs, (f) => ({ in: [lipSideQuad(f, "R")] }), ref)), sideL = amt(change(fs, (f) => ({ in: [lipSideQuad(f, "L")] }), ref));
  return {
    target: all.target, amount: all.amount ?? amt(whole).got, out: out.got, outTarget: out.want, upper: upper.got, lower: lower.got,
    sideR: sideR.got, sideL: sideL.got, sideTargetR: sideR.want, sideTargetL: sideL.want,
  };
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

/** 칠할 자리로 보는 정답 변화 · 안 칠한 자리 · 넘쳤다. 모델이 만든 실제 정답사진의 섀도우는 구역마다 3~5 다 — 얹어 본 화장(12~15)에 맞췄던 6 · 4 로는 칠할 자리가 하나도 안 잡혔다 (실험 40) */
export const SHADOW_ZONE = { paint: 3, blank: 2, over: 0.4 };
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

/** min = 피부보다 어두운 정도(L) · gap = 이만큼 넘게 끊기면 끝 · band = 축에서 벗어나도 되는 폭 · skin = 기준 피부를 재는 자리 · far = 꼬리 너머로 보는 범위 (모두 눈썹 길이 비율) */
export const BROW_TAIL = { min: 9, gap: 0.06, step: 0.02, band: 0.28, skin: [0.38, 0.5] as const, far: 0.7 } as const;

/**
 * 눈썹 꼬리 끝 — 그 사진 한 장에서 잰다 (실험 33, eval/samples/shape/brow_tail.py). 눈썹 길이의 비율로, 얼굴 점의 꼬리 = 1.
 * 눈썹 머리 → 꼬리 축을 따라가며, 축에 수직인 줄에서 가장 어두운 칸이 위 · 아래 피부(밝은 쪽)보다 min 넘게 어두운 데까지가 눈썹이다.
 * 머리카락 칸은 보지 않고, 줄의 가운데가 머리카락이면 거기서 멈춘다 — 꼬리 자리는 관자놀이 머리카락과 붙어 있어, 머리카락 분할 없이는
 * 늘린 꼬리가 머리카락까지 이어 읽힌다 (실험 32). 그래서 **머리카락 분할(f.hair)이 없으면 재지 않는다 (null)**.
 * 맨얼굴의 끝을 뺀 것이 '늘린 양'. 같은 방식으로 찍은 사진 사이의 흔들림은 ±2%p
 */
export function browTail(f: SampleFrame, k: Side2): number | null {
  if (!f.hair) return null;
  const C = BROW_TAIL, b = browOf(k), mid = (i: number, j: number): Pt => mixPt(at(f.lm, i), at(f.lm, j), 0.5);
  const h = mid(b.upper[b.upper.length - 1]!, b.lower[b.lower.length - 1]!), t = mid(b.upper[0]!, b.lower[0]!), len = Math.hypot(t.x - h.x, t.y - h.y) || 1;
  const a = { x: (t.x - h.x) / len, y: (t.y - h.y) / len }, n0 = { x: -a.y, y: a.x }, n = n0.y > 0 ? { x: -n0.x, y: -n0.y } : n0;
  const xy = (u: number, v: number): Pt => ({ x: h.x + (a.x * u + n.x * v) * len, y: h.y + (a.y * u + n.y * v) * len });
  const lum = (p: Pt): number => labBox(f.im, p.x, p.y, 3).L, hair = (p: Pt): boolean => isHair(f, p.x, p.y);
  /** v0 ~ v1 줄에서 머리카락이 아닌 칸의 밝기들 */
  const along = (u: number, v0: number, v1: number): number[] => { const out: number[] = []; for (let v = v0; v <= v1 + 1e-6; v += 0.03) { const p = xy(u, v); if (!hair(p)) out.push(lum(p)); } return out; };
  const meanOf = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;
  let end = 0.5, gap = 0;
  for (let u = 0.5; u <= 1 + C.far; u += C.step) {
    let hairMid = 0, q = 0;
    for (let v = -0.1; v <= 0.1 + 1e-6; v += 0.03) { if (hair(xy(u, v))) hairMid++; q++; }
    if (hairMid / q > 0.5) break;
    const up = along(u, C.skin[0], C.skin[1]), dn = along(u, -C.skin[1], -C.skin[0]), band = along(u, -C.band, C.band);
    const skin = Math.max(up.length ? meanOf(up) : -1e9, dn.length ? meanOf(dn) : -1e9);
    if (band.length && skin > -1e8 && skin - Math.min(...band) >= C.min) { end = u; gap = 0; } else if ((gap += C.step) > C.gap) break;
  }
  return end;
}

function browMeasure(fs: Frames): WholeMeasures["brow"] | undefined {
  const eyes = (f: SampleFrame): Pt[][] => SIDES2.map((k) => eyePoly(f, k)), of = (ks: readonly Side2[]) => ringAmount(fs, (f) => ks.map((k) => browPoly(f, k)), eyes);
  const all = of(SIDES2), r = of(["R"]), l = of(["L"]);
  // 눈썹 바로 아래 띠 (아랫선에서 눈 폭의 3~10% 아래). 기준 피부는 눈썹 위 이마 (윗선에서 22~34% 위)
  const band = (line: readonly Pt[], a: number, b: number): Pt[] => [...line.map((p) => ({ x: p.x, y: p.y + a })), ...line.map((p) => ({ x: p.x, y: p.y + b })).reverse()];
  const fore = (f: SampleFrame): Zone => ({ in: SIDES2.map((k) => band(pts(f, browOf(k).upper), -0.34 * f.unit.eye, -0.22 * f.unit.eye)) });
  const core = change(fs, (f) => ({ in: SIDES2.map((k) => browPoly(f, k)) }), fore), below = change(fs, (f) => ({ in: SIDES2.map((k) => band(pts(f, browOf(k).lower), 0.03 * f.unit.eye, 0.1 * f.unit.eye)) }), fore);
  const tn2 = core ? dot3(core.t, core.t) || 1 : 1;
  // 꼬리를 늘린 양 = 그 사진의 꼬리 끝 − 맨얼굴의 꼬리 끝. 세 장 모두 머리카락 분할이 있어야 잰다
  const ext = (base: SampleFrame, f: SampleFrame, k: Side2): number | null => { const b = browTail(base, k), v = browTail(f, k); return b === null || v === null ? null : v - b; };
  const tR = ext(fs.tBare, fs.target, "R"), tL = ext(fs.tBare, fs.target, "L"), cR = ext(fs.bare, fs.cur, "R"), cL = ext(fs.bare, fs.cur, "L");
  const tail = tR !== null && tL !== null && cR !== null && cL !== null ? { tailTargetR: tR, tailTargetL: tL, tailR: cR, tailL: cL } : {};
  return { target: all.target, amountR: r.amount ?? 0, amountL: l.amount ?? 0, below: core && below ? dot3(below.d, core.t) / tn2 : 0, belowTarget: core && below ? dot3(below.t, core.t) / tn2 : 0, ...tail };
}

/** 볼을 재서 넘길지 — 정답에서 바뀐 자리(①②④ 가 떠낸 칠한 자리)를 받게 되면 켠다 */
const CHEEK_READY = false;
function cheekMeasure(fs: Frames): WholeMeasures["cheek"] | undefined {
  const w = ringAmount(fs, (f) => SIDES2.map((k) => pts(f, CHEEK_IDS[k])), (f) => SIDES2.map((k) => eyePoly(f, k)));
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
  /** 정답사진 — 그것을 만든 맨얼굴(targetBare, 없으면 bare)과 같은 크기 · 같은 자리 */
  target: RgbaImage;
  /**
   * 정답사진을 만들 때 쓴 맨얼굴 — bare 와 다른 촬영일 때만 준다 (실험 39: 다른 촬영의 맨얼굴로 만든 정답사진을 bare 와 견주면 두 촬영의 차가 섞인다).
   * 주면 정답의 변화는 이것과 견주고, 시도의 변화는 bare 와 견준다. 옮긴 그림(moved)은 여전히 bare 와 겹쳐야 한다
   */
  targetBare?: SampleFrame;
  /**
   * 시도사진 눈 뜬 장 — 그 사진에서 뽑은 얼굴 점 (실험 21: 맨얼굴 점을 옮겨 쓰는 것보다 낫다).
   * 연달아 찍은 여러 장을 주면 장마다 재서 값마다 가운데 값을 쓴다 — 실제 화장 시험에서 한 장씩 판정하면 맨얼굴 5장 중 2장이 틀렸다 (실험 40 · 41)
   */
  cur: SampleFrame | readonly SampleFrame[];
  /** 시도사진의 화장을 같은 모델로 맨얼굴에 옮긴 그림 — 맨얼굴과 같은 크기 · 같은 자리. 없으면 라이너는 "이번에는 볼 수 없었어요" */
  moved?: RgbaImage | null;
}

/** 사진 네 장에서 부위별 값을 잰다 (사진 조건은 보지 않는다 — feedbackWhole 이 먼저 본다) */
const curs = (i: WholeInput): readonly SampleFrame[] => (Array.isArray(i.cur) ? (i.cur as readonly SampleFrame[]) : [i.cur as SampleFrame]);
const median = (v: readonly number[]): number => { const a = [...v].sort((x, y) => x - y); return a[(a.length - 1) >> 1]!; };
/** 장마다 잰 값을 하나로: 숫자는 가운데 값, 참 · 거짓은 절반 넘게 참일 때. 그 부위를 잰 장이 절반이 안 되면 뺀다 */
function combine<T extends Record<string, number | boolean | null | undefined>>(list: readonly (T | undefined)[]): T | undefined {
  const got = list.filter((x): x is T => x !== undefined);
  if (!got.length || got.length * 2 < list.length) return undefined;
  const out: Record<string, number | boolean | null> = {};
  for (const k of Object.keys(got[0]!)) {
    const vs = got.map((g) => g[k]).filter((x) => x !== undefined && x !== null);
    if (!vs.length) continue;
    out[k] = typeof vs[0] === "boolean" ? vs.filter(Boolean).length * 2 > vs.length : median(vs as number[]);
  }
  return out as T;
}

export function measureWhole(i: WholeInput): WholeMeasures {
  const list = curs(i).map((cur) => measureOne(i, cur)), lip = combine(list.map((m) => m.lip)), shadow = combine(list.map((m) => m.shadow)), brow = combine(list.map((m) => m.brow)), cheek = combine(list.map((m) => m.cheek));
  const liner = list[0]?.liner;   // 옮긴 그림에서 잰다 — 시도사진 장 수와 상관없다
  return { ...(lip ? { lip } : {}), ...(shadow ? { shadow } : {}), ...(brow ? { brow } : {}), ...(cheek ? { cheek } : {}), ...(liner ? { liner } : {}) };
}

function measureOne(i: WholeInput, cur: SampleFrame): WholeMeasures {
  // 정답 그림은 그것을 만든 맨얼굴과 겹치므로 얼굴 점도 머리카락 분할도 그 맨얼굴 것을 쓴다
  const tBare = i.targetBare ?? i.bare, fs: Frames = { bare: i.bare, cur, tBare, target: frameOf(i.target, tBare.lm, tBare.hair) };
  // 볼은 아직 넘기지 않는다: 볼 다각형 전체의 평균으로는 블러셔가 묽어져 정답 변화가 1.1 로 읽힌다 (파이썬 실험은 정답에서 바뀐 칸에만 무게를 줬다 — 그 자리를 받아야 한다)
  const lip = lipMeasure(fs), shadow = shadowMeasure(fs), brow = browMeasure(fs), cheek = CHEEK_READY ? cheekMeasure(fs) : undefined;
  const liner = i.moved ? { targetR: ridgeTail(tBare, i.target, "R"), targetL: ridgeTail(tBare, i.target, "L"), R: ridgeTail(i.bare, i.moved, "R"), L: ridgeTail(i.bare, i.moved, "L") } : undefined;
  return { ...(lip ? { lip } : {}), ...(shadow ? { shadow } : {}), ...(brow ? { brow } : {}), ...(cheek ? { cheek } : {}), ...(liner ? { liner } : {}) };
}

/** 화면 6 한 번에: 사진 조건 확인 → 부위별로 재기 → 문장 고르기. skipCondition = 조건 확인을 건너뛴다 (평가용) */
export function feedbackWhole(i: WholeInput, skipCondition = false): WholeFeedback {
  // 여러 장이면 절반 넘게 걸릴 때만 막는다 (가장 많이 나온 이유로)
  const hits = skipCondition ? [] : curs(i).map((c) => shotCondition(i.bare, c)).filter((c): c is NonNullable<typeof c> => c !== null);
  if (hits.length * 2 > curs(i).length) {
    const count = (r: (typeof hits)[number]): number => hits.filter((h) => h === r).length;
    return composeFeedback({ condition: [...hits].sort((a, b) => count(b) - count(a))[0]! });
  }
  return composeFeedback(measureWhole(i));
}

export { FEEDBACK };
