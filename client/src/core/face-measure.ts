/**
 * 촬영 게이트용 얼굴 측정 (랜드마크만 쓰는 것). 프로브(capture-probe)와 화면 1(capture)이 같이 쓴다.
 * 픽셀이 필요한 선명도·이마 색은 `screens/frame-measure.ts`.
 * 순수 함수 — 좌표는 px.
 */

import type { Pt } from "./types";
import { FACE_L, FACE_R } from "./color";

const pt = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음`);
  return p;
};
const d = (lm: readonly Pt[], a: number, b: number): number => Math.hypot(pt(lm, a).x - pt(lm, b).x, pt(lm, a).y - pt(lm, b).y);

/** 코끝이 얼굴 폭 안에서 어디 있나로 yaw·pitch(도). 화면(거울) 기준이 아니라 카메라 기준 — 화면에서 쓰려면 부호를 뒤집는다 */
export function yawFromLandmarks(lm: readonly Pt[]): { yaw: number; pitch: number } {
  const l = pt(lm, FACE_L), r = pt(lm, FACE_R), n = pt(lm, 1), top = pt(lm, 10), chin = pt(lm, 152);
  return { yaw: ((n.x - l.x) / (r.x - l.x) - 0.5) * 90, pitch: ((n.y - top.y) / (chin.y - top.y) - 0.55) * 90 };
}

/** 행렬 yaw 두 해석. 1-2 Android 실측: column-major 가 랜드마크와 부호가 맞음 */
export function yawFromMatrix(data: readonly number[]): { row: number; col: number } {
  const R = (r: number, c: number): number => data[r * 4 + c] ?? 0;
  const C = (r: number, c: number): number => data[c * 4 + r] ?? 0;
  const deg = (v: number): number => (v * 180) / Math.PI;
  return { row: deg(Math.atan2(R(0, 2), R(2, 2))), col: deg(Math.atan2(C(0, 2), C(2, 2))) };
}

export const UP_A = [246, 161, 160, 159, 158, 157, 173], LO_A = [7, 163, 144, 145, 153, 154, 155];
export const UP_B = [466, 388, 387, 386, 385, 384, 398], LO_B = [249, 390, 373, 374, 380, 381, 382];

/** 눈 세로/가로 비 (EAR). 블렌드셰이프가 없을 때 눈 감음 판정용 */
export function ear(lm: readonly Pt[], up: readonly number[], lo: readonly number[], outer: number, inner: number): number {
  const w = d(lm, outer, inner) || 1;
  let h = 0;
  for (let i = 0; i < up.length; i++) h += d(lm, up[i] ?? 0, lo[i] ?? 0);
  return h / up.length / w;
}

/** 블렌드셰이프(eyeBlinkLeft/Right)가 있으면 그것(> 0.5), 없으면 EAR < 0.12 */
export function eyesClosed(lm: readonly Pt[], bs: ReadonlyMap<string, number>): { closedA: boolean; closedB: boolean } {
  if (bs.size > 0) return { closedA: (bs.get("eyeBlinkLeft") ?? 0) > 0.5, closedB: (bs.get("eyeBlinkRight") ?? 0) > 0.5 };
  return { closedA: ear(lm, UP_A, LO_A, 33, 133) < 0.12, closedB: ear(lm, UP_B, LO_B, 263, 362) < 0.12 };
}

/** 랜드마크 전체(468점)가 프레임 가장자리에서 얼마나 떨어져 있나 — 짧은 변 대비 비율. 밖이면 음수 */
export function faceInsetOf(lm: readonly Pt[], sw: number, sh: number): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 468; i++) {
    const p = pt(lm, i);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.min(minX, minY, sw - maxX, sh - maxY) / Math.min(sw, sh);
}

/** 눈 폭(px) — 눈 안쪽 끝~바깥 끝(33·133, 263·362) 중 큰 쪽. 얼굴 크기 조건 (impl-screen1-5 "눈 폭 ≥ 80px") */
export function eyeWidthPxOf(lm: readonly Pt[]): number {
  return Math.max(d(lm, 33, 133), d(lm, 263, 362));
}

/** 홍채 지름(px) — 기록만 한다 (게이트·척도에는 안 씀, 2026-09-16 결정). 468~477 은 홍채 점 */
export function irisPxOf(lm: readonly Pt[]): number {
  if (lm.length < 478) return 0;
  return (d(lm, 469, 471) + d(lm, 474, 476)) / 2;
}

/** 얼굴 폭 / 짧은 변 */
export function faceRatioOf(lm: readonly Pt[], sw: number, sh: number): number {
  return Math.abs(pt(lm, FACE_R).x - pt(lm, FACE_L).x) / Math.min(sw, sh);
}

/** 선명도를 잴 얼굴 크롭 (얼굴 폭 기준으로 넉넉히) */
export function faceCropOf(lm: readonly Pt[], sw: number, sh: number): { x: number; y: number; w: number; h: number } {
  const faceW = Math.abs(pt(lm, FACE_R).x - pt(lm, FACE_L).x);
  return { x: Math.max(0, pt(lm, FACE_L).x - faceW * 0.2), y: Math.max(0, pt(lm, 10).y - faceW * 0.2), w: Math.min(sw, faceW * 1.4), h: Math.min(sh, faceW * 1.8) };
}
