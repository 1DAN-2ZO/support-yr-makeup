/**
 * 부위 채점 — 순수 로직 (화면 5·5-b, F-08·F-09).
 * poc/full/lib/score.js 를 계약 타입(types.ts)에 맞춰 옮긴 것. DOM·이미지를 쓰지 않는다.
 *
 * 입력은 sampling.ts 가 뽑은 Lab 샘플(기준 쌩얼 vs 내 화장).
 * 여기서 ΔE → 지표 → 점수 → 진단 코드 → 한 줄 평 → 상태까지 정한다.
 *  - 화면에는 점수(또는 "확인만")와 한 줄 평만. 거리·각도·% 는 내부용이다
 *  - 길이는 전부 비율. 눈 부위는 눈 폭 대비, 입술은 입술 폭 대비 (2026-09-16 결정, mm 없음)
 *  - 세션 반영은 flow.ts applyResult 가 한다. 여기서는 toOutcome() 으로 그 입력을 만든다
 */

import scoreRules from "../../../rules/score.json";
import type { Lab } from "./color";
import { deltaE, rgbToLab } from "./color";
import type { ScoreOutcome } from "./flow";
import { RIGID_IDS } from "./landmarks";
import type { CheckReason, PartId, PartResult, Pt } from "./types";

export const PART_NAME: Record<PartId, string> = {
  brow: "눈썹",
  liner: "아이라이너",
  shadow: "섀도우",
  lip: "입술",
  cheek: "볼터치",
  contour: "쉐딩·하이라이트",
};
/** 화면 4·5 에서 부위를 볼 때 폰 방향 */
export const PART_ORIENT: Record<PartId, "landscape" | "portrait"> = {
  brow: "landscape",
  liner: "landscape",
  shadow: "landscape",
  lip: "portrait",
  cheek: "portrait",
  contour: "portrait",
};
/** 형태(선·경계)로 채점하는 부위 / 진하기로 채점하는 부위 */
export const FORM_PARTS = ["brow", "liner", "lip"] as const satisfies readonly PartId[];
export const INTENSITY_PARTS = ["shadow", "cheek", "contour"] as const satisfies readonly PartId[];
export type IntensityPartId = (typeof INTENSITY_PARTS)[number];

export type Side = "R" | "L";
export type Band = readonly [number, number];

/**
 * 채점 임계. 전부 가정값이고 E-1 뒤에 rules/score.json 으로 옮긴다 (3-13).
 * 가이드 치수(라이너 두께·입술 오프셋)는 여기 없다 — ② 가 룩마다 정해서 그린 값을 샘플 meta 로 받아 쓴다.
 * 채점이 자기 치수를 갖고 있으면 가이드와 어긋날 때 가이드대로 그려도 감점된다
 */
export interface ScoreParams {
  /** 형태 부위 화장 감지 임계 (ΔE) */
  dEThresh: { liner: number; brow: number; lip: number };
  /** 강도 부위 유무 임계 (부위 ΔE − 참조 ΔE) */
  tPresent: Record<IntensityPartId, number>;
  dEMaxSession: number;
  toneDiv: number;
  /** 이마 L* 가 기준에서 이만큼 넘게 달라지면 조명이 바뀐 것 */
  lightTol: number;
  /** 기준 얼굴과 정렬 잔차(안정 점 평균, 눈 폭 비율)가 이만큼 넘으면 확인만(align) — 가정값, 실사진 잔차 분포로 정한다 (#43) */
  alignMax: number;
  /** 부위가 머리카락에 이만큼 넘게 가리면 확인만(가림) — 가정값 (docs/research/hair-skin-2026-09-29) */
  hairMax: number;
  /**
   * 조명 보정 방식 (S-4 #40). "L" = 이마 L* 비율만(지금). "sclera" = 거기에 눈 흰자 a*b* 가 돈 만큼 조명 색을 되돌림 —
   * 합성 얼굴: 노란·파란 불빛의 맨얼굴이 "L" 이면 눈썹·라이너·입술 66~70점, "sclera" 면 화장 없음 (color-corr.test)
   */
  colorCorr: "L" | "sclera";
  /**
   * 템플릿 색이 피부와 얼마나 다른지 볼 때, 실제로 발리는 비율 (가정값). 차이 × 이 값이 부위 검출 기준보다 작으면 확인만(subtle)
   */
  subtleCover: number;
  /** 맨얼굴 그 부위 칸 중 이 비율 이상에서 화장이 보일 것 같아야 채점한다 (가정값). 못 미치면 확인만(subtle) */
  subtleMinFrac: number;
  /** 목표 지수 밴드. 룩 템플릿 값이 우선이고, 없으면 확인만 */
  band: Partial<Record<IntensityPartId, Band>>;
  tol: {
    band: number;
    out: number;
    wingDev: number;
    wingShort: number;
    thickOver: number;
    thickUnder: number;
    lrDiff: number;
    lipIn: number;
    lipOut: number;
    wingMin: number;
  };
}

/** 채점 가정값 — rules/score.json 한 곳 (#44). 코드에 숫자를 박지 않는다 (dev-stack-v6.md §6) */
// JSON 의 [a, b] 는 "숫자 목록" 으로 읽혀 Band(두 개) 로 바로 안 바뀐다 — 값이 파일과 같은지는 score-rules.test R1 이 본다
export const PARAMS: ScoreParams = scoreRules.params as unknown as ScoreParams;
/** 채점 규칙 버전 — 로그(Event.ver)·결과 카드 도장에 붙는다. 임계를 바꾸면 rules/score.json 에서 올린다 */
export const SCORE_VERSION: string = scoreRules.version;

