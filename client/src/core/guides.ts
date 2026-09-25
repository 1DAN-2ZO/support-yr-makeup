/**
 * ② 가이드 기하 (2-1, #21). 랜드마크(px)를 받아 부위별 가이드의 자리와 치수를 그 자리에서 계산한다.
 *
 * 두 곳이 쓴다.
 *  - 채점: lookGuide(룩) → GuideSource. 모양은 score-part.ts 의 PartGeometry (#139 계약).
 *    맨얼굴·화장 사진에 각각 부르므로 저장하지 않고 넘긴 랜드마크로 만든다 (결정 A2).
 *  - 화면: linerOutline() — 라이너를 얼마나 두껍게 칠할지 보여 주는 윤곽.
 *
 * 채점에 주는 값은 임시 guide-poc.ts 와 같다 — 갈아끼워도 점수가 안 바뀐다(검증 G3).
 * 쉐딩은 아직 자리표시(둥근형 예시 타원)다. contour.ts 가 얼굴형 규칙(contourOutline) 밴드로 바꾼다.
 *
 * R = 이미지 왼쪽 눈(eyeA) = 피험자 오른쪽. 진단 문구 "오른쪽 꼬리가…" 가 여기 묶여 있어 뒤집으면 반대로 안내한다.
 */

import { contourOutline } from "./contour";
import { faceAxis, mmPerPx } from "./face-measure";
import { LM, at } from "./landmarks";
import type { LookPart, LookPartId } from "./looks";
import { PLAN_RULES, type BrowArch, type LinerStyle, type PersonalPlan } from "./personalize";
import type { GuideSource, PartGeometry } from "./score-part";
import type { Side } from "./score";
import type { Baseline, Pt } from "./types";

/**
 * 가이드 치수 — 가정값은 여기 한 곳 (dev-stack §6). 길이는 전부 비율: 눈 부위는 눈 폭, 입술은 입술 폭, 볼·쉐딩은 얼굴 폭.
 * 라이너 두께만 룩(rules/looks.json parts.liner.thick)이 정하고, 여기 값은 룩에 두께가 없을 때(룩이 빈 평가 문항)의 기본이다.
 * 나머지는 룩에 없는 값이라 POC TEMPLATE 그대로 — 최종 값은 #78(룩 확정)·#121(값 측정)에서 온다.
 * 주의: 채점은 이 선을 0점으로 삼는다. 여기 숫자가 미용적으로 틀리면 앱이 사용자에게 "틀렸다" 고 말한다 (결정 B1).
 */
export const GUIDE_PARAMS = {
  liner: { wingAngle: 30, wing: 0.15, thick: 0.045 },
  lip: { offset: 0.01 },
  shadow: { rangeRatio: 0.55 },
  cheek: { toward: 0.25, rx: 0.11, ry: 0.07, tilt: -25 },
  contour: { rx: 0.13, ry: 0.05, tilt: -30, down: 0.06, toward: 0.35 },
  highlight: { rx: 0.09, ry: 0.035, tilt: -20, up: 0.05, toward: 0.2 },
} as const;

/**
 * 개인화한 라이너의 꼬리 치수 (ILoveEye 2022, 자연스러운 날개 라이너 표본을 잰 값).
 * 개인화하지 않은 경로는 GUIDE_PARAMS.liner(30°, 15%)를 그대로 쓴다 — 기본값을 바꿀지는 ② 의 결정(B1).
 */
export const PERSONAL_LINER = { wingedDeg: 15, length: 0.12 } as const;

/**
 * 표준형 눈썹 기준값 mm (장소쌍·최민령 2023, JKSC — 선행 연구 정리값).
 * 두께만 논문 표(9.8)가 아니라 +1 mm: 여섯 얼굴형 모두 전문가가 +1 mm 를 골랐다 — 얼굴형과 무관하게 기준이 얇았던 것으로 읽는다.
 * 얼굴형에 따른 높이·미간 조정(±4 mm)은 여기 넣지 않는다 — 얼굴 비율이 카메라 거리에 따라 흔들려 보류(C-2).
 */
export const STANDARD_BROW_MM = { pupilToTop: 22.05, innerToTop: 22.85, outerToTop: 23.38, lidToBottom: 13.7, headThick: 10.8, glabella: 28.8 } as const;

