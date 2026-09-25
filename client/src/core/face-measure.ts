/**
 * 얼굴 측정 — 개인화의 입력이 되는 연속값 (논문 기술 A).
 *
 * 분류하지 않고 잰다. 눈 모양 6분류의 자동 정확도가 61% 에 그쳤고(Alashkar 2017),
 * 분류가 틀리면 틀린 모양을 가르치게 된다. 값을 재서 연속적으로 쓰면 경계에서 튀지 않는다.
 *
 * 비율값(기울기·가로세로 비·굽은 정도)은 사진 크기와 무관하다. 길이를 mm 로 써야 할 때만
 * 홍채 지름을 자로 삼는다(mmPerPx).
 *
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽. guides.ts 와 같은 규칙.
 */

import { LM, at, dist } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

/**
 * 홍채(각막) 지름 mm — 사진 속 길이를 mm 로 바꾸는 자.
 * 20대 한국 여성 827명의 평균값으로 Jung 외(2020)가 사진 크기 보정에 쓴 값.
 */
export const IRIS_MM = 11.3;

export interface EyeMeasure {
  /** 눈꼬리 기울기(°): 안쪽 → 바깥 눈꼬리 선이 수평과 이루는 각. 바깥이 높으면 + (Jung 2020: 한국 20대 여성 약 8.4~8.8°) */
  tiltDeg: number;
  /** 바깥 눈꼬리에서 눈 축과 윗눈꺼풀 꼭대기가 이루는 각(°) (ILoveEye) */
  alphaDeg: number;
  /** 바깥 눈꼬리에서 눈 축과 아랫눈꺼풀 바닥이 이루는 각(°) (ILoveEye) */
  betaDeg: number;
  /** α > β — ILoveEye 가 처진 눈으로 판정하는 조건. 분류가 아니라 참고값으로 준다 */
  outerCornerDown: boolean;
  /** 눈 폭 ÷ 눈 높이 (ILoveEye: 2.75~3.00 보통, 3.00 초과 작고 긴 눈, 2.75 미만 크고 둥근 눈) */
  aspect: number;
  /** 눈 높이 ÷ 눈 폭 — 라이너 두께를 눈 높이에 맞출 때 쓴다 (Jung 2020: 외꺼풀은 눈 높이가 작다) */
  heightRatio: number;
}

export interface BrowMeasure {
  /** 눈썹 중심선이 양 끝을 잇는 직선에서 가장 멀리 떨어진 거리 ÷ 눈썹 길이 (Zhao 2019) */
  curvature: number;
}

export interface FaceMeasure {
  /** 고개 기울기(°): 두 눈동자를 잇는 선이 화면 수평과 이루는 각. 화면에서 시계 방향이 +. 눈꼬리 기울기는 이만큼 되돌려 잰다 */
  rollDeg: number;
  eye: Record<Side, EyeMeasure>;
  brow: Record<Side, BrowMeasure>;
  /** 얼굴 폭 ÷ 이마 윗점~턱 끝 (Zhao 2019). 1 에 가까울수록 둥글다. 이마 윗점은 머리선이 아니라 논문 값과 직접 비교하지 않는다 */
  faceAspect: number;
  /** 1px 이 몇 mm 인가. 홍채 점이 뭉개져 있으면 null */
  mmPerPx: number | null;
}

/** 직선 a→b 에서 p 까지의 수직 거리 */
function offLine(a: Pt, b: Pt, p: Pt): number {
  const len = dist(a, b) || 1;
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
}

