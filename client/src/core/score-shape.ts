/**
 * 결과 모양 채점 (실험, score-shape 브랜치 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서 잰다.
 *
 * 지금 채점(score-part)은 "맨얼굴 대비 바뀐 칸 = 그린 곳" 이라, 원래 눈썹이 이미 가이드 모양인 사람은 "안 보임" 이 된다.
 * 팀 방향(2026-10-01): 눈썹이 이미 정답 모양이면 무시하지 않는다 → 채움은 "원래 있던 것 + 그린 것" 으로 본다.
 * 여기는 그 채움을 맨얼굴 없이 재는 쪽 — 기준은 같은 사진의 **주변 피부**라서 두 사진의 조명·크기 차이에 안 흔들린다 (#261).
 *
 * 아직 앱에 연결하지 않았다. 합성 세트(eval/samples)로 지금 방식과 비교한 뒤 팀이 정한다.
 */

import { pointInPoly, rgbToLab, type Lab } from "./color";
import { boxOf, isHair, labBox, type SampleFrame } from "./sampling";
import type { LinerStrip } from "./score";
import type { Pt } from "./types";

export interface ShapeFillOptions {
  /** 주변 피부보다 L* 가 이만큼 어두우면 "있는 칸" (가정값 — 그림자·잡티는 4~6 쯤) */
  darkL: number;
  /** 주변 피부 띠: 가이드를 가운데 기준으로 이 배율만큼 키운 것에서 안쪽 배율까지를 뺀 것 (sampleRegion 과 같은 1.3~1.8) */
  ring: readonly [number, number];
}
export const SHAPE_FILL: ShapeFillOptions = { darkL: 12, ring: [1.3, 1.8] };

export interface ShapeFill {
  /** 가이드 안 칸 중 "있는 칸" 비율 (0~1). 머리카락에 가린 칸은 뺀다 */
  coverage: number;
  /** 센 칸 수 */
  n: number;
  /** 주변 피부 (못 재면 null — coverage 0) */
  skin: Lab | null;
}

const scale = (poly: readonly Pt[], k: number): Pt[] => {
  const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
};
const medianOf = (v: number[]): number => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

/** 가이드 다각형 안을 칸으로 훑어, 주변 피부보다 뚜렷이 어두운 칸의 비율을 낸다 (눈썹·라이너처럼 어둡게 그리는 부위) */
export function shapeFill(f: SampleFrame, poly: readonly Pt[], opt: ShapeFillOptions = SHAPE_FILL): ShapeFill {
  const box = boxOf(f.unit.eye);
  const hole = scale(poly, opt.ring[0]), outer = scale(poly, opt.ring[1]);
  const cells = (region: readonly Pt[], keep: (x: number, y: number) => boolean): Lab[] => {
    const xs = region.map((p) => p.x), ys = region.map((p) => p.y), out: Lab[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.ceil(Math.max(...ys))); y += box) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.ceil(Math.max(...xs))); x += box) {
        if (pointInPoly(x, y, region) && keep(x, y) && !isHair(f, x, y)) out.push(labBox(f.im, x, y, box));
      }
    }
    return out;
  };
  const ring = cells(outer, (x, y) => !pointInPoly(x, y, hole));
  if (!ring.length) return { coverage: 0, n: 0, skin: null };
  const skin: Lab = { L: medianOf(ring.map((c) => c.L)), a: medianOf(ring.map((c) => c.a)), b: medianOf(ring.map((c) => c.b)) };
  const inside = cells(poly, () => true);
  const hit = inside.filter((c) => skin.L - c.L >= opt.darkL).length;
  return { coverage: inside.length ? hit / inside.length : 0, n: inside.length, skin };
}

// ---------- 템플릿 색 쪽으로 물든 정도 (입술·섀도우·볼) ----------


