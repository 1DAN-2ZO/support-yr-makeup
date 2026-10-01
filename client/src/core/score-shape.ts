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
import { LM, at } from "./landmarks";
import { PARAMS, browResult, scoreForm, type DecideContext, type LinerStrip, type PartScore, type RegionSideMetrics, type ScoreParams, type Side } from "./score";
import { scorePart, type GuideSource, type ScorePartOptions } from "./score-part";
import type { PartId, Pt } from "./types";

export interface ShapeFillOptions {
  /**
   * 주변 피부보다 L* 가 적어도 이만큼 어두워야 "있는 칸".
   * 실제 기준은 (그 사람 눈썹 진하기 × darkFrac)와 이 값 중 큰 쪽: EasyPortrait 눈썹 455개에서 피부와 밝기 차가
   * 중앙 17 · 열 중 하나는 8 이하라, 12 로 고정하면 연한 눈썹을 놓쳤다 (평균 오차 24%p).
   * 세 값(4 · 0.35 · 0.25)은 EasyPortrait 정답 눈썹 마스크에 맞춘 것 — 사람 단위로 반 나눠 236개로 맞추고 224개로 확인 (2026-10-01):
   * 칸 단위로 "눈썹이라 한 칸 중 맞은 비율" 83% · "실제 눈썹 칸 중 찾은 비율" 84% · IoU 0.71.
   * 성긴 꼬리 쪽은 덜 잡는다(찾은 비율 71%) — 정답 마스크는 "눈썹 자리", 이 값은 "보이는 진하기" 라서
   */
  minDark: number;
  /** 눈썹 진하기(피부와의 밝기 차)의 이 비율보다 어두우면 "있는 칸" */
  darkFrac: number;
  /** 눈썹 진하기로 보는 지점 — 안쪽 칸을 어두운 순으로 늘어놓은 이 자리 */
  darkPct: number;
  /** 주변 피부 띠: 가이드에서 이 거리(눈 폭 비율)만큼 떨어진 바깥 칸. 가운데 기준으로 키우면 길쭉한 눈썹에선 띠가 좌우 끝에 몰린다 */
  band: readonly [number, number];
}
export const SHAPE_FILL: ShapeFillOptions = { minDark: 4, darkFrac: 0.35, darkPct: 0.25, band: [0.1, 0.28] };

export interface ShapeFill {
  /** 가이드 안 칸 중 "있는 칸" 비율 (0~1). 머리카락에 가린 칸은 뺀다 */
  coverage: number;
  /** 가이드 바로 밖(주변 피부 띠보다 안쪽) 칸 중 "있는 칸" 비율 — 가이드보다 넘친 정도. 원래 눈썹과 그린 것을 가리지 않는다 */
  spill: number;
  /** 꼬리 쪽 칸의 채움 (tailFrom 을 줬을 때만 — 그 점에서 먼 쪽 40%) */
  tailCoverage: number | null;
  /** 가이드 안 "있는 칸" 수 */
  hits: number;
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

/** 점에서 다각형 가장자리까지 거리 */
function distToEdge(x: number, y: number, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

/** 가이드 다각형 안을 칸으로 훑어, 주변 피부보다 뚜렷이 어두운 칸의 비율을 낸다 (눈썹처럼 어둡게 그리는 부위) */
/** tailFrom: 얼굴 가운데 쪽 점(미간). 주면 그 점에서 먼 쪽 40% 를 꼬리로 보고 꼬리 채움도 낸다 */
export function shapeFill(f: SampleFrame, poly: readonly Pt[], opt: ShapeFillOptions = SHAPE_FILL, tailFrom?: Pt): ShapeFill {
  const box = boxOf(f.unit.eye), e = f.unit.eye;
  const near = opt.band[0] * e, far = opt.band[1] * e;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const none = { coverage: 0, spill: 0, tailCoverage: null, hits: 0, n: 0 };
  const dist = tailFrom ? poly.map((q) => Math.hypot(q.x - tailFrom.x, q.y - tailFrom.y)) : null;
  const lo = dist ? Math.min(...dist) : 0, span = dist ? Math.max(...dist) - lo || 1 : 1;
  const isTail = (x: number, y: number): boolean => !!tailFrom && (Math.hypot(x - tailFrom.x, y - tailFrom.y) - lo) / span >= 0.6;
  const inside: number[] = [], tail: number[] = [], edge: number[] = [], ring: Lab[] = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys) - far)); y <= Math.min(f.im.h - 1, Math.ceil(Math.max(...ys) + far)); y += box) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs) - far)); x <= Math.min(f.im.w - 1, Math.ceil(Math.max(...xs) + far)); x += box) {
      if (isHair(f, x, y)) continue;
      if (pointInPoly(x, y, poly)) {
        const L = labBox(f.im, x, y, box).L;
        inside.push(L);
        if (isTail(x, y)) tail.push(L);
        continue;
      }
      const d = distToEdge(x, y, poly);
      if (d >= near && d <= far) ring.push(labBox(f.im, x, y, box));
      else if (d < near) edge.push(labBox(f.im, x, y, box).L);
    }
  }
  if (!ring.length) return { ...none, skin: null };
  const skin: Lab = { L: medianOf(ring.map((c) => c.L)), a: medianOf(ring.map((c) => c.a)), b: medianOf(ring.map((c) => c.b)) };
  if (!inside.length) return { ...none, skin };
  // 이 눈썹의 진하기 = 안쪽 칸을 어두운 순으로 늘어놓은 darkPct 지점. 그 darkFrac 배보다 어두우면 "있는 칸"
  // (연한 눈썹도, 진한 눈썹 옆 옅은 그림자도 가른다)
  const sorted = inside.slice().sort((a, b) => a - b), darkLevel = sorted[Math.floor(sorted.length * opt.darkPct)]!;
  const need = Math.max(opt.minDark, (skin.L - darkLevel) * opt.darkFrac);
  const on = (L: number): boolean => skin.L - L >= need;
  const hits = inside.filter(on).length;
  return {
    coverage: hits / inside.length,
    spill: edge.length ? edge.filter(on).length / edge.length : 0,
    tailCoverage: tailFrom && tail.length ? tail.filter(on).length / tail.length : null,
    hits,
    n: inside.length,
    skin,
  };
}

