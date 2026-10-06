/**
 * 개인화 가이드 (⑥) — 개인화 계획(personalize.ts)을 가이드 기하에 입힌다.
 *
 * ② 의 guides.ts(lookGuide·linerOutline)는 고치지 않고 **감싼다**. ② 가 기본 가이드를 바꾸면 여기도 따라간다.
 * 예상도(2-b AR)·화면 4 테두리·채점이 **같은 계획**을 읽는다 — 결정 2026-09-25: 개인화된 얼굴이 정답.
 *
 * 들어 있는 것:
 *  - styledGuide / linerOutline: 라이너 꼬리 스타일 (ILoveEye 2022: winged·extend·drop)
 *  - browStandard: 표준 눈썹 (JKSC 2023, mm 는 동공 사이 거리 자)
 *  - lipOutline: 윗입술 오버라인
 *  - planGuide: 위 전부 + 섀도 범위·볼 위치·쉐딩(contour.ts)을 계획대로
 * 논문 수치가 아닌 값은 가정값으로 표시해 두었다 (PLAN_RULES · PERSONAL_LINER · BROW_ARCH_MM).
 */

import { contourOutline } from "./contour";
import { faceAxis, mmPerPx } from "./face-measure";
import { GUIDE_PARAMS, lookGuide, type GuideFrame } from "./guides";
import { LM, at } from "./landmarks";
import type { LookPart, LookPartId } from "./looks";
import { PLAN_RULES, type BrowArch, type LinerStyle, type PersonalPlan } from "./personalize";
import type { GuideSource, PartGeometry } from "./score-part";
import type { Side } from "./score";
import type { Pt } from "./types";

/** 콧방울 가장 바깥 점 — 눈썹 꼬리 끝을 정하는 선(콧방울 → 바깥 눈꼬리)의 출발점. 공용 LM 표를 고치지 않으려고 여기 둔다 */
export const ALA = { R: 129, L: 358 } as const;

/**
 * 개인화한 라이너의 꼬리 치수 (ILoveEye 2022, 자연스러운 날개 라이너 표본을 잰 값).
 * 개인화하지 않은 경로는 ② 의 GUIDE_PARAMS.liner(30°, 15%)를 그대로 쓴다 — 기본값을 바꿀지는 ② 의 결정(B1).
 */
export const PERSONAL_LINER = { wingedDeg: 15, length: 0.12 } as const;

/**
 * 표준형 눈썹 기준값 mm (장소쌍·최민령 2023, JKSC — 선행 연구 정리값).
 * 두께만 논문 표(9.8)가 아니라 +1 mm: 여섯 얼굴형 모두 전문가가 +1 mm 를 골랐다.
 */
export const STANDARD_BROW_MM = { pupilToTop: 22.05, innerToTop: 22.85, outerToTop: 23.38, lidToBottom: 13.7, headThick: 10.8, glabella: 28.8 } as const;

/** 굽기 조정: arched 면 가장 높은 곳을 이만큼(mm) 올리고 flatter 면 내린다. 우리 가정값 (Zhao 2019 는 방향만 준다) */
export const BROW_ARCH_MM = 1;

/** 표준 눈썹 조정 — personalize.ts 의 계획(BrowPlanValues)에서 온다 */
export interface BrowAdjust { heightMm: number; glabellaMm: number; arch: BrowArch }

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function ellipse(c: Pt, rx: number, ry: number, deg: number, n = 28): Pt[] {
  const t = (deg * Math.PI) / 180, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push({ x: c.x + x * Math.cos(t) - y * Math.sin(t), y: c.y + x * Math.sin(t) + y * Math.cos(t) });
  }
  return out;
}

const SIDES = [
  { key: "R" as Side, eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, ala: ALA.R, sign: -1 },
  { key: "L" as Side, eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, ala: ALA.L, sign: 1 },
] as const;
type SideSpec = (typeof SIDES)[number];
const both = <T>(fn: (s: SideSpec) => T): Record<Side, T> => ({ R: fn(SIDES[0]), L: fn(SIDES[1]) });

