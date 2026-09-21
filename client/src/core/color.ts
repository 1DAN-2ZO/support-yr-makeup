/**
 * 색 — sRGB → CIE L*a*b*, 이미지 영역 평균, 이마·눈 흰자 참조 (1-4·1-6·1-9).
 * 순수 함수. 이미지는 { data(RGBA), w, h } 만 받는다 (ImageData 와 같은 모양) 라 Node 에서도 돈다.
 */

import type { Pt } from "./types";

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** ImageData 와 같은 모양. 브라우저에서는 ctx.getImageData() 결과를 그대로 넘긴다 */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array | number[];
  w: number;
  h: number;
}

/** sRGB(0~255) → Lab (D65). poc/full/lib/sampling.js rgb2lab 과 같은 식 */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const f = (c: number): number => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = f(r), G = f(g), B = f(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = h(x), fy = h(y), fz = h(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** 두 Lab 의 거리 (CIE76). CIEDE2000 은 채점(③)에서 */
export function deltaE(p: Lab, q: Lab): number {
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

export function labAt(im: RgbaImage, x: number, y: number): Lab {
  const xi = Math.max(0, Math.min(im.w - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(im.h - 1, Math.round(y)));
  const i = (yi * im.w + xi) * 4;
  return rgbToLab(im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0);
}

export function pointInPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!, pj = poly[j]!;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside;
  }
  return inside;
}

/** 다각형 안 평균 Lab (step px 간격). 표본이 없으면 null. keep 으로 픽셀을 거를 수 있다 (흰자에서 속눈썹·홍채 제외용) */
export function meanLabPoly(im: RgbaImage, poly: readonly Pt[], step = 2, keep?: (lab: Lab, x: number, y: number) => boolean): { lab: Lab; n: number } | null {
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  let L = 0, a = 0, b = 0, n = 0;
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(im.h - 1, Math.max(...ys)); y += step) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(im.w - 1, Math.max(...xs)); x += step) {
      if (!pointInPoly(x, y, poly)) continue;
      const lab = labAt(im, x, y);
      if (keep && !keep(lab, x, y)) continue;
      L += lab.L; a += lab.a; b += lab.b; n++;
    }
  }
  return n ? { lab: { L: L / n, a: a / n, b: b / n }, n } : null;
}

// ---------- 랜드마크 인덱스 (MediaPipe 478점, 화면 기준 A = 왼쪽 눈) ----------

export const EYE_A = { outer: 33, inner: 133, ring: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], iris: [468, 469, 470, 471, 472] } as const;
export const EYE_B = { outer: 263, inner: 362, ring: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], iris: [473, 474, 475, 476, 477] } as const;
export const FOREHEAD_POLY = [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109] as const;   // 이마 비화장 영역 (헤어라인 아래)
export const FACE_L = 234, FACE_R = 454;

const at = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음 (${lm.length}점)`);
  return p;
};

/** 이마 참조: 이마 다각형 안 평균 Lab. L* 는 밝기 조건, a*b* 는 색(조명 색온도) 조건에 쓴다 */
export function foreheadLab(im: RgbaImage, lm: readonly Pt[]): Lab | null {
  const r = meanLabPoly(im, FOREHEAD_POLY.map((i) => at(lm, i)), 2);
  return r ? r.lab : null;
}

/**
 * 눈 흰자 참조 (1-6): 양쪽 눈 테두리 안에서 홍채 원(반지름 1.15배)을 뺀 픽셀 중
 * 밝고(L* ≥ 40) 채도가 낮은(|a|,|b| ≤ 25) 것만 평균. 속눈썹·홍채·눈꺼풀 그림자를 거른다.
 * 흰자는 "흰색이어야 하는 것" 이라 조명 색이 얼마나 도는지(a*, b*)의 기준이 된다.
 * 표본이 너무 적으면(눈 감음·너무 작음) null — 그러면 Baseline.scleraLab 은 null 로 두고 이마 L* 만 쓴다.
 */
export function scleraLab(im: RgbaImage, lm: readonly Pt[], { minSamples = 12, skinDeltaE = 10 } = {}): { a: number; b: number; L: number; n: number } | null {
  const skin = foreheadLab(im, lm);   // 흰자는 피부보다 밝고 채도가 낮다 — 피부색과 비슷한 픽셀(눈꺼풀·감은 눈)은 뺀다
  let L = 0, a = 0, b = 0, n = 0;
  for (const eye of [EYE_A, EYE_B]) {
    const ring = eye.ring.map((i) => at(lm, i));
    const c = at(lm, eye.iris[0]);
    const rad = Math.max(...eye.iris.slice(1).map((i) => Math.hypot(at(lm, i).x - c.x, at(lm, i).y - c.y))) * 1.15;
    const r = meanLabPoly(im, ring, 1, (lab, x, y) =>
      Math.hypot(x - c.x, y - c.y) > rad && lab.L >= 40 && Math.abs(lab.a) <= 25 && Math.abs(lab.b) <= 25 &&
      (!skin || deltaE(lab, skin) > skinDeltaE));
    if (r) { L += r.lab.L * r.n; a += r.lab.a * r.n; b += r.lab.b * r.n; n += r.n; }
  }
  if (n < minSamples) return null;
  return { a: a / n, b: b / n, L: L / n, n };
}

/** 4장 연속 촬영의 이마 Lab 변동 폭 (1-4 측정용): 각 축의 최대−최소와 첫 장 대비 최대 편차 */
export function labDrift(labs: readonly Lab[]): { rangeL: number; rangeA: number; rangeB: number; maxDeltaE: number } | null {
  if (labs.length < 2) return null;
  const first = labs[0]!;
  const rng = (k: keyof Lab): number => Math.max(...labs.map((l) => l[k])) - Math.min(...labs.map((l) => l[k]));
  return { rangeL: rng("L"), rangeA: rng("a"), rangeB: rng("b"), maxDeltaE: Math.max(...labs.slice(1).map((l) => deltaE(first, l))) };
}
