/**
 * 부위 다섯 — 순서와 이름.
 *
 * 본 앱은 쉐딩(contour)까지 여섯이지만 **가이드에서는 다섯만 쓴다** (2026-10-09, 안 쓰기로 함).
 * 순서는 위에서 아래로 — 눈썹부터 그리고 볼터치로 끝내는 것이 실제로 화장하는 차례다.
 */

import type { PalettePart } from "@core/color-family";

export const PART_ORDER = ["brow", "liner", "shadow", "lip", "cheek"] as const;

export const PART_NAME: Record<PalettePart, string> = {
  brow: "눈썹",
  liner: "아이라이너",
  shadow: "아이섀도우",
  lip: "입술",
  cheek: "블러셔",
};

/** 부위마다 한 줄 — 어디에 어떻게 바르는지 */
export const PART_TIP: Record<PalettePart, string> = {
  brow: "결을 살려 빈 곳을 먼저 채워 주세요",
  liner: "속눈썹 라인을 따라 얇게 이어 주세요",
  shadow: "눈두덩 가운데는 연하게, 끝은 조금 더 깊게",
  lip: "안쪽부터 바르고 가장자리로 번지게",
  cheek: "웃을 때 올라오는 자리에 동그랗게",
};

/**
 * 부위 가이드 화면의 **말풍선** — 부위마다 다른 화장 팁 (2026-10-15, #469).
 *
 * 위 `PART_TIP` 과 자리가 다르다. `PART_TIP` 은 가이드 카드 **안쪽**에 적는
 * "어디에 바르는지" 이고, 이쪽은 화면 맨 위 **말풍선**이다.
 * 전에는 다섯 부위가 전부 같은 말("예상 메이크업에서 이 부위만 크게 잘라서
 * 보여드릴게요")을 써서, 부위를 넘겨도 바뀌는 것이 없었다.
 */
export const PART_COACH: Record<PalettePart, string> = {
  brow: "눈썹을 눈썹칼이나 아이브로우 브러쉬로 미리 정리하면 더 깔끔해보여!",
  liner: "최대한 점막에 가깝게 채우면 눈이 또렷해보여!",
  shadow: "붓을 사용할 땐, 가루를 한 번 털어줘!",
  lip: "너무 진해지거나 뭉치지 않게 적은 양을 여러 번 바르면 좋아!",
  cheek: "가이드 내에서 화살표 방향대로 옅어지게!",
};
