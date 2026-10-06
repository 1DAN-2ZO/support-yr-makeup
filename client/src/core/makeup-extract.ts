/**
 * 화장 떼기 (2026-10-06 POC) — AI 가 내 얼굴에 입힌 화장 사진에서, 맨얼굴과의 차이로 부위별 화장 모양을 떼서 가이드로 쓴다.
 * 사용자가 고른 목표 = AI 가 내 얼굴에 입힌 그 모습이라, 거기서 떼야 "본 대로 그리면 맞는" 가이드가 된다 (사용자와 정리).
 *
 * 두 사진은 같은 크기 · 같은 자리로 맞춰져 있어야 한다 (AI 결과는 얼굴 점으로 맨얼굴에 맞춰 넘긴다).
 *  1. 화장 안 하는 자리(이마)의 색 차이 = AI 가 바꾼 조명 · 피부 톤 → 화장 사진 전체에서 뺀다
 *  2. 부위 찾을 자리 안에서 픽셀마다 색 차(ΔE)
 *  3. 블러셔: 가장 진한 곳의 BLUSH_EXTRACT.edge 까지를 화장으로 → 덩어리 모멘트로 타원(가운데 · 반지름 · 기울기)
 *     완성본(makeup-paint)의 방사형 블러셔는 그 자리가 지금 가이드 타원과 거의 같다
 * 다른 부위(섀도우 · 라이너 · 입술 · 눈썹)는 다음.
 */

import { deltaE, foreheadLab, labAt, pointInPoly, type Lab, type RgbaImage } from "./color";
import { LM } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

/**
 * minDeltaE: 가장 진한 곳 색 차가 이보다 작으면 블러셔 없음 · edge: 가장 진한 곳의 이 비율까지 화장으로 본다 ·
 * peakPct: 가장 진한 곳 = 자리 안 색 차의 이 백분위(튀는 점 무시) · minPixels: 덩어리가 이보다 작으면 없음. 눈대중 시작값
 */
export const BLUSH_EXTRACT = { minDeltaE: 3, edge: 0.3, peakPct: 0.98, minPixels: 40 } as const;

export interface ExtractedBlob {
  center: Pt;
  /** 긴 · 짧은 반지름 (px) */
  rx: number;
  ry: number;
  /** 긴 축 기울기 (사진 좌표, °) */
  angleDeg: number;
  /** 타원 테두리 (가이드로 쓴다) */
  outline: Pt[];
  /** 가장 진한 곳 색 차 */
  peakDeltaE: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;

/** 얼굴 좌표: 원점 = 두 눈꼬리 가운데, u = 사진 왼쪽 눈꼬리 → 오른쪽 눈꼬리, v = u 에 수직(아래) */
export function faceFrame(lm: readonly Pt[]) {
  const a = lm[LM.eyeA.outer]!, b = lm[LM.eyeB.outer]!, d = sub(b, a), len = Math.hypot(d.x, d.y) || 1;
  const u = { x: d.x / len, y: d.y / len }, v = { x: -u.y, y: u.x }, o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    eyeW: len,
    to: (p: Pt) => ({ a: dot(sub(p, o), u), b: dot(sub(p, o), v) }),
    from: (a2: number, b2: number): Pt => ({ x: o.x + u.x * a2 + v.x * b2, y: o.y + u.y * a2 + v.y * b2 }),
  };
}

/** 볼 찾을 자리 (얼굴 좌표 범위) — 그쪽 눈 아래 ~ 입꼬리 높이, 눈머리 ~ 얼굴 옆선 조금 안쪽 */
export function cheekZone(lm: readonly Pt[], side: Side) {
  const f = faceFrame(lm), eye = side === "R" ? LM.eyeA : LM.eyeB;
  const lowLid = Math.max(...eye.lower.map((i) => f.to(lm[i]!).b));
  const mouth = (f.to(lm[LM.lipsOuter[0]!]!).b + f.to(lm[LM.lipsOuter[Math.floor(LM.lipsOuter.length / 2)]!]!).b) / 2;
  const edgeR = f.to(lm[LM.faceL]!).a, edgeL = f.to(lm[LM.faceR]!).a, inner = f.to(lm[eye.inner]!).a;
  const pad = 0.03 * f.eyeW;
  const [a0, a1] = side === "R" ? [Math.min(edgeR, edgeL) + pad, inner] : [inner, Math.max(edgeR, edgeL) - pad];
  return { f, a0: Math.min(a0, a1), a1: Math.max(a0, a1), b0: lowLid + pad, b1: Math.max(lowLid + pad, mouth) };
}

