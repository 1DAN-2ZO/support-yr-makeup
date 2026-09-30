/**
 * 사진 두 장 → 부위 채점 결과. sampling.ts(뽑기)와 score.ts(채점)를 잇는 자리 — 순수 로직.
 * 화면 5 와 평가 CLI(eval/score/score_cli.mjs)가 같은 함수를 부른다. 그래야 평가가 앱과 같은 것을 잰다.
 *
 *   const base = frameOf(bareImage, baseline.lm);
 *   const { frame: cur, fit } = alignedFrame(base, capturedImage, detectedLm);
 *   const { result, ctx } = scorePart(partId, base, cur, guide, { alignResidual: fit.residual });
 *   session = applyResult(session, partId, toOutcome(partId, result, ctx));
 */

import scoreRules from "../../../rules/score.json";
import type { Lab, RgbaImage } from "./color";
import { deltaE, scleraLab } from "./color";
import { LM, at } from "./landmarks";
import type { HairMask, SampleFrame } from "./sampling";
import { frameOf, sampleBrow, sampleForehead, sampleLiner, sampleLip, sampleRegion } from "./sampling";
import type { Band, DecideContext, LightCorr, LinerStrip, PartScore, RegionGrid, ScoreParams, Side, SimilarityFit } from "./score";
import { PARAMS, alignToBaseline, colorShiftCorr, browResult, compareLinerEye, compareLip, compareRegion, intensityIndex, intensityResult, lightCorr, linerResult, makeupBiasPx, noCorr, oneLiner, toOutcome } from "./score";
import type { ScoreOutcome } from "./flow";
import type { CheckReason, PartId, Pt } from "./types";

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
export function alignedFrame(base: SampleFrame, im: RgbaImage, detectedLm: readonly Pt[], hair?: HairMask): { frame: SampleFrame; fit: SimilarityFit; biasPx: number } {
  const { lm, fit } = alignToBaseline(base.lm, detectedLm);
  return { frame: frameOf(im, lm, hair), fit, biasPx: makeupBiasPx(lm, detectedLm, MAKEUP_IDS) };
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
  // 조명 색 (S-4 #40): 흰자를 두 사진에서 다 재면 흰자 a*b* 차이도 되돌린다. 못 재면(눈 감음 등) 밝기만
  const sb = p.colorCorr === "sclera" ? scleraLab(base.im, base.lm) : null, sc = sb ? scleraLab(cur.im, cur.lm) : null;
  const corr = sb && sc ? colorShiftCorr(lit?.corr ?? noCorr, sb, sc) : lit?.corr ?? noCorr;
  const ctx: DecideContext = lit ? { lightShift: lit.shift } : {};
  // 정렬 잔차는 눈 폭으로 나눠 해상도와 상관없게 (#43)
  if (opts.alignResidual !== undefined && cur.unit.eye > 0) ctx.alignResidual = opts.alignResidual / cur.unit.eye;

  let result: PartScore;
  if (partId === "liner") {
    const gb = linerOf(guide, base);
    const eye = (s: Side) => {
      const sb = sampleLiner(base, s, gb.wing[s], gb.thick);
      const strip = (f: SampleFrame) => { const g = linerOf(guide, f); return sampleLiner(f, s, g.wing[s], g.thick); };
      // 눈을 뜨고 있으면 선 아래는 눈알(시선에 따라 바뀜) — 정렬 비용에서도 뺀다 (compareLinerEye 와 같은 칸)
      const cost = (f: SampleFrame) => stripCost(sb, strip(f), corr, p.tol.band);
      return compareLinerEye(sb, strip(register(cur, cost)), corr, p);
    };
    result = linerResult({ R: eye("R"), L: eye("L") }, opts.baseAsym ?? 0, p);
  } else if (partId === "brow") {
    const gb = sampleBrow(base);
    const cost = (f: SampleFrame) => meanLighter(gb.lab, sampleBrow(f).lab, corr);
    const gc = sampleBrow(register(cur, cost));
    result = browResult(compareRegion(gb, gc, corr, p.dEThresh.brow));
    const hf = browHidden(gb, gc);
    if (hf !== null) ctx.hairFrac = hf;
  } else if (partId === "lip") {
    const lc = sampleLip(cur, lipOf(guide, cur).offset);
    result = compareLip(sampleLip(base, lipOf(guide, base).offset), lc, corr, p);
    // 입술 색 (조화 보정, #35): 경계에서 안쪽으로 떨어진 칸만 — 경계는 피부가 섞인다
    const inner = lc.lab.flatMap((row) => row.filter((_, j) => (lc.meta.offs[j] ?? 0) < -p.tol.lipOut));
    const ab = meanAb(inner);
    if (ab) result.metrics.colorAb = ab;
  } else if (partId === "contour") {
    result = scoreContour(base, cur, guide, corr, p);
  } else {
    const halves = partId === "shadow";
    const side = (s: Side) => {
      const b = sampleRegion(base, regionOf(guide, partId, base, s), s, halves), c = sampleRegion(cur, regionOf(guide, partId, cur, s), s, halves);
      if (!b || !c) return { delta: 0, index: 0, dir: 0, color: null as Lab | null };   // 영역이 사진 밖 → 화장 없음으로 (확인만)
      if (b.hidden !== undefined || c.hidden !== undefined) ctx.hairFrac = Math.max(ctx.hairFrac ?? 0, b.hidden ?? 0, c.hidden ?? 0);
      const dir = b.outer && b.inner && c.outer && c.inner ? deltaE(b.outer, corr(c.outer)) - deltaE(b.inner, corr(c.inner)) : 0;
      return { ...intensityIndex(b.part, c.part, b.ring, c.ring, corr, p), dir, color: c.part as Lab | null };
    };
    const L = side("L"), R = side("R");
    result = intensityResult(partId, {
      L, R,
      present: Math.max(L.delta, R.delta) > p.tPresent[partId],
      directionOk: !halves || (L.dir + R.dir) / 2 > 0,   // 섀도우: 눈꼬리 쪽이 더 진해야 한다
      ...(opts.band !== undefined ? { band: opts.band } : {}),
    }, p);
    result.metrics.deltas = { L: L.delta, R: R.delta };
    // 볼터치 색 (조화 보정, #35): 지금 사진의 영역 평균. 화장이 감지됐을 때만
    if (partId === "cheek" && result.present) {
      const ab = meanAb([L.color, R.color].filter((c): c is Lab => !!c));
      if (ab) result.metrics.colorAb = ab;
    }
  }
  if (opts.alignResidual !== undefined) result.metrics.alignResidual = opts.alignResidual;
  return { result, ctx };
}