/** 굽기 조정: arched 면 가장 높은 곳을 이만큼(mm) 올리고 flatter 면 내린다. 논문 값이 아니라 우리 가정값 (Zhao 2019 는 방향만 준다) */
export const BROW_ARCH_MM = 1;

/** 표준 눈썹 조정 — personalize.ts 의 계획(BrowPlanValues)에서 온다 */
export interface BrowAdjust { heightMm: number; glabellaMm: number; arch: BrowArch }

/** 랜드마크와 기준 길이만 있으면 된다 — 화면에서는 이미지 없이 부른다 */
export type GuideFrame = { lm: readonly Pt[]; unit: Baseline["unit"] };

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
  { key: "R" as Side, eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, ala: LM.alaA, sign: -1 },
  { key: "L" as Side, eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, ala: LM.alaB, sign: 1 },
] as const;
type SideSpec = (typeof SIDES)[number];
const both = <T>(fn: (s: SideSpec) => T): Record<Side, T> => ({ R: fn(SIDES[0]), L: fn(SIDES[1]) });

/**
 * 꼬리 선 [눈꼬리, 꼬리 끝].
 * 스타일이 없으면: 눈 축(안쪽→바깥)에서 wingAngle 만큼 화면 위로, 길이는 눈 폭 × wing (지금까지의 가이드).
 * 스타일이 있으면: ILoveEye 의 세 스타일. 방향을 화면이 아니라 눈에 대고 정한다 — 고개를 기울여도 같은 모양.
 */
function wingOf(f: GuideFrame, eye: SideSpec["eye"], style?: LinerStyle): readonly [Pt, Pt] {
  if (style) return personalWing(f, eye, style);
  const outer = at(f.lm, eye.outer), inner = at(f.lm, eye.inner);
  const v = norm(sub(outer, inner)), a = (GUIDE_PARAMS.liner.wingAngle * Math.PI) / 180;
  const dir = norm(add(mul(v, Math.cos(a)), { x: 0, y: -Math.sin(a) }));
  return [outer, add(outer, mul(dir, GUIDE_PARAMS.liner.wing * f.unit.eye))] as const;
}

/**
 * 채점용 가이드. 룩을 고르면 라이너 두께가 따라간다 (#44 — 두께가 상수면 룩 선택이 채점에 영향이 없었다).
 * @param lookParts 고른 룩의 parts (looks.json). 비어 있으면 기본 치수
 */
/**
 * 개인화한 꼬리 (ILoveEye 2022). 길이는 모두 눈 폭 × 12%.
 *   winged — 눈 축에서 윗눈꺼풀 쪽으로 15°
 *   extend — 눈 축을 곧게 연장
 *   drop   — 윗눈꺼풀 꼭대기 → 눈꼬리 선을 연장
 * "위" 는 화면 위가 아니라 윗눈꺼풀이 있는 쪽이다 — 고개를 기울여도 같은 모양이 나온다.
 */
function personalWing(f: GuideFrame, eye: SideSpec["eye"], style: LinerStyle): readonly [Pt, Pt] {
  const outer = at(f.lm, eye.outer), inner = at(f.lm, eye.inner);
  const v = norm(sub(outer, inner));
  // 윗눈꺼풀 꼭대기 = 눈 축에서 가장 먼 윗눈꺼풀 점
  const off = (p: Pt) => Math.abs((p.x - inner.x) * v.y - (p.y - inner.y) * v.x);
  const apex = eye.upper.map((i) => at(f.lm, i)).reduce((a, b) => (off(b) > off(a) ? b : a));
  let n = { x: -v.y, y: v.x };                                   // 눈 축에 수직
  if (n.x * (apex.x - outer.x) + n.y * (apex.y - outer.y) < 0) n = mul(n, -1);   // 윗눈꺼풀 쪽으로
  const a = (PERSONAL_LINER.wingedDeg * Math.PI) / 180;
  const dir =
    style === "winged" ? add(mul(v, Math.cos(a)), mul(n, Math.sin(a)))
    : style === "extend" ? v
    : norm(sub(outer, apex));
  return [outer, add(outer, mul(dir, PERSONAL_LINER.length * f.unit.eye))] as const;
}

