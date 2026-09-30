// E-7 대칭 보정 방향 미리 확인 (#39 준비) — 사진(픽셀)에서 시작해 채점 → 합산까지.
// 기준(평가 표 E-7): 한쪽만 진하게 → 대칭 보정 0 미만 · 양쪽 같게 → 0 ~ -1. 실사진 20장 시험은 그대로 남는다
import { describe, expect, it } from "vitest";
import { symmetryPenalty } from "@core/review";
import { scorePart } from "@core/score-part";
import { toOutcome } from "@core/score";
import type { PartId } from "@core/types";
import { BARE, BLUSH, DEEP_BLUSH, SHADE, guide, linerPaint, made, regionPaint, type Paint } from "./helpers/synth-face";

const both = (a: Paint, b: Paint): Paint => (x, y) => a(x, y) ?? b(x, y);
const part = (partId: PartId, paint: Paint) => {
  const { result, ctx } = scorePart(partId, BARE, made(paint), guide);
  return { partId, status: "passed" as const, ...toOutcome(partId, result, ctx), score: 90 };
};

describe("E-7 대칭 보정 방향 (합성 얼굴)", () => {
  it("S1 볼터치: 양쪽 같게 → 0~-1, 한쪽만 → 0 미만, 한쪽만 더 진하게 → 0 미만", () => {
    const even = symmetryPenalty([part("cheek", regionPaint("cheek", BLUSH))]);
    expect(even).toBeLessThanOrEqual(0);
    expect(even).toBeGreaterThanOrEqual(-1);
    expect(symmetryPenalty([part("cheek", regionPaint("cheek", BLUSH, ["R"]))])).toBeLessThan(-1);
    expect(symmetryPenalty([part("cheek", both(regionPaint("cheek", DEEP_BLUSH, ["R"]), regionPaint("cheek", BLUSH, ["L"])))])).toBeLessThan(0);
  });

  it("S2 섀도우: 양쪽 같게 → 0~-1, 한쪽만 → 0 미만", () => {
    const even = symmetryPenalty([part("shadow", regionPaint("shadow", SHADE))]);
    expect(even).toBeLessThanOrEqual(0);
    expect(even).toBeGreaterThanOrEqual(-1);
    expect(symmetryPenalty([part("shadow", regionPaint("shadow", SHADE, ["L"]))])).toBeLessThan(-1);
  });

  it("S3 라이너: 양쪽 같게 → 0~-1, 한쪽 꼬리만 위로 → 0 미만", () => {
    const even = symmetryPenalty([part("liner", linerPaint())]);
    expect(even).toBeLessThanOrEqual(0);
    expect(even).toBeGreaterThanOrEqual(-1);
    expect(symmetryPenalty([part("liner", linerPaint({ R: 6 }))])).toBeLessThan(0);
  });
});
