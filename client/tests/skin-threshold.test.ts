// 웜/쿨 기준 T 찾기 (스파이크 skin-batch-probe)
import { describe, expect, it } from "vitest";
import { AXES, auc, evaluate, fitThreshold, paperD } from "@core/skin-threshold";
import type { Item } from "@core/skin-threshold";

const mk = (warm: number[], cool: number[]): Item[] => [
  ...warm.map((v) => ({ v, warm: true })), ...cool.map((v) => ({ v, warm: false })),
];

describe("AUC", () => {
  it("A1 웜이 전부 더 크면 1, 전부 작으면 0, 완전히 섞이면 0.5", () => {
    expect(auc(mk([5, 6, 7], [1, 2, 3]))).toBe(1);
    expect(auc(mk([1, 2, 3], [5, 6, 7]))).toBe(0);
    expect(auc(mk([1, 4], [2, 3]))).toBeCloseTo(0.5, 10);   // 4쌍 중 2쌍
    expect(auc(mk([1, 3], [2, 4]))).toBeCloseTo(0.25, 10);  // 4쌍 중 1쌍
  });

  it("A2 같은 값은 0.5 로 센다", () => {
    expect(auc(mk([2], [2]))).toBe(0.5);
    expect(auc(mk([2, 3], [2, 2]))).toBeCloseTo((0.5 + 0.5 + 1 + 1) / 4, 10);
  });

  it("A3 한쪽 집단이 비면 null", () => {
    expect(auc(mk([1, 2], []))).toBeNull();
    expect(auc([])).toBeNull();
  });
});

describe("T 찾기", () => {
  it("F1 완전히 갈리면 두 집단 사이 한가운데, 균형 정확도 1", () => {
    const f = fitThreshold(mk([55, 56, 58], [47, 49, 51]))!;
    expect(f.dir).toBe(1);
    expect(f.threshold).toBeCloseTo(53, 10);
    expect(f.balAcc).toBe(1);
  });

  it("F2 웜이 더 작은 축이면 방향이 −1 로 나온다", () => {
    const f = fitThreshold(mk([47, 49, 51], [55, 56, 58]))!;
    expect(f.dir).toBe(-1);
    expect(f.balAcc).toBe(1);
  });

  it("F3 겹치면 틀리는 게 가장 적은 곳 (균형 정확도)", () => {
    // 웜 53 54 56 58, 쿨 47 49 51 54.5 → T=52 에서 웜은 다 맞고 쿨 54.5 만 틀림 → (1 + 0.75)/2. 53.5 는 웜 1·쿨 1 틀려 0.75 로 더 못함
    const f = fitThreshold(mk([53, 54, 56, 58], [47, 49, 51, 54.5]))!;
    expect(f.balAcc).toBeCloseTo(0.875, 10);
    expect(f.threshold).toBeCloseTo(52, 10);
    expect(f.dir).toBe(1);
  });

  it("F4 집단 크기가 아주 달라도 한쪽 찍기로는 높아지지 않는다 (균형)", () => {
    const items = mk([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50], [50]);   // 완전히 안 갈림
    expect(fitThreshold(items)!.balAcc).toBeCloseTo(0.5, 10);
  });

  it("F5 한쪽 집단이 비면 null", () => {
    expect(fitThreshold(mk([1, 2], []))).toBeNull();
  });
});

describe("평가·애매 구간", () => {
  const items = mk([53, 54, 56, 58], [47, 49, 51, 54.5]);

  it("E1 margin 0: 모두 판정하고 혼동표가 맞다", () => {
    const e = evaluate(items, 53.5, 1, 0);
    expect(e.coverage).toBe(1);
    expect(e).toMatchObject({ tp: 3, fn: 1, tn: 3, fp: 1 });
    expect(e.balAcc).toBeCloseTo(0.75, 10);
  });

  it("E2 margin 을 주면 T 근처가 애매로 빠지고 남은 것의 정확도가 오른다", () => {
    const e = evaluate(items, 53.5, 1, 1.5);   // 52~55 → 53 · 54 · 54.5 가 애매
    expect(e.ambiguousWarm + e.ambiguousCool).toBe(3);
    expect(e.kept).toBe(5);
    expect(e.coverage).toBeCloseTo(5 / 8, 10);
    expect(e.balAcc).toBe(1);
  });

  it("E3 방향 −1 이면 판정이 뒤집힌다", () => {
    const e = evaluate(mk([47, 49], [55, 56]), 52, -1, 0);
    expect(e.balAcc).toBe(1);
  });

  it("E4 한쪽 집단이 전부 애매로 빠지면 balAcc 는 null", () => {
    expect(evaluate(mk([52.9], [47, 49]), 53, 1, 1).balAcc).toBeNull();
  });
});

describe("축", () => {
  it("X1 논문식 D: (62,14,18) → 2.83", () => {
    expect(paperD({ L: 62, a: 14, b: 18 })).toBeCloseTo(2.827, 3);
  });

  it("X2 축 값: h, b, a, C, L", () => {
    const lab = { L: 62, a: 14, b: 18 };
    expect(AXES.h.of(lab)).toBeCloseTo(52.1, 1);
    expect(AXES.b.of(lab)).toBe(18);
    expect(AXES.a.of(lab)).toBe(14);
    expect(AXES.C.of(lab)).toBeCloseTo(22.8, 1);
    expect(AXES.L.of(lab)).toBe(62);
  });
});
