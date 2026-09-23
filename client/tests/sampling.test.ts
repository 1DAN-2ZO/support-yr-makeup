// 샘플링 + 채점 연결 검증 (이슈 #32, 3-1) — 합성 얼굴 사진에 화장을 "그려서" 사진 → 점수까지 한 번에 본다.
// score.test.ts 는 Lab 값을 직접 만들어 넣는다. 여기는 픽셀에서 시작한다. 합성 얼굴은 helpers/synth-face.ts.
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { LINER_OFFS, LIP_OFFS, frameOf, sampleBrow, sampleLiner, sampleLip } from "@core/sampling";
import type { SampleFrame } from "@core/sampling";
import { alignedFrame, scorePart } from "@core/score-part";
import { decide, toOutcome } from "@core/score";
import type { PartId } from "@core/types";
import { BARE, BLUSH, DEEP_BLUSH, GUIDE, HIGHLIGHT, LMS, SHADE, W, browPaint, geomOf, guide, image, inHighlight, inNoseHighlight, inRegion, linerPaint, lipPaint, made, regionPaint } from "./helpers/synth-face";
import type { Paint } from "./helpers/synth-face";

const run = (partId: PartId, cur: SampleFrame, base: SampleFrame = BARE) => {
  const { result, ctx } = scorePart(partId, base, cur, guide);
  return { result, ctx, outcome: toOutcome(partId, result, ctx) };
};

describe("샘플 모양", () => {
  it("M1 score.ts 가 받는 모양 그대로: 라이너 80×25, 눈썹 24×9×2, 입술 60×25", () => {
    const g = geomOf("liner").liner!;
    const liner = sampleLiner(BARE, "R", g.wing.R, g.thick);
    expect(liner.lab).toHaveLength(80);
    expect(liner.lab[0]).toHaveLength(LINER_OFFS.length);
    expect(liner.meta.isWing.filter(Boolean).length).toBeGreaterThan(0);
    expect(liner.meta.wingLen).toBeCloseTo(0.15, 6);
    expect(liner.meta.thick).toBe(GUIDE.linerThick);   // 치수는 가이드가 준 값 그대로 샘플에 실린다
    const brow = sampleBrow(BARE);
    expect(brow.lab).toHaveLength(24 * 9 * 2);
    expect(brow.meta.side.filter((s) => s === "R")).toHaveLength(24 * 9);
    const lip = sampleLip(BARE, GUIDE.lipOffset);
    expect(lip.lab).toHaveLength(60);
    expect(lip.meta.offset).toBe(GUIDE.lipOffset);
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
    expect(result.metrics.hiIndex).toEqual({ left: 0, right: 0 });   // 하이라이트는 안 발랐으니 좌우 다 0
  });

  it("N9 하이라이트도 좌우를 본다: 오른쪽만 밝게 → CONTOUR_HI_R, 점수는 여전히 없음", () => {
    const hiR = inHighlight("R"), hiL = inHighlight("L");
    const { result, outcome } = run("contour", made((x, y) => (hiR(x, y) ? HIGHLIGHT : null)));
    expect(result.score).toBeNull();
    expect(result.codes).toEqual(["CONTOUR_HI_R"]);
    expect(result.metrics.hiIndex).toMatchObject({ left: 0 });
    expect((result.metrics.hiIndex as { right: number }).right).toBeGreaterThanOrEqual(10);
    expect(outcome).toMatchObject({ decision: "check_only", checkReason: "contour", diagnosis: "확인하고 넘어가세요. 오른쪽 하이라이트가 조금 밝아요" });
    // 양쪽 다 바르면 좌우 차가 없어 코드 없음
    const both = run("contour", made((x, y) => (hiR(x, y) || hiL(x, y) ? HIGHLIGHT : null))).result;
    expect(both.codes).toEqual([]);
  });

  it("N10 가운데 밴드(콧대 하이라이트)는 좌우 비교에 안 들어간다; 하이라이트 밴드가 없으면 비교를 건너뛴다", () => {
    const nose = inNoseHighlight();
    const r = run("contour", made((x, y) => (nose(x, y) ? HIGHLIGHT : null))).result;
    expect(r.codes).toEqual([]);   // POC 는 가운데를 L 로 몰아 "왼쪽 하이라이트" 를 냈다
    expect(r.metrics.hiIndex).toEqual({ left: 0, right: 0 });
    const noHi = scorePart("contour", BARE, made(regionPaint("contour", SHADE, ["L"])), (partId, f) => {
      const g = guide(partId, f);
      return partId === "contour" && g.contour ? { contour: { shading: g.contour.shading, highlight: [] } } : g;
    }).result;
    expect(noHi.codes).toEqual(["CONTOUR_LR_L"]);
    expect(noHi.metrics.hiIndex).toBeUndefined();
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

  it("G4 가이드가 모양·치수를 안 주면 조용히 넘어가지 않고 던진다", () => {
    expect(() => scorePart("liner", BARE, BARE, () => ({}))).toThrow(/꼬리 선·두께/);
    expect(() => scorePart("lip", BARE, BARE, () => ({}))).toThrow(/오프셋/);
    expect(() => scorePart("cheek", BARE, BARE, () => ({}))).toThrow(/cheek 영역/);
    expect(() => scorePart("contour", BARE, BARE, () => ({}))).toThrow(/쉐딩 밴드/);
  });

  it("G5 치수는 가이드를 따라간다: ② 가 굵게 그린 룩이면 같은 선도 '두꺼워요' 가 아니다", () => {
    // 같은 사진, 같은 그림. 가이드 두께만 룩마다 다르게 준다
    const withThick = (thick: number) => scorePart("liner", BARE, made(linerPaint(), 1), (partId, f) => {
      const g = guide(partId, f);
      return partId === "liner" && g.liner ? { liner: { ...g.liner, thick } } : g;
    }).result;
    const thin = withThick(0.02), same = withThick(GUIDE.linerThick), thick = withThick(0.08);
    expect(same.codes).toEqual([]);
    expect(thin.codes).toContain("LINER_THICK");    // 얇은 룩 기준에선 4px 선이 두껍다
    expect(thick.codes).toContain("LINER_THIN");    // 굵은 룩 기준에선 옅다
    expect(thin.metrics.thickness).toBe(same.metrics.thickness);   // 잰 두께는 같고, 기준만 다르다
  });
});
