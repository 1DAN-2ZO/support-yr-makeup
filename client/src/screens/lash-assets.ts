/**
 * [옛 흐름 · 지금 안 씀] 화면 2-b · 3 의 속눈썹 그림 — 앱을 켤 때 main.ts 가 미리 받지만 그리는 화면(fullrender · completed)은 옛 흐름뿐이다.
 * 2026-10-06 에 흐름이 바뀌어 그 화면들로 가는 길이 없다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * 마스카라 텍스처 (④ public/lashes) — 앱 전체가 한 벌을 같이 쓴다 (#250).
 * 앱 시작 때 main.ts 가 불러 두고, 화면 3 완성본·2-b AR 은 준비됐으면 쓰고 아니면 마스카라만 빼고 그린다 (화면을 막지 않는다).
 *
 * 2026-10-01: 절차적 생성(anime-spike, client/public/lashes/ 바로 아래)을 지우고 참고 사진 기반
 * natural/deep 두 세트(client/public/lashes/{natural,deep}/)로 바꿨다 — 이 파일이 그 최상위 경로를
 * 그대로 보고 있어서 마스카라가 조용히 안 그려지는 회귀가 있었다(#263·#271 계열, makeup-probe.ts와
 * 같은 로더지만 여긴 앱 공용이라 못 보고 지나쳤음). 일단 natural로 고정 — 룩별 natural/deep 구분을
 * 앱에도 넣을지(지금 looks.json extras.lash가 색·진하기만 담당)는 ⑥과 상의할 일이라 남겨둔다.
 */

import { LashTextures } from "./lash-render";

export const LASHES = new LashTextures(`${import.meta.env.BASE_URL}lashes/natural/`);

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
