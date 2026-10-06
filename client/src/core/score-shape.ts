/**
 * 결과 모양 채점 (실험, score-shape 브랜치 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서 잰다.
 *
 * 지금 채점(score-part)은 "맨얼굴 대비 바뀐 칸 = 그린 곳" 이라, 원래 눈썹이 이미 가이드 모양인 사람은 "안 보임" 이 된다.
 * 팀 방향(2026-10-01): 눈썹이 이미 정답 모양이면 무시하지 않는다 → 채움은 "원래 있던 것 + 그린 것" 으로 본다.
 * 여기는 그 채움을 맨얼굴 없이 재는 쪽 — 기준은 같은 사진의 **주변 피부**라서 두 사진의 조명·크기 차이에 안 흔들린다 (#261).
 *
 * 아직 앱에 연결하지 않았다. 합성 세트(eval/samples)로 지금 방식과 비교한 뒤 팀이 정한다.
 */

import { deltaE, pointInPoly, rgbToLab, type Lab } from "./color";
import { LINER_OFFS, boxOf, eyeClosed, isHair, labBox, sampleForehead, type SampleFrame } from "./sampling";
import { LM, at } from "./landmarks";
import { PARAMS, browResult, lightCorr, noCorr, scoreForm, type DecideContext, type LightCorr, type LinerEyeMetrics, type LinerStrip, type PartScore, type RegionSideMetrics, type ScoreParams, type Side } from "./score";
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

// ---------- 라이너 기준선 (맨얼굴의 어두운 띠 윗경계) ----------

/**
 * 가정값 (눈 폭 비율). step·reach = 윗눈꺼풀 선에서 위로 훑는 간격·범위, skinFrom 부터 위 = 눈꺼풀 피부, darkTo 까지 = 어두운 띠를 찾는 범위,
 * minDrop = 피부보다 이만큼(L*) 어두워야 띠로 본다, max = 옮기는 양의 한계, rows = 눈꺼풀을 따라 재는 줄 수
 */
export const LID_EDGE = { step: 0.005, reach: 0.2, skinFrom: 0.12, darkTo: 0.08, minDrop: 8, max: 0.12, rows: 40 };

/**
 * 맨얼굴에서 윗눈꺼풀 점마다 '어두운 띠의 윗경계' 가 점에서 위로 얼마나 떨어져 있나 (눈 폭 비율, eye.upper 순서 = 바깥 → 안쪽).
 * 얼굴 점의 윗눈꺼풀 선은 속눈썹 뿌리·접힌 선 안쪽(뜬 눈은 눈알 위)에 놓인다 — 그 선에서 위로 두께만큼인 가이드 띠는 맨얼굴에서 이미 어둡다.
 * 실제 라이너는 그 어두운 띠 **위 피부**에 그리므로, 재는 기준선을 띠의 윗경계(피부와 띠의 중간 밝기 자리)로 옮긴다.
 * 실제 사진 한 벌(눈 폭 107~117px): 윗경계는 점에서 5~8% 위, 가이드 띠의 맨얼굴 밝기 13~17 (피부 47).
 */
export function lidEdge(bare: SampleFrame, side: Side): number[] {
  const eye = side === "R" ? LM.eyeA : LM.eyeB, ue = bare.unit.eye, box = Math.max(1, Math.round(ue / 60));
  const lid = eye.upper.map((i) => at(bare.lm, i));
  const cum = [0];
  for (let i = 1; i < lid.length; i++) cum.push(cum[i - 1]! + Math.hypot(lid[i]!.x - lid[i - 1]!.x, lid[i]!.y - lid[i - 1]!.y));
  const total = cum[cum.length - 1]! || 1, nOff = Math.round(LID_EDGE.reach / LID_EDGE.step) + 1;
  const edges: { u: number; v: number }[] = [];
  for (let k = 0; k < LID_EDGE.rows; k++) {
    const u = (k + 0.5) / LID_EDGE.rows, s = u * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const a = lid[i - 1]!, b = lid[i]!, w = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let n = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
    if (n.y > 0) n = { x: -n.x, y: -n.y };
    const q = { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
    const L = Array.from({ length: nOff }, (_, j) => labBox(bare.im, q.x + n.x * j * LID_EDGE.step * ue, q.y + n.y * j * LID_EDGE.step * ue, box).L);
    const skin = medianOf(L.slice(Math.round(LID_EDGE.skinFrom / LID_EDGE.step))), head = L.slice(0, Math.round(LID_EDGE.darkTo / LID_EDGE.step) + 1), dark = Math.min(...head);
    if (skin - dark < LID_EDGE.minDrop) { edges.push({ u, v: 0 }); continue; }
    let j = head.indexOf(dark);
    while (j < nOff - 1 && L[j]! < (skin + dark) / 2) j++;
    edges.push({ u, v: Math.min(LID_EDGE.max, j * LID_EDGE.step) });
  }
  // 점마다: 그 점 둘레(눈꺼풀 길이의 ±12%) 줄들의 중앙값. 양 끝 점(눈꼬리·눈머리)은 선이 모이는 자리라 이웃 점 값을 쓴다
  const at1 = (u: number): number => { const v = edges.filter((e) => Math.abs(e.u - u) <= 0.12).map((e) => e.v); return v.length ? medianOf(v) : 0; };
  const out = lid.map((_, i) => at1(cum[i]! / total));
  out[0] = out[1] ?? 0;
  out[out.length - 1] = out[out.length - 2] ?? 0;
  return out;
}

/** 윗눈꺼풀 점을 lift(눈 폭 비율, lidEdge 의 값)만큼 그 자리의 수직 위쪽으로 옮긴 프레임 — 가이드·띠가 그 선을 따라간다. 다른 점은 그대로 */
export function liftLid(f: SampleFrame, lift: Record<Side, readonly number[]>): SampleFrame {
  const lm = f.lm.map((q) => ({ ...q })), ue = f.unit.eye;
  for (const [side, eye] of [["R", LM.eyeA], ["L", LM.eyeB]] as const) {
    const pts = eye.upper.map((i) => at(f.lm, i));
    eye.upper.forEach((id, i) => {
      const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!, d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let n = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
      if (n.y > 0) n = { x: -n.x, y: -n.y };
      const v = (lift[side][i] ?? 0) * ue;
      lm[id] = { ...lm[id]!, x: pts[i]!.x + n.x * v, y: pts[i]!.y + n.y * v };
    });
  }
  return { ...f, lm };
}

// ---------- 라이너 양 끝 (눈꼬리 · 앞트임) ----------

/**
 * 구간 나눔 (가정값). inner·outer = 눈꺼풀 길이 중 눈머리 쪽·눈꼬리 쪽 비율, extIn = 눈머리 너머로 더 보는 길이(눈 폭 비율),
 * wingExt = 가이드 꼬리 길이의 몇 배까지 보나, innerShort·innerOver = 앞쪽 시작 자리 지적 기준(눈 폭 비율)
 */
export const LINER_ENDS = { inner: 0.25, outer: 0.3, extIn: 0.1, wingExt: 1.8, innerShort: 0.08, innerOver: 0.03 };

export interface LinerEnds {
  /** 꼬리를 그린 길이 (눈꼬리에서, 눈 폭 비율) — 가이드 끝 너머(wingExt 배)까지 본다 */
  wingDrawn: number;
  wingGuide: number;
  /** 꼬리 바깥 절반에서 그린 칸의 중심이 가이드 꼬리(끝으로 가늘어지는 띠의 가운데)에서 벗어난 정도 (+ = 위) */
  wingDev: number;
  /** 눈꼬리 구간(눈꺼풀 바깥 쪽 + 가이드 꼬리)에서 가이드 띠 안에 그린 줄 비율 */
  outerCoverage: number;
  /** 앞트임 구간(눈꺼풀 눈머리 쪽)에서 그린 줄 비율 */
  innerCoverage: number;
  /** 선이 시작하는 자리 — 눈머리에서 눈꺼풀을 따라 (눈 폭 비율). 0 = 눈머리부터, 음수 = 눈머리 너머로 나감 */
  innerStart: number;
  /** 두 끝 구간에서 가이드 띠 밖에 그린 칸 비율 */
  overflow: number;
  /** 눈꼬리 쪽 눈꺼풀에서 잰 선 두께 (눈 폭 비율) — 그 줄에서 가장 진한 값의 절반 넘는 칸 수 */
  thickness: number;
  guideThick: number;
  /** 가운데 구간에 그린 줄 비율 — 점수에는 안 넣는다 */
  midCoverage: number;
  present: boolean;
}

type EndZone = "ext" | "inner" | "mid" | "outer" | "wing";
interface EndRow { lab: Lab[]; zone: EndZone; t: number }
type LinerGuide = { wing: Record<Side, readonly [Pt, Pt]>; thick: number };

/** 줄 놓는 간격 (눈 폭 비율) · 눈꺼풀 줄 수 — 두 사진의 줄이 같은 자리끼리 짝이 되게 **눈 폭 단위·고정 개수**로 놓는다 (px 로 놓으면 크기가 다른 두 사진의 줄 수가 달라진다) */
const END_STEP = 0.0125, END_LID_ROWS = 80;

/**
 * 눈머리 너머 → 눈꺼풀 → 꼬리(가이드 끝 너머까지)를 따라 줄을 놓는다. t: ext = 눈머리 너머 거리, 눈꺼풀 = 눈머리에서, wing = 눈꼬리에서 (눈 폭 비율).
 * wingRows = 꼬리 줄 수 (두 사진이 같은 수를 쓴다), offs = 줄마다 수직 방향 칸 자리, box = 칸 평균 창(px)
 */
function endRows(f: SampleFrame, side: Side, wing: readonly [Pt, Pt], wingRows: number, offs: readonly number[], box: number): EndRow[] {
  const eye = side === "R" ? LM.eyeA : LM.eyeB, ue = f.unit.eye;
  const lid = eye.upper.map((i) => at(f.lm, i)).reverse();   // 눈머리 → 눈꼬리
  const unit = (a: Pt, b: Pt): Pt => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
  const row = (q: Pt, tg: Pt, zone: EndZone, t: number): EndRow => {
    let n = { x: -tg.y, y: tg.x };   // 접선에 수직, 화면 위쪽으로
    if (n.y > 0) n = { x: -n.x, y: -n.y };
    return { lab: offs.map((o) => labBox(f.im, q.x + n.x * o * ue, q.y + n.y * o * ue, box)), zone, t };
  };
  const rows: EndRow[] = [], tg0 = unit(lid[0]!, lid[1]!);
  for (let k = Math.round(LINER_ENDS.extIn / END_STEP); k >= 1; k--) rows.push(row({ x: lid[0]!.x - tg0.x * k * END_STEP * ue, y: lid[0]!.y - tg0.y * k * END_STEP * ue }, tg0, "ext", k * END_STEP));
  const cum = [0];
  for (let i = 1; i < lid.length; i++) cum.push(cum[i - 1]! + Math.hypot(lid[i]!.x - lid[i - 1]!.x, lid[i]!.y - lid[i - 1]!.y));
  const lidLen = cum[cum.length - 1]!;
  for (let k = 0; k < END_LID_ROWS; k++) {
    const u = k / (END_LID_ROWS - 1), s = u * lidLen;
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < s) i++;
    const a = lid[i - 1]!, b = lid[i]!, v = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
    rows.push(row({ x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v }, unit(a, b), u < LINER_ENDS.inner ? "inner" : u > 1 - LINER_ENDS.outer ? "outer" : "mid", s / ue));
  }
  const tw = unit(wing[0], wing[1]);
  for (let k = 1; k <= wingRows; k++) rows.push(row({ x: wing[0].x + tw.x * k * END_STEP * ue, y: wing[0].y + tw.y * k * END_STEP * ue }, tw, "wing", k * END_STEP));
  return rows;
}

