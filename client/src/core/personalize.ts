/**
 * 개인화 — 측정값에서 "이 사람에게 어떻게 그릴지" 를 정한다 (논문 기술 B: 라이너).
 *
 * 값을 내는 쪽은 두 가지다. 규칙(여기)과, 나중에 붙일 VLM(맨얼굴 + 템플릿 → 제안).
 * 어느 쪽이 내든 **같은 형식**이고 **같은 검증 관문**을 지난다(resolveLiner). 측정과 모순되는
 * 제안은 거절하고 규칙값으로 되돌린다 — 가이드 선은 채점의 0점이라 흔들리면 안 된다.
 *
 * 스타일 이름은 ILoveEye(2022)의 라이너 스타일을 따른다.
 *   winged — 날개를 눈 축에서 위로 올린다
 *   drop   — 윗눈꺼풀 꼭대기 → 눈꼬리 선을 그대로 연장한다 (처진 눈을 "따라감")
 *   extend — 눈 축을 곧게 연장한다 (처진 눈을 "보정")
 */

import type { FaceMeasure } from "./face-measure";

export type LinerStyle = "winged" | "drop" | "extend";
export const LINER_STYLES: readonly LinerStyle[] = ["winged", "drop", "extend"];

/** 룩이 정한다: 처진 눈일 때 눈매를 따라갈지(follow), 바로잡을지(correct) */
export type LinerAdapt = "follow" | "correct";

/** 왜 이 스타일인가 — 근거 문장을 고르거나 VLM 에게 넘길 때 쓴다 */
export type LinerReason = "not_down" | "down_follow" | "down_correct";

export interface LinerPlan {
  style: LinerStyle;
  reason: LinerReason;
}

/**
 * 처진 눈으로 볼 여유 구간(°). α − β 가 이보다 커야 처진 눈이다.
 * 실측에서 고개를 움직이면 눈꼬리 각이 약 ±2° 흔들렸다 — 그 흔들림으로 스타일이 뒤집히지 않게.
 * 논문 값이 아니라 우리 가정값이다. 사용자 실험(#84)으로 확인한다.
 */
export const DROOP_MARGIN_DEG = 2;

/** 양쪽 눈의 α − β 평균. 한 스타일로 양쪽을 같이 그리므로 평균으로 본다 */
export function droopDeg(m: FaceMeasure): number {
  return (m.eye.R.alphaDeg - m.eye.R.betaDeg + (m.eye.L.alphaDeg - m.eye.L.betaDeg)) / 2;
}

const isDown = (m: FaceMeasure): boolean => droopDeg(m) > DROOP_MARGIN_DEG;

const reasonOf = (m: FaceMeasure, style: LinerStyle): LinerReason =>
  !isDown(m) ? "not_down" : style === "drop" ? "down_follow" : "down_correct";

/** 규칙: 처진 눈이 아니면 winged, 처진 눈이면 룩 설정에 따라 drop 또는 extend */
export function planLiner(m: FaceMeasure, adapt: LinerAdapt = "correct"): LinerPlan {
  if (!isDown(m)) return { style: "winged", reason: "not_down" };
  return adapt === "follow" ? { style: "drop", reason: "down_follow" } : { style: "extend", reason: "down_correct" };
}

export interface LinerDecision {
  plan: LinerPlan;
  source: "rule" | "vlm";
  /** 제안을 거절했으면 그 이유 */
  rejected?: string;
}

/**
 * 검증 관문. 제안(VLM)이 있으면 측정과 대조해 받거나 거절하고, 없으면 규칙값.
 * 거절 조건: 모르는 스타일 / 처진 눈이 아닌데 drop(없는 처짐을 따라 그리게 된다).
 */
export function resolveLiner(m: FaceMeasure, adapt: LinerAdapt = "correct", proposal?: { style: string }): LinerDecision {
  const rule: LinerDecision = { plan: planLiner(m, adapt), source: "rule" };
  if (!proposal) return rule;
  const style = LINER_STYLES.find((s) => s === proposal.style);
  if (!style) return { ...rule, rejected: `모르는 스타일: ${proposal.style}` };
  if (style === "drop" && !isDown(m)) return { ...rule, rejected: "처진 눈이 아닌데 drop 을 제안함" };
  return { plan: { style, reason: reasonOf(m, style) }, source: "vlm" };
}