/**
 * 눈썹 점수 — 결과 모양으로만 (채움 + 넘침). 지금 채점(browResult)과 같은 점수 식·같은 진단 코드를 쓴다 → 두 방식을 같은 자로 비교한다.
 * 원래 눈썹과 그린 것을 가리지 않으므로, **원래 눈썹이 가이드보다 크면 넘침으로 감점하고 "테두리 밖으로 나갔어요"** 가 뜬다.
 * 이 브랜치는 '결과 모양으로만 본다'(채점 목적 2안)를 끝까지 만들어 보는 실험이다 — '원래 것은 봐준다'는 팀 방향(섞기)으로 합칠 때의 규칙.
 */
export function browShape(f: SampleFrame, regions: Record<Side, readonly Pt[]>, opt: ShapeFillOptions = SHAPE_FILL): PartScore {
  const center = at(f.lm, 168);   // 미간 — 여기서 먼 쪽이 꼬리
  const side = (s: Side): RegionSideMetrics => {
    const r = shapeFill(f, regions[s], opt, center);
    return { coverage: r.coverage, overflow: r.spill, tailCoverage: r.tailCoverage ?? r.coverage, present: r.hits >= 6, hitLift: null };
  };
  return browResult({ R: side("R"), L: side("L") });
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
  /** 밖 번짐을 재는 범위 — 가이드를 가운데 기준으로 이 배율까지 키운 안쪽 (기준 피부 띠와 따로) */
  spillTo: number;
  /** 주변 피부 색을 밖에서 줄 때 (이마 등). 안 주면 가이드 둘레 띠의 중앙값 */
  skin?: Lab;
  /** 가이드 안에서 빼는 구멍 (입 안쪽) */
  hole?: readonly Pt[];
}
export const TINT_FILL = { minProgress: 0.35, maxOff: 0.6, ring: [1.3, 1.8] as const, spillTo: 1.3 };

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
  const near = scale(poly, opt.ring[0]), far = scale(poly, opt.ring[1]), spillPoly = scale(poly, opt.spillTo);
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
  const around = cells(spillPoly, (x, y) => !pointInPoly(x, y, poly)).map(prog);
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

/**
 * 라이너 띠 샘플(sampleLiner) 한 장에서 두께·꼬리를 잰다.
 * 기준 피부는 **줄마다 그 줄의 바깥쪽 칸**(선에서 먼 칸) — 띠 전체에서 하나로 잡으면 눈꼬리 바깥의 그늘(얼굴 굴곡)을
 * 꼬리로 읽는다 (FFHQ 맨얼굴 20명 중 19명이 꼬리 100%). 눈꺼풀 줄은 위쪽 칸만(아래는 눈알), 꼬리 줄은 위아래 양쪽.
 */
