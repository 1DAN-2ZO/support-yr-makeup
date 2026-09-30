/**
 * 마스카라 텍스처 (④ public/lashes) — 앱 전체가 한 벌을 같이 쓴다 (#250).
 * 앱 시작 때 main.ts 가 불러 두고, 화면 3 완성본·2-b AR 은 준비됐으면 쓰고 아니면 마스카라만 빼고 그린다 (화면을 막지 않는다).
 */

import { LashTextures } from "./lash-render";

export const LASHES = new LashTextures(`${import.meta.env.BASE_URL}lashes/`);

let loading: Promise<void> | null = null;

/** 한 번만 받는다. 실패하면 다음 부름에 다시 받는다 */
export function loadLashes(): Promise<void> {
  loading ??= LASHES.load().catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

export function resetLashesForTest(): void {
  loading = null;
}
