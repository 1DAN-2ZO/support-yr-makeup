/**
 * 화면 4 품질 게이트 — "지금 확인받아도 되나" (정의서 3-3·3-7, 2-1 셋째 조각 #21). 순수 함수, DOM·카메라를 모른다.
 * poc/full/lib/gate.js 의 evaluateGate 를 계약 타입(GateResult)에 맞춰 옮기고, 화면 1(flow.ts shotGate)과 값·문구를 맞췄다.
 *
 *   얼굴 → 정면 → 기준 각도 차 → 부위 보임 → 가림 → 선명 → 밝기 → 색 → 안정
 *   안 맞는 것 하나만 한 줄, 숫자 없음. 통과 전에는 "확인받기" 버튼이 꺼져 있다.
 *
 * 측정은 화면 1 과 같은 코드를 쓴다: 각도 capture-measure · 선명·이마 색 frame-measure · 가림 occlusion.foreheadStep.
 * 표정 차(expr_diff)는 아직 없다 — #27(표정 게이트, 스프린트 3).
 */

import { yawFromLandmarks } from "./capture-measure";
import { CAPTURE_LIMITS, SHOT_TEXT } from "./flow";
import type { GateFail, GateResult, PartId, Pt } from "./types";

export interface LiveLimits {
  /** 정면 한계(°) */
  yaw: number;
  pitch: number;
  /** 기준 사진과의 각도 차 한계(°). 넘으면 정합이 감당 못 한다 (tech-review 화면 4 실기기 1차) */
  dYaw: number;
  dPitch: number;
  sharpMin: number;
  brightTol: number;
  brightMin: number;
  brightMax: number;
  colorTol: number;
  stableFrames: number;
}

/** 선명·밝기·색·안정은 화면 1 과 같은 값 (flow.ts CAPTURE_LIMITS 주석 "화면 4 게이트와 값을 맞춘다") */
export const LIVE_LIMITS: LiveLimits = {
  yaw: 15, pitch: 10, dYaw: 8, dPitch: 6,
  sharpMin: CAPTURE_LIMITS.sharpMin,
  brightTol: CAPTURE_LIMITS.brightTol,
  brightMin: CAPTURE_LIMITS.brightMin,
  brightMax: CAPTURE_LIMITS.brightMax,
  colorTol: CAPTURE_LIMITS.colorTol,
  stableFrames: CAPTURE_LIMITS.stableFrames,
};

/** 화면 4 문구. 화면 1 과 같은 조건은 같은 말 */
export const GATE_TEXT = {
  face: "",   // 얼굴이 없으면 문구 없이 테두리만 사라진다 (정의서 3-9)
  angle: SHOT_TEXT.front,
  pose: "처음 찍을 때와 같은 각도로 봐 주세요",
  eyes: "양쪽 눈이 보이게 해 주세요",
  part: "부위가 다 보이게 해 주세요",
  occluded: SHOT_TEXT.occluded,
  sharp: SHOT_TEXT.sharp,
  bright_low: SHOT_TEXT.bright_low,
  bright_high: SHOT_TEXT.bright_high,
  color: SHOT_TEXT.color,
  stable: SHOT_TEXT.stable,
  ready: "확인받을 준비 됨",
} as const;

/** 양쪽 눈을 한 화면에 담는 부위 — "양쪽 눈이 보이게" */
const EYE_PARTS: readonly PartId[] = ["brow", "liner", "shadow"];

/** 프레임에서 잰 값. 없는 항목(undefined)은 그 조건을 건너뛴다 */
export interface LiveMeasure {
  faceDetected: boolean;
  /** 화면(거울) 기준 각도 — poseOf() */
  yaw: number;
  pitch: number;
  /** 기준 사진(맨얼굴 정면)의 각도 — 같은 poseOf() 로 */
  baseYaw?: number;
  basePitch?: number;
  /** landmarks.partVisible() */
  partVisible?: boolean;
  /** occlusion.foreheadStep().occluded */
  occluded?: boolean;
  sharpness?: number;
  foreheadL?: number;
  baselineL?: number;
  foreheadAb?: { a: number; b: number };
  baselineAb?: { a: number; b: number };
  stableCount?: number;
}

