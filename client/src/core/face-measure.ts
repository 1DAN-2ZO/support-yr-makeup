/**
 * 얼굴 측정 — 개인화의 입력이 되는 연속값 (논문 기술 A).
 *
 * 분류하지 않고 잰다. 눈 모양 6분류의 자동 정확도가 61% 에 그쳤고(Alashkar 2017),
 * 분류가 틀리면 틀린 모양을 가르치게 된다. 값을 재서 연속적으로 쓰면 경계에서 튀지 않는다.
 *
 * 비율값(기울기·가로세로 비·굽은 정도)은 사진 크기와 무관하다. 길이를 mm 로 써야 할 때만
 * 동공 사이 거리를 자로 삼는다(mmPerPx). 홍채 지름은 쓰지 않는다 — MediaPipe 홍채가 사람 라벨보다
 * 12% 작게 잡혀 척도에서 뺀 결정(2026-09-16, data-needs C-5)이 있다. 동공 중심은 홍채 둘레보다 안정적이다.
 *
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽. guides.ts 와 같은 규칙.
 */

import { LM, at, dist } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

/**
 * 동공 사이 거리(IPD) mm — 사진 속 길이를 mm 로 바꾸는 자.
 * Jung 외(2020) 20대 한국 여성: 쌍꺼풀 62.8 ± 3.6, 외꺼풀 61.6 ± 3.1 → 두 값의 가운데.
 * 사람마다 약 ±5% 차이가 난다 — mm 값은 그만큼의 오차를 안고 쓴다.
 */
export const IPD_MM = 62.2;

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
  /** 눈두덩: 윗눈꺼풀 꼭대기 → 눈썹 아랫선(가운데) 거리 ÷ 눈 폭. 섀도 범위 개인화에 쓴다 */
  lidGapRatio: number;
}

export interface LipMeasure {
  /** 윗입술 ÷ 아랫입술 붉은 부분 두께 (가운데에서). 아랫입술이 0 이면 null */
  upperLowerRatio: number | null;
  /** 입술 높이(위 + 아래) ÷ 입 너비 */
  heightWidthRatio: number;
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
  lip: LipMeasure;
  /** 얼굴 폭 ÷ 이마 윗점~턱 끝 (Zhao 2019). 1 에 가까울수록 둥글다. 이마 윗점은 머리선이 아니라 논문 값과 직접 비교하지 않는다 */
  faceAspect: number;
  /** 1px 이 몇 mm 인가 (동공 사이 거리 자). 동공 점이 겹쳐 있으면 null */
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
export function faceAxis(lm: readonly Pt[]): Pt {
  const pick = (a: number, b: number): Pt => {
    const p = at(lm, a), q = at(lm, b);
    return { x: q.x - p.x, y: q.y - p.y };
  };
  let v = pick(LM.eyeA.iris[0], LM.eyeB.iris[0]);
  if (Math.hypot(v.x, v.y) < 1) v = pick(LM.eyeA.inner, LM.eyeB.inner);
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

type BrowIdx = { readonly upper: readonly number[]; readonly lower: readonly number[] };

function measureEye(lm: readonly Pt[], eye: typeof LM.eyeA | typeof LM.eyeB, brow: BrowIdx, axis: Pt): EyeMeasure {
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
    lidGapRatio: w > 0 ? lidGap(lm, up.p, brow, axis) / w : 0,
  };
}

/** 윗눈꺼풀 꼭대기에서 눈썹 아랫선 가운데까지, 얼굴 위쪽(눈동자 선에 수직) 방향 거리 */
function lidGap(lm: readonly Pt[], apex: Pt, brow: BrowIdx, axis: Pt): number {
  const b = at(lm, brow.lower[Math.floor(brow.lower.length / 2)]!);
  const up = { x: axis.y, y: -axis.x };
  return (b.x - apex.x) * up.x + (b.y - apex.y) * up.y;
}

/** 입술 가운데 두께: 0(윗입술 바깥)·13(안)·14(안)·17(아랫입술 바깥), 입꼬리 61·291 */
function measureLip(lm: readonly Pt[]): LipMeasure {
  const upper = dist(at(lm, 0), at(lm, 13)), lower = dist(at(lm, 14), at(lm, 17));
  const width = dist(at(lm, 61), at(lm, 291));
  return {
    upperLowerRatio: lower > 0 ? upper / lower : null,
    heightWidthRatio: width > 0 ? (upper + lower) / width : 0,
  };
}

function measureBrow(lm: readonly Pt[], brow: BrowIdx): BrowMeasure {
  const mid = brow.upper.map((k, n) => {
    const u = at(lm, k), l = at(lm, brow.lower[n]!);
    return { x: (u.x + l.x) / 2, y: (u.y + l.y) / 2 };
  });
  const a = mid[0]!, b = mid[mid.length - 1]!;
  const len = dist(a, b);
  return { curvature: len > 0 ? farthest(a, b, mid.slice(1, -1)).d / len : 0 };
}

/** 1px 이 몇 mm 인가 — 두 동공 중심 사이를 62.2 mm 로 본다. 동공 점이 겹쳐 있으면 null */
export function mmPerPx(lm: readonly Pt[]): number | null {
  const ipd = dist(at(lm, LM.eyeA.iris[0]), at(lm, LM.eyeB.iris[0]));
  return ipd >= 1 ? IPD_MM / ipd : null;
}

export function measureFace(lm: readonly Pt[]): FaceMeasure {
  const faceH = dist(at(lm, LM.forehead), at(lm, LM.chin));
  const axis = faceAxis(lm);
  return {
    rollDeg: (Math.atan2(axis.y, axis.x) * 180) / Math.PI,
    eye: { R: measureEye(lm, LM.eyeA, LM.browA, axis), L: measureEye(lm, LM.eyeB, LM.browB, axis) },
    brow: { R: measureBrow(lm, LM.browA), L: measureBrow(lm, LM.browB) },
    lip: measureLip(lm),
    faceAspect: faceH > 0 ? dist(at(lm, LM.faceL), at(lm, LM.faceR)) / faceH : 0,
    mmPerPx: mmPerPx(lm),
  };
}
