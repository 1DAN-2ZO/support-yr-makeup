/**
 * 화장 이미지 → "어디에·어떻게"를 뽑아 가이드 점선(화면 3·4)용 GuideSource 로 낸다. 두 가지 모드:
 *  - extractGuide(bare, madeup, ...): 맨얼굴 사진과 비교(점마다 bare 의 그 자리 색과 diff) — 제일 정확.
 *  - extractGuideSingle(madeup, ...): 맨얼굴 사진 없이, 화장 사진 자신의 이마 피부색(foreheadLab) 하나를
 *    기준으로 diff — 실제로 칠해진 자리를 맨얼굴 없이도 뽑으려는 요청(2026-10-06)에 대응. 이마·볼처럼
 *    원래 피부색인 부위는 잘 잡히지만, 입술·눈썹처럼 화장 없이도 이마와 색이 다른 부위는 "화장 없음"도
 *    일부 "화장 있음"으로 잡힐 수 있다 — 맨얼굴 비교보다 거칠다.
 *
 * 0단계(2026-10-06): 정렬·조명보정·헤어마스크 없음(두 이미지 비교 모드에 한함) — 전처리는 결과를 보고
 * 증상별로 나중에 추가한다: 선이 자리에서 밀림 → 정렬(score.similarityFit) · 전체가 옅게 다 걸림 → 조명보정 ·
 * 머리선 근처 가짜 영역 → 헤어마스크 제외.
 *
 * ray-walk: core/hairline.ts findHairline 과 같은 방식 — 중심에서 바깥으로 걸어가다 "화장 아님" 판정이
 * 나오면 멈춘다. liner·lip 은 PartGeometry 가 다각형을 안 받는 타입이라(score-part.ts #139 계약) 점 하나·
 * 스칼라 하나로 환산해서 낸다. 지금은 사진 한 장에 한 번 그리는 용도라 GuideSource 가 받는 f(현재 프레임)는
 * 안 쓴다 — 화면 4 처럼 매 프레임 다시 투영하려면 나중에 f.lm 기준으로 다시 짜야 한다.
 */

import type { Lab, RgbaImage } from "./color";
import { deltaE, foreheadLab, labAt } from "./color";
import { LM, at } from "./landmarks";
import type { GuideSource, PartGeometry } from "./score-part";
import type { Side } from "./score";
import type { Baseline, Pt } from "./types";

/**
 * rays: 둘레를 몇 방향으로 걸을지 · stepRatio/maxRatio: 기준 길이(unit) 비율로 건너뛰는 보폭·최대 거리 · deltaCut: 이 이상 색차가 나야 "화장".
 * maxRatio 0.5(얼굴폭 절반)는 너무 넉넉해서 색차가 못 넘기면 머리카락·배경까지 걸어가 버렸다(실측 확인, 2026-10-06) —
 * 기존 GUIDE_PARAMS 실제 치수(볼·쉐딩 반지름 얼굴폭의 0.05~0.13)에 맞춰 낮췄다. 입술은 오버라인이 최대 0.3(personalize.ts
 * PLAN_LIMITS.lipOverline)까지 정상이라 이 기본값보다 넉넉한 maxRatio 를 따로 준다(extractLip).
 */
export interface ExtractOpts {
  rays: number;
  stepRatio: number;
  maxRatio: number;
  deltaCut: number;
}
export const EXTRACT: ExtractOpts = { rays: 12, stepRatio: 0.015, maxRatio: 0.2, deltaCut: 6 };

type InMakeup = (refLab: Lab, curLab: Lab) => boolean;
const byDeltaE = (cut: number): InMakeup => (r, c) => deltaE(r, c) >= cut;
const darker = (cut: number): InMakeup => (r, c) => r.L - c.L >= cut;
const lighter = (cut: number): InMakeup => (r, c) => c.L - r.L >= cut;

