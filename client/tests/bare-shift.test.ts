// 맨얼굴 오채점 (#169 2번, 2026-09-28 ② PC 웹캠): 라이너를 안 그렸는데 막대가 가득, 눈썹 56점.
// 원인: 채점은 "쌩얼 대비 색이 바뀐 곳 = 그린 곳". 맨얼굴에도 속눈썹·눈썹 털이 있어서 1~2px 어긋나면 새 선처럼 보인다.
// 웹캠 랜드마크는 원래 1~2px 흔들리고, 게이트가 허용하는 각도 차(yaw 8°)만으로도 그만큼 어긋난다.
import { describe, expect, it } from "vitest";
import { frameOf } from "@core/sampling";
import { scorePart } from "@core/score-part";
import { toOutcome } from "@core/score";
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
