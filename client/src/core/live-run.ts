/**
 * 화면 4 진행 (프레임마다 부른다): 게이트 한 줄 · 가이드 테두리 · 확인받기 묶음 (정의서 3-4 상태, 2-1 #21).
 * 카메라·DOM 없이 돌아서 테스트할 수 있다. 화면(screens/live.ts)은 측정값만 넣는다 — ① capture-run 과 같은 나눔.
 *
 *   guide_shown ─(게이트 통과)→ ready ─[확인받기]→ capturing(3~5장) → done → 화면 5
 *                                                     └ failed → guide_shown (다시 통과해야 누를 수 있다)
 *
 * 가이드 모양은 지금 규칙 기반 guides.ts. AI 완성본에서 뽑은 모양(#157)이 오면 outlineOf 만 바뀐다.
 */

import type { Lab } from "./color";
import { unitScale } from "./baseline";
import { createBundleCollector, type BundleState } from "./capture-bundle";
import { gateStep, poseOf, type LiveLimits, LIVE_LIMITS } from "./gate";
import { lookGuide, linerOutline, GUIDE_PARAMS } from "./guides";
import type { LookPart, LookPartId } from "./looks";
import { partVisible } from "./landmarks";
import { foreheadStep, startForeheadTrack, type ForeheadTrack } from "./occlusion";
import { guideOutline, type Outline } from "./overlay";
import type { GateResult, PartId, Pt } from "./types";

/** 화면이 프레임마다 넣는 것. 픽셀 측정(선명·이마 색)은 화면이 한다 (screens/frame-measure) */
export interface LiveFrame<I> {
  /** 프레임 시각(ms) */
  t: number;
  /** 478점 px. 얼굴을 못 찾았으면 null */
  lm: readonly Pt[] | null;
  w: number;
  h: number;
  sharpness?: number;
  /** 이마 L*a*b*. 못 쟀으면 없음 */
  lab?: Lab;
  /** 지금 프레임 사진. 묶음을 모을 때만 부른다 — 프레임마다 복사하면 무겁다 */
  image: () => I;
}

export interface LiveRunOptions {
  partId: PartId;
  /** 맨얼굴 기준 (Baseline 의 필요한 것만) */
  baseline: { lm: readonly Pt[]; foreheadL: number };
  /** 기준 이마 a*·b*. 촬영 직후에만 있다 (복원하면 없음 → 색 조건 생략) */
  baseAb?: { a: number; b: number };
  /** 고른 룩의 parts — 라이너 두께가 따라간다 */
  lookParts: Partial<Record<LookPartId, LookPart>>;
  limits?: LiveLimits;
}

export interface LiveStep<I> {
  gate: GateResult;
  /** 이 프레임 좌표(px)의 가이드 테두리. 얼굴이 없으면 null (테두리만 사라진다) */
  outline: Outline | null;
  /** 확인받기를 누른 뒤에만. 끝나면(done·failed) 다음 프레임부터 다시 null */
  bundle: BundleState<I> | null;
}

/** 합성 없이 모양만 부를 때 넘기는 빈 이미지 — guides.ts 는 랜드마크와 기준 길이만 본다 */
const NO_IMAGE = { data: new Uint8ClampedArray(0), w: 0, h: 0 };

/** 화면 4 테두리 (선만, 면 채우기 없음 F-07). 라이너는 두께 윤곽, 나머지는 결과 화면과 같은 테두리 */
export function outlineOf(partId: PartId, lm: readonly Pt[], lookParts: Partial<Record<LookPartId, LookPart>>): Outline {
  const f = { im: NO_IMAGE, lm, unit: unitScale(lm) };
  const g = lookGuide(lookParts)(partId, f);
  if (partId === "liner") {
    const o = linerOutline(f, g.liner?.thick ?? GUIDE_PARAMS.liner.thick);
    return { polys: [o.R, o.L], lines: [] };
  }
  return guideOutline(partId, lm, g);
}

export function createLiveRun<I>(opt: LiveRunOptions): { step(f: LiveFrame<I>): LiveStep<I>; press(): boolean } {
  const limits = opt.limits ?? LIVE_LIMITS;
  const base = poseOf(opt.baseline.lm);
  let stable = 0;
  let fj: ForeheadTrack = startForeheadTrack();
  let lastOk = false;
  let collector: ReturnType<typeof createBundleCollector<I>> | null = null;

  return {
    step(f) {
      let gate: GateResult;
      let outline: Outline | null = null;
      let occluded: boolean | null = null;
      if (!f.lm) {
        const r = gateStep(stable, opt.partId, { faceDetected: false, yaw: 0, pitch: 0 }, limits);
        stable = r.stable;
        gate = r.gate;
      } else {
        const pose = poseOf(f.lm);
        if (f.lab) {
          const o = foreheadStep(fj, f.t, f.lab, pose);
          fj = o.track;
          occluded = o.occluded;
        }
        const r = gateStep(stable, opt.partId, {
          faceDetected: true, ...pose, baseYaw: base.yaw, basePitch: base.pitch,
          partVisible: partVisible(opt.partId, f.lm, f.w, f.h),
          ...(occluded !== null ? { occluded } : {}),
          ...(f.sharpness !== undefined ? { sharpness: f.sharpness } : {}),
          ...(f.lab ? { foreheadL: f.lab.L, foreheadAb: { a: f.lab.a, b: f.lab.b } } : {}),
          baselineL: opt.baseline.foreheadL,
          ...(opt.baseAb ? { baselineAb: opt.baseAb } : {}),
        }, limits);
        stable = r.stable;
        gate = r.gate;
        outline = outlineOf(opt.partId, f.lm, opt.lookParts);
      }
      lastOk = gate.ok;

      let bundle: BundleState<I> | null = null;
      if (collector) {
        bundle = collector.push({ image: f.image(), lm: f.lm, handOverlap: occluded, foreheadL: f.lab?.L ?? null, t: f.t });
        if (bundle.status !== "collecting") {
          collector = null;
          // 한 묶음이 끝나면 처음부터 다시 통과해야 한다 (실패 뒤 곧바로 또 눌리지 않게)
          stable = 0;
          lastOk = false;
        }
      }
      return { gate, outline, bundle };
    },
    press() {
      if (!lastOk || collector) return false;
      collector = createBundleCollector<I>();
      return true;
    },
  };
}

