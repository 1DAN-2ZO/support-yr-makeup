/**
 * 볼 피부색 측정 (스파이크 skin-tone-probe, 2026-10-09).
 *
 * 두 단계로 나눈다 — 촬영 때 한 번 하는 **픽셀 단계**와, 나중에 바꿔 가며 보는 **숫자 단계**.
 *   ① measureFrame: 볼 다각형 안 픽셀을 모아 밝기 분위수·a* 꼬리를 걸러 **보정 전 RGB 중앙값**을 낸다 (+ 흰자 보정 배수)
 *   ② skinTone: 그 숫자에 흰자 보정을 걸고 좌우 볼을 합쳐 Lab·색상각·ITA 를 낸다. 픽셀이 필요 없다
 * 본 구현에서는 ① 이 촬영 순간(capture.ts setFront 의 getImageData)에 돌고, 결과 숫자만 draft 에 남는다 (#387 option E).
 *
 * 이마는 웜/쿨 판정에 안 쓴다 (2012 논문: 웜/쿨 차이는 볼에서만). 흰자 보정 안전 검사(흰자가 피부보다 어두우면 실패)는
 * 기존 whiteBalanceGain 이 이마를 내부에서 쓴다.
 */

import { pointInPoly, rgbToLab } from "./color";
import type { RgbaImage } from "./color";
import { whiteBalanceGain } from "./ref-correct";
import { deltaE2000, describeRgb } from "./skin-color";
import type { ColorInfo, Rgb } from "./skin-color";
import { diagnoseWhiteBalance } from "./skin-wb-diagnose";
import type { WbOptions } from "./skin-wb-diagnose";
import type { Pt } from "./types";

/**
 * 볼 다각형 (MediaPipe 478점 인덱스). core/ref-colors.ts 의 CHEEK 와 같은 점 — 거기는 export 가 없어 복제했다.
 * 본 구현으로 올릴 때 하나로 합친다.
 */
export const CHEEK_POLY = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
} as const;
export type Side = keyof typeof CHEEK_POLY;
export const SIDES: readonly Side[] = ["R", "L"];

/** 픽셀 단계 파라미터 */
export interface RoiParams {
  /** 밝기(L*) 분위수 하한·상한 (0~1). 하이라이트·그림자·잡티를 거른다 */
  qLo: number;
  qHi: number;
  /** 볼 다각형을 중심 쪽으로 줄이는 선형 비율 (1 = 그대로) */
  area: number;
  /** a*(붉기) 위쪽 꼬리를 이 비율만큼 버린다 (홍조·여드름). 0 = 안 버림 */
  aCut: number;
}
/** 임시값 — stage 2 실험으로 정한다 */
export const ROI_DEFAULT: RoiParams = { qLo: 0.1, qHi: 0.9, area: 1, aCut: 0 };

/** 숫자 단계 파라미터 */
export type Merge = "mean" | "dark" | "bright";
export interface ToneParams {
  wb: boolean;
  /** 보정 배수를 얼마나 거는지 (0 = 안 함, 1 = 전부) */
  strength: number;
  /** true 면 선형 RGB 에서 곱한다. 기본은 기존 코드처럼 sRGB 값에 곱함 */
  linear: boolean;
  merge: Merge;
}
export const TONE_DEFAULT: ToneParams = { wb: true, strength: 1, linear: false, merge: "mean" };

export interface CheekRaw {
  side: Side;
  /** 걸러 남은 픽셀의 채널별 중앙값, 보정 전 sRGB 0~255 */
  rgb: Rgb;
  /** 남은 픽셀 수 / 다각형 안 표본 수 */
  n: number;
  total: number;
  poly: Pt[];
  /** 남은 / 버려진 표본 좌표 (x,y 번갈아). 오버레이용 */
  kept: number[];
  dropped: number[];
  step: number;
}

export interface SkinFrame {
  R: CheekRaw | null;
  L: CheekRaw | null;
  /** 흰자 보정 배수. 못 구했거나 보정 후 피부가 범위를 벗어나 취소했으면 null */
  gain: Rgb | null;
  /** 배수는 구했지만 보정 후 피부색이 사람 피부색 범위를 벗어나 취소했다 (wbPlausible) */
  wbRejected?: boolean;
}

const MIN_SAMPLES = 30;

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 순서 통계 — 정렬된 배열의 q 분위 값 */
function quantile(sorted: number[], q: number): number {
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1))));
  return sorted[i]!;
}