/**
 * 개인화한 꼬리 [눈꼬리, 꼬리 끝] (ILoveEye 2022). 길이는 모두 눈 폭 × 12%.
 *   winged — 눈 축에서 윗눈꺼풀 쪽으로 15° · extend — 눈 축을 곧게 연장 · drop — 윗눈꺼풀 꼭대기 → 눈꼬리 선을 연장
 * "위" 는 화면 위가 아니라 윗눈꺼풀이 있는 쪽이다 — 고개를 기울여도 같은 모양이 나온다.
 */
function personalWing(f: GuideFrame, eye: SideSpec["eye"], style: LinerStyle): readonly [Pt, Pt] {
  const outer = at(f.lm, eye.outer), inner = at(f.lm, eye.inner);
  const v = norm(sub(outer, inner));
  const off = (p: Pt) => Math.abs((p.x - inner.x) * v.y - (p.y - inner.y) * v.x);
  const apex = eye.upper.map((i) => at(f.lm, i)).reduce((a, b) => (off(b) > off(a) ? b : a));
  let n = { x: -v.y, y: v.x };
  if (n.x * (apex.x - outer.x) + n.y * (apex.y - outer.y) < 0) n = mul(n, -1);
  const a = (PERSONAL_LINER.wingedDeg * Math.PI) / 180;
  const dir = style === "winged" ? add(mul(v, Math.cos(a)), mul(n, Math.sin(a))) : style === "extend" ? v : norm(sub(outer, apex));
  return [outer, add(outer, mul(dir, PERSONAL_LINER.length * f.unit.eye))] as const;
}

/** ② 의 기본 꼬리 (lookGuide 와 같은 계산) — 스타일이 없을 때 윤곽 끝점에 쓴다 */
function defaultWing(f: GuideFrame, eye: SideSpec["eye"]): readonly [Pt, Pt] {
  const outer = at(f.lm, eye.outer), inner = at(f.lm, eye.inner);
  const v = norm(sub(outer, inner)), a = (GUIDE_PARAMS.liner.wingAngle * Math.PI) / 180;
  const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
  return [outer, add(outer, mul(dir, GUIDE_PARAMS.liner.wing * f.unit.eye))] as const;
}

/** ② 의 lookGuide + 라이너 꼬리만 스타일대로. 스타일이 없으면 lookGuide 그대로 */
export function styledGuide(lookParts: Partial<Record<LookPartId, LookPart>> = {}, style?: LinerStyle): GuideSource {
  const base = lookGuide(lookParts);
  if (!style) return base;
  return (partId, f): PartGeometry => {
    const g = base(partId, f);
    if (partId !== "liner" || !g.liner) return g;
    return { liner: { ...g.liner, wing: both(({ eye }) => personalWing(f, eye, style)) } };
  };
}

/**
 * 라이너 두께 윤곽 (화면용) — ② 의 linerOutline 과 같은 모양에 꼬리만 스타일대로.
 * 순서: 속눈썹 선(안쪽 → 바깥) → 꼬리 끝 → 위 테두리(바깥 → 안쪽).
 */
export function linerOutline(f: GuideFrame, thick: number, style?: LinerStyle): Record<Side, Pt[]> {
  return both(({ eye }) => {
    const lid = eye.upper.map((i) => at(f.lm, i)).reverse();
    const off = thick * f.unit.eye;
    const top = lid.map((p, i) => {
      const a = lid[Math.max(0, i - 1)]!, b = lid[Math.min(lid.length - 1, i + 1)]!;
      let n = norm({ x: -(b.y - a.y), y: b.x - a.x });
      if (n.y > 0) n = mul(n, -1);
      return add(p, mul(n, off));
    });
    const tip = (style ? personalWing(f, eye, style) : defaultWing(f, eye))[1];
    return [...lid, tip, ...top.reverse()];
  });
}