/** 정원 n 점 타원 (사진 좌표) */
function ellipsePts(c: Pt, rx: number, ry: number, deg: number, n = 28): Pt[] {
  const t = (deg * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
  return Array.from({ length: n }, (_, k) => {
    const s = (2 * Math.PI * k) / n, x = rx * Math.cos(s), y = ry * Math.sin(s);
    return { x: c.x + x * ct - y * st, y: c.y + x * st + y * ct };
  });
}

/** 맨얼굴 · 화장 사진의 이마 색 차 — AI 가 바꾼 조명 · 톤. 화장 사진 색에서 빼면 맨얼굴 기준이 된다 */
function toneShift(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[]): Lab {
  const a = foreheadLab(bare, lm), b = foreheadLab(made, lm);
  return a && b ? { L: b.L - a.L, a: b.a - a.a, b: b.b - a.b } : { L: 0, a: 0, b: 0 };
}

/** 블러셔 떼기 — 좌우마다 타원. 없으면 null */
export function extractCheek(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[], opts: typeof BLUSH_EXTRACT = BLUSH_EXTRACT): Record<Side, ExtractedBlob | null> {
  const shift = toneShift(bare, made, lm);
  const one = (side: Side): ExtractedBlob | null => {
    const z = cheekZone(lm, side);
    const corners = [z.f.from(z.a0, z.b0), z.f.from(z.a1, z.b0), z.f.from(z.a1, z.b1), z.f.from(z.a0, z.b1)];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const px: { x: number; y: number; d: number }[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(bare.h - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(bare.w - 1, Math.ceil(Math.max(...xs))); x++) {
        const q = z.f.to({ x, y });
        if (q.a < z.a0 || q.a > z.a1 || q.b < z.b0 || q.b > z.b1) continue;
        // AI 사진이 닿지 않는 빈칸(맞춰 넣고 남은 바깥, 투명)은 건너뛴다
        if ((made.data[(y * made.w + x) * 4 + 3] ?? 255) < 250) continue;
        const m = labAt(made, x, y);
        px.push({ x, y, d: deltaE(labAt(bare, x, y), { L: m.L - shift.L, a: m.a - shift.a, b: m.b - shift.b }) });
      }
    }
    if (!px.length) return null;
    const sorted = px.map((p) => p.d).sort((a, b) => a - b);
    const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * opts.peakPct))]!;
    if (peak < opts.minDeltaE) return null;
    const on = px.filter((p) => p.d >= peak * opts.edge);
    if (on.length < opts.minPixels) return null;
    const c = { x: on.reduce((s, p) => s + p.x, 0) / on.length, y: on.reduce((s, p) => s + p.y, 0) / on.length };
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of on) { const dx = p.x - c.x, dy = p.y - c.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= on.length; syy /= on.length; sxy /= on.length;
    const tr = (sxx + syy) / 2, det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
    // 고르게 찬 타원은 축 방향 분산 = 반지름² / 4
    const rx = 2 * Math.sqrt(tr + det), ry = 2 * Math.sqrt(Math.max(0, tr - det));
    const angleDeg = (0.5 * Math.atan2(2 * sxy, sxx - syy) * 180) / Math.PI;
    return { center: c, rx, ry, angleDeg, outline: ellipsePts(c, rx, ry, angleDeg), peakDeltaE: peak };
  };
  return { R: one("R"), L: one("L") };
}

// ---------- 모든 부위 (2026-10-06 사용자: "블러셔 말고 다른 부분도 최대한 다") ----------

export type ExtractPart = "lip" | "brow" | "liner" | "shadow" | "underShadow" | "cheek" | "contour" | "highlight";