const wingLenOf = (f: SampleFrame, wing: readonly [Pt, Pt]): number => Math.hypot(wing[1].x - wing[0].x, wing[1].y - wing[0].y) / (f.unit.eye || 1);

/**
 * '그린 칸' 값(val, 줄 × 칸. 음수 = 안 보는 칸)에서 양 끝 지표를 낸다. th 이상이면 그린 칸. spread = 평균 창 때문에 선이 번져 보이는 폭 (눈 폭 비율)
 */
function measureEnds(rows: readonly EndRow[], val: readonly (readonly number[])[], offs: readonly number[], thick: number, wingLen: number, th: number, spread: number, p: ScoreParams): LinerEnds {
  const step = offs[1]! - offs[0]!;
  const cnt = { inner: [0, 0], mid: [0, 0], outer: [0, 0] };
  let outN = 0, outHit = 0, wingDrawn = 0, innerStart: number | null = null, extOver = 0, drawnRows = 0, lidEnd = 0;
  const widths: number[] = [], devs: number[] = [];
  rows.forEach((r, i) => {
    const v = val[i]!, lidRow = r.zone === "inner" || r.zone === "mid" || r.zone === "outer";
    // 가이드 띠의 위 끝 — 눈꺼풀은 두께 그대로, 꼬리는 끝으로 가며 가늘어진다 (화면 윤곽과 같은 모양). 눈머리 너머엔 가이드가 없다
    const top = lidRow ? thick : r.zone === "wing" ? thick * Math.max(0, 1 - r.t / wingLen) : 0;
    const hitOffs = offs.filter((_, j) => v[j]! >= th);
    const inBand = hitOffs.some((o) => o >= -p.tol.band && o <= Math.max(top, step) + p.tol.band);
    const nearW = hitOffs.filter((o) => Math.abs(o) <= thick + p.tol.out + spread).length * step;
    if (lidRow) {
      const c = cnt[r.zone as "inner" | "mid" | "outer"];
      c[0]!++;
      if (inBand) c[1]!++;
      if (inBand && innerStart === null) innerStart = r.t;
      lidEnd = Math.max(lidEnd, r.t);
    } else if (r.zone === "ext") {
      if (nearW >= p.tol.wingMin) extOver = Math.max(extOver, r.t);
    } else {
      if (r.t <= wingLen) { cnt.outer[0]!++; if (inBand) cnt.outer[1]!++; }
      if (nearW >= p.tol.wingMin) wingDrawn = Math.max(wingDrawn, r.t);
      if (r.t > wingLen * 0.5 && r.t <= wingLen && hitOffs.length) devs.push(medianOf(hitOffs) - top / 2);
    }
    if (r.zone !== "mid" && r.zone !== "ext" && (r.zone !== "wing" || r.t <= wingLen)) {
      if (inBand) drawnRows++;
      v.forEach((d, j) => { const o = offs[j]!; if (d >= 0 && (o > top + p.tol.out + spread || o < -(p.tol.out + spread))) { outN++; if (d >= th) outHit++; } });
    }
    if (r.zone === "outer") {
      const peak = Math.max(...v);
      if (peak >= th) widths.push(v.filter((d) => d >= peak / 2).length * step);
    }
  });
  const frac = (c: number[]): number => (c[0] ? c[1]! / c[0]! : 0);
  return {
    // 평균 창이 선 끝을 반 칸쯤 늘린다 — 길이에서 뺀다
    wingDrawn: Math.max(0, wingDrawn - spread / 2), wingGuide: wingLen, wingDev: devs.length ? medianOf(devs) : 0,
    outerCoverage: frac(cnt.outer), innerCoverage: frac(cnt.inner), midCoverage: frac(cnt.mid),
    innerStart: extOver > spread / 2 ? -(extOver - spread / 2) : innerStart ?? lidEnd,
    overflow: outN ? outHit / outN : 0,
    thickness: widths.length ? medianOf(widths) : 0, guideThick: thick,
    present: drawnRows >= 3,
  };
}

/**
 * 라이너를 **양 끝**에서 잰다 (원본 대조, 칸마다 색 차이) — 눈꼬리(눈꺼풀 바깥 쪽 + 꼬리)와 앞트임(눈머리 쪽).
 * 가운데 속눈썹 선은 원래 어두워 그린 선이 잘 안 잡히고(liner_levels 진단: 가이드대로 그려도 두께 −3% · 끊김 54%), 사용자가 어려워하는 곳도 양 끝이다.
 * 꼬리는 가이드 끝 너머까지, 앞쪽은 눈머리 너머까지 봐서 '길게 뺐다 / 넘겼다' 도 잰다. gb·gc = 그 사진 위의 가이드(꼬리 선 · 두께).
 * 한계(liner_ends 실험): 화면 가이드 모양의 가는 꼬리는 평균 창에 묻혀 못 잡는다 → linerStroke
 */
export function linerEnds(base: SampleFrame, cur: SampleFrame, side: Side, gb: LinerGuide, gc: LinerGuide, corr: LightCorr = noCorr, p: ScoreParams = PARAMS): LinerEnds {
  const wingLen = wingLenOf(cur, gc.wing[side]), wingRows = Math.round((wingLen * LINER_ENDS.wingExt) / END_STEP);
  const offs = LINER_OFFS, step = offs[1]! - offs[0]!;
  const B = endRows(base, side, gb.wing[side], wingRows, offs, boxOf(base.unit.eye)), C = endRows(cur, side, gc.wing[side], wingRows, offs, boxOf(cur.unit.eye));
  const eyeOpen = !eyeClosed(base.lm, side) || !eyeClosed(cur.lm, side);
  const lidRow = (r: EndRow): boolean => r.zone === "inner" || r.zone === "mid" || r.zone === "outer";
  // 눈을 뜨고 있으면 속눈썹 선 아래는 눈알 — 뺀다
  const val = C.map((r, i) => r.lab.map((c, j) => (lidRow(r) && eyeOpen && offs[j]! < -p.tol.band ? -1 : deltaE(B[i]!.lab[j]!, corr(c)))));
  const spread = Math.round(((boxOf(cur.unit.eye) - 1) / cur.unit.eye) / step) * step;
  return measureEnds(C, val, offs, gc.thick, wingLen, p.dEThresh.liner, spread, p);
}

// ---------- 라이너 획 추출 ----------

/**
 * 획 추출 (가정값). step·lo·hi = 줄마다 수직 방향 칸(눈 폭 비율), win = 이 폭보다 가는 어두운 것만 '선' 으로 본다(한쪽 폭),
 * minL = 새 획으로 칠 밝기 차(L*), tolRow·tolOff = 맨얼굴의 선이 이만큼 어긋나 있어도 같은 선으로 본다(줄 수 · 눈 폭 비율),
 * boxDiv = 칸 평균 창 = 눈 폭 / boxDiv (가는 선이 묻히지 않게 작게)
 */
export const LINER_STROKE = { step: 0.008, lo: -0.2, hi: 0.3, win: 0.16, minL: 7, tolRow: 2, tolOff: 0.016, boxDiv: 60 };
const STROKE_OFFS: readonly number[] = Array.from({ length: Math.round((LINER_STROKE.hi - LINER_STROKE.lo) / LINER_STROKE.step) + 1 }, (_, i) => +(LINER_STROKE.lo + i * LINER_STROKE.step).toFixed(4));

/** 한 줄의 '가늘고 어두운 정도' — 블랙 톱햇(닫기 − 원본). 창보다 넓게 어두운 곳(그늘·눈알)은 0 이 된다. from 앞 칸은 안 본다(−1) */
function topHat(L: readonly number[], from: number, w: number): number[] {
  const n = L.length, dil = new Array<number>(n).fill(0), out = new Array<number>(n).fill(-1);
  for (let j = from; j < n; j++) { let m = -Infinity; for (let k = Math.max(from, j - w); k <= Math.min(n - 1, j + w); k++) m = Math.max(m, L[k]!); dil[j] = m; }
  for (let j = from; j < n; j++) { let m = Infinity; for (let k = Math.max(from, j - w); k <= Math.min(n - 1, j + w); k++) m = Math.min(m, dil[k]!); out[j] = Math.max(0, m - L[j]!); }
  return out;
}

/** 줄 × 칸 톱햇 지도. 선 방향(줄)으로는 이웃 세 줄 평균 — 잡음은 선을 따라 줄이고, 선을 가로지르는 쪽은 뭉개지 않는다 */
function strokeMap(rows: readonly EndRow[], corr: LightCorr, eyeOpen: boolean, band: number): number[][] {
  const w = Math.round(LINER_STROKE.win / LINER_STROKE.step), from0 = STROKE_OFFS.findIndex((o) => o >= -band);
  const L = rows.map((r) => r.lab.map((c) => corr(c).L));
  return rows.map((r, i) => {
    const near = [i - 1, i, i + 1].filter((k) => k >= 0 && k < rows.length && rows[k]!.zone === r.zone);
    const sm = L[i]!.map((_, j) => near.reduce((s, k) => s + L[k]![j]!, 0) / near.length);
    const lidRow = r.zone === "inner" || r.zone === "mid" || r.zone === "outer";
    return topHat(sm, lidRow && eyeOpen ? from0 : 0, w);   // 눈을 뜨고 있으면 속눈썹 선 아래는 눈알 — 뺀다
  });
}

