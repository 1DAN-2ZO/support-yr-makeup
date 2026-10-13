/**
 * 전체 흐름 — 순수 로직 (화면 순서, 촬영 2장 게이트, 세션, 화면 6 변환).
 * poc/full/lib/flow.js 를 계약 타입(types.ts)에 맞춰 옮긴 것. DOM·카메라를 쓰지 않는다.
 *
 * 모듈 ① 촬영·기준이 주인이고 ②③⑥이 받아 쓴다 (work-split-modules-v6.md §2).
 *  - shotGate(): 촬영 조건. 안 맞는 것 하나만 한 줄, 숫자 없음
 *  - createSession() 이하: 세션 상태 전이. 전부 새 객체를 돌려준다 (불변)
 *  - stripImages(): draft 저장용 (이미지 제외)
 */

import type { Baseline, FaceShape, GateFail, GateResult, PartId, PartResult, PartStatus } from "./types";
import { LOOK_PART_IDS, PART_IDS } from "./types";
import type { PersonalPlan } from "./personalize";

// ---------- 화면 순서 ----------

/**
 * 화면 이름 전부. 진행 순서는 core/screens.ts 의 SCREEN_ORDER (2026-10-06 새 흐름).
 * processing ~ review 는 옛 흐름 화면 — 새 흐름에서 빠졌지만 코드는 남아 있다 (screens.inNewFlow 가 새 화면으로 돌린다)
 */
export const SCREENS = [
  "consent",
  "denied",
  "capture",
  "processing",
  "looks",
  "fullrender",
  "guide",
  "live",
  "result",
  "review",
  "done",
  // 새 흐름 (2026-10-06) — docs/service-definition-v6.md
  "answer",
  // 화장 템플릿 고르기 (#420) — 참고 사진을 올리는 대신 준비한 10종에서 고른다
  "partguide",
  "attempt",
  "feedback",
  "save",
] as const;
export type ScreenId = (typeof SCREENS)[number];

export const SCREEN_NAME: Record<ScreenId, string> = {
  consent: "1 동의",
  denied: "이용 불가",
  capture: "1 촬영",
  processing: "서버 처리 (옛 흐름)",
  looks: "2 화장 (옛 흐름)",
  fullrender: "2-b 전체 완성 예상 (옛 흐름)",
  guide: "3 완성본 (옛 흐름)",
  live: "4 실시간 가이드",
  result: "5 결과 (옛 흐름)",
  review: "6 전체 리뷰 (옛 흐름)",
  done: "끝",
  answer: "2·3 참고 사진 · 정답사진",
  partguide: "4 부위 가이드",
  attempt: "5 시도사진",
  feedback: "6 피드백",
  save: "7 저장 · 공유",
};

/** 부위 순서 = 룩 5부위 + 쉐딩·하이라이트(고정 마지막) */
export const PART_ORDER: readonly PartId[] = PART_IDS;

// ---------- 화면 1: 촬영 1장 ----------
// 옆얼굴 45° 두 장은 뺐다 (2026-10-07, 새 흐름) — 쓰던 곳(서버 법선 정밀화 · 2-b AR)이 없어졌다
// 눈 감은 장도 뺐다 (2026-10-09, #386) — 찍기만 하고 쓰는 곳이 없었다: 예상 메이크업(정답사진) · 부위 가이드 · 피드백이
// 전부 눈 뜬 장만 읽는다. 눈을 감고 소리에 기대어 찍는 단계라 실패하기도 쉬웠다

export type ShotId = "front_open";

export interface ShotSpec {
  id: ShotId;
  name: string;
  /** 허용 yaw 범위 (도). 화면 기준 왼쪽 회전이 음수 */
  yaw: readonly [number, number];
  /** 눈 감은 장은 2026-10-09 뺐다 (#386) — 지금은 뜬 장만 찍는다 */
  eyes: "open";
}

export const SHOTS: readonly ShotSpec[] = [
  { id: "front_open", name: "정면 · 눈 뜸", yaw: [-10, 10], eyes: "open" },
];

