/**
 * 부위 다섯 — 순서와 이름.
 *
 * 본 앱은 쉐딩(contour)까지 여섯이지만 **가이드에서는 다섯만 쓴다** (2026-10-09, 안 쓰기로 함).
 * 순서는 위에서 아래로 — 눈썹부터 그리고 볼터치로 끝내는 것이 실제로 화장하는 차례다.
 */

import type { PalettePart } from "./core/color-family";

export const PART_ORDER = ["brow", "liner", "shadow", "lip", "cheek"] as const;

export const PART_NAME: Record<PalettePart, string> = {
  brow: "눈썹",
  liner: "아이라이너",
  shadow: "아이섀도우",
  lip: "입술",
  cheek: "볼터치",
};

/** 부위마다 한 줄 — 어디에 어떻게 바르는지 */
export const PART_TIP: Record<PalettePart, string> = {
  brow: "결을 살려 빈 곳을 먼저 채워 주세요",
  liner: "속눈썹 라인을 따라 얇게 이어 주세요",
  shadow: "눈두덩 가운데는 연하게, 끝은 조금 더 깊게",
  lip: "안쪽부터 바르고 가장자리로 번지게",
  cheek: "웃을 때 올라오는 자리에 동그랗게",
};
