/**
 * 사진 두 장 → 부위 채점 결과. sampling.ts(뽑기)와 score.ts(채점)를 잇는 자리 — 순수 로직.
 * 화면 5 와 평가 CLI(eval/score/score_cli.mjs)가 같은 함수를 부른다. 그래야 평가가 앱과 같은 것을 잰다.
 *
 *   const base = frameOf(bareImage, baseline.lm);
 *   const { frame: cur, fit } = alignedFrame(base, capturedImage, detectedLm);
 *   const { result, ctx } = scorePart(partId, base, cur, guide, { alignResidual: fit.residual });
 *   session = applyResult(session, partId, toOutcome(partId, result, ctx));
 */

import type { RgbaImage } from "./color";
import { deltaE } from "./color";
import { LM } from "./landmarks";
import type { SampleFrame } from "./sampling";
import { frameOf, sampleBrow, sampleForehead, sampleLiner, sampleLip, sampleRegion } from "./sampling";
import type { Band, DecideContext, PartScore, ScoreParams, Side, SimilarityFit } from "./score";
import { PARAMS, alignToBaseline, browResult, compareLinerEye, compareLip, compareRegion, intensityIndex, intensityResult, lightCorr, linerResult, makeupBiasPx, noCorr } from "./score";
import type { PartId, Pt } from "./types";

/** 채점이 가이드에서 받아야 하는 모양. 그 프레임의 좌표(px)로 */
export interface PartGeometry {
  /** 아이라이너 꼬리 선 [눈꼬리, 꼬리 끝] */
  linerWing?: Record<Side, readonly [Pt, Pt]>;
  /** 강도 부위(섀도우·볼터치·쉐딩) 영역 다각형. 쉐딩은 쉐딩(어둡게) 영역 */
  regions?: Record<Side, readonly Pt[]>;
  /** 쉐딩 화면의 하이라이트(밝게) 영역. 있으면 좌우 차 한 줄을 더 낸다. 점수 없음 */
  highlights?: Record<Side, readonly Pt[]>;
}

/**
 * 가이드 공급자 — ② 가이드(guides.ts, 2-1)가 붙는 자리.
 * 기준 사진과 내 화장 사진에서 각각 불리므로, 받은 프레임의 랜드마크로 모양을 만들어야 한다
 */
export type GuideSource = (partId: PartId, f: SampleFrame) => PartGeometry;

/** 화장이 미는 랜드마크. 재검출값과 정렬값의 차이로 편향을 잰다 */
const MAKEUP_IDS: readonly number[] = [...LM.lipsOuter, ...LM.eyeA.upper, ...LM.eyeB.upper];

/** 확인받기 프레임을 기준 좌표계에 맞춘다: 재검출 랜드마크 대신 기준 랜드마크를 안정 점으로 옮겨 쓴다 */
export function alignedFrame(base: SampleFrame, im: RgbaImage, detectedLm: readonly Pt[]): { frame: SampleFrame; fit: SimilarityFit; biasPx: number } {
  const { lm, fit } = alignToBaseline(base.lm, detectedLm);
  return { frame: frameOf(im, lm), fit, biasPx: makeupBiasPx(lm, detectedLm, MAKEUP_IDS) };
}

export interface ScorePartOptions {
  /** 룩 템플릿의 진하기 목표 밴드. 안 주면 PARAMS.band, null 이면 기준 없음 */
  band?: Band | null;
  /** 맨얼굴에 원래 있던 좌우 꼬리 높이 차 (눈 폭 비율) */
  baseAsym?: number;
  /** alignedFrame() 의 fit.residual. metrics.alignResidual 로 남긴다 */
  alignResidual?: number;
}

export function scorePart(partId: PartId, base: SampleFrame, cur: SampleFrame, guide: GuideSource, opts: ScorePartOptions = {}, p: ScoreParams = PARAMS): { result: PartScore; ctx: DecideContext } {
  // 조명: 이마(비화장)의 L* 비율로 맞춘다. 이마를 못 재면 보정 없이 간다 — 조명이 달라졌는지는 알 수 없다
  const foreBase = sampleForehead(base), foreCur = sampleForehead(cur);
  const lit = foreBase && foreCur ? { corr: lightCorr(foreBase.L, foreCur.L), shift: foreCur.L - foreBase.L } : null;
  const corr = lit?.corr ?? noCorr;
  const ctx: DecideContext = lit ? { lightShift: lit.shift } : {};

  let result: PartScore;
  if (partId === "liner") {
    const eye = (s: Side) => compareLinerEye(sampleLiner(base, s, wingOf(guide, partId, base, s)), sampleLiner(cur, s, wingOf(guide, partId, cur, s)), corr, p);
    result = linerResult({ R: eye("R"), L: eye("L") }, opts.baseAsym ?? 0, p);
  } else if (partId === "brow") {
    result = browResult(compareRegion(sampleBrow(base), sampleBrow(cur), corr, p.dEThresh.brow));
  } else if (partId === "lip") {
    result = compareLip(sampleLip(base), sampleLip(cur), corr, p);
  } else {
    const halves = partId === "shadow";
    const side = (s: Side) => {
      const b = sampleRegion(base, regionOf(guide, partId, base, s), s, halves), c = sampleRegion(cur, regionOf(guide, partId, cur, s), s, halves);
      if (!b || !c) return { delta: 0, index: 0, dir: 0 };   // 영역이 사진 밖 → 화장 없음으로 (확인만)
      const dir = b.outer && b.inner && c.outer && c.inner ? deltaE(b.outer, corr(c.outer)) - deltaE(b.inner, corr(c.inner)) : 0;
      return { ...intensityIndex(b.part, c.part, b.ring, c.ring, corr, p), dir };
    };
    const L = side("L"), R = side("R");
    // 쉐딩 화면: 하이라이트 영역도 같은 방법으로 좌우를 잰다 (가이드가 주면). 점수에는 안 들어간다
    const hiPoly = partId === "contour" ? guide(partId, base).highlights : undefined;
    const hi = hiPoly
      ? (() => {
          const one = (s: Side) => {
            const b = sampleRegion(base, hiPoly[s], s), c = sampleRegion(cur, guide(partId, cur).highlights![s], s);
            return { index: b && c ? intensityIndex(b.part, c.part, b.ring, c.ring, corr, p).index : 0 };
          };
          return { L: one("L"), R: one("R") };
        })()
      : undefined;
    result = intensityResult(partId, {
      L, R,
      present: Math.max(L.delta, R.delta) > p.tPresent[partId],
      directionOk: !halves || (L.dir + R.dir) / 2 > 0,   // 섀도우: 눈꼬리 쪽이 더 진해야 한다
      ...(opts.band !== undefined ? { band: opts.band } : {}),
      ...(hi ? { hi } : {}),
    }, p);
    result.metrics.deltas = { L: L.delta, R: R.delta };
  }
  if (opts.alignResidual !== undefined) result.metrics.alignResidual = opts.alignResidual;
  return { result, ctx };
}

function wingOf(guide: GuideSource, partId: PartId, f: SampleFrame, s: Side): readonly [Pt, Pt] {
  const w = guide(partId, f).linerWing?.[s];
  if (!w) throw new Error(`가이드에 아이라이너 꼬리 선이 없다 (${s})`);
  return w;
}

function regionOf(guide: GuideSource, partId: PartId, f: SampleFrame, s: Side): readonly Pt[] {
  const r = guide(partId, f).regions?.[s];
  if (!r) throw new Error(`가이드에 ${partId} 영역이 없다 (${s})`);
  return r;
}
