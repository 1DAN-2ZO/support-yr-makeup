/**
 * C안 — 눈 모양 틀에 맞추기 (화면 4 테두리, 고개를 많이 돌렸을 때 먼 쪽 눈, 2026-10-02 PC).
 *
 * 고개를 많이 돌리면 MediaPipe 먼 쪽 눈꺼풀 점 몇 개가 빗나간다(눈머리가 코 쪽으로 삐져나오고, 눈꼬리가 눈동자 테두리에 끌려감).
 * 정면에서 본 그 사람의 눈 모양(눈꺼풀 점 16개)을 하나의 틀로 보고, 지금 눈꺼풀 점에 늘이기·기울이기·옮기기(아핀)로 한꺼번에 맞추되
 * 튀는 점은 무게를 빼며 다시 맞춘다(Tukey 가중 반복). MediaPipe 눈 정보는 그대로 쓰면서 틀린 몇 개만 거른다 —
 * 눈 주변 점(A안)·머리 입체 회전(B안)과 달리 틀을 세로로 눌러 맞출 수 있어 눈을 감거나 내리깔아도 따라간다.
 * 점 대부분이 한쪽으로 같이 쏠리면 못 고친다 — 그래서 F안: 먼 쪽 눈 폭만 먼 쪽 눈썹이 줄어든 비율로 고친다(stretchAlong · browSpanRatio).
 * 고개를 돌리면 눈썹과 눈은 비슷한 비율로 좁아지고, 눈썹은 그물로 잘 따라간다. 위치까지 눈썹에서 가져오면 A안처럼 깊이 문제라 폭만.
 */

import { rigidPoseDiff } from "./gate";
import { LM } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

const uniq = (ids: readonly number[]): number[] => [...new Set(ids)];

/** 눈꺼풀 점 16개 — 위·아래 눈꺼풀, 눈꼬리·눈머리는 한 번씩 */
export const EYE_CONTOUR: Record<Side, readonly number[]> = {
  R: uniq([...LM.eyeA.upper, ...LM.eyeA.lower]),
  L: uniq([...LM.eyeB.upper, ...LM.eyeB.lower]),
};

/** x' = a·x + b·y + c, y' = d·x + e·y + f */
export type Affine = readonly [number, number, number, number, number, number];

export function applyAffine(t: Affine, p: Pt): Pt {
  return { x: t[0] * p.x + t[1] * p.y + t[2], y: t[3] * p.x + t[4] * p.y + t[5] };
}

