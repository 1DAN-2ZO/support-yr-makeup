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
import type { LookPartId } from "./looks";
import type { FaceShape, FaceShapeLabel } from "./types";

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

// ── 개인화 계획 전체 (VLM 제안 → 검증 관문) ────────────────────────────

/**
 * 얼굴형별 표준 눈썹 조정 mm (장소쌍·최민령 2023, JKSC — 전문가 30명이 가장 많이 고른 값).
 * height: 눈과 눈썹 사이 간격(+ 면 높게), glabella: 미간 너비(− 면 좁게).
 * ⑤ 의 5분류로 옮겼다: oblong = 긴형, heart = 역삼각형. 논문의 다이아몬드형은 ⑤ 분류에 없다.
 */
export const JKSC_BROW_ADJUST_MM: Record<FaceShapeLabel, { height: number; glabella: number }> = {
  oblong: { height: -4, glabella: -4 },
  heart: { height: 0, glabella: 0 },
  square: { height: 0, glabella: 0 },
  oval: { height: 4, glabella: -4 },
  round: { height: 4, glabella: -4 },
};

/**
 * 논문 조정값에 곱하는 배율. 논문도 "4 mm 면 인상이 크게 바뀐다" 고 경고하고, 얼굴형 판정이 5번에 1번은 틀린다(⑤ 81.5%).
 * 틀렸을 때 티가 덜 나게 절반으로 시작한다 — 우리 가정값, 사용자 실험(#84)으로 확인.
 */
export const BROW_ADJUST_SCALE = 0.5;

/** ⑤ 모델 판정을 VLM 보다 앞세우는 확신도 */
export const FACESHAPE_TRUST = 0.6;

export type BrowArch = "flatter" | "standard" | "arched";
export const BROW_ARCHES: readonly BrowArch[] = ["flatter", "standard", "arched"];
export const FACE_SHAPES: readonly FaceShapeLabel[] = ["oval", "round", "square", "oblong", "heart"];
const INTENSITY_PARTS: readonly LookPartId[] = ["brow", "liner", "shadow", "cheek", "lip"];

/** 받아 주는 범위. 벗어나면 그 항목만 규칙값 — 가정값이다 */
export const PLAN_LIMITS = { shadowRange: [0.8, 1.2], intensity: [0.7, 1.3], rationaleMax: 40 } as const;

/** 굽기 기본값 (Zhao 2019: 둥근 얼굴일수록 굽은 눈썹, JKSC 와 같은 방향) */
const archOf = (s: FaceShapeLabel | null): BrowArch => (s === "round" ? "arched" : s === "oblong" ? "flatter" : "standard");

export interface BrowPlanValues {
  faceShape: FaceShapeLabel | null;
  source: "rule" | "vlm";
  /** 표준 눈썹에서 옮길 mm (이미 BROW_ADJUST_SCALE 적용) */
  heightMm: number;
  glabellaMm: number;
  arch: BrowArch;
}