/**
 * 라이너를 양 끝에서 잰다 — **획 추출**로. 칸마다 색 차이를 보는 대신, 두 사진에서 각각 '가늘고 어두운 선'(블랙 톱햇)을 뽑아
 * 확인 사진에만 있는 선을 새로 그린 획으로 본다. 맨얼굴의 선은 둘레(tolRow · tolOff)에서 가장 센 값으로 빼서, 속눈썹 선이 조금 어긋나거나
 * 흐려져도 새 획으로 읽지 않는다 (#261). 기준이 사진마다 자기 주변 피부라 넓은 그늘·조명 차이는 선으로 안 읽힌다.
 */
export function linerStroke(base: SampleFrame, cur: SampleFrame, side: Side, gb: LinerGuide, gc: LinerGuide, corr: LightCorr = noCorr, p: ScoreParams = PARAMS): LinerEnds {
  const wingLen = wingLenOf(cur, gc.wing[side]), wingRows = Math.round((wingLen * LINER_ENDS.wingExt) / END_STEP);
  const boxOfEye = (f: SampleFrame): number => Math.max(1, Math.round(f.unit.eye / LINER_STROKE.boxDiv));
  const B = endRows(base, side, gb.wing[side], wingRows, STROKE_OFFS, boxOfEye(base)), C = endRows(cur, side, gc.wing[side], wingRows, STROKE_OFFS, boxOfEye(cur));
  const eyeOpen = !eyeClosed(base.lm, side) || !eyeClosed(cur.lm, side);
  const tb = strokeMap(B, noCorr, eyeOpen, p.tol.band), tc = strokeMap(C, corr, eyeOpen, p.tol.band);
  const dj = Math.round(LINER_STROKE.tolOff / LINER_STROKE.step), di = LINER_STROKE.tolRow;
  const val = tc.map((row, i) => row.map((v, j) => {
    if (v < 0) return -1;
    let was = 0;
    for (let a = Math.max(0, i - di); a <= Math.min(tb.length - 1, i + di); a++) {
      if (B[a]!.zone !== C[i]!.zone && (B[a]!.zone === "ext" || B[a]!.zone === "wing" || C[i]!.zone === "ext" || C[i]!.zone === "wing")) continue;   // 눈꺼풀 줄과 그 밖의 줄은 방향이 달라 이웃이 아니다
      for (let b = Math.max(0, j - dj); b <= Math.min(row.length - 1, j + dj); b++) was = Math.max(was, tb[a]![b]!);
    }
    return Math.max(0, v - was);
  }));
  return measureEnds(C, val, STROKE_OFFS, gc.thick, wingLen, LINER_STROKE.minL, (boxOfEye(cur) - 1) / cur.unit.eye, p);
}

/** scoreForm 의 단위 눈금 (score.ts UNIT_STEP 과 같은 값) — 앞쪽 시작 자리 감점에 같은 자를 쓴다 */
const ENDS_UNIT = 0.037;

/**
 * 양 끝으로 낸 라이너 점수. 식은 지금 채점(scoreForm: 채움 · 번짐 · 꼬리 길이 · 두께) 그대로에 **눈머리를 넘긴 만큼**만 더했다 (같은 자, 최대 20점).
 * 채움 = 눈꼬리 구간과 앞트임 구간의 평균. 가운데는 안 넣는다. 새 지적(꼬리가 길다 · 앞쪽이 비었다 · 눈머리를 넘겼다)은 metrics.endCodes 에.
 */
export function linerEndsResult(per: Record<Side, LinerEnds>, p: ScoreParams = PARAMS): PartScore {
  const { R, L } = per, codes: PartScore["codes"] = [], endCodes: string[] = [];
  const present = R.present || L.present;
  if (!present) return { present, score: null, codes, lrIndex: null, metrics: { ends: per, endCodes } };
  for (const k of ["R", "L"] as const) {
    const e = per[k];
    if (!e.present) { codes.push(`LINER_GAP_${k}`); continue; }
    if (e.wingDev > p.tol.wingDev) codes.push(`LINER_WING_HIGH_${k}`);
    else if (e.wingDev < -p.tol.wingDev) codes.push(`LINER_WING_LOW_${k}`);
    if (e.wingDrawn < e.wingGuide - p.tol.wingShort) codes.push(`LINER_WING_SHORT_${k}`);
    else if (e.wingDrawn > e.wingGuide + p.tol.wingShort) endCodes.push(`LINER_WING_LONG_${k}`);
    if (e.innerStart > LINER_ENDS.innerShort) endCodes.push(`LINER_INNER_SHORT_${k}`);
    else if (e.innerStart < -LINER_ENDS.innerOver) endCodes.push(`LINER_INNER_OVER_${k}`);
    if (e.overflow > 0.35) codes.push(`LINER_OUT_${k}`);
  }
  const avg = (f: (e: LinerEnds) => number): number => (f(R) + f(L)) / 2;
  const thickness = avg((e) => e.thickness), guideThick = avg((e) => e.guideThick);
  if (thickness > guideThick + p.tol.thickOver) codes.push("LINER_THICK");
  else if (thickness < guideThick - p.tol.thickUnder && thickness > 0) codes.push("LINER_THIN");
  if (Math.abs(R.wingDev - L.wingDev) > p.tol.lrDiff) codes.push("LINER_LR_DIFF");
  const form = scoreForm({
    coverage: avg((e) => (e.present ? (e.outerCoverage + e.innerCoverage) / 2 : 0)),
    overflow: avg((e) => e.overflow),
    wingDelta: avg((e) => e.wingDrawn - e.wingGuide),
    thickDelta: thickness - guideThick,
  });
  // 앞쪽을 비운 것은 앞트임 채움에 이미 들어간다 (두 번 깎지 않는다) — 시작 자리 감점은 눈머리를 넘긴 만큼만
  const innerPen = Math.min(20, (avg((e) => Math.max(0, -e.innerStart - LINER_ENDS.innerOver)) / ENDS_UNIT) * 8);
  return { present, score: Math.round(Math.max(0, form - innerPen)), codes, lrIndex: null, metrics: { ends: per, endCodes, thickness } };
}

/**
 * 라이너 섞기 — 항목마다 잘 재는 쪽 값을 쓴다. 실제 사진에 덧그린 두 장으로 본 것 (2026-10-01):
 *   채움·두께·번짐 = 지금 방식(띠 전체, 칸 색 차이) — 선이 이어졌는지·두께를 맞혔다. 획 추출은 맨얼굴 속눈썹 선을 빼다가 그 위의 선도 지운다
 *     (채움은 양 끝 구간 채움이 더 높으면 그 값 — 가운데가 끊긴 것은 점수에 안 넣는다)
 *   꼬리 길이 = 둘 중 긴 쪽 — 지금 방식은 가이드 끝까지만 본다. 꼬리 높이 = 획 추출이 꼬리를 봤으면 그쪽
 *   앞쪽 시작 자리 = 두 방법(획 추출 · 칸 색 차이) 중 더 앞에서 잡은 쪽 — 한쪽만 믿으면 그렸는데 '비었다' 가 된다. 눈머리 넘김 = 획 추출
 * 점수 식은 지금 채점(scoreForm) 그대로 + 눈머리를 넘긴 만큼 (같은 자, 최대 20점). a = 지금 방식, s = 획 추출, e = 양 끝·칸 색 차이
 */
export function linerMixResult(a: Record<Side, LinerEyeMetrics>, s: Record<Side, LinerEnds>, e: Record<Side, LinerEnds>, p: ScoreParams = PARAMS): PartScore {
  const codes: PartScore["codes"] = [], endCodes: string[] = [];
  const mixed = (k: Side) => {
    const sawWing = s[k].wingDrawn > 0;
    const endsOf = (x: LinerEnds): number => (x.outerCoverage + x.innerCoverage) / 2, endsCov = Math.max(endsOf(s[k]), endsOf(e[k]));
    return {
      // 그렸는지는 획 추출이 정한다 — 칸 색 차이는 두 사진의 선명도가 다르면 어두운 띠 가장자리가 움직인 것을 그린 선으로 읽는다 (맨얼굴 5% 확대: 83%)
      present: s[k].present,
      // 가운데는 점수에 안 넣는다 — 양 끝(눈꼬리 · 앞트임) 채움이 더 높으면 그 값. '끊겼어요' 도 양 끝이 빈 만큼만
      coverage: Math.max(a[k].coverage, endsCov), overflow: a[k].overflow, thickness: a[k].thickness, guideThick: a[k].guideThick, gapRatio: Math.min(a[k].gapRatio, 1 - endsCov),
      wingGuide: a[k].wingGuide, wingDrawn: Math.max(a[k].wingDrawn, s[k].wingDrawn),
      wingDev: sawWing ? s[k].wingDev : a[k].wingDev,
      // 눈머리를 넘겼으면(음수) 획 추출 값, 아니면 둘 중 더 앞
      innerStart: s[k].innerStart < 0 ? s[k].innerStart : Math.min(s[k].innerStart, e[k].innerStart),
    };
  };
  const per = { R: mixed("R"), L: mixed("L") };
  const present = per.R.present || per.L.present;
  if (!present) return { present, score: null, codes, lrIndex: null, metrics: { perEye: per, endCodes } };
  /** 앞쪽 시작 자리가 허용 폭을 넘은 만큼 (눈 폭 비율) */
  // 앞쪽을 비운 것은 채움에 이미 들어간다 (두 번 깎지 않는다) — 눈머리를 넘긴 만큼만
  const innerExcess = (v: number): number => Math.max(0, -v - LINER_ENDS.innerOver);
  for (const k of ["R", "L"] as const) {
    const m = per[k];
    if (!m.present) { codes.push(`LINER_GAP_${k}`); continue; }
    if (m.wingDev > p.tol.wingDev) codes.push(`LINER_WING_HIGH_${k}`);
    else if (m.wingDev < -p.tol.wingDev) codes.push(`LINER_WING_LOW_${k}`);
    if (m.wingDrawn < m.wingGuide - p.tol.wingShort) codes.push(`LINER_WING_SHORT_${k}`);
    else if (m.wingDrawn > m.wingGuide + p.tol.wingShort) endCodes.push(`LINER_WING_LONG_${k}`);
    if (m.innerStart > LINER_ENDS.innerShort) endCodes.push(`LINER_INNER_SHORT_${k}`);
    else if (m.innerStart < -LINER_ENDS.innerOver) endCodes.push(`LINER_INNER_OVER_${k}`);
    if (m.gapRatio > 0.25) codes.push(`LINER_GAP_${k}`);
    if (m.overflow > 0.35) codes.push(`LINER_OUT_${k}`);
  }
  const avg = (f: (m: ReturnType<typeof mixed>) => number): number => (f(per.R) + f(per.L)) / 2;
  const thickness = avg((m) => m.thickness), guideThick = avg((m) => m.guideThick);
  if (thickness > guideThick + p.tol.thickOver) codes.push("LINER_THICK");
  else if (thickness < guideThick - p.tol.thickUnder && thickness > 0) codes.push("LINER_THIN");
  const lrDiff = Math.abs(per.R.wingDev - per.L.wingDev);
  if (lrDiff > p.tol.lrDiff) codes.push("LINER_LR_DIFF");
  const form = scoreForm({ coverage: avg((m) => m.coverage), overflow: avg((m) => m.overflow), wingDelta: avg((m) => m.wingDrawn - m.wingGuide), thickDelta: thickness - guideThick });
  const innerPen = Math.min(20, (avg((m) => innerExcess(m.innerStart)) / ENDS_UNIT) * 8);
  return { present, score: Math.round(Math.max(0, form - innerPen)), codes, lrIndex: null, metrics: { perEye: per, endCodes, lrDiff, thickness } };
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
  /** shape = 결과 모양 · compare = 원본 대조(지금 채점 그대로) · mixed = 눈썹(채움은 결과 모양, 넘침은 원본 대조) · liner_mix = 라이너(원본 대조 — 채움·두께는 칸 색 차이, 꼬리 길이·앞쪽 자리는 획 추출) · liner_closed = 라이너(두 사진 다 눈 감은 장 — 양 끝만, 획 추출) · check_only = 확인만 */
  route: ShapeRoute | "mixed" | "liner_mix" | "liner_closed";
}

