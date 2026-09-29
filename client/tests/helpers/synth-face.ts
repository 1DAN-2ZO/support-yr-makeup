// 시험용 합성 얼굴 — 478점 랜드마크 + 살색 사진에 화장을 픽셀로 "그린다".
// sampling.test.ts(사진 → 점수)와 score-cli.test.ts(평가 CLI)가 같은 얼굴을 쓴다.
import type { RgbaImage } from "@core/color";
import { pointInPoly } from "@core/color";
import { LM } from "@core/landmarks";
import { frameOf } from "@core/sampling";
import type { SampleFrame } from "@core/sampling";
import type { GuideSource, PartGeometry } from "@core/score-part";
import type { Side } from "@core/score";
import type { PartId, Pt } from "@core/types";

export const W = 600, H = 600;
export type Rgb = readonly [number, number, number];
export const SKIN: Rgb = [224, 172, 140], INK: Rgb = [30, 25, 28], BROWN: Rgb = [80, 55, 45], RED: Rgb = [180, 60, 80];
/** 볼터치 적당(지수 ≈ 39, 밴드 25~60 안) / 과함(≈ 150) / 쉐딩 */
export const BLUSH: Rgb = [226, 158, 140], DEEP_BLUSH: Rgb = [215, 95, 105], SHADE: Rgb = [170, 120, 110], HIGHLIGHT: Rgb = [248, 215, 195];

const mirror = (p: Pt): Pt => ({ x: W - p.x, y: p.y });
const arc = (x0: number, x1: number, y: number, rise: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y - rise * Math.sin((Math.PI * i) / (n - 1)) }));

/** 478점. 채점이 쓰는 점만 제자리에 두고 나머지는 얼굴 가운데 */
export function faceLandmarks(): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 300, y: 300, z: 0 }));
  const put = (ids: readonly number[], pts: readonly Pt[]) => ids.forEach((id, i) => { lm[id] = { ...pts[i]!, z: 0 }; });
  put(LM.eyeA.upper, arc(170, 260, 250, 18, 9));            // 바깥 → 안쪽
  put(LM.eyeB.upper, arc(170, 260, 250, 18, 9).map(mirror));
  put(LM.browA.upper, arc(160, 270, 200, 8, 5));
  put(LM.browA.lower, arc(160, 270, 214, 4, 5));
  put(LM.browB.upper, arc(160, 270, 200, 8, 5).map(mirror));
  put(LM.browB.lower, arc(160, 270, 214, 4, 5).map(mirror));
  put(LM.lipsOuter, Array.from({ length: 20 }, (_, k) => ({ x: 300 - 60 * Math.cos((k * Math.PI) / 10), y: 420 - 25 * Math.sin((k * Math.PI) / 10) })));
  put([LM.faceL, LM.faceR, LM.cheekA, LM.cheekB], [{ x: 100, y: 300 }, { x: 500, y: 300 }, { x: 190, y: 340 }, { x: 410, y: 340 }]);
  put([168, 6, 197, 195, 5, 4], [260, 275, 290, 305, 320, 335].map((y) => ({ x: 300, y })));
  put([10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109], [
    { x: 300, y: 100 }, { x: 340, y: 102 }, { x: 380, y: 110 }, { x: 410, y: 125 }, { x: 430, y: 150 }, { x: 440, y: 180 },
    { x: 160, y: 180 }, { x: 170, y: 150 }, { x: 190, y: 125 }, { x: 220, y: 110 }, { x: 260, y: 102 },
  ]);
  return lm;
}

export const LMS = faceLandmarks();
export const P = (i: number): Pt => LMS[i]!;
export const eyeOf = (s: Side) => (s === "R" ? LM.eyeA : LM.eyeB);

/** 시험용 가이드 치수. 실제로는 ② 가 룩마다 정한다 — 여기 값은 POC 기본(1.2mm/27mm, 0.5mm/50mm) */
export const GUIDE = { linerThick: 0.045, lipOffset: 0.01 } as const;