/** 섀도 영역: 윗눈꺼풀 → 눈썹 아랫선 쪽으로 ratio 만큼. 순서는 눈꺼풀 점들 → 위 테두리(거꾸로) */
function shadowRegions(f: GuideFrame, ratio: number): Record<Side, Pt[]> {
  const P = (i: number): Pt => at(f.lm, i);
  return both(({ eye, brow }) => {
    const lid = eye.upper.map(P), browLo = brow.lower.map(P);
    const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))]!, ratio));
    return [...lid, ...top.reverse()];
  });
}

/**
 * 채점용 가이드.
 * @param lookParts 고른 룩의 parts (looks.json). 비어 있으면 기본 치수
 * @param linerStyle 개인화한 라이너 스타일(personalize.ts). 없으면 지금까지의 꼬리 — 개인화하지 않은 채점은 바뀌지 않는다
 */
export function lookGuide(lookParts: Partial<Record<LookPartId, LookPart>> = {}, linerStyle?: LinerStyle): GuideSource {
  const t = lookParts.liner?.thick;
  const linerThick = t && t > 0 ? t : GUIDE_PARAMS.liner.thick;
  return (partId, f): PartGeometry => {
    const P = (i: number): Pt => at(f.lm, i);
    const faceW = f.unit.face;

    if (partId === "liner") return { liner: { wing: both(({ eye }) => wingOf(f, eye, linerStyle)), thick: linerThick } };
    if (partId === "lip") return { lip: { offset: GUIDE_PARAMS.lip.offset } };
    if (partId === "shadow") return { regions: shadowRegions(f, GUIDE_PARAMS.shadow.rangeRatio) };
    if (partId === "cheek") {
      const c = GUIDE_PARAMS.cheek;
      return { regions: both(({ cheek, face, sign }) => ellipse(mix(P(cheek), P(face), c.toward), faceW * c.rx, faceW * c.ry, sign * c.tilt)) };
    }
    if (partId === "contour") {
      // [자리표시] contour.ts 가 얼굴형 규칙 밴드(contourOutline)로 바꾼다
      const c = GUIDE_PARAMS.contour, h = GUIDE_PARAMS.highlight;
      return {
        contour: {
          shading: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), c.toward), { x: 0, y: faceW * c.down }), faceW * c.rx, faceW * c.ry, sign * c.tilt)),
          highlight: SIDES.map(({ cheek, face, sign }) => ellipse(add(mix(P(cheek), P(face), h.toward), { x: 0, y: -faceW * h.up }), faceW * h.rx, faceW * h.ry, sign * h.tilt)),
        },
      };
    }
    return {};   // 눈썹: 채점이 랜드마크만으로 뽑는다
  };
}

/**
 * 라이너 두께 윤곽 (화면용). 칠할 자리를 선으로 닫아 보여 준다 — 면 채우기 없음(F-07).
 *   아래 테두리 = 속눈썹 선(윗눈꺼풀 점), 위 테두리 = 거기서 화면 위쪽으로 thick × 눈 폭, 끝은 꼬리 끝에서 만난다.
 * 순서: 속눈썹 선(안쪽 → 바깥) → 꼬리 끝 → 위 테두리(바깥 → 안쪽). 닫힌 다각형으로 그리면 된다.
 * 두께 띠를 속눈썹 선에서 **위로** 잡는 뜻은 채점과 맞춰야 한다 (#153).
 */
export function linerOutline(f: GuideFrame, thick: number, linerStyle?: LinerStyle): Record<Side, Pt[]> {
  return both(({ eye }) => {
    const lid = eye.upper.map((i) => at(f.lm, i)).reverse();   // 안쪽 → 바깥
    const off = thick * f.unit.eye;
    const top = lid.map((p, i) => {
      const a = lid[Math.max(0, i - 1)]!, b = lid[Math.min(lid.length - 1, i + 1)]!;
      let n = norm({ x: -(b.y - a.y), y: b.x - a.x });   // 접선에 수직
      if (n.y > 0) n = mul(n, -1);                       // 화면 위쪽(y 가 작아지는 쪽)으로
      return add(p, mul(n, off));
    });
    return [...lid, wingOf(f, eye, linerStyle)[1], ...top.reverse()];
  });
}