/** 무게를 준 최소제곱 아핀. 무게 있는 점이 한 줄 위에만 있으면 null */
function fitWeighted(src: readonly Pt[], dst: readonly Pt[], w: readonly number[]): Affine | null {
  let W = 0, mx = 0, my = 0, nx = 0, ny = 0;
  src.forEach((p, i) => { const k = w[i]!; W += k; mx += k * p.x; my += k * p.y; nx += k * dst[i]!.x; ny += k * dst[i]!.y; });
  if (!(W > 0)) return null;
  mx /= W; my /= W; nx /= W; ny /= W;
  let sxx = 0, sxy = 0, syy = 0, ux = 0, uy = 0, vx = 0, vy = 0;
  src.forEach((p, i) => {
    const k = w[i]!, x = p.x - mx, y = p.y - my, X = dst[i]!.x - nx, Y = dst[i]!.y - ny;
    sxx += k * x * x; sxy += k * x * y; syy += k * y * y;
    ux += k * x * X; uy += k * y * X; vx += k * x * Y; vy += k * y * Y;
  });
  const det = sxx * syy - sxy * sxy;
  if (!(det > 1e-9 * Math.max(1, sxx * syy))) return null;
  const a = (ux * syy - uy * sxy) / det, b = (uy * sxx - ux * sxy) / det;
  const d = (vx * syy - vy * sxy) / det, e = (vy * sxx - vx * sxy) / det;
  return [a, b, nx - a * mx - b * my, d, e, ny - d * mx - e * my];
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/**
 * 튀는 점을 빼며 맞춘 아핀 (src 틀 → dst 지금). floor: 이 거리(px)까지는 튀는 점으로 보지 않는다 (점 흔들림).
 * 맞출 수 없으면 null
 */
export function robustAffine(src: readonly Pt[], dst: readonly Pt[], floor: number): Affine | null {
  const n = Math.min(src.length, dst.length);
  const s = src.slice(0, n), d = dst.slice(0, n);
  let t = fitWeighted(s, d, s.map(() => 1));
  if (!t) return null;
  for (let it = 0; it < 10; it++) {
    const r = s.map((p, i) => { const q = applyAffine(t!, p); return Math.hypot(q.x - d[i]!.x, q.y - d[i]!.y); });
    const c = Math.max(floor, 3 * 1.4826 * median(r));
    const w = r.map((ri) => (ri < c ? (1 - (ri / c) ** 2) ** 2 : 0));
    const next = fitWeighted(s, d, w);
    if (!next) break;
    t = next;
  }
  return t;
}

/** c 를 지나는 dir(단위 벡터) 방향 성분만 f 배 — 수직 성분은 그대로 (눈 폭만 고치기) */
export function stretchAlong(p: Pt, c: Pt, dir: Pt, f: number): Pt {
  const a = (p.x - c.x) * dir.x + (p.y - c.y) * dir.y;
  return { x: p.x + (f - 1) * a * dir.x, y: p.y + (f - 1) * a * dir.y };
}

/**
 * 눈썹 길이 비율(지금 / 정면) — from 번째 점 · 안쪽 끝(위·아래 눈썹 선 평균) 사이 거리. 못 재면 null.
 * from 0 = 눈썹 전체(바깥 끝부터), 가운데 = 앞쪽 절반 (G안 2: 크게 돌리면 먼 쪽 눈썹 꼬리는 관자놀이로 돌아 들어가 눈보다 더 짧아 보인다)
 */
export function browSpanRatio(base: readonly Pt[], cur: readonly Pt[], brow: { upper: readonly number[]; lower: readonly number[] }, from = 0): number | null {
  const end = (lm: readonly Pt[], k: "first" | "last"): Pt | null => {
    const u = lm[k === "first" ? brow.upper[from]! : brow.upper[brow.upper.length - 1]!], l = lm[k === "first" ? brow.lower[from]! : brow.lower[brow.lower.length - 1]!];
    return u && l ? { x: (u.x + l.x) / 2, y: (u.y + l.y) / 2 } : null;
  };
  const span = (lm: readonly Pt[]): number | null => {
    const a = end(lm, "first"), b = end(lm, "last");
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };
  const sb = span(base), sc = span(cur);
  return sb && sc ? sc / sb : null;
}

/** 각도 차가 이만큼까지는 눈꺼풀 점(그물) 그대로, 이만큼부터는 눈 모양 틀만 (rigidPoseDiff 눈금 — 화면 4 각도 차 한계 12 와 같은 눈금). 가정값 */
export const FAR_EYE = { from: 12, to: 25 } as const;

/** 먼 쪽 눈을 틀로 넘기는 정도 0~1 */
export function farEyeWeight(absYawDiff: number): number {
  const t = (absYawDiff - FAR_EYE.from) / (FAR_EYE.to - FAR_EYE.from);
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length });
/** 눈 가운데(눈꺼풀 점 16개 평균) */
export const eyeCenter = (side: Side, lm: readonly Pt[]): Pt => mean(EYE_CONTOUR[side].map((i) => lm[i]!));
/** 먼 쪽 눈 = 코끝이 움직인 쪽 눈 (고개를 돌리면 먼 쪽 눈이 코 뒤로 간다) */
export const farSide = (d: number, cur: readonly Pt[]): Side => ((d > 0) === (eyeCenter("R", cur).x > eyeCenter("L", cur).x) ? "R" : "L");

export interface FarEyeOptions {
  /** 1 눈 폭을 고칠 때 MediaPipe 눈머리를 고정하고 눈꼬리 쪽으로만 (아니면 가운데 기준 — F안). PC 에서 그 눈머리 점도 끌려가 있어 기본 꺼짐 */
  anchorInner: boolean;
  /** 2 눈 폭 비율을 눈썹 앞쪽 절반으로 (아니면 눈썹 전체) */
  browHalf: boolean;
  /** 3 높이는 정면보다 커지지 않게 — 눈을 감아 작아지는 것만 따라감 */
  capHeight: boolean;
  /** H 눈꼬리 끝은 먼 쪽 눈썹 꼬리 위치로 (정면에서 본 눈꼬리 ↔ 눈썹 관계). 늘리기만 한다 */
  outerFromBrow: boolean;
}

