/**
 * 화면 4 품질 게이트 — "지금 확인받아도 되나" (정의서 3-3·3-7, 2-1 셋째 조각 #21). 순수 함수, DOM·카메라를 모른다.
 * poc/full/lib/gate.js 의 evaluateGate 를 계약 타입(GateResult)에 맞춰 옮기고, 화면 1(flow.ts shotGate)과 값·문구를 맞췄다.
 *
 *   얼굴 → 정면 → 기준 각도 차 → 표정 차 → 부위 보임 → 가림 → 선명 → 밝기 → 색 → 안정
 *   안 맞는 것 하나만 한 줄, 숫자 없음. 통과 전에는 "확인받기" 버튼이 꺼져 있다.
 *
 * 측정은 화면 1 과 같은 코드를 쓴다: 각도 capture-measure · 선명·이마 색 frame-measure · 가림 occlusion.foreheadStep.
 * 표정 차(expr_diff, #27): 맨얼굴 때 표정과의 차(core/expression.exprDiff). 맨얼굴 값이 없으면 건너뛴다 (① #177 전).
 */

import { yawFromLandmarks } from "./capture-measure";
import { CAPTURE_LIMITS, SHOT_TEXT } from "./flow";
import { LM, at } from "./landmarks";
import type { GateFail, GateResult, PartId, Pt } from "./types";

export interface LiveLimits {
  /** 정면 한계(°) */
  yaw: number;
  pitch: number;
  /** 기준 사진과의 각도 차 한계(°). 넘으면 정합이 감당 못 한다 (tech-review 화면 4 실기기 1차) */
  dYaw: number;
  dPitch: number;
  /** 표정 차(블렌드셰이프 0~1 중 가장 크게 달라진 양) 한계. 가정값 — 촬영 세션(#58)에서 확정 */
  exprTol: number;
  sharpMin: number;
  brightTol: number;
  brightMin: number;
  brightMax: number;
  colorTol: number;
  stableFrames: number;
}

/** 선명·밝기·색·안정은 화면 1 과 같은 값 (flow.ts CAPTURE_LIMITS 주석 "화면 4 게이트와 값을 맞춘다") */
export const LIVE_LIMITS: LiveLimits = {
  yaw: 15, pitch: 10, dYaw: 8, dPitch: 6, exprTol: 0.35,
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
  expr: "처음 찍을 때처럼 편한 표정으로 있어 주세요",
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
  /** 기준 사진과의 각도 차(도) — rigidPoseDiff. 있으면 baseYaw·basePitch 대신 이것으로 본다 (턱·입을 안 씀, #28) */
  poseDiff?: { yaw: number; pitch: number };
  /** 맨얼굴 때와의 표정 차 (expression.exprDiff). 없으면 조건 생략 */
  exprDiff?: number;
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

/**
 * 기준 각도 차를 강체 점으로 (#28). 옛 방식(poseOf)은 턱 끝(152)·얼굴 옆을 써서 입을 벌리면 숙인 것으로 잡혔다.
 * 양 눈꼬리(33·263)를 자로 삼아 코끝(4)이 그 선에서 옆·아래로 얼마나 옮겨 갔나를 눈꼬리 거리로 나눈다 →
 * 크기·기울기·위치에 안 흔들린다. 도로 바꾸는 계수 k = (코끝이 눈꼬리 면에서 나온 깊이) ÷ (눈꼬리 거리), 작은 각 근사.
 * k 는 **옛 방식(poseOf)의 눈금에 맞춘 값** — 게이트 한계(dYaw 8 · dPitch 6)가 옛 눈금으로 폰에서 정한 값이라서.
 * 2026-09-29 PC 웹캠 `?pose` 보정(입 다물고 끄덕·돌리기): yaw 0.462(439점) · pitch 1.112(333점)·1.31(538점) → 가중 평균 1.23.
 * (처음 어림 0.35 는 실제 각도 기준이었는데, 옛 pitch 눈금이 눌려 있어 3배 차이) 폰 시험 때 한 번 더 확인.
 *
 * 입을 크게 벌렸을 때 직전 대비 흔들림(같은 날, 152프레임, 중앙/최대): 옛 방식(턱) 8.0°/9.2° → 코끝 2.9°/3.6° (한계 6°).
 * 이마(10)·콧대(6)·3D 행렬도 2~3° 라 남은 양은 "아" 할 때 실제로 고개가 움직인 것. 코끝을 쓰는 이유: 눈꼬리 선에서 멀어
 * 같은 각도에 더 크게 움직인다 → 가만히 있을 때 잡음에 덜 흔들린다. 측정 도구: screens/pose-probe.ts
 */
export const RIGID_POSE = { kYaw: 0.462, kPitch: 1.23, nose: 4 } as const;

function rigidOffset(lm: readonly Pt[]): { x: number; y: number } {
  const a = at(lm, LM.eyeA.outer), b = at(lm, LM.eyeB.outer), n = at(lm, RIGID_POSE.nose);
  const D = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / D, y: (b.y - a.y) / D }, v = { x: -u.y, y: u.x };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = { x: n.x - m.x, y: n.y - m.y };
  return { x: (d.x * u.x + d.y * u.y) / D, y: (d.x * v.x + d.y * v.y) / D };
}

