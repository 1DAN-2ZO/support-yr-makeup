// 채점 조명 참조(이마)가 앞머리에 흔들리지 않게 — 평균 대신 중앙값 (docs/research/hair-skin-2026-09-29 보고서 2번)
// 이마 다각형(FOREHEAD_POLY)은 머리선 바로 아래라, 앞머리가 일부 내려오면 평균이 머리카락 쪽으로 끌려
// "조명이 바뀌었다" → 확인만(lighting) 이 된다.
import { describe, expect, it } from "vitest";
import { FOREHEAD_POLY, pointInPoly } from "@core/color";
import { frameOf, sampleForehead } from "@core/sampling";
import { scorePart } from "@core/score-part";
import { PARAMS } from "@core/score";
import { BARE, LMS, guide, image } from "./helpers/synth-face";
import type { Rgb } from "./helpers/synth-face";

const HAIR: Rgb = [28, 22, 20];
const poly = FOREHEAD_POLY.map((i) => LMS[i]!);
const ys = poly.map((p) => p.y);
const top = Math.min(...ys), bottom = Math.max(...ys);

/** 이마 다각형 위쪽 k 만큼을 머리카락으로 (앞머리) */
const bangs = (k: number) => (x: number, y: number) => (y < top + (bottom - top) * k && pointInPoly(x, y, poly) ? HAIR : null);

/** 다각형 안 픽셀 중 머리카락 비율 */
function hairFrac(k: number): number {
  let n = 0, h = 0;
  for (let y = Math.floor(top); y <= bottom; y++) for (let x = 0; x < 600; x++) {
    if (!pointInPoly(x, y, poly)) continue;
    n++;
    if (bangs(k)(x, y)) h++;
  }
  return h / n;
}

describe("채점 이마 참조 — 앞머리", () => {
  it("F1 앞머리가 이마의 절반 가까이(40% 안팎) 덮어도 이마 밝기는 맨얼굴과 거의 같다", () => {
    const k = 0.45;
    const frac = hairFrac(k);
    expect(frac).toBeGreaterThan(0.25);
    expect(frac).toBeLessThan(0.48);
    const bare = sampleForehead(BARE)!, withBangs = sampleForehead(frameOf(image(bangs(k)), LMS))!;
    expect(Math.abs(withBangs.L - bare.L)).toBeLessThan(2);
  });

  it("F2 그래서 채점도 '조명이 바뀌었다'(확인만)로 빠지지 않는다", () => {
    const { ctx } = scorePart("brow", BARE, frameOf(image(bangs(0.45)), LMS), guide);
    expect(Math.abs(ctx.lightShift ?? 99)).toBeLessThan(PARAMS.lightTol);
  });

  it("F3 진짜로 어두워지면 그대로 잡힌다 (중앙값이 조명 변화를 숨기지 않는다)", () => {
    const dim = sampleForehead(frameOf(image(() => null, 0.8), LMS))!, bare = sampleForehead(BARE)!;
    expect(bare.L - dim.L).toBeGreaterThan(5);
  });
});
