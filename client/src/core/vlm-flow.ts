/**
 * 개인화 흐름 — VLM 이 정하고 규칙 관문(personalize.resolvePlan)이 거른다 (2026-09-29 결정). 모듈 ⑥.
 *
 *  1. 앱 프롬프트(vlm-prompt.ts: 측정값 + 템플릿 + 고를 수 있는 값)와 스키마로 VLM 에 묻는다
 *  2. 관문이 측정값과 모순되거나 범위 밖인 항목을 거절한다
 *  3. 거절이 있으면 **이유를 붙여 한 번만** 다시 묻는다 (재질문 한 번 = 추론 한 번 — 시간 예산, 조사 보고서)
 *  4. 그래도 거절된 항목만 규칙값 (resolvePlan 이 항목별로 한다)
 * VLM 이 실패하면(서버 없음·시간 초과) 규칙으로 대신하지 않고 던진다 — VLM 없으면 이용 불가.
 */

import type { FaceMeasure } from "./face-measure";
import type { Look, LookPartId } from "./looks";
import { BLUSH_POSITIONS, FACE_SHAPES, LINER_STYLES, PLAN_LIMITS, resolvePlan, type PersonalPlan } from "./personalize";
import type { FaceShape } from "./types";
import { buildVlmPrompt } from "./vlm-prompt";

/** 프롬프트·스키마 버전 — 결과 로그와 계획 저장 키에 붙인다. 프롬프트나 스키마를 바꾸면 올린다 */
export const PROMPT_VER = "vlm-prompt-v1";

/** 제약 디코딩용 JSON 스키마 — 관문이 받는 모양·허용값과 같다. 결정 필드를 근거 문장보다 앞에 (설명하다 결정이 흔들리지 않게) */
export function vlmSchema(): object {
  const num = ([lo, hi]: readonly [number, number]) => ({ type: "number", minimum: lo, maximum: hi });
  const parts: LookPartId[] = ["brow", "liner", "shadow", "lip", "cheek"];
  const obj = (properties: object, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });
  return {
    type: "object",
    properties: {
      liner: obj({ style: { enum: [...LINER_STYLES] } }, ["style"]),
      linerThick: obj({ scale: num(PLAN_LIMITS.linerThick) }, ["scale"]),
      faceShape: obj({ label: { enum: [...FACE_SHAPES] } }, ["label"]),
      shadow: obj({ range: num(PLAN_LIMITS.shadowRange) }, ["range"]),
      lip: obj({ overline: num(PLAN_LIMITS.lipOverline) }, ["overline"]),
      blush: obj({ position: { enum: [...BLUSH_POSITIONS] }, size: num(PLAN_LIMITS.blushSize) }, ["position", "size"]),
      highlight: obj({ tZone: { type: "boolean" } }, ["tZone"]),
      intensity: { type: "object", properties: Object.fromEntries(parts.map((p) => [p, num(PLAN_LIMITS.intensity)])), additionalProperties: false },
      rationale: { type: "object", properties: Object.fromEntries(parts.map((p) => [p, { type: "string", maxLength: PLAN_LIMITS.rationaleMax }])), additionalProperties: false },
    },
    required: ["liner", "linerThick", "faceShape", "shadow", "lip", "blush", "highlight", "intensity", "rationale"],
    additionalProperties: false,
  };
}

/** 다시 물을 때 붙이는 글 — 관문의 거절 이유는 이미 읽을 수 있는 문장이다 */
export function retryPrompt(first: string, rejected: readonly string[]): string {
  // 거절 이유에 섞인 내부 표기(모듈 번호 ①~⑥)는 뺀다 — 모델에겐 뜻이 없다
  const clean = (r: string): string => r.replace(/[①-⑥]\s*/g, "");
  return `${first}

## 앞 답에서 받아들일 수 없던 것
${rejected.map((r) => `- ${clean(r)}`).join("\n")}
위 항목을 측정값과 허용 범위에 맞게 고쳐서, 전체를 다시 JSON 하나로 답하세요.`;
}

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;   // resolvePlan 이 "JSON 객체가 아님" 으로 거절한다
  }
};

export interface VlmPlanResult {
  plan: PersonalPlan;
  /** 물은 횟수 (1 또는 2) */
  tries: number;
  /** 첫 답에서 거절된 것 — 로그용 */
  firstRejected: string[];
  /** 다시 묻다가 실패해서(시간 초과·붐빔) 첫 답을 썼나 */
  retryFailed: boolean;
}

export async function planWithVlm(m: FaceMeasure, look: Look, faceShape: FaceShape | null, ask: (prompt: string) => Promise<string>): Promise<VlmPlanResult> {
  const prompt = buildVlmPrompt(m, look, faceShape);
  const first = resolvePlan(m, { faceShape }, parse(await ask(prompt)));
  if (first.rejected.length === 0) return { plan: first, tries: 1, firstRejected: [], retryFailed: false };
  // 다시 묻다가 실패해도 첫 답은 관문을 거친 쓸 수 있는 계획이다 — 버리지 않는다 (#179 리뷰: 50초 기다린 뒤 실패 안내였다)
  let raw: string;
  try {
    raw = await ask(retryPrompt(prompt, first.rejected));
  } catch {
    return { plan: first, tries: 2, firstRejected: first.rejected, retryFailed: true };
  }
  const second = resolvePlan(m, { faceShape }, parse(raw));
  return { plan: second, tries: 2, firstRejected: first.rejected, retryFailed: false };
}