/** 눈썹 안쪽 칸 중 머리카락에 가린 비율 — 두 사진 중 한쪽이라도 가렸으면 가림, 좌우 중 큰 쪽. 마스크가 없으면 null */
function browHidden(base: RegionGrid, cur: RegionGrid): number | null {
  if (!base.meta.hidden && !cur.meta.hidden) return null;
  const n = { R: 0, L: 0 }, h = { R: 0, L: 0 };
  cur.meta.side.forEach((s, i) => {
    if (!cur.meta.inside[i]) return;
    n[s]++;
    if (base.meta.hidden?.[i] || cur.meta.hidden?.[i]) h[s]++;
  });
  return Math.max(n.R ? h.R / n.R : 0, n.L ? h.L / n.L : 0);
}

// ---------- 부위별 미세 정렬 (#169 — 맨얼굴 오채점) ----------

/**
 * 채점은 "쌩얼 대비 색이 바뀐 곳 = 그린 곳" 이다. 맨얼굴에도 속눈썹·눈썹 털이 있어서 1~2px 만 어긋나도 새 선처럼 보였다
 * (합성 실험: 1px 에 라이너 64점·눈썹 82점). 웹캠 랜드마크 흔들림과 게이트가 허용하는 각도 차만으로도 그만큼 어긋난다.
 * 그래서 비교 전에 지금 프레임을 ±maxPx 안에서 옮겨 보고, 쌩얼과 가장 잘 겹치는 자리에서 비교한다.
 * 같은 비용이면 덜 옮긴 쪽 — 이미 맞으면 그대로 둔다.
 *
 * 비용은 "쌩얼보다 **밝아진** 양"(L*) 이다. 색 차이 전체로 맞추면 그린 선을 원래 속눈썹 위로 끌어다 겹쳐
 * 라이너가 75점으로 떨어졌다. 라이너·눈썹 화장은 피부를 어둡게만 하고, 속눈썹·눈썹 털이 어긋나면
 * 털이 있던 자리가 밝아진다 — 밝아진 양만 보면 그린 화장은 정렬에 끼어들지 않는다.
 */
/**
 * range: 옮겨 볼 범위(눈 폭 비율 — 합성 얼굴 눈 폭 90px 에서 2px). 픽셀로 고정하면 웹캠(눈 60px)엔 너무 크고 폰(200px)엔 너무 작다.
 * minGain: 안 옮긴 자리보다 비용(밝아진 L*)이 이만큼 줄어야 옮긴다 (#174 리뷰: 잡음 속에서 엉뚱하게 옮겨 라이너 96 → 84).
 *   합성 실측(잡음 σ 0~10): 진짜 1~2px 어긋남은 라이너 2.2~3.6 · 눈썹 0.1~0.2 줄고, 잡음 때문에 옮길 때는 0.03 이하
 */
export const REGISTER = { ...scoreRules.register };   // 값은 rules/score.json (#44)

function shiftFrame(f: SampleFrame, dx: number, dy: number): SampleFrame {
  return { ...f, lm: f.lm.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) };
}

function register(cur: SampleFrame, cost: (f: SampleFrame) => number): SampleFrame {
  const r = Math.round(cur.unit.eye * REGISTER.range);
  const c0 = cost(cur);
  let best = cur, bestC = c0, bestD = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const f = shiftFrame(cur, dx, dy), c = cost(f), d = Math.hypot(dx, dy);
      if (c < bestC - 1e-9 || (Math.abs(c - bestC) <= 1e-9 && d < bestD)) { best = f; bestC = c; bestD = d; }
    }
  }
  return c0 - bestC >= REGISTER.minGain ? best : cur;
}