/**
 * 동의 뒤, 카메라를 켜기 전에 보여 주는 촬영 안내 (F-01).
 * 이마는 조명 참조(이마 L*·a*b*)와 얼굴 잘림 판정에, 귀까지 보이는 얼굴 윤곽은 45° 장·얼굴형·쉐딩에 쓴다.
 * 머리카락·안경이 가리면 그 값이 틀어지므로 찍기 전에 한 번 알려 준다 (안경은 처음부터 쓰고 있어 이마 급변으로 못 잡는다). 숫자 없이.
 */
export const CAPTURE_GUIDE = {
  title: "찍기 전에 확인해 주세요",
  lines: [
    "앞머리를 넘겨서 이마가 다 보이게 해 주세요",
    "머리카락을 귀 뒤로 넘겨서 양쪽 귀가 다 보이게 해 주세요",
    "안경을 쓰셨다면 벗어 주세요",
  ],
  button: "확인했어요",
} as const;

/** 촬영 조건 한계. 화면 4 게이트(gate.ts, 1-9)와 값을 맞춘다 */
export interface CaptureLimits {
  pitch: number;
  /**
   * 얼굴 상자를 96px 폭으로 줄인 라플라시안 분산의 하한. 2026-09-22 흔들기 실측으로 30 → 150:
   * Android 가만히 최소 241 · 흔들기 하위 10% 101, iPhone 은 흔들어도 최소 480 (1-2 문제 12)
   */
  sharpMin: number;
  /** 첫 장 대비 이마 L* 허용 차 */
  brightTol: number;
  /**
   * 이마 L* 절대 범위 — 첫 장부터 너무 어둡거나 밝으면 막는다 (impl-screen1-5 1-2 "이마 L* 40~85", 가정값 → 1-4 로 확정).
   * 2026-09-22 iPhone 이 L* 9~23 인 방에서 전부 찍혀서 넣었다
   */
  brightMin: number;
  brightMax: number;
  /**
   * 눈 폭(눈 안쪽 끝~바깥 끝) 하한 px — 얼굴 크기 조건 (impl-screen1-5 1-2 "눈 폭 ≥ 80px", 비율 척도 정밀도).
   * 홍채 척도는 쓰지 않는다 (2026-09-16 결정: 개인차·눈 감음·떨림)
   */
  eyeMinPx: number;
  /** 이마 a*·b* 가 첫 장 대비 이만큼 넘게 돌면 "조명 색이 바뀜" (1-9). 임계는 1-4 실측으로 확정, 지금은 가정값 */
  colorTol: number;
  stableFrames: number;
}
export const CAPTURE_LIMITS: CaptureLimits = { pitch: 10, sharpMin: 150, brightTol: 12, brightMin: 40, brightMax: 85, eyeMinPx: 80, colorTol: 6, stableFrames: 5 };

/** 촬영 조건 문구. 숫자 없이 한 줄 (기능 정의서 F-01) */
export const SHOT_TEXT = {
  none: "",
  cut: "얼굴이 잘려요. 얼굴 전체가 보이게 해 주세요",
  occluded: "얼굴을 가리지 말아 주세요",
  bangs: "앞머리를 넘겨서 이마가 보이게 해 주세요",
  front: "조금만 정면으로",
  open: "눈을 떠 주세요",
  near: "조금 더 가까이",
  far: "조금 멀리",
  sharp: "흔들려요. 잠시 멈춰 주세요",
  bright_low: "조금 더 밝은 곳으로",
  bright_high: "너무 밝아요. 조금 어두운 곳으로",
  color: "조명 색이 바뀌었어요. 처음 자리에서 찍어 주세요",
  stable: "잠시만 그대로",
  ready: "찍을게요",
} as const;
type ShotTextKey = keyof typeof SHOT_TEXT;

