// 샘플링 + 채점 연결 검증 (이슈 #32, 3-1) — 합성 얼굴 사진에 화장을 "그려서" 사진 → 점수까지 한 번에 본다.
// score.test.ts 는 Lab 값을 직접 만들어 넣는다. 여기는 픽셀에서 시작한다.
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { pointInPoly } from "@core/color";
import { LM } from "@core/landmarks";
import { LINER_OFFS, LIP_OFFS, frameOf, sampleBrow, sampleLiner, sampleLip } from "@core/sampling";
import type { SampleFrame } from "@core/sampling";
import { alignedFrame, scorePart } from "@core/score-part";
import type { GuideSource, PartGeometry } from "@core/score-part";
import { decide, toOutcome } from "@core/score";
import type { Side } from "@core/score";
import type { PartId, Pt } from "@core/types";

// ---------- 합성 얼굴 ----------

const W = 600, H = 600;
type Rgb = readonly [number, number, number];
const SKIN: Rgb = [224, 172, 140], INK: Rgb = [30, 25, 28], BROWN: Rgb = [80, 55, 45], RED: Rgb = [180, 60, 80], BLUSH: Rgb = [226, 158, 140], DEEP_BLUSH: Rgb = [215, 95, 105], SHADE: Rgb = [170, 120, 110];

const mirror = (p: Pt): Pt => ({ x: W - p.x, y: p.y });
const arc = (x0: number, x1: number, y: number, rise: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y - rise * Math.sin((Math.PI * i) / (n - 1)) }));

/** 478점. 채점이 쓰는 점만 제자리에 두고 나머지는 얼굴 가운데 */
function faceLandmarks(): Pt[] {
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

const LMS = faceLandmarks();
const P = (i: number): Pt => LMS[i]!;
const eyeOf = (s: Side) => (s === "R" ? LM.eyeA : LM.eyeB);

/** poc/full/lib/guides.js 와 같은 모양을 내는 시험용 가이드. 진짜는 ② 의 guides.ts 가 준다 */
const guide: GuideSource = (partId, f): PartGeometry => {
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
    return { linerWing: { R: wing("R"), L: wing("L") } };
  }
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
  if (partId === "contour") return { regions: { R: cheek("R", 60), L: cheek("L", 60) } };
  return {};
};

type Paint = (x: number, y: number) => Rgb | null;

