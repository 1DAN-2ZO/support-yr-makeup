// 맨얼굴 오채점 (#169 2번, 2026-09-28 ② PC 웹캠): 라이너를 안 그렸는데 막대가 가득, 눈썹 56점.
// 원인: 채점은 "쌩얼 대비 색이 바뀐 곳 = 그린 곳". 맨얼굴에도 속눈썹·눈썹 털이 있어서 1~2px 어긋나면 새 선처럼 보인다.
// 웹캠 랜드마크는 원래 1~2px 흔들리고, 게이트가 허용하는 각도 차(yaw 8°)만으로도 그만큼 어긋난다.
import { describe, expect, it } from "vitest";
import { frameOf } from "@core/sampling";
import { scorePart } from "@core/score-part";
import { toOutcome } from "@core/score";
import type { RgbaImage } from "@core/color";
import type { PartId } from "@core/types";
import { LMS, NATURAL, browPaint, guide, image, linerPaint, naturalPaint, over, shifted, type Paint } from "./helpers/synth-face";

const run = (partId: PartId, paint: Paint) => {
  const { result, ctx } = scorePart(partId, NATURAL, frameOf(image(paint), LMS), guide);
  return { result, outcome: toOutcome(partId, result, ctx) };
};
const SHIFTS: [number, number][] = [[0, 1], [0, -1], [1, 0], [2, 0], [0, 2], [-2, 1]];

describe("맨얼굴끼리 — 조금 어긋나도 점수를 지어내지 않는다", () => {
  for (const [dx, dy] of SHIFTS) {
    it(`B1 어긋남 (${dx}, ${dy})px → 라이너·눈썹 모두 확인만`, () => {
      for (const part of ["liner", "brow"] as const) {
        const { outcome } = run(part, shifted(naturalPaint, dx, dy));
        expect(outcome.decision, part).toBe("check_only");
      }
    });
  }
});

describe("그린 화장은 조금 어긋나도 그대로 잡는다", () => {
  for (const [dx, dy] of [[0, 0], [0, 1], [0, -1], [1, 0]] as [number, number][]) {
    it(`B2 라이너 (${dx}, ${dy})px → 90점 이상, 눈썹은 확인만`, () => {
      const paint = shifted(over(linerPaint(), naturalPaint), dx, dy);
      const liner = run("liner", paint);
      expect(liner.outcome.decision).toBe("scored");
      expect(liner.outcome.score).toBeGreaterThanOrEqual(90);
      expect(run("brow", paint).outcome.decision).toBe("check_only");
    });

    it(`B3 눈썹 (${dx}, ${dy})px → 90점 이상, 라이너는 확인만`, () => {
      const paint = shifted(over(browPaint, naturalPaint), dx, dy);
      const brow = run("brow", paint);
      expect(brow.outcome.decision).toBe("scored");
      expect(brow.outcome.score).toBeGreaterThanOrEqual(90);
      expect(run("liner", paint).outcome.decision).toBe("check_only");
    });
  }
});

// 카메라 잡음 (#174 리뷰): 한 픽셀씩 읽으면 두 사진의 픽셀마다 잡음이 따로 붙어 맨얼굴에 점수가 났다 (σ6 에서 15/15).
// 눈 폭 1/30 창(합성 얼굴 3×3) 평균으로 읽는다 — sampling.ts SAMPLE
describe("카메라 잡음", () => {
  let seed = 5;
  const g = (): number => { let s = 0; for (let i = 0; i < 6; i++) s += (seed = (seed * 16807) % 2147483647) / 2147483647; return (s - 3) / Math.sqrt(0.5); };
  const noisy = (im: RgbaImage, sd: number): RgbaImage => {
    const d = new Uint8ClampedArray(im.data);
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = d[i + c]! + g() * sd;
    return { ...im, data: d };
  };
  const bareIm = image(naturalPaint), linerIm = image(over(linerPaint(), naturalPaint));

  for (const sd of [6, 10]) {
    it(`B4 잡음 σ${sd} — 맨얼굴은 라이너·눈썹·입술 모두 확인만, 그린 라이너는 90점 이상`, () => {
      const base = frameOf(noisy(bareIm, sd), LMS);
      for (const part of ["liner", "brow", "lip"] as const) {
        const { result, ctx } = scorePart(part, base, frameOf(noisy(bareIm, sd), LMS), guide);
        expect(toOutcome(part, result, ctx).decision, part).toBe("check_only");
      }
      const { result, ctx } = scorePart("liner", base, frameOf(noisy(linerIm, sd), LMS), guide);
      expect(toOutcome("liner", result, ctx).score).toBeGreaterThanOrEqual(90);
    });
  }

  it("B5 잡음 속 그린 눈썹 — 정렬이 잡음에 헛돌지 않는다 (확실히 나아질 때만 옮김, 20회 모두 98점 이상)", () => {
    const browIm = image(over(browPaint, naturalPaint));
    for (let t = 0; t < 20; t++) {
      seed = 77 + t * 131 + 6;
      const base = frameOf(noisy(bareIm, 6), LMS);
      expect(scorePart("brow", base, frameOf(noisy(browIm, 6), LMS), guide).result.score, `회차 ${t}`).toBeGreaterThanOrEqual(98);
    }
  });
});