/** 프레임에서 잰 값. 없는 항목(undefined)은 그 조건을 건너뛴다 */
export interface ShotMeasure {
  faceDetected: boolean;
  yaw: number;
  pitch: number;
  /** 왼눈·오른눈 감음 */
  closedA: boolean;
  closedB: boolean;
  /** 얼굴 폭 / 프레임 폭 */
  faceRatio?: number;
  /** 랜드마크 전체가 프레임 가장자리에서 얼마나 떨어져 있나 (짧은 변 대비 비율, 밖이면 음수). 없으면 조건 생략 */
  faceInset?: number;
  /** 이마가 갑자기 크게 변해 가림으로 본다 (occlusion.ts foreheadStep, 2026-09-23 #144). 없으면 조건 생략 */
  foreheadOccluded?: boolean;
  /** 얼굴은 잡혔는데 이마 대부분이 머리카락이라 이마 피부를 못 잰다 (color.foreheadLab null, 2026-09-30). 조명 기준을 몰라서 안 찍는다 */
  foreheadHidden?: boolean;
  /** 눈 폭 px — 두 눈 중 큰 쪽. 없으면 조건 생략 */
  eyeWidthPx?: number;
  /** 라플라시안 분산 */
  sharpness?: number;
  /** 이마 L* (지금 프레임) */
  foreheadL?: number;
  /** 첫 장에서 잡은 이마 L*. 없으면 밝기 조건 생략 */
  baselineL?: number;
  /** 이마 a*·b* (지금 프레임) 와 첫 장 값. 둘 다 있을 때만 색 조건 (1-9) */
  foreheadAb?: { a: number; b: number };
  baselineAb?: { a: number; b: number };
  stableCount?: number;
}

/**
 * 얼굴 크기 허용 범위 (얼굴 폭 / 프레임 **짧은 변**). 폰 세로는 짧은 변 = 폭이라 그대로.
 * 2026-09-23 iPad 가로(1920×1080)에서 긴 변으로 나눠 정면도 0.28 에 걸쳐서 짧은 변으로 나눈다
 */
export const FACE_RATIO = { min: 0.28, max: 0.75 } as const;
/** 얼굴 전체가 프레임 안에 있어야 하는 최소 여백 (짧은 변의 3%). 2026-09-21 폰 실측: 턱·이마가 잘린 장이 통과해서 추가 */
export const FACE_INSET_MIN = 0.03;

/**
 * 촬영 조건: 안 맞는 것 하나만 한 줄.
 * 순서: 얼굴 → 잘림 → 가림(이마 급변) → 각도 → 눈 상태 → 얼굴 크기 → 선명 → 밝기 → 색 → 안정 (F-01 "촬영 조건 안내" + 1-9 색 조건 + 잘림 조건 2026-09-21)
 */
export function shotGate(shotId: ShotId, m: ShotMeasure, limits: CaptureLimits = CAPTURE_LIMITS): GateResult {
  const shot = SHOTS.find((s) => s.id === shotId);
  if (!shot) throw new Error(`알 수 없는 촬영 장: ${shotId}`);
  const stableCount = m.stableCount ?? 0;
  const fail = (firstFail: GateFail, key: ShotTextKey): GateResult => ({ ok: false, firstFail, text: SHOT_TEXT[key], stableCount });

  if (!m.faceDetected) return fail("face", "none");
  // 깨진 측정값(NaN·Infinity)은 비교가 전부 false 라 모든 조건을 통과해 버린다 → 얼굴을 못 잰 것으로 본다.
  // 랜드마크 yaw 는 얼굴 폭으로 나누므로 점이 겹치면 NaN 이 나온다 (1-1 재검증 2026-09-22)
  if (!measureFinite(m)) return fail("face", "none");
  if (typeof m.faceInset === "number" && m.faceInset < FACE_INSET_MIN) return fail("visible", "cut");
  // 가림 (2026-09-23 #144): 이마 급변. 손 검출 모델 없이 손·머리카락·브러시·마스크를 한 조건으로. 무엇인지는 모른다 → "visible"
  if (m.foreheadOccluded) return fail("visible", "occluded");
  if (m.foreheadHidden) return fail("visible", "bangs");
  if (m.yaw < shot.yaw[0] || m.yaw > shot.yaw[1]) return fail("angle", "front");
  if (Math.abs(m.pitch) > limits.pitch + 5) return fail("angle", "front");
  const open = !m.closedA && !m.closedB;
  if (!open) return fail("eyes", "open");
  if (typeof m.faceRatio === "number") {
    if (m.faceRatio < FACE_RATIO.min) return fail("size", "near");
    if (m.faceRatio > FACE_RATIO.max) return fail("size", "far");
  }
  if (typeof m.eyeWidthPx === "number" && m.eyeWidthPx < limits.eyeMinPx) return fail("size", "near");
  if (typeof m.sharpness === "number" && m.sharpness < limits.sharpMin) return fail("sharp", "sharp");
  if (typeof m.foreheadL === "number" && m.foreheadL < limits.brightMin) return fail("bright", "bright_low");
  if (typeof m.foreheadL === "number" && m.foreheadL > limits.brightMax) return fail("bright", "bright_high");
  if (typeof m.baselineL === "number" && typeof m.foreheadL === "number") {
    const d = m.foreheadL - m.baselineL;
    if (d < -limits.brightTol) return fail("bright", "bright_low");
    if (d > limits.brightTol) return fail("bright", "bright_high");
  }
  if (m.foreheadAb && m.baselineAb) {
    const dab = Math.hypot(m.foreheadAb.a - m.baselineAb.a, m.foreheadAb.b - m.baselineAb.b);
    if (dab > limits.colorTol) return fail("color", "color");
  }
  if (stableCount < limits.stableFrames) return fail("stable", "stable");
  return { ok: true, firstFail: null, text: SHOT_TEXT.ready, stableCount };
}