function image(paint: Paint = () => null, gain = 1): RgbaImage {
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

const BARE = frameOf(image(), LMS);
const geomOf = (partId: PartId) => guide(partId, BARE);
const inRegion = (partId: PartId, s: Side) => { const poly = geomOf(partId).regions![s]; return (x: number, y: number) => pointInPoly(x, y, poly); };

/** 속눈썹 선 + 꼬리를 폭 4px 로 그린다. lift 는 꼬리 끝을 위로 올리는 양(px) */
function linerPaint(lift: Partial<Record<Side, number>> = {}, sides: readonly Side[] = ["R", "L"]): Paint {
  const paths = sides.map((s) => {
    const [, end] = geomOf("liner").linerWing![s];
    return [...eyeOf(s).upper.map(P).reverse(), { x: end.x, y: end.y - (lift[s] ?? 0) }];
  });
  return (x, y) => (paths.some((path) => distToPath(x, y, path) <= 2) ? INK : null);
}
const browPaint: Paint = (x, y) => {
  for (const b of [LM.browA, LM.browB]) if (pointInPoly(x, y, [...b.upper.map(P), ...b.lower.map(P).reverse()])) return BROWN;
  return null;
};
const lipPaint: Paint = (x, y) => (pointInPoly(x, y, LM.lipsOuter.map(P)) ? RED : null);
const regionPaint = (partId: PartId, color: Rgb, sides: readonly Side[] = ["R", "L"]): Paint => {
  const tests = sides.map((s) => inRegion(partId, s));
  return (x, y) => (tests.some((t) => t(x, y)) ? color : null);
};

const run = (partId: PartId, cur: SampleFrame, base: SampleFrame = BARE) => {
  const { result, ctx } = scorePart(partId, base, cur, guide);
  return { result, ctx, outcome: toOutcome(partId, result, ctx) };
};
const made = (paint: Paint, gain = 1): SampleFrame => frameOf(image(paint, gain), LMS);

// ---------- 검증 ----------

describe("샘플 모양", () => {
  it("M1 score.ts 가 받는 모양 그대로: 라이너 80×25, 눈썹 24×9×2, 입술 60×25", () => {
    const liner = sampleLiner(BARE, "R", geomOf("liner").linerWing!.R);
    expect(liner.lab).toHaveLength(80);
    expect(liner.lab[0]).toHaveLength(LINER_OFFS.length);
    expect(liner.meta.isWing.filter(Boolean).length).toBeGreaterThan(0);
    expect(liner.meta.wingLen).toBeCloseTo(0.15, 6);
    const brow = sampleBrow(BARE);
    expect(brow.lab).toHaveLength(24 * 9 * 2);
    expect(brow.meta.side.filter((s) => s === "R")).toHaveLength(24 * 9);
    const lip = sampleLip(BARE);
    expect(lip.lab).toHaveLength(60);
    expect(lip.lab[0]).toHaveLength(LIP_OFFS.length);
    expect(new Set(lip.meta.half)).toEqual(new Set(["upper", "lower"]));
  });

  it("M2 오프셋은 0 을 중심으로 대칭이고 간격이 채점기 기본값과 같다", () => {
    expect(LINER_OFFS[12]).toBe(0);
    expect(LINER_OFFS[1]! - LINER_OFFS[0]!).toBeCloseTo(0.0092, 4);
    expect(LIP_OFFS[0]).toBe(-0.06);
    expect(LIP_OFFS[24]).toBe(0.06);
  });
});

describe("사진 → 점수", () => {
  it("N1 맨얼굴 그대로 → 어느 부위도 점수를 지어내지 않는다 (확인만)", () => {
    for (const partId of ["brow", "liner", "shadow", "lip", "cheek"] as const) {
      const { result, outcome } = run(partId, BARE);
      expect(result.present, partId).toBe(false);
      expect(outcome, partId).toMatchObject({ decision: "check_only", score: null, checkReason: "faint" });
    }
    expect(run("contour", BARE).outcome).toMatchObject({ decision: "check_only", checkReason: "contour" });
  });

  it("N2 가이드대로 그린 라이너 → 코드 없음, 높은 점수", () => {
    const { result, outcome } = run("liner", made(linerPaint()));
    expect(result.codes).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(outcome).toMatchObject({ decision: "scored", diagnosis: "잘 됐어요" });
  });

  it("N3 오른쪽 꼬리만 위로 올려 그림 → LINER_WING_HIGH_R 과 좌우 차", () => {
    const { result } = run("liner", made(linerPaint({ R: 8 })));
    expect(result.codes).toContain("LINER_WING_HIGH_R");
    expect(result.codes).not.toContain("LINER_WING_HIGH_L");
    expect(result.codes).toContain("LINER_LR_DIFF");
  });

  it("N4 왼쪽 눈은 안 그림 → LINER_GAP_L", () => {
    expect(run("liner", made(linerPaint({}, ["R"]))).result.codes).toContain("LINER_GAP_L");
  });

  it("N5 눈썹·입술을 테두리 안에 채움 → 높은 점수, 밖으로 번진 코드 없음", () => {
    const brow = run("brow", made(browPaint)).result;
    expect(brow.score).toBeGreaterThanOrEqual(90);
    expect(brow.codes).toEqual([]);
    const lip = run("lip", made(lipPaint)).result;
    expect(lip.score).toBeGreaterThanOrEqual(85);
    expect(lip.codes).toEqual([]);
  });

  it("N6 볼터치: 적당하면 밴드 안, 너무 진하면 TONE_OVER, 한쪽만 하면 그쪽이 진하다고", () => {
    const ok = run("cheek", made(regionPaint("cheek", BLUSH))).result;
    expect(ok.present).toBe(true);
    expect(ok.codes).toEqual([]);
    expect(ok.score).toBe(100);
    expect(Math.abs(ok.lrIndex!.left - ok.lrIndex!.right)).toBeLessThan(2);
    expect(run("cheek", made(regionPaint("cheek", DEEP_BLUSH))).result.codes).toContain("TONE_OVER");
    expect(run("cheek", made(regionPaint("cheek", BLUSH, ["R"]))).result.codes).toContain("CHEEK_LR_DIFF_R");
  });

  it("N7 섀도우: 눈꼬리 쪽이 진하면 통과, 안쪽이 진하면 SHADOW_DIR", () => {
    const R = inRegion("shadow", "R"), L = inRegion("shadow", "L");
    const graded = (outerDark: boolean): Paint => (x, y) => {
      const side = R(x, y) ? "R" : L(x, y) ? "L" : null;
      if (!side) return null;
      const mid = side === "R" ? 215 : W - 215, isOuter = side === "R" ? x < mid : x > mid;
      return isOuter === outerDark ? SHADE : BLUSH;
    };
    expect(run("shadow", made(graded(true))).result.codes).not.toContain("SHADOW_DIR");
    expect(run("shadow", made(graded(false))).result.codes).toContain("SHADOW_DIR");
  });

  it("N8 쉐딩·하이라이트: 그려도 점수 없이 확인만, 한쪽만 진하면 방향을 알려 준다", () => {
    const { result, outcome } = run("contour", made(regionPaint("contour", SHADE, ["L"])));
    expect(result.score).toBeNull();
    expect(result.codes).toEqual(["CONTOUR_LR_L"]);
    expect(outcome.diagnosis).toBe("확인하고 넘어가세요. 왼쪽이 조금 진해요");
  });
});

describe("조명·정렬", () => {
  it("G1 조금 어두워진 사진 → 이마로 보정해서 같은 판정", () => {
    const { result, ctx } = run("liner", made(linerPaint(), 0.93));
    expect(ctx.lightShift).toBeLessThan(0);
    expect(result.codes).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(run("lip", made(() => null, 0.93)).result.present).toBe(false);   // 어두워진 것을 화장으로 보지 않는다
  });

  it("G2 많이 어두워진 사진 → 점수 대신 확인만(조명)", () => {
    const { result, ctx } = run("liner", made(linerPaint(), 0.6));
    expect(decide("liner", result, ctx)).toMatchObject({ status: "check_only", reason: "lighting" });
  });

  it("G3 얼굴이 옮겨 가고 화장이 입술 랜드마크를 밀어도, 기준에 맞춰 뽑으면 같은 결과", () => {
    const dx = 14, dy = -9;
    const moved = image((x, y) => lipPaint(x - dx, y - dy));
    const detected = LMS.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    for (const i of LM.lipsOuter) detected[i] = { ...detected[i]!, y: detected[i]!.y + 4 };   // 화장 편향
    const { frame, fit, biasPx } = alignedFrame(BARE, moved, detected);
    expect(fit.residual).toBeLessThan(1e-6);
    expect(biasPx).toBeGreaterThan(1);
    const aligned = scorePart("lip", BARE, frame, guide, { alignResidual: fit.residual }).result;
    expect(aligned.score).toBe(run("lip", made(lipPaint)).result.score);
    expect(aligned.metrics.alignResidual).toBeLessThan(1e-6);
    // 재검출 랜드마크를 그대로 쓰면 아래로 밀린 만큼 다르게 나온다
    expect(scorePart("lip", BARE, frameOf(moved, detected), guide).result.score).not.toBe(aligned.score);
  });

  it("G4 가이드가 모양을 안 주면 조용히 넘어가지 않고 던진다", () => {
    expect(() => scorePart("liner", BARE, BARE, () => ({}))).toThrow(/꼬리 선/);
    expect(() => scorePart("cheek", BARE, BARE, () => ({}))).toThrow(/cheek 영역/);
  });
});