/**
 * 조합 채점 (실험) — 부위마다 결과 모양과 원본 대조를 섞는다. 팀 방향(2026-10-01): 채움은 원래 있던 것 + 그린 것, 번짐은 그린 것만.
 * 실험 근거 (eval/samples/shape/README.md):
 *   눈썹   채움 = 결과 모양 (원래 눈썹의 70% 가 테두리를 70% 넘게 채운다) · 넘침 = 원본 대조 (원래 눈썹의 92% 가 테두리 밖에 걸린다)
 *   라이너 원본 대조 (결과 모양은 눈꼬리 주름·접힌 선을 꼬리로 읽는다) — 채움·두께는 지금 방식, 꼬리 길이·앞쪽 자리는 획 추출로 섞는다 (linerMixResult)
 *   입술·섀도우·볼  쌩얼을 보고 가른다 (routeOf) — 타고난 모습이 템플릿 색 쪽이면 원본 대조, 아니면 결과 모양
 * 결과 모양 쪽 점수는 지금 채점과 같은 식(scoreForm: 채움·넘침)이라 같은 자로 비교할 수 있다. 앱에는 아직 연결하지 않았다.
 */
export function scoreHybrid(partId: PartId, base: SampleFrame, cur: SampleFrame, guide: GuideSource, opts: HybridOptions = {}, p: ScoreParams = PARAMS): HybridScore {
  const a = scorePart(partId, base, cur, guide, opts, p);
  if (partId === "contour") return { ...a, route: "compare" };
  if (partId === "liner") {
    // 기준선을 맨얼굴의 어두운 띠 윗경계로 옮긴다 (lidEdge) — 가이드 띠가 원래 어두운 자리에 놓이지 않게. 두 사진에 같은 양을 쓴다
    const closed = (f: SampleFrame): boolean => eyeClosed(f.lm, "R") && eyeClosed(f.lm, "L");
    const bothClosed = closed(base) && closed(cur);
    const lift = { R: lidEdge(base, "R"), L: lidEdge(base, "L") };
    const b2 = liftLid(base, lift), c2 = liftLid(cur, lift);
    const gb = guide("liner", b2).liner, gc = guide("liner", c2).liner;
    if (!gb || !gc) return { ...a, route: "compare" };
    // 조명은 지금 채점처럼 이마 밝기 비율로 맞춘다 (흰자 색 보정 · 미세 정렬은 실험에서 뺐다)
    const fb = sampleForehead(base), fc = sampleForehead(cur), corr = fb && fc ? lightCorr(fb.L, fc.L) : noCorr;
    const both = (f: typeof linerStroke): Record<Side, LinerEnds> => ({ R: f(b2, c2, "R", gb, gc, corr, p), L: f(b2, c2, "L", gb, gc, corr, p) });
    // 눈 감은 장끼리: 눈꺼풀이 펴져 꼬리 자리가 밝다(실제 사진: 뜬 눈 15 → 감은 눈 34) → 양 끝만, 획 추출로. 가운데는 점수에 안 넣는다
    if (bothClosed) return { result: linerEndsResult(both(linerStroke), p), ctx: a.ctx, route: "liner_closed" };
    const a2 = scorePart(partId, b2, c2, guide, opts, p), perA = (a2.result.metrics as { perEye?: Record<Side, LinerEyeMetrics> }).perEye;
    if (!perA) return { ...a2, route: "compare" };
    return { result: linerMixResult(perA, both(linerStroke), both(linerEnds), p), ctx: a2.ctx, route: "liner_mix" };
  }

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

/** 맨얼굴과 확인 사진 한 쌍 (같은 눈 상태끼리) */
export interface LinerFramePair { base: SampleFrame; cur: SampleFrame }

/**
 * 라이너를 **두 장**으로 채점한다 (실험) — 눈 뜬 쌍과 눈 감은 쌍. 맨얼굴은 화면 1 이 둘 다 찍는다 (front_open · front_closed).
 * 실제 사진 한 벌(2026-10-02): 감은 눈은 눈꺼풀이 펴져 꼬리 자리가 밝고(맨얼굴 밝기 15 → 34) 틀린 지적이 없었다. 번짐은 뜬 눈에서 더 잘 잡혔다.
 *   꼬리 길이 · 앞쪽 자리 · 양 끝 채움 · 두께 = 감은 눈 (꼬리는 뜬 눈이 더 길게 보면 그 값)
 *   번짐 = 두 사진 중 큰 쪽
 * 둘째 쌍이 눈 감은 장이 아니면 뜬 눈 채점(liner_mix) 그대로 돌려준다.
 */
export function scoreLinerPair(open: LinerFramePair, closed: LinerFramePair, guide: GuideSource, opts: HybridOptions = {}, p: ScoreParams = PARAMS): Omit<HybridScore, "route"> & { route: HybridScore["route"] | "liner_pair" } {
  const o = scoreHybrid("liner", open.base, open.cur, guide, opts, p), c = scoreHybrid("liner", closed.base, closed.cur, guide, opts, p);
  const ends = (c.result.metrics as { ends?: Record<Side, LinerEnds> }).ends, perO = (o.result.metrics as { perEye?: Record<Side, { overflow: number; wingDrawn: number }> }).perEye;
  if (c.route !== "liner_closed" || !ends) return o;
  const merged = (k: Side): LinerEnds => ({ ...ends[k], overflow: Math.max(ends[k].overflow, perO?.[k].overflow ?? 0), wingDrawn: Math.max(ends[k].wingDrawn, perO?.[k].wingDrawn ?? 0), present: ends[k].present || (o.result.present && !!perO) });
  return { result: linerEndsResult({ R: merged("R"), L: merged("L") }, p), ctx: c.ctx, route: "liner_pair" };
}

// ---------- 라이너 꼬리 — 눈꼬리 부채꼴 훑기 ----------

/**
 * 부채꼴 격자 · 칸 값 · 덩어리 뽑기 — 파이썬 원형(2026-10-05 조사, $DHE_DATA_DIR/work/liner-methods/wing-fan-sweep/ common.py · 02_probe.py)의 값 그대로.
 *   degLo~degHi·degStep = 각도(도, 눈머리→눈꼬리 축 기준 · 위가 +), rMax·rStep = 중심에서 거리(눈 폭 비율) — 61 × 46칸. 0.45 는 개인화 가이드 꼬리(12%)의 3배 넘게
 *   boxDiv = 칸 평균 창 = 눈 폭 / boxDiv (LINER_STROKE 와 같다 — 가는 선이 묻히지 않게 작게)
 *   far    = 이 거리 밖 칸의 중앙값 차로 두 사진의 밝기 · 색 차이를 맞춘다 (꼬리가 닿아도 그 칸의 일부다)
 *   hatArc = 톱햇 창(한쪽, 호 길이 · 눈 폭 비율) — 이보다 가는 어두운 것만 '선'. nearR = 호 길이를 각도 칸 수로 바꿀 때 거리의 하한
 *   tolArc·tolRow = 맨얼굴의 선이 이만큼(호 길이 · 거리 줄 수) 어긋나 있어도 같은 선으로 보고 뺀다 (linerStroke 의 tolOff · tolRow 와 같은 생각)
 *   th     = '바뀐 칸' 기준 — hat 7 = LINER_STROKE.minL, dE 14 = rules/score.json dEThresh.liner, dark 10 = 가정값
 *   rMin   = 이 안쪽은 안 본다(중심 점 바로 옆), startMax = 덩어리가 이 안에서 시작해야 꼬리(눈꼬리에 이어진 선), minExt = 이만큼은 뻗어야 꼬리
 */
export const LINER_FAN = { degLo: -40, degHi: 80, degStep: 2, rMax: 0.45, rStep: 0.01, boxDiv: 60, far: 0.2, hatArc: 0.08, nearR: 0.03, tolArc: 0.016, tolRow: 2, th: { hat: 7, dE: 14, dark: 10 }, rMin: 0.03, startMax: 0.2, minExt: 0.03 };
const FAN_DEG: readonly number[] = Array.from({ length: Math.round((LINER_FAN.degHi - LINER_FAN.degLo) / LINER_FAN.degStep) + 1 }, (_, j) => LINER_FAN.degLo + j * LINER_FAN.degStep);
const FAN_RR: readonly number[] = Array.from({ length: Math.round(LINER_FAN.rMax / LINER_FAN.rStep) + 1 }, (_, i) => +(i * LINER_FAN.rStep).toFixed(4));

/**
 * 칸 값 — 원형이 견준 세 가지.
 *   hat  = 각도 방향 블랙 톱햇: 두 사진에서 각각 '가는 어두운 선' 을 뽑아 확인 사진에만 있는 것 (linerStroke 를 부채꼴 위에서)
 *   dE   = 칸 색 차이 · dark = 어두워진 양(L*)
 * 기본은 hat — 맨얼굴끼리 대조에서 가장 안전했다. 눈 폭 3% 어긋남에 가짜 꼬리 hat 10~19% · dE 35~41% · dark 47~52% (liner_wing.mjs, 22눈 × 8방향.
 * 원형은 142눈에서 8~33% · 25~33% · 34~67%). 크기 5% · 흐림 · 해상도 차만으로는 셋 다 거의 없다. 눈꼬리에서 떨어진 넓은 그늘도 '가는 선' 이 아니라 안 읽는다.
 * 대신 눈 뜬 장의 짧은 꼬리는 못 본다 — 꼬리 뿌리 자리가 원래 어두워 가는 선으로 안 보인다 (가이드 길이에서 자르면 12눈 중 4눈) → 짧은 꼬리는 눈 감은 장으로 (scoreLinerWing)
 */
export type FanValue = "hat" | "dE" | "dark";

export interface FanTip {
  /** 중심(눈꼬리 · 눈머리)에서 이어진 새 선을 찾았나 */
  found: boolean;
  /** 선 끝의 거리 (눈 폭 비율). 못 찾으면 0 */
  r: number;
  /** 선 끝의 각도 (도, 눈머리→눈꼬리 축 기준 · 위가 +. 눈머리 쪽은 눈꼬리→눈머리 축). 끝의 '자리' 각이고 획의 방향이 아니다. 못 찾으면 0 */
  deg: number;
  /** 선이 보이기 시작하는 거리 (눈 폭 비율) */
  from: number;
  /** 선 끝의 자리 (확인 사진 px). 못 찾으면 null */
  at: Pt | null;
  /** 이 값을 잴 때 쓴 미세 맞춤 (scoreLinerWing 이 채운다) */
  reg?: EyeShift;
}

export interface FanOptions {
  /** 부채꼴 중심 — outer = 눈꼬리(꼬리), inner = 눈머리(눈머리 넘김). 안 주면 outer */
  end?: "outer" | "inner";
  value?: FanValue;
  /** 확인 사진 쪽 눈 틀을 옮길 양 (px) — eyeShift 가 준 값 */
  shift?: { x: number; y: number };
}

/** 부채꼴 · 맞춤 자리를 놓는 틀 — c = 중심, a = 눈 반대쪽 끝에서 중심으로 가는 방향(바깥), n = 그 수직(화면 위쪽), ue = 눈 폭(px) */
interface EyeAxes { c: Pt; a: Pt; n: Pt; ue: number }

function eyeAxes(f: SampleFrame, side: Side, end: "outer" | "inner", ue: number, shift?: { x: number; y: number }): EyeAxes {
  const eye = side === "R" ? LM.eyeA : LM.eyeB, c = at(f.lm, end === "inner" ? eye.inner : eye.outer), o = at(f.lm, end === "inner" ? eye.outer : eye.inner);
  const d = Math.hypot(c.x - o.x, c.y - o.y) || 1, a = { x: (c.x - o.x) / d, y: (c.y - o.y) / d };
  let n = { x: -a.y, y: a.x };
  if (n.y > 0) n = { x: -n.x, y: -n.y };
  return { c: { x: c.x + (shift?.x ?? 0), y: c.y + (shift?.y ?? 0) }, a, n, ue };
}

/**
 * 두 사진의 눈 틀. 눈 폭은 맨얼굴의 것(두 눈 평균)에, 확인 사진은 **그 눈이** 맞춤에서 커진 배율을 곱한다 —
 * 눈마다 따로 맞추므로(refineParts) 두 눈 평균(unit.eye)을 쓰면 한쪽 눈의 칸이 어긋난다
 */
function eyeAxesPair(base: SampleFrame, cur: SampleFrame, side: Side, end: "outer" | "inner", shift?: { x: number; y: number }): [EyeAxes, EyeAxes] {
  const eye = side === "R" ? LM.eyeA : LM.eyeB, span = (f: SampleFrame): number => Math.hypot(at(f.lm, eye.outer).x - at(f.lm, eye.inner).x, at(f.lm, eye.outer).y - at(f.lm, eye.inner).y);
  return [eyeAxes(base, side, end, base.unit.eye), eyeAxes(cur, side, end, (base.unit.eye * span(cur)) / (span(base) || 1), shift)];
}

/** 호 길이(눈 폭 비율)를 거리 r 줄의 각도 칸 수로 */
const arcCells = (arc: number, r: number): number => arc / Math.max(r, LINER_FAN.nearR) / ((LINER_FAN.degStep * Math.PI) / 180);

/** 부채꼴 표본 [거리][각도] */
function fanLab(f: SampleFrame, x: EyeAxes, degs: readonly number[] = FAN_DEG, rrs: readonly number[] = FAN_RR): Lab[][] {
  const box = Math.max(1, Math.round(x.ue / LINER_FAN.boxDiv));
  return rrs.map((r) => degs.map((deg) => {
    const t = (deg * Math.PI) / 180, k = r * x.ue, c = Math.cos(t), s = Math.sin(t);
    return labBox(f.im, x.c.x + k * (c * x.a.x + s * x.n.x), x.c.y + k * (c * x.a.y + s * x.n.y), box);
  }));
}

/** 칸 값 지도 [거리][각도] — B = 맨얼굴, C = 확인 사진의 부채꼴 표본 */
function fanMap(B: readonly (readonly Lab[])[], C: readonly (readonly Lab[])[], value: FanValue): number[][] {
  if (value === "hat") {
    // 꼬리는 중심에서 바깥으로 뻗으니 가로지르는 쪽(각도)으로 가는 것이 선이다. 창은 호 길이로 같게 — 가까운 줄일수록 칸 수가 많다
    const hat = (S: readonly (readonly Lab[])[]): number[][] => S.map((row, i) => topHat(row.map((c) => c.L), 0, Math.round(Math.min(Math.floor(FAN_DEG.length / 2), arcCells(LINER_FAN.hatArc, FAN_RR[i]!)))));
    const hb = hat(B), hc = hat(C);
    return hc.map((row, i) => {
      const dj = Math.max(1, Math.round(arcCells(LINER_FAN.tolArc, FAN_RR[i]!)));
      return row.map((v, j) => {
        let was = 0;
        for (let a = Math.max(0, i - LINER_FAN.tolRow); a <= Math.min(hb.length - 1, i + LINER_FAN.tolRow); a++) for (let b = Math.max(0, j - dj); b <= Math.min(row.length - 1, j + dj); b++) was = Math.max(was, hb[a]![b]!);
        return Math.max(0, v - was);
      });
    });
  }
  const far = (k: keyof Lab): number => medianOf(B.flatMap((row, i) => (FAN_RR[i]! >= LINER_FAN.far ? row.map((c, j) => c[k] - C[i]![j]![k]) : [])));
  const off = { L: far("L"), a: far("a"), b: far("b") };
  return B.map((row, i) => row.map((c, j) => { const m = C[i]![j]!; return value === "dark" ? c.L - (m.L + off.L) : Math.hypot(c.L - m.L - off.L, c.a - m.a - off.a, c.b - m.b - off.b); }));
}

/**
 * 지도에서 꼬리를 뽑는다 — 기준 넘는 칸을 3×3 닫기로 잇고, 이어 붙인 덩어리(8방향) 중 중심 가까이에서 시작해 **가장 멀리 간 것**.
 * 끝 = 그 덩어리의 가장 먼 줄, 끝 각도 = 가장 먼 두 줄 칸의 값 가중 평균. 가이드는 보지 않는다 (재고 난 뒤 견준다)
 */
function fanTip(V: readonly (readonly number[])[], th: number): { from: number; r: number; deg: number } | null {
  const nt = FAN_DEG.length, cells = (v: number): number => Math.round(v / LINER_FAN.rStep);
  const hit = V.map((row, i) => row.map((v) => i >= cells(LINER_FAN.rMin) && v >= th));
  /** 3×3 이웃이 (all ? 전부 : 하나라도) 켜져 있나. 격자 밖 칸은 없는 셈 친다 */
  const near = (m: readonly (readonly boolean[])[], i: number, j: number, all: boolean): boolean => {
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { const v = m[a]?.[b]; if (v !== undefined && v !== all) return !all; }
    return all;
  };
  const dil = hit.map((row, i) => row.map((_, j) => near(hit, i, j, false))), on = dil.map((row, i) => row.map((_, j) => near(dil, i, j, true)));
  let best: { lo: number; hi: number; at: number[] } | null = null;
  for (let i0 = 0; i0 < on.length; i0++) {
    for (let j0 = 0; j0 < nt; j0++) {
      if (!on[i0]![j0]) continue;
      const blob: number[] = [], todo = [i0 * nt + j0];
      on[i0]![j0] = false;
      let lo = i0, hi = i0;
      while (todo.length) {
        const k = todo.pop()!, i = Math.floor(k / nt), j = k % nt;
        blob.push(k); lo = Math.min(lo, i); hi = Math.max(hi, i);
        for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) if (on[a]?.[b]) { on[a]![b] = false; todo.push(a * nt + b); }
      }
      if (lo <= cells(LINER_FAN.startMax) && hi - lo >= cells(LINER_FAN.minExt) && (!best || hi > best.hi)) best = { lo, hi, at: blob };
    }
  }
  if (!best) return null;
  let sw = 0, sd = 0;
  for (const k of best.at) { const i = Math.floor(k / nt), j = k % nt; if (i >= best.hi - 1) { const w = Math.max(V[i]![j]!, 1e-6); sw += w; sd += w * FAN_DEG[j]!; } }
  return { from: FAN_RR[best.lo]!, r: FAN_RR[best.hi]!, deg: sd / sw };
}

