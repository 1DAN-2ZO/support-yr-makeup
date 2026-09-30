// 부위별 다시 맞추기 (alignedFrame) — 폰 시험(2026-09-30): 쌩얼(세로·아래에서) ↔ 확인받기(가로·위에서) 원근이 달라
// 얼굴 전체를 한 번에 옮기면 눈 점이 16px 아래(눈알 위)로 가서, 화면 5 정답 테두리가 눈동자에 떴다.
// 눈은 화장에 덜 밀리는 점(앞·뒤 끝·아랫눈꺼풀·눈동자)으로, 눈썹은 눈썹 점끼리 좌우 따로 다시 맞춘다.
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { alignedFrame } from "@core/score-part";
import type { Pt } from "@core/types";
import { BARE, LMS } from "./helpers/synth-face";

const eyeA = [...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeA.iris];
const browA = [...LM.browA.upper, ...LM.browA.lower];
const moved = (ids: readonly number[], dx: number, dy: number, lm: readonly Pt[] = LMS): Pt[] => {
  const s = new Set(ids);
  return lm.map((p, i) => (s.has(i) ? { x: p.x + dx, y: p.y + dy } : { ...p }));
};
const err = (a: readonly Pt[], b: readonly Pt[], ids: readonly number[]) => ids.reduce((s, i) => s + Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y), 0) / ids.length;

describe("부위별 다시 맞추기", () => {
  it("A1 원근으로 눈이 코·이마보다 8px 아래로 보이면 — 눈 점이 새로 찾은 눈으로 간다 (전엔 그대로 남아 눈알 위)", () => {
    const detected = moved(eyeA, 0, 8);
    const { frame } = alignedFrame(BARE, BARE.im, detected);
    expect(err(frame.lm, detected, eyeA)).toBeLessThan(1);
  });

  it("A2 눈썹은 눈썹 점끼리 — 눈썹만 6px 위로 보이면 눈썹 점이 따라간다 (눈은 그대로)", () => {
    const detected = moved(browA, 0, -6);
    const { frame } = alignedFrame(BARE, BARE.im, detected);
    expect(err(frame.lm, detected, browA)).toBeLessThan(1);
    expect(err(frame.lm, LMS, eyeA)).toBeLessThan(1);
  });

  it("A3 라이너가 윗눈꺼풀 점만 위로 밀어도(화장) 기준 선은 따라가지 않는다 — 앞·뒤 끝·아랫눈꺼풀로 맞추니까", () => {
    const upper = LM.eyeA.upper.filter((i) => i !== LM.eyeA.outer && i !== LM.eyeA.inner);
    const detected = moved(upper, 0, -4);
    const { frame } = alignedFrame(BARE, BARE.im, detected);
    expect(err(frame.lm, LMS, upper)).toBeLessThan(1);
  });

  it("A4 얼굴이 그대로면 아무것도 안 바뀐다", () => {
    const { frame } = alignedFrame(BARE, BARE.im, LMS);
    expect(err(frame.lm, LMS, [...eyeA, ...browA])).toBeLessThan(0.01);
  });
});