export interface PartMask {
  part: ExtractPart;
  /** 좌우가 있는 부위만 (R = 사진 왼쪽) */
  side: Side | null;
  /** 사진 크기 w × h — 1 이면 이 부위로 뗀 픽셀 */
  mask: Uint8Array;
  count: number;
  /** 가장 진한 곳 색 차 */
  peakDeltaE: number;
}

/**
 * 부위별 기준. minDeltaE: 가장 진한 곳이 이보다 작으면 없음 · edge: 가장 진한 곳의 이 비율까지 화장 · minPixels: 덩어리가 이보다 작으면 없음.
 * 라이너는 '어두운 선' 으로 가른다 — 화장 사진 밝기(L) linerMaxL 아래이거나 맨얼굴보다 linerDarker 넘게 어두워진 곳.
 * 쉐딩 · 하이라이트는 얼굴 나머지에서 밝기가 contourDL 넘게 내려가거나 올라간 곳 — 조명과 갈리지 않아 참고용. 눈대중 시작값
 */
export interface ExtractOptions {
  readonly minDeltaE: Readonly<Record<"lip" | "brow" | "liner" | "shadow" | "underShadow" | "cheek" | "rest", number>>;
  readonly edge: number;
  readonly peakPct: number;
  readonly minPixels: number;
  readonly linerMaxL: number;
  readonly linerDarker: number;
  readonly contourDL: number;
  /**
   * AI 가 피부까지 바꿀 때 거르는 스위치 (2026-10-06 사용자: 피부 보정까지 같이 떼 온다 — 하나씩 켜 보며 비교).
   * blur: 두 사진을 눈 폭 × blurRatio 반경으로 살짝 흐려 비교 — 잡티 · 모공을 지운 차이(작은 점)는 사라지고 화장(덩어리)은 남는다
   * skinMap: 피부 변화를 이마 한 곳이 아니라 화장 안 하는 여러 자리(이마 · 콧등 · 턱 · 얼굴 바깥)에서 재 얼굴 전체로 이어서 뺀다
   * chroma: 블러셔 · 섀도 · 입술은 밝기 차를 chromaL 배로 줄여 본다 — 베이스는 주로 밝기만, 부위 화장은 색이 바뀐다
   */
  readonly blur: boolean;
  readonly blurRatio: number;
  readonly skinMap: boolean;
  readonly chroma: boolean;
  readonly chromaL: number;
  /**
   * adaptive: 얼굴 전체의 색 차 분포(대부분은 화장 아닌 피부)에서 중앙값 + adaptiveK × 퍼짐(MAD)을 넘는 것만 화장 —
   * AI 가 피부를 많이 바꾼 사진일수록 문턱이 저절로 올라간다 (2026-10-06 실사진: 블러셔 · 섀도 자리가 통째로 잡혔다)
   */
  readonly adaptive: boolean;
  readonly adaptiveK: number;
}

export const EXTRACT: ExtractOptions = {
  minDeltaE: { lip: 4, brow: 4, liner: 6, shadow: 3, underShadow: 3, cheek: 3, rest: 4 },
  edge: 0.3, peakPct: 0.98, minPixels: 30,
  linerMaxL: 40, linerDarker: 30, contourDL: 3,
  blur: false, blurRatio: 0.04, skinMap: false, chroma: false, chromaL: 0.4, adaptive: false, adaptiveK: 3,
};

/** 가로 · 세로 상자 흐림 (반경 r). 투명(AI 사진이 닿지 않은 빈칸) 픽셀은 섞지 않는다 */
export function boxBlur(im: RgbaImage, r: number): RgbaImage {
  const { w, h, data } = im, tmp = new Float32Array(w * h * 4), out = new Uint8ClampedArray(data.length);
  const pass = (src: ArrayLike<number>, dst: Float32Array | Uint8ClampedArray, horiz: boolean) => {
    const n = horiz ? w : h, m = horiz ? h : w;
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let d = -r; d <= r; d++) {
          const kk = k + d;
          if (kk < 0 || kk >= n) continue;
          const i = (horiz ? j * w + kk : kk * w + j) * 4;
          if ((data[i + 3] ?? 255) < 250) continue;
          sr += src[i]!; sg += src[i + 1]!; sb += src[i + 2]!; cnt++;
        }
        const o = (horiz ? j * w + k : k * w + j) * 4;
        if (cnt) { dst[o] = sr / cnt; dst[o + 1] = sg / cnt; dst[o + 2] = sb / cnt; } else { dst[o] = src[o]!; dst[o + 1] = src[o + 1]!; dst[o + 2] = src[o + 2]!; }
        dst[o + 3] = data[o + 3] ?? 255;
      }
    }
  };
  pass(data, tmp, true);
  pass(tmp, out, false);
  return { data: out, w, h };
}

