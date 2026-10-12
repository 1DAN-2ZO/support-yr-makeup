// @vitest-environment node
import { describe, expect, it } from "vitest";
import { middleShot } from "@core/middle-shot";

describe("묶음의 가운데 장 (middleShot)", () => {
  it("M1 다섯 장이면 셋째 장", () => {
    expect(middleShot(["1", "2", "3", "4", "5"])).toBe("3");
  });

  it("M2 한 장이면 그 장", () => {
    expect(middleShot(["1"])).toBe("1");
  });

  it("M3 짝수면 가운데 둘 중 뒤의 장 — 셔터를 누른 순간에서 더 먼 쪽", () => {
    expect(middleShot(["1", "2", "3", "4"])).toBe("3");
    expect(middleShot(["1", "2"])).toBe("2");
  });

  it("M4 비었으면 없음", () => {
    expect(middleShot([])).toBeUndefined();
  });
});