/** 기준 색 — 두 사진 비교면 그 자리의 bare 색, 사진 한 장이면 이마에서 한 번 잰 고정값 */
type RefLab = (p: Pt) => Lab;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
const centroid = (pts: readonly Pt[]): Pt => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

/** center 에서 opts.rays 방향으로 걸어가며 test 가 거짓이 되는 자리(=화장 끝)를 찾는다. 첫 걸음부터 거짓이면 center 그대로(넓이 0) */
function rayWalk(ref: RefLab, cur: RgbaImage, center: Pt, unit: number, test: InMakeup, opts: ExtractOpts = EXTRACT): Pt[] {
  const step = Math.max(1, unit * opts.stepRatio), max = unit * opts.maxRatio;
  return Array.from({ length: opts.rays }, (_, i) => {
    const a = (i / opts.rays) * 2 * Math.PI;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    let last = center;
    for (let s = step; s <= max; s += step) {
      const p = { x: center.x + dir.x * s, y: center.y + dir.y * s };
      if (!test(ref(p), labAt(cur, p.x, p.y))) break;
      last = p;
    }
    return last;
  });
}

/** 한 방향으로만 걸어서 끝점 하나(=화장 끝) 찾기 — 라이너 꼬리·입술 오프셋처럼 점 하나·거리 하나면 되는 경우 */
function rayWalk1(ref: RefLab, cur: RgbaImage, from: Pt, dir: Pt, unit: number, test: InMakeup, opts: ExtractOpts = EXTRACT): { pt: Pt; dist: number } {
  const step = Math.max(1, unit * opts.stepRatio), max = unit * opts.maxRatio;
  let last = from, dist = 0;
  for (let s = step; s <= max; s += step) {
    const p = { x: from.x + dir.x * s, y: from.y + dir.y * s };
    if (!test(ref(p), labAt(cur, p.x, p.y))) break;
    last = p; dist = s;
  }
  return { pt: last, dist };
}

const SIDES = [
  { key: "R" as Side, eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA },
  { key: "L" as Side, eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB },
] as const;
const both = <T>(fn: (s: (typeof SIDES)[number]) => T): Record<Side, T> => ({ R: fn(SIDES[0]!), L: fn(SIDES[1]!) });

/** 눈꼬리 각도(°) 후보들 — wingAngle 을 안다고 가정 안 하고, 실제로 색차가 제일 오래 남는 각도를 찾는다(guides.ts wingOf 와 같은 회전식) */
const WING_DEG = [-10, 0, 10, 20, 30, 40, 50, 60] as const;

function extractLiner(ref: RefLab, cur: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): NonNullable<PartGeometry["liner"]> {
  const thicks: number[] = [];
  const wing = both(({ eye }) => {
    const outer = at(lm, eye.outer), inner = at(lm, eye.inner);
    const v = norm(sub(outer, inner));   // 안쪽 → 바깥쪽 눈 축
    let best = { pt: outer, dist: -1 };
    for (const deg of WING_DEG) {
      const a = (deg * Math.PI) / 180;
      const dir = norm({ x: v.x * Math.cos(a), y: v.y * Math.cos(a) - Math.sin(a) });   // 화면 위쪽 = -y
      const r = rayWalk1(ref, cur, outer, dir, unit.eye, byDeltaE(EXTRACT.deltaCut));
      if (r.dist > best.dist) best = r;
    }
    // 두께: 위눈꺼풀 점 몇 개에서 위(화면 위쪽)로 걸어서 평균
    for (const i of [0, Math.floor(eye.upper.length / 2), eye.upper.length - 1]) {
      const p = at(lm, eye.upper[i]!);
      thicks.push(rayWalk1(ref, cur, p, { x: 0, y: -1 }, unit.eye, byDeltaE(EXTRACT.deltaCut)).dist / unit.eye);
    }
    return [outer, best.pt] as const;
  });
  const thick = thicks.reduce((a, b) => a + b, 0) / thicks.length || 0;
  return { wing, thick };
}