export interface PersonalPlan {
  liner: LinerDecision;
  brow: BrowPlanValues;
  /** 섀도 높이 배율 (guides 의 rangeRatio 에 곱한다) */
  shadow: { range: number; source: "rule" | "vlm" };
  /** 부위별 진하기 배율. 없는 부위는 1 */
  intensity: Partial<Record<LookPartId, number>>;
  /** 부위별 근거 한 줄 (화면 3). 숫자 없음 (F-09) */
  rationale: Partial<Record<LookPartId, string>>;
  /** 거절한 제안과 이유 — 로그와 프롬프트 개선에 쓴다 */
  rejected: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const inRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * 개인화 계획. 규칙값을 먼저 세우고, VLM 제안(믿지 않는 JSON)은 항목별로 측정·규칙과 대조해 받거나 거절한다.
 * 한 항목이 틀려도 나머지는 살린다. 제안이 JSON 객체가 아니면 통째로 규칙값.
 */
export function resolvePlan(
  m: FaceMeasure,
  opts: { adapt?: LinerAdapt; faceShape?: FaceShape | null } = {},
  proposal?: unknown,
): PersonalPlan {
  const rejected: string[] = [];
  const p = proposal === undefined ? {} : isObj(proposal) ? proposal : null;
  if (p === null) rejected.push("제안이 JSON 객체가 아님");
  const q = p ?? {};

  // 라이너 — 기존 관문
  const lp = isObj(q.liner) && typeof q.liner.style === "string" ? { style: q.liner.style } : undefined;
  const liner = resolveLiner(m, opts.adapt, lp);
  if (liner.rejected) rejected.push(`라이너: ${liner.rejected}`);

  // 얼굴형 — ⑤ 모델이 확신하면 그것, 아니면 VLM, 둘 다 없으면 모름.
  // 개인화가 채점의 정답이 되므로 믿을 수 없는 판정(규칙 22%, 확신 낮은 모델)으로는 눈썹을 옮기지 않는다
  const fs = opts.faceShape;
  const trusted = fs && fs.method === "model" && fs.confidence >= FACESHAPE_TRUST ? fs.label : null;
  let shape: FaceShapeLabel | null = trusted;
  let browSource: "rule" | "vlm" = "rule";
  if (isObj(q.faceShape)) {
    const label = FACE_SHAPES.find((s) => isObj(q.faceShape) && s === q.faceShape.label);
    if (!label) rejected.push(`얼굴형: 모르는 이름 ${String(q.faceShape.label)}`);
    else if (trusted && label !== trusted) rejected.push(`얼굴형: ⑤ 판정(${trusted})과 다름 — ${label}`);
    else if (!trusted) { shape = label; browSource = "vlm"; }
  }

  // 눈썹 굽기 — 얼굴형과 반대 방향이면 거절
  let arch = archOf(shape);
  if (isObj(q.brow) && q.brow.arch !== undefined) {
    const a = BROW_ARCHES.find((s) => isObj(q.brow) && s === q.brow.arch);
    if (!a) rejected.push(`눈썹 굽기: 모르는 값 ${String(q.brow.arch)}`);
    else if ((shape === "oblong" && a === "arched") || (shape === "round" && a === "flatter")) rejected.push(`눈썹 굽기: ${shape} 에 ${a} 는 반대 방향`);
    else { arch = a; browSource = "vlm"; }
  }
  const adj = shape ? JKSC_BROW_ADJUST_MM[shape] : { height: 0, glabella: 0 };
  const brow: BrowPlanValues = { faceShape: shape, source: browSource, heightMm: adj.height * BROW_ADJUST_SCALE, glabellaMm: adj.glabella * BROW_ADJUST_SCALE, arch };

  // 섀도 범위
  let shadow: PersonalPlan["shadow"] = { range: 1, source: "rule" };
  if (isObj(q.shadow) && q.shadow.range !== undefined) {
    if (inRange(q.shadow.range, PLAN_LIMITS.shadowRange)) shadow = { range: q.shadow.range, source: "vlm" };
    else rejected.push(`섀도 범위: ${String(q.shadow.range)} 는 ${PLAN_LIMITS.shadowRange.join("~")} 밖`);
  }

  // 진하기 — 부위별
  const intensity: PersonalPlan["intensity"] = {};
  if (isObj(q.intensity)) {
    for (const [k, v] of Object.entries(q.intensity)) {
      const part = INTENSITY_PARTS.find((s) => s === k);
      if (!part) rejected.push(`진하기: 모르는 부위 ${k}`);
      else if (!inRange(v, PLAN_LIMITS.intensity)) rejected.push(`진하기: ${k} ${String(v)} 는 ${PLAN_LIMITS.intensity.join("~")} 밖`);
      else intensity[part] = v;
    }
  }

  // 근거 문장 — 숫자 없음(F-09), 짧게
  const rationale: PersonalPlan["rationale"] = {};
  if (isObj(q.rationale)) {
    for (const [k, v] of Object.entries(q.rationale)) {
      const part = INTENSITY_PARTS.find((s) => s === k);
      if (!part || typeof v !== "string") rejected.push(`근거: ${k} 모양이 틀림`);
      else if (/\d/.test(v)) rejected.push(`근거: ${k} 에 숫자가 있음`);
      else if (v.length > PLAN_LIMITS.rationaleMax) rejected.push(`근거: ${k} 가 너무 김`);
      else rationale[part] = v.trim();
    }
  }

  return { liner, brow, shadow, intensity, rationale, rejected };
}
