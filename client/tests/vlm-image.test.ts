// VLM 에 보낼 얼굴 사진 — 얼굴 가운데 정사각형 (실험 eval/vlm/run.py face_image 와 같은 자르기)
import { describe, expect, it } from "vitest";
import { faceSquare } from "@screens/vlm-image";
import { LMS } from "./helpers/synth-face";

describe("faceSquare", () => {
  it("I1 얼굴 점을 다 담는 정사각형, 한 변 = 긴 쪽 × 1.35, 가운데 = 얼굴 가운데", () => {
    const xs = LMS.map((p) => p.x), ys = LMS.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const b = faceSquare(LMS);
    expect(b.side).toBeCloseTo(Math.max(w, h) * 1.35, 5);
    expect(b.x + b.side / 2).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 5);
    expect(b.y + b.side / 2).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 5);
    for (const p of LMS) {
      expect(p.x).toBeGreaterThanOrEqual(b.x);
      expect(p.y).toBeLessThanOrEqual(b.y + b.side);
    }
  });
});
