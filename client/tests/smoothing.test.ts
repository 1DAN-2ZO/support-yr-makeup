// One Euro Filter — poc/look-tryon/client/lib/smoothing.js 포팅 검증
import { describe, expect, it } from "vitest";
import { OneEuroFilter } from "@core/smoothing";

describe("OneEuroFilter", () => {
  it("첫 값은 그대로 통과", () => {
    const f = new OneEuroFilter();
    expect(f.filter(10, 0)).toBe(10);
  });

  it("떨리는 입력을 원래보다 덜 움직이게 완화", () => {
    const f = new OneEuroFilter(1.0, 0.0);
    f.filter(0, 0);
    const noisy = [10, -8, 12, -9, 11];
    let t = 16;
    const outputs = noisy.map((x) => {
      const y = f.filter(x, t);
      t += 16;
      return y;
    });
    const rawSpread = Math.max(...noisy) - Math.min(...noisy);
    const outSpread = Math.max(...outputs) - Math.min(...outputs);
    expect(outSpread).toBeLessThan(rawSpread);
  });
});
