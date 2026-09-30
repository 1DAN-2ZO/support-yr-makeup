// 3점 대응 아핀 변형 — poc/look-tryon/client/lib/affine.js 포팅 검증
import { describe, expect, it } from "vitest";
import { solveAffine } from "@core/affine";
import type { Pt } from "@core/affine";

describe("solveAffine", () => {
  it("항등 변환(같은 삼각형) -> 항등 행렬 근사", () => {
    const tri: [Pt, Pt, Pt] = [[0, 0], [10, 0], [0, 10]];
    const m = solveAffine(tri, tri);
    expect(m).not.toBeNull();
    const [a, b, c, d, e, f] = m!;
    expect(a).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(0, 5);
    expect(c).toBeCloseTo(0, 5);
    expect(d).toBeCloseTo(1, 5);
    expect(e).toBeCloseTo(0, 5);
    expect(f).toBeCloseTo(0, 5);
  });

  it("퇴화 삼각형(일직선) -> null", () => {
    const line: [Pt, Pt, Pt] = [[0, 0], [1, 0], [2, 0]];
    expect(solveAffine(line, [[0, 0], [1, 1], [2, 2]])).toBeNull();
  });
});
