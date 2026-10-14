/**
 * 맨얼굴 기준(Baseline) 만들기·다시 만들기 (1-6·1-10·1-11).
 *  - buildBaseline(): 랜드마크·이미지에서 비율 척도(눈·입술·얼굴 폭), 이마 L*, 눈 흰자 a*b*, 얼굴형을 한 묶음으로
 *  - eyelidRef(): 눈 감음 장에서 눈꺼풀 기준점 (1-10 결정: 눈 감음 장을 "쓴다")
 *  - similarity()/applyTransform(): 정면을 다시 찍으면 나머지 3장을 새 기준 좌표계로 재정렬 (1-11)
 * 순수 함수. 이미지는 { data, w, h } 만.
 */

import type { Baseline, FaceShape, Pt } from "./types";
import type { RgbaImage } from "./color";
import { EYE_A, EYE_B, FACE_L, FACE_R, foreheadLab, scleraLab } from "./color";

const LIP_L = 61, LIP_R = 291;

const at = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음 (${lm.length}점)`);
  return p;
};
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 비율 척도 기준 길이(px): 눈 폭 평균·입술 폭·얼굴 폭. 모든 가이드·채점 길이는 이것으로 나눈 비율 */
export function unitScale(lm: readonly Pt[]): Baseline["unit"] {
  const eye = (dist(at(lm, EYE_A.outer), at(lm, EYE_A.inner)) + dist(at(lm, EYE_B.outer), at(lm, EYE_B.inner))) / 2;
  return { eye, lip: dist(at(lm, LIP_L), at(lm, LIP_R)), face: dist(at(lm, FACE_L), at(lm, FACE_R)) };
}

export interface BuildBaselineInput {
  lm: Pt[];
  w: number;
  h: number;
  /** 정면 눈 뜸 사진 픽셀. 없으면 이마·흰자 참조는 null */
  image?: RgbaImage;
  faceShape: FaceShape;
  bareImage?: Baseline["bareImage"];
  /** 그 장을 찍은 프레임의 블렌드셰이프 (#177). 없으면 null */
  expression?: Baseline["expression"];
}

/** Baseline 한 묶음. 흰자 표본이 모자라면 scleraLab 은 null (③ 은 그때 이마 L* 만으로 보정) */
export function buildBaseline(input: BuildBaselineInput): Baseline {
  const fore = input.image ? foreheadLab(input.image, input.lm) : null;
  const sclera = input.image ? scleraLab(input.image, input.lm) : null;
  return {
    lm: input.lm,
    unit: unitScale(input.lm),
    foreheadL: fore ? fore.L : 0,
    scleraLab: sclera ? { a: sclera.a, b: sclera.b } : null,
    faceShape: input.faceShape,
    bareImage: input.bareImage ?? null,
    expression: input.expression ?? null,
    w: input.w,
    h: input.h,
  };
}

// ---------- 1-10: 눈 감음 장 → 눈꺼풀 기준점 ----------

/**
 * 눈꺼풀 기준점: 눈을 감았을 때 윗눈꺼풀 선(속눈썹 선)이 어디에 오는지.
 * 화면 4 에서 사용자가 눈을 감고 라이너를 그릴 때 테두리를 이 선으로 옮긴다 (F-06 "눈 감으면 눈꺼풀 기준 전환").
 * 좌표는 눈 바깥·안쪽 끝을 잇는 축 기준 비율 — 정면 눈 뜸 장과 사진 크기가 달라도 그대로 쓸 수 있다.
 */
export interface EyelidRef {
  /** 화면 왼쪽 눈(A)·오른쪽 눈(B). 윗눈꺼풀 선 9점을 눈 축 기준 (u 0~1, v 눈 폭 대비 위쪽 +) 로 */
  A: { u: number; v: number }[];
  B: { u: number; v: number }[];
  /** 눈 감음 장의 눈 폭(px). 비율이라 참고용 */
  eyePx: number;
}

/** 축 (ux,uy) 에 수직이면서 화면 위쪽(y 감소)을 향하는 단위 법선 */
function upNormal(ux: number, uy: number): [number, number] {
  let nx = uy, ny = -ux;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return [nx, ny];
}

const UPPER_A = [33, 246, 161, 160, 159, 158, 157, 173, 133] as const;
const UPPER_B = [263, 466, 388, 387, 386, 385, 384, 398, 362] as const;

export function eyelidRef(closedLm: readonly Pt[]): EyelidRef {
  const one = (upper: readonly number[], outer: number, inner: number): { u: number; v: number }[] => {
    const o = at(closedLm, outer), i = at(closedLm, inner);
    const ax = i.x - o.x, ay = i.y - o.y, len = Math.hypot(ax, ay) || 1;
    const ux = ax / len, uy = ay / len;
    const [nx, ny] = upNormal(ux, uy);
    return upper.map((k) => {
      const p = at(closedLm, k);
      const dx = p.x - o.x, dy = p.y - o.y;
      // u: 축 방향 비율, v: 축에 수직 (화면 위쪽이 +). 양쪽 눈은 축 방향이 반대라 법선을 화면 기준으로 맞춘다
      return { u: (dx * ux + dy * uy) / len, v: (dx * nx + dy * ny) / len };
    });
  };
  return {
    A: one(UPPER_A, EYE_A.outer, EYE_A.inner),
    B: one(UPPER_B, EYE_B.outer, EYE_B.inner),
    eyePx: (dist(at(closedLm, EYE_A.outer), at(closedLm, EYE_A.inner)) + dist(at(closedLm, EYE_B.outer), at(closedLm, EYE_B.inner))) / 2,
  };
}

/** 눈꺼풀 기준점을 지금 프레임(눈 뜸·감음 무관)의 눈 축에 다시 얹어 픽셀 좌표로 */
export function eyelidToPx(ref: EyelidRef, lm: readonly Pt[]): { A: Pt[]; B: Pt[] } {
  const put = (pts: { u: number; v: number }[], outer: number, inner: number): Pt[] => {
    const o = at(lm, outer), i = at(lm, inner);
    const ax = i.x - o.x, ay = i.y - o.y, len = Math.hypot(ax, ay) || 1;
    const ux = ax / len, uy = ay / len;
    const [nx, ny] = upNormal(ux, uy);
    return pts.map(({ u, v }) => ({ x: o.x + ux * u * len + nx * v * len, y: o.y + uy * u * len + ny * v * len }));
  };
  return { A: put(ref.A, EYE_A.outer, EYE_A.inner), B: put(ref.B, EYE_B.outer, EYE_B.inner) };
}

// ---------- 1-11: 정면 재촬영 → 나머지 장 재정렬 ----------

/** 2D 유사 변환 (회전·배율·이동). p' = s·R·p + t */
export interface Similarity {
  s: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

/**
 * from 좌표계의 점들을 to 좌표계로 보내는 유사 변환을 두 기준점(눈 바깥 끝 33·263)으로 푼다.
 * 정면을 다시 찍어 기준이 바뀌면, 이전 기준에서 뽑아 둔 것(눈꺼풀 기준점·45° 장 정렬)을 새 기준으로 옮길 때 쓴다.
 */
export function similarity(from: readonly Pt[], to: readonly Pt[]): Similarity {
  const a0 = at(from, EYE_A.outer), b0 = at(from, EYE_B.outer);
  const a1 = at(to, EYE_A.outer), b1 = at(to, EYE_B.outer);
  const dx0 = b0.x - a0.x, dy0 = b0.y - a0.y, dx1 = b1.x - a1.x, dy1 = b1.y - a1.y;
  const l0 = Math.hypot(dx0, dy0) || 1, l1 = Math.hypot(dx1, dy1);
  const s = l1 / l0;
  const ang = Math.atan2(dy1, dx1) - Math.atan2(dy0, dx0);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return { s, cos, sin, tx: a1.x - s * (cos * a0.x - sin * a0.y), ty: a1.y - s * (sin * a0.x + cos * a0.y) };
}

export function applyTransform(T: Similarity, p: Pt): Pt {
  return { x: T.s * (T.cos * p.x - T.sin * p.y) + T.tx, y: T.s * (T.sin * p.x + T.cos * p.y) + T.ty };
}

export function transformAll(T: Similarity, pts: readonly Pt[]): Pt[] {
  return pts.map((p) => applyTransform(T, p));
}

/**
 * 정면 눈 뜸 장을 다시 찍었을 때: 새 기준을 만들고, 이전 기준에서 계산해 둔 나머지 장의 랜드마크를
 * 새 기준 좌표계로 옮긴다. 45°·눈 감음 장 자체는 다시 찍지 않는다 (F-01 "틀린 장만 다시").
 */
export function retakeFront(
  prev: Baseline,
  next: BuildBaselineInput,
  others: Record<string, Pt[]>,
): { baseline: Baseline; others: Record<string, Pt[]>; transform: Similarity } {
  const baseline = buildBaseline(next);
  const T = similarity(prev.lm, baseline.lm);
  const realigned: Record<string, Pt[]> = {};
  for (const [k, pts] of Object.entries(others)) realigned[k] = transformAll(T, pts);
  return { baseline, others: realigned, transform: T };
}