/** 들어온 숫자가 전부 유한한가. 없는 항목(undefined)은 건너뛴다 */
function measureFinite(m: ShotMeasure): boolean {
  const nums = [m.yaw, m.pitch, m.faceRatio, m.faceInset, m.eyeWidthPx, m.sharpness, m.foreheadL, m.baselineL, m.stableCount,
    m.foreheadAb?.a, m.foreheadAb?.b, m.baselineAb?.a, m.baselineAb?.b];
  return nums.every((v) => v === undefined || Number.isFinite(v));
}

// ---------- 얼굴형 판단용 정면 프레임 (2026-09-22 추가) ----------

/**
 * 첫 장(정면 눈 뜸)을 찍을 때 **사용자 모르게** 앞뒤 프레임 count 장을 같이 저장해 ⑤ 얼굴형 분류(사진 입력 CNN)에 넘긴다.
 * 따로 찍는 단계·안내 문구는 없다.
 *  - 셔터 전: 정면 조건을 통과하는 프레임을 minGapMs 간격으로 모으되 최근 count 장만 남긴다 (오래된 것부터 버림)
 *  - 셔터 순간 count 장이 차 있으면 끝. 모자라면 셔터 뒤 afterShotMs 동안만 더 모으고 끝 (모은 만큼)
 * 사진은 기기 메모리에만 두고 draft 에는 장수만 남긴다.
 */
export const FACE_SHAPE_BURST = { count: 5, minGapMs: 150, afterShotMs: 1500 } as const;

export interface BurstState {
  /** 남아 있는 프레임을 찍은 시각들 (오래된 것부터) */
  taken: readonly number[];
  /** 첫 장 셔터 시각. null 이면 아직 셔터 전 */
  shotAt: number | null;
  done: boolean;
}

export function startBurst(): BurstState {
  return { taken: [], shotAt: null, done: false };
}

/**
 * 프레임마다 부른다. gateOk = 이 프레임이 정면 눈 뜸 조건을 통과했나 (안정 프레임 수는 빼고).
 * take 면 이 프레임을 저장하고, dropOldest 면 저장해 둔 것 중 가장 오래된 한 장을 버린다.
 */
export function burstStep(
  b: BurstState, now: number, gateOk: boolean, opt = FACE_SHAPE_BURST,
): { state: BurstState; take: boolean; dropOldest: boolean } {
  const none = { take: false, dropOldest: false };
  if (b.done) return { state: b, ...none };
  if (b.shotAt !== null && now - b.shotAt >= opt.afterShotMs) return { state: { ...b, done: true }, ...none };
  const last = b.taken[b.taken.length - 1];
  if (!gateOk || (last !== undefined && now - last < opt.minGapMs)) return { state: b, ...none };
  let taken = [...b.taken, now];
  const dropOldest = b.shotAt === null && taken.length > opt.count;
  if (dropOldest) taken = taken.slice(1);
  return { state: { ...b, taken, done: b.shotAt !== null && taken.length >= opt.count }, take: true, dropOldest };
}

/** 첫 장 셔터가 눌린 순간. 이미 count 장이면 바로 끝 */
export function burstShot(b: BurstState, now: number, opt = FACE_SHAPE_BURST): BurstState {
  return { ...b, shotAt: now, done: b.taken.length >= opt.count };
}

/** 아직 안 찍은 첫 장. 틀린 장만 지우고 다시 부르면 그 장만 다시 찍는다 */
export function nextShot(shots: Partial<Record<ShotId, unknown>>): ShotId | null {
  return SHOTS.find((s) => !shots[s.id])?.id ?? null;
}

