/**
 * 참고 사진의 색을 바로잡는 두 가지 (2026-10-07).
 *
 * 사진에서 그냥 뽑은 색은 **제품 색이 아니다.** 두 가지가 섞여 있다.
 *   ① 조명 — 노란 조명에서 찍으면 다 노랗게 나온다
 *   ② 피부 — 화장은 피부 위에 얇게 얹히므로 밑색이 비친다
 *
 * 둘 다 되돌릴 기준이 사진 안에 있다.
 *   ① 눈 흰자는 원래 무채색이다 → 흰자를 회색으로 만드는 채널 배수를 사진 전체에 건다
 *   ② 이마(화장 안 한 곳)가 그 사람의 피부색이다 → 거기서 화장 쪽으로 뻗는 방향을 본다
 *
 * 얼마나 효과가 있는지는 `docs/research/color-match-lighting-2026-10-07.md` 에 재 두었다.
 * 조명 흔들림 ΔE 9~13 → 0.4~2.2, 채도는 부위마다 10 가까이 제자리를 찾았다.
 *
 * **못 되돌리는 것**: 얼마나 두껍게 발랐는지. 그래서 "얼마나 진한 제품인가" 는 모른다
 * — 색 **방향**만 바로잡고 밝기는 보이는 대로 둔다. 호수를 딱 집지 않는 이유가 이것이다.
 */

import { EYE_A, EYE_B, FOREHEAD_POLY, pointInPoly } from "./color";
import type { RgbaImage } from "./color";
import type { Pt } from "./types";

export type Rgb = [number, number, number];

/** 흰자가 이보다 적게 잡히면 믿지 않는다 (눈 감음·옆얼굴·너무 작은 사진) */
const MIN_SCLERA = 24;
/** 이마 표본 최소 */
const MIN_SKIN = 60;
/** 흰자는 밝은 쪽만 — 아래쪽은 속눈썹 그림자가 섞인다 */
const SCLERA_KEEP_TOP = 0.3;

const lum = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function at(lm: readonly Pt[], i: number): Pt {
  return lm[i] ?? { x: 0, y: 0 };
}

/** 다각형 안의 픽셀을 모은다 (step 칸씩 건너뛰며) */
function pixelsIn(im: RgbaImage, poly: readonly Pt[], step: number, skip?: readonly Pt[]): Rgb[] {
  if (poly.length < 3) return [];
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const out: Rgb[] = [];
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...ys)));
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...xs)));
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInPoly(x, y, poly)) continue;
      if (skip && pointInPoly(x, y, skip)) continue;
      const i = (y * im.w + x) * 4;
      out.push([im.data[i] ?? 0, im.data[i + 1] ?? 0, im.data[i + 2] ?? 0]);
    }
  }
  return out;
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
const medianRgb = (px: readonly Rgb[]): Rgb =>
  [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))];

/**
 * 흰자를 회색으로 만드는 채널 배수.
 *
 * Lab 에서 a·b 를 **빼는** 방식도 써 봤지만 밝은 부위만 좋아지고 거의 검은 라이너는
 * 오히려 나빠졌다(ΔE 1.8 → 8.8). 조명 치우침은 밝기에 비례해 커지므로 빼기가 아니라
 * **배수**여야 한다 — 폰 카메라의 화이트밸런스와 같은 방식이다.
 *
 * 흰자를 못 찾으면 null — 그때는 보정 없이 간다 (틀린 보정보다 안 하는 것이 낫다).
 */
export function whiteBalanceGain(im: RgbaImage, lm: readonly Pt[], step = 2): Rgb | null {
  // 흰자가 이마 피부보다 어두우면 흰자를 못 찾은 것이다 — 짙은 속눈썹·큰 컬러렌즈·그늘진 눈.
  // 실제 참고 사진에서 "흰자" 가 #b1aaa4(밝기 174)로 나와 피부(196)보다 어두웠고,
  // 그 값으로 보정했더니 까만 아이라인이 갈색이 되고 립 색이 틀어졌다
  const skin = skinColor(im, lm, step);
  const px: Rgb[] = [];
  for (const eye of [EYE_A, EYE_B]) {
    const ring = eye.ring.map((i) => at(lm, i));
    const iris = eye.iris.map((i) => at(lm, i));
    px.push(...pixelsIn(im, ring, step, iris.length >= 3 ? iris : undefined));
  }
  if (px.length < MIN_SCLERA) return null;
  const ls = px.map((p) => lum(p[0], p[1], p[2])).sort((a, b) => a - b);
  const cut = ls[Math.floor(ls.length * (1 - SCLERA_KEEP_TOP))] ?? 0;
  const bright = px.filter((p) => lum(p[0], p[1], p[2]) >= cut);
  if (bright.length < MIN_SCLERA / 2) return null;
  const m = medianRgb(bright);
  const mean = (m[0] + m[1] + m[2]) / 3;
  if (mean < 1) return null;
  if (skin && lum(m[0], m[1], m[2]) < lum(skin[0], skin[1], skin[2])) return null;
  const g: Rgb = [mean / Math.max(m[0], 1), mean / Math.max(m[1], 1), mean / Math.max(m[2], 1)];
  // 터무니없는 보정은 믿지 않는다 (흰자를 잘못 잡은 것)
  if (g.some((v) => v < 0.6 || v > 1.7)) return null;
  return g;
}