/** 진단 코드 → 한 줄 문장. 코드표는 여기 한 곳에만 둔다 (review.ts 도 가져다 쓴다). 숫자를 쓰지 않는다 */
export const DIAG_TEXT = {
  // 화장 초보가 읽는다 (2026-09-23 정리): "산·연장선·점막" 같은 용어 대신 "끝·사이·테두리". 기준은 늘 화면에 보이는 테두리.
  // 눈꼬리 = 눈 바깥 끝(라이너), 눈썹 꼬리 = 눈썹 바깥 끝. "왼쪽에 맞춰" 처럼 반대쪽이 맞다고 단정하지 않는다
  LINER_WING_HIGH_R: "오른쪽 눈꼬리 선이 위로 올라갔어요. 테두리에 맞춰 살짝 내리세요",
  LINER_WING_HIGH_L: "왼쪽 눈꼬리 선이 위로 올라갔어요. 테두리에 맞춰 살짝 내리세요",
  LINER_WING_LOW_R: "오른쪽 눈꼬리 선이 아래로 처졌어요. 테두리에 맞춰 살짝 올리세요",
  LINER_WING_LOW_L: "왼쪽 눈꼬리 선이 아래로 처졌어요. 테두리에 맞춰 살짝 올리세요",
  LINER_WING_SHORT_R: "오른쪽 눈꼬리 선이 짧아요. 테두리 끝까지 조금 더 그리세요",
  LINER_WING_SHORT_L: "왼쪽 눈꼬리 선이 짧아요. 테두리 끝까지 조금 더 그리세요",
  LINER_THICK: "선이 조금 두꺼워요. 다음엔 얇게 시작해 보세요",
  LINER_THIN: "선이 옅어요. 한 번 더 겹쳐 그리세요",
  LINER_GAP_R: "오른쪽 선 중간이 끊겼어요. 이어서 그리세요",
  LINER_GAP_L: "왼쪽 선 중간이 끊겼어요. 이어서 그리세요",
  LINER_OUT_R: "오른쪽 선이 테두리 밖으로 번졌어요",
  LINER_OUT_L: "왼쪽 선이 테두리 밖으로 번졌어요",
  LINER_LR_DIFF: "양쪽 눈꼬리 선 높이가 달라요",
  BROW_TAIL_SHORT_R: "오른쪽 눈썹 꼬리가 덜 그려졌어요. 테두리 끝까지 이어 그리세요",
  BROW_TAIL_SHORT_L: "왼쪽 눈썹 꼬리가 덜 그려졌어요. 테두리 끝까지 이어 그리세요",
  BROW_OUT_R: "오른쪽 눈썹이 테두리 밖으로 나갔어요",
  BROW_OUT_L: "왼쪽 눈썹이 테두리 밖으로 나갔어요",
  BROW_SPARSE: "눈썹 사이사이가 비어 보여요. 빈 곳을 살짝 메우세요",
  BROW_LR_DIFF: "양쪽 눈썹 높이가 달라요",
  LIP_OUT_LOWER: "아랫입술 선이 살짝 밖으로 나갔어요",
  LIP_OUT_UPPER: "윗입술 선이 살짝 밖으로 나갔어요",
  LIP_UNDER: "입술 안쪽이 덜 채워졌어요. 가운데를 한 번 더 바르세요",
  LIP_LR_DIFF: "양쪽 입꼬리가 달라요",
  SHADOW_DIR: "눈 바깥쪽으로 갈수록 진하게 발라 보세요",
  SHADOW_LR_DIFF_R: "오른쪽 섀도우가 조금 진해요",
  SHADOW_LR_DIFF_L: "왼쪽 섀도우가 조금 진해요",
  CHEEK_LR_DIFF_R: "오른쪽이 조금 진해요",
  CHEEK_LR_DIFF_L: "왼쪽이 조금 진해요",
  TONE_OVER: "조금 진해요",
  TONE_UNDER: "조금 더 진하게",
  TONE_OK: "적당해요",
  CONTOUR_LR_R: "오른쪽이 조금 진해요",
  CONTOUR_LR_L: "왼쪽이 조금 진해요",
  CONTOUR_HI_R: "오른쪽 하이라이트가 조금 밝아요",
  CONTOUR_HI_L: "왼쪽 하이라이트가 조금 밝아요",
} as const;
export type DiagCode = keyof typeof DIAG_TEXT;

/** 저장된 코드(string)로 문장을 찾는다. 모르는 코드는 undefined */
export function diagText(code: string): string | undefined {
  return (DIAG_TEXT as Record<string, string>)[code];
}

/**
 * "확인만" 이유 → 짧은 이유 한 문장. 숫자를 쓰지 않는다. 리뷰(다 끝난 뒤)는 이것만 쓴다.
 * 폰 시험(2026-09-30): "조명이 달라져서 재지 못했어요" 는 사용자를 탓하는 것 같고 기계 말투라 → 무엇이 다른지만 짧게
 */
