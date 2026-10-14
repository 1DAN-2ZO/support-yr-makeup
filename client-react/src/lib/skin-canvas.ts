/**
 * 찍은 장면(캔버스)의 피부 정돈 — 맨얼굴(화면 1) · 시도사진(화면 5)이 저장하기 직전에 부른다 (core/skin-smooth, 2026-10-12 ②).
 * 얼굴 점은 촬영 크기(shot) 좌표라 캔버스 크기로 맞춘다. 2D 컨텍스트를 못 열면 그대로 둔다
 */

import { smoothSkin } from "../core/skin-smooth";
import type { Pt } from "../core/types";

export function smoothSkinCanvas(cv: HTMLCanvasElement, lm: readonly Pt[], shot: { w: number; h: number }): void {
  const g = cv.getContext("2d");
  if (!g || !cv.width || !cv.height || !shot.w || !shot.h) return;
  const d = g.getImageData(0, 0, cv.width, cv.height);
  smoothSkin({ data: d.data, w: d.width, h: d.height }, lm.map((p) => ({ x: (p.x * cv.width) / shot.w, y: (p.y * cv.height) / shot.h })));
  g.putImageData(d, 0, 0);
}