export interface BrowPlan {
  /** 앞머리 (미간 쪽 끝) */
  head: { top: Pt; bottom: Pt };
  /** 가장 높은 곳 — 윗점은 동공 위, 아랫점은 윗눈꺼풀 꼭대기 위 */
  peak: { top: Pt; bottom: Pt };
  /** 바깥 눈꼬리 위 */
  outer: { top: Pt; bottom: Pt };
  /** 꼬리 끝 (위아래가 만나는 점) */
  tail: Pt;
  /** 닫힌 윤곽: 윗선(앞머리 → 꼬리) → 아랫선(꼬리 → 앞머리) */
  outline: Pt[];
}

/**
 * 표준 눈썹 (논문 기술 C-1). 기준값 mm 를 동공 사이 거리로 px 로 바꿔 이 얼굴 위에 세운다.
 * 위·아래는 화면이 아니라 얼굴 기준(눈동자 선에 수직) — 고개를 기울여도 얼굴에 붙어 있다.
 * mm 를 모르면(동공 점이 겹침) null.
 *
 * 논문에 없는 부분은 우리 가정이다:
 *  - 바깥 눈꼬리 위 두께 = 가장 높은 곳의 두께
 *  - 꼬리 끝 = 콧방울 → 바깥 눈꼬리 연장선 위(흔한 메이크업 규칙), 높이는 앞머리 **가운데**.
 *    흔히 "앞머리 아랫선과 꼬리 끝이 수평" 이라 하지만, 논문 두께(10.8 mm)로는 꼬리가 눈꼬리 쪽으로 급히 떨어졌다
 *
 * adj(개인화): 전체를 heightMm 만큼 올리고, 미간을 glabellaMm 만큼 넓히고, 굽기에 따라 가장 높은 곳을 옮긴다.
 * 꼬리 끝은 옮긴 앞머리 가운데 높이로 다시 구한다 — 콧방울 선 위에 남는다.
 */
export function browStandard(f: GuideFrame, adj?: BrowAdjust): Record<Side, BrowPlan> | null {
  const mm = mmPerPx(f.lm);
  if (mm == null) return null;
  const B = STANDARD_BROW_MM, px = (v: number) => v / mm;
  const P = (i: number): Pt => at(f.lm, i);
  const u = faceAxis(f.lm);                 // 얼굴 가로 (이미지 왼쪽 → 오른쪽)
  const up = { x: u.y, y: -u.x };           // 이마 쪽
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
 * 개인화 가이드 — 개인화 계획이 가이드와 채점의 정답이 된다 (결정 2026-09-25: 개인화된 얼굴이 정답).
 * 예상도(2-b)·화면 4 테두리·채점이 **같은 계획**을 읽어야 한다 — 계획은 세션에 한 번 정해 둔다(session.plan).
 *
 * 계획이 바꾸는 것: 라이너 꼬리 스타일, 섀도 범위 배율, 눈썹 정답 영역(표준 눈썹 + 얼굴형 조정).
 * 계획이 없으면 lookGuide 그대로 — 개인화 전 점수가 바뀌지 않는다.
 *
 * 아직 채점이 쓰지 않는 것 (③ 결정): 눈썹 영역(채점은 지금 랜드마크 눈썹을 본다), 진하기 배율(강도 밴드 #153).
 */
export function planGuide(lookParts: Partial<Record<LookPartId, LookPart>> = {}, plan?: PersonalPlan | null): GuideSource {
  const base = lookGuide(lookParts, plan?.liner.plan.style);
  if (!plan) return base;
  return (partId, f): PartGeometry => {
    const P = (i: number): Pt => at(f.lm, i);
    if (partId === "shadow") return { regions: shadowRegions(f, GUIDE_PARAMS.shadow.rangeRatio * plan.shadow.range) };
    if (partId === "brow") {
      const b = browStandard(f, plan.brow);
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
      // 볼: 얼굴 위쪽(눈동자 선에 수직)으로 옮기고, 타원 크기에 배율
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
  const upper = LM.lipsOuter.indexOf(291);   // 0..upper 가 윗입술 (61 → 0 → 291)
  return pts.map((p, k) => (k <= upper ? add(p, mul(d, lift * Math.sin((Math.PI * k) / upper))) : p));
}