/** 섀도우 눈꼬리 연장 길이 (눈 폭 비율) — ④ 실험 화면(makeup-probe.ts)과 같은 값. 블러보다 확실히 크게 잡은 눈대중값 */
export const SHADOW_TAIL_RATIO = 0.35;

/**
 * 섀도우 눈꼬리 연장 (화장 shadow.tailExtend, #250) — 섀도 영역(shadowRegions: 눈꺼풀 → 위 테두리 거꾸로) 끝에 이어 붙이면
 * 꼬리까지 한 모양이 되는 두 점 [위 테두리 끝(눈꼬리 위)과 꼬리 끝의 가운데, 꼬리 끝].
 * 꼬리 끝 = 눈꼬리에서 라이너 꼬리 "방향"으로 눈 폭 × SHADOW_TAIL_RATIO (라이너 자체 길이는 번짐에 뭉개져서).
 * 칠하기(makeup-paint)와 화면 3·4 테두리(#30) · 채점 영역(#284)이 같이 쓴다 — 완성본에 칠한 꼬리와 테두리 · 채점이 같은 모양
 */
export function shadowTail(f: GuideFrame, regions: Record<Side, readonly Pt[]>, linerThick: number, style?: LinerStyle): Record<Side, [Pt, Pt]> {
  const liner = linerOutline(f, linerThick, style);
  return both(({ key, eye }): [Pt, Pt] => {
    const r = regions[key], outer = r[0]!, top = r[r.length - 1]!, tip = liner[key][eye.upper.length]!;
    const dx = tip.x - outer.x, dy = tip.y - outer.y, len = Math.hypot(dx, dy) || 1;
    const end = { x: outer.x + (dx / len) * SHADOW_TAIL_RATIO * f.unit.eye, y: outer.y + (dy / len) * SHADOW_TAIL_RATIO * f.unit.eye };
    return [mix(top, end, 0.5), end];
  });
}

/** 섀도 영역: 윗눈꺼풀 → 눈썹 아랫선 쪽으로 ratio 만큼 (② lookGuide 와 같은 계산). 눈꺼풀 점들 → 위 테두리(거꾸로) */
export function shadowRegions(f: GuideFrame, ratio: number): Record<Side, Pt[]> {
  const P = (i: number): Pt => at(f.lm, i);
  return both(({ eye, brow }) => {
    const lid = eye.upper.map(P), browLo = brow.lower.map(P);
    const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))]!, ratio));
    return [...lid, ...top.reverse()];
  });
}

export interface BrowPlan {
  head: { top: Pt; bottom: Pt };
  peak: { top: Pt; bottom: Pt };
  outer: { top: Pt; bottom: Pt };
  tail: Pt;
  /** 닫힌 윤곽: 윗선(앞머리 → 꼬리) → 아랫선(꼬리 → 앞머리) */
  outline: Pt[];
}

/**
 * 표준 눈썹 (JKSC 2023). 기준값 mm 를 동공 사이 거리로 px 로 바꿔 이 얼굴 위에 세운다. mm 를 모르면 null.
 * 가정: 바깥 눈꼬리 위 두께 = 가장 높은 곳의 두께 · 꼬리 끝 = 콧방울 → 바깥 눈꼬리 연장선 위, 높이는 앞머리 가운데.
 */