/** 꼭짓점 o 에서 두 점 a, b 가 이루는 각(°) */
function angleAt(o: Pt, a: Pt, b: Pt): number {
  const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y;
  const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** 직선에서 가장 먼 점 */
function farthest(a: Pt, b: Pt, pts: readonly Pt[]): { p: Pt; d: number } {
  let best = { p: pts[0]!, d: -1 };
  for (const p of pts) {
    const d = offLine(a, b, p);
    if (d > best.d) best = { p, d };
  }
  return best;
}

/**
 * 얼굴의 수평 방향(단위 벡터, 이미지 왼쪽 → 오른쪽). 두 눈동자를 잇는 선.
 * 눈동자 점이 뭉개져 있으면 두 안쪽 눈꼬리를 잇는 선.
 * 고개를 기울인 채 찍어도 눈꼬리 기울기가 흔들리지 않게 여기에 대고 잰다 — 표준 사진(Jung 2020)과 달리 사용자는 고개를 똑바로 두지 않는다.
 */
function faceAxis(lm: readonly Pt[]): Pt {
  const pick = (a: number, b: number): Pt => {
    const p = at(lm, a), q = at(lm, b);
    return { x: q.x - p.x, y: q.y - p.y };
  };
  let v = pick(LM.eyeA.iris[0], LM.eyeB.iris[0]);
  if (Math.hypot(v.x, v.y) < 1) v = pick(LM.eyeA.inner, LM.eyeB.inner);
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function measureEye(lm: readonly Pt[], eye: typeof LM.eyeA | typeof LM.eyeB, axis: Pt): EyeMeasure {
  const o = at(lm, eye.outer), i = at(lm, eye.inner);
  const w = dist(o, i);
  const up = farthest(o, i, eye.upper.map((k) => at(lm, k)));
  const down = farthest(o, i, eye.lower.map((k) => at(lm, k)));
  const h = up.d + down.d;
  const alphaDeg = angleAt(o, up.p, i), betaDeg = angleAt(o, down.p, i);
  // 얼굴 좌표로 옮긴다: 가로 = axis, 세로 = axis 를 90° 돌린 것(이미지처럼 아래가 +)
  const dx = i.x - o.x, dy = i.y - o.y;
  const along = dx * axis.x + dy * axis.y, across = -dx * axis.y + dy * axis.x;
  return {
    tiltDeg: (Math.atan2(across, Math.abs(along)) * 180) / Math.PI,
    alphaDeg,
    betaDeg,
    outerCornerDown: alphaDeg > betaDeg,
    aspect: h > 0 ? w / h : Infinity,
    heightRatio: w > 0 ? h / w : 0,
  };
}

function measureBrow(lm: readonly Pt[], brow: { readonly upper: readonly number[]; readonly lower: readonly number[] }): BrowMeasure {
  const mid = brow.upper.map((k, n) => {
    const u = at(lm, k), l = at(lm, brow.lower[n]!);
    return { x: (u.x + l.x) / 2, y: (u.y + l.y) / 2 };
  });
  const a = mid[0]!, b = mid[mid.length - 1]!;
  const len = dist(a, b);
  return { curvature: len > 0 ? farthest(a, b, mid.slice(1, -1)).d / len : 0 };
}

/** 홍채 둘레 네 점(마주 보는 두 쌍)의 평균 지름 */
function irisDiameter(lm: readonly Pt[], iris: readonly number[]): number {
  const p = iris.map((k) => at(lm, k));
  return (dist(p[1]!, p[3]!) + dist(p[2]!, p[4]!)) / 2;
}

export function measureFace(lm: readonly Pt[]): FaceMeasure {
  const iris = (irisDiameter(lm, LM.eyeA.iris) + irisDiameter(lm, LM.eyeB.iris)) / 2;
  const faceH = dist(at(lm, LM.forehead), at(lm, LM.chin));
  const axis = faceAxis(lm);
  return {
    rollDeg: (Math.atan2(axis.y, axis.x) * 180) / Math.PI,
    eye: { R: measureEye(lm, LM.eyeA, axis), L: measureEye(lm, LM.eyeB, axis) },
    brow: { R: measureBrow(lm, LM.browA), L: measureBrow(lm, LM.browB) },
    faceAspect: faceH > 0 ? dist(at(lm, LM.faceL), at(lm, LM.faceR)) / faceH : 0,
    mmPerPx: iris >= 1 ? IRIS_MM / iris : null,
  };
}