export const CHECK_REASON_SHORT: Record<CheckReason, string> = {
  faint: "아직 색이 잘 안 보여요.",
  lighting: "처음 찍을 때와 밝기가 달라요.",
  align: "얼굴이 처음과 달라 비교하기 어려워요.",
  occluded: "앞머리나 손이 가리고 있어요.",
  no_baseline: "맨얼굴 사진이 없어 비교할 수 없어요.",
  no_band: "이 화장은 아직 진하기 기준이 없어요.",
  subtle: "이 화장은 색이 피부와 가까워 사진으로 가르기 어려워요.",
  contour: "확인하고 넘어가세요.",
};

/** 화면 5 에서 이유 뒤에 붙이는 할 일 하나. 다시 하면 되는 이유는 다시 확인받기를 권한다 */
export const CHECK_ACTION: Record<Exclude<CheckReason, "contour">, string> = {
  faint: "조금 더 바르거나, 거울로 보고 넘어가세요",
  lighting: "같은 자리에서 다시 확인받아 주세요",
  align: "정면을 보고 다시 확인받아 주세요",
  occluded: "치우고 다시 확인받아 주세요",
  no_baseline: "거울로 보고 넘어가세요",
  no_band: "거울로 보고 넘어가세요",
  subtle: "거울로 보고 넘어가세요",
};

/** 화면 5 "확인만" 한 줄 = 이유 + 할 일. 쉐딩은 이유만 */
export const CHECK_REASON_TEXT: Record<CheckReason, string> = Object.fromEntries(
  (Object.keys(CHECK_REASON_SHORT) as CheckReason[]).map((k) => [k, k === "contour" ? CHECK_REASON_SHORT[k] : `${CHECK_REASON_SHORT[k]} ${CHECK_ACTION[k]}`]),
) as Record<CheckReason, string>;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const median = (arr: readonly number[]): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** 현재 프레임의 Lab 을 기준 조명으로 되돌리는 함수 */
export type LightCorr = (lab: Lab) => Lab;
export const noCorr: LightCorr = (lab) => lab;
/** 조명 보정: 이마 L* 비율로 현재 Lab 의 L 을 스케일한다 (a*·b* 보정 방식은 S-4 에서 고른다) */
export function lightCorr(baseForeheadL: number, curForeheadL: number): LightCorr {
  const r = baseForeheadL / Math.max(1, curForeheadL);
  return (lab) => ({ L: lab.L * r, a: lab.a, b: lab.b });
}

/**
 * 밝기(이마 L* 비율) + 조명 색(흰자 a*b* 차이를 되돌림). 흰자는 원래 흰색이라 흰자가 돈 만큼 조명이 돈 것 (S-4 #40).
 * 색이 도는 양은 밝을수록 크다(곱으로 도는 불빛) — 흰자에서 잰 차이를 **그 픽셀 밝기 ÷ 흰자 밝기** 만큼만 되돌린다.
 * 똑같이 빼면 어두운 속눈썹 옆(라이너 띠)이 과하게 보정돼 "그렸다" 가 됐다 (color-corr K2)
 */
export function colorShiftCorr(light: LightCorr, baseSclera: { a: number; b: number }, curSclera: { a: number; b: number; L: number }): LightCorr {
  const da = curSclera.a - baseSclera.a, db = curSclera.b - baseSclera.b, Ls = Math.max(1, curSclera.L);
  return (lab) => {
    const l = light(lab), k = Math.min(1, lab.L / Ls);
    return { L: l.L, a: l.a - da * k, b: l.b - db * k };
  };
}

/** 부위 채점 결과 (상태를 정하기 전). decide()·toOutcome() 의 입력 */
export interface PartScore {
  /** 화장이 감지됐는가. false 면 "색이 옅어서" 확인만 */
  present: boolean;
  score: number | null;
  codes: DiagCode[];
  lrIndex: { left: number; right: number } | null;
  metrics: PartResult["metrics"];
}

// ---------- 형태 채점 (구현 정의서 5-3) ----------

export interface FormInput {
  coverage: number;
  overflow: number;
  /** 그린 꼬리 길이 − 가이드 꼬리 길이 (눈 폭 비율) */
  wingDelta?: number;
  /** 그린 두께 − 가이드 두께 (눈 폭 비율) */
  thickDelta?: number;
}

/** 눈 폭 비율 0.037 ≈ 옛 1mm. 감점 계수는 mm 기준으로 정한 값을 그대로 쓴다 */
const UNIT_STEP = 0.037;

export function scoreForm({ coverage, overflow, wingDelta = 0, thickDelta = 0 }: FormInput): number {
  let s = 100;
  s -= (1 - coverage) * 50;
  s -= clamp(overflow * 60, 0, 30);
  s -= clamp((Math.abs(wingDelta) / UNIT_STEP) * 8, 0, 20);
  s -= clamp((Math.abs(thickDelta) / UNIT_STEP) * 5, 0, 10);
  return Math.round(clamp(s, 0, 100));
}

/** 아이라이너 스트립: 속눈썹 선 + 꼬리를 따라 N행, 법선 방향 M칸 */
export interface LinerStrip {
  lab: Lab[][];
  meta: {
    /** 법선 방향 오프셋 M개 (눈 폭 비율, + = 위) */
    offs: readonly number[];
    isWing: readonly boolean[];
    /** 눈꼬리에서 꼬리를 따라 간 거리 (눈 폭 비율). 눈꺼풀 행은 음수 */
    tFromCorner: readonly number[];
    wingLen: number;
    /** 가이드 선 두께 (눈 폭 비율). ② 가 이 룩에서 그린 값 — 밴드 안/밖과 두꺼움/옅음의 기준 */
    thick: number;
    /** 이 프레임에서 눈을 뜨고 있나. 뜨고 있으면 속눈썹 선 아래는 눈알이라 그 칸을 안 본다 */
    eyeOpen: boolean;
    /** 평균 창 때문에 선이 양쪽으로 번져 보이는 폭 (눈 폭 비율, 없으면 0). 두께에서 뺀다 */
    blur?: number;
  };
}