/**
 * 피부 변화 지도 (skinMap) — 얼굴을 눈 폭 20% 칸으로 나눠 칸마다 (화장 − 맨얼굴) Lab 중앙값을 재고, 칸마다 반지름 눈 폭 1.5배 안
 * 칸들의 중앙값을 그 자리의 '피부 변화' 로 본다 → 넓고 고르게 변한 피부(베이스 · AI 보정)는 빠지고 주변과 다른 덩어리(화장)만 남는다.
 * 블러셔 · 입술 · 섀도는 그 범위의 절반보다 작아 중앙값에 안 끌려간다. 처음엔 화장 안 하는 여덟 점으로만 이었는데
 * 실사진에서 AI 가 이마 · 코 · 볼을 곳곳 다르게 밝혀 다 못 뺐다 (2026-10-06)
 */
function skinShiftMap(bare: RgbaImage, made: RgbaImage, lm: readonly Pt[], eyeW: number): ((x: number, y: number) => Lab) | null {
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
  const cell = Math.max(4, Math.round(0.2 * eyeW));
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - cell)), y0 = Math.max(0, Math.floor(Math.min(...ys) - cell));
  const x1 = Math.min(bare.w - 1, Math.ceil(Math.max(...xs) + cell)), y1 = Math.min(bare.h - 1, Math.ceil(Math.max(...ys) + cell));
  const gw = Math.max(1, Math.ceil((x1 - x0 + 1) / cell)), gh = Math.max(1, Math.ceil((y1 - y0 + 1) / cell));
  const med = (v: number[]) => { v.sort((a, b) => a - b); return v[v.length >> 1]!; };
  const cellD: (Lab | null)[] = new Array(gw * gh).fill(null);
  const step = Math.max(1, Math.round(cell / 6));
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const L: number[] = [], A: number[] = [], B: number[] = [];
    for (let y = y0 + gy * cell; y < Math.min(y1 + 1, y0 + (gy + 1) * cell); y += step) for (let x = x0 + gx * cell; x < Math.min(x1 + 1, x0 + (gx + 1) * cell); x += step) {
      if ((made.data[(y * made.w + x) * 4 + 3] ?? 255) < 250) continue;
      const b = labAt(bare, x, y), m = labAt(made, x, y);
      L.push(m.L - b.L); A.push(m.a - b.a); B.push(m.b - b.b);
    }
    if (L.length >= 3) cellD[gy * gw + gx] = { L: med(L), a: med(A), b: med(B) };
  }
  if (!cellD.some(Boolean)) return null;
  const rc = Math.max(1, Math.ceil((1.5 * eyeW) / cell));
  const bg: Lab[] = new Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const L: number[] = [], A: number[] = [], B: number[] = [];
    for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) {
      if (dx * dx + dy * dy > rc * rc || gx + dx < 0 || gx + dx >= gw || gy + dy < 0 || gy + dy >= gh) continue;
      const c = cellD[(gy + dy) * gw + (gx + dx)];
      if (!c) continue;
      L.push(c.L); A.push(c.a); B.push(c.b);
    }
    bg[gy * gw + gx] = L.length ? { L: med(L), a: med(A), b: med(B) } : { L: 0, a: 0, b: 0 };
  }
  // 칸 가운데 사이를 겹선형으로 잇는다
  return (x, y) => {
    const fx = Math.min(gw - 1, Math.max(0, (x - x0) / cell - 0.5)), fy = Math.min(gh - 1, Math.max(0, (y - y0) / cell - 0.5));
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const at = (i: number, j: number) => bg[Math.min(gh - 1, j) * gw + Math.min(gw - 1, i)]!;
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    const mix = (k: keyof Lab) => (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + d[k] * tx) * ty;
    return { L: mix("L"), a: mix("a"), b: mix("b") };
  };
}