/** PC 시험(2026-10-02)으로 고른 조합 — 2 · 3 · H */
export const FAR_EYE_DEFAULT: FarEyeOptions = { anchorInner: false, browHalf: true, capHeight: true, outerFromBrow: true };

/**
 * 눈썹(가운데 → 바깥 끝, 위·아래 평균)을 축으로 정면 눈꼬리 끝의 자리를 기억해 두고 지금 눈썹에 놓는다 (H안).
 * 눈썹이 납작하면 null
 */
function outerFromBrow(baseLm: readonly Pt[], cur: readonly Pt[], outer: number, brow: { upper: readonly number[]; lower: readonly number[] }): Pt | null {
  const mid = Math.floor(brow.upper.length / 2);
  const avg = (lm: readonly Pt[], k: number): Pt => ({ x: (lm[brow.upper[k]!]!.x + lm[brow.lower[k]!]!.x) / 2, y: (lm[brow.upper[k]!]!.y + lm[brow.lower[k]!]!.y) / 2 });
  const frame = (lm: readonly Pt[]) => {
    const m = avg(lm, mid), e = avg(lm, 0), L = Math.hypot(e.x - m.x, e.y - m.y);
    return L > 1e-6 ? { m, L, u: { x: (e.x - m.x) / L, y: (e.y - m.y) / L } } : null;
  };
  const fb = frame(baseLm), fc = frame(cur);
  if (!fb || !fc) return null;
  const o = baseLm[outer]!, dx = o.x - fb.m.x, dy = o.y - fb.m.y;
  // 눈썹 축 좌표(눈썹 길이 단위): a = 축 방향, b = 수직
  const a = (dx * fb.u.x + dy * fb.u.y) / fb.L, b = (-dx * fb.u.y + dy * fb.u.x) / fb.L;
  return { x: fc.m.x + fc.L * (a * fc.u.x - b * fc.u.y), y: fc.m.y + fc.L * (a * fc.u.y + b * fc.u.x) };
}

export interface FarEyeFix {
  far: Side;
  /** 0~1 — farEyeWeight(yaw). 호출자가 이 가중치로 원래 점과 블렌드한다 */
  weight: number;
  /** 기준 얼굴의 점 → 지금 얼굴에서 그 점이 있어야 할 자리 (로버스트 아핀 + 폭·높이·눈꼬리 다듬기) */
  place: (basePt: Pt) => Pt;
}

/**
 * 먼 쪽 눈 보정 (C·F·G·H안, eye-fit.ts, 2026-10-02 PC 실측·#277) — 화면 4(core/live-run.ts)와 2-b AR
 * (screens/fullrender.ts)가 같이 쓴다. **둘 중 하나만 고치면 어긋나니 여기만 고친다(중복 구현 금지, #291 리뷰).**
 * yaw 각도 차가 FAR_EYE.from(12°) 안쪽이면 null(보정 없음) — 맨 처음 하는 일이니 호출마다 싸다.
 */
