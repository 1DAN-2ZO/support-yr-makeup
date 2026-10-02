/**
 * 먼 쪽 눈을 눈 주변 점으로 옮기기 — 화면 4 테두리 (2026-10-02 PC 시험).
 *
 * 고개를 많이 돌리면 MediaPipe 가 먼 쪽 눈꺼풀 점을 빗나가게 잡는다(먼 쪽 눈머리가 코 쪽으로 삐져나오고, 눈꼬리가 눈동자 테두리에 끌려감).
 * 그 점을 그대로 따르면 테두리도 빗나간다. 그래서 먼 쪽 눈은 **눈 주변의 잘 잡히는 점**(눈썹 · 눈 둘레 바깥 고리 · 콧대)으로
 * 정면 → 지금 변환(늘이기·기울이기·옮기기, 아핀)을 맞춰 정면에서 그린 모양을 통째로 옮긴다. 점이 많아 한두 개가 틀려도 버틴다.
 * 대신 이 변환은 눈꺼풀 움직임(감기·내리깔기)을 안 따라가므로, 각도 차가 작을 땐 지금처럼 눈꺼풀 점(그물)을 쓰고 클수록 서서히 넘긴다.
 *
 * 점 번호는 MediaPipe 얼굴 그물 주석(눈썹 위·아래, 눈 둘레 Upper2 · Lower3 고리) + 콧대. 눈꺼풀(eye contour)·홍채는 없다.
 */

import type { Side } from "./score";
import type { Pt } from "./types";

export const EYE_FRAME: Record<Side, readonly number[]> = {
  // 오른쪽 눈(LM.eyeA, 33 · 133 쪽)
  R: [
    156, 70, 63, 105, 66, 107, 55, 193,   // 눈썹 위
    35, 124, 46, 53, 52, 65,              // 눈썹 아래
    113, 225, 224, 223, 222, 221, 189,    // 눈 둘레 위 바깥 고리
    143, 111, 117, 118, 119, 120, 121, 128, 245,   // 눈 둘레 아래 바깥 고리
    168, 6, 197,                          // 콧대
  ],
  // 왼쪽 눈(LM.eyeB, 263 · 362 쪽)
  L: [
    383, 300, 293, 334, 296, 336, 285, 417,
    265, 353, 276, 283, 282, 295,
    342, 445, 444, 443, 442, 441, 413,
    372, 340, 346, 347, 348, 349, 350, 357, 465,
    168, 6, 197,
  ],
};

/** x' = a·x + b·y + c, y' = d·x + e·y + f */
export type Affine = readonly [number, number, number, number, number, number];

export function applyAffine(t: Affine, p: Pt): Pt {
  return { x: t[0] * p.x + t[1] * p.y + t[2], y: t[3] * p.x + t[4] * p.y + t[5] };
}

/** 점 짝(src → dst)에 가장 잘 맞는 아핀 (최소제곱). 점이 한 줄 위에만 있으면 null */
export function fitAffine(src: readonly Pt[], dst: readonly Pt[]): Affine | null {
  const n = Math.min(src.length, dst.length);
  if (n < 3) return null;
  // 가운데로 옮겨서 푼다 (수치 안정)
  let mx = 0, my = 0, nx = 0, ny = 0;
  for (let i = 0; i < n; i++) { mx += src[i]!.x; my += src[i]!.y; nx += dst[i]!.x; ny += dst[i]!.y; }
  mx /= n; my /= n; nx /= n; ny /= n;
  let sxx = 0, sxy = 0, syy = 0, ux = 0, uy = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i]!.x - mx, y = src[i]!.y - my, X = dst[i]!.x - nx, Y = dst[i]!.y - ny;
    sxx += x * x; sxy += x * y; syy += y * y;
    ux += x * X; uy += y * X; vx += x * Y; vy += y * Y;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9 * Math.max(1, sxx * syy)) return null;
  const a = (ux * syy - uy * sxy) / det, b = (uy * sxx - ux * sxy) / det;
  const d = (vx * syy - vy * sxy) / det, e = (vy * sxx - vx * sxy) / det;
  return [a, b, nx - a * mx - b * my, d, e, ny - d * mx - e * my];
}

/** 그 눈의 주변 점으로 맞춘 정면(base) → 지금(cur) 변환 */
export function eyeFrameAffine(base: readonly Pt[], cur: readonly Pt[], side: Side): Affine | null {
  const ids = EYE_FRAME[side].filter((i) => base[i] && cur[i]);
  return fitAffine(ids.map((i) => base[i]!), ids.map((i) => cur[i]!));
}

/** 각도 차가 이만큼까지는 눈꺼풀 점(그물), 이만큼부터는 눈 주변 점만 (rigidPoseDiff 눈금 — 화면 4 각도 차 한계 12 와 같은 눈금). 가정값 */
export const FAR_EYE = { from: 12, to: 25 } as const;

/** 먼 쪽 눈을 주변 점 쪽으로 넘기는 정도 0~1 */
export function farEyeWeight(absYawDiff: number): number {
  const t = (absYawDiff - FAR_EYE.from) / (FAR_EYE.to - FAR_EYE.from);
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