// ---------- 세션 ----------

/** 세션 안의 부위 상태. 계약 PartResult + 확인받기 사진(captured) */
export interface SessionPart extends PartResult {
  /** 확인받기 순간 사진. draft 에는 저장하지 않는다 */
  captured: unknown | null;
}

export interface Session {
  screen: ScreenId;
  consent: boolean;
  /** 찍은 장. 값은 화면이 정한다(캔버스·비트맵). draft 에서는 true/false 로 줄어든다 */
  shots: Partial<Record<ShotId, unknown>>;
  /** 얼굴형 판단용 정면 연속 사진 (FACE_SHAPE_BURST). draft 에서는 장수로 줄어든다 */
  faceShapeFrames: unknown[];
  baseline: Baseline | null;
  faceShape: FaceShape | null;
  lookId: string | null;
  currentPart: PartId | null;
  parts: SessionPart[];
  startedAt: number;
  /**
   * 화장(lookId)별 개인화 계획 (#181, 새 흐름 #179). VLM 이 매번 조금 달라서 다시 묻지 않고 저장본을 쓴다.
   * 숫자·짧은 문장뿐이라 draft 에 그대로 남는다. 기준 얼굴이 바뀌면(정면 다시 찍기) 비운다 — withBaseline
   */
  plans: Record<string, PersonalPlan>;
}

const SETTLED: readonly PartStatus[] = ["passed", "check_only", "skipped"];

export function createSession(now: () => number = Date.now): Session {
  return {
    screen: "consent",
    consent: false,
    shots: {},
    faceShapeFrames: [],
    baseline: null,
    faceShape: null,
    lookId: null,
    currentPart: null,
    parts: PART_ORDER.map((partId) => ({
      partId,
      status: "not_started",
      score: null,
      diagnosisCodes: [],
      diagnosis: "",
      checkReason: null,
      lrIndex: null,
      metrics: {},
      attempts: 0,
      updatedAt: 0,
      captured: null,
    })),
    startedAt: now(),
    plans: {},
  };
}

/**
 * 기준(Baseline) 바꾸기. **얼굴이 바뀌면**(정면을 다시 찍어 랜드마크가 달라지면) 앞 얼굴로 만든 개인화 계획을 비운다 (#181).
 * 같은 얼굴에 쌩얼 사진만 붙는 갱신(encode 뒤 bareImage)은 계획을 그대로 둔다
 */
export function withBaseline(s: Session, b: Baseline | null): Session {
  const sameFace = !!b && !!s.baseline && b.lm === s.baseline.lm;
  return { ...s, baseline: b, faceShape: b?.faceShape ?? null, plans: sameFace ? s.plans : {} };
}

/** 화장 하나의 개인화 계획 저장 (#181) */
export function setPlan(s: Session, lookId: string, plan: PersonalPlan): Session {
  return { ...s, plans: { ...s.plans, [lookId]: plan } };
}

export function setScreen(s: Session, screen: ScreenId): Session {
  return { ...s, screen };
}

/**
 * 진행 칩으로 부위 이동. 미시작이면 진행 중으로, 보던 부위를 결과 없이 떠나면 미시작으로.
 * 이미 결과가 난 부위는 되돌리지 않는다 (칩에서 점수가 사라지면 안 된다)
 */
export function setCurrentPart(s: Session, partId: PartId): Session {
  return {
    ...s,
    currentPart: partId,
    parts: s.parts.map((p) => {
      if (p.partId === partId) return p.status === "not_started" ? { ...p, status: "in_progress" } : p;
      if (p.status === "in_progress") return { ...p, status: "not_started" };
      return p;
    }),
  };
}

/** 채점(③)이 주는 결과. PartResult 에서 세션이 정하는 필드(status 일부·attempts·updatedAt)를 뺀 것 */
export type ScoreOutcome = Pick<PartResult, "score" | "diagnosisCodes" | "diagnosis" | "checkReason" | "lrIndex" | "metrics"> & {
  /** "scored" 면 점수 확정, "check_only" 면 점수 없이 확인만 */
  decision: "scored" | "check_only";
};

