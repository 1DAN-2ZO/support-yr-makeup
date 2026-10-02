/**
 * C안 — 눈 모양 틀에 맞추기 (화면 4 테두리, 고개를 많이 돌렸을 때 먼 쪽 눈, 2026-10-02 PC).
 *
 * 고개를 많이 돌리면 MediaPipe 먼 쪽 눈꺼풀 점 몇 개가 빗나간다(눈머리가 코 쪽으로 삐져나오고, 눈꼬리가 눈동자 테두리에 끌려감).
 * 정면에서 본 그 사람의 눈 모양(눈꺼풀 점 16개)을 하나의 틀로 보고, 지금 눈꺼풀 점에 늘이기·기울이기·옮기기(아핀)로 한꺼번에 맞추되
 * 튀는 점은 무게를 빼며 다시 맞춘다(Tukey 가중 반복). MediaPipe 눈 정보는 그대로 쓰면서 틀린 몇 개만 거른다 —
 * 눈 주변 점(A안)·머리 입체 회전(B안)과 달리 틀을 세로로 눌러 맞출 수 있어 눈을 감거나 내리깔아도 따라간다.
 * 점 대부분이 한쪽으로 같이 쏠리면 못 고친다.
 */

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

/** 각도 차가 이만큼까지는 눈꺼풀 점(그물) 그대로, 이만큼부터는 눈 모양 틀만 (rigidPoseDiff 눈금 — 화면 4 각도 차 한계 12 와 같은 눈금). 가정값 */
export const FAR_EYE = { from: 12, to: 25 } as const;

/** 먼 쪽 눈을 틀로 넘기는 정도 0~1 */
export function farEyeWeight(absYawDiff: number): number {
  const t = (absYawDiff - FAR_EYE.from) / (FAR_EYE.to - FAR_EYE.from);
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
