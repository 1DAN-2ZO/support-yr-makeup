// 머리를 입체로 옮기기 (2026-10-02 PC, B안) — 고개를 많이 돌리면 먼 쪽 눈꺼풀 점이 빗나가서,
// 잘 잡히는 얼굴 점(이마·콧대·광대)의 입체 위치(x · y · 깊이 z)로 정면 머리 → 지금 머리의 회전·크기·이동을 맞추고
// 정면에서 그린 눈 테두리를 같이 돌려 화면에 비춘다. 눈은 눈썹·콧대보다 안쪽(깊이)이라 평면 변환(A안)으로는 못 맞췄다
import { describe, expect, it } from "vitest";
import { HEAD_IDS, applyHead, farEyeWeight, fitHead } from "@core/head3d";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";

type P3 = { x: number; y: number; z: number };
/** 알려진 움직임: 1.15 배 · 고개 좌우 35° · 위아래 8° · 이동 */
function move(p: P3): P3 {
  const a = (35 * Math.PI) / 180, b = (8 * Math.PI) / 180, s = 1.15;
  const x1 = p.x * Math.cos(a) + p.z * Math.sin(a), z1 = -p.x * Math.sin(a) + p.z * Math.cos(a);
  const y2 = p.y * Math.cos(b) - z1 * Math.sin(b), z2 = p.y * Math.sin(b) + z1 * Math.cos(b);
  return { x: 40 + s * x1, y: -20 + s * y2, z: 15 + s * z2 };
}
const PTS: P3[] = [
  { x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 20 }, { x: 0, y: 120, z: -30 }, { x: -80, y: 40, z: 10 },
  { x: 50, y: -60, z: 40 }, { x: -30, y: -90, z: -15 },
];
const near = (a: Pt, b: Pt, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs((a.z ?? 0) - (b.z ?? 0)) < eps;

describe("head3d", () => {
  it("H1 점 짝으로 맞추면 알려진 회전·크기·이동이 그대로 나온다", () => {
    const t = fitHead(PTS, PTS.map(move))!;
    for (const p of [...PTS, { x: 333, y: -12, z: 77 }]) expect(near(applyHead(t, p), move(p)), JSON.stringify(p)).toBe(true);
  });

  it("H2 점이 모자라거나 한 줄 위에만 있으면 맞추지 않는다", () => {
    expect(fitHead(PTS.slice(0, 2), PTS.slice(0, 2).map(move))).toBeNull();
    const line = [0, 1, 2, 3].map((k) => ({ x: k * 10, y: k * 5, z: k }));
    expect(fitHead(line, line.map(move))).toBeNull();
  });

  it("H3 머리를 맞추는 점에는 눈꺼풀·홍채·입술이 없다 (표정·빗나간 눈꺼풀에 안 흔들리게)", () => {
    const bad = new Set<number>([...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeA.iris, ...LM.eyeB.upper, ...LM.eyeB.lower, ...LM.eyeB.iris, ...LM.lipsOuter]);
    expect(HEAD_IDS.some((i) => bad.has(i))).toBe(false);
    expect(HEAD_IDS.length).toBeGreaterThanOrEqual(12);
  });

  it("H4 먼 쪽 눈을 입체 위치로 넘기는 정도 — 각도 차 12 까지 0, 25 부터 1, 사이는 차츰", () => {
    expect(farEyeWeight(0)).toBe(0);
    expect(farEyeWeight(12)).toBe(0);
    expect(farEyeWeight(25)).toBe(1);
    expect(farEyeWeight(70)).toBe(1);
    const mid = [14, 18, 22].map(farEyeWeight);
    expect(mid[0]!).toBeGreaterThan(0);
    expect(mid[0]!).toBeLessThan(mid[1]!);
    expect(mid[2]!).toBeLessThan(1);
  });
});
