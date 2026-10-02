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
 * 처진 눈 = 양쪽 눈꼬리 기울기 평균이 이 값보다 작은 눈 — 눈꼬리가 앞머리보다 "덜 올라간" 눈.
 * 임상의 down-slanting(0° 미만, 바깥이 더 낮음)보다 넓다.
 *
 * 2026-10-01 바꿈 (시험): 전에는 ILoveEye 2022 의 α > β (+2° 여유)로 봤다. 그런데 α > β 는 윗눈꺼풀이
 * 아랫눈꺼풀보다 높게 굽은 정도(평균 약 2.6배)를 재서 눈꼬리 방향과 상관없이 대부분 참이 된다 —
 * FFHQ-Makeup 동양인 정면 30장 중 21장이 처진 눈(눈꼬리 기울기는 30장 모두 +), 논문 예시 그림(Fig.4b)도 α−β ≈ 12°.
 * 윗눈꺼풀 꼭대기 점이 159·158 중 어느 쪽에 잡히느냐로 α−β 가 약 12° 뒤집히기도 했다.
 *
 * 5° = Lee 2020 (JKAOMS) 의 class I 경계 (docs/research/papers/개인화 근거):
 * - Lee 2020 (한국인 76명, 13~38세): 0~5° 를 class I 로 따로 묶음(76명 중 14명, 평균 3.2°),
 *   5° 넘으면 class II(다수, 매력적인 한국 얼굴 8.87° 도 여기), 0° 미만은 class III("늙고 피곤해 보임", 0명)
 * - Jung 2020 (AAPS, 한국 20대 여성 120명): 8.4° ± 2.9° · 8.8° ± 3.0° → 5° 는 평균 − 1.2 SD, 아래 약 10~12%
 * - 다만 class I 이 "처진 눈으로 보인다"고 한 논문은 없다 — 사람 표시로 확인했다 (2026-10-01, eval/vlm/droop_label.py):
 *   같은 30장을 사람이 처진 눈 7 · 아님 20 · 애매 3 으로 표시 → 눈꼬리 기울기가 가장 잘 가렸다(AUC 0.73).
 *   5° 에서 27장 중 22장 맞음 — 표시에 가장 잘 맞춘 4° (23장)와 한 장 차이라, 표본에 맞춘 값 대신 논문 경계를 쓴다.
 *   α−β 는 AUC 0.54(무작위 수준).
 * 처진 눈은 "아래로 기운 눈"(임상 0° 미만 — 30장 중 0장)이 아니라 "평균보다 덜 올라간 눈"이다 (이 30장 평균 6.7°).
 * - 재는 방법이 다르다(논문: 표준 정면 사진에서 사람이 눈꼬리를 찍음, 우리: MediaPipe 33·133 / 263·362 점, 롤 보정).
 *   이 30장 평균이 6.7° 로 한국 논문보다 약 2° 낮아, 같은 눈이라도 우리 값이 낮게 나올 수 있다.
 * 표시 1명 · FFHQ-Makeup 사진 27장이라 팀원 실제 사진으로 다시 맞춘다 (#84).
 * 기울기가 높은데 처진 눈으로 보이는 얼굴(윗꺼풀 피부가 눈꼬리를 덮는 모양)은 얼굴 점으로 잡히지 않는다 — 7장 중 3장.
 */
export const DROOP_TILT_DEG = 5;

/** 양쪽 눈꼬리 기울기 평균(°, 바깥이 높으면 +). 한 스타일로 양쪽을 같이 그리므로 평균으로 본다 */
export function tiltDeg(m: FaceMeasure): number {
  return (m.eye.R.tiltDeg + m.eye.L.tiltDeg) / 2;
}

/** 처진 눈인가 — 라이너 규칙·관문(drop)·VLM 선택지가 같이 쓴다 */
export function isDroopy(m: FaceMeasure): boolean {
  return tiltDeg(m) < DROOP_TILT_DEG;
}

/** 양쪽 눈의 α − β 평균 (ILoveEye). 처진 눈 판정에는 더 쓰지 않는다 — 참고값 */
export function droopDeg(m: FaceMeasure): number {
  return (m.eye.R.alphaDeg - m.eye.R.betaDeg + (m.eye.L.alphaDeg - m.eye.L.betaDeg)) / 2;
}

const isDown = isDroopy;

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
 * 거절 조건: 모르는 스타일. (처진 눈이 아닌데 drop 도 받는다 — 2026-10-01 v6, VLM 이 사진을 보고 정한다)
 */
export function resolveLiner(m: FaceMeasure, adapt: LinerAdapt = "correct", proposal?: { style: string }): LinerDecision {
  const rule: LinerDecision = { plan: planLiner(m, adapt), source: "rule" };
  if (!proposal) return rule;
  const style = LINER_STYLES.find((s) => s === proposal.style);
  if (!style) return { ...rule, rejected: `모르는 스타일: ${proposal.style}` };
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
 * 논문 조정값에 곱하는 배율 — **지금은 0: 얼굴형으로 눈썹을 옮기지 않고 표준 눈썹만 쓴다** (#166, 2026-09-28).
 * JKSC 2023(전문가 설문)은 둥근형·계란형을 "올려라" 하지만, Morikawa 2015(인상 실험)는 눈썹이 눈에 가까울수록 좋게 봤다.
 * 두 근거가 방향이 부딪히고, JKSC 값은 그렇게 그린 얼굴을 시험한 적이 없다. 사용자 실험(#84)으로 방향이 정해지면 다시 켠다.
 */
export const BROW_ADJUST_SCALE = 0;

/** ⑤ 모델 판정을 VLM 보다 앞세우는 확신도 */
export const FACESHAPE_TRUST = 0.6;

export type BrowArch = "flatter" | "standard" | "arched";
export const BROW_ARCHES: readonly BrowArch[] = ["flatter", "standard", "arched"];
export const FACE_SHAPES: readonly FaceShapeLabel[] = ["oval", "round", "square", "oblong", "heart"];
const INTENSITY_PARTS: readonly LookPartId[] = ["brow", "liner", "shadow", "cheek", "lip"];

/**
 * 받아 주는 범위. 벗어나면 그 항목만 규칙값 — 가정값이다.
 * 2026-10-01 넓힘 (vlm-prompt-v6): 사람 평가에서 VLM 계획이 규칙과 거의 같아(0.9 로 몰림) 비교가 안 됐다.
 * 측정과 반대 방향이라는 이유의 거절(섀도 · 오버라인 · drop)과 부위별 진하기 상한도 풀었다 — VLM 이 사진을 보고 정한다.
 * 남은 안전장치: 이 범위 · 진하기 평균 상한(intensityMeanCap) · 근거 문장 검사.
 */
export const PLAN_LIMITS = {
  shadowRange: [0.6, 1.4], intensity: [0.5, 1.5], rationaleMax: 40,
  lipOverline: [0, 0.5], blushSize: [0.6, 1.4], linerThick: [0.6, 1.4],
} as const;

/** 규칙만으로 정하는 섀도 범위의 끝 — VLM 범위(PLAN_LIMITS)를 넓혀도 규칙값은 그대로 둔다 */
export const RULE_SHADOW_RANGE = [0.8, 1.2] as const;

/**
 * 개인화 규칙의 가정값 — 전부 여기 한 곳. 사용자 실험(#84)으로 맞춘다.
 *   lidGapStd      눈두덩(윗눈꺼풀 꼭대기 → 눈썹 아랫선) ÷ 눈 폭의 표준. 13.7 mm(JKSC) ÷ 24.8 mm(Jung 눈 폭 평균)
 *   shadowGain     표준에서 벗어난 비율의 몇 배만큼 섀도 범위를 바꿀지
 *   lipTarget      윗입술 ÷ 아랫입술 목표. 규칙 오버라인은 모자란 만큼의 절반, 최대 lipOverlineMax
 *   intensityMeanCap  받은 배율의 평균 상한 — 전체가 한꺼번에 진해지지 않게
 *   blushShift     볼 위치 higher/lower 가 옮기는 거리 (얼굴 폭 비율)
 */
export const PLAN_RULES = {
  lidGapStd: 0.55, shadowGain: 0.5,
  lipTarget: 0.8, lipOverlineMax: 0.3,
  intensityMeanCap: 1.15,
  blushShift: 0.03,
};

export type BlushPosition = "higher" | "standard" | "lower";
export const BLUSH_POSITIONS: readonly BlushPosition[] = ["higher", "standard", "lower"];

/** 굽기 기본값 (Zhao 2019: 둥근 얼굴일수록 굽은 눈썹, JKSC 와 같은 방향) */
/** 굽기 — 지금은 늘 표준 (Zhao 2019 는 표본·조건이 약하다, #166). 켤 때는 둥근형 → arched, 긴형 → flatter */
const archOf = (_s: FaceShapeLabel | null): BrowArch => "standard";

export interface BrowPlanValues {
  faceShape: FaceShapeLabel | null;
  source: "rule" | "vlm";
  /** 표준 눈썹에서 옮길 mm (이미 BROW_ADJUST_SCALE 적용) */
  heightMm: number;
  glabellaMm: number;
  arch: BrowArch;
}

export interface PersonalPlan {
  /** 얼굴형 — 눈썹 조정과 쉐딩·하이라이트 자리가 같이 쓴다. 믿을 만한 판정이 없으면 null */
  faceShape: FaceShapeLabel | null;
  liner: LinerDecision;
  /** 라이너 두께 배율 (룩 두께에 곱한다) */
  linerThick: { scale: number; source: "rule" | "vlm" };
  brow: BrowPlanValues;
  /** 윗입술 가운데를 올리는 양 — 지금 윗입술 두께의 비율. 0 이면 입술선 그대로 */
  lip: { overline: number; source: "rule" | "vlm" };
  /** 볼: 위치(얼굴 폭의 blushShift 만큼 위·아래)와 크기 배율 */
  blush: { position: BlushPosition; size: number; source: "rule" | "vlm" };
  /** 하이라이트: T존(이마 가운데~콧대)에도 넣을지. 번들거리는 피부면 끈다 */
  highlight: { tZone: boolean; source: "rule" | "vlm" };
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

  // 눈썹 굽기 — 지금은 표준 눈썹만 쓴다 (#166). 제안은 받지 않는다
  const arch = archOf(shape);
  if (isObj(q.brow) && q.brow.arch !== undefined && q.brow.arch !== "standard") rejected.push("눈썹 굽기: 지금은 표준 눈썹만 쓴다");
  const adj = shape ? JKSC_BROW_ADJUST_MM[shape] : { height: 0, glabella: 0 };
  const brow: BrowPlanValues = { faceShape: shape, source: browSource, heightMm: adj.height * BROW_ADJUST_SCALE + 0, glabellaMm: adj.glabella * BROW_ADJUST_SCALE + 0, arch };   // + 0: 배율 0 일 때 −0 이 안 나오게

  // 섀도 범위 — 규칙: 눈두덩이 넓으면 넓게, 좁으면 좁게. 제안이 측정과 반대 방향이면 거절
  const R = PLAN_RULES, [s0, s1] = PLAN_LIMITS.shadowRange;
  const gap = (m.eye.R.lidGapRatio + m.eye.L.lidGapRatio) / 2;
  const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  let shadow: PersonalPlan["shadow"] = { range: clampTo(1 + R.shadowGain * (gap / R.lidGapStd - 1), ...RULE_SHADOW_RANGE), source: "rule" };
  if (isObj(q.shadow) && q.shadow.range !== undefined) {
    const v = q.shadow.range;
    if (!inRange(v, PLAN_LIMITS.shadowRange)) rejected.push(`섀도 범위: ${String(v)} 는 ${s0}~${s1} 밖`);
    else shadow = { range: v, source: "vlm" };
  }

  // 입술 — 규칙: 윗입술이 목표보다 얇으면 모자란 만큼의 절반을 올린다
  const lr = m.lip.upperLowerRatio;
  let lip: PersonalPlan["lip"] = { overline: lr != null && lr > 0 && lr < R.lipTarget ? Math.min(R.lipOverlineMax, (R.lipTarget / lr - 1) / 2) : 0, source: "rule" };
  if (isObj(q.lip) && q.lip.overline !== undefined) {
    const v = q.lip.overline;
    if (!inRange(v, PLAN_LIMITS.lipOverline)) rejected.push(`입술: 오버라인 ${String(v)} 는 ${PLAN_LIMITS.lipOverline.join("~")} 밖`);
    else lip = { overline: v, source: "vlm" };
  }

  // 진하기 — 부위별 범위, 그다음 전체 평균 상한
  const intensity: PersonalPlan["intensity"] = {};
  if (isObj(q.intensity)) {
    for (const [k, v] of Object.entries(q.intensity)) {
      const part = INTENSITY_PARTS.find((s) => s === k);
      if (!part) rejected.push(`진하기: 모르는 부위 ${k}`);
      else if (!inRange(v, PLAN_LIMITS.intensity)) rejected.push(`진하기: ${k} ${String(v)} 는 ${PLAN_LIMITS.intensity.join("~")} 밖`);
      else intensity[part] = v;
    }
    const vals = Object.values(intensity) as number[];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1;
    if (mean > R.intensityMeanCap) {
      const over = vals.reduce((a, v) => a + Math.max(0, v - 1), 0);
      const base = vals.reduce((a, v) => a + (v > 1 ? 1 : v), 0);
      const k = (R.intensityMeanCap * vals.length - base) / over;
      for (const key of Object.keys(intensity) as LookPartId[]) {
        const v = intensity[key]!;
        if (v > 1) intensity[key] = 1 + (v - 1) * k;
      }
      rejected.push(`진하기: 전체가 너무 진해 ${R.intensityMeanCap} 평균으로 줄임`);
    }
  }

  // 하이라이트·볼·라이너 두께 — 측정으로 따질 것이 없어 모양·범위만 본다
  let highlight: PersonalPlan["highlight"] = { tZone: true, source: "rule" };
  if (isObj(q.highlight) && q.highlight.tZone !== undefined) {
    if (typeof q.highlight.tZone === "boolean") highlight = { tZone: q.highlight.tZone, source: "vlm" };
    else rejected.push("하이라이트: tZone 은 true/false");
  }
  let blush: PersonalPlan["blush"] = { position: "standard", size: 1, source: "rule" };
  if (isObj(q.blush)) {
    const pos = q.blush.position === undefined ? "standard" : BLUSH_POSITIONS.find((s) => s === (q.blush as Record<string, unknown>).position);
    const size = q.blush.size === undefined ? 1 : q.blush.size;
    if (!pos) rejected.push(`볼: 모르는 위치 ${String(q.blush.position)}`);
    if (!inRange(size, PLAN_LIMITS.blushSize)) rejected.push(`볼: 크기 ${String(size)} 는 ${PLAN_LIMITS.blushSize.join("~")} 밖`);
    if (pos && inRange(size, PLAN_LIMITS.blushSize)) blush = { position: pos, size, source: "vlm" };
  }
  let linerThick: PersonalPlan["linerThick"] = { scale: 1, source: "rule" };
  if (isObj(q.linerThick) && q.linerThick.scale !== undefined) {
    if (inRange(q.linerThick.scale, PLAN_LIMITS.linerThick)) linerThick = { scale: q.linerThick.scale, source: "vlm" };
    else rejected.push(`라이너 두께: ${String(q.linerThick.scale)} 는 ${PLAN_LIMITS.linerThick.join("~")} 밖`);
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

  return { faceShape: shape, liner, linerThick, brow, lip, blush, highlight, shadow, intensity, rationale, rejected };
}