/** 볼 다각형 (area < 1 이면 꼭짓점 평균 쪽으로 줄임) */
export function cheekPoly(lm: readonly Pt[], side: Side, area = 1): Pt[] {
  const pts = CHEEK_POLY[side].map((i) => lm[i]).filter((p): p is Pt => !!p);
  if (pts.length < 3 || area >= 1) return pts.map((p) => ({ x: p.x, y: p.y }));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: cx + (p.x - cx) * area, y: cy + (p.y - cy) * area }));
}

/** 볼 한쪽: 다각형 안 표본 → 밝기 분위수 → a* 꼬리 → 채널별 중앙값 */
export function measureCheek(im: RgbaImage, lm: readonly Pt[], side: Side, roi: RoiParams, step = 2): CheekRaw | null {
  const poly = cheekPoly(lm, side, roi.area);
  if (poly.length < 3) return null;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys)));

  interface Sample { x: number; y: number; r: number; g: number; b: number; L: number; a: number }
  const all: Sample[] = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInPoly(x, y, poly)) continue;
      const i = (y * im.w + x) * 4;
      const r = im.data[i] ?? 0, g = im.data[i + 1] ?? 0, b = im.data[i + 2] ?? 0;
      const lab = rgbToLab(r, g, b);
      all.push({ x, y, r, g, b, L: lab.L, a: lab.a });
    }
  }
  if (all.length < MIN_SAMPLES) return null;

  const Ls = all.map((s) => s.L).sort((p, q) => p - q);
  const lo = quantile(Ls, roi.qLo), hi = quantile(Ls, roi.qHi);
  let keep = all.filter((s) => s.L >= lo && s.L <= hi);
  if (roi.aCut > 0 && keep.length) {
    const as = keep.map((s) => s.a).sort((p, q) => p - q);
    const cut = quantile(as, 1 - roi.aCut);
    keep = keep.filter((s) => s.a <= cut);
  }
  if (keep.length < MIN_SAMPLES / 2) return null;

  const kept = new Set(keep);
  const keptXY: number[] = [], droppedXY: number[] = [];
  for (const s of all) (kept.has(s) ? keptXY : droppedXY).push(s.x, s.y);
  return {
    side,
    rgb: [median(keep.map((s) => s.r)), median(keep.map((s) => s.g)), median(keep.map((s) => s.b))],
    n: keep.length,
    total: all.length,
    poly,
    kept: keptXY,
    dropped: droppedXY,
    step,
  };
}

/**
 * 보정 후에도 피부가 사람 피부색 범위 안인가 (색상각 hMin~hMax · 보정 전과의 차이 maxShift 이하).
 * 눈꺼풀·속눈썹 같은 것을 흰자로 잘못 잡으면 피부를 초록·회색으로 만드는 배수가 나온다 — 흰자가 안 보이는 사진(웃는 얼굴 · 가는 눈)에서 실제로 났다.
 * 같은 사진 599장 (core/skin-wb-diagnose 의 relative 방식): 이 검사 없이는 보정 후 색상각 상위 3% 가 258° (원본 피부는 35~71°), 있으면 77° 까지.
 * 색상각 범위가 이상한 보정을 거의 다 거르고, 보정 크기 상한은 정당한 큰 보정(조명이 크게 물든 사진)을 막지 않을 만큼 느슨하게 둔다:
 * 상한 10 이면 인위적 조명 변화 사진의 38% 가 실패, 14 면 14%, 18 이면 6% (정확도·색상각 범위는 그대로). 값은 이 데이터에서 고른 가정값이다.
 */
export const WB_SANITY = { hMin: 25, hMax: 85, maxShift: 18 } as const;

export type SanityLimits = { hMin: number; hMax: number; maxShift: number };

export function wbPlausible(cheeks: Record<Side, Rgb | null>, gain: Rgb, limits: SanityLimits = WB_SANITY): boolean {
  const raw = toneFromCheeks(cheeks, null, { ...TONE_DEFAULT, wb: false });
  const fixed = toneFromCheeks(cheeks, gain, { ...TONE_DEFAULT, wb: true, strength: 1 });
  if (!raw || !fixed) return true;   // 볼을 못 쟀으면 판단할 피부가 없다 — 보정이 쓰일 일도 없다
  const h = fixed.lch.h;
  return h >= limits.hMin && h <= limits.hMax && deltaE2000(raw.lab, fixed.lab) <= limits.maxShift;
}

