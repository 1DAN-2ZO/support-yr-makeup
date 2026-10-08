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
import { rgbToHex } from "./color-family";
import { skinColor, unmixSkin, whiteBalanceGain } from "./ref-correct";
import type { Rgb } from "./ref-correct";
import type { PalettePart } from "./color-family";
import { describeColor } from "./color-name";
import type { ColorName } from "./color-name";
import { BROW, EYES } from "./regions";
import type { Pt } from "./types";

export interface RefColor {
  /**
   * 사진에 **보이는 그대로의 색.** 색조 팔레트 화면이 이것을 보여 준다 —
   * 그 화면이 하는 일은 "이 사진의 화장이 어떤 색인가" 를 말하는 것이므로,
   * 눈에 보이는 색과 달라지면 안 된다.
   */
  hex: string;
  rgb: [number, number, number];
  /** 보이는 색으로 지은 이름 */
  name: ColorName;
  /**
   * 조명·피부를 걷어낸 색. **제품을 고를 때 이것을 쓴다** —
   * 제품은 피부에 섞이지 않은 상태라 보이는 색과 바로 비교할 수 없다.
   * 기준(흰자·이마)을 못 찾으면 보이는 색과 같다.
   */
  product: { hex: string; rgb: [number, number, number]; name: ColorName };
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

/**
 * 피부를 걷어낼 부위. **얇게 얹혀 밑색이 비치는 것만** 해당한다.
 *
 * 눈썹·아이라인은 피부를 거의 덮어서 "피부에서 뻗는 방향" 계산이 안 맞는다.
 * 실제로 넣어 봤더니 까만 아이라인이 "뮤트 다크브라운" 으로 바뀌었다 — 거의 검은색에
 * 억지로 색기를 더한 꼴이다. 조명 보정(화이트밸런스)은 모든 부위에 그대로 건다.
 */
const UNMIX: readonly PalettePart[] = ["shadow", "cheek", "lip"];

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

/**
 * 한 부위의 색. 픽셀이 모자라면 null — 가려졌거나(앞머리에 덮인 눈썹) 사진이 작다.
 *
 * `fix` 를 주면 조명·피부를 되돌린 색을 돌려준다 (ref-correct.ts). 안 주면 보이는 그대로.
 */
export function refPartColor(
  im: RgbaImage, lm: readonly Pt[], part: PalettePart, step = 2,
  fix?: { gain: Rgb | null; skin: Rgb | null },
): RefColor | null {
  const px = collect(im, polysOf(lm, part), step);
  if (px.length < MIN_PX) return null;
  const [lo, hi] = BANDS[part];
  const ls = px.map((p) => p.L).sort((a, b) => a - b);
  const a = quantile(ls, lo), b = quantile(ls, hi);
  const keep = px.filter((p) => p.L >= a && p.L <= b);
  const use = keep.length >= MIN_PX ? keep : px;
  const n = use.length;
  // ① 보이는 색 — 아무것도 걷어내지 않은 그대로
  const seen: Rgb = [0, 1, 2].map((k) => {
    const key = (["r", "g", "b"] as const)[k]!;
    return use.reduce((s, p) => s + p[key], 0) / n;
  }) as Rgb;

  // ② 제품 고를 때 쓸 색 — 조명·피부를 걷어낸 것
  const g = fix?.gain;
  const w = (p: Px): Rgb => (g ? [p.r * g[0], p.g * g[1], p.b * g[2]] : [p.r, p.g, p.b]);
  let prod: Rgb = g ? ([0, 1, 2].map((k) => use.reduce((s, p) => s + w(p)[k]!, 0) / n) as Rgb) : seen;
  if (fix?.skin && UNMIX.includes(part)) {
    const skin: Rgb = g ? [fix.skin[0] * g[0], fix.skin[1] * g[1], fix.skin[2] * g[2]] : fix.skin;
    prod = unmixSkin(prod, use.map(w), skin);
  }

  return {
    hex: rgbToHex(seen[0], seen[1], seen[2]), rgb: seen, name: describeColor(seen, part),
    product: { hex: rgbToHex(prod[0], prod[1], prod[2]), rgb: prod, name: describeColor(prod, part) },
    n,
  };
}

export const REF_PARTS: readonly PalettePart[] = ["brow", "liner", "shadow", "lip", "cheek"];

/**
 * 참고 사진 한 장에서 부위별 색을 전부. 못 뽑은 부위는 빠진다.
 *
 * 부위마다 색을 **두 벌** 돌려준다 — 사진에 보이는 색과, 제품을 고를 때 쓸 색.
 * 두 화면이 하는 일이 달라서다 (RefColor 주석 참고).
 *
 * 조명·피부 보정을 **한 번만 구해** 모든 부위가 나눠 쓴다. 기준을 못 찾으면
 * (흰자가 안 보이거나 앞머리가 이마를 덮으면) 그 보정만 빼고 나머지는 그대로 간다 —
 * 틀린 보정보다 안 하는 것이 낫다.
 */
export function refColors(im: RgbaImage, lm: readonly Pt[], step = 2): RefColors {
  const fix = { gain: whiteBalanceGain(im, lm, step), skin: skinColor(im, lm, step) };
  const out: RefColors = {};
  for (const part of REF_PARTS) {
    const c = refPartColor(im, lm, part, step, fix);
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
