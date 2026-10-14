/**
 * [개발용 · 화면 4 ?jump] 브러시·손이 얼굴 앞에 있을 때 눈 점이 얼마나 튀나 — 관찰용 (2026-10-02).
 *
 * 장면 사이 눈 점(눈꺼풀 16개)의 움직임에서 머리 전체 움직임을 뺀 나머지를 '튐' 으로 본다.
 * 머리 움직임은 잘 안 가려지는 점(이마 · 콧대·코 · 이마 옆 · 광대)으로 앞 장면 → 지금 변환을 맞춘 것(튀는 점 무시).
 * 눈 폭 대비 비율 — 가까이·멀리 들어도 같은 눈금. '머리 점' 은 그 맞춘 변환에서 머리 점 자체가 벗어난 정도(비교 기준)
 */

import { EYE_CONTOUR, applyAffine, robustAffine } from "./eye-fit";
import { LM } from "./landmarks";
import type { Pt } from "./types";

/** 머리 움직임을 맞출 점 — 이마 · 콧대·코 · 이마 옆 · 광대 */
export const HEAD_STABLE_IDS: readonly number[] = [
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1,
  109, 67, 103, 338, 297, 332,
  50, 280, 205, 425, 116, 345,
];

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 앞 장면 → 지금, 눈마다 튐(R = LM.eyeA · L = LM.eyeB)과 머리 점 흔들림 — 둘 다 눈 폭 대비. 못 재면 null */
export function eyeJump(prev: readonly Pt[], cur: readonly Pt[]): { R: number; L: number; head: number } | null {
  const ids = HEAD_STABLE_IDS.filter((i) => prev[i] && cur[i]);
  const t = robustAffine(ids.map((i) => prev[i]!), ids.map((i) => cur[i]!), 0.5);
  if (!t) return null;
  const w = (dist(cur[LM.eyeA.outer]!, cur[LM.eyeA.inner]!) + dist(cur[LM.eyeB.outer]!, cur[LM.eyeB.inner]!)) / 2;
  if (!(w > 0)) return null;
  const off = (list: readonly number[]): number => list.reduce((s, i) => s + dist(applyAffine(t, prev[i]!), cur[i]!), 0) / list.length / w;
  return { R: off(EYE_CONTOUR.R), L: off(EYE_CONTOUR.L), head: off(ids) };
}

const pct = (v: number): string => (v * 100).toFixed(1);

/**
 * 화면 4 한 줄 표시 — 지금 · 최근 windowMs 최대 · 얼굴 놓친 횟수.
 * 화면은 거울이라 화면 왼쪽 눈 = 영상 오른쪽 눈(LM.eyeB), 화면 오른쪽 눈 = LM.eyeA
 */
export function createJumpProbe(windowMs = 1000): { step(lm: readonly Pt[] | null, t: number): string; reset(): void } {
  let prev: readonly Pt[] | null = null;
  let hist: { t: number; R: number; L: number }[] = [];
  let lost = 0, last = { R: 0, L: 0, head: 0 };
  return {
    reset() { prev = null; hist = []; lost = 0; last = { R: 0, L: 0, head: 0 }; },
    step(lm, t) {
      if (!lm) {
        if (prev) lost++;
        prev = null;
      } else {
        const j = prev ? eyeJump(prev, lm) : null;
        last = j ?? { R: 0, L: 0, head: 0 };
        hist.push({ t, R: last.R, L: last.L });
        prev = lm;
      }
      hist = hist.filter((h) => t - h.t < windowMs);
      const mL = Math.max(0, ...hist.map((h) => h.L)), mR = Math.max(0, ...hist.map((h) => h.R));
      return `눈 튐 왼쪽 ${pct(last.L)}% · 오른쪽 ${pct(last.R)}% | 최근 1초 최대 왼쪽 ${pct(mL)}% · 오른쪽 ${pct(mR)}% | 머리 점 ${pct(last.head)}% | 얼굴 놓침 ${lost}회`;
    },
  };
}
