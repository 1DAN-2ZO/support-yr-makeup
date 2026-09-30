/**
 * VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글 (개인화 설계: VLM(얼굴 + 템플릿 + 측정값) → 구조화된 개인화 값 → 관문).
 *
 * 측정값과 규칙의 판단을 글로 넘긴다. VLM 이 사진만 보고 눈꼬리 각도를 추측하면 측정과 어긋나고, 관문에서 거절된다.
 * 허용 값은 관문(personalize.ts)과 같은 상수에서 뽑는다 — 둘이 어긋나면 VLM 제안이 늘 거절당한다.
 * 어느 VLM 을 쓰든(외부 API · 서버 공개 모델) 이 글은 같다.
 */

import type { FaceMeasure } from "./face-measure";
import type { Look, LookPartId } from "./looks";
import { BLUSH_POSITIONS, DROOP_MARGIN_DEG, FACE_SHAPES, LINER_STYLES, PLAN_LIMITS, PLAN_RULES, droopDeg, planLiner, resolvePlan } from "./personalize";
import type { FaceShape } from "./types";

const PART_NAME: Record<LookPartId, string> = { brow: "눈썹", liner: "아이라이너", shadow: "섀도", cheek: "블러셔", lip: "입술" };
const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const f1 = (v: number): string => v.toFixed(1);
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
  const range = ([lo, hi]: readonly [number, number]): string => `<${lo}~${hi}>`;
  const oneOf = (xs: readonly string[]): string => `"<${xs.join("|")}>"`;

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

## 정할 것 (고를 수 있는 값만)
값마다 이 얼굴(사진과 위 내용)을 보고 따로 정하세요. 바꿀 이유가 있는 값은 바꾸고, 없는 값만 그대로 둡니다.
- liner.style: ${LINER_STYLES.join(" | ")}
  winged = 꼬리를 눈 축에서 위로 올림 / extend = 눈 축을 곧게 연장 / drop = 윗눈꺼풀 선을 따라 내림(처진 눈에만 — 눈꼬리 처짐 ${DROOP_MARGIN_DEG}° 초과. 아니면 거절된다)
- faceShape.label: ${FACE_SHAPES.join(" | ")}
  고르면 쉐딩·하이라이트 자리만 바뀝니다. 눈썹은 표준 눈썹 그대로입니다(얼굴형으로 옮기지 않음)
- shadow.range: ${s0}~${s1} (섀도 높이 배율, 1 = 템플릿 그대로. 눈두덩이 좁으면 작게)
- intensity: 부위별 ${i0}~${i1} (진하기 배율, 1 = 템플릿 그대로). 바꿀 부위만. 상한: ${caps} — 넘으면 거절된다. 평균도 ${PLAN_RULES.intensityMeanCap} 이하로
- lip.overline: ${PLAN_LIMITS.lipOverline[0]}~${PLAN_LIMITS.lipOverline[1]} (윗입술 가운데를 윗입술 두께의 몇 배만큼 올릴지. 윗입술이 이미 목표 이상이면 0)
- blush.position: ${BLUSH_POSITIONS.join(" | ")} (광대 기준 조금 위·표준·조금 아래), blush.size: ${PLAN_LIMITS.blushSize[0]}~${PLAN_LIMITS.blushSize[1]}
- highlight.tZone: true | false (이마 가운데~콧대 하이라이트. 피부가 번들거리면 false)
- linerThick.scale: ${PLAN_LIMITS.linerThick[0]}~${PLAN_LIMITS.linerThick[1]} (라이너 두께 배율. 눈이 크면 얇게, 작으면 조금 두껍게)
- rationale: 정한 부위(liner · shadow · cheek · lip)마다 한 줄 근거, 한국어 ${PLAN_LIMITS.rationaleMax}자 이내, "~해서 ~했어요" 말투. 실제로 바뀌는 내용과 맞게 쓰세요
  사용자가 읽는 말입니다 — 숫자와 값 이름(${LINER_STYLES.join(", ")}, overline, range 등)은 쓰지 않습니다. 숫자가 있으면 거절된다
  나쁜 예: "입술 비율에 맞춰 overline 0으로 했어요" / 좋은 예: "윗입술이 충분히 도톰해서 입술선은 그대로 뒀어요" (예를 그대로 베끼지 마세요)

## 답
JSON 하나만 답하세요. 설명이나 코드 블록 없이. <> 는 고를 자리입니다 — 그 자리에 이 얼굴에 맞는 값 하나를 넣으세요:
{"liner":{"style":${oneOf(LINER_STYLES)}},"linerThick":{"scale":${range(PLAN_LIMITS.linerThick)}},"faceShape":{"label":${oneOf(FACE_SHAPES)}},"shadow":{"range":${range(PLAN_LIMITS.shadowRange)}},"lip":{"overline":${range(PLAN_LIMITS.lipOverline)}},"blush":{"position":${oneOf(BLUSH_POSITIONS)},"size":${range(PLAN_LIMITS.blushSize)}},"highlight":{"tZone":<true|false>},"intensity":{"<바꿀 부위>":${range(PLAN_LIMITS.intensity)}},"rationale":{"<정한 부위>":"<근거 한 줄>"}}`;
}