/** 기준 사진 → 지금, 각도 차(도). 부호는 비교에 안 쓰고 크기만 본다 */
export function rigidPoseDiff(baseLm: readonly Pt[], curLm: readonly Pt[], k: { kYaw: number; kPitch: number } = RIGID_POSE): { yaw: number; pitch: number } {
  const b = rigidOffset(baseLm), c = rigidOffset(curLm), deg = 180 / Math.PI;
  return { yaw: ((c.x - b.x) / k.kYaw) * deg + 0, pitch: ((c.y - b.y) / k.kPitch) * deg + 0 };
}

/**
 * 화면 4 의 정면 각도 (#193) — **지금 얼굴의 턱·얼굴 옆을 안 쓴다.**
 * poseOf 는 턱 끝(152)·얼굴 옆(234·454)을 써서 입을 크게 벌리면 숙인 것으로 잡혀(합성 얼굴 약 -9°) "조금만 정면으로" 로 막혔다.
 * 맨얼굴 사진의 각도(촬영 관문을 통과한 입 다문 정면이라 poseOf 가 믿을 만함) + 맨얼굴 대비 변화(rigidPoseDiff, 강체 점)로 잰다.
 * 부호는 poseOf 와 같게: 강체 yaw 는 이미지 오른쪽이 + 라 거울 기준 poseOf 와 반대 → 뺀다.
 * 화면 1(촬영)은 그대로 poseOf — 맨얼굴을 찍을 땐 입을 다물고 있고, 기준이 되는 사진이라 따로 잴 것이 없다
 */
export function livePose(baseLm: readonly Pt[], curLm: readonly Pt[]): { yaw: number; pitch: number } {
  const b = poseOf(baseLm), d = rigidPoseDiff(baseLm, curLm);
  return { yaw: b.yaw - d.yaw, pitch: b.pitch + d.pitch };
}

/** 원점을 지나는 기울기 (최소제곱). 환산 계수 보정용 — 점이 없으면 null */
export function slopeFit(pairs: readonly (readonly [number, number])[]): number | null {
  let xy = 0, xx = 0;
  for (const [x, y] of pairs) { xy += x * y; xx += x * x; }
  return xx > 0 ? xy / xx : null;
}

export function evaluateGate(partId: PartId, m: LiveMeasure, limits: LiveLimits = LIVE_LIMITS): GateResult {
  const stableCount = m.stableCount ?? 0;
  const fail = (firstFail: GateFail, text: string): GateResult => ({ ok: false, firstFail, text, stableCount });

  if (!m.faceDetected) return fail("face", GATE_TEXT.face);
  // NaN·Infinity 는 비교가 전부 false 라 모든 조건을 통과해 버린다 (정의서 3-5 "깨진 측정값")
  if (!measureFinite(m)) return fail("face", GATE_TEXT.face);
  if (Math.abs(m.yaw) > limits.yaw || Math.abs(m.pitch) > limits.pitch) return fail("angle", GATE_TEXT.angle);
  const pd = m.poseDiff ?? (typeof m.baseYaw === "number" && typeof m.basePitch === "number" ? { yaw: m.yaw - m.baseYaw, pitch: m.pitch - m.basePitch } : null);
  if (pd && (Math.abs(pd.yaw) > limits.dYaw || Math.abs(pd.pitch) > limits.dPitch)) return fail("pose_diff", GATE_TEXT.pose);
  if (typeof m.exprDiff === "number" && m.exprDiff > limits.exprTol) return fail("expr_diff", GATE_TEXT.expr);
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
  const nums = [m.yaw, m.pitch, m.baseYaw, m.basePitch, m.poseDiff?.yaw, m.poseDiff?.pitch, m.exprDiff, m.sharpness, m.foreheadL, m.baselineL, m.stableCount,
    m.foreheadAb?.a, m.foreheadAb?.b, m.baselineAb?.a, m.baselineAb?.b];
  return nums.every((v) => v === undefined || Number.isFinite(v));
}
