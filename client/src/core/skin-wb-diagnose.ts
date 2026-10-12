/**
 * 흰자 보정이 왜 안 되는지 알려 주는 진단 (스파이크, 2026-10-12).
 *
 * core/ref-correct.ts whiteBalanceGain 은 실패하면 그냥 null 이라 이유를 모른다.
 * 여기서는 **같은 판정을 같은 순서로** 따라가며 어느 단계에서 막혔는지와 그때의 수치를 돌려준다.
 * 기존 함수와 결과가 다르면 안 되므로 시험(tests/skin-wb-diagnose.test.ts)이 합성 눈으로 둘을 맞대어 본다.
 * 기존 코드는 건드리지 않는다 — 상수·식을 그대로 복제했고, 본 구현에서 합칠 때 whiteBalanceGain 이 이 함수를 쓰게 하면 된다.
 */

import { EYE_A, EYE_B, pointInPoly } from "./color";
import type { RgbaImage } from "./color";
import { skinColor } from "./ref-correct";
import type { Rgb } from "./skin-color";
import type { Pt } from "./types";

/** whiteBalanceGain 과 같은 값 (ref-correct.ts) */
const MIN_SCLERA = 24;
const KEEP_TOP = 0.3;
const GAIN_MIN = 0.6, GAIN_MAX = 1.7;

export type WbReason =
  | "ok"
  | "few-pixels"        // 눈 안 표본이 MIN_SCLERA 미만 — 눈 감음 · 얼굴이 너무 작음
  | "few-bright"        // 밝은 30% 표본이 MIN_SCLERA/2 미만
  | "dark"              // 흰자 후보가 거의 검정
  | "darker-than-skin"  // 흰자 후보가 이마 피부보다 어두움 — 흰자를 못 찾은 것으로 본다
  | "gain-range"        // 배수가 0.6~1.7 밖 — 터무니없는 보정은 안 한다
  | "no-neutral";       // (상대 기준) 눈 안에 이마 피부와 색도가 충분히 다른 밝은 픽셀이 없음 — 흰자가 안 보임

export interface WbDiagnosis {
  reason: WbReason;
  /** 눈 안(홍채 뺀) 표본 수 */
  nEye: number;
  /** 그중 밝은 30% */
  nBright: number;
  /** 밝은 30% 의 채널별 중앙값 = 흰자 후보색 */
  sclera: Rgb | null;
  scleraLum: number | null;
  /** 이마 피부 중앙값 (앞머리로 덮였으면 null) */
  skin: Rgb | null;
  skinLum: number | null;
  /** whiteBalanceGain 이 돌려줄 값과 같다 (실패면 null) */
  gain: Rgb | null;
  /** "이마보다 어둡다" 검사만 건너뛰었다면 나왔을 배수. 배수 범위 검사는 그대로. 참고용 */
  gainIgnoringSkin: Rgb | null;
  /** 밝은 30% 표본의 좌표 (x,y 번갈아) — 화면에 그려 보려는 것 */
  brightXY: number[];
}

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const at = (lm: readonly Pt[], i: number): Pt => lm[i] ?? { x: 0, y: 0 };

/** ref-correct.ts 의 median 과 같다 (홀수는 가운데, 짝수는 위쪽 가운데) */
function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

interface Sample { x: number; y: number; rgb: Rgb }

/** ref-correct.ts pixelsIn 과 같은 순회에 좌표를 붙인 것 */
function samplesIn(im: RgbaImage, poly: readonly Pt[], step: number, skip?: readonly Pt[]): Sample[] {
  if (poly.length < 3) return [];
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const out: Sample[] = [];
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys)));
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs)));
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInPoly(x, y, poly)) continue;
      if (skip && pointInPoly(x, y, skip)) continue;
      const i = (y * im.w + x) * 4;
      out.push({ x, y, rgb: [im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0] });
    }
  }
  return out;
}

