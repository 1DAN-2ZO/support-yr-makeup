/**
 * 화면 순서·이름·방향 — 순수 함수. DOM 을 모른다.
 * 껍데기(shell.ts)와 각 모듈의 화면이 함께 쓴다.
 *
 * 화면 담당 (work-split-modules-v6.md §0-2):
 *   1 동의·촬영 ①  ·  2·2-b ⑥  ·  3·4 ②  ·  5·5-b ③  ·  6 ⑥  ·  껍데기 ⑥
 */

import type { PartId, PartStatus } from "./types";
import { PART_IDS } from "./types";

export type ScreenId =
  | "consent"
  | "denied"
  | "capture"
  | "processing"
  | "looks"
  | "fullrender"
  | "guide"
  | "live"
  | "result"
  | "review"
  | "done";

/** 기본 진행 순서. 진행 칩·뒤로가기는 이 순서를 따르지 않고 세션 상태를 본다 */
export const SCREEN_ORDER = [
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
] as const satisfies readonly ScreenId[];

export const SCREEN_NAME: Record<ScreenId, string> = {
  consent: "1 동의",
  denied: "이용 불가",
  capture: "1 촬영",
  processing: "서버 처리",
  looks: "2 룩",
  fullrender: "2-b 전체 완성 예상",
  guide: "3 완성본",
  live: "4 실시간 테두리",
  result: "5 결과",
  review: "6 전체 리뷰",
  done: "끝",
};

/** 어느 모듈이 그 화면을 만드는가. 껍데기가 "아직 안 붙음"을 표시할 때 쓴다 */
export const SCREEN_OWNER: Record<ScreenId, "capture" | "guide" | "score" | "app"> = {
  consent: "capture",
  denied: "capture",
  capture: "capture",
  processing: "app",
  looks: "app",
  fullrender: "app",
  guide: "guide",
  live: "guide",
  result: "score",
  review: "app",
  done: "app",
};

/** 부위 6개를 도는 화면 (진행 칩이 보인다) */
export const PART_SCREENS = ["guide", "live", "result"] as const satisfies readonly ScreenId[];

export function isPartScreen(s: ScreenId): boolean {
  return (PART_SCREENS as readonly ScreenId[]).includes(s);
}

// ---------- 화면 방향 (F-06) ----------

/** 눈썹·아이라이너·섀도우는 양쪽 눈을 한 화면에 담아야 해서 가로 */
const LANDSCAPE_PARTS: readonly PartId[] = ["brow", "liner", "shadow"];

export type Orientation = "portrait" | "landscape";

export function wantedOrientation(part: PartId | null): Orientation {
  return part && LANDSCAPE_PARTS.includes(part) ? "landscape" : "portrait";
}

/** 방향이 안 맞을 때 띄울 한 줄. 맞으면 null */
export function orientationHint(part: PartId | null, now: Orientation): string | null {
  if (!part) return null;
  const want = wantedOrientation(part);
  if (want === now) return null;
  return want === "landscape" ? "폰을 가로로 돌리세요" : "폰을 세로로 돌리세요";
}

// ---------- 진행 칩 (F-04) ----------

export interface Chip {
  partId: PartId;
  name: string;
  status: PartStatus;
  score: number | null;
  current: boolean;
}

export const PART_NAME: Record<PartId, string> = {
  brow: "눈썹",
  liner: "아이라이너",
  shadow: "섀도우",
  lip: "입술",
  cheek: "볼터치",
  contour: "쉐딩·하이라이트",
};

export const STATUS_LABEL: Record<PartStatus, string> = {
  not_started: "미시작",
  in_progress: "진행 중",
  check_only: "확인만",
  passed: "완료",
  skipped: "건너뜀",
};

export interface ChipInput {
  partId: PartId;
  status: PartStatus;
  score: number | null;
}

/** 진행 칩 6개. 부위 순서는 PART_IDS 고정, 세션 상태를 그대로 비춘다 */
export function chips(parts: readonly ChipInput[], currentPart: PartId | null): Chip[] {
  return PART_IDS.map((partId) => {
    const p = parts.find((x) => x.partId === partId);
    return {
      partId,
      name: PART_NAME[partId],
      status: p?.status ?? "not_started",
      // 쉐딩·하이라이트는 항상 "확인만" — 점수를 보여주지 않는다
      score: partId === "contour" ? null : (p?.score ?? null),
      current: partId === currentPart,
    };
  });
}

/** 칩에 표시할 문구: 점수가 있으면 숫자, 없으면 상태말 */
export function chipLabel(c: Chip): string {
  if (c.status === "passed" && typeof c.score === "number") return String(c.score);
  return STATUS_LABEL[c.status];
}
