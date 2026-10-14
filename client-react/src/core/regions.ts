/**
 * 부위별 랜드마크 폴리곤 — poc/look-tryon/client/lib/regions.js 그대로 타입만 붙임.
 * app.js(v2 사진 워핑)·app-template.js(템플릿 블렌드)가 공용으로 쓰던 포인트셋 그대로.
 * server/app/regions.py 도 regions.js 를 단일 소스로 삼는다(server/tests/test_layer.py 로 정합성
 * 검증) — 이 TS 포트는 그 규약을 그대로 따르되, regions.py 자체는 건드리지 않는다.
 * 중복 구현 금지, 여기 하나만.
 */

import type { Pt } from "./types";
import type { Pt as XY } from "./affine";

export const EYES = {
  R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33] },
  L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263] },
} as const;

export const BROW = {
  R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
} as const;

export const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
} as const;

export const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;

export const EYESHADOW_REACH = 0.45;

export const REGION_KEYS = ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export const TRACKED_IDX: readonly number[] = [
  ...new Set<number>([...BROW.R, ...BROW.L, ...EYES.R.upper, ...EYES.L.upper, ...LIPS, ...CHEEK.R, ...CHEEK.L]),
];

function landmarkPx(landmarks: readonly Pt[], idx: number, w: number, h: number): XY {
  const p = landmarks[idx];
  if (!p) throw new Error(`랜드마크 ${idx} 없음 (${landmarks.length}점)`);
  return [p.x * w, p.y * h];
}

export function centroid(pts: readonly XY[]): XY {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}

function lerp(a: XY, b: XY, t: number): XY {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 정규화 랜드마크 + 이미지 크기 -> 부위별 폴리곤(픽셀) */
export function buildRegions(lm: readonly Pt[], w: number, h: number): Record<RegionKey, XY[]> {
  const P = (i: number): XY => landmarkPx(lm, i, w, h);
  const browR = BROW.R.map(P), browL = BROW.L.map(P);
  const browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  const eyeR = [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()];
  const eyeL = [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()];
  return { browR, browL, eyeR, eyeL, lips: LIPS.map(P), cheekR: CHEEK.R.map(P), cheekL: CHEEK.L.map(P) };
}
