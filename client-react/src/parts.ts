/**
 * 부위 다섯 — 순서와 이름.
 *
 * 본 앱은 쉐딩(contour)까지 여섯이지만 **가이드에서는 다섯만 쓴다** (2026-10-09, 안 쓰기로 함).
 * 순서는 위에서 아래로 — 눈썹부터 그리고 볼터치로 끝내는 것이 실제로 화장하는 차례다.
 */

import type { PalettePart } from "@core/color-family";
import type { Key } from "./i18n";

export const PART_ORDER = ["brow", "liner", "shadow", "lip", "cheek"] as const;

/*
 * 글은 `i18n/ko.ts` · `en.ts` 에 있다 (2026-10-16). 여기 두는 것은 **열쇠**뿐이다 —
 * 쓰는 쪽에서 `t(PART_NAME[part])` 처럼 부른다. 이름을 그대로 두면 영어 화면에서 한글이 샌다.
 */
export const PART_NAME: Record<PalettePart, Key> = {
  brow: "part.brow",
  liner: "part.liner",
  shadow: "part.shadow",
  lip: "part.lip",
  cheek: "part.cheek",
};

/** 부위마다 한 줄 — 어디에 어떻게 바르는지 */
export const PART_TIP: Record<PalettePart, Key> = {
  brow: "part.tip.brow",
  liner: "part.tip.liner",
  shadow: "part.tip.shadow",
  lip: "part.tip.lip",
  cheek: "part.tip.cheek",
};

/**
 * 부위 가이드 화면의 **말풍선** — 부위마다 다른 화장 팁 (2026-10-15, #469).
 *
 * 위 `PART_TIP` 과 자리가 다르다. `PART_TIP` 은 가이드 카드 **안쪽**에 적는
 * "어디에 바르는지" 이고, 이쪽은 화면 맨 위 **말풍선**이다.
 * 전에는 다섯 부위가 전부 같은 말("예상 메이크업에서 이 부위만 크게 잘라서
 * 보여드릴게요")을 써서, 부위를 넘겨도 바뀌는 것이 없었다.
 */
export const PART_COACH: Record<PalettePart, Key> = {
  brow: "part.coach.brow",
  liner: "part.coach.liner",
  shadow: "part.coach.shadow",
  lip: "part.coach.lip",
  cheek: "part.coach.cheek",
};
