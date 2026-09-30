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

const MEASURE_HEAD = "## 이 얼굴을 잰 값";
const DECIDE_HEAD = "## 정할 것";
const f1 = (v: number): string => v.toFixed(1);

/** 측정값 칸만 형식별로 바꾼다. A 는 앱 프롬프트 그대로 */
export function prompt(m: FaceMeasure, lookId: string, variant: Variant, faceShape: FaceShape | null = null): string {
  const full = buildVlmPrompt(m, lookById(lookId), faceShape);
  if (variant === "A") return full;
  if (variant === "E" || variant === "F") return promptEF(full, m, variant);
  const i = full.indexOf(MEASURE_HEAD), j = full.indexOf(DECIDE_HEAD);
  if (i < 0 || j < 0) throw new Error("앱 프롬프트 모양이 바뀌었다 — entry.ts 의 제목 두 개를 맞춰 주세요");
  const shape = faceShape ? `${faceShape.label}` : null;
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2, droop = droopDeg(m), lip = m.lip.upperLowerRatio;
  let section = "";
  if (variant === "B") {
    // 말만 (숫자 없음) — 작은 모델은 숫자보다 말을 잘 따른다는 가설 (조사 보고서)
    section = [
      `${MEASURE_HEAD} (얼굴 점 478개에서 계산)`,
      `- 눈꼬리: ${droop > DROOP_MARGIN_DEG ? "처진 눈" : "처진 눈 아님"}`,
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

// ---------- E·F ----------

const STEP = { scale: [0.8, 0.9, 1, 1.1, 1.2], overline: [0, 0.1, 0.2, 0.3], intensity: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] } as const;
const RATIONALE_PARTS = ["liner", "shadow", "cheek", "lip"] as const;
const KO: Record<string, string> = {
  winged: "꼬리를 위로 올림", extend: "눈 축을 곧게 연장", drop: "윗눈꺼풀 선을 따라 내림",
  oval: "계란형", round: "둥근형", square: "각진형", oblong: "긴형", heart: "하트형",
  higher: "광대 기준 조금 위", standard: "광대 표준 자리", lower: "광대 기준 조금 아래",
};

/** 이 얼굴에서 관문이 받아 주는 값만 — 거절될 선택지는 처음부터 주지 않는다 */
export function allowed(m: FaceMeasure): {
  liner: string[]; shadow: number[]; overline: number[]; intensity: Record<string, number[]>;
} {
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2, lr = m.lip.upperLowerRatio, R = PLAN_RULES;
  const shadow = STEP.scale.filter((v) =>
    !(v < 1 && gap > R.lidGapStd * (1 + R.lidGapTol)) && !(v > 1 && gap < R.lidGapStd * (1 - R.lidGapTol)));
  const overline = lr != null && lr >= R.lipTarget ? [0] : [...STEP.overline];
  const intensity = Object.fromEntries(["brow", "liner", "shadow", "cheek", "lip"].map((p) => {
    const cap = R.intensityCap[p as keyof typeof R.intensityCap] ?? Infinity;
    return [p, STEP.intensity.filter((v) => v <= cap)];
  }));
  return { liner: LINER_STYLES.filter((s) => s !== "drop" || droopDeg(m) > DROOP_MARGIN_DEG), shadow, overline, intensity };
}

function promptEF(full: string, m: FaceMeasure, variant: "E" | "F"): string {
  const j = full.indexOf(DECIDE_HEAD);
  if (j < 0) throw new Error("앱 프롬프트 모양이 바뀌었다 — entry.ts 의 제목을 맞춰 주세요");
  let head = full.slice(0, j).trimEnd();
  if (variant === "F") {
    // 규칙이 정한 값만 뺀다 — 측정값·범주(처진 눈 여부)는 남긴다
    head = head.replace(/ → 규칙 [^\n]*/g, "").split("\n").filter((l) => !l.startsWith("- 규칙")).join("\n");
  }
  const a = allowed(m);
  const opts = (xs: readonly (string | number)[]) => xs.map((x) => (typeof x === "string" && KO[x] ? `${x}(${KO[x]})` : String(x))).join(" / ");
  const inten = Object.entries(a.intensity).map(([p, xs]) => `${p} ${xs[0]}~${xs[xs.length - 1]}`).join(", ");
  return `${head}

${DECIDE_HEAD}
사진과 위 측정을 함께 보고 정합니다. 순서대로 씁니다 — 먼저 사진에서 본 것, 그 관찰에서 나온 부위별 근거, 마지막으로 값.
- observation: 사진에서 본 눈꼬리 · 눈두덩 · 입술 · 광대의 모습을 한국어 한두 문장으로
- rationale: ${RATIONALE_PARTS.join(" · ")} 각각 한 문장(${PLAN_LIMITS.rationaleMax}자 이내). 사용자 화면에 그대로 보이는 일상어로, 얼굴에서 본 점과 그래서 바꾼 모양을 "~해서 ~했어요" 로 씁니다
- liner.style: ${opts(a.liner)}
- linerThick.scale: ${opts(STEP.scale)} — 라이너 두께 배율. 1 이 템플릿. 눈이 크면 작게, 작으면 크게
- faceShape.label: ${opts(FACE_SHAPES)} — 쉐딩·하이라이트 자리만 바뀝니다
- shadow.range: ${opts(a.shadow)} — 섀도 높이 배율. 눈두덩이 좁으면 작게, 넓으면 크게
- lip.overline: ${opts(a.overline)} — 윗입술 가운데를 윗입술 두께의 몇 배 올릴지. 윗입술이 얇을수록 크게
- blush.position: ${opts(BLUSH_POSITIONS)}, blush.size: ${opts(STEP.scale)}
- highlight.tZone: true(이마~콧대 하이라이트) / false(피부가 번들거릴 때)
- intensity: 바꿀 부위만 — ${inten} (0.1 단위, 1 이 템플릿)

## 답
위 순서대로 JSON 하나만 답합니다. 코드 블록 없이.`;
}

/** 제약 디코딩용 JSON 스키마. 관문(resolvePlan)이 받는 모양·허용값과 같다. E·F 는 이 얼굴에서 받아 주는 값만 enum 으로 */
export function schema(variant: Variant = "A", m?: FaceMeasure): object {
  if ((variant === "E" || variant === "F") && m) return schemaEF(m);
  return schemaA();
}

function schemaEF(m: FaceMeasure): object {
  const a = allowed(m);
  const obj = (props: Record<string, object>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
  const text = (n: number) => ({ type: "string", minLength: 4, maxLength: n });
  return obj({
    observation: text(80),
    rationale: obj(Object.fromEntries(RATIONALE_PARTS.map((p) => [p, text(PLAN_LIMITS.rationaleMax)]))),
    liner: obj({ style: { enum: a.liner } }),
    linerThick: obj({ scale: { enum: [...STEP.scale] } }),
    faceShape: obj({ label: { enum: [...FACE_SHAPES] } }),
    shadow: obj({ range: { enum: a.shadow } }),
    lip: obj({ overline: { enum: a.overline } }),
    blush: obj({ position: { enum: [...BLUSH_POSITIONS] }, size: { enum: [...STEP.scale] } }),
    highlight: obj({ tZone: { type: "boolean" } }),
    intensity: { type: "object", properties: Object.fromEntries(Object.entries(a.intensity).map(([p, xs]) => [p, { enum: xs }])), additionalProperties: false },
  });
}

function schemaA(): object {
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
