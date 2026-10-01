/**
 * VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글 (개인화 설계: VLM(얼굴 + 템플릿 + 측정값) → 구조화된 개인화 값 → 관문).
 *
 * 측정값과 규칙의 판단을 글로 넘긴다. VLM 이 사진만 보고 눈꼬리 각도를 추측하면 측정과 어긋나고, 관문에서 거절된다.
 * 허용 값은 관문(personalize.ts)과 같은 상수에서 뽑는다 — 둘이 어긋나면 VLM 제안이 늘 거절당한다.
 * 어느 VLM 을 쓰든(외부 API · 서버 공개 모델) 이 글은 같다.
 *
 * 형식 E (VLM 선정 실험 eval/vlm, 2026-09-30 확정 — 선정 모델 Gemma 4 E4B):
 *   - 답 모양 예시를 주지 않는다. 작은 모델은 예시 값·예시 문장(나쁜 예까지)을 얼굴과 상관없이 그대로 베꼈다
 *   - 관찰 → 근거 → 결정 순서로 쓰게 한다 (스키마 순서도 같게 — vlm-flow.vlmSchema)
 *   - 숫자는 0.1 단위 선택지로 준다 — llama.cpp 는 JSON 스키마의 소수 min/max 를 강제하지 않는다
 *   - 관문이 거절할 값은 이 얼굴의 선택지에서 미리 뺀다 (allowedChoices)
 *   - 근거 지시는 금지어를 나열하지 않고 긍정형으로 — 금지어를 적으면 오히려 그 말이 나온다
 */

import type { FaceMeasure } from "./face-measure";
import type { Look, LookPartId } from "./looks";
import { BLUSH_POSITIONS, DROOP_MARGIN_DEG, FACE_SHAPES, LINER_STYLES, PLAN_LIMITS, PLAN_RULES, droopDeg, planLiner, resolvePlan, type LinerStyle } from "./personalize";
import type { FaceShape } from "./types";

const PART_NAME: Record<LookPartId, string> = { brow: "눈썹", liner: "아이라이너", shadow: "섀도", cheek: "블러셔", lip: "입술" };
const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const f1 = (v: number): string => v.toFixed(1);

/** 숫자 선택지 — 0.1 단위. 관문 범위(PLAN_LIMITS)와 같은 끝 */
export const CHOICE_STEPS = {
  scale: [0.8, 0.9, 1, 1.1, 1.2],
  overline: [0, 0.1, 0.2, 0.3],
  intensity: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3],
} as const;

/** 근거 문장을 쓰는 부위 — 눈썹은 표준 눈썹 그대로라 근거를 받지 않는다 */
export const RATIONALE_PARTS = ["liner", "shadow", "cheek", "lip"] as const;

export interface AllowedChoices {
  liner: LinerStyle[];
  shadow: number[];
  overline: number[];
  intensity: Record<LookPartId, number[]>;
}

/** 이 얼굴에서 관문(resolvePlan)이 받아 주는 값만 — 거절될 선택지는 처음부터 주지 않는다 */
export function allowedChoices(m: FaceMeasure): AllowedChoices {
  const R = PLAN_RULES, gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2, lr = m.lip.upperLowerRatio;
  const shadow = CHOICE_STEPS.scale.filter((v) => !(v < 1 && gap > R.lidGapStd * (1 + R.lidGapTol)) && !(v > 1 && gap < R.lidGapStd * (1 - R.lidGapTol)));
  const overline = lr != null && lr >= R.lipTarget ? [0] : [...CHOICE_STEPS.overline];
  const parts: LookPartId[] = ["brow", "liner", "shadow", "cheek", "lip"];
  const intensity = Object.fromEntries(parts.map((p) => [p, CHOICE_STEPS.intensity.filter((v) => v <= (R.intensityCap[p] ?? Infinity))])) as Record<LookPartId, number[]>;
  return { liner: LINER_STYLES.filter((s) => s !== "drop" || droopDeg(m) > DROOP_MARGIN_DEG), shadow, overline, intensity };
}

const KO: Record<string, string> = {
  winged: "꼬리를 위로 올림", extend: "눈 축을 곧게 연장", drop: "윗눈꺼풀 선을 따라 내림",
  oval: "계란형", round: "둥근형", square: "각진형", oblong: "긴형", heart: "하트형",
  higher: "광대 기준 조금 위", standard: "광대 표준 자리", lower: "광대 기준 조금 아래",
};
const opts = (xs: readonly (string | number)[]): string => xs.map((x) => (typeof x === "string" && KO[x] ? `${x}(${KO[x]})` : String(x))).join(" / ");

