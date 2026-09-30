/**
 * VLM 에 보낼 얼굴 사진 — 쌩얼 사진에서 얼굴 가운데 정사각형을 잘라 512×512 JPEG. 모듈 ⑥.
 *
 * 해상도를 고정해야 이미지 토큰 수·시간이 일정하고 같은 사진이면 같은 입력이 된다 (조사 보고서).
 * 자르는 법은 선정 실험(eval/vlm/run.py face_image)과 같다 — 실험에서 잰 것과 앱이 보내는 것이 같아야 한다.
 * 사진은 이 기기와 학원 서버 사이만 오간다 (서버는 저장하지 않는다 — core/vlm-client.ts 계약).
 */

import { scaleLm } from "../core/crop";
import type { Pt } from "../core/types";

export const VLM_IMAGE_SIDE = 512;
const MARGIN = 1.35;

/** 얼굴 점을 다 담는 정사각형 (한 변 = 긴 쪽 × 1.35, 가운데 = 얼굴 가운데) */
export function faceSquare(lm: readonly Pt[]): { x: number; y: number; side: number } {
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0) * MARGIN;
  return { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, side };
}

/**
 * 얼굴 점이 잰 크기(from)와 사진 크기(to)가 다를 때 — 쌩얼은 긴 변 1024 로 줄여 저장하지만 점은 촬영 프레임 좌표다
 * (#179 리뷰: 안 맞추면 폰 세로 사진에서 상자가 1.9배 커지고 아래로 밀렸다). 화면 3(guide.ts)과 같은 scaleLm
 */
export function faceSquareIn(lm: readonly Pt[], from: { w: number; h: number }, to: { w: number; h: number }): { x: number; y: number; side: number } {
  return faceSquare(scaleLm(lm, from, to));
}

/** 쌩얼 사진(Blob·ImageBitmap) + 얼굴 점(from 크기 좌표) → JPEG data URL */
export async function faceImage(photo: Blob | ImageBitmap, lm: readonly Pt[], from: { w: number; h: number }, side = VLM_IMAGE_SIDE): Promise<string> {
  const bmp = photo instanceof Blob ? await createImageBitmap(photo) : photo;
  const b = faceSquareIn(lm, from, { w: bmp.width, h: bmp.height });
  const cv = document.createElement("canvas");
  cv.width = side;
  cv.height = side;
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("2d 캔버스를 쓸 수 없음");
  ctx.fillStyle = "#000";   // 사진 밖(가장자리)은 검정 — 실험(PIL crop)과 같다
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(bmp, b.x, b.y, b.side, b.side, 0, 0, side, side);
  if (photo instanceof Blob) bmp.close();
  return cv.toDataURL("image/jpeg", 0.9);
}
