/**
 * 사진 두 장 → 부위 채점 결과. sampling.ts(뽑기)와 score.ts(채점)를 잇는 자리 — 순수 로직.
 * 화면 5 와 평가 CLI(eval/score/score_cli.mjs)가 같은 함수를 부른다. 그래야 평가가 앱과 같은 것을 잰다.
 *
 *   const base = frameOf(bareImage, baseline.lm);
 *   const { frame: cur, fit } = alignedFrame(base, capturedImage, detectedLm);
 *   const { result, ctx } = scorePart(partId, base, cur, guide, { alignResidual: fit.residual });
 *   session = applyResult(session, partId, toOutcome(partId, result, ctx));
 */

import type { Lab, RgbaImage } from "./color";
import { deltaE } from "./color";
import { LM, at } from "./landmarks";
import type { SampleFrame } from "./sampling";
import { frameOf, sampleBrow, sampleForehead, sampleLiner, sampleLip, sampleRegion } from "./sampling";
import type { Band, DecideContext, LightCorr, PartScore, ScoreParams, Side, SimilarityFit } from "./score";
import { PARAMS, alignToBaseline, browResult, compareLinerEye, compareLip, compareRegion, intensityIndex, intensityResult, lightCorr, linerResult, makeupBiasPx, noCorr } from "./score";
import type { PartId, Pt } from "./types";

/**
 * 채점이 가이드에서 받아야 하는 모양. 그 프레임의 좌표(px)로.
 * 치수(thick·offset)는 ② 가 룩마다 정해서 그린 값이다 — 채점은 자기 치수를 갖지 않고 여기 온 값을 그대로 쓴다
 */
export interface PartGeometry {
  liner?: {
    /** 꼬리 선 [눈꼬리, 꼬리 끝] */
    wing: Record<Side, readonly [Pt, Pt]>;
    /** 선 두께 (눈 폭 비율) */
    thick: number;
  };
  lip?: {
    /** 경계 오프셋 (입술 폭 비율, + 바깥) */
    offset: number;
    /** 개인화: 윗입술 가운데를 올리는 양 (윗입술 두께 비율). 채점은 아직 쓰지 않는다 — 화면 테두리(lipOutline)만 */
    upperOverline?: number;
  };
  /** 섀도우·볼터치 영역 다각형, 좌우 하나씩 */
  regions?: Record<Side, readonly Pt[]>;
  /**
   * 쉐딩 화면: 얼굴형 규칙(contourOutline)이 낸 밴드 배열 그대로. 좌우 구분 없이, 한쪽에 여러 개, 가운데 밴드(콧대·이마 위·턱 끝)도 섞여 있다.
   * 좌우 분류와 가운데 제외는 채점이 한다. 점수는 없고 좌우 차 한 줄씩만 (쉐딩·하이라이트). highlight 가 비어 있으면 하이라이트 비교는 건너뛴다
   */
  contour?: {
    shading: readonly (readonly Pt[])[];
    highlight: readonly (readonly Pt[])[];
  };
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
    const gb = linerOf(guide, base), gc = linerOf(guide, cur);
    const eye = (s: Side) => compareLinerEye(sampleLiner(base, s, gb.wing[s], gb.thick), sampleLiner(cur, s, gc.wing[s], gc.thick), corr, p);
    result = linerResult({ R: eye("R"), L: eye("L") }, opts.baseAsym ?? 0, p);
  } else if (partId === "brow") {
    result = browResult(compareRegion(sampleBrow(base), sampleBrow(cur), corr, p.dEThresh.brow));
  } else if (partId === "lip") {
    result = compareLip(sampleLip(base, lipOf(guide, base).offset), sampleLip(cur, lipOf(guide, cur).offset), corr, p);
  } else if (partId === "contour") {
    result = scoreContour(base, cur, guide, corr, p);
  } else {
    const halves = partId === "shadow";
    const side = (s: Side) => {
      const b = sampleRegion(base, regionOf(guide, partId, base, s), s, halves), c = sampleRegion(cur, regionOf(guide, partId, cur, s), s, halves);
      if (!b || !c) return { delta: 0, index: 0, dir: 0 };   // 영역이 사진 밖 → 화장 없음으로 (확인만)
      const dir = b.outer && b.inner && c.outer && c.inner ? deltaE(b.outer, corr(c.outer)) - deltaE(b.inner, corr(c.inner)) : 0;
      return { ...intensityIndex(b.part, c.part, b.ring, c.ring, corr, p), dir };
    };
    const L = side("L"), R = side("R");
    result = intensityResult(partId, {
      L, R,
      present: Math.max(L.delta, R.delta) > p.tPresent[partId],
      directionOk: !halves || (L.dir + R.dir) / 2 > 0,   // 섀도우: 눈꼬리 쪽이 더 진해야 한다
      ...(opts.band !== undefined ? { band: opts.band } : {}),
    }, p);
    result.metrics.deltas = { L: L.delta, R: R.delta };
  }
  if (opts.alignResidual !== undefined) result.metrics.alignResidual = opts.alignResidual;
  return { result, ctx };
}

