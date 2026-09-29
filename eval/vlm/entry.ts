/**
 * VLM 선정 실험 (eval/vlm) — 앱 코드를 그대로 불러 쓰는 입구. vlm_core.mjs 가 esbuild 로 묶는다.
 *
 * 실험이 앱과 다른 것을 재면 안 된다: 측정(face-measure) · 프롬프트(vlm-prompt) · 관문(personalize.resolvePlan)
 * · 화장 템플릿(rules/looks.json) 은 전부 앱 파일을 그대로 쓴다. 여기서 새로 만드는 것은 실험 조건뿐이다
 *   - 입력 형식 B·C·D (A = 앱 프롬프트 그대로)
 *   - JSON 스키마 (관문이 받는 모양과 같은 허용값 — 제약 디코딩용)
 *   - 측정값 뒤집기 (4단계)
 */

import { measureFace, type FaceMeasure } from "../../client/src/core/face-measure";
import { lookById, LOOKS } from "../../client/src/core/looks";
import { BLUSH_POSITIONS, DROOP_MARGIN_DEG, FACE_SHAPES, LINER_STYLES, PLAN_LIMITS, PLAN_RULES, droopDeg, resolvePlan, type PersonalPlan } from "../../client/src/core/personalize";
import type { FaceShape, Pt } from "../../client/src/core/types";
import { buildVlmPrompt } from "../../client/src/core/vlm-prompt";

export type Variant = "A" | "B" | "C" | "D";

export function measure(lm: readonly Pt[]): FaceMeasure {
  return measureFace(lm);
}

export function lookIds(): string[] {
  return LOOKS.map((l) => l.id);
}

const MEASURE_HEAD = "## 이 얼굴을 잰 값";
const DECIDE_HEAD = "## 정할 것";
const f1 = (v: number): string => v.toFixed(1);

/** 측정값 칸만 형식별로 바꾼다. A 는 앱 프롬프트 그대로 */
export function prompt(m: FaceMeasure, lookId: string, variant: Variant, faceShape: FaceShape | null = null): string {
  const full = buildVlmPrompt(m, lookById(lookId), faceShape);
  if (variant === "A") return full;
  const i = full.indexOf(MEASURE_HEAD), j = full.indexOf(DECIDE_HEAD);
  if (i < 0 || j < 0) throw new Error("앱 프롬프트 모양이 바뀌었다 — entry.ts 의 제목 두 개를 맞춰 주세요");
  const shape = faceShape ? `${faceShape.label}` : null;
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2, droop = droopDeg(m), lip = m.lip.upperLowerRatio;
  let section = "";
  if (variant === "B") {
    // 말만 (숫자 없음) — 작은 모델은 숫자보다 말을 잘 따른다는 가설 (조사 보고서)
    section = [
      `${MEASURE_HEAD} (얼굴 점 478개에서 계산)`,
      `- 눈꼬리: ${droop > 2 ? "처진 눈" : "처진 눈 아님"}`,
      `- 눈두덩: ${gap < PLAN_RULES.lidGapStd - PLAN_RULES.lidGapTol ? "좁은 편" : gap > PLAN_RULES.lidGapStd + PLAN_RULES.lidGapTol ? "넓은 편" : "보통"}`,
      `- 윗입술: ${lip == null ? "모름" : lip < PLAN_RULES.lipTarget ? "아랫입술보다 얇은 편" : "충분함"}`,
      `- 얼굴형 판정: ${shape ?? "없음 — 사진을 보고 골라 주세요"}`,
    ].join("\n");
  } else if (variant === "C") {
    // 숫자만 (해석 없음)
    section = [
      `${MEASURE_HEAD} (얼굴 점 478개에서 계산)`,
      `- 눈꼬리 기울기(°): 오른쪽 ${f1(m.eye.R.tiltDeg)}, 왼쪽 ${f1(m.eye.L.tiltDeg)}`,
      `- 눈꼬리 처짐 α − β 평균(°): ${f1(droop)}`,
      `- 눈두덩 비: ${gap.toFixed(2)}`,
      `- 윗입술 ÷ 아랫입술: ${lip == null ? "모름" : lip.toFixed(2)}`,
      `- 얼굴형 판정: ${shape ?? "없음"}`,
    ].join("\n");
  } else {
    // D: 측정값 없이 사진만
    section = `${MEASURE_HEAD}\n- 없음 — 사진을 보고 판단해 주세요`;
  }
  return full.slice(0, i) + section + "\n\n" + full.slice(j);
}

/** 제약 디코딩용 JSON 스키마. 관문(resolvePlan)이 받는 모양·허용값과 같다 */
export function schema(): object {
  const num = ([lo, hi]: readonly [number, number]) => ({ type: "number", minimum: lo, maximum: hi });
  const parts = ["brow", "liner", "shadow", "lip", "cheek"];
  const text = { type: "string", maxLength: PLAN_LIMITS.rationaleMax };
  return {
    type: "object",
    // 결정 필드를 근거 문장보다 앞에 (조사 보고서: 설명하다 결정이 흔들리지 않게)
    properties: {
      liner: { type: "object", properties: { style: { enum: [...LINER_STYLES] } }, required: ["style"], additionalProperties: false },
      linerThick: { type: "object", properties: { scale: num(PLAN_LIMITS.linerThick) }, required: ["scale"], additionalProperties: false },
      faceShape: { type: "object", properties: { label: { enum: [...FACE_SHAPES] } }, required: ["label"], additionalProperties: false },
      shadow: { type: "object", properties: { range: num(PLAN_LIMITS.shadowRange) }, required: ["range"], additionalProperties: false },
      lip: { type: "object", properties: { overline: num(PLAN_LIMITS.lipOverline) }, required: ["overline"], additionalProperties: false },
      blush: { type: "object", properties: { position: { enum: [...BLUSH_POSITIONS] }, size: num(PLAN_LIMITS.blushSize) }, required: ["position", "size"], additionalProperties: false },
      highlight: { type: "object", properties: { tZone: { type: "boolean" } }, required: ["tZone"], additionalProperties: false },
      intensity: { type: "object", properties: Object.fromEntries(parts.map((p) => [p, num(PLAN_LIMITS.intensity)])), additionalProperties: false },
      rationale: { type: "object", properties: Object.fromEntries(parts.map((p) => [p, text])), additionalProperties: false },
    },
    required: ["liner", "linerThick", "faceShape", "shadow", "lip", "blush", "highlight", "intensity", "rationale"],
    additionalProperties: false,
  };
}