/**
 * 부채꼴 꼬리 찾기 — 눈꼬리(또는 눈머리) 점을 중심으로 각도 × 거리 부채꼴을 두 사진에 놓고, 확인 사진에만 있는 선의 끝(거리 · 각도)을 낸다.
 * base · cur = 같은 눈 상태끼리(눈 뜬 장끼리 · 눈 감은 장끼리)의 맨얼굴 · 확인 프레임. 확인 프레임의 얼굴 점은 앱처럼 맨얼굴 점을 옮긴 것(alignedFrame).
 * 지금까지(linerEnds · linerStroke)는 가이드 꼬리 선 둘레 띠에서만 재서, 가이드와 다른 각도로 그린 꼬리는 길이가 가이드 길이쯤에서 끊겼다 (liner_real).
 * 한계: 눈꼬리 점이 어긋난 만큼 거리 · 각도가 틀어진다 — 꼬리를 그리면 얼굴 점의 눈꼬리가 꼬리 쪽으로 밀린다(감은 눈 2~4%) → eyeShift 로 되돌려서 부른다
 */
export function linerFan(base: SampleFrame, cur: SampleFrame, side: Side, o: FanOptions = {}): FanTip {
  const value = o.value ?? "hat", [xb, xc] = eyeAxesPair(base, cur, side, o.end ?? "outer", o.shift);
  const t = fanTip(fanMap(fanLab(base, xb), fanLab(cur, xc), value), LINER_FAN.th[value]);
  if (!t) return { found: false, r: 0, deg: 0, from: 0, at: null };
  const rad = (t.deg * Math.PI) / 180, k = t.r * xc.ue, c = Math.cos(rad), s = Math.sin(rad);
  return { found: true, ...t, at: { x: xc.c.x + k * (c * xc.a.x + s * xc.n.x), y: xc.c.y + k * (c * xc.a.y + s * xc.n.y) } };
}

