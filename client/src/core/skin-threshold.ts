/**
 * 웜/쿨 기준 T 찾기 (스파이크 skin-batch-probe, 2026-10-09).
 *
 * 사진마다 숫자 하나(축: 색상각 h° · b* …)와 정답(웜인가)이 있을 때, 그 숫자 위에서
 *  - 두 집단이 얼마나 갈리는지(AUC — T 와 무관한 분리도),
 *  - 어디에 선을 그으면 가장 덜 틀리는지(균형 정확도 최대 T · 방향),
 *  - 선 둘레 ±margin 을 "애매"로 빼면 정확도·남는 비율이 어떻게 되는지
 * 를 낸다. 순수 함수. 정확도는 **균형 정확도**(웜·쿨 각각의 맞힌 비율 평균)를 쓴다 — 두 집단 수가 달라도 한쪽 찍기로 안 높아진다.
 *
 * 축 "논문식 D" 는 2012 논문(이은영·박길순)의 판별식으로 접촉식 측색계 값용이다. 폰 사진에서는 절편이 안 맞을 것이라
 * T 를 다시 찾는 쪽이 맞고, 그래서 비교 기준으로만 둔다.
 */

import type { Lab } from "./color";
import { labToLch } from "./skin-color";

export interface Item {
  v: number;
  warm: boolean;
}

/** T 를 찾을 수 있는 축 — Lab 한 점에서 숫자 하나 */
export const AXES = {
  h: { label: "색상각 h°", of: (l: Lab): number => labToLch(l).h },
  b: { label: "b* (노란기)", of: (l: Lab): number => l.b },
  a: { label: "a* (붉은기)", of: (l: Lab): number => l.a },
  C: { label: "채도 C*", of: (l: Lab): number => labToLch(l).C },
  D: { label: "논문식 D", of: (l: Lab): number => paperD(l) },
  L: { label: "밝기 L* (대조군)", of: (l: Lab): number => l.L },
} as const;
export type AxisId = keyof typeof AXES;

/** 2012 논문 판별식: D ≥ 0.463 이면 웜 (접촉식 측색계 값 기준) */
export const paperD = (l: Lab): number => -14.773 + 0.406 * l.a + 0.662 * l.b;

/** P(웜 값 > 쿨 값) (같으면 0.5 로 셈). 0.5 면 못 가르고, 0 이나 1 에 가까울수록 잘 갈림(0 은 방향이 반대). 한쪽이 비면 null */
export function auc(items: readonly Item[]): number | null {
  const warm = items.filter((i) => i.warm), cool = items.length - warm.length;
  if (!warm.length || !cool) return null;
  const sorted = [...items].sort((p, q) => p.v - q.v);
  // 같은 값 묶음마다 평균 순위
  let rankSumWarm = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.v === sorted[i]!.v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (sorted[k]!.warm) rankSumWarm += rank;
    i = j + 1;
  }
  return (rankSumWarm - (warm.length * (warm.length + 1)) / 2) / (warm.length * cool);
}

export interface Fit {
  threshold: number;
  /** +1: 값이 T 보다 크면 웜 · −1: 작으면 웜 */
  dir: 1 | -1;
  balAcc: number;
}

/** 균형 정확도가 가장 높은 T 와 방향. 한쪽 집단이 비면 null. T 는 이웃한 서로 다른 값의 한가운데 */
export function fitThreshold(items: readonly Item[]): Fit | null {
  const nWarm = items.filter((i) => i.warm).length, nCool = items.length - nWarm;
  if (!nWarm || !nCool) return null;
  const sorted = [...items].sort((p, q) => p.v - q.v);
  // T 아래(≤)에 쿨 cb · 웜 wb 개가 있을 때, 방향 +1 의 균형 정확도 = ((nWarm − wb)/nWarm + cb/nCool)/2
  let best: Fit | null = null;
  let wb = 0, cb = 0;
  const consider = (threshold: number): void => {
    const plus = ((nWarm - wb) / nWarm + cb / nCool) / 2;
    const cand: Fit = plus >= 0.5 ? { threshold, dir: 1, balAcc: plus } : { threshold, dir: -1, balAcc: 1 - plus };
    if (!best || cand.balAcc > best.balAcc) best = cand;
  };
  consider(sorted[0]!.v - 1e-9);   // 전부 한쪽 — 기준선
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.v === sorted[i]!.v) j++;
    for (let k = i; k <= j; k++) { if (sorted[k]!.warm) wb++; else cb++; }
    const next = sorted[j + 1];
    consider(next ? (sorted[j]!.v + next.v) / 2 : sorted[j]!.v + 1e-9);
    i = j + 1;
  }
  return best;
}

export interface Evaluation {
  n: number;
  /** 애매(|v−T| < margin)가 아니라서 판정한 개수 */
  kept: number;
  /** kept / n */
  coverage: number;
  /** 판정한 것 중 웜·쿨 각각의 맞힌 비율의 평균. 한쪽 집단이 비면 null */
  balAcc: number | null;
  tpr: number | null;
  tnr: number | null;
  /** 판정 결과 개수: 웜을 웜으로(tp) · 웜을 쿨로(fn) · 쿨을 쿨로(tn) · 쿨을 웜으로(fp) · 애매 (웜/쿨 정답별) */
  tp: number; fn: number; tn: number; fp: number;
  ambiguousWarm: number; ambiguousCool: number;
}

export function evaluate(items: readonly Item[], threshold: number, dir: 1 | -1, margin = 0): Evaluation {
  let tp = 0, fn = 0, tn = 0, fp = 0, ambW = 0, ambC = 0;
  for (const it of items) {
    const d = it.v - threshold;
    if (Math.abs(d) < margin) { if (it.warm) ambW++; else ambC++; continue; }
    const predictWarm = dir * d > 0;
    if (it.warm) { if (predictWarm) tp++; else fn++; } else if (predictWarm) fp++; else tn++;
  }
  const kept = tp + fn + tn + fp;
  const tpr = tp + fn ? tp / (tp + fn) : null, tnr = tn + fp ? tn / (tn + fp) : null;
  return {
    n: items.length, kept, coverage: items.length ? kept / items.length : 0,
    balAcc: tpr !== null && tnr !== null ? (tpr + tnr) / 2 : null,
    tpr, tnr, tp, fn, tn, fp, ambiguousWarm: ambW, ambiguousCool: ambC,
  };
}