export interface LinerEyeMetrics {
  /** 가이드 밴드 안 감지율 */
  coverage: number;
  /** 밴드 밖 감지율 */
  overflow: number;
  thickness: number;
  /** 가이드 선 두께 (샘플 meta 에서 그대로) */
  guideThick: number;
  wingGuide: number;
  wingDrawn: number;
  /** 꼬리 끝 쪽의 감지 중심 오프셋. + 는 가이드 법선(위·바깥) 방향 */
  wingDev: number;
  gapRatio: number;
  present: boolean;
}

export function compareLinerEye(base: LinerStrip, cur: LinerStrip, corr: LightCorr, p: ScoreParams = PARAMS): LinerEyeMetrics {
  const { offs, isWing, tFromCorner, wingLen, thick: guideThick } = cur.meta;
  // 띠 = 속눈썹 선(o = 0)에서 위로 guideThick — ② 가이드(guides.ts linerOutline)와 같은 뜻 (#153).
  // 전엔 속눈썹 선을 가운데 두고 ±thick/2 라, 두꺼운 화장을 가이드대로 칠해도 윗부분이 '번짐' 이었다
  const N = Math.min(base.lab.length, cur.lab.length), M = offs.length;
  const step = M > 1 ? offs[1]! - offs[0]! : 0.0092;
  // 속눈썹 선 아래(−)는 눈을 뜨고 있으면 눈알이다. 시선·홍채가 조금만 움직여도 색이 크게 변해 "선 아래 잉크"로 오인된다.
  // 두 프레임 다 눈을 감았을 때만 아래쪽(아래 눈꺼풀 피부)을 본다. 꼬리 행은 눈 밖이라 항상 본다
  const useBelow = !base.meta.eyeOpen && !cur.meta.eyeOpen;
  // 평균 창으로 번진 폭은 칸 단위로 뺀다 — 두께가 칸(step) 단위로 재지므로 (합성: 3×3 에서 정확히 2칸 늘었다)
  const blurW = Math.round((cur.meta.blur ?? 0) / step) * step;
  let rowsN = 0, rowsCovered = 0, outN = 0, outHit = 0, wingDrawn = 0, lidRows = 0, lidHitRows = 0;
  const widths: number[] = [], devs: number[] = [];
  for (let i = 0; i < N; i++) {
    const wing = isWing[i] ?? false, t = tFromCorner[i] ?? 0;
    let drawnW = 0, bandHit = false;
    const hitOffs: number[] = [];
    for (let j = 0; j < M; j++) {
      const o = offs[j]!;
      if (!wing && !useBelow && o < -p.tol.band) continue;   // 눈알 칸 — 어느 계산에도 안 넣는다
      const hit = deltaE(base.lab[i]![j]!, corr(cur.lab[i]![j]!)) >= p.dEThresh.liner;
      if (o >= -p.tol.band && o <= guideThick + p.tol.band) {
        if (hit) bandHit = true;   // 가이드 밴드(두께 + 허용) 안에 감지가 있으면 그 행은 덮임
      } else if (o > guideThick + p.tol.out + blurW || o < -(p.tol.out + blurW)) {   // 번진 폭만큼 바깥 판정을 민다
        outN++;                    // 밴드 밖 번짐
        if (hit) outHit++;
      }
      if (hit) { drawnW += step; hitOffs.push(o); }
    }
    rowsN++;
    if (bandHit) rowsCovered++;
    if (drawnW > 0) {
      widths.push(Math.max(step, drawnW - blurW));
      if (wing && t > wingLen * 0.5) devs.push(median(hitOffs));   // 꼬리 바깥쪽 절반의 중심 오프셋
    }
    if (!wing) { lidRows++; if (drawnW > 0) lidHitRows++; }
    if (wing && drawnW >= p.tol.wingMin) wingDrawn = Math.max(wingDrawn, t);   // 꼬리 행에 최소 폭 이상 감지되면 그 길이까지 그린 것
  }
  return {
    coverage: rowsN ? rowsCovered / rowsN : 0,
    overflow: outN ? outHit / outN : 0,
    thickness: median(widths),
    guideThick,
    wingGuide: wingLen,
    wingDrawn,
    wingDev: devs.length ? median(devs) : 0,
    gapRatio: lidRows ? 1 - lidHitRows / lidRows : 1,
    // 잡음 몇 칸이 아니라 선이어야 한다 — 3행 이상이면서 행의 10% 이상 (#174 리뷰: 잡음 σ10 에서 흩어진 몇 행으로 25점)
    present: widths.length >= Math.max(3, 0.1 * rowsN),
  };
}