/** 랜드마크 → 화면(거울) 기준 각도. 화면 1 과 같은 부호 (capture.ts: yaw = -ang.yaw). 기준 사진과 라이브를 이 한 식으로 잰다 */
export function poseOf(lm: readonly Pt[]): { yaw: number; pitch: number } {
  const a = yawFromLandmarks(lm);
  return { yaw: -a.yaw, pitch: a.pitch };
}

export function evaluateGate(partId: PartId, m: LiveMeasure, limits: LiveLimits = LIVE_LIMITS): GateResult {
  const stableCount = m.stableCount ?? 0;
  const fail = (firstFail: GateFail, text: string): GateResult => ({ ok: false, firstFail, text, stableCount });

  if (!m.faceDetected) return fail("face", GATE_TEXT.face);
  // NaN·Infinity 는 비교가 전부 false 라 모든 조건을 통과해 버린다 (정의서 3-5 "깨진 측정값")
  if (!measureFinite(m)) return fail("face", GATE_TEXT.face);
  if (Math.abs(m.yaw) > limits.yaw || Math.abs(m.pitch) > limits.pitch) return fail("angle", GATE_TEXT.angle);
  if (typeof m.baseYaw === "number" && typeof m.basePitch === "number"
    && (Math.abs(m.yaw - m.baseYaw) > limits.dYaw || Math.abs(m.pitch - m.basePitch) > limits.dPitch)) {
    return fail("pose_diff", GATE_TEXT.pose);
  }
  if (m.partVisible === false) return fail("visible", EYE_PARTS.includes(partId) ? GATE_TEXT.eyes : GATE_TEXT.part);
  // 이마 급변 = 무엇이든 얼굴을 가림 (#144). 계약 이름은 아직 "hand" — #155 에서 "occluded" 로 바뀐다
  if (m.occluded) return fail("hand", GATE_TEXT.occluded);
  if (typeof m.sharpness === "number" && m.sharpness < limits.sharpMin) return fail("sharp", GATE_TEXT.sharp);
  if (typeof m.foreheadL === "number") {
    if (m.foreheadL < limits.brightMin) return fail("bright", GATE_TEXT.bright_low);
    if (m.foreheadL > limits.brightMax) return fail("bright", GATE_TEXT.bright_high);
    if (typeof m.baselineL === "number") {
      const d = m.foreheadL - m.baselineL;
      if (d < -limits.brightTol) return fail("bright", GATE_TEXT.bright_low);
      if (d > limits.brightTol) return fail("bright", GATE_TEXT.bright_high);
    }
  }
  if (m.foreheadAb && m.baselineAb) {
    const dab = Math.hypot(m.foreheadAb.a - m.baselineAb.a, m.foreheadAb.b - m.baselineAb.b);
    if (dab > limits.colorTol) return fail("color", GATE_TEXT.color);
  }
  if (stableCount < limits.stableFrames) return fail("stable", GATE_TEXT.stable);
  return { ok: true, firstFail: null, text: GATE_TEXT.ready, stableCount };
}

/**
 * 프레임마다 부른다. 안정 빼고 다 맞으면 stable +1, 아니면 0 → 그 수로 게이트 (capture-run.runStep 과 같은 방식).
 * m.stableCount 는 무시한다
 */
export function gateStep(stable: number, partId: PartId, m: LiveMeasure, limits: LiveLimits = LIVE_LIMITS): { stable: number; gate: GateResult } {
  const pre = evaluateGate(partId, { ...m, stableCount: Number.MAX_SAFE_INTEGER }, limits);
  const next = pre.ok ? stable + 1 : 0;
  return { stable: next, gate: evaluateGate(partId, { ...m, stableCount: next }, limits) };
}

function measureFinite(m: LiveMeasure): boolean {
  const nums = [m.yaw, m.pitch, m.baseYaw, m.basePitch, m.sharpness, m.foreheadL, m.baselineL, m.stableCount,
    m.foreheadAb?.a, m.foreheadAb?.b, m.baselineAb?.a, m.baselineAb?.b];
  return nums.every((v) => v === undefined || Number.isFinite(v));
}
