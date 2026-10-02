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
 *   - 관문이 거절할 값은 선택지에서 미리 뺀다 (allowedChoices)
 *
 * v7 (2026-10-01): 얼굴을 보게 함 — v6 은 얼굴과 상관없이 화장 종류마다 같은 값으로 몰렸다(진하기 · 라이너 스타일).
 *   측정값마다 보통 얼굴과 비교한 말(좁은 눈두덩 · 가늘고 긴 눈 …)을 붙이고, 관찰은 "보통과 다른 점",
 *   근거는 "이유가 된 얼굴 특징 먼저", 이유가 없으면 1(템플릿 그대로)로 두게 한다. 선택지 범위는 v6 그대로.
 * v6 (2026-10-01): VLM 에게 자유를 더 줌 — 사람 평가에서 VLM 계획이 규칙과 거의 같았다(0.9 로 몰림, 라이너 60/60 규칙과 같음).
 *   선택지를 넓히고(0.6~1.4 · 진하기 0.5~1.5 · 오버라인 ~0.5), 얼굴별로 좁히던 선택지를 풀고,
 *   "규칙 출발점 · 규칙이 고른 값" 줄을 뺐다 (VLM 이 규칙값 근처에 머무는 닻이 됐다). 측정값은 그대로 준다.
 *   - 근거 지시는 금지어를 나열하지 않고 긍정형으로 — 금지어를 적으면 오히려 그 말이 나온다
 */

import type { FaceMeasure } from "./face-measure";
import type { Look, LookPartId } from "./looks";
import { BLUSH_POSITIONS, DROOP_TILT_DEG, FACE_SHAPES, LINER_STYLES, PLAN_LIMITS, PLAN_RULES, isDroopy, tiltDeg, type LinerStyle } from "./personalize";
import type { FaceShape } from "./types";

const PART_NAME: Record<LookPartId, string> = { brow: "눈썹", liner: "아이라이너", shadow: "섀도", cheek: "블러셔", lip: "입술" };
const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const f1 = (v: number): string => v.toFixed(1);

/** 숫자 선택지 — 0.1 단위. 관문 범위(PLAN_LIMITS)와 같은 끝 */
export const CHOICE_STEPS = {
  scale: [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
  overline: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
  intensity: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5],
} as const;

/** 근거 문장을 쓰는 부위 — 눈썹은 표준 눈썹 그대로라 근거를 받지 않는다 */
export const RATIONALE_PARTS = ["liner", "shadow", "cheek", "lip"] as const;

export interface AllowedChoices {
  liner: LinerStyle[];
  shadow: number[];
  overline: number[];
  intensity: Record<LookPartId, number[]>;
}

/** 관문(resolvePlan)이 받아 주는 값 — v6 부터 얼굴과 상관없이 전부 (얼굴별로 좁히던 것을 풀었다) */
export function allowedChoices(_m: FaceMeasure): AllowedChoices {
  const parts: LookPartId[] = ["brow", "liner", "shadow", "cheek", "lip"];
  const intensity = Object.fromEntries(parts.map((p) => [p, [...CHOICE_STEPS.intensity]])) as Record<LookPartId, number[]>;
  return { liner: [...LINER_STYLES], shadow: [...CHOICE_STEPS.scale], overline: [...CHOICE_STEPS.overline], intensity };
}

const KO: Record<string, string> = {
  winged: "꼬리를 위로 올림", extend: "눈 축을 곧게 연장", drop: "윗눈꺼풀 선을 따라 내림",
  oval: "계란형", round: "둥근형", square: "각진형", oblong: "긴형", heart: "역삼각형",
  higher: "광대 기준 조금 위", standard: "광대 표준 자리", lower: "광대 기준 조금 아래",
};
const opts = (xs: readonly (string | number)[]): string => xs.map((x) => (typeof x === "string" && KO[x] ? `${x}(${KO[x]})` : String(x))).join(" / ");

/**
 * 보통 얼굴의 범위 — 이 사람이 보통과 어떻게 다른지를 말로 붙여 준다 (v7). 작은 모델은 숫자만 주면 비교하지 못했다.
 * 문헌 기준이 있는 것은 문헌(눈꼬리: Jung 2020 · 눈두덩: lidGapStd · 입술: lipTarget), 없는 것은
 * FFHQ-Makeup 동양인 240장(eval/samples)의 가운데 절반(25~75%, 2026-10-01 잼)
 */
export const FACE_NORMS = {
  faceAspect: [0.8, 0.87],     // 얼굴 가로 ÷ 세로
  eyeAspect: [2.6, 3.4],       // 눈 가로 ÷ 세로
  lidGap: [0.52, 0.64],        // 눈두덩 ÷ 눈 폭
  browCurve: [0.14, 0.18],     // 눈썹 굽은 정도
} as const;
const band = (v: number, [lo, hi]: readonly [number, number], low: string, mid: string, high: string): string => (v < lo ? low : v > hi ? high : mid);

