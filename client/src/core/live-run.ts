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
import { EYE_CONTOUR, applyAffine, browSpanRatio, farEyeWeight, robustAffine, stretchAlong } from "./eye-fit";
import { foreheadStep, startForeheadTrack, type ForeheadTrack } from "./occlusion";
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
  /** 먼 쪽 눈 틀 맞추기 다듬기(G안)를 하나씩 켜고 끄기 — 화면 4 개발용 ?g=0·1·12·123 비교. 기본 전부 켬 */
  farEye?: FarEyeOptions;
}

export interface FarEyeOptions {
  /** 1 눈 폭을 고칠 때 눈머리를 고정하고 눈꼬리 쪽으로만 (아니면 가운데 기준 — F안) */
  anchorInner: boolean;
  /** 2 눈 폭 비율을 눈썹 앞쪽 절반으로 (아니면 눈썹 전체) */
  browHalf: boolean;
  /** 3 높이는 정면보다 커지지 않게 — 눈을 감아 작아지는 것만 따라감 */
  capHeight: boolean;
}

const FAR_EYE_ALL: FarEyeOptions = { anchorInner: true, browHalf: true, capHeight: true };

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
  return guideOutline(partId, lm, g);
}

const optExpr = (d: number | undefined): { exprDiff?: number } => (d === undefined ? {} : { exprDiff: d });

/**
 * 고개를 많이 돌리면 먼 쪽 눈 테두리를 흐리게 (2026-10-02 PC) — 그 각도에선 MediaPipe 가 먼 쪽 눈꺼풀을 빗나가게 잡아
 * 테두리를 붙일 수 없었다(눈 주변 점 평면 변환 · 머리 입체 회전 둘 다 더 나빴다). 틀린 선을 믿고 따라 그리지 않게.
 * 각도 차(rigidPoseDiff 눈금, 화면 4 한계 12 와 같은 눈금) from 까지 그대로 → to 부터 min. 가정값
 */
export const FAR_FADE = { from: 15, to: 30, min: 0.25 } as const;

const EYE_PARTS: readonly PartId[] = ["brow", "liner", "shadow"];
const EYE_IDS: Record<Side, readonly number[]> = { R: [...LM.eyeA.upper, ...LM.eyeA.lower], L: [...LM.eyeB.upper, ...LM.eyeB.lower] };
const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length });
const eyeCenter = (side: Side, lm: readonly Pt[]): Pt => mean(EYE_IDS[side].map((i) => lm[i]!));
/** 이 테두리 다각형이 어느 눈 쪽인지 — 눈 가운데에 더 가까운 쪽 */
function nearerEye(poly: readonly Pt[], lm: readonly Pt[]): Side {
  const m = mean(poly), r = eyeCenter("R", lm), l = eyeCenter("L", lm);
  return Math.hypot(m.x - r.x, m.y - r.y) <= Math.hypot(m.x - l.x, m.y - l.y) ? "R" : "L";
}

/** 먼 쪽 눈 = 코끝이 움직인 쪽 눈 (고개를 돌리면 먼 쪽 눈이 코 뒤로 간다) */
const farSide = (d: number, cur: readonly Pt[]): Side => ((d > 0) === (eyeCenter("R", cur).x > eyeCenter("L", cur).x) ? "R" : "L");

/**
 * C안: 고개를 많이 돌리면 먼 쪽 눈 테두리를 정면 눈 모양 틀로 — 지금 눈꺼풀 점에 틀을 맞추고 튀는 점은 무시 (eye-fit, 2026-10-02 PC).
 * 각도 차 12 → 25 에서 그물(눈꺼풀 점 그대로) → 틀로 서서히. 가까운 쪽은 그대로
 */
function farEyeFit(o: Outline, base: readonly (readonly Pt[])[], sides: readonly Side[], baseLm: readonly Pt[], cur: readonly Pt[], g: FarEyeOptions = FAR_EYE_ALL): Outline {
  const d = rigidPoseDiff(baseLm, cur).yaw, w = farEyeWeight(Math.abs(d));
  if (w <= 0) return o;
  const far = farSide(d, cur), near: Side = far === "R" ? "L" : "R";
  // 점 흔들림(px)은 튀는 점으로 안 본다 — 가까운 쪽 눈 폭의 3% (가까운 쪽은 잘 잡힌다)
  const nearEye = near === "R" ? LM.eyeA : LM.eyeB;
  const floor = 0.03 * Math.hypot(cur[nearEye.outer]!.x - cur[nearEye.inner]!.x, cur[nearEye.outer]!.y - cur[nearEye.inner]!.y);
  const t = robustAffine(EYE_CONTOUR[far].map((i) => baseLm[i]!), EYE_CONTOUR[far].map((i) => cur[i]!), Math.max(1, floor));
  if (!t) return o;
  // F안: 눈꺼풀 점이 통째로 눈동자 쪽으로 쪼그라들면 틀도 쪼그라든다 → 눈 폭만 먼 쪽 눈썹이 줄어든 비율로 (위치·위아래는 그대로)
  const eye = far === "R" ? LM.eyeA : LM.eyeB, brow = far === "R" ? LM.browA : LM.browB;
  const k = browSpanRatio(baseLm, cur, brow, g.browHalf ? Math.floor(brow.upper.length / 2) : 0);
  let fix = (q: Pt): Pt => q;
  const O = applyAffine(t, baseLm[eye.outer]!), I = applyAffine(t, baseLm[eye.inner]!);
  const len = Math.hypot(O.x - I.x, O.y - I.y);
  if (len < 1e-6) return o;
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
  return {
    polys: o.polys.map((poly, i) => (sides[i] !== far ? poly : poly.map((p, j) => {
      const q = fix(applyAffine(t, base[i]![j]!));
      return { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w };
    }))),
    lines: o.lines,
  };
}

/** 후보 1 (보관): 먼 쪽 눈 테두리 진하기 1 → min */
function farEyeAlpha(sides: readonly Side[], baseLm: readonly Pt[], cur: readonly Pt[]): number[] {
  const d = rigidPoseDiff(baseLm, cur).yaw;
  const t = Math.min(1, Math.max(0, (Math.abs(d) - FAR_FADE.from) / (FAR_FADE.to - FAR_FADE.from)));
  const a = 1 - (1 - FAR_FADE.min) * t * t * (3 - 2 * t);
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
          outline = farEyeFit(outline, baseOutline, sides, opt.baseline.lm, cur, opt.farEye);
          alpha = farEyeAlpha(sides, opt.baseline.lm, cur);
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