/** 쌩얼보다 밝아진 양 (L*, 어두워진 곳은 0) */
const lighter = (base: Lab, cur: Lab, corr: LightCorr): number => Math.max(0, corr(cur).L - base.L);

function meanLighter(a: readonly Lab[], b: readonly Lab[], corr: LightCorr): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += lighter(a[i]!, b[i]!, corr);
  return n ? sum / n : 0;
}

function stripCost(base: LinerStrip, cur: LinerStrip, corr: LightCorr, band: number): number {
  const useBelow = !base.meta.eyeOpen && !cur.meta.eyeOpen;
  const N = Math.min(base.lab.length, cur.lab.length);
  let sum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const wing = base.meta.isWing[i] ?? false;
    base.meta.offs.forEach((o, j) => {
      if (!wing && !useBelow && o < -band) return;
      sum += lighter(base.lab[i]![j]!, cur.lab[i]![j]!, corr);
      n++;
    });
  }
  return n ? sum / n : 0;
}

function meanAb(labs: readonly Lab[]): { a: number; b: number } | null {
  if (!labs.length) return null;
  return { a: labs.reduce((s, l) => s + l.a, 0) / labs.length, b: labs.reduce((s, l) => s + l.b, 0) / labs.length };
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

// ---------- 프레임 묶음 (3-3, #34) ----------

/** 확인받기 묶음의 한 장. occluded: true 가림 · false 안 가림 · null 안 쟀음(쓴다) */
export interface BundleInput {
  im: RgbaImage;
  pts: readonly Pt[];
  occluded: boolean | null;
  /** 이 장의 머리카락 마스크 (screens/hair-segmenter). 없으면 머리카락을 안 뺀다 */
  hair?: HairMask;
}

export interface BundleScore {
  outcome: ScoreOutcome;
  /** 대표 장의 번호 (화면에 사진·테두리를 그릴 장). 다 가려졌으면 null */
  pick: number | null;
  /** 대표 장을 기준 좌표로 맞춘 프레임 (테두리 그리기용) */
  cur: SampleFrame | null;
  used: number;
  excluded: number;
}

/**
 * 확인받기 3~5장을 각각 채점해 합친다.
 *  - 가려진 장은 뺀다. 다 가려졌으면 확인만(occluded)
 *  - 점수 난 장이 절반 이상이면 점수 = 중앙값. 흔들린 한 장이 점수를 끌고 가지 않게 (이슈는 "평균" — 튀는 값에 강한 쪽을 골랐다)
 *  - 아니면 확인만, 이유는 가장 많이 나온 것
 *  - 한 줄 평·코드·사진은 대표 장(점수가 중앙값에 가장 가까운 장, 확인만이면 그 이유가 나온 첫 장)에서
 */
export function scoreBundle(partId: PartId, base: SampleFrame, frames: readonly BundleInput[], guide: GuideSource, opts: ScorePartOptions = {}, p: ScoreParams = PARAMS): BundleScore {
  if (!frames.length) throw new Error("확인받기 프레임이 없다");
  const kept = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.occluded !== true);
  const excluded = frames.length - kept.length;
  if (!kept.length) {
    const outcome: ScoreOutcome = {
      decision: "check_only", score: null, diagnosisCodes: [], checkReason: "occluded",
      diagnosis: oneLiner(partId, { status: "check_only", reason: "occluded", score: null }), lrIndex: null,
      metrics: { frames: { used: 0, excluded } },
    };
    return { outcome, pick: null, cur: null, used: 0, excluded };
  }
  const each = kept.map(({ f, i }) => {
    const { frame, fit } = alignedFrame(base, f.im, f.pts, f.hair);
    const { result, ctx } = scorePart(partId, base, frame, guide, { ...opts, alignResidual: fit.residual }, p);
    return { i, cur: frame, out: toOutcome(partId, result, ctx, p) };
  });
  const scored = each.filter((e) => e.out.decision === "scored");
  let pickE: (typeof each)[number];
  let score: number | null = null;
  if (scored.length * 2 >= each.length) {
    const sorted = scored.map((e) => e.out.score!).sort((a, b) => a - b);
    const k = sorted.length >> 1;
    score = sorted.length % 2 ? sorted[k]! : Math.round((sorted[k - 1]! + sorted[k]!) / 2);
    pickE = scored.reduce((a, e) => (Math.abs(e.out.score! - score!) < Math.abs(a.out.score! - score!) ? e : a));
  } else {
    const count = new Map<CheckReason, number>();
    for (const e of each) if (e.out.decision === "check_only" && e.out.checkReason) count.set(e.out.checkReason, (count.get(e.out.checkReason) ?? 0) + 1);
    const reason = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    pickE = each.find((e) => e.out.checkReason === reason)!;
  }
  const outcome: ScoreOutcome = { ...pickE.out, score, metrics: { ...pickE.out.metrics, frames: { used: each.length, excluded } } };
  return { outcome, pick: pickE.i, cur: pickE.cur, used: each.length, excluded };
}
