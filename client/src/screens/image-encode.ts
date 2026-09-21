/**
 * 저장용 이미지 인코딩 (1-7): 긴 변 1024 로 줄여 WebP 로. 지원 안 하면 JPEG.
 * 세션 사진 3장(쌩얼·전체 완성 예상·최종 프레임) 은 이 크기면 채점·비교에 충분하고 IndexedDB 에 부담이 없다.
 */

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
