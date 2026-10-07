// 룩 옮기기 — 부위 가이드 그리기 (screens/look-guide-draw.ts) 가운데 캔버스 없이 볼 수 있는 것
import { describe, expect, it } from "vitest";
import { soften } from "../src/screens/look-guide-draw";
import type { Pt } from "@core/types";

const circle = (n: number, r: number): Pt[] => Array.from({ length: n }, (_, k) => ({ x: 100 + r * Math.cos((2 * Math.PI * k) / n), y: 100 + r * Math.sin((2 * Math.PI * k) / n) }));
const radius = (p: Pt): number => Math.hypot(p.x - 100, p.y - 100);

describe("soften", () => {
  it("둥근 테두리는 거의 그대로다 (같은 간격의 n 점, 반지름이 2% 안쪽으로만 준다)", () => {
    const out = soften(circle(40, 50));
    expect(out).toHaveLength(72);
    for (const p of out) {
      expect(radius(p)).toBeGreaterThan(49);
      expect(radius(p)).toBeLessThanOrEqual(50.001);
    }
  });

  it("작은 턱은 낮아진다 (점 하나가 8 만큼 튀어나온 것이 3분의 2 아래로)", () => {
    const poly = circle(60, 50);
    poly[10] = { x: 100 + 58 * Math.cos((2 * Math.PI * 10) / 60), y: 100 + 58 * Math.sin((2 * Math.PI * 10) / 60) };
    const peak = Math.max(...soften(poly).map(radius));
    expect(peak).toBeLessThan(50 + (8 * 2) / 3);
  });

  it("점이 몇 개 없는 테두리는 건드리지 않는다", () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(soften(tri)).toEqual(tri);
  });
});