/** MediaPipe 얼굴 윤곽 (이마 위 → 오른쪽 → 턱 → 왼쪽) */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const scaleAbout = (ps: readonly Pt[], k: number): Pt[] => {
  const c = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  return ps.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
};

interface Zone { part: ExtractPart; side: Side | null; poly: Pt[] }

/** 부위 찾을 자리 — 얼굴 점으로. 순서 = 먼저 가져가는 순서 (라이너 → 섀도 → 아래 섀도 → 볼) */
function zones(lm: readonly Pt[]): { list: Zone[]; exclude: Pt[][] } {
  const P = (i: number): Pt => lm[i]!;
  const f = faceFrame(lm);
  const up = (() => { const a = f.from(0, 0), b = f.from(0, -1); return { x: b.x - a.x, y: b.y - a.y }; })();
  const down = { x: -up.x, y: -up.y };
  const list: Zone[] = [{ part: "lip", side: null, poly: scaleAbout(LM.lipsOuter.map(P), 1.15) }];
  const exclude: Pt[][] = [];
  const sides = [{ side: "R" as Side, eye: LM.eyeA, brow: LM.browA }, { side: "L" as Side, eye: LM.eyeB, brow: LM.browB }];
  // 눈썹 둘레 — 1.35 배로 잡으니 이마 피부까지 들어왔다 (실사진 2026-10-06)
  for (const { side, brow } of sides) list.push({ part: "brow", side, poly: scaleAbout([...brow.upper.map(P), ...[...brow.lower].reverse().map(P)], 1.2) });
  for (const { side, eye, brow } of sides) {
    const o = P(eye.outer), i = P(eye.inner), ew = Math.hypot(o.x - i.x, o.y - i.y) || 1;
    const out = { x: (o.x - i.x) / ew, y: (o.y - i.y) / ew };
    // 눈 양 끝이 윗눈꺼풀 배열의 어느 쪽인지 — 바깥 끝부터 차례로
    const lidRaw = eye.upper.map(P), lid = Math.hypot(lidRaw[0]!.x - o.x, lidRaw[0]!.y - o.y) < Math.hypot(lidRaw[lidRaw.length - 1]!.x - o.x, lidRaw[lidRaw.length - 1]!.y - o.y) ? lidRaw : [...lidRaw].reverse();
    const lowRaw = eye.lower.map(P), low = Math.hypot(lowRaw[0]!.x - o.x, lowRaw[0]!.y - o.y) < Math.hypot(lowRaw[lowRaw.length - 1]!.x - o.x, lowRaw[lowRaw.length - 1]!.y - o.y) ? lowRaw : [...lowRaw].reverse();
    const bRaw = brow.lower.map(P), bLow = Math.hypot(bRaw[0]!.x - o.x, bRaw[0]!.y - o.y) < Math.hypot(bRaw[bRaw.length - 1]!.x - o.x, bRaw[bRaw.length - 1]!.y - o.y) ? bRaw : [...bRaw].reverse();
    // 눈알(흰자 · 홍채)만 뺀다 — 눈꺼풀 선보다 조금 안쪽. 크게 잡으면 속눈썹 선 위 라이너까지 빠졌다 (시험 X13)
    exclude.push(scaleAbout([...lid, ...[...low].reverse()], 0.92));
    list.push({ part: "liner", side, poly: [
      ...lid.map((p) => add(p, down, 0.03 * ew)), ...[...lid].reverse().map((p) => add(p, up, 0.15 * ew)),
      add(add(o, out, 0.45 * ew), up, 0.15 * ew), add(o, out, 0.45 * ew),
    ] });
    list.push({ part: "shadow", side, poly: [
      ...lid, ...[...bLow].reverse().map((p) => add(p, down, 0.03 * ew)),
      add(add(o, out, 0.5 * ew), up, 0.25 * ew), add(o, out, 0.5 * ew),
    ] });
    list.push({ part: "underShadow", side, poly: [
      ...low, ...[...low].reverse().map((p) => add(p, down, 0.25 * ew)), add(add(o, out, 0.3 * ew), down, 0.1 * ew),
    ] });
  }
  for (const { side } of sides) {
    const z = cheekZone(lm, side);
    list.push({ part: "cheek", side, poly: [z.f.from(z.a0, z.b0), z.f.from(z.a1, z.b0), z.f.from(z.a1, z.b1), z.f.from(z.a0, z.b1)] });
  }
  // 얼굴 나머지 — 쉐딩 · 하이라이트를 함께 본다. 윤곽 가장자리(머리선 · 배경)는 빼려고 안쪽으로 8% 줄인다
  list.push({ part: "contour", side: null, poly: scaleAbout(FACE_OVAL.map(P), 0.92) });
  return { list, exclude };
}