export function buildVlmPrompt(m: FaceMeasure, look: Look, faceShape?: FaceShape | null): string {
  const tilt = tiltDeg(m);
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2;
  const eyeAsp = (m.eye.R.aspect + m.eye.L.aspect) / 2;
  const curve = (m.brow.R.curvature + m.brow.L.curvature) / 2;
  const lr = m.lip.upperLowerRatio;
  const N = FACE_NORMS;
  const parts = (Object.entries(look.parts) as [LookPartId, NonNullable<Look["parts"][LookPartId]>][])
    .map(([id, p]) => `- ${PART_NAME[id]}(${id}): 색 ${p.color ? hex(p.color) : "없음"}, 진하기 ${p.alpha ?? p.alphaR ?? "-"}${p.thick ? `, 두께 눈 폭의 ${p.thick}` : ""}`)
    .join("\n");
  const a = allowedChoices(m);
  const inten = (Object.entries(a.intensity) as [LookPartId, number[]][]).map(([p, xs]) => `${p} ${xs[0]}~${xs[xs.length - 1]}`).join(", ");

  return `당신은 메이크업 아티스트입니다. 아래 화장 템플릿을, 첨부한 맨얼굴 사진 속 이 사람의 얼굴에 맞게 조정해 주세요.
조정은 이 사람의 얼굴이 보통 얼굴과 어떻게 다른지(얼굴형 · 눈 · 눈두덩 · 입술 · 눈썹)에서 나와야 합니다.
템플릿의 색과 전체 느낌은 그대로 둡니다. 얼굴에서 이유를 찾은 부위만 바꾸고, 이유가 없는 값은 1(템플릿 그대로)로 둡니다.

## 템플릿: ${look.name}
${parts}

## 이 사람의 얼굴 — 보통 얼굴과 비교 (얼굴 점 478개에서 잼)
${faceShape ? `- 얼굴형: ${faceShape.label} (판정 확신도 ${faceShape.confidence.toFixed(2)})` : "- 얼굴형: 판정 없음 — 사진을 보고 고릅니다"} · 얼굴 가로 ÷ 세로 ${m.faceAspect.toFixed(2)} (보통 ${N.faceAspect.join("~")}) → ${band(m.faceAspect, N.faceAspect, "보통보다 긴 얼굴", "보통", "보통보다 넓은 얼굴")}
- 눈꼬리 기울기: 오른쪽 ${f1(m.eye.R.tiltDeg)}°, 왼쪽 ${f1(m.eye.L.tiltDeg)}° (한국 20대 여성 평균 약 8.4~8.8°) → ${isDroopy(m) ? `처진 눈 (평균 ${f1(tilt)}°, ${DROOP_TILT_DEG}° 보다 작음)` : tilt > 10 ? "올라간 눈" : "보통"}
- 눈 가로 ÷ 세로: ${eyeAsp.toFixed(2)} (보통 ${N.eyeAspect.join("~")}) → ${band(eyeAsp, N.eyeAspect, "둥글고 큰 눈", "보통", "가늘고 긴 눈")}
- 눈두덩(눈꺼풀 → 눈썹 아랫선 ÷ 눈 폭): ${gap.toFixed(2)} (보통 ${N.lidGap.join("~")}) → ${band(gap, N.lidGap, "좁은 눈두덩", "보통", "넓은 눈두덩")}
- 윗입술 ÷ 아랫입술: ${lr == null ? "모름" : `${lr.toFixed(2)} (${PLAN_RULES.lipTarget} 보다 작으면 윗입술이 얇음) → ${lr < PLAN_RULES.lipTarget ? "윗입술이 얇음" : "보통"}`}
- 눈썹 굽은 정도: ${curve.toFixed(3)} (보통 ${N.browCurve.join("~")}, 0 = 일자) → ${band(curve, N.browCurve, "일자에 가까운 눈썹", "보통", "많이 굽은 눈썹")}

## 정할 것
순서대로 씁니다 — 먼저 이 사람 얼굴의 특징, 그 특징에서 나온 부위별 근거, 마지막으로 값.
- observation: 사진과 위 비교에서 이 사람 얼굴이 보통과 다른 점 두세 가지를 한국어로
- rationale: ${RATIONALE_PARTS.join(" · ")} 각각 한 문장(${PLAN_LIMITS.rationaleMax}자 이내). 사용자 화면에 그대로 보이는 일상어로, 그 부위를 정한 이유가 된 이 사람의 얼굴 특징을 먼저 쓰고 그래서 바꾼 모양을 "~해서 ~했어요" 로 씁니다. 바꾸지 않았으면 이 얼굴에 이미 어울리는 이유를 씁니다
- liner.style: ${opts(a.liner)} — 처진 눈이면 extend(보정) 또는 drop(살림), 아니면 winged
- linerThick.scale: ${opts(CHOICE_STEPS.scale)} — 라이너 두께 배율. 1 이 템플릿. 둥글고 큰 눈은 작게, 가늘고 긴 눈은 크게
- faceShape.label: ${opts(FACE_SHAPES)} — 쉐딩·하이라이트 자리만 바뀝니다
- shadow.range: ${opts(a.shadow)} — 섀도 높이 배율. 좁은 눈두덩은 작게, 넓은 눈두덩은 크게
- lip.overline: ${opts(a.overline)} — 윗입술 가운데를 윗입술 두께의 몇 배 올릴지. 윗입술이 얇을수록 크게, 보통이면 0
- blush.position: ${opts(BLUSH_POSITIONS)} — 긴 얼굴은 낮게, 넓은 얼굴은 높게. blush.size: ${opts(CHOICE_STEPS.scale)} — 얼굴 폭에 맞게
- highlight.tZone: true(이마~콧대 하이라이트) / false(피부가 번들거릴 때)
- intensity: 얼굴에서 이유가 있는 부위만 — ${inten} (0.1 단위, 1 이 템플릿). 타고난 눈썹·입술 색이 진하면 낮추고 옅으면 올립니다

## 답
위 순서대로 JSON 하나만 답합니다. 코드 블록 없이.`;
}