export function browStandard(f: GuideFrame, adj?: BrowAdjust): Record<Side, BrowPlan> | null {
  const mm = mmPerPx(f.lm);
  if (mm == null) return null;
  const B = STANDARD_BROW_MM, px = (v: number) => v / mm;
  const P = (i: number): Pt => at(f.lm, i);
  const u = faceAxis(f.lm);
  const up = { x: u.y, y: -u.x };
  const mid = mix(P(LM.eyeA.inner), P(LM.eyeB.inner), 0.5);
  const height = (p: Pt) => (p.x - mid.x) * up.x + (p.y - mid.y) * up.y;
  const place = (along: number, h: number): Pt => add(mid, add(mul(u, along), mul(up, h)));
  const lift = px(adj?.heightMm ?? 0);
  const arch = adj?.arch === "arched" ? px(BROW_ARCH_MM) : adj?.arch === "flatter" ? -px(BROW_ARCH_MM) : 0;
  const halfGlabella = px(B.glabella + (adj?.glabellaMm ?? 0)) / 2;
  const plans = both(({ eye, ala, sign }): BrowPlan | null => {
    const outer = P(eye.outer), pupil = P(eye.iris[0]), a = P(ala);
    const apex = eye.upper.map(P).reduce((p, q) => (height(q) > height(p) ? q : p));
    const headTop = height(P(eye.inner)) + px(B.innerToTop) + lift;
    const head = { top: place(sign * halfGlabella, headTop), bottom: place(sign * halfGlabella, headTop - px(B.headThick)) };
    const peak = { top: add(pupil, mul(up, px(B.pupilToTop) + lift + arch)), bottom: add(apex, mul(up, px(B.lidToBottom) + lift + arch)) };
    const oTop = add(outer, mul(up, px(B.outerToTop) + lift));
    const out = { top: oTop, bottom: add(oTop, mul(up, height(peak.bottom) - height(peak.top))) };
    const span = height(outer) - height(a);
    if (Math.abs(span) < 1e-6) return null;
    const tail = mix(a, outer, (headTop - px(B.headThick) / 2 - height(a)) / span);
    return { head, peak, outer: out, tail, outline: [head.top, peak.top, out.top, tail, out.bottom, peak.bottom, head.bottom] };
  });
  return plans.R && plans.L ? { R: plans.R, L: plans.L } : null;
}

/**
 * 표준 눈썹을 **이 사람 실제 눈썹 높이**에 맞춘 것 — 모양(두께·앞머리·꼬리·굽기)은 표준, 세로 자리만 실제 눈썹 가운데.
 * 표준은 한국 여성 평균 mm(JKSC 2023)라 사람마다 크게 다르다. 폰 시험(2026-09-30)에서 표준이 실제 눈썹보다 4~5 mm 아래라
 * 테두리가 눈썹과 눈 사이에 섰다 — "원래 결을 따라 빈 곳만 채우세요" 인데 눈썹 아래 피부를 칠하게 된다.
 * 계획의 높이 조정(heightMm)은 실제 눈썹 기준으로 살린다: 옮기는 양은 조정 없는 표준으로 재고, 조정한 표준을 그만큼 옮긴다.
 */
export function browOnFace(f: GuideFrame, adj?: BrowAdjust): Record<Side, BrowPlan> | null {
  const plan = browStandard(f, adj), ref = adj?.heightMm ? browStandard(f, { ...adj, heightMm: 0 }) : plan;
  if (!plan || !ref) return null;
  const u = faceAxis(f.lm), up = { x: u.y, y: -u.x };
  const h = (p: Pt): number => p.x * up.x + p.y * up.y;
  const meanH = (pts: readonly Pt[]): number => pts.reduce((s, p) => s + h(p), 0) / pts.length;
  return both(({ key, brow }) => {
    const real = meanH([...brow.upper, ...brow.lower].map((i) => at(f.lm, i)));
    const d = mul(up, real - meanH(ref[key].outline));
    const mv = (p: Pt): Pt => add(p, d);
    const b = plan[key];
    return {
      head: { top: mv(b.head.top), bottom: mv(b.head.bottom) },
      peak: { top: mv(b.peak.top), bottom: mv(b.peak.bottom) },
      outer: { top: mv(b.outer.top), bottom: mv(b.outer.bottom) },
      tail: mv(b.tail),
      outline: b.outline.map(mv),
    };
  });
}