export interface FrameOptions extends WbOptions {
  /** false 면 wbPlausible 검사를 건너뛴다 (기본: 검사함) */
  sanity?: boolean;
  /** 검사 한계를 바꿔 볼 때 (기본 WB_SANITY) */
  sanityLimits?: SanityLimits;
}

/** 한 프레임 전체: 양쪽 볼 + 흰자 보정 배수 */
export function measureFrame(im: RgbaImage, lm: readonly Pt[], roi: RoiParams, wb: FrameOptions = {}): SkinFrame {
  const R = measureCheek(im, lm, "R", roi), L = measureCheek(im, lm, "L", roi);
  // legacy 는 기존 whiteBalanceGain 그대로, relative 는 이마와의 색도 거리 기준 (core/skin-wb-diagnose)
  const found = wb.mode === "relative" ? diagnoseWhiteBalance(im, lm, 2, wb).gain : whiteBalanceGain(im, lm, 2);
  if (found && wb.sanity !== false && !wbPlausible({ R: R?.rgb ?? null, L: L?.rgb ?? null }, found, wb.sanityLimits)) {
    return { R, L, gain: null, wbRejected: true };
  }
  return { R, L, gain: found };
}

const toLinear = (c: number): number => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** 채널 배수를 건다. strength 로 1(그대로) 과 gain 사이를 섞는다 */
export function applyGain(rgb: Rgb, gain: Rgb, strength = 1, linear = false): Rgb {
  const out = rgb.map((v, k) => {
    const g = 1 + (gain[k]! - 1) * strength;
    const c = linear ? fromLinear(toLinear(v) * g) : v * g;
    return Math.max(0, Math.min(255, c));
  });
  return out as Rgb;
}

export interface SkinTone extends ColorInfo {
  /** 좌우 볼 각각 (보정 후). 못 잰 쪽은 null */
  cheeks: Record<Side, Rgb | null>;
  /** 흰자 보정을 실제로 걸었나 (켜져 있어도 gain 이 null 이면 false) */
  wbApplied: boolean;
}

/** 숫자 단계: 보정 → 좌우 합치기 → 색 묶음. 두 볼 다 못 쟀으면 null */
export function skinTone(frame: SkinFrame, tp: ToneParams): SkinTone | null {
  return toneFromCheeks({ R: frame.R?.rgb ?? null, L: frame.L?.rgb ?? null }, frame.gain, tp);
}

/** skinTone 의 숫자만 받는 꼴 — 일괄 처리는 사진마다 픽셀을 들고 있지 않고 이 숫자 셋(볼 둘 · 배수)만 남긴다 */
export function toneFromCheeks(raw: Record<Side, Rgb | null>, gain: Rgb | null, tp: ToneParams): SkinTone | null {
  const wbApplied = tp.wb && gain !== null && tp.strength > 0;
  const fix = (c: Rgb | null): Rgb | null =>
    !c ? null : wbApplied ? applyGain(c, gain!, tp.strength, tp.linear) : [...c];
  const cheeks: Record<Side, Rgb | null> = { R: fix(raw.R), L: fix(raw.L) };
  const have = SIDES.map((s) => cheeks[s]).filter((v): v is Rgb => v !== null);
  if (!have.length) return null;
  const Lof = (c: Rgb): number => rgbToLab(c[0], c[1], c[2]).L;
  let rgb: Rgb;
  if (have.length === 1) rgb = have[0]!;
  else if (tp.merge === "mean") rgb = [0, 1, 2].map((k) => (have[0]![k]! + have[1]![k]!) / 2) as Rgb;
  else rgb = (tp.merge === "dark" ? Lof(have[0]!) <= Lof(have[1]!) : Lof(have[0]!) >= Lof(have[1]!)) ? have[0]! : have[1]!;
  return { ...describeRgb(rgb), cheeks, wbApplied };
}

/** 여러 프레임의 결과를 채널별 중앙값으로 합친다 (합친 값·각 볼) */
export function combineTones(tones: readonly SkinTone[]): SkinTone | null {
  if (!tones.length) return null;
  const med = (pick: (t: SkinTone) => Rgb | null): Rgb | null => {
    const v = tones.map(pick).filter((c): c is Rgb => c !== null);
    return v.length ? ([0, 1, 2].map((k) => median(v.map((c) => c[k]!))) as Rgb) : null;
  };
  const rgb = med((t) => t.rgb)!;
  return {
    ...describeRgb(rgb),
    cheeks: { R: med((t) => t.cheeks.R), L: med((t) => t.cheeks.L) },
    wbApplied: tones.filter((t) => t.wbApplied).length > tones.length / 2,
  };
}