/** 입술 오버라인은 최대 0.3(personalize.ts PLAN_LIMITS.lipOverline)까지 정상이라 기본 maxRatio(0.2)보다 넉넉하게 */
const LIP_EXTRACT = { ...EXTRACT, maxRatio: 0.35 };

function extractLip(ref: RefLab, cur: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): NonNullable<PartGeometry["lip"]> {
  const pts = LM.lipsOuter.map((i) => at(lm, i));
  const c = centroid(pts);
  const ratios = pts.map((p) => rayWalk1(ref, cur, p, norm(sub(p, c)), unit.lip, byDeltaE(EXTRACT.deltaCut), LIP_EXTRACT).dist / unit.lip);
  return { offset: ratios.reduce((a, b) => a + b, 0) / ratios.length || 0 };
}

function extractRegions(ref: RefLab, cur: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"], partId: "shadow" | "cheek"): Record<Side, Pt[]> {
  return both(({ eye, brow, cheek }) => {
    const center = partId === "shadow" ? centroid([...eye.upper.map((i) => at(lm, i)), ...brow.lower.map((i) => at(lm, i))]) : at(lm, cheek);
    return rayWalk(ref, cur, center, unit.face, byDeltaE(EXTRACT.deltaCut));
  });
}

function extractContour(ref: RefLab, cur: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): NonNullable<PartGeometry["contour"]> {
  const centers = SIDES.map(({ cheek }) => at(lm, cheek));
  return {
    shading: centers.map((c) => rayWalk(ref, cur, c, unit.face, darker(EXTRACT.deltaCut))),
    highlight: centers.map((c) => rayWalk(ref, cur, c, unit.face, lighter(EXTRACT.deltaCut))),
  };
}

/** ref·cur·lm·unit 만 있으면 부위 전부를 한 번에 뽑아 GuideSource 로 낸다. brow 는 PartGeometry 에 자리가 없어 못 낸다 */
function extractAll(ref: RefLab, cur: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): GuideSource {
  const liner = extractLiner(ref, cur, lm, unit);
  const lip = extractLip(ref, cur, lm, unit);
  const shadow = extractRegions(ref, cur, lm, unit, "shadow");
  const cheek = extractRegions(ref, cur, lm, unit, "cheek");
  const contour = extractContour(ref, cur, lm, unit);
  return (partId): PartGeometry => {
    if (partId === "liner") return { liner };
    if (partId === "lip") return { lip };
    if (partId === "shadow") return { regions: shadow };
    if (partId === "cheek") return { regions: cheek };
    if (partId === "contour") return { contour };
    return {};
  };
}

/** 맨얼굴 사진(bare)과 생성된 화장 이미지(madeup, bare 와 같은 크기·구도 전제) + 맨얼굴 랜드마크/기준 길이로 GuideSource 를 낸다 */
export function extractGuide(bare: RgbaImage, madeup: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): GuideSource {
  return extractAll((p) => labAt(bare, p.x, p.y), madeup, lm, unit);
}

/**
 * 맨얼굴 사진 없이 — 화장 이미지 하나로 "실제로 칠해진 자리"를 뽑는다(2026-10-06 요청).
 * 이마 피부색(foreheadLab, 앞머리 뺀 비화장 영역) 하나를 기준 삼아 diff — 이마·볼처럼 원래 피부인 부위는
 * 잘 맞지만, 입술·눈썹처럼 맨얼굴이어도 이마와 색이 다른 부위는 "화장 없음"도 섞여 나올 수 있다.
 * 이마 피부색을 못 재면(앞머리로 덮임 등) null.
 */
export function extractGuideSingle(madeup: RgbaImage, lm: readonly Pt[], unit: Baseline["unit"]): GuideSource | null {
  const skin = foreheadLab(madeup, lm);
  if (!skin) return null;
  return extractAll(() => skin, madeup, lm, unit);
}