/**
 * 개인화 가이드 — 계획이 없으면 ② 의 lookGuide 그대로(개인화 전 점수가 바뀌지 않는다).
 * 계획이 바꾸는 것: 라이너 꼬리·두께, 섀도 범위, 눈썹 정답 영역, 입술 오버라인, 볼 위치·크기, 쉐딩·하이라이트(얼굴형·T존).
 */
export function planGuide(lookParts: Partial<Record<LookPartId, LookPart>> = {}, plan?: PersonalPlan | null): GuideSource {
  const style = plan?.liner.plan.style;
  const base = styledGuide(lookParts, style);
  // 섀도 눈꼬리 연장이 있는 화장은 영역 끝에 꼬리 두 점을 이어 붙인다 — 화면 3·4 테두리와 채점이 같은 모양 (#30 · #284 ⑥ 결정)
  const linerThick = (lookParts.liner?.thick ?? GUIDE_PARAMS.liner.thick) * (plan?.linerThick.scale ?? 1);
  const withTail = (g: PartGeometry, f: GuideFrame): PartGeometry => {
    if (!lookParts.shadow?.tailExtend || !g.regions) return g;
    const t = shadowTail(f, g.regions, linerThick, style);
    return { ...g, regions: { R: [...g.regions.R, ...t.R], L: [...g.regions.L, ...t.L] } };
  };
  if (!plan) return (partId, f) => (partId === "shadow" ? withTail(base(partId, f), f) : base(partId, f));
  return (partId, f): PartGeometry => {
    const P = (i: number): Pt => at(f.lm, i);
    if (partId === "shadow") return withTail({ regions: shadowRegions(f, GUIDE_PARAMS.shadow.rangeRatio * plan.shadow.range) }, f);
    if (partId === "brow") {
      const b = browOnFace(f, plan.brow);
      return b ? { regions: { R: b.R.outline, L: b.L.outline } } : {};
    }
    if (partId === "liner") {
      const g = base(partId, f).liner!;
      return { liner: { ...g, thick: g.thick * plan.linerThick.scale } };
    }
    if (partId === "lip") {
      const g = base(partId, f);
      return plan.lip.overline > 0 ? { lip: { ...g.lip!, upperOverline: plan.lip.overline } } : g;
    }
    if (partId === "cheek") {
      const c = GUIDE_PARAMS.cheek, faceW = f.unit.face, u = faceAxis(f.lm);
      const shift = plan.blush.position === "higher" ? PLAN_RULES.blushShift : plan.blush.position === "lower" ? -PLAN_RULES.blushShift : 0;
      const up = { x: u.y, y: -u.x };
      return {
        regions: both(({ cheek, face, sign }) =>
          ellipse(add(mix(P(cheek), P(face), c.toward), mul(up, shift * faceW)), faceW * c.rx * plan.blush.size, faceW * c.ry * plan.blush.size, sign * c.tilt)),
      };
    }
    if (partId === "contour") return { contour: contourOutline(f.lm, plan.faceShape ?? "oval", { tZone: plan.highlight.tZone }) };
    return base(partId, f);
  };
}

/**
 * 입술 바깥 윤곽 (LM.lipsOuter 순서). overline > 0 이면 윗입술을 가운데에서 가장 많이, 입꼬리에서 0 이 되게 올린다.
 * 올리는 양 = overline × 윗입술 두께(0 ↔ 13), 방향 = 입 안쪽(13) → 윗입술 바깥(0).
 */
export function lipOutline(lm: readonly Pt[], overline = 0): Pt[] {
  const pts = LM.lipsOuter.map((i) => at(lm, i));
  if (!(overline > 0)) return pts;
  const top = at(lm, 0), inner = at(lm, 13);
  const d = norm(sub(top, inner)), lift = overline * Math.hypot(top.x - inner.x, top.y - inner.y);
  const upper = LM.lipsOuter.indexOf(291);
  return pts.map((p, k) => (k <= upper ? add(p, mul(d, lift * Math.sin((Math.PI * k) / upper))) : p));
}