/**
 * 화면 5 "다음": 점수가 낮아도 passed. 확인만은 check_only. 쉐딩·하이라이트는 항상 확인만 (F-09).
 * 결과는 최신으로 덮어쓰고 attempts 를 올린다 (재확인)
 */
export function applyResult(s: Session, partId: PartId, r: ScoreOutcome, now: () => number = Date.now): Session {
  const status: PartStatus = partId === "contour" || r.decision === "check_only" ? "check_only" : "passed";
  return {
    ...s,
    parts: s.parts.map((p) =>
      p.partId === partId
        ? {
            ...p,
            status,
            score: status === "passed" ? r.score : null,
            diagnosisCodes: r.diagnosisCodes,
            diagnosis: r.diagnosis,
            checkReason: r.checkReason,
            lrIndex: r.lrIndex,
            metrics: r.metrics,
            attempts: p.attempts + 1,
            updatedAt: now(),
          }
        : p,
    ),
  };
}

/** 화면 5 "건너뛰기": 점수 미반영, 합산 제외 */
export function applySkip(s: Session, partId: PartId, now: () => number = Date.now): Session {
  return {
    ...s,
    parts: s.parts.map((p) => (p.partId === partId ? { ...p, status: "skipped", score: null, updatedAt: now() } : p)),
  };
}

/** after 다음으로 아직 안 끝난 부위. 없으면 null (→ 화면 6) */
export function nextPart(s: Session, after: PartId | null = s.currentPart): PartId | null {
  const i = after ? PART_ORDER.indexOf(after) : -1;
  return PART_ORDER.slice(i + 1).find((id) => !SETTLED.includes(partStatus(s, id))) ?? null;
}

export function allDone(s: Session): boolean {
  return s.parts.every((p) => SETTLED.includes(p.status));
}

function partStatus(s: Session, partId: PartId): PartStatus {
  const p = s.parts.find((x) => x.partId === partId);
  if (!p) throw new Error(`세션에 없는 부위: ${partId}`);
  return p.status;
}

/** 화면 6 합산 입력 (계약 PartResult[]). 사진(captured)은 뺀다 */
export function toReviewParts(s: Session): PartResult[] {
  return s.parts.map(({ captured: _captured, ...rest }) => rest);
}

// ---------- draft 저장 ----------

/** 세션 draft (이미지 제외). JSON 으로 그대로 저장·복원된다 */
export interface SessionDraft {
  screen: ScreenId;
  consent: boolean;
  shots: Partial<Record<ShotId, boolean>>;
  faceShapeFrames: number;
  /** w·h: 촬영 프레임 크기 — 복원 때 줄여 저장한 쌩얼 사진에서 찾은 랜드마크를 이 크기로 되돌린다 (restore.ts) */
  baseline: { foreheadL: number; unit: Baseline["unit"]; scleraLab: Baseline["scleraLab"]; faceShape: FaceShape; w: number; h: number } | null;
  faceShape: FaceShape | null;
  lookId: string | null;
  currentPart: PartId | null;
  parts: (PartResult & { captured: boolean })[];
  startedAt: number;
  /** 화장별 개인화 계획 — 얼굴 사진·점이 아니라 선택 값이라 draft 에 남긴다 (#181). 예전 draft 에는 없다 */
  plans?: Record<string, PersonalPlan>;
}

/** 세션 draft 저장용. 사진·랜드마크는 뺀다 (얼굴 데이터는 draft 에 남기지 않는다) */
export function stripImages(s: Session): SessionDraft {
  return {
    screen: s.screen,
    consent: s.consent,
    shots: Object.fromEntries(Object.entries(s.shots).map(([k, v]) => [k, !!v])) as Partial<Record<ShotId, boolean>>,
    faceShapeFrames: s.faceShapeFrames.length,
    baseline: s.baseline
      ? { foreheadL: s.baseline.foreheadL, unit: s.baseline.unit, scleraLab: s.baseline.scleraLab, faceShape: s.baseline.faceShape, w: s.baseline.w, h: s.baseline.h }
      : null,
    faceShape: s.faceShape,
    lookId: s.lookId,
    currentPart: s.currentPart,
    parts: s.parts.map(({ captured, ...rest }) => ({ ...rest, captured: !!captured })),
    startedAt: s.startedAt,
    plans: s.plans,
  };
}

export { LOOK_PART_IDS };
