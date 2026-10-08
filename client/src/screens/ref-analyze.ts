/**
 * 올린 참고 사진 한 장 → 색조 팔레트 (2026-10-06).
 *
 * 얼굴 점은 복원이 쓰는 landmarksFromImage 를 그대로 쓴다 (픽셀 좌표로 돌려준다 —
 * core/ref-colors.ts 가 기대하는 규약과 같다). 색을 고르는 규칙은 ref-colors.ts 에 있다.
 *
 * 서버로 보내지 않는다. 전부 이 폰 안에서 끝난다.
 */

import { refColors } from "@core/ref-colors";
import type { RefColors } from "@core/ref-colors";
import { landmarksFromImage } from "./landmarker";

/** 긴 변이 이보다 크면 줄여서 잰다 — 색은 해상도와 상관없고, 큰 사진은 느리다 */
const MAX_SIDE = 900;

export interface RefAnalysis {
  colors: RefColors;
  /** 화면에 보여 줄 참고 사진 (줄인 것) */
  preview: string;
  w: number;
  h: number;
}

export type RefFailure =
  | "noFace"      // 얼굴을 못 찾음
  | "noCanvas"    // 2D 컨텍스트를 못 얻음
  | "noColor";    // 얼굴은 찾았는데 쓸 만한 색이 한 부위도 안 나옴

export async function analyzeRefPhoto(blob: Blob): Promise<RefAnalysis | RefFailure> {
  const found = await landmarksFromImage(blob);
  if (!found) return "noFace";

  const bmp = await createImageBitmap(blob);
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    if (!g) return "noCanvas";
    g.drawImage(bmp, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h);
    // 얼굴 점은 원본 크기 기준이라 줄인 만큼 같이 줄인다
    const lm = found.lm.map((p) => ({ x: p.x * (w / found.w), y: p.y * (h / found.h) }));
    const colors = refColors({ data: im.data, w, h }, lm);
    if (!Object.keys(colors).length) return "noColor";
    return { colors, preview: cv.toDataURL("image/jpeg", 0.8), w, h };
  } finally {
    bmp.close();
  }
}

export const REF_FAIL_TEXT: Record<RefFailure, string> = {
  noFace: "사진에서 얼굴을 못 찾았어요. 얼굴이 크게 나온 정면 사진으로 올려 주세요.",
  noCanvas: "사진을 읽지 못했어요. 다시 시도해 주세요.",
  noColor: "화장 색을 읽기에 사진이 너무 작아요. 더 크게 나온 사진으로 올려 주세요.",
};
