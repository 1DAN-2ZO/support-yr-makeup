/**
 * 모듈 간 데이터 계약 (work-split-modules-v6.md §2).
 * 서버 쪽 짝은 server/app/schemas.py — 필드를 바꾸면 같은 PR에서 양쪽을 바꾼다.
 * 길이는 전부 비율 단위(눈 폭·입술 폭·얼굴 폭 기준). mm는 표시용 환산에만.
 */

export type PartId = "brow" | "liner" | "shadow" | "lip" | "cheek" | "contour";
export const LOOK_PART_IDS = ["brow", "liner", "shadow", "lip", "cheek"] as const satisfies readonly PartId[];
export const PART_IDS = [...LOOK_PART_IDS, "contour"] as const satisfies readonly PartId[];

export type PartStatus = "not_started" | "in_progress" | "check_only" | "passed" | "skipped";
export type FaceShapeLabel = "oval" | "round" | "square" | "oblong" | "heart";

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

/** ① 촬영·기준 → ②③⑤⑥ */
export interface Baseline {
  /** MediaPipe 478점, px */
  lm: Pt[];
  /** 비율 척도 기준 길이(px): 눈 폭 평균·입술 폭·얼굴 폭 */
  unit: { eye: number; lip: number; face: number };
  /** 이마 비화장 영역 L* */
  foreheadL: number;
  /** 눈 흰자 a*, b* 참조 (색 보정용). 미구현이면 null */
  scleraLab: { a: number; b: number } | null;
  faceShape: FaceShape;
  /** 쌩얼 사진 (비교·완성본용). 세션 끝까지 폰에만 */
  bareImage: Blob | ImageBitmap | null;
  w: number;
  h: number;
}

/** ⑤ 모델 → ② 가이드 */
export interface FaceShape {
  label: FaceShapeLabel;
  confidence: number;
  method: "rule" | "model";
  version: string;
}

/** ⑥ 콘텐츠 → ②③④ */
export interface LookTemplate {
  id: string;
  name: string;
  version: string;
  parts: Partial<Record<Exclude<PartId, "contour">, Record<string, number | string>>>;
  products: string[];
  rationale: Partial<Record<Exclude<PartId, "contour">, string>>;
  /** 볼·입술 색 조화 허용 범위 (Lab a*b* 거리). null이면 조화 보정 미적용 */
  harmonyRange: { maxDeltaAb: number } | null;
  partIds: readonly Exclude<PartId, "contour">[];
  weights: Partial<Record<Exclude<PartId, "contour">, number>>;
}

/** ② 가이드 → ③⑥. 좌표는 기준(쌩얼) 좌표계 */
export interface GuideSet {
  partId: PartId;
  polys: Pt[][];
  lines: Pt[][];
  labels: { at: Pt; text: string }[];
  unit: Baseline["unit"];
}

/** ② 게이트 → ①⑥ */
export type GateFail =
  | "face"
  | "angle"
  | "eyes"
  | "size"
  | "sharp"
  | "bright"
  | "color"
  | "hand"
  | "visible"
  | "pose_diff"
  | "expr_diff"
  | "stable";

export interface GateResult {
  ok: boolean;
  firstFail: GateFail | null;
  /** 숫자 없는 한 줄 */
  text: string;
  stableCount: number;
}

/** ② 확인받기 → ③. 지금 POC는 1장, 계약은 3~5장 */
export interface CaptureBundle {
  frames: ImageBitmap[];
  pts: Pt[][];
  handOverlap: (boolean | null)[];
  foreheadL: number[];
}

/** no_band: 룩 템플릿에 진하기 목표 밴드가 없어 강도 부위 점수를 못 낸다 */
export type CheckReason = "faint" | "lighting" | "align" | "hand" | "no_baseline" | "no_band" | "contour";

/** ③ 채점 → ⑥ */
export interface PartResult {
  partId: PartId;
  status: PartStatus;
  score: number | null;
  diagnosisCodes: string[];
  diagnosis: string;
  checkReason: CheckReason | null;
  lrIndex: { left: number; right: number } | null;
  metrics: {
    lrDiff?: number;
    colorAb?: { a: number; b: number };
    alignResidual?: number;
    [k: string]: unknown;
  };
  attempts: number;
  updatedAt: number;
}

/** ③ 합산 → ⑥ */
export interface SessionSummary {
  total: number | null;
  base: number | null;
  measuredCount: number;
  partCount: number;
  symmetryPenalty: number;
  harmonyPenalty: number;
  harmonyApplied: boolean;
  computedAt: number;
}

/** ④ 서버 → ⑥②. server/app/schemas.py LookJob과 1:1 */
export type JobStatus = "queued" | "waiting_long" | "running" | "done" | "fallback" | "error";

export interface LookJob {
  job_id: string;
  look_id: string;
  status: JobStatus;
  result_url: string | null;
  layer: { mesh: string; url: string } | null;
  identity: { cos: number | null };
  ms: number | null;
  queue_ms: number | null;
  error: string | null;
  ver: Versions;
}

/** 버전 5종 (ai-pipeline-v6.md 3절). Event.ver·LookJob.ver·결과 카드에 같이 찍힌다 */
export interface Versions {
  app: string;
  score: string;
  look: string;
  faceshape: string;
  transfer: string;
}

/** 전 모듈 → ⑥ 로그. 사진·좌표·얼굴 데이터 금지, 숫자 요약만 */
export type EventName =
  | "screen_enter"
  | "screen_leave"
  | "button"
  | "consent"
  | "capture"
  | "gate_fail"
  | "landmark_lost"
  | "part_status"
  | "score"
  | "look_job"
  | "vlm_plan"
  | "restore"
  | "session_end"
  | "error";

export interface EventBase {
  sid: string;
  t: number;
  screen: string;
  part: PartId | null;
  ver: Versions;
}

export type EventFields =
  | { name: "screen_enter" | "screen_leave"; screen: string }
  | { name: "button"; button: string }
  | { name: "consent"; ok: boolean }
  | { name: "capture"; shot: string; ok: boolean; retry: number; reason: GateFail | null }
  | { name: "gate_fail"; first_fail: GateFail }
  | { name: "landmark_lost"; ms: number }
  | { name: "part_status"; part: PartId; from: PartStatus; to: PartStatus; score: number | null }
  | { name: "score"; part: PartId; status: PartStatus; check_reason: CheckReason | null; ms: number }
  | { name: "look_job"; look_id: string; ms: number | null; identity_cos: number | null; error: string | null }
  /**
   * 개인화 한 번 (2026-09-29): VLM 에 몇 번 물었나, 첫 답에서 거절된 수, 마지막까지 남은 거절 수(규칙값으로 대신한 항목), 실패 이유.
   * fail: null 성공 · "retry_failed" 다시 묻다 실패해 첫 답을 씀 · "restored_rule" 앱을 다시 켜 규칙 계획을 씀 · 그 밖 VlmFailure 이유
   */
  | { name: "vlm_plan"; look_id: string; ms: number; tries: number; first_rejected: number; left_rejected: number; model: string | null; fail: string | null }
  | { name: "restore"; ok: boolean; had_images: boolean }
  | { name: "session_end"; reason: "finish" | "abandon" | "error"; last_screen: string }
  | { name: "error"; where: string; msg: string };

export type Event = EventBase & EventFields;
