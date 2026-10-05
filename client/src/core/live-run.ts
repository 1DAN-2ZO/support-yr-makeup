/**
 * 화면 4 진행 (프레임마다 부른다): 게이트 한 줄 · 가이드 테두리 · 확인받기 묶음 (정의서 3-4 상태, 2-1 #21).
 * 카메라·DOM 없이 돌아서 테스트할 수 있다. 화면(screens/live.ts)은 측정값만 넣는다 — ① capture-run 과 같은 나눔.
 *
 *   guide_shown ─(게이트 통과 · 또는 각도·안정에 3초, #235)→ ready ─[확인받기]→ capturing(3~5장) → done → 화면 5
 *                                                     └ failed → guide_shown (다시 통과해야 누를 수 있다)
 *
 * 가이드 모양은 밖에서 받는다(GuideSource) — 채점(화면 5)과 같은 것을 넘겨야 "따라 그린 선 = 채점 기준" 이 된다.
 * 지금은 규칙 기반 lookGuide, ⑥ 개인화 계획·AI 완성본에서 뽑은 모양(#157)은 main.ts 에서 바꿔 꽂는다.
 */

import type { Lab } from "./color";
import { unitScale } from "./baseline";
import { faceRoll } from "./crop";
import type { Rect } from "./crop";
import { createBundleCollector, type BundleState } from "./capture-bundle";
import { exprDiff } from "./expression";
import { gateStep, rigidPoseDiff, softFail, type LiveLimits, LIVE_LIMITS, livePose, type LiveMeasure } from "./gate";
import { linerOutline, GUIDE_PARAMS } from "./guides";
import { partInRect } from "./landmarks";
import { pinOutline, placeOutline } from "./mesh-pin";
import { LM } from "./landmarks";
import type { Side } from "./score";
import { FAR_EYE_DEFAULT, type FarEyeOptions, computeFarEyeFix, eyeCenter, farSide } from "./eye-fit";
import { foreheadStep, startForeheadTrack, type ForeheadTrack } from "./occlusion";
import { spreadMarks } from "./spread-marks";
import { guideOutline, type Outline } from "./overlay";
import type { GuideSource } from "./score-part";
import { LIVE_SMOOTH } from "./smooth-params";
import { LandmarkSmoother } from "./smoothing";
import type { GateResult, PartId, Pt } from "./types";

/** 화면이 프레임마다 넣는 것. 픽셀 측정(선명·이마 색)은 화면이 한다 (screens/frame-measure) */
export interface LiveFrame<I> {
  /** 프레임 시각(ms) */
  t: number;
  /** 478점 px. 얼굴을 못 찾았으면 null */
  lm: readonly Pt[] | null;
  w: number;
  h: number;
  /** 지금 화면 방향 — 눈 부위는 가로에서만 (게이트) */
  screen?: "landscape" | "portrait";
  /** 화면에 실제로 보이는 영역(영상 px, crop.coverView). 없으면 영상 전체 */
  view?: Rect;
  sharpness?: number;
  /** 이마 L*a*b* — 피부만(앞머리 뺌). 밝기·색 조건. 못 쟀으면 없음 */
  lab?: Lab;
  /** 이마 전체 평균 — 가림(급변) 판정용. 손·브러시가 빠지지 않게 (#212 리뷰). 없으면 lab */
  rawLab?: Lab;
  /** 지금 표정 (블렌드셰이프 이름 → 0~1). 없으면 표정 조건 생략 */
  expr?: Readonly<Record<string, number>>;
  /** 지금 프레임 사진. 묶음을 모을 때만 부른다 — 프레임마다 복사하면 무겁다 */
  image: () => I;
}

export interface LiveRunOptions {
  partId: PartId;
  /** 맨얼굴 기준 (Baseline 의 필요한 것만) */
  baseline: { lm: readonly Pt[]; foreheadL: number };
  /** 기준 이마 a*·b*. 촬영 직후에만 있다 (복원하면 없음 → 색 조건 생략) */
  baseAb?: { a: number; b: number };
  /** 맨얼굴 정면 때 표정 (① Baseline, #177). 없으면 표정 조건 생략 */
  baseExpr?: Readonly<Record<string, number>> | null;
  /** 테두리 모양. 채점과 같은 것 */
  guide: GuideSource;
  /** 테두리를 그릴 점에 One-Euro(④ smoothing.ts, 값은 LIVE_SMOOTH)를 건다. 기본 켬 — 떨림 비교(#23)용으로 끌 수 있다 */
  smooth?: boolean;
  limits?: LiveLimits;
  /** 먼 쪽 눈 틀 맞추기 다듬기(G안 · H안)를 하나씩 켜고 끄기 — 화면 4 개발용 ?g= 비교. 기본 FAR_EYE_DEFAULT */
  farEye?: FarEyeOptions;
  /** 아주 크게 돌렸을 때 먼 쪽 눈 흐리게(후보 1)의 구간. null 이면 끔. 기본 FAR_FADE — 화면 4 개발용 ?fade= */
  fade?: FadeRange | null;
}

