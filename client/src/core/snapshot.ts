/**
 * 사진 가이드 (2026-10-06 POC) — 실시간 선은 손 · 브러시 · 화장 자체 때문에 그리는 동안 계속 움직인다.
 * 가만히 있는 순간을 찍어 그 사진 위에 가이드를 그린다. 한 장의 랜드마크도 흔들리니 가만히 있는 몇 장을 모아
 * 점마다 중앙값을 쓰고, 사진은 그 중앙값에 가장 가까운 장을 쓴다 (화면 5 채점이 여러 장 중앙값을 쓰는 것과 같은 생각, #147).
 */

import { HEAD_STABLE_IDS } from "./landmark-jump";
import { LM } from "./landmarks";
import type { Pt } from "./types";

/**
 * frames: 모을 장 수 · stillTol: 앞 장 → 지금 장 머리 점 평균 이동 한계(얼굴 폭 배수) ·
 * maxWait: 이만큼 장이 지나도 못 모으면 그동안 가장 덜 움직인 frames 장으로 찍는다.
 * stillTol 0.004 는 PC 웹캠(640×480)에서 얼굴 점 떨림만으로 넘어 "가만히 있어 주세요" 에서 안 넘어갔다 (사용자 2026-10-07) — 0.01 로.
 * 눈대중 시작값
 */
export const SNAP = { frames: 5, stillTol: 0.01, maxWait: 60 } as const;

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

/** 앞 장 → 지금 장, 잘 안 가려지는 머리 점(이마 · 콧대 · 광대)의 평균 이동 (얼굴 폭 배수). 얼굴 폭을 못 재면 무한대 */
function headMove(prev: readonly Pt[], cur: readonly Pt[]): number {
  const w = Math.hypot(cur[LM.faceR]!.x - cur[LM.faceL]!.x, cur[LM.faceR]!.y - cur[LM.faceL]!.y);
  if (!(w > 0)) return Infinity;
  return HEAD_STABLE_IDS.reduce((s, i) => s + Math.hypot(cur[i]!.x - prev[i]!.x, cur[i]!.y - prev[i]!.y), 0) / HEAD_STABLE_IDS.length / w;
}

/** 머리 점 평균 이동이 얼굴 폭 × tol 안이면 가만히 */
export function isStill(prev: readonly Pt[], cur: readonly Pt[], tol: number = SNAP.stillTol): boolean {
  return headMove(prev, cur) <= tol;
}

export interface Snapshot<I> {
  /** 점마다 중앙값 */
  lm: Pt[];
  /** 중앙값에 가장 가까운 장의 그림 */
  image: I;
}

/**
 * 장면마다 push — 가만히 있는 장이 frames 개 이어지면 한 장을 돌려주고 다시 처음부터. 움직이면 거기서부터 다시 센다.
 * maxWait 장이 지나도 못 모으면 그동안 가장 덜 움직인(이웃 장 사이 이동의 최대가 가장 작은) frames 장으로 찍는다 — 웹캠 떨림에 갇히지 않게.
 * 얼굴을 놓치면 전부 처음부터
 */
export function createSnapshotCollector<I>(opts: typeof SNAP = SNAP): { push(lm: readonly Pt[] | null, image: I): Snapshot<I> | null; reset(): void } {
  type Item = { lm: readonly Pt[]; image: I };
  let buf: Item[] = [], recent: (Item & { move: number })[] = [], best: { items: Item[]; score: number } | null = null, tries = 0;
  const reset = (): void => { buf = []; recent = []; best = null; tries = 0; };
  const finish = (items: readonly Item[]): Snapshot<I> => {
    const frames = items.map((b) => b.lm), med = medianLandmarks(frames), pick = items[closestFrame(frames, med)]!;
    reset();
    return { lm: med, image: pick.image };
  };
  return {
    reset,
    push(lm, image) {
      if (!lm) { reset(); return null; }
      const prev = recent[recent.length - 1], move = prev ? headMove(prev.lm, lm) : 0;
      if (prev && move > opts.stillTol) buf = [];
      buf.push({ lm, image });
      recent.push({ lm, image, move });
      if (recent.length > opts.frames) recent.shift();
      tries++;
      if (buf.length >= opts.frames) return finish(buf);
      if (recent.length === opts.frames) {
        const score = Math.max(...recent.slice(1).map((r) => r.move));
        if (!best || score < best.score) best = { items: recent.map(({ lm: l, image: im }) => ({ lm: l, image: im })), score };
      }
      return tries >= opts.maxWait && best ? finish(best.items) : null;
    },
  };
}