/** 한 픽셀의 색 차 — d: 거르기 적용한 차(색 위주면 밝기를 줄여 잰 것) · dL: 밝기 차 · L: 화장 사진 밝기(톤 뺀) · bL · mL: 맨얼굴 · 화장 사진 밝기 그대로 */
export interface DiffPx { d: number; dL: number; L: number; bL: number; mL: number }

/**
 * 맨얼굴 ↔ 화장 사진 색 차 — 떼기(extractAll)와 모양 숫자 재기(makeup-fit)가 같은 기준을 쓴다.
 * 스위치(blur · skinMap · adaptive)를 여기서 다 적용하고, floor 는 adaptive 의 '피부 변화 윗선'(꺼져 있으면 0).
 */
export interface DiffField {
  w: number;
  h: number;
  /** 눈 폭 (두 눈 평균, px) */
  eyeW: number;
  floor: number;
  /** 색 위주(colorZone)면 밝기 차를 chromaL 배로 줄여 잰다. AI 사진이 닿지 않은 빈칸이면 null */
  at(x: number, y: number, colorZone?: boolean): DiffPx | null;
}

export function diffField(bare0: RgbaImage, made0: RgbaImage, lm: readonly Pt[], opts: ExtractOptions = EXTRACT): DiffField {
  const eyeW = (Math.hypot(lm[LM.eyeA.outer]!.x - lm[LM.eyeA.inner]!.x, lm[LM.eyeA.outer]!.y - lm[LM.eyeA.inner]!.y) + Math.hypot(lm[LM.eyeB.outer]!.x - lm[LM.eyeB.inner]!.x, lm[LM.eyeB.outer]!.y - lm[LM.eyeB.inner]!.y)) / 2;
  const br = Math.max(1, Math.round(opts.blurRatio * eyeW));
  const bare = opts.blur ? boxBlur(bare0, br) : bare0, made = opts.blur ? boxBlur(made0, br) : made0;
  const flat = toneShift(bare, made, lm);
  const map = opts.skinMap ? skinShiftMap(bare, made, lm, eyeW) : null;
  const shiftAt = (x: number, y: number): Lab => (map ? map(x, y) : flat);
  const at = (x: number, y: number, colorZone = false): DiffPx | null => {
    if ((made.data[(y * made.w + x) * 4 + 3] ?? 255) < 250) return null;
    const sh = shiftAt(x, y), b = labAt(bare, x, y), m0 = labAt(made, x, y), m = { L: m0.L - sh.L, a: m0.a - sh.a, b: m0.b - sh.b };
    const dL = m.L - b.L, d = colorZone ? Math.hypot(opts.chromaL * dL, m.a - b.a, m.b - b.b) : deltaE(b, m);
    return { d, dL, L: m.L, bL: b.L, mL: m0.L };
  };
  // adaptive: 얼굴 상자 안 색 차 분포 — 대부분이 화장 아닌 피부라 중앙값 + K × 퍼짐(MAD × 1.4826) 이 '피부 변화' 의 윗선
  let floor = 0;
  if (opts.adaptive) {
    const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y), st = Math.max(1, Math.round(eyeW / 20)), v: number[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(bare.h - 1, Math.ceil(Math.max(...ys))); y += st) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(bare.w - 1, Math.ceil(Math.max(...xs))); x += st) {
        const q = at(x, y);
        if (q) v.push(q.d);
      }
    }
    if (v.length) {
      v.sort((a, b) => a - b);
      const m = v[v.length >> 1]!, dev = v.map((d) => Math.abs(d - m)).sort((a, b) => a - b), mad = dev[dev.length >> 1]! * 1.4826;
      floor = m + opts.adaptiveK * mad;
    }
  }
  return { w: bare.w, h: bare.h, eyeW, floor, at };
}