/** 그 사람의 화장 안 한 피부색 (이마). 앞머리에 덮였으면 null */
export function skinColor(im: RgbaImage, lm: readonly Pt[], step = 2): Rgb | null {
  const px = pixelsIn(im, FOREHEAD_POLY.map((i) => at(lm, i)), step);
  if (px.length < MIN_SKIN) return null;
  return medianRgb(px);
}

/**
 * 피부를 걷어내 화장색의 **방향**을 되찾는다.
 *
 * 한 부위 안에서도 두껍게·얇게 발린 곳이 섞여 있다. 그 점들은 색 공간에서
 * 피부색 → 화장색으로 뻗는 한 줄기를 이룬다. 그 줄기의 끝이 가장 두껍게 발린 곳,
 * 곧 화장색에 가장 가까운 색이다.
 *
 * **밝기를 빼고 색기(chromaticity)로 본다.** 그냥 RGB 로 보면 줄기 방향이 두께가 아니라
 * **그림자**를 잡는다 — 얼굴 한 부위에서 가장 크게 변하는 것이 밝고 어두움이기 때문이다.
 * 실제로 그렇게 해 보니 되찾은 색이 전부 어두운 갈색으로 나왔다. 그림자는 세 채널을
 * 같은 비율로 깎으므로 밝기로 나누면 사라진다.
 *
 * 밝기는 보이는 그대로 둔다 — 두께를 모르므로 "얼마나 밝은 제품인가" 는 알 수 없다.
 */
export function unmixSkin(seen: Rgb, px: readonly Rgb[], skin: Rgb): Rgb {
  if (px.length < 40) return seen;
  const chroma = (p: Rgb): Rgb => {
    const s = p[0] + p[1] + p[2] || 1;
    return [p[0] / s, p[1] / s, p[2] / s];
  };
  const sc = chroma(skin);
  // 밝기 양 끝(하이라이트·짙은 그림자)은 뺀다
  const ls = px.map((p) => lum(p[0], p[1], p[2])).sort((a, b) => a - b);
  const lo = ls[Math.floor(ls.length * 0.12)] ?? 0, hi = ls[Math.floor(ls.length * 0.88)] ?? 255;
  const use = px.filter((p) => { const l = lum(p[0], p[1], p[2]); return l >= lo && l <= hi; });
  if (use.length < 40) return seen;

  const d = use.map((p) => { const c = chroma(p); return [c[0] - sc[0], c[1] - sc[1], c[2] - sc[2]] as Rgb; });
  const mean: Rgb = [0, 1, 2].map((k) => d.reduce((s, v) => s + v[k]!, 0) / d.length) as Rgb;
  // 평균 방향을 줄기 방향으로 쓴다 (주성분과 거의 같고 훨씬 가볍다)
  const len = Math.hypot(mean[0], mean[1], mean[2]);
  if (len < 1e-4) return seen;
  const dir: Rgb = [mean[0] / len, mean[1] / len, mean[2] / len];
  // 그 방향으로 얼마나 멀리 갔나 — 위쪽 분위수를 "가장 두껍게 발린 곳" 으로 본다
  const t = d.map((v) => v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]).sort((a, b) => a - b);
  const far = t[Math.floor(t.length * 0.97)] ?? 0;
  if (far <= 0) return seen;

  let c: Rgb = [sc[0] + dir[0] * far, sc[1] + dir[1] * far, sc[2] + dir[2] * far];
  c = c.map((v) => Math.max(v, 1e-4)) as Rgb;
  const sum = c[0] + c[1] + c[2];
  c = [c[0] / sum, c[1] / sum, c[2] / sum];
  // 밝기는 보이는 색 그대로 — 두께를 모르니 밝기는 손대지 않는다
  const want = lum(seen[0], seen[1], seen[2]);
  const k = want / Math.max(lum(c[0], c[1], c[2]), 1e-6);
  return [c[0] * k, c[1] * k, c[2] * k].map((v) => Math.max(0, Math.min(255, v))) as Rgb;
}
