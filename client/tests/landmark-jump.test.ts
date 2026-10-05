// [개발용 ?jump] 브러시·손이 얼굴 앞에 있을 때 눈 점이 얼마나 튀나 (2026-10-02 관찰).
// 장면 사이 눈 점의 움직임에서 머리 전체 움직임(이마·코·광대로 맞춘 변환)을 뺀 나머지 = 튐. 눈 폭 대비
import { describe, expect, it } from "vitest";
import { createJumpProbe, eyeJump } from "@core/landmark-jump";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const EYE_W = Math.hypot(LMS[LM.eyeA.outer]!.x - LMS[LM.eyeA.inner]!.x, LMS[LM.eyeA.outer]!.y - LMS[LM.eyeA.inner]!.y);
const shiftEye = (lm: readonly Pt[], eye: typeof LM.eyeA, dx: number): Pt[] => {
  const ids = new Set<number>([...eye.upper, ...eye.lower]);
  return lm.map((p, i) => (ids.has(i) ? { x: p.x + dx, y: p.y } : p));
};

describe("landmark jump", () => {
  it("J1 같은 장면이면 튐 0", () => {
    const j = eyeJump(LMS, LMS)!;
    expect(j.R).toBeCloseTo(0, 9);
    expect(j.L).toBeCloseTo(0, 9);
    expect(j.head).toBeCloseTo(0, 9);
  });

  it("J2 머리 전체가 옮겨지고·커지고·기울어도 튐 0 — 머리 움직임은 뺀다", () => {
    const a = 0.1, s = 1.2;
    const moved = LMS.map((p) => ({ x: 20 + s * (p.x * Math.cos(a) - p.y * Math.sin(a)), y: -15 + s * (p.x * Math.sin(a) + p.y * Math.cos(a)) }));
    const j = eyeJump(LMS, moved)!;
    expect(j.R).toBeLessThan(1e-6);
    expect(j.L).toBeLessThan(1e-6);
    expect(j.head).toBeLessThan(1e-6);
  });

  it("J3 한쪽 눈 점만 5px 튀면 그 눈만 5px / 눈 폭", () => {
    const j = eyeJump(LMS, shiftEye(LMS, LM.eyeA, 5))!;
    expect(j.R).toBeCloseTo(5 / EYE_W, 6);
    expect(j.L).toBeCloseTo(0, 6);
    expect(j.head).toBeCloseTo(0, 6);
  });

  it("J4 화면 표시 — 지금 · 최근 1초 최대 · 얼굴 놓침 횟수. 화면 왼쪽 눈 = 거울이라 영상 오른쪽 눈", () => {
    const p = createJumpProbe();
    p.step(LMS, 0);
    p.step(shiftEye(LMS, LM.eyeA, 9), 33);   // eyeA 는 영상 왼쪽 → 거울 화면에서 오른쪽
    let line = p.step(LMS, 66);
    expect(line).toContain("최근 1초 최대 왼쪽 0.0% · 오른쪽 10.0%");
    p.step(null, 99);
    line = p.step(LMS, 132);
    expect(line).toContain("얼굴 놓침 1회");
    // 1초가 지나면 최대값도 사라진다
    line = p.step(LMS, 1200);
    expect(line).toContain("최근 1초 최대 왼쪽 0.0% · 오른쪽 0.0%");
  });
});
