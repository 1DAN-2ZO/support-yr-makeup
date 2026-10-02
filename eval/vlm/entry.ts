/**
 * VLM 선정 실험 (eval/vlm) — 앱 코드를 그대로 불러 쓰는 입구. vlm_core.mjs 가 esbuild 로 묶는다.
 *
 * 실험이 앱과 다른 것을 재면 안 된다: 측정(face-measure) · 프롬프트(vlm-prompt) · 관문(personalize.resolvePlan)
 * · 화장 템플릿(rules/looks.json) 은 전부 앱 파일을 그대로 쓴다. 여기서 새로 만드는 것은 실험 조건뿐이다
 *   - 입력 형식 B·C·D·F (A = E = 앱 프롬프트 그대로) — 스키마도 앱 것(vlm-flow.vlmSchema)
 *   - 측정값 뒤집기 (4단계)
 */

import { measureFace, type FaceMeasure } from "../../client/src/core/face-measure";
import { lookById, LOOKS } from "../../client/src/core/looks";
import { DROOP_TILT_DEG, PLAN_RULES, isDroopy, resolvePlan, tiltDeg, type PersonalPlan } from "../../client/src/core/personalize";
import type { FaceShape, Pt } from "../../client/src/core/types";
import { vlmSchema } from "../../client/src/core/vlm-flow";
import { buildVlmPrompt } from "../../client/src/core/vlm-prompt";

/**
 * A~D = 측정값 칸만 바꾼 형식. E·F = 논문 조사(2026-09-29)로 만든 프롬프트 — 측정값 칸은 A 와 같고, 정할 것·답을 새로 쓴다
 *   E  예시 JSON·예시 문장 없음 (Zhao 2021 · Min 2022 · Sadani 2026: 작은 모델은 예시 값을 베낀다)
 *      필드 순서 관찰 → 근거 → 결정 (Tam 2024 · Fan 2026) · 숫자는 단계 enum (llama.cpp 는 소수 min/max 를 강제하지 않는다)
 *      관문이 거절할 값은 스키마에서 뺀다 (보고서의 "요청마다 enum 좁히기") · 근거 지시는 금지어 없이 긍정형 (Rana 2026)
 *   F  E 에서 규칙 출발점만 뺀다 — 출발점이 앵커가 되는지 (Lou & Sun 2024 · Echterhoff 2024)
 */
export type Variant = "A" | "B" | "C" | "D" | "E" | "F";

export function measure(lm: readonly Pt[]): FaceMeasure {
  return measureFace(lm);
}

export function lookIds(): string[] {
  return LOOKS.map((l) => l.id);
}

const MEASURE_HEAD = "## 이 사람의 얼굴";
const DECIDE_HEAD = "## 정할 것";
const f1 = (v: number): string => v.toFixed(1);

/** 측정값 칸만 형식별로 바꾼다. A 는 앱 프롬프트 그대로 */
export function prompt(m: FaceMeasure, lookId: string, variant: Variant, faceShape: FaceShape | null = null): string {
  const full = buildVlmPrompt(m, lookById(lookId), faceShape);
  if (variant === "A" || variant === "E") return full;
  if (variant === "F") return promptF(full);
  const i = full.indexOf(MEASURE_HEAD), j = full.indexOf(DECIDE_HEAD);
  if (i < 0 || j < 0) throw new Error("앱 프롬프트 모양이 바뀌었다 — entry.ts 의 제목 두 개를 맞춰 주세요");
  const shape = faceShape ? `${faceShape.label}` : null;
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2, lip = m.lip.upperLowerRatio;
  let section = "";
  if (variant === "B") {
    // 말만 (숫자 없음) — 작은 모델은 숫자보다 말을 잘 따른다는 가설 (조사 보고서)
    section = [
      `${MEASURE_HEAD} (얼굴 점 478개에서 계산)`,
      `- 눈꼬리: ${isDroopy(m) ? "처진 눈" : "처진 눈 아님"}`,
      `- 눈두덩: ${gap < PLAN_RULES.lidGapStd - PLAN_RULES.lidGapTol ? "좁은 편" : gap > PLAN_RULES.lidGapStd + PLAN_RULES.lidGapTol ? "넓은 편" : "보통"}`,
      `- 윗입술: ${lip == null ? "모름" : lip < PLAN_RULES.lipTarget ? "아랫입술보다 얇은 편" : "충분함"}`,
      `- 얼굴형 판정: ${shape ?? "없음 — 사진을 보고 골라 주세요"}`,
    ].join("\n");
  } else if (variant === "C") {
    // 숫자만 (해석 없음)
    section = [
      `${MEASURE_HEAD} (얼굴 점 478개에서 계산)`,
      `- 눈꼬리 기울기(°): 오른쪽 ${f1(m.eye.R.tiltDeg)}, 왼쪽 ${f1(m.eye.L.tiltDeg)}`,
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

// ---------- E·F ----------
// E 는 2026-10-01 부터 앱 프롬프트 그대로다 (vlm-prompt-v2 — 이 실험에서 확정해 앱으로 옮겼다). 그래서 A = E.
// 옛 A(예시 JSON 이 있던 앱 프롬프트)·소수 min/max 스키마로 잰 결과는 eval/results 의 2026-09-29~30 기록에만 있다.

function promptF(full: string): string {
  // 규칙이 정한 값만 뺀다 — 측정값·범주(처진 눈 여부)는 남긴다. 출발점이 앵커가 되는지 (Lou & Sun 2024 · Echterhoff 2024)
  const j = full.indexOf(DECIDE_HEAD);
  if (j < 0) throw new Error("앱 프롬프트 모양이 바뀌었다 — entry.ts 의 제목을 맞춰 주세요");
  const head = full
    .slice(0, j)
    .trimEnd()
    .replace(/ → 규칙 [^\n]*/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("- 규칙"))
    .join("\n");
  return `${head}\n\n${full.slice(j)}`;
}

/** 제약 디코딩용 JSON 스키마 — 앱(vlm-flow.vlmSchema)과 같다. 이 얼굴에서 관문이 받아 주는 값만 enum */
export function schema(_variant: Variant = "A", m?: FaceMeasure): object {
  if (!m) throw new Error("스키마는 얼굴 측정값이 있어야 만든다 (얼굴마다 선택지를 좁힌다)");
  return vlmSchema(m);
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

/** 렌더러에 넣을 계획 전체 — raw 가 없으면 규칙만, 있으면 관문을 거친 VLM 계획 (앱이 실제로 그리는 것) */
export function fullPlan(m: FaceMeasure, raw?: unknown): PersonalPlan {
  if (raw === undefined || raw === null) return resolvePlan(m, {});
  let proposal: unknown = raw;
  if (typeof raw === "string") {
    try {
      proposal = JSON.parse(raw);
    } catch {
      proposal = raw;
    }
  }
  return resolvePlan(m, {}, proposal);
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
  // 눈꼬리: 처진 눈 기준(DROOP_TILT_DEG, 눈꼬리 기울기)의 반대편으로 확실히 옮긴다 — 처진 눈 ↔ 아닌 눈.
  // 좌우 기울기 차이는 두고 평균만 옮긴다. α·β 는 판정에 안 쓰니 그대로
  const droop = clone(), t = tiltDeg(m), target = isDroopy(m) ? DROOP_TILT_DEG + 6 : DROOP_TILT_DEG - 4, shift = target - t;
  for (const s of ["R", "L"] as const) droop.eye[s].tiltDeg += shift;
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
