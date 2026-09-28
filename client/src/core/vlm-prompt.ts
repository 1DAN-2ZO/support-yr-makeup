/**
 * VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글 (개인화 설계: VLM(얼굴 + 템플릿 + 측정값) → 구조화된 개인화 값 → 관문).
 *
 * 측정값과 규칙의 판단을 글로 넘긴다. VLM 이 사진만 보고 눈꼬리 각도를 추측하면 측정과 어긋나고, 관문에서 거절된다.
 * 허용 값은 관문(personalize.ts)과 같은 상수에서 뽑는다 — 둘이 어긋나면 VLM 제안이 늘 거절당한다.
 * 어느 VLM 을 쓰든(외부 API · 서버 공개 모델) 이 글은 같다.
 */

import type { FaceMeasure } from "./face-measure";
import type { Look, LookPartId } from "./looks";
import { BLUSH_POSITIONS, BROW_ARCHES, FACE_SHAPES, JKSC_BROW_ADJUST_MM, LINER_STYLES, PLAN_LIMITS, PLAN_RULES, droopDeg, planLiner, resolvePlan } from "./personalize";
import type { FaceShape } from "./types";

const PART_NAME: Record<LookPartId, string> = { brow: "눈썹", liner: "아이라이너", shadow: "섀도", cheek: "블러셔", lip: "입술" };
const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const f1 = (v: number): string => v.toFixed(1);
const dir = (v: number, up: string, down: string): string => (v > 0 ? up : v < 0 ? down : "그대로");
/** 얼굴형을 고르면 눈썹이 어떻게 바뀌는지 — VLM 이 모르고 "그대로 뒀어요" 라고 쓰지 않게 (JKSC 표에서) */
const shapeEffects = (): string =>
  FACE_SHAPES.map((s) => { const a = JKSC_BROW_ADJUST_MM[s]; return `${s} → 눈썹 ${dir(a.height, "높게", "낮게")}, 미간 ${dir(a.glabella, "넓게", "좁게")}`; }).join(" / ");

export function buildVlmPrompt(m: FaceMeasure, look: Look, faceShape?: FaceShape | null): string {
  const droop = droopDeg(m);
  const rule = planLiner(m);
  const base = resolvePlan(m, { faceShape: faceShape ?? null });   // 규칙만으로 정한 값 — VLM 이 바꿀지 판단하는 출발점
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2;
  const caps = Object.entries(PLAN_RULES.intensityCap).map(([k, v]) => `${k} ${v}`).join(", ");
  const parts = (Object.entries(look.parts) as [LookPartId, NonNullable<Look["parts"][LookPartId]>][])
    .map(([id, p]) => `- ${PART_NAME[id]}(${id}): 색 ${p.color ? hex(p.color) : "없음"}, 진하기 ${p.alpha ?? p.alphaR ?? "-"}${p.thick ? `, 두께 눈 폭의 ${p.thick}` : ""}`)
    .join("\n");
  const [s0, s1] = PLAN_LIMITS.shadowRange, [i0, i1] = PLAN_LIMITS.intensity;

  return `당신은 메이크업 아티스트입니다. 첨부한 맨얼굴 사진의 사람에게 아래 메이크업 템플릿을 맞춰 주세요.
템플릿의 색은 바꾸지 않습니다. 이 얼굴에 맞게 모양·범위·진하기만 조정합니다.

## 템플릿: ${look.name}
${parts}

## 이 얼굴을 잰 값 (얼굴 점 478개에서 계산)
- 눈꼬리 기울기: 오른쪽 ${f1(m.eye.R.tiltDeg)}°, 왼쪽 ${f1(m.eye.L.tiltDeg)}° (한국 20대 여성 평균 약 8.4~8.8°)
- 눈꼬리 처짐 α − β 평균: ${f1(droop)}° → ${droop > 2 ? "처진 눈" : "처진 눈 아님"} (0 보다 크면 처진 눈, ILoveEye 2022)
- 눈 가로세로 비: 오른쪽 ${m.eye.R.aspect.toFixed(2)}, 왼쪽 ${m.eye.L.aspect.toFixed(2)}
- 눈썹 굽은 정도: 오른쪽 ${m.brow.R.curvature.toFixed(3)}, 왼쪽 ${m.brow.L.curvature.toFixed(3)} (0 = 일자)
- 눈두덩(눈꺼풀→눈썹 아랫선 ÷ 눈 폭): ${gap.toFixed(2)} (표준 ${PLAN_RULES.lidGapStd}) → 규칙 섀도 범위 ${base.shadow.range.toFixed(2)}
- 윗입술 ÷ 아랫입술: ${m.lip.upperLowerRatio == null ? "모름" : m.lip.upperLowerRatio.toFixed(2)} (목표 ${PLAN_RULES.lipTarget}) → 규칙 오버라인 ${base.lip.overline.toFixed(2)}
- 규칙이 고른 라이너 스타일: ${rule.style}
${faceShape ? `- 얼굴형 판정: ${faceShape.label} (확신도 ${faceShape.confidence.toFixed(2)})` : "- 얼굴형 판정: 없음 — 사진을 보고 골라 주세요"}

## 정할 것 (고를 수 있는 값만)
- liner.style: ${LINER_STYLES.join(" | ")}
  winged = 꼬리를 눈 축에서 위로 올림 / extend = 눈 축을 곧게 연장 / drop = 윗눈꺼풀 선을 따라 내림(처진 눈에만)
- faceShape.label: ${FACE_SHAPES.join(" | ")}
  고르면 표준 눈썹이 이렇게 바뀝니다: ${shapeEffects()}
- brow.arch: ${BROW_ARCHES.join(" | ")} (긴 얼굴은 평평하게, 둥근 얼굴은 굽게가 기본)
- shadow.range: ${s0}~${s1} (섀도 높이 배율, 1 = 템플릿 그대로. 눈두덩이 좁으면 작게)
- intensity: 부위별 ${i0}~${i1} (진하기 배율, 1 = 템플릿 그대로). 바꿀 부위만. 상한: ${caps} — 넘으면 거절된다. 평균도 ${PLAN_RULES.intensityMeanCap} 이하로
- lip.overline: ${PLAN_LIMITS.lipOverline[0]}~${PLAN_LIMITS.lipOverline[1]} (윗입술 가운데를 윗입술 두께의 몇 배만큼 올릴지. 윗입술이 이미 목표 이상이면 0)
- blush.position: ${BLUSH_POSITIONS.join(" | ")} (광대 기준 조금 위·표준·조금 아래), blush.size: ${PLAN_LIMITS.blushSize[0]}~${PLAN_LIMITS.blushSize[1]}
- highlight.tZone: true | false (이마 가운데~콧대 하이라이트. 피부가 번들거리면 false)
- linerThick.scale: ${PLAN_LIMITS.linerThick[0]}~${PLAN_LIMITS.linerThick[1]} (라이너 두께 배율. 눈이 크면 얇게, 작으면 조금 두껍게)
- rationale: 부위별 한 줄 근거, 한국어 ${PLAN_LIMITS.rationaleMax}자 이내, 숫자 없이. "~해서 ~했어요" 말투. 실제로 바뀌는 내용과 맞게 쓰세요

## 답
JSON 하나만 답하세요. 설명이나 코드 블록 없이:
{"liner":{"style":"..."},"linerThick":{"scale":1},"faceShape":{"label":"..."},"brow":{"arch":"..."},"shadow":{"range":1},"lip":{"overline":0},"blush":{"position":"standard","size":1},"highlight":{"tZone":true},"intensity":{"lip":1},"rationale":{"liner":"...","brow":"..."}}`;
}