/**
 * 미세 맞춤 (가정값 — 골든 세트로 맞춘다). range = 옮겨 볼 범위(눈 폭 비율, 가로·세로 각각),
 * degLo~degHi · rLo~rHi = 맞춤에 쓰는 자리: 중심(눈꼬리 · 눈머리)의 **아래쪽** 부채꼴 (각도 · 거리는 LINER_FAN 과 같은 틀) — 꼬리를 찾는 부채꼴(-40도 위)과 겹치지 않는다.
 * degStep · rStep = 표본 간격, hp = 무늬를 뽑을 때 빼는 둘레 평균의 창(칸, 한쪽),
 * minFit = 맞춘 자리에서 두 사진 무늬의 상관이 이만큼은 돼야, minGain = 안 옮긴 자리보다 상관이 이만큼은 올라야 옮긴다 (무늬가 없거나 안 맞으면 잡음을 따라가지 않게)
 */
export const EYE_SHIFT = { range: 0.08, degLo: -130, degHi: -50, degStep: 4, rLo: 0.1, rHi: 0.45, rStep: 0.02, hp: 3, minFit: 0.3, minGain: 0.02 };

export interface EyeShift {
  /** 확인 사진 쪽 눈 틀을 옮길 양 (px) */
  x: number;
  y: number;
  /** 그 자리에서 두 사진 무늬의 상관 (-1~1). 낮으면 두 사진의 그 자리가 서로 다르게 보인다 — 맞춤을 믿기 어렵다 */
  fit: number;
  /** 옮겨서 오른 상관. 0 이면 안 옮겼다 */
  gain: number;
  /** 범위 끝에서 멈췄나 — 실제 어긋남이 범위보다 클 수 있다 */
  edge: boolean;
}

/**
 * 미세 맞춤 — 두 사진의 눈 둘레 어긋남(평행 이동)을 **라이너가 닿지 않는 자리**의 화소로 찾는다: 눈꼬리(end = inner 면 눈머리) 아래쪽의 아랫눈꺼풀 끝 · 피부.
 * 얼굴 점만 믿으면 안 된다: 꼬리를 그리면 얼굴 점의 눈꼬리가 꼬리 쪽으로 2~4% 밀리고(특히 감은 눈), 눈 폭 3% 어긋남이면 맨얼굴의 25~33% 에서 가짜 꼬리가 나왔다 (조사 2026-10-05).
 * 꼬리를 찾는 부채꼴 안의 화소로 맞추면 그린 선에 끌려간다 — 그래서 그 아래쪽만 쓴다. 눈꼬리와 눈머리는 따로 맞춘다 (두 사진의 눈 폭이 다르게 잡히면 한쪽을 맞출 때 다른 쪽이 어긋난다).
 * 견주는 것은 밝기가 아니라 **무늬**(둘레 평균을 뺀 밝기)의 상관 — 밝기 차로 맞추면, 따로 찍은 두 장에서는 조명의 완만한 기울기를 따라 범위 끝까지 끌려갔다 (다시 찍은 맨얼굴 8눈 중 7눈).
 * 화소 단위로 옮겨 상관이 가장 높은 자리 (같으면 덜 옮긴 쪽)
 */
export function eyeShift(base: SampleFrame, cur: SampleFrame, side: Side, end: "outer" | "inner" = "outer"): EyeShift {
  const [xb, xc] = eyeAxesPair(base, cur, side, end), E = EYE_SHIFT, steps = (lo: number, hi: number, d: number): number[] => Array.from({ length: Math.round((hi - lo) / d) + 1 }, (_, i) => lo + i * d);
  const degs = steps(E.degLo, E.degHi, E.degStep), rrs = steps(E.rLo, E.rHi, E.rStep);
  /** 그 자리의 무늬 — 밝기에서 둘레(±hp 칸) 평균을 뺀 것. 조명의 밝기 · 완만한 기울기가 빠진다 */
  const texture = (f: SampleFrame, x: EyeAxes): number[] => {
    const L = fanLab(f, x, degs, rrs).map((row) => row.map((c) => c.L));
    return L.flatMap((row, i) => row.map((v, j) => {
      let s = 0, n = 0;
      for (let a = Math.max(0, i - E.hp); a <= Math.min(L.length - 1, i + E.hp); a++) for (let b = Math.max(0, j - E.hp); b <= Math.min(row.length - 1, j + E.hp); b++) { s += L[a]![b]!; n++; }
      return v - s / n;
    }));
  };
  const tb = texture(base, xb), sb = tb.reduce((s, v) => s + v * v, 0);
  const fitAt = (dx: number, dy: number): number => {
    const tc = texture(cur, { ...xc, c: { x: xc.c.x + dx, y: xc.c.y + dy } });
    let sc = 0, dot = 0;
    tc.forEach((v, k) => { sc += v * v; dot += v * tb[k]!; });
    return sb * sc > 0 ? dot / Math.sqrt(sb * sc) : 0;
  };
  const r = Math.ceil(xc.ue * E.range), f0 = fitAt(0, 0);
  let best = { x: 0, y: 0 }, bestF = f0, bestD = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const f = fitAt(dx, dy), d = Math.hypot(dx, dy);
      if (f > bestF + 1e-9 || (Math.abs(f - bestF) <= 1e-9 && d < bestD)) { best = { x: dx, y: dy }; bestF = f; bestD = d; }
    }
  }
  if (bestF < E.minFit || bestF - f0 < E.minGain) return { x: 0, y: 0, fit: f0, gain: 0, edge: false };
  return { ...best, fit: bestF, gain: bestF - f0, edge: Math.abs(best.x) === r || Math.abs(best.y) === r };
}

/**
 * 꼬리 판정 (가정값 — 골든 세트로 맞춘다).
 *   closedRatio = 같은 꼬리가 눈 감은 장에서는 눈 뜬 장의 몇 배 길이로 재지나. 눈 감은 장의 길이를 이 값으로 나눠 가이드(눈 뜬 눈 기준)와 견준다.
 *     생성 사진 4명 8눈(같은 꼬리의 뜬 눈 · 감은 눈, liner_wing.mjs)에서 잰 비율 0.63~0.92 의 중앙값 (눈으로 읽은 끝으로는 0.68~1.03 · 중앙 0.77).
 *     눈마다 크게 달라 이 값 하나로 환산하면 길이가 ±20% 쯤 틀릴 수 있고, 생성 사진이라 두 장이 정말 같은 꼬리라는 보장도 없다
 *   far  = 그린 꼬리 끝과 가이드 꼬리 끝 사이 거리(눈 폭 비율)가 이 값을 넘으면 '많이 달라요'. '비슷해요' 의 기준은 따로 두지 않고 PARAMS.tol.wingShort(5.5%)를 쓴다 — far 는 그 두 배.
 *     가이드 꼬리 길이(12%)보다 조금 짧게 잡았다: 꼬리를 못 찾은 눈(끝 사이 거리 = 가이드 길이)이 식으로도 '많이' 쪽이다
 *   zero = 이 거리에서 점수가 0 (far 의 두 배)
 */
export const LINER_WING = { closedRatio: 0.73, far: 0.11, zero: 0.22 };

export type WingLength = "long" | "ok" | "short" | "none";
/** 가이드와 비슷한가 — 비슷해요 · 조금 달라요 · 많이 달라요. 점수로는 80 이상 · 50 이상 · 그 아래 */
export type WingMatch = "similar" | "slight" | "far";

export interface LinerWingEye {
  /** 눈 뜬 장 · 눈 감은 장에서 잰 꼬리 (눈 감은 쌍이 없으면 closed 는 null) */
  open: FanTip;
  closed: FanTip | null;
  /** 가이드 꼬리의 길이 (눈 폭 비율) · 각도 (도, FanTip.deg 와 같은 틀). 눈 뜬 맨얼굴 기준 */
  guide: number;
  guideDeg: number;
  /** 길다 · 맞다 · 짧다 · 없음 — 덧붙이는 말의 길이 쪽. 판정하지 않았으면 null (눈 감은 쌍이 없고 눈 뜬 장에서 '길다' 가 아닐 때) */
  length: WingLength | null;
  /** 판정에 쓴 꼬리 길이 — 눈 뜬 눈 기준 (눈 감은 장에서 잰 값은 closedRatio 로 나눈 것). 판정하지 않았으면 null */
  drawn: number | null;
  /** 판정에 쓴 각도 차 (도, 그린 것 − 가이드 · 위가 +). 각도를 보지 않았으면 null (눈 뜬 장에서 꼬리를 못 찾았다) */
  dDeg: number | null;
  /** 그린 꼬리 끝과 가이드 꼬리 끝 사이의 거리 (눈 폭 비율) — 길이 차와 각도 차가 같이 들어간다. 꼬리가 없으면 가이드 길이. 판정하지 않았으면 null */
  off: number | null;
  /** 이 눈의 단계 (눈머리 넘김으로 내린 것까지). 판정하지 않았으면 null */
  match: WingMatch | null;
  /** 눈머리 쪽에서 잰 선 */
  innerOpen: FanTip;
  innerClosed: FanTip | null;
  /** 눈머리 너머로 나간 길이 (눈 폭 비율, 눈 감은 장). 안 넘겼으면 0, 판정하지 않았으면 null */
  innerOver: number | null;
  /** 이 눈의 미세 맞춤(눈꼬리 · 눈머리, 두 장) 중 범위 끝에 걸린 것이 있나 — 판정은 그대로 하고 표시만 한다 */
  edge: boolean;
}