/** 모든 부위 떼기 — 겹치는 자리는 앞 부위가 먼저 가져간다. 눈알은 늘 뺀다 */
export function extractAll(bare0: RgbaImage, made0: RgbaImage, lm: readonly Pt[], opts: ExtractOptions = EXTRACT): { w: number; h: number; parts: PartMask[] } {
  const field = diffField(bare0, made0, lm, opts), { w, h, floor } = field;
  const taken = new Uint8Array(w * h), parts: PartMask[] = [];
  const { list, exclude } = zones(lm);
  const inside = (x: number, y: number, polys: readonly Pt[][]) => polys.some((q) => pointInPoly(x, y, q));
  for (const z of list) {
    // 색 위주로 볼 부위 (chroma 스위치) — 라이너 · 눈썹 · 쉐딩/하이라이트는 밝기 변화가 화장이라 그대로
    const colorZone = opts.chroma && (z.part === "lip" || z.part === "cheek" || z.part === "shadow" || z.part === "underShadow");
    const xs = z.poly.map((p) => p.x), ys = z.poly.map((p) => p.y);
    const px: { i: number; d: number; dL: number; L: number }[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++) {
        const i = y * w + x;
        if (taken[i] || !pointInPoly(x, y, z.poly) || inside(x, y, exclude)) continue;
        const q = field.at(x, y, colorZone);
        if (!q) continue;
        // 얼굴 나머지(쉐딩 · 하이라이트)에서 아주 어두운 픽셀은 머리카락 · 그늘 — 화장으로 안 본다
        if (z.part === "contour" && Math.min(q.bL, q.mL) < 25) continue;
        px.push({ i, d: q.d, dL: q.dL, L: q.L });
      }
    }
    if (!px.length) continue;
    const key = z.part === "contour" ? "rest" : z.part;
    const sorted = px.map((p) => p.d).sort((a, b) => a - b);
    const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * opts.peakPct))]!;
    // adaptive 의 윗선은 색 위주(chroma)로 잰 부위에는 밝기를 줄여 잰 만큼 같이 줄인다
    const fl = colorZone ? floor * opts.chromaL : floor;
    if (peak < opts.minDeltaE[key as keyof typeof opts.minDeltaE] || (fl > 0 && peak < fl)) continue;
    // 라이너는 '어두운 선' 이 기준이라 가장 진한 곳 비율을 안 쓴다 — 원래 속눈썹 위에 겹친 선은 색 차가 작다 (시험 X13)
    const th = Math.max(z.part === "liner" ? opts.minDeltaE.liner : Math.max(opts.minDeltaE[key as keyof typeof opts.minDeltaE], peak * opts.edge), fl);
    const dark = (p: (typeof px)[number]) => p.L <= opts.linerMaxL || p.dL <= -opts.linerDarker;
    const pick = (keep: (p: (typeof px)[number]) => boolean, part: ExtractPart) => {
      const on = px.filter((p) => p.d >= th && keep(p));
      if (on.length < opts.minPixels) return;
      const mask = new Uint8Array(w * h);
      for (const p of on) { mask[p.i] = 1; taken[p.i] = 1; }
      parts.push({ part, side: z.side, mask, count: on.length, peakDeltaE: peak });
    };
    if (z.part === "liner") pick(dark, "liner");
    // 섀도 자리의 아주 어두운 픽셀은 라이너 · 속눈썹 — 섀도로 안 가져간다
    else if (z.part === "shadow" || z.part === "underShadow") pick((p) => p.L > opts.linerMaxL, z.part);
    else if (z.part === "contour") {
      pick((p) => p.dL <= -opts.contourDL, "contour");
      pick((p) => p.dL >= opts.contourDL, "highlight");
    } else pick(() => true, z.part);
  }
  return { w, h, parts };
}