/** poc/full/lib/guides.js 와 같은 모양을 내는 시험용 가이드. 진짜는 ② 의 guides.ts 가 준다 */
export const guide: GuideSource = (partId, f): PartGeometry => {
  const at = (i: number): Pt => f.lm[i]!;
  const faceW = f.unit.face;
  const ellipse = (c: Pt, rx: number, ry: number): Pt[] => Array.from({ length: 28 }, (_, i) => ({ x: c.x + rx * Math.cos((i / 28) * 2 * Math.PI), y: c.y + ry * Math.sin((i / 28) * 2 * Math.PI) }));
  const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  if (partId === "liner") {
    const wing = (s: Side): readonly [Pt, Pt] => {
      const outer = at(eyeOf(s).outer), inner = at(eyeOf(s).inner);
      const l = Math.hypot(outer.x - inner.x, outer.y - inner.y);
      const v = { x: (outer.x - inner.x) / l, y: (outer.y - inner.y) / l }, a = (30 * Math.PI) / 180;
      const d = { x: v.x * Math.cos(a), y: v.y * Math.cos(a) - Math.sin(a) }, dl = Math.hypot(d.x, d.y);
      return [outer, { x: outer.x + (d.x / dl) * 0.15 * f.unit.eye, y: outer.y + (d.y / dl) * 0.15 * f.unit.eye }];
    };
    return { liner: { wing: { R: wing("R"), L: wing("L") }, thick: GUIDE.linerThick } };
  }
  if (partId === "lip") return { lip: { offset: GUIDE.lipOffset } };
  if (partId === "shadow") {
    const region = (s: Side): Pt[] => {
      const lid = eyeOf(s).upper.map(at), browLo = (s === "R" ? LM.browA : LM.browB).lower.map(at);
      const top = lid.map((p, i) => mix(p, browLo[Math.min(browLo.length - 1, Math.round((i / (lid.length - 1)) * (browLo.length - 1)))]!, 0.55));
      return [...lid, ...top.reverse()];
    };
    return { regions: { R: region("R"), L: region("L") } };
  }
  const cheek = (s: Side, dy: number): Pt[] => ellipse({ ...mix(at(s === "R" ? LM.cheekA : LM.cheekB), at(s === "R" ? LM.faceL : LM.faceR), 0.25), y: 340 + dy }, faceW * 0.11, faceW * 0.07);
  if (partId === "cheek") return { regions: { R: cheek("R", 0), L: cheek("L", 0) } };
  if (partId === "contour") {
    // 얼굴형 규칙처럼 밴드 배열로: 쉐딩 좌·우, 하이라이트 좌·우 + 가운데(콧대) 하나. 가운데 밴드는 채점이 좌우 비교에서 빼야 한다
    const nose = ellipse({ x: (at(LM.faceL).x + at(LM.faceR).x) / 2, y: 300 }, faceW * 0.03, faceW * 0.08);
    return { contour: { shading: [cheek("R", 60), cheek("L", 60)], highlight: [cheek("R", -40), cheek("L", -40), nose] } };
  }
  return {};
};

export type Paint = (x: number, y: number) => Rgb | null;

/** 살색 바탕에 paint 가 색을 주는 픽셀만 칠한다. gain 은 전체 밝기 (조명 변화 흉내) */
export function image(paint: Paint = () => null, gain = 1): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint(x, y) ?? SKIN, i = (y * W + x) * 4;
      data[i] = c[0] * gain; data[i + 1] = c[1] * gain; data[i + 2] = c[2] * gain; data[i + 3] = 255;
    }
  }
  return { data, w: W, h: H };
}