/** 템플릿 방향에서 옆으로 벗어난 거리 ÷ 피부→템플릿 거리. 0 이면 딱 그 길 위 */
export function tintOff(cell: Lab, skin: Lab, target: Lab): number {
  const t = { L: target.L - skin.L, a: target.a - skin.a, b: target.b - skin.b };
  const tt = t.L * t.L + t.a * t.a + t.b * t.b;
  if (tt < 1) return 0;
  const p = tintProgress(cell, skin, target);
  return Math.hypot(cell.L - skin.L - p * t.L, cell.a - skin.a - p * t.a, cell.b - skin.b - p * t.b) / Math.sqrt(tt);
}

/**
 * 주변 피부(0)에서 템플릿 색(1)까지 가는 길 위에서 이 칸이 어디쯤인가 — 색 차이 벡터의 정사영.
 * 템플릿과 다른 쪽으로 물든 색(빨강 템플릿에 파랑)은 0 근처나 음수가 된다
 */
export function tintProgress(cell: Lab, skin: Lab, target: Lab): number {
  const t = { L: target.L - skin.L, a: target.a - skin.a, b: target.b - skin.b };
  const tt = t.L * t.L + t.a * t.a + t.b * t.b;
  if (tt < 1) return 0;   // 템플릿이 피부와 같은 색 — 잴 방향이 없다 (subtle 로 갈 일)
  return ((cell.L - skin.L) * t.L + (cell.a - skin.a) * t.a + (cell.b - skin.b) * t.b) / tt;
}

export interface TintFillOptions {
  /** 이만큼 템플릿 쪽으로 갔으면 "물든 칸" (가정값 — 실제로 덮는 비율 0.7 의 절반) */
  minProgress: number;
  /** 템플릿 방향에서 옆으로 벗어난 거리가 (피부→템플릿 거리 × 이 값)을 넘으면 다른 색으로 본다 (가정값) */
  maxOff: number;
  ring: readonly [number, number];
  /** 주변 피부 색을 밖에서 줄 때 (이마 등). 안 주면 가이드 둘레 띠의 중앙값 */
  skin?: Lab;
  /** 가이드 안에서 빼는 구멍 (입 안쪽) */
  hole?: readonly Pt[];
}
export const TINT_FILL = { minProgress: 0.35, maxOff: 0.6, ring: [1.3, 1.8] as const };

export interface TintFill {
  /** 가이드 안 칸 중 물든 칸 비율 */
  coverage: number;
  /** 가이드 밖(안쪽 띠 배율까지) 칸 중 물든 칸 비율 — 범위가 넘쳤나 */
  spill: number;
  /** 물든 칸의 평균 진행도 — 얼마나 진하게 */
  strength: number;
  n: number;
  skin: Lab | null;
}

/** 가이드 다각형 안·바로 밖을 칸으로 훑어, 템플릿 색 쪽으로 물든 칸의 비율을 낸다 */
export function tintFill(f: SampleFrame, poly: readonly Pt[], color: readonly [number, number, number], o: Partial<TintFillOptions> = {}): TintFill {
  const opt = { ...TINT_FILL, ...o };
  const box = boxOf(f.unit.eye), target = rgbToLab(color[0], color[1], color[2]);
  const near = scale(poly, opt.ring[0]), far = scale(poly, opt.ring[1]);
  const cells = (region: readonly Pt[], keep: (x: number, y: number) => boolean): Lab[] => {
    const xs = region.map((p) => p.x), ys = region.map((p) => p.y), out: Lab[] = [];
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.ceil(Math.max(...ys))); y += box) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.ceil(Math.max(...xs))); x += box) {
        if (pointInPoly(x, y, region) && keep(x, y) && !isHair(f, x, y)) out.push(labBox(f.im, x, y, box));
      }
    }
    return out;
  };
  let skin = opt.skin ?? null;
  if (!skin) {
    const ring = cells(far, (x, y) => !pointInPoly(x, y, near));
    if (ring.length) skin = { L: medianOf(ring.map((c) => c.L)), a: medianOf(ring.map((c) => c.a)), b: medianOf(ring.map((c) => c.b)) };
  }
  if (!skin) return { coverage: 0, spill: 0, strength: 0, n: 0, skin: null };
  const s = skin, hole = opt.hole;
  // 템플릿 쪽으로 간 정도. 옆으로 많이 벗어난 색(빨강 템플릿에 파랑)은 0 으로 친다
  const prog = (c: Lab): number => (tintOff(c, s, target) > opt.maxOff ? 0 : tintProgress(c, s, target));
  const inside = cells(poly, (x, y) => !hole || !pointInPoly(x, y, hole)).map(prog);
  const around = cells(near, (x, y) => !pointInPoly(x, y, poly)).map(prog);
  const hits = inside.filter((v) => v >= opt.minProgress);
  return {
    coverage: inside.length ? hits.length / inside.length : 0,
    spill: around.length ? around.filter((v) => v >= opt.minProgress).length / around.length : 0,
    strength: hits.length ? hits.reduce((a, v) => a + v, 0) / hits.length : 0,
    n: inside.length,
    skin,
  };
}

