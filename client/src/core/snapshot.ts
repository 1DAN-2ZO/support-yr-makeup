/**
 * 사진 가이드 (2026-10-06 POC) — 실시간 선은 손 · 브러시 · 화장 자체 때문에 그리는 동안 계속 움직인다.
 * 가만히 있는 순간을 찍어 그 사진 위에 가이드를 그린다. 한 장의 랜드마크도 흔들리니 가만히 있는 몇 장을 모아
 * 점마다 중앙값을 쓰고, 사진은 그 중앙값에 가장 가까운 장을 쓴다 (화면 5 채점이 여러 장 중앙값을 쓰는 것과 같은 생각, #147).
 */

import { HEAD_STABLE_IDS } from "./landmark-jump";
import { LM } from "./landmarks";
import type { Pt } from "./types";

/** frames: 모을 장 수 · stillTol: 앞 장 → 지금 장 머리 점 평균 이동 한계(얼굴 폭 배수). 눈대중 시작값 */
export const SNAP = { frames: 5, stillTol: 0.004 } as const;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/** 점마다 x · y 중앙값 */
export function medianLandmarks(frames: readonly (readonly Pt[])[]): Pt[] {
  const n = frames[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => ({ x: median(frames.map((f) => f[i]!.x)), y: median(frames.map((f) => f[i]!.y)) }));
}

/** 중앙값에 가장 가까운 장 (점 거리 합이 가장 작은) */
export function closestFrame(frames: readonly (readonly Pt[])[], med: readonly Pt[]): number {
  let best = 0, bestD = Infinity;
  frames.forEach((f, k) => {
    let d = 0;
    for (let i = 0; i < med.length; i++) d += Math.hypot(f[i]!.x - med[i]!.x, f[i]!.y - med[i]!.y);
    if (d < bestD) { bestD = d; best = k; }
  });
  return best;
}

/** 앞 장 → 지금 장, 잘 안 가려지는 머리 점(이마 · 콧대 · 광대)의 평균 이동이 얼굴 폭 × tol 안이면 가만히 */
export function isStill(prev: readonly Pt[], cur: readonly Pt[], tol: number = SNAP.stillTol): boolean {
  const w = Math.hypot(cur[LM.faceR]!.x - cur[LM.faceL]!.x, cur[LM.faceR]!.y - cur[LM.faceL]!.y);
  if (!(w > 0)) return false;
  const move = HEAD_STABLE_IDS.reduce((s, i) => s + Math.hypot(cur[i]!.x - prev[i]!.x, cur[i]!.y - prev[i]!.y), 0) / HEAD_STABLE_IDS.length;
  return move <= w * tol;
}

export interface Snapshot<I> {
  /** 점마다 중앙값 */
  lm: Pt[];
  /** 중앙값에 가장 가까운 장의 그림 */
  image: I;
}

/** 장면마다 push — 가만히 있는 장이 frames 개 이어지면 한 장을 돌려주고 다시 처음부터. 움직이거나 얼굴을 놓치면 처음부터 */
export function createSnapshotCollector<I>(opts: typeof SNAP = SNAP): { push(lm: readonly Pt[] | null, image: I): Snapshot<I> | null; reset(): void } {
  let buf: { lm: readonly Pt[]; image: I }[] = [];
  return {
    reset() { buf = []; },
    push(lm, image) {
      if (!lm) { buf = []; return null; }
      const last = buf[buf.length - 1];
      if (last && !isStill(last.lm, lm, opts.stillTol)) buf = [];
      buf.push({ lm, image });
      if (buf.length < opts.frames) return null;
      const frames = buf.map((b) => b.lm), med = medianLandmarks(frames), pick = buf[closestFrame(frames, med)]!;
      buf = [];
      return { lm: med, image: pick.image };
    },
  };
}