function distToPath(x: number, y: number, path: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

export const BARE: SampleFrame = frameOf(image(), LMS);
export const geomOf = (partId: PartId): PartGeometry => guide(partId, BARE);
const bandIdx = (s: Side): number => (s === "R" ? 0 : 1);
/** 부위 영역 판정기. 쉐딩은 밴드 배열에서 좌우 하나씩 (R = 0, L = 1) */
export const inRegion = (partId: PartId, s: Side) => {
  const poly = partId === "contour" ? geomOf("contour").contour!.shading[bandIdx(s)]! : geomOf(partId).regions![s];
  return (x: number, y: number) => pointInPoly(x, y, poly);
};
export const inHighlight = (s: Side) => { const poly = geomOf("contour").contour!.highlight[bandIdx(s)]!; return (x: number, y: number) => pointInPoly(x, y, poly); };
/** 가운데(콧대) 하이라이트 밴드 */
export const inNoseHighlight = () => { const poly = geomOf("contour").contour!.highlight[2]!; return (x: number, y: number) => pointInPoly(x, y, poly); };

/** 속눈썹 선 바로 위 피부에 폭 4px 로 그린다 (선 아래는 눈알이라 못 그린다). lift 는 꼬리 끝을 위로 올리는 양(px) */
export function linerPaint(lift: Partial<Record<Side, number>> = {}, sides: readonly Side[] = ["R", "L"]): Paint {
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - 2 });
  const paths = sides.map((s) => {
    const [, end] = geomOf("liner").liner!.wing[s];
    return [...eyeOf(s).upper.map(P).reverse().map(up), up({ x: end.x, y: end.y - (lift[s] ?? 0) })];
  });
  return (x, y) => (paths.some((path) => distToPath(x, y, path) <= 2) ? INK : null);
}
/** 눈알: 속눈썹 선 아래 3~12px 띠 (홍채가 움직인 것처럼 색을 바꾸는 데 쓴다) */
export function eyeballPaint(color: Rgb, sides: readonly Side[] = ["R", "L"]): Paint {
  // 눈알은 눈 양 끝 사이에만 있다 — 끝점 둘레까지 칠하면 꼬리 밑(피부)에 걸린다
  const eyes = sides.map((s) => {
    const xs = [P(eyeOf(s).outer).x, P(eyeOf(s).inner).x];
    return { path: eyeOf(s).upper.map(P).reverse(), x0: Math.min(...xs) + 4, x1: Math.max(...xs) - 4 };
  });
  return (x, y) => (eyes.some((e) => x > e.x0 && x < e.x1 && distToPath(x, y - 7, e.path) <= 4.5) ? color : null);
}
export const browPaint: Paint = (x, y) => {
  for (const b of [LM.browA, LM.browB]) if (pointInPoly(x, y, [...b.upper.map(P), ...b.lower.map(P).reverse()])) return BROWN;
  return null;
};
export const lipPaint: Paint = (x, y) => (pointInPoly(x, y, LM.lipsOuter.map(P)) ? RED : null);
export const regionPaint = (partId: PartId, color: Rgb, sides: readonly Side[] = ["R", "L"]): Paint => {
  const tests = sides.map((s) => inRegion(partId, s));
  return (x, y) => (tests.some((t) => t(x, y)) ? color : null);
};

export const made = (paint: Paint, gain = 1): SampleFrame => frameOf(image(paint, gain), LMS);

// ---------- 자연 맨얼굴 (#169 — 맨얼굴 오채점) ----------
// 살색 판(BARE)은 속눈썹·눈썹이 없어서 "맨얼굴끼리 비교" 가 너무 쉽게 통과했다.
// 실제 맨얼굴에는 속눈썹 선(라이너 채점 띠 바로 그 자리)과 눈썹 털이 있다 — 1~2px 만 어긋나도 "새 선" 처럼 보인다.
export const LASH: Rgb = [45, 35, 35], SCLERA: Rgb = [215, 205, 200], HAIR: Rgb = [150, 115, 95];
const lids = (["R", "L"] as const).map((s) => eyeOf(s).upper.map(P));
/** 속눈썹(선 위아래 1.5px) · 눈알 · 옅은 눈썹 털(눈썹 자리 세 칸에 하나) */
export const naturalPaint: Paint = (x, y) => {
  for (const l of lids) {
    if (distToPath(x, y, l) <= 1.5) return LASH;
    if (distToPath(x, y - 7, l) <= 4.5) return SCLERA;
  }
  return (x + y) % 3 === 0 && browPaint(x, y) ? HAIR : null;
};
/** top 이 칠한 곳은 top, 아니면 under */
export const over = (top: Paint, under: Paint): Paint => (x, y) => top(x, y) ?? under(x, y);
/** 사진 전체를 (dx, dy) px 옮긴다 — 랜드마크는 그대로 = 랜드마크가 그만큼 어긋난 것과 같다 */
export const shifted = (p: Paint, dx: number, dy: number): Paint => (x, y) => p(x - dx, y - dy);
export const NATURAL: SampleFrame = frameOf(image(naturalPaint), LMS);