// ---------- 라이너 띠 ----------

export interface LinerBand {
  /** 눈꺼풀 선 위 어두운 띠의 두께 중앙값 (눈 폭 비율). 원래 속눈썹 선도 포함한다 */
  thickness: number;
  /** 눈꺼풀 줄 중 어두운 띠가 있는 줄의 비율 */
  lidCoverage: number;
  /** 꼬리 줄 중 가이드 꼬리 선 근처에 어두운 칸이 있는 줄의 비율 — 눈꼬리 밖 피부엔 원래 어두운 게 없다 */
  wingCoverage: number;
}

/** 라이너 띠 샘플(sampleLiner) 한 장에서 두께·꼬리를 잰다. 기준 피부는 띠의 맨 위 칸들(눈꺼풀 피부) */
export function linerBand(strip: LinerStrip, darkL = SHAPE_FILL.darkL): LinerBand {
  const { offs, isWing, thick } = strip.meta, step = offs.length > 1 ? offs[1]! - offs[0]! : 0;
  const top = strip.lab.flatMap((row) => row.filter((_, j) => (offs[j] ?? 0) >= offs[offs.length - 1]! - 2 * step));
  if (!top.length) return { thickness: 0, lidCoverage: 0, wingCoverage: 0 };
  const skinL = medianOf(top.map((c) => c.L));
  const dark = (c: Lab): boolean => skinL - c.L >= darkL;
  const widths: number[] = [];
  let lidRows = 0, lidHit = 0, wingRows = 0, wingHit = 0;
  strip.lab.forEach((row, i) => {
    if (isWing[i]) {
      // 꼬리의 앞 20% 는 뺀다 — 눈꼬리에 붙은 속눈썹 끝이 걸린다
      if ((strip.meta.tFromCorner[i] ?? 0) < strip.meta.wingLen * 0.2) return;
      wingRows++;
      const reach = Math.max(thick, 2 * step);
      if (row.some((c, j) => Math.abs(offs[j] ?? 0) <= reach && dark(c))) wingHit++;
      return;
    }
    lidRows++;
    // 속눈썹 선(0)에서 위로 이어지는 어두운 칸 수 — 선 아래는 눈알이라 안 본다
    let n = 0, started = false;
    for (let j = 0; j < row.length; j++) {
      if ((offs[j] ?? 0) < -step) continue;
      if (dark(row[j]!)) { n++; started = true; } else if (started) break;
    }
    if (n > 0) { lidHit++; widths.push(n * step); }
  });
  return {
    thickness: widths.length ? Math.max(0, medianOf(widths) - (strip.meta.blur ?? 0)) : 0,
    lidCoverage: lidRows ? lidHit / lidRows : 0,
    wingCoverage: wingRows ? wingHit / wingRows : 0,
  };
}
