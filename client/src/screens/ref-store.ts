/**
 * 이번 회차에 올린 참고 사진의 색 — 화면끼리 같은 값을 보게 들고 있는 자리.
 *
 * 정답사진 화면에서 분석한 색을 부위 가이드 화면에서도 써야 한다. 두 화면이 다른 색을
 * 말하면 안 된다. 지금은 **메모리에만** 둔다 — 새로고침하면 사라지고, 그때는 부위 가이드가
 * 견본 색으로 돌아간다. 새 흐름이 확정되면 session-store 로 옮긴다.
 *
 * 사진 자체는 들고 있지 않다. 뽑은 색만 남긴다.
 */

import type { RefColors } from "@core/ref-colors";

let current: RefColors | null = null;

export function setRefColors(colors: RefColors | null): void {
  current = colors;
}

export function getRefColors(): RefColors | null {
  return current;
}
