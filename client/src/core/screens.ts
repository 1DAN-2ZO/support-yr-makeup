/**
 * 화면 순서·이름·방향 — 순수 함수. DOM 을 모른다.
 * 껍데기(shell.ts)와 각 모듈의 화면이 함께 쓴다.
 *
 * 화면 담당 — 새 흐름 (2026-10-06, docs/service-definition-v6.md 맨 위 표):
 *   1 동의·촬영 ①  ·  2·3 참고 사진·정답사진 ①②④ 한 덩어리(prep — 각자 다른 방식으로 구현해 보는 중)  ·  4 부위 가이드 ②  ·
 *   6 피드백 ③  ·  5 시도사진 · 7 저장·공유 · 껍데기 ⑥ (UI 는 ⑤)
 */

import type { PartId, PartStatus } from "./types";
import { LOOK_PART_IDS } from "./types";

/** 부위 가이드가 도는 부위 — 쉐딩·하이라이트는 안 쓴다 (2026-10-09) */
export const GUIDE_PART_IDS = LOOK_PART_IDS;
// 화면 목록·이름은 ① 의 flow.ts 가 정본이다 (세션이 먼저 쓴다). 여기서 다시 정의하지 않는다.
import { SCREEN_NAME, type ScreenId } from "./flow";

export { SCREEN_NAME };
export type { ScreenId };

/**
 * 진행 순서 — 새 흐름 (2026-10-06). 맨얼굴 촬영 → 참고 사진·정답사진 → [부위 가이드] × 부위 → 시도사진 → 피드백 → 저장·공유 → 끝.
 * 부위마다 중간 확인(실시간 테두리 · 결과)은 없다. 옛 흐름 화면은 SCREENS 에 남아 있지만 이 순서에는 없다
 */
export const SCREEN_ORDER: readonly ScreenId[] = ["consent", "capture", "answer", "partguide", "attempt", "feedback", "save", "done"];

/**
 * 옛 흐름에서 빠진 화면 → 가까운 새 화면. 앱을 다시 켰을 때 옛 화면에 멈춘 세션을 옮긴다.
 * live(실시간 가이드)만은 지금도 쓴다 — 부위 가이드에서 보기만 하러 들어간다. 나머지 여섯은 가는 길이 없다 (client/OLD-FLOW.md)
 */
const RETIRED: Partial<Record<ScreenId, ScreenId>> = {
  processing: "answer", looks: "answer", fullrender: "answer",
  guide: "partguide", live: "partguide", result: "partguide",
  review: "feedback",
};

/** 새 흐름의 화면으로 — 옛 흐름 화면이면 가까운 새 화면, 아니면 그대로 */
export function inNewFlow(s: ScreenId): ScreenId {
  return RETIRED[s] ?? s;
}

/**
 * 어느 모듈이 그 화면을 만드는가. 껍데기가 "아직 안 붙음"을 표시할 때 쓴다.
 * prep = ①·②·④ 한 덩어리 (맨얼굴 사진 다음부터 정답사진까지)
 */
export const SCREEN_OWNER: Record<ScreenId, "capture" | "guide" | "score" | "app" | "prep"> = {
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
  answer: "prep",
  partguide: "guide",
  attempt: "app",
  feedback: "score",
  save: "app",
};

/** 부위를 도는 화면 (진행 칩이 보인다) — 새 흐름은 부위 가이드 하나 */
export const PART_SCREENS = ["partguide"] as const satisfies readonly ScreenId[];

/**
 * 부위 가이드 순서 — 부위마다 확인받지 않으니 상태와 상관없이 정해진 순서대로. 마지막이면 null (→ 시도사진).
 *
 * **쉐딩·하이라이트는 뺀다** (2026-10-09 — 안 쓰기로 함). PART_IDS 가 아니라 LOOK_PART_IDS 를 쓴다:
 * 정답사진 가이드도 채점도 쉐딩은 보지 않아서, 화면만 하나 더 거치고 아무것도 안 알려 주는 자리였다.
 * PartId 타입과 채점 쪽 코드는 그대로 둔다 — 다시 쓰게 되면 이 목록만 PART_IDS 로 되돌리면 된다.
 */
export function nextGuidePart(after: PartId | null): PartId | null {
  const i = after ? GUIDE_PART_IDS.indexOf(after as never) : -1;
  return GUIDE_PART_IDS[i + 1] ?? null;
}

/**
 * 한 부위 앞. 첫 부위면 null (→ 예상 메이크업 화면으로).
 * 뒤로 가기가 쓴다 — 아이라이너에서 뒤로 누르면 눈썹으로 가야지 참고 사진까지 가면 안 된다 (#369 피드백)
 */
export function prevGuidePart(before: PartId | null): PartId | null {
  const i = before ? GUIDE_PART_IDS.indexOf(before as never) : -1;
  return i > 0 ? (GUIDE_PART_IDS[i - 1] ?? null) : null;
}

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

/** 진행 칩. 부위 순서는 GUIDE_PART_IDS 고정(쉐딩 뺌), 세션 상태를 그대로 비춘다 */
export function chips(parts: readonly ChipInput[], currentPart: PartId | null): Chip[] {
  return GUIDE_PART_IDS.map((partId) => {
    const p = parts.find((x) => x.partId === partId);
    return {
      partId,
      name: PART_NAME[partId],
      status: p?.status ?? "not_started",
      score: p?.score ?? null,
      current: partId === currentPart,
    };
  });
}

/** 칩에 표시할 문구: 점수가 있으면 숫자, 없으면 상태말 */
export function chipLabel(c: Chip): string {
  if (c.status === "passed" && typeof c.score === "number") return String(c.score);
  return STATUS_LABEL[c.status];
}
