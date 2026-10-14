/**
 * 저장용 이미지 인코딩 (1-7): 긴 변 1024 로 줄여 WebP 로. 지원 안 하면 JPEG.
 * 리뷰 화면의 최종 프레임(review-shot)처럼 보여 주기만 하는 사진은 이 크기면 충분하고 IndexedDB 에 부담이 없다.
 * (완성 예상 그림은 저장하지 않는다 — 화면 3·2-b 가 쌩얼 위에 그때그때 그린다, 2026-09-29 이후)
 * **쌩얼(bare)만은 촬영 원본 크기** (BARE_MAX_SIDE, #240) — 채점이 또렷한 확인받기 사진(1080×1920)과 비교하므로,
 * 줄인 쌩얼(576×1024)과 비교하면 원래 있던 눈썹 결·속눈썹이 "새로 그린 것" 처럼 보인다. 1장이라 용량은 수백 KB.
 */

/** 쌩얼 저장 긴 변 — 줄이지 않는다 (#240) */
export const BARE_MAX_SIDE = Number.POSITIVE_INFINITY;

export interface EncodeResult {
  blob: Blob;
  w: number;
  h: number;
  type: string;
}

export function fitSize(w: number, h: number, maxSide = 1024): { w: number; h: number } {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 캔버스·비디오·비트맵 → WebP(0.9) Blob. WebP 가 안 나오면(구형 사파리) JPEG 로 */
export async function encodeForStore(src: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number }, maxSide = 1024): Promise<EncodeResult> {
  const sw = src.videoWidth ?? src.width ?? 0, sh = src.videoHeight ?? src.height ?? 0;
  if (!sw || !sh) throw new Error("이미지 크기를 알 수 없습니다");
  const { w, h } = fitSize(sw, sh, maxSide);
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d 컨텍스트 없음");
  ctx.drawImage(src, 0, 0, w, h);
  let blob = await cv.convertToBlob({ type: "image/webp", quality: 0.9 });
  if (blob.type !== "image/webp") blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return { blob, w, h, type: blob.type };
}