export interface LiveStep<I> {
  gate: GateResult;
  /** 이 프레임 좌표(px)의 가이드 테두리. 얼굴이 없으면 null (테두리만 사라진다) */
  outline: Outline | null;
  /** 확인받기를 누른 뒤에만. 끝나면(done·failed) 다음 프레임부터 다시 null */
  bundle: BundleState<I> | null;
  /** 게이트가 본 측정값(안정 수 포함) — 화면 4 개발용 ?gate 표시. 얼굴이 없으면 null */
  measure: LiveMeasure | null;
  /**
   * 확인받기를 누를 수 있나 = 게이트 통과, 또는 기다리면 되는 조건(softFail: 정면 각도·기준 각도 차·안정)에 softMs(3초) 넘게 막힘 (#235).
   * 뒤의 경우 문구는 게이트 안내 그대로 두고 판단은 채점에 맡긴다
   */
  pressable: boolean;
  /**
   * 테두리 다각형마다 진하기 (1 = 보통). 눈 부위에서 고개를 많이 돌리면 먼 쪽 눈은 흐리게 (FAR_FADE).
   * 눈 부위가 아니거나 얼굴이 없으면 null
   */
  alpha: number[] | null;
}

/** 합성 없이 모양만 부를 때 넘기는 빈 이미지 — guides.ts 는 랜드마크와 기준 길이만 본다 */
const NO_IMAGE = { data: new Uint8ClampedArray(0), w: 0, h: 0 };

/** 화면 3·4 테두리 (선만, 면 채우기 없음 F-07). 라이너는 가이드의 두께·꼬리로 만든 윤곽, 나머지는 결과 화면과 같은 테두리 */
export function outlineOf(partId: PartId, lm: readonly Pt[], guide: GuideSource): Outline {
  const f = { im: NO_IMAGE, lm, unit: unitScale(lm) };
  const g = guide(partId, f);
  if (partId === "liner") {
    const o = linerOutline(f, g.liner?.thick ?? GUIDE_PARAMS.liner.thick, g.liner?.wing);
    return { polys: [o.R, o.L], lines: [] };
  }
  const o = guideOutline(partId, lm, g);
  // 블러셔 · 섀도우 · 쉐딩: 진한 곳(점)에서 퍼지는 방향(화살표) — 화면 3·4 만 (화면 5 는 guideOutline 그대로)
  const m = spreadMarks(partId, o.polys);
  return m.dots.length ? { ...o, dots: m.dots, arrows: m.arrows } : o;
}

const optExpr = (d: number | undefined): { exprDiff?: number } => (d === undefined ? {} : { exprDiff: d });

/**
 * 후보 1 — 크게 돌리면 먼 쪽 눈 테두리를 흐리게 (2026-10-02 PC) — 틀린 선을 믿고 따라 그리지 않게.
 * 각도 차(rigidPoseDiff 눈금, 화면 4 한계 12 와 같은 눈금) from 까지 그대로 → to 부터 min.
 * PC 에서 화면 4 ?fade=from-to 로 맞춰 보고 30 → 45 를 골랐다 (먼 쪽 눈 틀 맞추기 C · F · G · H 를 켠 채). 폰 확인 전 — 가정값
 */
export const FAR_FADE: FadeRange = { from: 30, to: 45, min: 0.3 };

export interface FadeRange { from: number; to: number; min: number }

const EYE_PARTS: readonly PartId[] = ["brow", "liner", "shadow"];
const EYE_IDS: Record<Side, readonly number[]> = { R: [...LM.eyeA.upper, ...LM.eyeA.lower], L: [...LM.eyeB.upper, ...LM.eyeB.lower] };
const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length });
/** 이 테두리 다각형이 어느 눈 쪽인지 — 눈 가운데에 더 가까운 쪽 */
function nearerEye(poly: readonly Pt[], lm: readonly Pt[]): Side {
  const m = mean(poly), r = eyeCenter("R", lm), l = eyeCenter("L", lm);
  return Math.hypot(m.x - r.x, m.y - r.y) <= Math.hypot(m.x - l.x, m.y - l.y) ? "R" : "L";
}

/**
 * 먼 쪽 눈 보정을 테두리 점마다 얼마나 줄지 (0~1). 보정은 눈 근처에 맞춘 변환이라 멀리 늘려 쓰면 비틀린다 (PC 2026-10-02: 섀도우 위 테두리).
 * 라이너는 전부 눈에 붙어 있어 1 · 눈썹은 그물 붙이기만으로 잘 따라와 0 ·
 * 섀도우는 눈꺼풀 쪽 1 → 위 테두리(눈썹 쪽) 0 — 정면에서 눈꺼풀 점까지의 거리로 차츰
 */