/** baseAsym: 맨얼굴에서 원래 있던 좌우 꼬리 높이 차 (눈 폭 비율). 그만큼은 화장 탓으로 치지 않는다 */
export function linerResult(perEye: Record<Side, LinerEyeMetrics>, baseAsym = 0, p: ScoreParams = PARAMS): PartScore {
  const { R, L } = perEye;
  const codes: DiagCode[] = [];
  const present = R.present || L.present;
  if (!present) return { present, score: null, codes, lrIndex: null, metrics: { perEye } };
  for (const k of ["R", "L"] as const) {
    const e = perEye[k];
    if (!e.present) { codes.push(`LINER_GAP_${k}`); continue; }
    if (e.wingDev > p.tol.wingDev) codes.push(`LINER_WING_HIGH_${k}`);
    else if (e.wingDev < -p.tol.wingDev) codes.push(`LINER_WING_LOW_${k}`);
    if (e.wingDrawn < e.wingGuide - p.tol.wingShort) codes.push(`LINER_WING_SHORT_${k}`);
    if (e.gapRatio > 0.25) codes.push(`LINER_GAP_${k}`);
    if (e.overflow > 0.35) codes.push(`LINER_OUT_${k}`);
  }
  const thickness = (R.thickness + L.thickness) / 2, guideThick = (R.guideThick + L.guideThick) / 2;
  if (thickness > guideThick + p.tol.thickOver) codes.push("LINER_THICK");
  else if (thickness < guideThick - p.tol.thickUnder && thickness > 0) codes.push("LINER_THIN");
  const lrDiff = Math.abs(R.wingDev - L.wingDev - baseAsym);
  if (lrDiff > p.tol.lrDiff) codes.push("LINER_LR_DIFF");
  const avg = (a: number, b: number): number => (a + b) / 2;
  const score = scoreForm({
    coverage: avg(R.coverage, L.coverage),
    overflow: avg(R.overflow, L.overflow),
    wingDelta: avg(R.wingDrawn - R.wingGuide, L.wingDrawn - L.wingGuide),
    thickDelta: thickness - guideThick,
  });
  return { present, score, codes, lrIndex: null, metrics: { perEye, lrDiff, thickness } };
}

/** 영역 격자 (눈썹): 점 K개. inside = 테두리 안, tail = 꼬리 구간 */
export interface RegionGrid {
  lab: Lab[];
  /** hidden: 머리카락에 가린 칸 (마스크가 있을 때만) — 두 사진 중 한쪽이라도 가렸으면 비교에서 뺀다 */
  meta: { inside: readonly boolean[]; tail: readonly boolean[]; side: readonly Side[]; lift?: readonly number[]; hidden?: readonly boolean[] };
}

export interface RegionSideMetrics {
  /** 그린(감지된) 점들의 평균 높이 — 아래 선에서 위로, 눈 폭 비율. 격자에 높이가 없거나 감지가 없으면 null */
  hitLift: number | null;
  coverage: number;
  overflow: number;
  tailCoverage: number;
  present: boolean;
}

export function compareRegion(base: RegionGrid, cur: RegionGrid, corr: LightCorr, thresh: number): Record<Side, RegionSideMetrics> {
  const K = Math.min(base.lab.length, cur.lab.length);
  const zero = () => ({ inN: 0, inHit: 0, outN: 0, outHit: 0, tailN: 0, tailHit: 0, liftSum: 0, liftN: 0 });
  const acc = { R: zero(), L: zero() };
  for (let i = 0; i < K; i++) {
    if (base.meta.hidden?.[i] || cur.meta.hidden?.[i]) continue;
    const a = acc[cur.meta.side[i]!], b = base.lab[i]!;
    const th = b.L < 40 ? thresh * 0.5 : thresh;   // 맨얼굴에서 이미 어두운 점(눈썹 털)은 펜슬 변화가 작으므로 임계를 절반으로
    const hit = deltaE(b, corr(cur.lab[i]!)) >= th;
    const h = cur.meta.lift?.[i];
    if (hit && h !== undefined) { a.liftSum += h; a.liftN++; }
    if (cur.meta.inside[i]) {
      a.inN++;
      if (hit) a.inHit++;
      if (cur.meta.tail[i]) { a.tailN++; if (hit) a.tailHit++; }
    } else {
      a.outN++;
      if (hit) a.outHit++;
    }
  }
  const f = (a: ReturnType<typeof zero>): RegionSideMetrics => ({
    coverage: a.inN ? a.inHit / a.inN : 0,
    overflow: a.outN ? a.outHit / a.outN : 0,
    tailCoverage: a.tailN ? a.tailHit / a.tailN : 0,
    present: a.inHit >= 6,
    hitLift: a.liftN ? a.liftSum / a.liftN : null,
  });
  return { R: f(acc.R), L: f(acc.L) };
}

export function browResult(per: Record<Side, RegionSideMetrics>): PartScore {
  const codes: DiagCode[] = [];
  const present = per.R.present || per.L.present;
  if (!present) return { present, score: null, codes, lrIndex: null, metrics: { per } };
  for (const k of ["R", "L"] as const) {
    if (per[k].tailCoverage < 0.4) codes.push(`BROW_TAIL_SHORT_${k}`);
    if (per[k].overflow > 0.3) codes.push(`BROW_OUT_${k}`);
  }
  const coverage = (per.R.coverage + per.L.coverage) / 2;
  if (coverage < 0.45) codes.push("BROW_SPARSE");
  const score = scoreForm({ coverage, overflow: (per.R.overflow + per.L.overflow) / 2 });
  // 좌우 높이 차 (+ = 오른쪽이 높다). 합산의 대칭 보정이 쓴다 (#35). 한쪽이라도 안 그렸으면 안 넘긴다
  const lr = per.R.present && per.L.present && per.R.hitLift !== null && per.L.hitLift !== null ? { lrDiff: per.R.hitLift - per.L.hitLift } : {};
  return { present, score, codes, lrIndex: null, metrics: { per, ...lr } };
}