export function buildVlmPrompt(m: FaceMeasure, look: Look, faceShape?: FaceShape | null): string {
  const droop = droopDeg(m);
  const rule = planLiner(m);
  const base = resolvePlan(m, { faceShape: faceShape ?? null });   // 규칙만으로 정한 값 — VLM 이 바꿀지 판단하는 출발점
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2;
  const parts = (Object.entries(look.parts) as [LookPartId, NonNullable<Look["parts"][LookPartId]>][])
    .map(([id, p]) => `- ${PART_NAME[id]}(${id}): 색 ${p.color ? hex(p.color) : "없음"}, 진하기 ${p.alpha ?? p.alphaR ?? "-"}${p.thick ? `, 두께 눈 폭의 ${p.thick}` : ""}`)
    .join("\n");
  const a = allowedChoices(m);
  const inten = (Object.entries(a.intensity) as [LookPartId, number[]][]).map(([p, xs]) => `${p} ${xs[0]}~${xs[xs.length - 1]}`).join(", ");

  return `당신은 메이크업 아티스트입니다. 첨부한 맨얼굴 사진의 사람에게 아래 메이크업 템플릿을 맞춰 주세요.
템플릿의 색은 바꾸지 않습니다. 이 얼굴에 맞게 모양·범위·진하기만 조정합니다.

## 템플릿: ${look.name}
${parts}

## 이 얼굴을 잰 값 (얼굴 점 478개에서 계산)
- 눈꼬리 기울기: 오른쪽 ${f1(m.eye.R.tiltDeg)}°, 왼쪽 ${f1(m.eye.L.tiltDeg)}° (한국 20대 여성 평균 약 8.4~8.8°)
- 눈꼬리 처짐 α − β 평균: ${f1(droop)}° → ${droop > DROOP_MARGIN_DEG ? "처진 눈" : "처진 눈 아님"} (${DROOP_MARGIN_DEG}° 를 넘으면 처진 눈. ILoveEye 2022 는 0 기준, 측정 흔들림만큼 여유를 둠)
- 눈 가로세로 비: 오른쪽 ${m.eye.R.aspect.toFixed(2)}, 왼쪽 ${m.eye.L.aspect.toFixed(2)}
- 눈썹 굽은 정도: 오른쪽 ${m.brow.R.curvature.toFixed(3)}, 왼쪽 ${m.brow.L.curvature.toFixed(3)} (0 = 일자)
- 눈두덩(눈꺼풀→눈썹 아랫선 ÷ 눈 폭): ${gap.toFixed(2)} (표준 ${PLAN_RULES.lidGapStd}) → 규칙 섀도 범위 ${base.shadow.range.toFixed(2)}
- 윗입술 ÷ 아랫입술: ${m.lip.upperLowerRatio == null ? "모름" : m.lip.upperLowerRatio.toFixed(2)} (목표 ${PLAN_RULES.lipTarget}) → 규칙 오버라인 ${base.lip.overline.toFixed(2)}
- 규칙이 고른 라이너 스타일: ${rule.style}
${faceShape ? `- 얼굴형 판정: ${faceShape.label} (확신도 ${faceShape.confidence.toFixed(2)})` : "- 얼굴형 판정: 없음 — 사진을 보고 골라 주세요"}
- 규칙 출발점: 라이너 ${rule.style} · 섀도 범위 ${base.shadow.range.toFixed(2)} · 오버라인 ${base.lip.overline.toFixed(2)}. 사진에서 달리 할 이유가 보이지 않으면 이 값을 그대로 쓰세요

## 정할 것
사진과 위 측정을 함께 보고 정합니다. 순서대로 씁니다 — 먼저 사진에서 본 것, 그 관찰에서 나온 부위별 근거, 마지막으로 값.
- observation: 사진에서 본 눈꼬리 · 눈두덩 · 입술 · 광대의 모습을 한국어 한두 문장으로
- rationale: ${RATIONALE_PARTS.join(" · ")} 각각 한 문장(${PLAN_LIMITS.rationaleMax}자 이내). 사용자 화면에 그대로 보이는 일상어로, 얼굴에서 본 점과 그래서 바꾼 모양을 "~해서 ~했어요" 로 씁니다
- liner.style: ${opts(a.liner)}
- linerThick.scale: ${opts(CHOICE_STEPS.scale)} — 라이너 두께 배율. 1 이 템플릿. 눈이 크면 작게, 작으면 크게
- faceShape.label: ${opts(FACE_SHAPES)} — 쉐딩·하이라이트 자리만 바뀝니다
- shadow.range: ${opts(a.shadow)} — 섀도 높이 배율. 눈두덩이 좁으면 작게, 넓으면 크게
- lip.overline: ${opts(a.overline)} — 윗입술 가운데를 윗입술 두께의 몇 배 올릴지. 윗입술이 얇을수록 크게
- blush.position: ${opts(BLUSH_POSITIONS)}, blush.size: ${opts(CHOICE_STEPS.scale)}
- highlight.tZone: true(이마~콧대 하이라이트) / false(피부가 번들거릴 때)
- intensity: 바꿀 부위만 — ${inten} (0.1 단위, 1 이 템플릿)

## 답
위 순서대로 JSON 하나만 답합니다. 코드 블록 없이.`;
}
