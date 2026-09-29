// 2-b AR 기준 얼굴 고르기 (#172 리뷰): 첫 프레임이 고개를 돌렸거나 잘렸으면 비뚤어진 그물에 그린 화장이 세션 내내 따라다녔다
import { describe, expect, it } from "vitest";
import { goodRef } from "@screens/fullrender";
import { LMS, W, H } from "./helpers/synth-face";

describe("goodRef", () => {
  it("A1 정면으로 화면 안에 다 들어온 얼굴은 쓴다", () => {
    expect(goodRef(LMS, W, H)).toBe(true);
  });

  it("A2 얼굴 일부가 화면 가장자리 밖이면 안 쓴다", () => {
    const xs = LMS.map((p) => p.x), shift = W - Math.max(...xs) - 2;   // 오른쪽 끝이 가장자리 2% 안으로
    expect(goodRef(LMS.map((p) => ({ ...p, x: p.x + shift })), W, H)).toBe(false);
  });

  it("A3 고개를 돌려 코끝이 두 눈 가운데에서 벗어나면 안 쓴다", () => {
    const eye = Math.hypot(LMS[263]!.x - LMS[33]!.x, LMS[263]!.y - LMS[33]!.y);
    const turned = LMS.map((p, i) => (i === 1 ? { ...p, x: p.x + eye * 0.2 } : p));
    expect(goodRef(turned, W, H)).toBe(false);
  });
});