/** 입술 경계 스트립: 바깥 윤곽을 따라 N행, 안쪽(−) … 바깥쪽(+) M칸 */
export interface LipStrip {
  lab: Lab[][];
  meta: {
    /** 오프셋 M개 (입술 폭 비율, − 안쪽 … + 바깥쪽) */
    offs: readonly number[];
    half: readonly ("upper" | "lower")[];
    side: readonly Side[];
    /** 가이드 경계 오프셋 (입술 폭 비율, + 바깥). ② 가 이 룩에서 그린 값 */
    offset: number;
  };
}

export function compareLip(base: LipStrip, cur: LipStrip, corr: LightCorr, p: ScoreParams = PARAMS): PartScore {
  const { offs, half, side, offset: off } = cur.meta;
  const N = Math.min(base.lab.length, cur.lab.length), M = offs.length;
  const out = { upper: { n: 0, hit: 0 }, lower: { n: 0, hit: 0 } };
  const sideRows = { R: { n: 0, hit: 0 }, L: { n: 0, hit: 0 } };
  let inN = 0, inHit = 0, rowsHit = 0;
  for (let i = 0; i < N; i++) {
    let any = false;
    for (let j = 0; j < M; j++) {
      const o = offs[j]!;
      const hit = deltaE(base.lab[i]![j]!, corr(cur.lab[i]![j]!)) >= p.dEThresh.lip;
      if (o <= off + p.tol.lipIn) { inN++; if (hit) inHit++; }
      else if (o > off + p.tol.lipOut) { const a = out[half[i]!]; a.n++; if (hit) a.hit++; }
      if (hit) any = true;
    }
    const s = sideRows[side[i]!];
    s.n++;
    if (any) { rowsHit++; s.hit++; }
  }
  const ratio = (a: { n: number; hit: number }): number => (a.n ? a.hit / a.n : 0);
  const coverage = inN ? inHit / inN : 0, overU = ratio(out.upper), overL = ratio(out.lower);
  const present = rowsHit >= N * 0.3;
  const codes: DiagCode[] = [];
  const metrics = { coverage, overU, overL };
  if (!present) return { present, score: null, codes, lrIndex: null, metrics };
  if (overL > 0.3) codes.push("LIP_OUT_LOWER");
  if (overU > 0.3) codes.push("LIP_OUT_UPPER");
  if (coverage < 0.5) codes.push("LIP_UNDER");
  if (Math.abs(ratio(sideRows.R) - ratio(sideRows.L)) > 0.35) codes.push("LIP_LR_DIFF");
  return { present, score: scoreForm({ coverage, overflow: (overU + overL) / 2 }), codes, lrIndex: null, metrics };
}

// ---------- 강도 부위 (구현 정의서 5b-2) ----------

/** 부위 평균 ΔE − 참조(인접 비화장 피부) ΔE → 세션 안 지수 0~100 */
export function intensityIndex(partBase: Lab, partCur: Lab, refBase: Lab, refCur: Lab, corr: LightCorr, p: ScoreParams = PARAMS): { delta: number; index: number } {
  const delta = deltaE(partBase, corr(partCur)) - deltaE(refBase, corr(refCur));
  return { delta, index: clamp((delta / p.dEMaxSession) * 100, 0, 100) };
}

/** 피부 대비 톤 차이 (ΔL 을 toneDiv 로 나눈 단계) */
export function toneDelta(partBase: Lab, partCur: Lab, adjBase: Lab, adjCur: Lab, corr: LightCorr, p: ScoreParams = PARAMS): number {
  const now = corr(partCur).L - corr(adjCur).L, bare = partBase.L - adjBase.L;
  return (now - bare) / p.toneDiv;
}

export type ToneVerdict = "TONE_OVER" | "TONE_UNDER" | "TONE_OK";

export function toneVerdict(index: number, band: Band | null): ToneVerdict | null {
  if (!band) return null;
  if (index > band[1]) return "TONE_OVER";
  if (index < band[0]) return "TONE_UNDER";
  return "TONE_OK";
}

/** 볼터치·섀도우 점수: 밴드 안 100, 초과·미달 비례 감점, 좌우 차 감점. 밴드 없으면 null */
export function scoreIntensity(idxL: number, idxR: number, band: Band | null): number | null {
  if (!band) return null;
  const mean = (idxL + idxR) / 2;
  const out = mean > band[1] ? mean - band[1] : mean < band[0] ? band[0] - mean : 0;
  return Math.round(clamp(100 - out * 1.5 - Math.abs(idxL - idxR) * 0.8, 0, 100));
}

export interface IntensityInput {
  L: { index: number };
  R: { index: number };
  present: boolean;
  /** 섀도우: 눈꼬리 쪽이 더 진한가 */
  directionOk?: boolean;
  /** 룩 템플릿의 목표 밴드. 안 주면 PARAMS.band, null 이면 기준 없음(확인만) */
  band?: Band | null;
  /** 쉐딩 화면의 하이라이트 영역 좌우 지수. 점수에는 안 들어가고 좌우 차 한 줄만 낸다 */
  hi?: { L: { index: number }; R: { index: number } };
}

export interface IntensityScore extends PartScore {
  verdict: ToneVerdict | null;
}