export interface LinerWingOptions {
  value?: FanValue;
  /** false 면 미세 맞춤(eyeShift)을 건너뛴다 — 비교 실험용 */
  register?: boolean;
}

const WING_BAND: Record<WingMatch, readonly [number, number]> = { similar: [80, 100], slight: [50, 79], far: [0, 49] };
const wingMatchOf = (off: number, near: number): WingMatch => (off <= near ? "similar" : off <= LINER_WING.far ? "slight" : "far");
/**
 * 끝 사이 거리 → 점수. 0 = 100, near = 80, far = 50, zero = 0 을 곧게 잇는다 — 길수록 · 벗어날수록 끝없이 내려간다 (전에는 꼬리 감점 상한 때문에 80점에서 멈췄다).
 * 단계의 점수 구간 안으로 자른다: 반올림한 점수와, 좌우 차 · 눈머리 넘김으로 한 칸 내린 단계가 화면의 접기(80 · 50)와 어긋나지 않게
 */
function wingScore(off: number, match: WingMatch, near: number): number {
  const W = LINER_WING, s = off <= near ? 100 - (20 * off) / near : off <= W.far ? 80 - (30 * (off - near)) / (W.far - near) : 50 - (50 * (off - W.far)) / (W.zero - W.far);
  return Math.min(WING_BAND[match][1], Math.max(WING_BAND[match][0], Math.round(s)));
}

/**
 * 라이너 꼬리 채점 (실험) — 판정은 **가이드와 비슷한가** 하나다 (결정 2026-10-06): 비슷해요 · 조금 달라요 · 많이 달라요.
 * 눈꼬리와 눈머리만 본다. 눈꺼풀 위의 선(두께 · 끊김 · 시작 자리)은 쓰지 않는다. 확인 사진은 눈 뜬 장 · 눈 감은 장 둘 다 받는다.
 * 눈마다 값 하나: **그린 꼬리 끝과 가이드 꼬리 끝 사이의 거리**(눈 폭 비율, LinerWingEye.off) = √(길이 차² + (2·√(그린 길이 · 가이드 길이)·sin(각도 차 / 2))²).
 *   거리 ≤ tol.wingShort → 비슷해요, ≤ LINER_WING.far → 조금 달라요, 그 위 → 많이 달라요. 점수도 이 값에서 (wingScore) — decide 로 접은 맞음 · 조금 · 많이가 세 단계와 같다.
 * 가이드는 눈 뜬 눈 기준인데 같은 꼬리도 눈 감은 장에서는 가파르고 짧게 재진다 (뜬 눈 -11~10도 · 22~34%, 감은 눈 39~51도 · 18~25%, liner_wing.mjs). 그래서 장마다 쓰는 것이 다르다:
 *   길이 = 눈 뜬 장에서 가이드 + 허용 폭보다 길게 잡혔으면 그 값을 그대로 (가이드보다 긴 꼬리는 눈 뜬 장에서도 잡힌다).
 *          아니면 눈 감은 장의 길이 ÷ closedRatio — 가이드 길이 이하의 꼬리는 눈 뜬 장에서 자주 놓친다(꼬리 뿌리 자리가 맨얼굴에서 원래 어둡다, 12눈 중 4눈만 잡힘). 감은 눈은 그 자리가 밝다
 *   각도 = **눈 뜬 장에서 꼬리를 찾았을 때만**, 그 끝의 각도 − 가이드 각도. 눈 감은 장의 각도는 쓰지 않는다 — 눈꺼풀이 내려와 40도쯤 가파르게 재지고 그 양을 환산할 근거가 없다.
 *          눈 뜬 장에서 못 찾았으면 각도 차 0 으로 친다 (길이만 견준다). 못 본 것을 '다르다' 로 치지 않는 쪽
 *   없음 = 눈 감은 장에서 꼬리를 못 찾은 눈 (눈 뜬 장에서 '길다' 도 아님) → 많이 달라요. 끝 사이 거리는 가이드 길이로 친다 (끝이 눈꼬리에 있는 셈).
 *          눈 뜬 장에만 짧게 잡힌 것은 꼬리로 치지 않는다 — 맨얼굴의 가짜 꼬리가 '비슷해요' 가 되는 것을 막는 쪽
 *   눈 감은 쌍이 없으면(null · 둘째 쌍이 눈 감은 장이 아님) 눈 뜬 장에서 '길다' 인 눈만 판정한다. 판정한 눈이 없으면 점수도 단계도 없다 — 안 본 것을 '비슷해요' 로 치지 않는다
 * 전체 단계 = 판정한 눈 중 **더 다른 눈**의 것 (값도 큰 쪽). 한쪽만 꼬리가 없어도 가이드와 많이 다르다.
 * 눈머리 넘김(눈 감은 장, LINER_ENDS.innerOver 넘게) · 좌우 길이 차(두 눈 다 찾은 장으로 — 눈 뜬 장 먼저, tol.lrDiff 넘게)는 끝 사이 거리에 넣지 않는다 (가이드 꼬리 끝과 견줄 값이 아니다).
 *   대신 '비슷해요' 였으면 **한 칸 내려** '조금 달라요' 로, 이미 달랐으면 말만 덧붙인다 → '비슷해요' 에는 지적이 붙지 않는다.
 * 덧붙이는 말(어느 쪽으로 다른가)은 단계와 따로다 — 가짜 꼬리에서는 말이 틀릴 수 있다. '비슷해요' 가 아닌 눈에만 붙인다:
 *   없어요 · 짧아요 = LINER_WING_SHORT_R/L, 위로 · 아래로 = LINER_WING_HIGH/LOW_R/L (codes — 문장이 이미 있는 코드),
 *   길어요 = LINER_WING_LONG_R/L, 눈머리를 넘겼어요 = LINER_INNER_OVER_R/L, 좌우가 달라요 = LINER_WING_LR_LEN (metrics.endCodes — 새 지적).
 *   길이 쪽 · 각도 쪽 중 혼자서 허용 폭을 넘는 것은 다 붙이고, 둘 다 못 넘는데 합쳐서 넘었으면 큰 쪽 하나
 * 아무 선도 못 찾으면 present = false — 꼬리 없이 눈꺼풀에만 그린 것과 안 그린 것을 여기서는 못 가른다 (눈꺼풀 위는 안 본다). 안 그린 얼굴의 정답은 '가이드와 달라요' 라 어느 쪽이든 '비슷해요' 는 아니다.
 * 미세 맞춤이 범위 끝에 걸린 눈(FanTip.reg.edge)도 그대로 판정한다. 그 눈은 얼굴 점 맞춤이 범위(±3%)보다 크게 어긋났을 수 있어 표시만 남긴다 (LinerWingEye.edge · metrics.edge).
 * 한계: 따로 찍은 맨얼굴 쌍에서는 그린 것이 없는데도 꼬리를 읽는다 (같은 자리에서 다시 찍은 4눈 중 1눈 · 다른 날 8눈 중 4눈) — 단계가 '달라요' 면 맞는 답이다.
 *   가이드대로 그린 실제 사진이 없어 '가이드대로 그렸는데 달라요' 가 얼마나 나오는지는 모른다. eval/samples/shape/README.md
 */
/**
 * 여러 장에서 잰 같은 눈의 꼬리 → 하나. **절반 넘는 장**에서 찾았을 때만 꼬리로 치고, 길이 · 각도는 찾은 장들의 가운데 값(가운데 장의 것을 그대로).
 * 주름 · 속눈썹 그림자가 만드는 가짜 꼬리는 장마다 나왔다 사라지고 그린 선은 매번 있다 (같은 자리 맨얼굴 쌍: 가짜 5눈 → 세 장으로 1눈, README 실험 25 · 26)
 */
export function voteTip(tips: readonly FanTip[]): FanTip {
  if (tips.length === 1) return tips[0]!;
  const found = tips.filter((t) => t.found).sort((x, y) => x.r - y.r);
  if (found.length * 2 <= tips.length) return tips.find((t) => !t.found) ?? { ...tips[0]!, found: false, r: 0, deg: 0, from: 0, at: null };
  return found[(found.length - 1) >> 1]!;
}