export function computeFarEyeFix(baseLm: readonly Pt[], cur: readonly Pt[], g: FarEyeOptions = FAR_EYE_DEFAULT): FarEyeFix | null {
  const d = rigidPoseDiff(baseLm, cur).yaw, weight = farEyeWeight(Math.abs(d));
  if (weight <= 0) return null;
  const far = farSide(d, cur), near: Side = far === "R" ? "L" : "R";
  // 점 흔들림(px)은 튀는 점으로 안 본다 — 가까운 쪽 눈 폭의 3% (가까운 쪽은 잘 잡힌다)
  const nearEye = near === "R" ? LM.eyeA : LM.eyeB;
  const floor = 0.03 * Math.hypot(cur[nearEye.outer]!.x - cur[nearEye.inner]!.x, cur[nearEye.outer]!.y - cur[nearEye.inner]!.y);
  const t = robustAffine(EYE_CONTOUR[far].map((i) => baseLm[i]!), EYE_CONTOUR[far].map((i) => cur[i]!), Math.max(1, floor));
  if (!t) return null;
  // F안: 눈꺼풀 점이 통째로 눈동자 쪽으로 쪼그라들면 틀도 쪼그라든다 → 눈 폭만 먼 쪽 눈썹이 줄어든 비율로 (위치·위아래는 그대로)
  const eye = far === "R" ? LM.eyeA : LM.eyeB, brow = far === "R" ? LM.browA : LM.browB;
  const k = browSpanRatio(baseLm, cur, brow, g.browHalf ? Math.floor(brow.upper.length / 2) : 0);
  let fix = (q: Pt): Pt => q;
  const O = applyAffine(t, baseLm[eye.outer]!), I = applyAffine(t, baseLm[eye.inner]!);
  const len = Math.hypot(O.x - I.x, O.y - I.y);
  if (len < 1e-6) return null;
  const dir = { x: (O.x - I.x) / len, y: (O.y - I.y) / len };
  if (k) {
    const want = k * Math.hypot(baseLm[eye.outer]!.x - baseLm[eye.inner]!.x, baseLm[eye.outer]!.y - baseLm[eye.inner]!.y);
    const f = Math.min(2, Math.max(0.5, want / len));
    // G1: 눈머리는 잘 잡히니 고정하고 눈꼬리 쪽으로만 늘인다 (가운데 기준이면 눈머리까지 밀림)
    const anchor = g.anchorInner ? I : { x: (O.x + I.x) / 2, y: (O.y + I.y) / 2 };
    fix = (q) => stretchAlong(q, anchor, dir, f);
  }
  if (g.capHeight) {
    // G3: 고개를 돌려도 눈 높이는 거의 그대로 — 눈동자 둘레로 모인 점에 맞춰 커진 높이는 정면 높이(× 머리 크기)까지만. 작아지는 건(눈 감기) 따라감
    const n = { x: -dir.y, y: dir.x }, m = Math.floor(eye.upper.length / 2);
    const up = fix(applyAffine(t, baseLm[eye.upper[m]!]!)), lo = fix(applyAffine(t, baseLm[eye.lower[m]!]!));
    const h = Math.abs((up.x - lo.x) * n.x + (up.y - lo.y) * n.y);
    // 정면 높이도 같은 식으로 — 정면 눈 축에 수직인 성분
    const bo = baseLm[eye.outer]!, bi = baseLm[eye.inner]!, bl = Math.hypot(bo.x - bi.x, bo.y - bi.y) || 1;
    const bn = { x: -(bo.y - bi.y) / bl, y: (bo.x - bi.x) / bl }, bu = baseLm[eye.upper[m]!]!, bw = baseLm[eye.lower[m]!]!;
    const hb = Math.abs((bu.x - bw.x) * bn.x + (bu.y - bw.y) * bn.y);
    // 머리 크기: 이마 위(10) ↔ 미간(168) — 고개를 좌우로 돌려도 거의 안 변한다
    const sv = Math.hypot(cur[10]!.x - cur[168]!.x, cur[10]!.y - cur[168]!.y) / (Math.hypot(baseLm[10]!.x - baseLm[168]!.x, baseLm[10]!.y - baseLm[168]!.y) || 1);
    if (h > hb * sv && h > 1e-6) {
      const before = fix, a = before(O), b = before(I), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, s = (hb * sv) / h;
      fix = (q) => stretchAlong(before(q), c, n, s);
    }
  }
  if (g.outerFromBrow) {
    // H안: 크게 돌리면 먼 쪽 눈 바깥쪽은 관자놀이로 돌아 들어가 눌려 보여 눈꼬리 쪽이 짧게 잡힌다. 먼 쪽 눈썹은 잘 따라오니
    // 정면에서 본 '눈꼬리 끝 ↔ 눈썹(가운데 → 바깥 끝)' 관계로 지금 눈꼬리 끝을 정하고, 눈머리 쪽은 그대로 둔 채 그만큼 편다 (늘리기만)
    const want = outerFromBrow(baseLm, cur, eye.outer, brow);
    if (want) {
      const before = fix, a = before(I), b = before(O);
      const have = (b.x - a.x) * dir.x + (b.y - a.y) * dir.y, need = (want.x - a.x) * dir.x + (want.y - a.y) * dir.y;
      if (have > 1e-6 && need > have) {
        const f2 = Math.min(2, need / have);
        fix = (q) => stretchAlong(before(q), a, dir, f2);
      }
    }
  }
  return { far, weight, place: (p) => fix(applyAffine(t, p)) };
}