export function intensityResult(partId: IntensityPartId, input: IntensityInput, p: ScoreParams = PARAMS): IntensityScore {
  const { L, R, present, directionOk = true } = input;
  const band = input.band === undefined ? (p.band[partId] ?? null) : input.band;
  const codes: DiagCode[] = [];
  const lrDiff = R.index - L.index, lrIndex = { left: L.index, right: R.index };
  if (partId === "contour") {
    // 쉐딩·하이라이트는 점수 없이 좌우 차만 알려 준다 (F-09 확인만). 하이라이트도 같은 규칙, 같은 임계
    if (Math.abs(lrDiff) >= 10) codes.push(lrDiff > 0 ? "CONTOUR_LR_R" : "CONTOUR_LR_L");
    const metrics: PartResult["metrics"] = {};
    if (input.hi) {
      const hiDiff = input.hi.R.index - input.hi.L.index;
      if (Math.abs(hiDiff) >= 10) codes.push(hiDiff > 0 ? "CONTOUR_HI_R" : "CONTOUR_HI_L");
      metrics.hiIndex = { left: input.hi.L.index, right: input.hi.R.index };
    }
    return { present, score: null, codes, lrIndex, verdict: null, metrics };
  }
  if (!present) return { present, score: null, codes, lrIndex, verdict: null, metrics: {} };
  const verdict = toneVerdict((L.index + R.index) / 2, band);
  if (Math.abs(lrDiff) >= 12) {
    if (partId === "cheek") codes.push(lrDiff > 0 ? "CHEEK_LR_DIFF_R" : "CHEEK_LR_DIFF_L");
    else codes.push(lrDiff > 0 ? "SHADOW_LR_DIFF_R" : "SHADOW_LR_DIFF_L");
  }
  if (partId === "shadow" && !directionOk) codes.push("SHADOW_DIR");
  if (verdict && verdict !== "TONE_OK") codes.push(verdict);
  return { present, score: scoreIntensity(L.index, R.index, band), codes, lrIndex, verdict, metrics: { band } };
}

// ---------- 상태·한 줄 평 ----------

export interface DecideContext {
  /** 확인받기 프레임에서 얼굴을 못 찾음 */
  noFace?: boolean;
  /** 이마 L* 변화량 (현재 − 기준) */
  lightShift?: number;
  /** 기준 얼굴에 맞춘 정렬 잔차 (안정 점 평균 거리 ÷ 눈 폭). 고개·표정이 달라 틀이 안 맞으면 커진다 */
  alignResidual?: number;
  /** 부위가 머리카락에 가린 비율 (0~1, 두 사진·좌우 중 큰 쪽). 머리카락 마스크가 있을 때만 */
  hairFrac?: number;
  /** 템플릿 색을 이 사람 맨얼굴 그 부위에 발랐을 때 예상 색 차이 (templateContrast). 템플릿 색을 줬을 때만 */
  templateDeltaE?: number;
}

/** 부위 검출 기준 — 형태 부위는 ΔE 임계, 강도 부위는 유무 임계 */
function presenceThreshold(partId: PartId, p: ScoreParams): number | null {
  if (partId === "liner" || partId === "brow" || partId === "lip") return p.dEThresh[partId];
  if (partId === "shadow" || partId === "cheek") return p.tPresent[partId];
  return null;
}

/**
 * 템플릿 색을 이 피부에 발랐을 때 예상되는 색 차이 — 피부와 색 차이 × 발리는 비율(subtleCover).
 * 템플릿 진하기(alpha)는 쓰지 않는다: 화면에 그릴 때의 투명도라 사람이 바르는 양과 다르다
 */
export function templateContrast(skin: Lab, color: readonly [number, number, number], p: ScoreParams = PARAMS): number {
  return p.subtleCover * deltaE(skin, rgbToLab(color[0], color[1], color[2]));
}

export interface Decision {
  status: "scored" | "check_only";
  reason: CheckReason | null;
  score: number | null;
}

/** 채점 결과 → 점수를 줄지, 확인만 할지. 재지 못했으면 점수를 지어내지 않고 이유를 단다 */
export function decide(partId: PartId, res: Pick<PartScore, "present" | "score">, ctx: DecideContext = {}, p: ScoreParams = PARAMS): Decision {
  const checkOnly = (reason: CheckReason): Decision => ({ status: "check_only", reason, score: null });
  if (ctx.noFace) return checkOnly("align");
  if (ctx.alignResidual !== undefined && ctx.alignResidual > p.alignMax) return checkOnly("align");
  if (partId === "contour") return checkOnly("contour");
  // 색이 피부와 가까운 화장 — 무엇을 그렸든 사진으로는 못 가른다. 다시 찍어도 같으니 가림·조명보다 먼저 (결정 2026-09-30)
  const need = presenceThreshold(partId, p);
  if (typeof ctx.templateDeltaE === "number" && need !== null && ctx.templateDeltaE < need) return checkOnly("subtle");
  // 가림 (#155 — 손·머리카락 무엇이든)
  if (typeof ctx.hairFrac === "number" && ctx.hairFrac > p.hairMax) return checkOnly("occluded");
  if (typeof ctx.lightShift === "number" && Math.abs(ctx.lightShift) > p.lightTol) return checkOnly("lighting");
  if (!res.present) return checkOnly("faint");
  if (res.score == null) return checkOnly("no_band");
  return { status: "scored", reason: null, score: res.score };
}

