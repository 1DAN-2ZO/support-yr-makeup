// 셰이더에 넘길 머리카락 마스크 (screens/makeup-gl hairBytes) — 0~1 확률 → 0~255 한 채널. WebGL 자체는 브라우저에서만 돈다
import { describe, expect, it } from "vitest";
import { hairBytes } from "@screens/makeup-gl";

describe("머리카락 마스크 → 셰이더", () => {
  it("G1 0~1 을 0~255 로, 범위 밖은 잘라서", () => {
    const b = hairBytes({ w: 2, h: 2, data: [0, 0.5, 1, 2] });
    expect(Array.from(b)).toEqual([0, 128, 255, 255]);
  });
  it("G2 음수·NaN 은 0 (머리카락 아님)", () => {
    expect(Array.from(hairBytes({ w: 2, h: 1, data: [-1, Number.NaN] }))).toEqual([0, 0]);
  });
});
