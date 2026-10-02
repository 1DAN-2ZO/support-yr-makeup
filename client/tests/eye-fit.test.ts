// C안 (2026-10-02 PC) — 눈 모양 틀에 맞추기. 정면 눈 모양(눈꺼풀 점 16개)을 하나의 틀로 지금 눈꺼풀 점에 한꺼번에 맞추되,
// 튀는 점(먼 쪽 눈머리가 코 쪽으로 삐져나옴)은 무시한다. 틀을 세로로 눌러 맞출 수 있어 눈을 감거나 내리깔아도 따라간다
import { describe, expect, it } from "vitest";
import { EYE_CONTOUR, farEyeWeight, robustAffine, stretchAlong } from "@core/eye-fit";
import { applyAffine } from "@core/eye-fit";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";

/** 정면 눈: 폭 90 · 높이 30 타원 둘레 16점 (0 = 눈꼬리, 8 = 눈머리) */
const EYE: Pt[] = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * 2 * Math.PI;
  return { x: 200 + 45 * Math.cos(a), y: 250 - 15 * Math.sin(a) };
});
/** 고개를 돌려 가로로 0.7 배 · 6° 기울고 옮겨진 눈 */
const T = (p: Pt): Pt => {
  const a = (6 * Math.PI) / 180, x = (p.x - 200) * 0.7, y = p.y - 250;
  return { x: 230 + x * Math.cos(a) - y * Math.sin(a), y: 240 + x * Math.sin(a) + y * Math.cos(a) };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe("eye fit (C안)", () => {
  it("C1 튀는 점이 없으면 틀이 그대로 맞는다", () => {
    const t = robustAffine(EYE, EYE.map(T), 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(p))).toBeLessThan(1e-6);
  });

  it("C2 튀는 점 두 개(눈머리 20px · 눈꼬리 10px)는 무시하고 나머지에 맞춘다", () => {
    const cur = EYE.map(T);
    cur[8] = { x: cur[8]!.x - 20, y: cur[8]!.y };    // 눈머리가 코 쪽으로
    cur[0] = { x: cur[0]!.x + 4, y: cur[0]!.y + 9 }; // 눈꼬리가 눈동자 쪽으로
    const t = robustAffine(EYE, cur, 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(p)), JSON.stringify(p)).toBeLessThan(0.5);
  });

  it("C3 눈을 반쯤 감으면(세로 0.4 배) 틀도 눌려서 따라간다", () => {
    const half = (p: Pt): Pt => ({ x: p.x, y: 250 + (p.y - 250) * 0.4 });
    const t = robustAffine(EYE, EYE.map((p) => T(half(p))), 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(half(p)))).toBeLessThan(1e-6);
  });

  it("C4 눈꺼풀 점 16개 — 위·아래 눈꺼풀, 눈꼬리·눈머리는 한 번씩", () => {
    for (const [s, eye] of [["R", LM.eyeA], ["L", LM.eyeB]] as const) {
      expect(EYE_CONTOUR[s]).toHaveLength(16);
      expect(new Set(EYE_CONTOUR[s]).size).toBe(16);
      for (const i of [...eye.upper, ...eye.lower]) expect(EYE_CONTOUR[s]).toContain(i);
    }
  });

  it("F1 한 방향으로만 늘이기 — 가운데를 지나는 축 방향 성분만 f 배, 수직 성분은 그대로 (눈 폭만 고치기)", () => {
    const c = { x: 100, y: 50 }, dir = { x: Math.cos(0.3), y: Math.sin(0.3) };
    const n = { x: -dir.y, y: dir.x };
    const p = { x: c.x + 10 * dir.x + 4 * n.x, y: c.y + 10 * dir.y + 4 * n.y };
    const q = stretchAlong(p, c, dir, 1.5);
    expect(dist(q, { x: c.x + 15 * dir.x + 4 * n.x, y: c.y + 15 * dir.y + 4 * n.y })).toBeLessThan(1e-9);
    expect(dist(stretchAlong(c, c, dir, 3), c)).toBeLessThan(1e-12);
  });

  it("C5 먼 쪽 눈을 틀로 넘기는 정도 — 각도 차 12 까지 0, 25 부터 1, 사이는 차츰", () => {
    expect(farEyeWeight(12)).toBe(0);
    expect(farEyeWeight(25)).toBe(1);
    expect(farEyeWeight(18)).toBeGreaterThan(0);
    expect(farEyeWeight(18)).toBeLessThan(1);
  });
});
