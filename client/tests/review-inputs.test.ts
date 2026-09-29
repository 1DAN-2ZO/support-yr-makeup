// #35 — 합산 보정 두 개가 실제로 켜지게 채점이 값을 넘긴다
//  - 대칭: 눈썹 metrics.lrDiff (그린 눈썹의 좌우 높이 차, 눈 폭 비율 — 라이너 꼬리 높이 차와 같은 척도)
//  - 조화: 볼·입술 metrics.colorAb (지금 사진의 화장 색 a*·b*)
// 전에는 둘 다 안 넘겨서 눈썹은 대칭 보정에서 빠지고, 조화 보정은 언제나 0 이었다 (tech-review-screen6 §3-①)
import { describe, expect, it } from "vitest";
import { pointInPoly, rgbToLab } from "@core/color";
import { LM } from "@core/landmarks";
import { frameOf } from "@core/sampling";
import { SUMMARY_TEMPLATE } from "@core/looks";
import { DEFAULT_TEMPLATE, computeSummary } from "@core/review";
import { scorePart } from "@core/score-part";
import { toOutcome } from "@core/score";
import type { PartId } from "@core/types";
import { BARE, BLUSH, BROWN, LMS, RED, browPaint, guide, image, lipPaint, made, regionPaint, shifted, type Paint } from "./helpers/synth-face";

const score = (partId: PartId, paint: Paint) => {
  const { result, ctx } = scorePart(partId, BARE, made(paint), guide);
  return { result, outcome: toOutcome(partId, result, ctx) };
};
/** 이미지 왼쪽(R) 눈썹만 dy px 옮겨 그린다 */
const browLift = (dy: number): Paint => (x, y) => (x < 300 ? shifted(browPaint, 0, dy)(x, y) : browPaint(x, y));

describe("눈썹 lrDiff", () => {
  it("R1 양쪽 같게 그리면 좌우 높이 차가 거의 0", () => {
    const m = score("brow", browPaint).result.metrics;
    expect(typeof m.lrDiff).toBe("number");
    expect(Math.abs(m.lrDiff!)).toBeLessThan(0.01);
  });

  it("R2 오른쪽(이미지 왼쪽)만 위로 그리면 + 로, 많이 올릴수록 크게", () => {
    const up3 = score("brow", browLift(-3)).result.metrics.lrDiff!, up6 = score("brow", browLift(-6)).result.metrics.lrDiff!;
    expect(up3).toBeGreaterThan(0.01);
    expect(up6).toBeGreaterThan(up3);
    expect(score("brow", browLift(4)).result.metrics.lrDiff!).toBeLessThan(-0.01);
  });

  it("R3 원래 눈썹 두께가 좌우로 달라도, 양쪽을 똑같이 채우면 높이 차 0 — 두께를 높이로 읽지 않는다 (#174 리뷰)", () => {
    // 왼쪽(이미지 오른쪽, browB) 눈썹 윗선만 5px 올린 얼굴 — 왼쪽 눈썹이 더 두껍다
    const lm = LMS.map((p, i) => (LM.browB.upper.includes(i as never) ? { ...p, y: p.y - 5 } : p));
    const fill: Paint = (x, y) => [LM.browA, LM.browB].some((br) => pointInPoly(x, y, [...br.upper, ...[...br.lower].reverse()].map((i) => lm[i]!))) ? BROWN : null;
    const { result } = scorePart("brow", frameOf(image(), lm), frameOf(image(fill), lm), guide);
    expect(result.present).toBe(true);
    expect(Math.abs(result.metrics.lrDiff!)).toBeLessThan(0.01);
  });
});

describe("볼·입술 colorAb", () => {
  const ab = (rgb: readonly [number, number, number]) => { const l = rgbToLab(rgb[0], rgb[1], rgb[2]); return { a: l.a, b: l.b }; };

  it("C1 볼터치 색 a*·b* 가 그린 색과 같다", () => {
    const c = score("cheek", regionPaint("cheek", BLUSH)).result.metrics.colorAb!;
    expect(c.a).toBeCloseTo(ab(BLUSH).a, 0);
    expect(c.b).toBeCloseTo(ab(BLUSH).b, 0);
  });

  it("C2 입술 색 a*·b* 가 그린 색과 같다", () => {
    const c = score("lip", lipPaint).result.metrics.colorAb!;
    expect(c.a).toBeCloseTo(ab(RED).a, 0);
    expect(c.b).toBeCloseTo(ab(RED).b, 0);
  });
});

describe("합산에서 실제로 켜진다", () => {
  const part = (partId: PartId, paint: Paint) => ({ partId, status: "passed" as const, ...score(partId, paint).outcome, score: 90 });

  it("H1 색 값은 넘어가서, 허용 범위가 있으면 조화 보정이 계산된다", () => {
    const s = computeSummary([part("cheek", regionPaint("cheek", BLUSH)), part("lip", lipPaint)], DEFAULT_TEMPLATE);
    expect(s.harmonyApplied).toBe(true);
  });

  it("H1b 앱 설정(rules/looks.json)은 허용 범위를 비워 둔다 — 조화 보정 꺼짐 (#174 리뷰)", () => {
    // 볼 영역 평균은 대부분 피부색이라 입술색과 늘 멀다 — 잘 어울리게 그린 화장도 -5(최대)였다.
    // 실제 사진으로 기준(볼·입술 각자 쌩얼 대비 변화 등)을 잡기 전까지는 켜지 않는다 (#35 "화장 확정 전 null")
    const s = computeSummary([part("cheek", regionPaint("cheek", BLUSH)), part("lip", lipPaint)], SUMMARY_TEMPLATE);
    expect(s.harmonyApplied).toBe(false);
    expect(s.harmonyPenalty).toBe(0);
  });

  it("H2 눈썹을 한쪽만 올려 그리면 대칭 보정이 음수", () => {
    expect(computeSummary([part("brow", browPaint)]).symmetryPenalty).toBeCloseTo(0, 0);
    expect(computeSummary([part("brow", browLift(-6))]).symmetryPenalty).toBeLessThan(0);
  });
});
