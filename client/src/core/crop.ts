/**
 * 부위 확대 박스 — 화면 3 완성본 범위(3-2b)와 화면 4 확대 프리뷰(3-3)가 같이 쓴다. 순수 함수, px.
 * poc/full/lib/gate.js 의 cropSpec 그대로. 데드존·미끄러짐(떨림 1차)은 #23 에서 이 박스 위에 얹는다.
 *
 *   눈썹·아이라이너·섀도우: 양쪽 눈 끝에서 끝 + 여백 15%씩 (가로)
 *   입술: 입술 폭 2.5배 (세로 3배 이상) · 볼: 얼굴 폭 1.15배 · 쉐딩: 미간 ~ 턱 아래
 */

import { LM, PART_POINTS, at, dist } from "./landmarks";
import { wantedOrientation } from "./screens";
import type { PartId, Pt } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 눈 부위(눈썹·라이너·섀도우) 창 폭 = 두 눈꼬리 **거리** × 이 값 (#204).
 * 전에는 두 눈꼬리의 x 차이 × 1.3 이라 (1) 얼굴이 누우면(자동 회전 꺼짐) 폭이 0 에 가까워져 엄청나게 확대되고
 * (2) 똑바로 봐도 두 눈이 화면을 꽉 채워 떨림이 배율만큼 커 보였다. 1.7 은 가정값 — 폰에서 `?jitter` 로 정한다
 */
export const EYE_CROP_MARGIN = 1.7;
/** 얼굴이 이만큼(도) 넘게 누우면 확대하지 않고 "자동 회전" 안내 (#204) */
export const ROLL_MAX = 45;

/** 얼굴 기울기(도, 크기만) — 두 눈꼬리 선이 가로에서 얼마나 돌았나. 자동 회전이 꺼진 채 폰을 돌리면 90 가까이 */
export function faceRoll(lm: readonly Pt[]): number {
  const a = at(lm, LM.eyeA.outer), b = at(lm, LM.eyeB.outer);
  return Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

const bbox = (pts: readonly Pt[]): { minX: number; maxX: number; minY: number; maxY: number } => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

/**
 * @param aspect 보여 줄 칸의 가로/세로
 * @param mustShow 창에 꼭 들어가야 하는 점 (예: 표준 눈썹 꼬리처럼 얼굴 점 밖으로 나가는 가이드 테두리). 비율은 지킨 채 넓힌다
 */
export function cropSpec(partId: PartId, lm: readonly Pt[], aspect: number, mustShow: readonly Pt[] = []): Rect {
  const P = (i: number): Pt => at(lm, i);
  const faceW = dist(P(LM.faceL), P(LM.faceR));
  let cx: number, cy: number, w: number, h: number;
  if (wantedOrientation(partId) === "landscape") {
    // 좌우를 비교하며 그리는 부위라 양쪽을 다 담는다. 폭은 x 차이가 아니라 두 눈꼬리 거리로 — 기울거나 누워도 확대가 안 커진다
    const b = bbox([...PART_POINTS[partId].map(P), P(LM.eyeA.outer), P(LM.eyeB.outer), ...mustShow]);
    w = Math.max(dist(P(LM.eyeA.outer), P(LM.eyeB.outer)) * EYE_CROP_MARGIN, (b.maxX - b.minX) * 1.15);
    h = w / aspect;
    const needH = (b.maxY - b.minY) * 1.3;
    if (h < needH) { h = needH; w = h * aspect; }
    cx = (b.minX + b.maxX) / 2;
    cy = (b.minY + b.maxY) / 2;
  } else if (partId === "lip") {
    const xs = LM.lipsOuter.map((i) => P(i).x), ys = LM.lipsOuter.map((i) => P(i).y);
    // 입술 폭도 입꼬리 거리와 x 차이 중 큰 것 — 얼굴이 기울어도 확대가 안 커지게
    const lw = Math.max(Math.max(...xs) - Math.min(...xs), dist(P(61), P(291))), lh = Math.max(...ys) - Math.min(...ys);
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
  // 꼭 보여야 하는 점이 밖이면 가운데는 두고 비율을 지킨 채 넓힌다
  for (const p of mustShow) {
    const needW = Math.abs(p.x - cx) * 2 * 1.05, needH = Math.abs(p.y - cy) * 2 * 1.05;
    if (needW > w) { w = needW; h = w / aspect; }
    if (needH > h) { h = needH; w = h * aspect; }
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 촬영 프레임 좌표 → 크기가 다른 그림(줄여 저장한 쌩얼·서버 완성본)의 좌표 */
export function scaleLm(lm: readonly Pt[], from: { w: number; h: number }, to: { w: number; h: number }): Pt[] {
  const kx = to.w / from.w, ky = to.h / from.h;
  return lm.map((p) => ({ x: p.x * kx, y: p.y * ky }));
}

/**
 * object-fit: cover 로 칸을 꽉 채울 때 **실제로 보이는** 영상 영역(영상 px). 넘치는 쪽이 가운데 기준으로 잘린다.
 * 화면 4 부위 가시성은 영상 전체가 아니라 이 영역으로 본다 (iPad 가로에서 양옆이 잘림, #167 리뷰). 칸 크기를 모르면 전체
 */
export function coverView(vw: number, vh: number, cw: number, ch: number): Rect {
  if (cw <= 0 || ch <= 0 || vw <= 0 || vh <= 0) return { x: 0, y: 0, w: vw, h: vh };
  const k = Math.max(cw / vw, ch / vh);
  const w = cw / k, h = ch / k;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}
