// 조명 한계 (lightTol) — 폰 시험(2026-09-30): "조명이 달라져서" 로 채점을 너무 자주 거부했다.
// 채점은 이마 밝기 비율로 L* 를 맞춘 뒤 비교하니(lightCorr), 밝기만 달라진 건 보정으로 받친다.
import { describe, expect, it } from "vitest";
import { scorePart } from "@core/score-part";
import { decide } from "@core/score";
import type { PartId } from "@core/types";
import { BARE, guide, linerPaint, made } from "./helpers/synth-face";

const run = (partId: PartId, gain: number, paint = linerPaint()) => {
  const { result, ctx } = scorePart(partId, BARE, made(paint, gain), guide);
  return { result, ctx, d: decide(partId, result, ctx) };
};

describe("조명 한계", () => {
  it("T1 25% 어두운 곳(밝기 0.75배, 이마 L* 약 −17)에서 그린 라이너도 채점한다 — 전엔 '조명이 달라져서' 로 거부", () => {
    const dim = run("liner", 0.75), ok = run("liner", 1);
    expect(dim.d.status).toBe("scored");
    expect(Math.abs((dim.d.score ?? 0) - (ok.d.score ?? 0))).toBeLessThanOrEqual(15);
  });

  it("T2 화장 안 한 맨얼굴을 어둡게 찍어도 '화장했다' 로 잡지 않는다 (보정이 받친다)", () => {
    const { d } = run("liner", 0.75, () => null);
    expect(d).toMatchObject({ status: "check_only", reason: "faint" });
  });

  it("T3 35% 어두우면(밝기 0.65배, L* 약 −24) 여전히 확인만(조명)", () => {
    expect(run("liner", 0.65).d).toMatchObject({ status: "check_only", reason: "lighting" });
  });
});
