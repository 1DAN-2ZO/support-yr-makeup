// 먼 쪽 눈을 눈 주변 점으로 옮기기 (2026-10-02 PC) — 고개를 많이 돌리면 MediaPipe 눈꺼풀 점이 빗나가서
// (먼 쪽 눈머리가 코 쪽으로 삐져나옴), 눈썹·눈 둘레 바깥 고리·콧대처럼 잘 잡히는 점으로 정면 → 지금 변환을 맞춘다
import { describe, expect, it } from "vitest";
import { EYE_FRAME, applyAffine, eyeFrameAffine, farEyeWeight, fitAffine } from "@core/eye-frame";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

/** 알려진 변환: 가로 0.75 배(원근) · 8° 기울임 · 옮김 */
const T = (p: Pt): Pt => {
  const a = (8 * Math.PI) / 180, x = p.x * 0.75;
  return { x: 30 + x * Math.cos(a) - p.y * Math.sin(a), y: -12 + x * Math.sin(a) + p.y * Math.cos(a) };
};
const near = (a: Pt, b: Pt, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

describe("eye frame", () => {
  it("F1 점 짝으로 변환을 맞추면 알려진 변환이 그대로 나온다", () => {
    const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 80 }, { x: 60, y: 40 }];
    const t = fitAffine(src, src.map(T))!;
    for (const p of [{ x: 10, y: 20 }, { x: 300, y: -50 }]) expect(near(applyAffine(t, p), T(p))).toBe(true);
    expect(fitAffine([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();   // 한 줄 위 점만
  });

  it("F2 눈꺼풀 점이 빗나가도 변환은 그대로 — 눈 주변 점에는 눈꺼풀·홍채가 없다", () => {
    const eyeIds = new Set<number>([...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeA.iris, ...LM.eyeB.upper, ...LM.eyeB.lower, ...LM.eyeB.iris]);
    for (const s of ["R", "L"] as const) expect(EYE_FRAME[s].some((i) => eyeIds.has(i))).toBe(false);
    const cur = LMS.map(T);
    // 먼 쪽 눈머리가 코 쪽으로 20px 삐져나온 것처럼
    cur[LM.eyeB.inner] = { x: cur[LM.eyeB.inner]!.x - 20, y: cur[LM.eyeB.inner]!.y };
    const t = eyeFrameAffine(LMS, cur, "L")!;
    for (const i of [...LM.eyeB.upper, ...LM.eyeB.lower]) expect(near(applyAffine(t, LMS[i]!), T(LMS[i]!)), String(i)).toBe(true);
  });

  it("F3 먼 쪽 눈을 주변 점으로 넘기는 정도 — 각도 차 12 까지 0, 25 부터 1, 사이는 차츰", () => {
    expect(farEyeWeight(0)).toBe(0);
    expect(farEyeWeight(12)).toBe(0);
    expect(farEyeWeight(25)).toBe(1);
    expect(farEyeWeight(70)).toBe(1);
    const mid = [14, 18, 22].map(farEyeWeight);
    expect(mid[0]!).toBeGreaterThan(0);
    expect(mid[0]!).toBeLessThan(mid[1]!);
    expect(mid[1]!).toBeLessThan(mid[2]!);
    expect(mid[2]!).toBeLessThan(1);
  });
});
