// VLM 에 보낼 얼굴 사진 — 얼굴 가운데 정사각형 (실험 eval/vlm/run.py face_image 와 같은 자르기)
import { describe, expect, it } from "vitest";
import { faceSquare, faceSquareIn } from "@screens/vlm-image";
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

  it("I2 저장 사진이 줄어 있으면(긴 변 1024) 얼굴 점도 그 크기로 맞춰 자른다 (#179 리뷰)", () => {
    const from = { w: 1080, h: 1920 }, to = { w: 576, h: 1024 };
    const a = faceSquare(LMS), b = faceSquareIn(LMS, from, to);
    const k = to.w / from.w;
    expect(b.side).toBeCloseTo(a.side * k, 5);
    expect(b.x).toBeCloseTo(a.x * k, 5);
    expect(b.y).toBeCloseTo(a.y * (to.h / from.h), 5);
  });
});