/** 밴드 무게중심이 얼굴 중심에서 얼굴 폭의 이 비율 안이면 가운데 밴드 — 좌우 어느 쪽도 아니다 */
const CENTER_BAND = 0.05;

/**
 * 얼굴형 규칙 밴드들을 좌우로 나눠 한쪽의 부위 색·둘레 맨살 색을 평균한다.
 * R = 이미지 왼쪽(x 작은 쪽). POC(sampleContourS3)는 가운데 밴드를 L 로 몰아넣었는데 여기서는 뺀다 — 콧대 하이라이트가 "왼쪽 하이라이트"가 되면 안 된다
 */
function sideMean(f: SampleFrame, bands: readonly (readonly Pt[])[], s: Side): { part: Lab; ring: Lab } | null {
  const center = (at(f.lm, LM.faceL).x + at(f.lm, LM.faceR).x) / 2, w = f.unit.face || 1;
  const acc = { part: { L: 0, a: 0, b: 0 }, ring: { L: 0, a: 0, b: 0 } };
  let n = 0;
  for (const poly of bands) {
    if (poly.length < 3) continue;
    const cx = poly.reduce((sum, q) => sum + q.x, 0) / poly.length, d = (cx - center) / w;
    if (Math.abs(d) < CENTER_BAND) continue;
    if ((d < 0 ? "R" : "L") !== s) continue;
    const r = sampleRegion(f, poly, s);
    if (!r) continue;
    for (const k of ["L", "a", "b"] as const) { acc.part[k] += r.part[k]; acc.ring[k] += r.ring[k]; }
    n++;
  }
  if (!n) return null;
  const avg = (v: Lab): Lab => ({ L: v.L / n, a: v.a / n, b: v.b / n });
  return { part: avg(acc.part), ring: avg(acc.ring) };
}

/** 쉐딩 화면: 점수 없이 쉐딩 좌우 차 + (있으면) 하이라이트 좌우 차 */
function scoreContour(base: SampleFrame, cur: SampleFrame, guide: GuideSource, corr: LightCorr, p: ScoreParams): PartScore {
  const gb = contourOf(guide, base), gc = contourOf(guide, cur);
  const idx = (bb: readonly (readonly Pt[])[], bc: readonly (readonly Pt[])[], s: Side) => {
    const b = sideMean(base, bb, s), c = sideMean(cur, bc, s);
    return b && c ? intensityIndex(b.part, c.part, b.ring, c.ring, corr, p) : { delta: 0, index: 0 };   // 그쪽에 밴드가 없으면 화장 없음
  };
  const L = idx(gb.shading, gc.shading, "L"), R = idx(gb.shading, gc.shading, "R");
  const hasHi = gb.highlight.length > 0 && gc.highlight.length > 0;
  const hi = hasHi ? { L: { index: idx(gb.highlight, gc.highlight, "L").index }, R: { index: idx(gb.highlight, gc.highlight, "R").index } } : undefined;
  const result: PartScore = intensityResult("contour", { L, R, present: Math.max(L.delta, R.delta) > p.tPresent.contour, ...(hi ? { hi } : {}) }, p);
  result.metrics.deltas = { L: L.delta, R: R.delta };
  return result;
}

function contourOf(guide: GuideSource, f: SampleFrame): NonNullable<PartGeometry["contour"]> {
  const g = guide("contour", f).contour;
  if (!g || !Array.isArray(g.shading)) throw new Error("가이드에 쉐딩 밴드가 없다");
  return g;
}

function linerOf(guide: GuideSource, f: SampleFrame): NonNullable<PartGeometry["liner"]> {
  const g = guide("liner", f).liner;
  if (!g || !(g.thick > 0)) throw new Error("가이드에 아이라이너 꼬리 선·두께가 없다");
  return g;
}

function lipOf(guide: GuideSource, f: SampleFrame): NonNullable<PartGeometry["lip"]> {
  const g = guide("lip", f).lip;
  if (!g || typeof g.offset !== "number") throw new Error("가이드에 입술 경계 오프셋이 없다");
  return g;
}

function regionOf(guide: GuideSource, partId: PartId, f: SampleFrame, s: Side): readonly Pt[] {
  const r = guide(partId, f).regions?.[s];
  if (!r) throw new Error(`가이드에 ${partId} 영역이 없다 (${s})`);
  return r;
}
