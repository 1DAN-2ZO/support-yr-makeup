/**
 * [옛 흐름 · 지금 안 씀] 화면 3 부위 완성본(screens/guide.ts)만 쓴다.
 * 2026-10-06 에 흐름이 바뀌어 그 화면들로 가는 길이 없다.
 * 지우지 않고 둔다 — 등록(main.ts) · 테스트도 그대로다. 목록과 근거: client/OLD-FLOW.md
 */
/**
 * 화면 3 (부위 완성본) 글 — 순수 함수. DOM 을 모른다 (그리는 건 screens/guide.ts).
 *
 * 정의서 3-1: 3-5 근거 한 줄(숫자 없음), 3-6 "지금 필요한 것" 한 줄(화면 3 에만).
 * 쉐딩·하이라이트는 룩이 아니라 얼굴형 규칙에서 온다 — 얼굴형이 자리값(confidence 0)이면 멘트를 안 쓴다 (capture.ts PENDING_FACE_SHAPE).
 */

import { CONTOUR_PRODUCTS, CONTOUR_RATIONALE, LOOK_PART_ORDER, type Look } from "./looks";
import { PART_NAME } from "./screens";
import type { FaceShape, PartId } from "./types";

export interface PartCard {
  title: string;
  rationale: string | null;
  need: string | null;
}

/** "눈 · 블랙 젤 라이너" → "블랙 젤 라이너" (앞의 부위 머리는 화면 제목과 겹친다) */
const productName = (p: string): string => p.split(" · ").slice(1).join(" · ") || p;

export function partCard(partId: PartId, look: Look, faceShape: FaceShape | null): PartCard {
  const title = PART_NAME[partId];
  if (partId === "contour") {
    const rationale = faceShape && faceShape.confidence > 0 ? (CONTOUR_RATIONALE[faceShape.label] ?? null) : null;
    return { title, rationale, need: `지금 필요한 것: ${CONTOUR_PRODUCTS.map(productName).join(", ")}` };
  }
  const i = LOOK_PART_ORDER.indexOf(partId);
  const product = i >= 0 ? look.products[i] : undefined;
  return {
    title,
    rationale: look.rationale[partId] ?? null,
    need: product ? `지금 필요한 것: ${productName(product)}` : null,
  };
}