/**
 * 판정 방식.
 *  - legacy: 기존 whiteBalanceGain 과 같다 — 눈 안 밝은 30% 의 중앙값을 흰자로 보고, 이마 피부보다 어두우면 실패.
 *    걸리면 정확하지만(조명을 바꿔도 보정 후 색 차이 ΔE00 중앙값 0.48) 실제 얼굴 사진의 32% 에서만 걸린다 — 눈은 그늘 안이라 흰자가 이마보다 어두운 경우가 많다
 *  - relative: 이마 피부와 **색도가 얼마나 다른가** 로 흰자를 고른다 (스파이크 가설, 2026-10-12).
 *    조명 색은 R·G·B 채널별 곱이라서(색 항상성의 대각 모델) 같은 장면 안 두 색의 로그 색도 차이(ln R/G · ln B/G)는 조명이 바뀌어도 변하지 않는다.
 *    눈 안(홍채 원 뺌) 밝은 픽셀을 이 거리로 줄 세워 가장 먼 쪽 상위 topFrac 의 중앙값을 흰자로 본다. 밝기를 이마와 견주지 않는다.
 *    같은 사진 599장 · 인위적 조명 변화(따뜻/차갑) 실험: 성공 84% · 조명 바꿔도 보정 후 ΔE00 중앙값 0.83 (보정 안 하면 약 7~8).
 *    흰자를 조명 기준색으로 쓰는 방법은 문헌에 있지만(최·최·석 2017 · Maleš 외 2018) 픽셀을 고르는 세부 기준은 못 읽어서 이 기준은 자체 가설이다.
 *    고정 문턱(채도 상한 등)은 조명이 물들면 흰자가 피부와 안 갈려서 시험에서 탈락했다.
 */
export type WbMode = "legacy" | "relative";
export interface WbOptions {
  mode?: WbMode;
  /** relative: 이마와 가장 다른 색의 밝은 픽셀 중 상위 이 비율을 흰자로 본다 */
  topFrac?: number;
  /** relative: 뽑힌 픽셀의 이마와의 로그 색도 거리 중앙값이 이보다 작으면 흰자가 안 보이는 것으로 본다 */
  minDist?: number;
}
export const WB_RELATIVE = { topFrac: 0.25, minDist: 0.15, minLumRatio: 0.5, minPixels: 6 } as const;

/** 눈 안 표본 (홍채는 원으로 뺀다 — scleraLab 과 같은 1.15배 반지름) */
function eyeSamplesNoIris(im: RgbaImage, lm: readonly Pt[], step: number): Sample[] {
  const out: Sample[] = [];
  for (const eye of [EYE_A, EYE_B]) {
    const ring = eye.ring.map((i) => at(lm, i));
    const c = at(lm, eye.iris[0]);
    const rad = Math.max(...eye.iris.slice(1).map((i) => Math.hypot(at(lm, i).x - c.x, at(lm, i).y - c.y))) * 1.15;
    for (const s of samplesIn(im, ring, step)) if (Math.hypot(s.x - c.x, s.y - c.y) > rad) out.push(s);
  }
  return out;
}

export function diagnoseWhiteBalance(im: RgbaImage, lm: readonly Pt[], step = 2, opt: WbOptions = {}): WbDiagnosis {
  if (opt.mode === "relative") return diagnoseRelative(im, lm, step, opt.topFrac ?? WB_RELATIVE.topFrac, opt.minDist ?? WB_RELATIVE.minDist);
  const skin = skinColor(im, lm, step);
  const skinLum = skin ? lum(skin[0], skin[1], skin[2]) : null;
  const base: WbDiagnosis = { reason: "ok", nEye: 0, nBright: 0, sclera: null, scleraLum: null, skin, skinLum, gain: null, gainIgnoringSkin: null, brightXY: [] };

  const px: Sample[] = [];
  for (const eye of [EYE_A, EYE_B]) {
    const ring = eye.ring.map((i) => at(lm, i));
    const iris = eye.iris.map((i) => at(lm, i));
    px.push(...samplesIn(im, ring, step, iris.length >= 3 ? iris : undefined));
  }
  base.nEye = px.length;
  if (px.length < MIN_SCLERA) return { ...base, reason: "few-pixels" };

  const ls = px.map((p) => lum(...p.rgb)).sort((a, b) => a - b);
  const cut = ls[Math.floor(ls.length * (1 - KEEP_TOP))] ?? 0;
  const bright = px.filter((p) => lum(...p.rgb) >= cut);
  base.nBright = bright.length;
  base.brightXY = bright.flatMap((p) => [p.x, p.y]);
  if (bright.length < MIN_SCLERA / 2) return { ...base, reason: "few-bright" };

  const m: Rgb = [median(bright.map((p) => p.rgb[0])), median(bright.map((p) => p.rgb[1])), median(bright.map((p) => p.rgb[2]))];
  base.sclera = m;
  base.scleraLum = lum(m[0], m[1], m[2]);
  const mean = (m[0] + m[1] + m[2]) / 3;
  if (mean < 1) return { ...base, reason: "dark" };

  const g: Rgb = [mean / Math.max(m[0], 1), mean / Math.max(m[1], 1), mean / Math.max(m[2], 1)];
  const inRange = !g.some((v) => v < GAIN_MIN || v > GAIN_MAX);
  if (inRange) base.gainIgnoringSkin = g;
  if (skinLum !== null && base.scleraLum < skinLum) return { ...base, reason: "darker-than-skin" };
  if (!inRange) return { ...base, reason: "gain-range" };
  return { ...base, reason: "ok", gain: g };
}