/** 한 줄 평: 숫자 없이. 코드 순서대로 최대 두 문장 */
export function oneLiner(partId: PartId, decision: Decision, codes: readonly string[] = []): string {
  const texts = codes.map(diagText).filter((t): t is string => !!t);
  if (partId === "contour") return [CHECK_REASON_TEXT.contour, ...texts.slice(0, 2)].join(" ");   // 쉐딩 한 줄 + 하이라이트 한 줄까지
  if (decision.status === "check_only") return CHECK_REASON_TEXT[decision.reason ?? "faint"];
  if (!texts.length) return "잘 됐어요";
  return texts.slice(0, 2).join(". ");
}

export function hasDigit(s: string): boolean {
  return /\d/.test(s);
}

/** 채점 결과 → 세션에 넣을 모양. flow.ts applyResult(session, partId, toOutcome(...)) 로 쓴다 */
export function toOutcome(partId: PartId, res: PartScore, ctx: DecideContext = {}, p: ScoreParams = PARAMS): ScoreOutcome {
  const d = decide(partId, res, ctx, p);
  return {
    decision: d.status,
    score: d.score,
    diagnosisCodes: [...res.codes],
    diagnosis: oneLiner(partId, d, res.codes),
    checkReason: d.reason,
    lrIndex: res.lrIndex,
    // 판정 근거도 같이 — 화면 5 ?tune·로그에서 "왜 확인만인지" 를 숫자로 본다 (2026-09-30 폰 시험: 밝기 차 원인 가리기)
    metrics: {
      ...res.metrics,
      ...(ctx.lightShift !== undefined ? { lightShift: ctx.lightShift } : {}),
      ...(ctx.hairFrac !== undefined ? { hairFrac: ctx.hairFrac } : {}),
      ...(ctx.alignResidual !== undefined ? { alignResidual: ctx.alignResidual } : {}),
    },
  };
}

// ---------- 랜드마크 정렬 (구현 정의서 5-2: 각 프레임을 Baseline 좌표계로) ----------

/**
 * 화장·입·턱에 영향받지 않는 안정 점: 눈 안팎 끝, 콧대·코끝, 이마, 광대.
 * 얼굴 옆(234·454·127·356)과 턱(152)은 입을 벌리면 메시가 같이 벌어져 유사변환을 흔든다 — 실기기에서 확인, 제외.
 * 목록은 landmarks.RIGID_IDS 하나 — 화면 4 게이트도 같은 점을 쓴다 (#28)
 */
export const STABLE_IDS = RIGID_IDS;

export interface SimilarityFit {
  /** 배율 */
  s: number;
  /** 회전 (도) */
  deg: number;
  apply: (p: Pt) => Pt;
  /** 맞춘 뒤 남은 평균 거리 (px) */
  residual: number;
}

/** 2D 유사변환(크기·회전·이동) 최소제곱: src → dst */
export function similarityFit(src: readonly Pt[], dst: readonly Pt[]): SimilarityFit {
  const n = Math.min(src.length, dst.length);
  let mx = 0, my = 0, ux = 0, uy = 0;
  for (let i = 0; i < n; i++) { mx += src[i]!.x; my += src[i]!.y; ux += dst[i]!.x; uy += dst[i]!.y; }
  if (n) { mx /= n; my /= n; ux /= n; uy /= n; }
  let a = 0, b = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i]!.x - mx, sy = src[i]!.y - my, dx = dst[i]!.x - ux, dy = dst[i]!.y - uy;
    a += sx * dx + sy * dy; b += sx * dy - sy * dx; v += sx * sx + sy * sy;
  }
  const cr = v ? a / v : 1, ci = v ? b / v : 0;
  const apply = (p: Pt): Pt => {
    const q: Pt = { x: cr * (p.x - mx) - ci * (p.y - my) + ux, y: ci * (p.x - mx) + cr * (p.y - my) + uy };
    if (p.z !== undefined) q.z = p.z;
    return q;
  };
  let res = 0;
  for (let i = 0; i < n; i++) { const q = apply(src[i]!); res += Math.hypot(q.x - dst[i]!.x, q.y - dst[i]!.y); }
  return { s: Math.hypot(cr, ci), deg: (Math.atan2(ci, cr) * 180) / Math.PI, apply, residual: n ? res / n : 0 };
}

const pick = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음 (${lm.length}점)`);
  return p;
};

/** 기준(쌩얼) 랜드마크를 현재 프레임으로 옮긴다. 화장 부위 랜드마크는 재검출값을 쓰지 않는다 (화장에 따른 편향 차단) */
export function alignToBaseline(baseLm: readonly Pt[], curLm: readonly Pt[]): { lm: Pt[]; fit: SimilarityFit } {
  const fit = similarityFit(STABLE_IDS.map((i) => pick(baseLm, i)), STABLE_IDS.map((i) => pick(curLm, i)));
  return { lm: baseLm.map(fit.apply), fit };
}

/** 화장으로 인한 랜드마크 이동량(px 평균): 재검출값 vs 정렬값, 화장 부위 점만 */
export function makeupBiasPx(alignedLm: readonly Pt[], curLm: readonly Pt[], ids: readonly number[]): number {
  if (!ids.length) return 0;
  return ids.reduce((s, i) => s + Math.hypot(pick(alignedLm, i).x - pick(curLm, i).x, pick(alignedLm, i).y - pick(curLm, i).y), 0) / ids.length;
}