export function linerBand(strip: LinerStrip, darkL = 12): LinerBand {
  const { offs, isWing, thick } = strip.meta, step = offs.length > 1 ? offs[1]! - offs[0]! : 0;
  const far = offs[offs.length - 1]! - 3 * step;   // 선에서 먼 칸 (맨 끝 세 칸)
  const widths: number[] = [];
  let lidRows = 0, lidHit = 0, wingRows = 0, wingHit = 0;
  strip.lab.forEach((row, i) => {
    const wing = !!isWing[i];
    const up = row.filter((_, j) => (offs[j] ?? 0) >= far).map((c) => c.L);
    const down = wing ? row.filter((_, j) => (offs[j] ?? 0) <= -far).map((c) => c.L) : [];
    if (!up.length) return;
    // 선은 양쪽 모두보다 어두워야 한다 — 꼬리 줄은 위·아래 중 더 어두운 쪽이 기준 (그늘 경계에 걸친 줄을 선으로 읽지 않게)
    const skinL = down.length ? Math.min(medianOf(up), medianOf(down)) : medianOf(up);
    const dark = (c: Lab): boolean => skinL - c.L >= darkL;
    if (wing) {
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

// ---------- 갈림 규칙 ----------

export type ShapeRoute = "shape" | "compare" | "check_only";

/** 가정값 — 합성 세트·골든 세트로 맞춘다 */
export const ROUTE = {
  /** 쌩얼의 그 자리가 이미 이만큼 '물든 칸' 이면 결과 모양으로 못 가른다 → 원본 대조 */
  already: 0.2,
  /** 템플릿 색 × 덮는 비율(0.7)이 주변 피부와 이만큼도 안 다르면 잴 방향이 없다 → 확인만 */
  minContrast: 7,
};

/**
 * 쌩얼 사진을 보고, 이 사람·이 화장·이 부위를 어떻게 잴지 정한다 (입술·섀도우·볼).
 *   shape      = 결과 모양으로 (지금 사진 한 장, 주변 피부 기준)
 *   compare    = 원본 대조 (쌩얼과 비교) — 타고난 모습이 이미 템플릿 색 쪽이라 결과 모양으로는 '발랐는지' 못 가른다
 *   check_only = 확인만 — 템플릿 색이 이 사람 피부와 너무 가깝다 (subtle)
 * 화장 종류로 미리 나누지 않고 사람마다 본다: 같은 브라운 섀도우라도 눈두덩이 밝은 사람은 가려지고 어두운 사람은 안 가려진다.
 * EasyPortrait 실제 셀피 300장(대부분 맨얼굴): 브라운 섀도우 43% · 브릭 로즈 립 67% 가 맨얼굴에서 절반 넘게 '발랐다' 로 읽혔고, 핑크·누드·볼은 0~6%
 */
export function routeOf(bare: SampleFrame, poly: readonly Pt[], color: readonly [number, number, number], o: Partial<TintFillOptions> = {}, r = ROUTE): ShapeRoute {
  const t = tintFill(bare, poly, color, o);
  if (!t.skin) return "compare";   // 주변 피부를 못 쟀다 — 결과 모양의 기준이 없다
  const target = rgbToLab(color[0], color[1], color[2]);
  const contrast = 0.7 * Math.hypot(target.L - t.skin.L, target.a - t.skin.a, target.b - t.skin.b);
  if (contrast < r.minContrast) return "check_only";
  return t.coverage >= r.already ? "compare" : "shape";
}

// ---------- 조합 ----------

/** 결과 모양에서 "발랐다" 로 보는 최소 채움 (가정값) */
const SHAPE_PRESENT = 0.15;

/** 입 안쪽 윤곽 — 입술 채움에서 뺀다 (makeup-paint 와 같은 점) */
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

export interface HybridOptions extends ScorePartOptions {
  /** 화장 템플릿의 이 부위 진하기 (0~1). 주면 섀도우·볼의 '물든 칸' 기준을 그 절반으로 — 연한 화장도 잡게 */
  templateAlpha?: number;
}

export interface HybridScore {
  result: PartScore;
  ctx: DecideContext;
  /** shape = 결과 모양 · compare = 원본 대조(지금 채점 그대로) · mixed = 눈썹(채움은 결과 모양, 넘침은 원본 대조) · check_only = 확인만 */
  route: ShapeRoute | "mixed";
}

/**
 * 조합 채점 (실험) — 부위마다 결과 모양과 원본 대조를 섞는다. 팀 방향(2026-10-01): 채움은 원래 있던 것 + 그린 것, 번짐은 그린 것만.
 * 실험 근거 (eval/samples/shape/README.md):
 *   눈썹   채움 = 결과 모양 (원래 눈썹의 70% 가 테두리를 70% 넘게 채운다) · 넘침 = 원본 대조 (원래 눈썹의 92% 가 테두리 밖에 걸린다)
 *   라이너 원본 대조 (결과 모양은 눈꼬리 주름·접힌 선을 꼬리로 읽는다)
 *   입술·섀도우·볼  쌩얼을 보고 가른다 (routeOf) — 타고난 모습이 템플릿 색 쪽이면 원본 대조, 아니면 결과 모양
 * 결과 모양 쪽 점수는 지금 채점과 같은 식(scoreForm: 채움·넘침)이라 같은 자로 비교할 수 있다. 앱에는 아직 연결하지 않았다.
 */
export function scoreHybrid(partId: PartId, base: SampleFrame, cur: SampleFrame, guide: GuideSource, opts: HybridOptions = {}, p: ScoreParams = PARAMS): HybridScore {
  const a = scorePart(partId, base, cur, guide, opts, p);
  if (partId === "liner" || partId === "contour") return { ...a, route: "compare" };

  if (partId === "brow") {
    const regions = guide("brow", cur).regions;
    const per = (a.result.metrics as { per?: Record<Side, RegionSideMetrics> }).per;
    if (!regions || !per) return { ...a, route: "compare" };   // 가이드가 눈썹 테두리를 안 주면(개인화 없음) 지금 채점 그대로
    const center = at(cur.lm, 168);
    const side = (s: Side): RegionSideMetrics => {
      const b = shapeFill(cur, regions[s], SHAPE_FILL, center);
      return { coverage: b.coverage, tailCoverage: b.tailCoverage ?? b.coverage, overflow: per[s].overflow, present: b.hits >= 6 || per[s].present, hitLift: per[s].hitLift };
    };
    // 채움을 결과 모양으로 보므로 "화장 색이 원래 눈썹과 가깝다"(subtle)는 더 막을 이유가 없다
    const ctx: DecideContext = { ...a.ctx };
    delete ctx.templateDeltaE;
    return { result: browResult({ R: side("R"), L: side("L") }), ctx, route: "mixed" };
  }

  const color = opts.templateColor;
  if (!color) return { ...a, route: "compare" };
  const polysOf = (f: SampleFrame): { poly: readonly Pt[]; hole?: readonly Pt[] }[] => {
    if (partId === "lip") return [{ poly: LM.lipsOuter.map((i) => at(f.lm, i)), hole: LIP_INNER.map((i) => at(f.lm, i)) }];
    const r = guide(partId, f).regions;
    return r ? [{ poly: r.R }, { poly: r.L }] : [];
  };
  const tintOpt = opts.templateAlpha ? { minProgress: opts.templateAlpha * 0.5 } : {};
  const routes = polysOf(base).map((g) => routeOf(base, g.poly, color, { ...tintOpt, ...(g.hole ? { hole: g.hole } : {}) }));
  if (!routes.length || routes.includes("check_only")) return { ...a, route: routes.length ? "check_only" : "compare" };
  if (routes.includes("compare")) return { ...a, route: "compare" };

  const fills = polysOf(cur).map((g) => tintFill(cur, g.poly, color, { ...tintOpt, ...(g.hole ? { hole: g.hole } : {}) }));
  const mean = (k: "coverage" | "spill"): number => fills.reduce((s, t) => s + t[k], 0) / fills.length;
  const coverage = mean("coverage"), overflow = mean("spill");
  const present = coverage >= SHAPE_PRESENT;
  const codes: PartScore["codes"] = [];
  if (present && partId === "lip") {
    if (coverage < 0.5) codes.push("LIP_UNDER");
    if (overflow > 0.3) codes.push("LIP_OUT_UPPER", "LIP_OUT_LOWER");   // 결과 모양은 위·아래를 아직 안 가른다
  }
  // 결과 모양은 같은 사진의 주변 피부가 기준이라 두 사진의 조명 차이·정렬을 안 탄다 — 그 사유(lighting·align)는 넘기지 않는다
  const ctx: DecideContext = a.ctx.hairFrac !== undefined ? { hairFrac: a.ctx.hairFrac } : {};
  return { result: { present, score: present ? scoreForm({ coverage, overflow }) : null, codes, lrIndex: null, metrics: { shape: { coverage, overflow } } }, ctx, route: "shape" };
}

