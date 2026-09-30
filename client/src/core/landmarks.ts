/**
 * MediaPipe Face Landmarker 478점 인덱스 표.
 * poc/full/lib/landmarks.js 의 LM 을 그대로 옮긴 것 — ③ 샘플링이 먼저 쓰고, ② 가이드 모듈(2-1)이 cropSpec·partVisible 등을 이어서 붙인다.
 * 좌표는 프레임 픽셀. A = 이미지 왼쪽 = 피험자 오른쪽(R), B = 이미지 오른쪽 = 피험자 왼쪽(L).
 *
 * 기준 길이(unitScale)는 baseline.ts, 이마·눈 흰자 다각형은 color.ts 에 있다 (① 소유). 여기에 또 두지 않는다.
 */

import type { PartId, Pt } from "./types";

export const LM = {
  eyeA: { outer: 33, inner: 133, upper: [33, 246, 161, 160, 159, 158, 157, 173, 133], lower: [33, 7, 163, 144, 145, 153, 154, 155, 133], iris: [468, 469, 470, 471, 472] },
  eyeB: { outer: 263, inner: 362, upper: [263, 466, 388, 387, 386, 385, 384, 398, 362], lower: [263, 249, 390, 373, 374, 380, 381, 382, 362], iris: [473, 474, 475, 476, 477] },
  browA: { upper: [70, 63, 105, 66, 107], lower: [46, 53, 52, 65, 55] },
  browB: { upper: [300, 293, 334, 296, 336], lower: [276, 283, 282, 295, 285] },
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  cheekA: 50,
  cheekB: 280,
  /** 콧방울 가장 바깥 점 — 눈썹 꼬리 끝을 정하는 선(콧방울 → 바깥 눈꼬리)의 출발점 */
  alaA: 129,
  alaB: 358,
  faceL: 234,
  faceR: 454,
  chin: 152,
  forehead: 10,
  noseTip: 1,
  glabella: 168,
  noseBridge: [6, 197, 195, 5],
  jaw: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
} as const;

/**
 * 강체 점 13개 — 화장·표정·입에 안 흔들리는 점: 눈 안팎 끝 · 콧대·코끝 · 이마 · 광대 (정의서 3-5, #28).
 * 얼굴 옆(234·454·127·356)과 턱(152)은 입을 벌리면 메시가 같이 벌어져서 뺐다 (실기기 확인).
 * 채점 정합(score.STABLE_IDS)과 화면 4 기준 각도 차(gate.rigidPoseDiff)가 이 목록 하나를 쓴다
 */
export const RIGID_IDS = [33, 133, 362, 263, 168, 6, 197, 195, 5, 4, 10, 50, 280] as const;

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 랜드마크 배열에서 인덱스 점을 꺼낸다. 없으면 던진다 — 478점이 아닌 입력은 여기서 잡힌다 */
export function at(pts: readonly Pt[], i: number): Pt {
  const p = pts[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음 (${pts.length}점)`);
  return p;
}

/** 부위마다 화면 안에 다 있어야 하는 점 (poc/full/lib/gate.js PART_POINTS 그대로) */
export const PART_POINTS: Record<PartId, readonly number[]> = {
  brow: [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower, LM.eyeA.outer, LM.eyeB.outer],
  liner: [...LM.eyeA.upper, ...LM.eyeB.upper],
  shadow: [...LM.eyeA.upper, ...LM.eyeB.upper, ...LM.browA.lower, ...LM.browB.lower],
  lip: LM.lipsOuter,
  cheek: [LM.cheekA, LM.cheekB, LM.faceL, LM.faceR],
  contour: [...LM.jaw, LM.glabella],
};

/** 부위 점이 전부 프레임 안(가장자리 여백 2%)에 있나 — 화면 4 게이트 "부위 가시성" (정의서 3-3) */
export function partVisible(partId: PartId, pts: readonly Pt[], w: number, h: number): boolean {
  return partInRect(partId, pts, { x: 0, y: 0, w, h });
}

/** 부위 점이 전부 영역 r 안(여백 2%)에 있나. 화면에 실제로 보이는 영역(crop.coverView)으로 부른다 */
export function partInRect(partId: PartId, pts: readonly Pt[], r: { x: number; y: number; w: number; h: number }): boolean {
  const mx = r.w * 0.02, my = r.h * 0.02;
  return PART_POINTS[partId].every((i) => {
    const p = at(pts, i);
    return p.x > r.x + mx && p.x < r.x + r.w - mx && p.y > r.y + my && p.y < r.y + r.h - my;
  });
}