/** 결정 필드만 평평하게 — 반복 일관성·뒤집기 비교에 쓴다 */
export function decisions(p: PersonalPlan): Record<string, string | number | boolean | null> {
  return {
    "liner.style": p.liner.plan.style,
    "linerThick.scale": round2(p.linerThick.scale),
    "faceShape.label": p.faceShape,
    "shadow.range": round2(p.shadow.range),
    "lip.overline": round2(p.lip.overline),
    "blush.position": p.blush.position,
    "blush.size": round2(p.blush.size),
    "highlight.tZone": p.highlight.tZone,
    ...Object.fromEntries(Object.entries(p.intensity).map(([k, v]) => [`intensity.${k}`, round2(v ?? 1)])),
  };
}
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 관문: VLM 제안(파싱 전 문자열이어도 됨) → 받아들인 계획 + 거절 목록. 파싱 실패도 거절로 센다 */
export function gate(m: FaceMeasure, raw: unknown, faceShape: FaceShape | null = null): { ok: boolean; parsed: boolean; rejected: string[]; plan: PersonalPlan; decisions: ReturnType<typeof decisions> } {
  let proposal: unknown = raw, parsed = true;
  if (typeof raw === "string") {
    try {
      proposal = JSON.parse(raw);
    } catch {
      parsed = false;
      proposal = raw;   // resolvePlan 이 "JSON 객체가 아님" 으로 거절한다
    }
  }
  const plan = resolvePlan(m, { faceShape }, proposal);
  return { ok: parsed && plan.rejected.length === 0, parsed, rejected: plan.rejected, plan, decisions: decisions(plan) };
}

/** 규칙만으로 만든 계획 (6단계 사람 선호의 비교 대상) */
export function rulePlan(m: FaceMeasure, faceShape: FaceShape | null = null): ReturnType<typeof decisions> & { rationale: PersonalPlan["rationale"] } {
  const p = resolvePlan(m, { faceShape });
  return { ...decisions(p), rationale: p.rationale };
}

/**
 * 4단계 — 측정값 하나만 뒤집는다. 각 뒤집기에서 규칙이 기대하는 방향(규칙 계획의 해당 필드 변화)을 같이 준다.
 * VLM 이 측정값을 따르면 같은 방향으로 바뀌어야 한다
 */
export function flips(m: FaceMeasure, faceShape: FaceShape | null = null): { name: string; field: string; m: FaceMeasure; ruleBefore: unknown; ruleAfter: unknown }[] {
  const clone = (): FaceMeasure => JSON.parse(JSON.stringify(m)) as FaceMeasure;
  const out: { name: string; field: string; m: FaceMeasure }[] = [];
  // 눈꼬리: 처진 눈 기준(DROOP_MARGIN_DEG)을 확실히 넘게 옮긴다 — 부호만 바꾸면 기준 안쪽에서 맴돌아 규칙이 안 바뀐다
  const droop = clone(), d = droopDeg(m), target = d > DROOP_MARGIN_DEG ? -1 : DROOP_MARGIN_DEG + 3, shift = target - d;
  for (const s of ["R", "L"] as const) {
    const e = droop.eye[s];
    e.alphaDeg += shift;
    e.outerCornerDown = e.alphaDeg > e.betaDeg;
    e.tiltDeg += target > 0 ? -Math.abs(e.tiltDeg) - 3 : Math.abs(e.tiltDeg) + 3;   // 처지면 기울기도 내려간 쪽으로
  }
  out.push({ name: "droop", field: "liner.style", m: droop });
  // 눈두덩: 좁은 쪽 ↔ 넓은 쪽 (표준을 가운데로 대칭)
  const lid = clone();
  for (const s of ["R", "L"] as const) lid.eye[s].lidGapRatio = 2 * PLAN_RULES.lidGapStd - lid.eye[s].lidGapRatio;
  out.push({ name: "lidGap", field: "shadow.range", m: lid });
  // 윗입술: 얇음 ↔ 충분 (목표를 가운데로 대칭)
  if (m.lip.upperLowerRatio != null) {
    const lip = clone();
    // 얇음 ↔ 충분: 목표(lipTarget)를 확실히 넘거나 모자라게
    lip.lip.upperLowerRatio = m.lip.upperLowerRatio < PLAN_RULES.lipTarget ? PLAN_RULES.lipTarget + 0.2 : PLAN_RULES.lipTarget - 0.25;
    out.push({ name: "lip", field: "lip.overline", m: lip });
  }
  const before = decisions(resolvePlan(m, { faceShape }));
  return out.map((f) => ({ ...f, ruleBefore: before[f.field], ruleAfter: decisions(resolvePlan(f.m, { faceShape }))[f.field] }));
}