export function scoreLinerWing(openShots: LinerFramePair | readonly LinerFramePair[], closedShots: LinerFramePair | readonly LinerFramePair[] | null, guide: GuideSource, opts: LinerWingOptions = {}, p: ScoreParams = PARAMS): PartScore {
  // 여러 장(같은 맨얼굴에 시도사진 여러 장)을 받으면 장마다 재서 voteTip 으로 합친다. 가이드 · 눈 틀은 첫 장의 맨얼굴 기준
  const list = (q: LinerFramePair | readonly LinerFramePair[] | null): readonly LinerFramePair[] => (!q ? [] : Array.isArray(q) ? (q as readonly LinerFramePair[]) : [q as LinerFramePair]);
  const opens = list(openShots), open = opens[0]!;
  const g = guide("liner", open.base).liner, codes: PartScore["codes"] = [], endCodes: string[] = [], near = p.tol.wingShort;
  if (!g) return { present: false, score: null, codes, lrIndex: null, metrics: { endCodes } };
  const sides = ["R", "L"] as const;
  const shuts = list(closedShots).filter((q) => sides.every((k) => eyeClosed(q.base.lm, k) && eyeClosed(q.cur.lm, k))), shut = shuts.length ? shuts : null;
  // 부채꼴마다 그 중심(눈꼬리 · 눈머리) 아래 자리로 미세 맞춤을 하고 잰다
  const fan = (q: LinerFramePair, k: Side, end: "outer" | "inner"): FanTip => {
    const reg = opts.register === false ? null : eyeShift(q.base, q.cur, k, end);
    return { ...linerFan(q.base, q.cur, k, { end, ...(opts.value ? { value: opts.value } : {}), ...(reg ? { shift: reg } : {}) }), ...(reg ? { reg } : {}) };
  };
  const fans = (qs: readonly LinerFramePair[], k: Side): { wing: FanTip; inner: FanTip } => ({ wing: voteTip(qs.map((q) => fan(q, k, "outer"))), inner: voteTip(qs.map((q) => fan(q, k, "inner"))) });
  const eye = (k: Side): LinerWingEye => {
    const o = fans(opens, k), c = shut ? fans(shut, k) : null, w = g.wing[k], guideLen = wingLenOf(open.base, w);
    // 가이드 꼬리의 각도를 꼬리 끝과 같은 틀(눈머리→눈꼬리 축, 위가 +)로
    const x = eyeAxes(open.base, k, "outer", open.base.unit.eye), dx = w[1].x - w[0].x, dy = w[1].y - w[0].y;
    const guideDeg = (Math.atan2(dx * x.n.x + dy * x.n.y, dx * x.a.x + dy * x.a.y) * 180) / Math.PI;
    const seen = c?.wing.found ? c.wing.r / LINER_WING.closedRatio : 0, longOpen = o.wing.found && o.wing.r > guideLen + near;
    const length: WingLength | null = longOpen ? "long" : !c ? null : !c.wing.found ? "none" : seen < guideLen - near ? "short" : seen > guideLen + near ? "long" : "ok";
    const drawn = longOpen ? o.wing.r : c ? seen : null, tail = length !== null && length !== "none";
    const dDeg = tail && o.wing.found ? o.wing.deg - guideDeg : null;
    const off = !tail ? (length ? guideLen : null) : Math.hypot(drawn! - guideLen, 2 * Math.sqrt(drawn! * guideLen) * Math.sin((Math.abs(dDeg ?? 0) * Math.PI) / 360));
    const innerOver = c ? (c.inner.found ? c.inner.r : 0) : null, m = off === null ? null : length === "none" ? "far" : wingMatchOf(off, near);
    return {
      open: o.wing, closed: c?.wing ?? null, guide: guideLen, guideDeg, length, drawn, dDeg, off,
      match: m === "similar" && (innerOver ?? 0) > LINER_ENDS.innerOver ? "slight" : m,
      innerOpen: o.inner, innerClosed: c?.inner ?? null, innerOver,
      edge: [o.wing, o.inner, c?.wing, c?.inner].some((t) => !!t?.reg?.edge),
    };
  };
  const per = { R: eye("R"), L: eye("L") }, edge = sides.some((k) => per[k].edge);
  // 좌우 길이 차 (R − L, 눈 뜬 눈 기준): 두 눈 다 찾은 장에서만 — 한쪽만 찾은 것은 '없음' 이 맡는다
  const lrLen = per.R.open.found && per.L.open.found ? per.R.open.r - per.L.open.r
    : per.R.closed?.found && per.L.closed?.found ? (per.R.closed.r - per.L.closed.r) / LINER_WING.closedRatio : null;
  const present = sides.some((k) => per[k].open.found || !!per[k].closed?.found || (per[k].innerOver ?? 0) > 0);
  if (!present) return { present, score: null, codes, lrIndex: null, metrics: { wing: per, lrLen, endCodes, off: null, match: null, edge } };
  for (const k of sides) {
    const e = per[k];
    if (e.match === null || e.match === "similar") continue;
    if (e.length === "none") codes.push(`LINER_WING_SHORT_${k}`);
    else {
      const dLen = e.drawn! - e.guide, arc = Math.sqrt(Math.max(0, e.off! ** 2 - dLen ** 2)), apart = e.off! > near;
      if (Math.abs(dLen) > near || (apart && arc <= near && Math.abs(dLen) >= arc)) { if (dLen < 0) codes.push(`LINER_WING_SHORT_${k}`); else endCodes.push(`LINER_WING_LONG_${k}`); }
      if (arc > near || (apart && Math.abs(dLen) <= near && arc > Math.abs(dLen))) codes.push(`LINER_WING_${e.dDeg! > 0 ? "HIGH" : "LOW"}_${k}`);
    }
    if ((e.innerOver ?? 0) > LINER_ENDS.innerOver) endCodes.push(`LINER_INNER_OVER_${k}`);
  }
  // 허용 폭은 꼬리 높이 차용 값(tol.lrDiff)을 길이 차에 그대로 쓴다 — 가정값, 골든 세트로 맞춘다.
  // 가이드의 좌우 차를 뺀 값으로 본다: 정답사진에서 읽은 꼬리는 좌우가 다를 수 있고(생성 4명 2~6%p), 그대로 그린 것을 지적하면 안 된다
  const lrOver = lrLen !== null && Math.abs(lrLen - (per.R.guide - per.L.guide)) > p.tol.lrDiff;
  if (lrOver) endCodes.push("LINER_WING_LR_LEN");
  // 판정한 눈 중 더 다른 눈이 전체다 — 평균하면 한쪽은 가이드대로이고 한쪽은 없을 때 '조금' 으로 묽어진다
  const judged = sides.map((k) => per[k]).filter((e) => e.match !== null);
  if (!judged.length) return { present, score: null, codes, lrIndex: null, metrics: { wing: per, lrLen, endCodes, off: null, match: null, edge } };
  const rank: readonly WingMatch[] = ["similar", "slight", "far"], off = Math.max(...judged.map((e) => e.off!));
  const worst = rank[Math.max(...judged.map((e) => rank.indexOf(e.match!)))]!, match: WingMatch = worst === "similar" && lrOver ? "slight" : worst;
  return { present, score: wingScore(off, match, near), codes, lrIndex: null, metrics: { wing: per, lrLen, endCodes, off, match, edge } };
}

// ---------- 마지막 전체 사진 한 장을 정답 그림과 비교 (실험 21, 2026-10-06) ----------
// 흐름을 바꾸는 논의에서 나온 것 (확정 전): 맨얼굴에 화장을 입힌 그림이 정답값이고, 부위별 중간 확인 없이 마지막 사진을 그 그림과 견준다.
// 부위마다 '바로 주변 피부 대비 색'이 맨얼굴에서 얼마나 바뀌었나를 잰다 — 이마 한 곳으로 사진 전체를 보정하면 따로 찍은 맨얼굴끼리 입술이 정답의 -0.7배로 읽혔다
// (eval/samples/shape/final_whole.py, README 실험 19). 볼은 채점하지 않는다 (사용자 결정 2026-10-06)

/** minTarget: 정답 변화가 이보다 작으면 채점 안 함 (따로 찍은 사진 사이의 잡음이 5~7). none · weak · strong: 양의 경계. minCos: 색 방향 */
export const WHOLE = { minTarget: 8, none: 0.3, weak: 0.6, strong: 1.6, minCos: 0.8, ring: [1.3, 1.8] as const };

export type WholeVerdict = "similar" | "none" | "weak" | "strong" | "color" | "check_only";

/**
 * 한 부위의 다각형들(좌우 등)과, 둘레 피부에서 뺄 자리(눈 · 눈썹처럼 사진마다 달라지는 곳). 받은 프레임의 얼굴 점으로 만든다.
 * ref 를 주면 둘레 띠 대신 그 다각형들을 기준 피부로 쓴다 — 부위를 잘게 나눈 구역은 둘레가 옆 구역(칠한 자리)이라서
 */
export type WholeRegions = (f: SampleFrame) => { polys: readonly (readonly Pt[])[]; avoid?: readonly (readonly Pt[])[]; ref?: readonly (readonly Pt[])[] };

export interface WholePart {
  verdict: WholeVerdict;
  /** 정답 방향으로 바뀐 크기 / 정답 크기 (0 안 그림 · 1 같음). 잴 수 없으면 null */
  amount: number | null;
  /** 바뀐 방향과 정답 방향의 코사인 */
  cos: number | null;
  /** 정답 변화의 크기 (Lab 거리) */
  target: number;
}

type V3 = readonly [number, number, number];
const growPoly = (poly: readonly Pt[], k: number): Pt[] => {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  return poly.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
};

/** 부위 평균 − 둘레 피부 평균 (Lab). 둘레는 다각형을 1.3~1.8배 키운 띠에서 다른 다각형 · avoid 를 뺀 것. 픽셀이 없으면 null */
export function wholeContrast(f: SampleFrame, regions: WholeRegions, o = WHOLE): V3 | null {
  const { polys, avoid = [], ref } = regions(f), step = Math.max(1, Math.round(f.unit.eye / 40));
  const sum = (list: readonly (readonly Pt[])[], keep: (x: number, y: number) => boolean): Lab | null => {
    let L = 0, a = 0, b = 0, n = 0;
    for (const poly of list) {
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(f.im.h - 1, Math.max(...ys)); y += step) {
        for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(f.im.w - 1, Math.max(...xs)); x += step) {
          if (!pointInPoly(x, y, poly) || isHair(f, x, y) || !keep(x, y)) continue;
          const i = (y * f.im.w + x) * 4, lab = rgbToLab(f.im.data[i] ?? 0, f.im.data[i + 1] ?? 0, f.im.data[i + 2] ?? 0);
          L += lab.L; a += lab.a; b += lab.b; n++;
        }
      }
    }
    return n ? { L: L / n, a: a / n, b: b / n } : null;
  };
  const holes = [...polys.map((p) => growPoly(p, o.ring[0])), ...avoid];
  const part = sum(polys, () => true), ring = ref ? sum(ref, () => true) : sum(polys.map((p) => growPoly(p, o.ring[1])), (x, y) => !holes.some((h) => pointInPoly(x, y, h)));
  return part && ring ? [part.L - ring.L, part.a - ring.a, part.b - ring.b] : null;
}

/**
 * 한 부위: 맨얼굴 → 정답 그림의 변화(t)와 맨얼굴 → 마지막 사진의 변화(o)를 견준다.
 * target 은 맨얼굴과 겹치는 그림이라 맨얼굴의 얼굴 점을 그대로 쓴 프레임을 넘긴다. cur 는 alignedFrame 으로 맞춘 프레임
 */
export function scoreWhole(bare: SampleFrame, target: SampleFrame, cur: SampleFrame, regions: WholeRegions, o = WHOLE): WholePart {
  const b = wholeContrast(bare, regions, o), tg = wholeContrast(target, regions, o), c = wholeContrast(cur, regions, o);
  if (!b || !tg) return { verdict: "check_only", amount: null, cos: null, target: 0 };
  const t = [tg[0] - b[0], tg[1] - b[1], tg[2] - b[2]] as const, tn = Math.hypot(...t);
  if (tn < o.minTarget || !c) return { verdict: "check_only", amount: null, cos: null, target: tn };
  const d = [c[0] - b[0], c[1] - b[1], c[2] - b[2]] as const, dot = d[0] * t[0] + d[1] * t[1] + d[2] * t[2];
  const amount = dot / (tn * tn), cos = dot / (Math.hypot(...d) * tn || 1);
  const verdict: WholeVerdict = amount < o.none ? "none" : cos < o.minCos ? "color" : amount < o.weak ? "weak" : amount > o.strong ? "strong" : "similar";
  return { verdict, amount, cos, target: tn };
}
