/**
 * 참고 사진에서 부위별로 "쓴 색" 을 뽑는다 (2026-10-06, 새 흐름).
 *
 * 영역 평균을 그냥 내면 피부가 섞여서 못 쓴다. 부위마다 화장 픽셀을 고르는 규칙이 다르다 —
 * 아래 BANDS 가 그 규칙이고, 참고 사진 한 장으로 미리 맞춰 본 값이다. 특히 섀도우는
 * 눈꺼풀선 바로 위(속눈썹·라이너 자리)를 빼지 않으면 섀도우가 아니라 라인 색이 나온다.
 *
 * 영역 점 번호는 regions.ts 와 같은 것을 쓴다 — 부위 영역의 단일 소스는 거기 하나다.
 * 다만 **여기 들어오는 얼굴 점은 픽셀 좌표다** (Baseline.lm 과 같은 규약). regions.ts 의
 * buildRegions 는 0~1 정규화 점을 받으니 섞지 않는다.
 */

import { labAt, pointInPoly, rgbToLab } from "./color";
import type { RgbaImage } from "./color";
import { nearestFamily, rgbToHex } from "./color-family";
import type { FamilyMatch, PalettePart } from "./color-family";
import { BROW, EYES } from "./regions";
import type { Pt } from "./types";

export interface RefColor {
  /** 사진에서 뽑은 색 — 화면에 **이 색** 을 보여 준다 */
  hex: string;
  rgb: [number, number, number];
  /** 이름을 붙이려고 찾은 가장 가까운 팔레트 색 */
  match: FamilyMatch;
  /** 색을 고른 픽셀 수. 적으면 믿을 수 없다 */
  n: number;
}

export type RefColors = Partial<Record<PalettePart, RefColor>>;

/** 영역 안에서 쓸 밝기 분위수 구간(%). 양 끝을 잘라 속눈썹·하이라이트·주근깨를 뺀다 */
const BANDS: Record<PalettePart, readonly [number, number]> = {
  brow: [5, 35],      // 눈썹 털만 — 사이로 보이는 피부를 뺀다
  liner: [0, 10],     // 가장 어두운 쪽만
  shadow: [25, 75],   // 가운데 밝기 — 속눈썹과 글리터를 뺀다
  lip: [40, 85],      // 밝은 쪽 — 입 벌어진 틈과 경계선을 뺀다
  cheek: [30, 80],    // 가운데 밝기 — 주근깨와 하이라이트를 뺀다
};

/** 믿을 만하다고 보는 최소 픽셀 수. 이보다 적으면 그 부위는 안 내보낸다 */
const MIN_PX = 60;

const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;
const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
} as const;

/** 눈꺼풀선에서 눈썹 쪽으로 lo~hi 비율 구간의 띠 */
function lidBand(lm: readonly Pt[], side: "R" | "L", lo: number, hi: number): Pt[] {
  const brow = BROW[side].map((i) => lm[i]).filter((p): p is Pt => !!p);
  if (!brow.length) return [];
  const bc = {
    x: brow.reduce((s, p) => s + p.x, 0) / brow.length,
    y: brow.reduce((s, p) => s + p.y, 0) / brow.length,
  };
  const lid = EYES[side].upper.map((i) => lm[i]).filter((p): p is Pt => !!p);
  const at = (t: number): Pt[] => lid.map((p) => ({ x: p.x + (bc.x - p.x) * t, y: p.y + (bc.y - p.y) * t }));
  return [...at(lo), ...at(hi).reverse()];
}

function polysOf(lm: readonly Pt[], part: PalettePart): Pt[][] {
  const take = (ids: readonly number[]): Pt[] => ids.map((i) => lm[i]).filter((p): p is Pt => !!p);
  switch (part) {
    case "brow": return [take(BROW.R), take(BROW.L)];
    // 라이너는 눈꺼풀선 바로 위 얇은 띠, 섀도우는 그보다 위 칸 — 둘이 겹치면 라인 색이 섀도우로 샌다
    case "liner": return [lidBand(lm, "R", 0, 0.15), lidBand(lm, "L", 0, 0.15)];
    case "shadow": return [lidBand(lm, "R", 0.2, 0.7), lidBand(lm, "L", 0.2, 0.7)];
    case "lip": return [take(LIPS)];
    case "cheek": return [take(CHEEK.R), take(CHEEK.L)];
  }
}

interface Px { r: number; g: number; b: number; L: number }

function collect(im: RgbaImage, polys: readonly Pt[][], step: number): Px[] {
  const out: Px[] = [];
  for (const poly of polys) {
    if (poly.length < 3) continue;
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys)));
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs)));
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        if (!pointInPoly(x, y, poly)) continue;
        const i = (y * im.w + x) * 4;
        const r = im.data[i] ?? 0, g = im.data[i + 1] ?? 0, b = im.data[i + 2] ?? 0;
        out.push({ r, g, b, L: labAt(im, x, y).L });
      }
    }
  }
  return out;
}

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round((q / 100) * (sorted.length - 1))));
  return sorted[i]!;
}

/** 한 부위의 색. 픽셀이 모자라면 null — 가려졌거나(앞머리에 덮인 눈썹) 사진이 작다 */
export function refPartColor(im: RgbaImage, lm: readonly Pt[], part: PalettePart, step = 2): RefColor | null {
  const px = collect(im, polysOf(lm, part), step);
  if (px.length < MIN_PX) return null;
  const [lo, hi] = BANDS[part];
  const ls = px.map((p) => p.L).sort((a, b) => a - b);
  const a = quantile(ls, lo), b = quantile(ls, hi);
  const keep = px.filter((p) => p.L >= a && p.L <= b);
  const use = keep.length >= MIN_PX ? keep : px;
  const n = use.length;
  const rgb: [number, number, number] = [
    use.reduce((s, p) => s + p.r, 0) / n,
    use.reduce((s, p) => s + p.g, 0) / n,
    use.reduce((s, p) => s + p.b, 0) / n,
  ];
  return { hex: rgbToHex(rgb[0], rgb[1], rgb[2]), rgb, match: nearestFamily(rgb, part), n };
}

export const REF_PARTS: readonly PalettePart[] = ["brow", "liner", "shadow", "lip", "cheek"];

/** 참고 사진 한 장에서 부위별 색을 전부. 못 뽑은 부위는 빠진다 */
export function refColors(im: RgbaImage, lm: readonly Pt[], step = 2): RefColors {
  const out: RefColors = {};
  for (const part of REF_PARTS) {
    const c = refPartColor(im, lm, part, step);
    if (c) out[part] = c;
  }
  return out;
}

/** 비화장 기준 피부색(이마)과 얼마나 다른가 — 볼터치처럼 피부 위 얇은 색이 실제로 올라갔는지 보는 데 쓴다 */
export function awayFromSkin(c: RefColor, skin: readonly [number, number, number]): number {
  const a = rgbToLab(c.rgb[0], c.rgb[1], c.rgb[2]);
  const b = rgbToLab(skin[0], skin[1], skin[2]);
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}
