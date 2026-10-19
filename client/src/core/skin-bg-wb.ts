/**
 * 흰 배경을 흰색 기준으로 쓰는 조명 보정 (스파이크, 2026-10-13).
 *
 * 흰자 기준(core/skin-wb-diagnose)은 눈이 작거나 감기면 못 구하고, 데이터셋에서는 오히려 웜/쿨을 덜 갈랐다.
 * 대신 사용자에게 "흰 벽 · 흰 종이 앞에서 찍어 주세요" 라고 부탁하고, 얼굴 둘레의 배경 색을 중립(흰/회색)으로 맞춘다.
 *  - 배경이 흰지는 믿지 않고 **검사**한다 (밝고 색이 거의 없는가). 통과 못 하면 보정하지 않고 "배경을 바꿔 다시" 로 돌려보낸다.
 *  - 배경 표본: 얼굴 상자 바깥 — 좌우 옆 · 이마 위쪽. 머리카락 · 어깨가 섞이므로 밝은 쪽 절반의 채널별 중앙값만 쓴다.
 *  - 배수 = 세 채널 평균 ÷ 채널값 (밝기는 그대로 두고 색 치우침만 편다). 흰자 기준과 같은 0.6~1.7 상한.
 * 순수 함수. 화면 · 일괄 측정은 skin-tone-probe · skin-batch-probe.
 */

import { rgbToLab } from "./color";
import type { RgbaImage } from "./color";
import type { Rgb } from "./skin-color";
import type { Pt } from "./types";

export interface BgSample {
  /** 배경 후보의 채널별 중앙값 (보정 전 sRGB) */
  rgb: Rgb;
  /** 쓴 표본 수 */
  n: number;
  /** 그 색의 L* · 채도 C* */
  L: number;
  chroma: number;
}

export interface BgLimits {
  /** 이보다 어두우면 흰 배경이 아니라고 본다 (L*) */
  minL: number;
  /** 이보다 색이 진하면 흰 배경이 아니라고 본다 (C*) */
  maxChroma: number;
  minSamples: number;
  gainMin: number;
  gainMax: number;
}
/** 가정값 — 노란 조명이 든 흰 벽도 C* 13 안팎이라 넉넉히 둔다 (연한 색 벽은 못 거른다). 데이터셋 사진 분포를 보고 다시 정한다 */
export const BG_LIMITS: BgLimits = { minL: 75, maxChroma: 18, minSamples: 200, gainMin: 0.6, gainMax: 1.7 };

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 배경 표본을 뽑는 곳: x < left 또는 x > right 또는 y < top (얼굴 상자 바깥) */
export function backgroundBounds(lm: readonly Pt[]): { left: number; right: number; top: number } | null {
  if (!lm.length) return null;
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const fw = x1 - x0, fh = y1 - y0;
  return { left: x0 - 0.3 * fw, right: x1 + 0.3 * fw, top: y0 - 0.6 * fh };
}

/** 얼굴 둘레 배경 표본의 색. 표본이 모자라면 null (얼굴이 화면을 거의 다 채움 등) */
export function sampleBackground(im: RgbaImage, lm: readonly Pt[], step = 4, limits: BgLimits = BG_LIMITS): BgSample | null {
  const bounds = backgroundBounds(lm);
  if (!bounds) return null;
  const { left, right, top } = bounds;

  const px: { r: number; g: number; b: number; y: number }[] = [];
  for (let y = 0; y < im.h; y += step) {
    for (let x = 0; x < im.w; x += step) {
      if (!(x < left || x > right || y < top)) continue;
      const i = (y * im.w + x) * 4;
      const r = im.data[i] ?? 0, g = im.data[i + 1] ?? 0, b = im.data[i + 2] ?? 0;
      px.push({ r, g, b, y: lum(r, g, b) });
    }
  }
  if (px.length < limits.minSamples) return null;
  px.sort((p, q) => p.y - q.y);
  const bright = px.slice(px.length >> 1);
  const rgb: Rgb = [median(bright.map((p) => p.r)), median(bright.map((p) => p.g)), median(bright.map((p) => p.b))];
  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { rgb, n: bright.length, L: lab.L, chroma: Math.hypot(lab.a, lab.b) };
}

/** 배경이 흰(중립이고 밝은) 색으로 보이는가 */
export function isWhiteBackground(bg: BgSample | null, limits: BgLimits = BG_LIMITS): boolean {
  return !!bg && bg.L >= limits.minL && bg.chroma <= limits.maxChroma;
}

/** 배경을 중립으로 만드는 채널 배수. 흰 배경이 아니거나 배수가 상한을 넘으면 null */
export function backgroundGain(bg: BgSample | null, limits: BgLimits = BG_LIMITS): Rgb | null {
  if (!bg || !isWhiteBackground(bg, limits)) return null;
  const mean = (bg.rgb[0] + bg.rgb[1] + bg.rgb[2]) / 3;
  if (mean <= 0 || bg.rgb.some((c) => c <= 0)) return null;
  const gain = bg.rgb.map((c) => mean / c) as Rgb;
  return gain.every((g) => g >= limits.gainMin && g <= limits.gainMax) ? gain : null;
}
