// #153 라이너 두께 띠의 위치 — ② 가이드(guides.ts linerOutline)는 속눈썹 선에서 **위로** thick 만큼 그린다.
// 채점도 같은 띠(속눈썹 선 ~ 위로 thick)를 "안" 으로 봐야 가이드대로 칠한 두꺼운 선이 "번졌다" 가 안 된다.
import { describe, expect, it } from "vitest";
import { frameOf, type SampleFrame } from "@core/sampling";
import { scorePart, type GuideSource } from "@core/score-part";
import type { Pt } from "@core/types";
import { BARE, INK, LMS, P, eyeOf, guide, image, type Paint } from "./helpers/synth-face";

function distToPath(x: number, y: number, path: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}
const withThick = (thick: number): GuideSource => (partId, f) => {
  const g = guide(partId, f);
  return partId === "liner" ? { ...g, liner: { ...g.liner!, thick } } : g;
};
/** 속눈썹 선에서 위로 thickPx 만큼 칠한 띠 (가이드와 같은 뜻) */
const bandAbove = (thickPx: number): Paint => {
  const lids = (["R", "L"] as const).map((s) => eyeOf(s).upper.map(P).map((p) => ({ x: p.x, y: p.y - thickPx / 2 })));
  return (x, y) => (lids.some((l) => distToPath(x, y, l) <= thickPx / 2) ? INK : null);
};

describe("라이너 두께 띠 = 속눈썹 선에서 위로 (#153)", () => {
  const thick = 0.09;
  const cur: SampleFrame = frameOf(image(bandAbove(thick * BARE.unit.eye)), LMS);

  it("L1 두꺼운 선을 가이드대로(위로 thick) 칠하면 '밖으로 번짐' 이 아니다", () => {
    const r = scorePart("liner", BARE, cur, withThick(thick)).result;
    expect(r.codes.filter((c) => c.startsWith("LINER_OUT"))).toEqual([]);
    const e = (r.metrics as { perEye: Record<string, { overflow: number }> }).perEye;
    expect(Math.max(e.R!.overflow, e.L!.overflow)).toBeLessThan(0.05);
  });

  it("L2 가이드보다 훨씬 위까지 칠하면 번짐으로 잡는다 (띠를 넓히기만 한 게 아니다)", () => {
    const r = scorePart("liner", BARE, cur, withThick(0.03)).result;
    const e = (r.metrics as { perEye: Record<string, { overflow: number }> }).perEye;
    expect(Math.max(e.R!.overflow, e.L!.overflow)).toBeGreaterThan(0.1);
  });
});
