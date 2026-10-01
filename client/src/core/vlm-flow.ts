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
import type { Look } from "./looks";
import { BLUSH_POSITIONS, FACE_SHAPES, PLAN_LIMITS, resolvePlan, type PersonalPlan } from "./personalize";
import type { FaceShape } from "./types";
import { CHOICE_STEPS, RATIONALE_PARTS, allowedChoices, buildVlmPrompt } from "./vlm-prompt";

/** 프롬프트·스키마 버전 — 결과 로그와 계획 저장 키에 붙인다. 프롬프트나 스키마를 바꾸면 올린다
 *  v2 (2026-10-01) = 형식 E — VLM 선정 실험(eval/vlm)에서 확정. 예시 없음 · 관찰→근거→결정 · 숫자는 선택지 */
export const PROMPT_VER = "vlm-prompt-v2";

/**
 * 제약 디코딩용 JSON 스키마 — 이 얼굴에서 관문이 받아 주는 값만 enum 으로 (vlm-prompt.allowedChoices).
 *  - 숫자도 enum: llama.cpp 의 스키마→문법 변환은 소수 minimum/maximum 을 강제하지 않는다 (0.45 가 나왔다)
 *  - 순서 관찰 → 근거 → 결정: llama.cpp 는 required 키를 properties 순서대로 고정한다. 모두 required 로 둔다
 *  - 실험에서 검증한 그대로 (eval/vlm/entry.ts 의 E 와 같다). 근거 문장 길이 상한은 관문과 같은 40자 —
 *    가끔 문장 가운데서 잘리지만, 빼면 넘친 문장이 관문에서 거절돼 재질문이 늘 수 있다 (검증 안 함)
 */
export function vlmSchema(m: FaceMeasure): object {
  const a = allowedChoices(m);
  const obj = (props: Record<string, object>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
  const text = (n: number) => ({ type: "string", minLength: 4, maxLength: n });
  return obj({
    observation: text(80),
    rationale: obj(Object.fromEntries(RATIONALE_PARTS.map((p) => [p, text(PLAN_LIMITS.rationaleMax)]))),
    liner: obj({ style: { enum: a.liner } }),
    linerThick: obj({ scale: { enum: [...CHOICE_STEPS.scale] } }),
    faceShape: obj({ label: { enum: [...FACE_SHAPES] } }),
    shadow: obj({ range: { enum: a.shadow } }),
    lip: obj({ overline: { enum: a.overline } }),
    blush: obj({ position: { enum: [...BLUSH_POSITIONS] }, size: { enum: [...CHOICE_STEPS.scale] } }),
    highlight: obj({ tZone: { type: "boolean" } }),
    // 진하기 칸은 있어야 하고(required), 안의 부위는 바꿀 것만 (부위는 required 아님)
    intensity: { type: "object", properties: Object.fromEntries(Object.entries(a.intensity).map(([p, xs]) => [p, { enum: xs }])), additionalProperties: false },
  });
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