/**
 * 상대 기준: 조명 색은 R·G·B 채널별 곱이라서(색 항상성의 대각 모델) 같은 장면 안 두 색의 로그 색도 차이
 * (ln R/G, ln B/G 의 차)는 조명이 바뀌어도 변하지 않는다. 그래서 "이마 피부와 색도가 얼마나 다른가"는 조명 색에 흔들리지 않는다.
 * 눈 안(홍채 원 뺌) 밝은 픽셀(이마 밝기의 minLumRatio 이상)을 이 거리로 줄 세워 가장 먼 쪽 topFrac 의 중앙값을 흰자로 본다.
 * 이마 피부를 못 쟀으면(앞머리) 기준이 없어서 실패.
 */
function diagnoseRelative(im: RgbaImage, lm: readonly Pt[], step: number, topFrac: number, minDist: number): WbDiagnosis {
  const N = WB_RELATIVE;
  const skin = skinColor(im, lm, step);
  const skinLum = skin ? lum(skin[0], skin[1], skin[2]) : null;
  const base: WbDiagnosis = { reason: "ok", nEye: 0, nBright: 0, sclera: null, scleraLum: null, skin, skinLum, gain: null, gainIgnoringSkin: null, brightXY: [] };

  const px = eyeSamplesNoIris(im, lm, step);
  base.nEye = px.length;
  if (px.length < MIN_SCLERA) return { ...base, reason: "few-pixels" };
  if (!skin || skinLum === null) return { ...base, reason: "no-neutral" };

  const logChroma = (c: Rgb): [number, number] => [Math.log(Math.max(c[0], 1) / Math.max(c[1], 1)), Math.log(Math.max(c[2], 1) / Math.max(c[1], 1))];
  const [us, vs] = logChroma(skin);
  const lit = px.filter((p) => lum(...p.rgb) >= skinLum * N.minLumRatio)
    .map((p) => { const [u, v] = logChroma(p.rgb); return { p, d: Math.hypot(u - us, v - vs) }; });
  if (lit.length < N.minPixels) return { ...base, reason: "no-neutral" };

  lit.sort((a, b) => b.d - a.d);
  const kept = lit.slice(0, Math.max(N.minPixels, Math.ceil(lit.length * topFrac)));
  base.nBright = kept.length;
  base.brightXY = kept.flatMap((k) => [k.p.x, k.p.y]);
  const medDist = kept.map((k) => k.d).sort((a, b) => a - b)[kept.length >> 1]!;
  const m: Rgb = [median(kept.map((k) => k.p.rgb[0])), median(kept.map((k) => k.p.rgb[1])), median(kept.map((k) => k.p.rgb[2]))];
  base.sclera = m;
  base.scleraLum = lum(m[0], m[1], m[2]);
  if (medDist < minDist) return { ...base, reason: "no-neutral" };
  const mean = (m[0] + m[1] + m[2]) / 3;
  if (mean < 1) return { ...base, reason: "dark" };
  const g: Rgb = [mean / Math.max(m[0], 1), mean / Math.max(m[1], 1), mean / Math.max(m[2], 1)];
  if (g.some((v) => v < GAIN_MIN || v > GAIN_MAX)) return { ...base, reason: "gain-range" };
  base.gainIgnoringSkin = g;
  return { ...base, reason: "ok", gain: g };
}

export const WB_REASON_TEXT: Record<WbReason, string> = {
  ok: "성공",
  "few-pixels": "눈 안 표본이 너무 적음 (눈 감음 · 얼굴이 작음)",
  "few-bright": "밝은 표본이 너무 적음",
  dark: "흰자 후보가 거의 검정",
  "darker-than-skin": "흰자 후보가 이마 피부보다 어두움",
  "gain-range": "보정 배수가 0.6~1.7 밖 (조명 색이 너무 강하거나 흰자를 잘못 잡음)",
  "no-neutral": "눈 안에 이마 피부와 색이 충분히 다른 밝은 픽셀이 없음 (흰자가 안 보임 · 이마를 못 잼)",
};