function fitWeights(part: PartId, poly: readonly Pt[], side: Side, baseLm: readonly Pt[]): number[] {
  if (part === "liner") return poly.map(() => 1);
  if (part !== "shadow") return poly.map(() => 0);
  const eye = EYE_IDS[side].map((i) => baseLm[i]!);
  // 눈꺼풀 ↔ 눈썹 아래 간격(가운데) 의 절반부터는 보정 0 — 섀도우 위 테두리(간격의 약 55%)는 그물 붙이기 그대로
  const e = side === "R" ? LM.eyeA : LM.eyeB, b = side === "R" ? LM.browA : LM.browB;
  const top = baseLm[e.upper[Math.floor(e.upper.length / 2)]!]!, brow = baseLm[b.lower[Math.floor(b.lower.length / 2)]!]!;
  const half = Math.hypot(top.x - brow.x, top.y - brow.y) / 2;
  return poly.map((p) => {
    const d = Math.min(...eye.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    return half > 0 ? Math.max(0, 1 - d / half) : d < 1e-9 ? 1 : 0;
  });
}

/**
 * C·F·G·H안: 고개를 많이 돌리면 먼 쪽 눈 테두리를 정면 눈 모양 틀로 — 변환 자체는 core/eye-fit.ts 의
 * computeFarEyeFix(2-b AR과 공용, 중복 구현 금지 — #291 리뷰) 가 만들고, 여기서는 테두리 점마다 fitWeights 로
 * 얼마나 섞을지만 정한다. 각도 차 12 → 25 에서 그물(눈꺼풀 점 그대로) → 틀로 서서히. 가까운 쪽은 그대로
 */
function farEyeFit(o: Outline, base: readonly (readonly Pt[])[], sides: readonly Side[], weights: readonly (readonly number[])[], baseLm: readonly Pt[], cur: readonly Pt[], g: FarEyeOptions = FAR_EYE_DEFAULT): Outline {
  const r = computeFarEyeFix(baseLm, cur, g);
  if (!r) return o;
  return {
    polys: o.polys.map((poly, i) => (sides[i] !== r.far ? poly : poly.map((p, j) => {
      const k = r.weight * (weights[i]![j] ?? 0);
      if (k <= 0) return p;
      const q = r.place(base[i]![j]!);
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
    }))),
    lines: o.lines,
    ...(o.dots ? { dots: o.dots } : {}),
    ...(o.arrows ? { arrows: o.arrows } : {}),
  };
}

/** 후보 1: 먼 쪽 눈 테두리 진하기 1 → min */
function farEyeAlpha(sides: readonly Side[], baseLm: readonly Pt[], cur: readonly Pt[], r: FadeRange): number[] {
  const d = rigidPoseDiff(baseLm, cur).yaw;
  const t = Math.min(1, Math.max(0, (Math.abs(d) - r.from) / (r.to - r.from || 1)));
  const a = 1 - (1 - r.min) * t * t * (3 - 2 * t);
  const far = farSide(d, cur);
  return sides.map((s) => (s === far ? a : 1));
}


export function createLiveRun<I>(opt: LiveRunOptions): { step(f: LiveFrame<I>): LiveStep<I>; press(): boolean; readonly smoother: LandmarkSmoother | null } {
  const limits = opt.limits ?? LIVE_LIMITS;
  let stable = 0;
  let fj: ForeheadTrack = startForeheadTrack();
  let lastPressable = false;
  /** 기다리면 되는 조건에 막히기 시작한 시각. 통과하거나 못 찍는 조건이 끼면 null */
  let softSince: number | null = null;
  let collector: ReturnType<typeof createBundleCollector<I>> | null = null;
  // 그리기 전용. 게이트·묶음(채점)에는 원래 점을 쓴다 — 필터 지연이 채점 위치를 끌고 가지 않게.
  // 값은 LIVE_SMOOTH (#235: ④ 기본값 2.5·0.08 은 라이너 테두리가 늦게 따라와 눈알 위에 박혔다)
  const smoother = opt.smooth === false ? null : new LandmarkSmoother(Array.from({ length: 478 }, (_, i) => i), LIVE_SMOOTH);
  // 테두리는 맨얼굴(기준) 정면에서 한 번 그려 얼굴 그물에 붙이고, 매 장면 지금 얼굴로 옮긴다 (2-b AR 화장과 같은 방식).
  // 매 장면 새로 그리면 크기·각도가 화면 기준(눈 폭 평균 · 화면 위쪽)이라 고개를 돌릴 때 원근이 안 들어가 어긋났다 (2026-10-02 PC).
  // 화면 3(맨얼굴 사진 위 테두리)·채점(맨얼굴 기준)과도 같은 모양
  const pinned = pinOutline(outlineOf(opt.partId, opt.baseline.lm, opt.guide), opt.baseline.lm);
  // 눈 부위: 테두리 다각형마다 어느 눈 쪽인지 — 고개를 많이 돌리면 먼 쪽은 눈 모양 틀로(C안) · 흐리게(후보 1, 화면이 고름)
  const baseOutline = placeOutline(pinned, opt.baseline.lm).polys;
  const sides = EYE_PARTS.includes(opt.partId) ? baseOutline.map((poly) => nearerEye(poly, opt.baseline.lm)) : null;
  const weights = sides ? baseOutline.map((poly, i) => fitWeights(opt.partId, poly, sides[i]!, opt.baseline.lm)) : null;

  return {
    /** 화면 4 개발용 ?tune 슬라이더가 값을 바꾼다 */
    smoother,
    step(f) {
      let gate: GateResult;
      let measure: LiveMeasure | null = null;
      let outline: Outline | null = null;
      let alpha: number[] | null = null;
      let occluded: boolean | null = null;
      if (!f.lm) {
        smoother?.smooth(null, f.t);
        const r = gateStep(stable, opt.partId, { faceDetected: false, yaw: 0, pitch: 0 }, limits);
        stable = r.stable;
        gate = r.gate;
      } else {
        // 정면 각도도 턱 없이 — 맨얼굴 각도 + 강체 점 변화 (#193). 입을 벌려도 "조금만 정면으로" 가 안 뜬다
        const pose = livePose(opt.baseline.lm, f.lm);
        // 가림(급변)은 머리카락을 빼지 않은 이마 전체 평균으로 — 손·브러시가 빠지지 않게 (#212)
        const occRef = f.rawLab ?? f.lab;
        if (occRef) {
          const o = foreheadStep(fj, f.t, occRef, pose);
          fj = o.track;
          occluded = o.occluded;
        }
        const m: LiveMeasure = {
          // 정면 여부(절대 각도)는 화면 1 과 같은 식, 기준 사진과의 차는 강체 점으로 (입을 벌려도 안 흔들림, #28)
          faceDetected: true, roll: faceRoll(f.lm), ...(f.screen ? { screen: f.screen } : {}), ...pose, poseDiff: rigidPoseDiff(opt.baseline.lm, f.lm),
          ...optExpr(exprDiff(opt.partId, opt.baseExpr, f.expr)),
          partVisible: partInRect(opt.partId, f.lm, f.view ?? { x: 0, y: 0, w: f.w, h: f.h }),
          ...(occluded !== null ? { occluded } : {}),
          ...(f.sharpness !== undefined ? { sharpness: f.sharpness } : {}),
          ...(f.lab ? { foreheadL: f.lab.L, foreheadAb: { a: f.lab.a, b: f.lab.b } } : {}),
          baselineL: opt.baseline.foreheadL,
          ...(opt.baseAb ? { baselineAb: opt.baseAb } : {}),
        };
        const r = gateStep(stable, opt.partId, m, limits);
        stable = r.stable;
        gate = r.gate;
        measure = { ...m, stableCount: r.stable };
        const cur = smoother?.smooth(f.lm, f.t) ?? f.lm;
        outline = placeOutline(pinned, cur);
        if (sides) {
          outline = farEyeFit(outline, baseOutline, sides, weights!, opt.baseline.lm, cur, opt.farEye);
          const fade = opt.fade === undefined ? FAR_FADE : opt.fade;
          if (fade) alpha = farEyeAlpha(sides, opt.baseline.lm, cur, fade);
        }
      }
      if (gate.ok || !softFail(gate)) softSince = null;
      else softSince ??= f.t;
      let pressable = gate.ok || (softSince !== null && f.t - softSince >= limits.softMs);

      let bundle: BundleState<I> | null = null;
      if (collector) {
        bundle = collector.push({ image: f.image(), lm: f.lm, handOverlap: occluded, foreheadL: f.lab?.L ?? null, t: f.t });
        if (bundle.status !== "collecting") {
          collector = null;
          // 한 묶음이 끝나면 처음부터 다시 통과해야 한다 (실패 뒤 곧바로 또 눌리지 않게) — 3초 기다림도 처음부터
          stable = 0;
          softSince = null;
          pressable = false;
        }
      }
      lastPressable = pressable;
      return { gate, outline, bundle, measure, pressable, alpha };
    },
    press() {
      if (!lastPressable || collector) return false;
      collector = createBundleCollector<I>();
      return true;
    },
  };
}

