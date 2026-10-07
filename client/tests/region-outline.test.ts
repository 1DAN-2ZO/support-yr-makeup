import { describe, expect, it } from "vitest";
import { maskOutlines } from "../src/core/region-outline";
import type { Pt } from "../src/core/types";

const W = 160, H = 120;
function maskOf(inside: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) m[y * W + x] = 1;
  return m;
}
const area = (p: readonly Pt[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a.x * b.y - b.x * a.y; }, 0)) / 2;
const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

describe("화장 영역 테두리 — 마스크 바깥 테두리를 선으로", () => {
  it("R1 원 하나 → 테두리 하나, 원 둘레를 따라간다", () => {
    const out = maskOutlines(maskOf(disc(60, 50, 20)), W, H);
    expect(out).toHaveLength(1);
    for (const p of out[0]!) expect(Math.abs(Math.hypot(p.x - 60, p.y - 50) - 20), `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).toBeLessThan(1.5);
    expect(area(out[0]!) / (Math.PI * 400)).toBeGreaterThan(0.9);
  });

  it("R2 떨어진 덩어리 둘 → 테두리 둘, 큰 것 먼저 (작은 것이 위에 있어도)", () => {
    const small = disc(130, 25, 8), big = disc(50, 75, 18);
    const out = maskOutlines(maskOf((x, y) => small(x, y) || big(x, y)), W, H);
    expect(out).toHaveLength(2);
    expect(area(out[0]!)).toBeGreaterThan(area(out[1]!));
    expect(Math.hypot(out[0]![0]!.x - 50, out[0]![0]!.y - 75)).toBeLessThan(20);
  });

  it("R3 아주 작은 점(잡음)은 버린다 — 조각 메우기 없이도", () => {
    const big = disc(50, 60, 18);
    const out = maskOutlines(maskOf((x, y) => big(x, y) || (x === 120 && y === 30) || (x >= 140 && x <= 141 && y >= 90 && y <= 91)), W, H, { minArea: 20, close: 0 });
    expect(out).toHaveLength(1);
  });

  it("R4 가까이 조각난 영역(사이 2px)은 하나로 메운다 — 실사진 블러셔 · 섀도가 조각났다", () => {
    // 가로 띠를 6px 조각 + 2px 빈틈으로
    const out = maskOutlines(maskOf((x, y) => x >= 20 && x < 140 && y >= 40 && y < 60 && x % 8 < 6), W, H, { close: 3 });
    expect(out).toHaveLength(1);
    const xs = out[0]!.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(23);
    expect(Math.max(...xs)).toBeGreaterThan(134);
  });

  it("R5 가운데 빈 고리 → 바깥 테두리 하나만", () => {
    const outer = disc(80, 60, 30), inner = disc(80, 60, 15);
    const out = maskOutlines(maskOf((x, y) => outer(x, y) && !inner(x, y)), W, H);
    expect(out).toHaveLength(1);
    for (const p of out[0]!) expect(Math.hypot(p.x - 80, p.y - 60)).toBeGreaterThan(27);
  });

  it("R6 사진 가장자리에 닿아도 닫힌 테두리", () => {
    const out = maskOutlines(maskOf((x, y) => x < 30 && y < 25), W, H);
    expect(out).toHaveLength(1);
    expect(area(out[0]!) / (30 * 25)).toBeGreaterThan(0.85);
  });
});
