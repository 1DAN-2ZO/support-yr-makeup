// I안 (2026-10-02) — 머리 움직임은 바로, 얼굴 모양 변화(눈꺼풀 등)만 천천히 따라가기.
// 펜 끝을 눈꺼풀에 대면 MediaPipe 눈 점이 눈 폭 1.5% 쯤 떨린다(PC ?jump) — 라이너 굵기(눈 폭 2~6%)와 비슷해 따라 그리기에 방해.
// 잘 안 가려지는 점(이마·코·광대)으로 머리 움직임을 구해 빼고, 남은 모양 변화에만 떨림 필터를 건 뒤 지금 머리 위치로 되돌린다
import { describe, expect, it } from "vitest";
import { EYE_SMOOTH, createHeadFrameSmoother } from "@core/head-frame-smooth";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./helpers/synth-face";

const EYE = [...LM.eyeB.upper, ...LM.eyeB.lower];
const move = (lm: readonly Pt[], dx: number, dy: number, a = 0, s = 1): Pt[] =>
  lm.map((p) => ({ x: dx + s * (p.x * Math.cos(a) - p.y * Math.sin(a)), y: dy + s * (p.x * Math.sin(a) + p.y * Math.cos(a)) }));
const withEye = (lm: readonly Pt[], f: (p: Pt) => Pt): Pt[] => lm.map((p, i) => ((EYE as number[]).includes(i) ? f(p) : p));
const spreadX = (xs: readonly number[]) => Math.max(...xs) - Math.min(...xs);

describe("head-frame smooth (I안)", () => {
  it("I1 머리만 움직이면(옮기고·돌리고·키움) 늦지 않는다 — 매 장면 그대로", () => {
    const s = createHeadFrameSmoother();
    for (let k = 0; k < 30; k++) {
      const lm = move(LMS, 3 * k, -2 * k, 0.004 * k, 1 + 0.005 * k);
      const out = s.step(lm, k * 33)!;
      for (const i of [33, 263, 61, 4, 159]) {
        expect(Math.abs(out[i]!.x - lm[i]!.x), `${k}:${i}`).toBeLessThan(1e-6);
        expect(Math.abs(out[i]!.y - lm[i]!.y), `${k}:${i}`).toBeLessThan(1e-6);
      }
    }
  });

  it("I2 머리는 가만히, 눈 점만 매 장면 ±1.5px 떨리면 그리는 점은 30% 아래로 떨린다", () => {
    const s = createHeadFrameSmoother(), xs: number[] = [];
    for (let k = 0; k < 90; k++) {
      const out = s.step(withEye(LMS, (p) => ({ x: p.x + (k % 2 ? 1.5 : -1.5), y: p.y })), k * 33)!;
      if (k >= 45) xs.push(out[LM.eyeB.upper[4]!]!.x);
    }
    expect(spreadX(xs)).toBeLessThan(3 * 0.3);
  });

  it("I3 눈을 반쯤 감은 채 그대로 있으면 0.4 초 안에 거의 따라간다 (펜으로 그릴 때 눈을 내리깖)", () => {
    const s = createHeadFrameSmoother(), top = LM.eyeB.upper[4]!;
    for (let k = 0; k < 15; k++) s.step(LMS, k * 33);
    const half = withEye(LMS, (p) => ({ x: p.x, y: 250 + (p.y - 250) * 0.5 }));
    let out: Pt[] = [];
    for (let k = 15; k < 15 + 12; k++) out = s.step(half, k * 33)!;   // 약 0.4 초
    const want = half[top]!.y, from = LMS[top]!.y;
    expect(Math.abs(out[top]!.y - want) / Math.abs(want - from)).toBeLessThan(0.2);
  });

  it("I4 머리가 움직이는 동안 눈 점이 떨려도 — 머리는 바로 따라가고 떨림만 줄어든다", () => {
    const s = createHeadFrameSmoother(), errs: number[] = [];
    for (let k = 0; k < 90; k++) {
      const head = move(LMS, 2 * k, 0);
      const lm = withEye(head, (p) => ({ x: p.x + (k % 2 ? 1.5 : -1.5), y: p.y }));
      const out = s.step(lm, k * 33)!;
      expect(Math.abs(out[4]!.x - head[4]!.x)).toBeLessThan(1e-6);   // 코끝(머리 점)은 그대로
      if (k >= 45) errs.push(out[LM.eyeB.upper[4]!]!.x - head[LM.eyeB.upper[4]!]!.x);
    }
    expect(spreadX(errs)).toBeLessThan(3 * 0.3);
  });

  it("I5 값은 한 곳 (가정값 — 화면 4 ?eyesm= 로 맞춘다)", () => {
    expect(EYE_SMOOTH.minCutoff).toBeGreaterThan(0);
  });
});
