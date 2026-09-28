/**
 * 부위 확대 박스 — 화면 3 완성본 범위(3-2b)와 화면 4 확대 프리뷰(3-3)가 같이 쓴다. 순수 함수, px.
 * poc/full/lib/gate.js 의 cropSpec 그대로. 데드존·미끄러짐(떨림 1차)은 #23 에서 이 박스 위에 얹는다.
 *
 *   눈썹·아이라이너·섀도우: 양쪽 눈 끝에서 끝 + 여백 15%씩 (가로)
 *   입술: 입술 폭 2.5배 (세로 3배 이상) · 볼: 얼굴 폭 1.15배 · 쉐딩: 미간 ~ 턱 아래
 */

import { LM, at, dist } from "./landmarks";
import { wantedOrientation } from "./screens";
import type { PartId, Pt } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** @param aspect 보여 줄 칸의 가로/세로 */
export function cropSpec(partId: PartId, lm: readonly Pt[], aspect: number): Rect {
  const P = (i: number): Pt => at(lm, i);
  const faceW = dist(P(LM.faceL), P(LM.faceR));
  let cx: number, cy: number, w: number, h: number;
  if (wantedOrientation(partId) === "landscape") {
    const ids = partId === "brow" ? [LM.eyeA.outer, LM.eyeB.outer, ...LM.browA.upper, ...LM.browB.upper] : [LM.eyeA.outer, LM.eyeB.outer];
    const xs = ids.map((i) => P(i).x), ys = ids.map((i) => P(i).y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    w = (maxX - minX) * 1.3;
    cx = (minX + maxX) / 2;
    const eyeY = (P(LM.eyeA.outer).y + P(LM.eyeB.outer).y) / 2;
    cy = partId === "brow" ? (eyeY + Math.min(...ys)) / 2 : eyeY;
    h = w / aspect;
  } else if (partId === "lip") {
    const xs = LM.lipsOuter.map((i) => P(i).x), ys = LM.lipsOuter.map((i) => P(i).y);
    const lw = Math.max(...xs) - Math.min(...xs), lh = Math.max(...ys) - Math.min(...ys);
    cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    w = lw * 2.5;
    h = w / aspect;
    if (h < lh * 3) { h = lh * 3; w = h * aspect; }
  } else if (partId === "cheek") {
    w = faceW * 1.15;
    cx = (P(LM.faceL).x + P(LM.faceR).x) / 2;
    cy = (P(LM.cheekA).y + P(LM.cheekB).y) / 2;
    h = w / aspect;
  } else {
    // 쉐딩·하이라이트: 미간 ~ 턱 아래
    const top = P(LM.glabella).y, bottom = P(LM.chin).y + faceW * 0.15;
    h = bottom - top;
    w = h * aspect;
    if (w < faceW * 1.25) { w = faceW * 1.25; h = w / aspect; }
    cx = (P(LM.faceL).x + P(LM.faceR).x) / 2;
    cy = (top + bottom) / 2;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 촬영 프레임 좌표 → 크기가 다른 그림(줄여 저장한 쌩얼·서버 완성본)의 좌표 */
export function scaleLm(lm: readonly Pt[], from: { w: number; h: number }, to: { w: number; h: number }): Pt[] {
  const kx = to.w / from.w, ky = to.h / from.h;
  return lm.map((p) => ({ x: p.x * kx, y: p.y * ky }));
}
