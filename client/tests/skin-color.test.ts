// 피부색 분석 색 계산 (스파이크 skin-tone-probe) — ΔE2000 은 Sharma·Wu·Dalal(2005) 논문의 검증 쌍으로 확인한다
import { describe, expect, it } from "vitest";
import { deltaE } from "@core/color";
import type { Lab } from "@core/color";
import { deltaE2000, describeRgb, ita, labToLch, rgbHex } from "@core/skin-color";

const lab = (L: number, a: number, b: number): Lab => ({ L, a, b });

// [Lab1, Lab2, 기대 ΔE00] — Sharma 2005 표의 쌍 (소수 4자리)
const SHARMA: [Lab, Lab, number][] = [
  [lab(50, 2.6772, -79.7751), lab(50, 0, -82.7485), 2.0425],
  [lab(50, 3.1571, -77.2803), lab(50, 0, -82.7485), 2.8615],
  [lab(50, 2.8361, -74.02), lab(50, 0, -82.7485), 3.4412],
  [lab(50, -1.3802, -84.2814), lab(50, 0, -82.7485), 1.0],
  [lab(50, 0, 0), lab(50, -1, 2), 2.3669],
  [lab(50, -1, 2), lab(50, 0, 0), 2.3669],
  [lab(50, 2.49, -0.001), lab(50, -2.49, 0.0009), 7.1792],
  [lab(50, -0.001, 2.49), lab(50, 0.0009, -2.49), 4.8045],
  [lab(50, 2.5, 0), lab(73, 25, -18), 27.1492],
  [lab(50, 2.5, 0), lab(61, -5, 29), 22.8977],
];

describe("ΔE2000", () => {
  it("D1 Sharma 검증 쌍과 소수 4자리까지 같다", () => {
    for (const [p, q, want] of SHARMA) expect(deltaE2000(p, q)).toBeCloseTo(want, 3);
  });

  it("D2 같은 색은 0, 순서를 바꿔도 같다", () => {
    const p = lab(62, 14, 18), q = lab(58, 11, 21);
    expect(deltaE2000(p, p)).toBe(0);
    expect(deltaE2000(p, q)).toBeCloseTo(deltaE2000(q, p), 10);
  });

  it("D3 무채색(a=b=0)끼리도 NaN 이 안 난다", () => {
    expect(deltaE2000(lab(40, 0, 0), lab(60, 0, 0))).toBeGreaterThan(0);
  });

  it("D4 피부색 범위의 작은 채도 차이는 CIE76 보다 작게 잡는다", () => {
    const p = lab(65, 14, 18), q = lab(65, 17, 22);
    expect(deltaE2000(p, q)).toBeLessThan(deltaE(p, q));
  });
});

describe("색상각·채도·ITA", () => {
  it("C1 LCh: (62,14,18) → C 22.8, h 52.1°", () => {
    const x = labToLch(lab(62, 14, 18));
    expect(x.C).toBeCloseTo(22.8, 1);
    expect(x.h).toBeCloseTo(52.1, 1);
  });

  it("C2 h 는 0~360 — 음수 b* 는 360 쪽으로", () => {
    expect(labToLch(lab(50, 10, -10)).h).toBeCloseTo(315, 5);
    expect(labToLch(lab(50, 0, 0)).h).toBe(0);
  });

  it("C3 ITA: L=50 이면 0°, 밝을수록 커지고 b*≤0 에도 이어진다", () => {
    expect(ita(lab(50, 5, 10))).toBeCloseTo(0, 8);
    expect(ita(lab(70, 5, 20))).toBeCloseTo(45, 5);
    expect(ita(lab(70, 5, 20))).toBeGreaterThan(ita(lab(60, 5, 20)));
    expect(Number.isFinite(ita(lab(70, 5, 0)))).toBe(true);
  });

  it("C4 describeRgb·hex", () => {
    const d = describeRgb([224, 172, 140]);
    expect(d.lab.L).toBeGreaterThan(60);
    expect(d.lch.h).toBeGreaterThan(40);
    expect(d.lch.h).toBeLessThan(80);
    expect(rgbHex([224, 172, 140])).toBe("#e0ac8c");
    expect(rgbHex([300, -5, 0.4])).toBe("#ff0000");
  });
});
