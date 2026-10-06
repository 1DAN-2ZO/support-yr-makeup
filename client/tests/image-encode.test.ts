// 저장 사진 크기 (1-7, #240): 쌩얼은 원본 크기, 나머지는 긴 변 1024
import { describe, expect, it } from "vitest";
import { BARE_MAX_SIDE, fitSize } from "@screens/image-encode";

describe("fitSize", () => {
  it("E1 쌩얼(BARE_MAX_SIDE)은 촬영 원본 크기 그대로 (#240)", () => {
    expect(fitSize(1080, 1920, BARE_MAX_SIDE)).toEqual({ w: 1080, h: 1920 });
    expect(fitSize(1920, 1080, BARE_MAX_SIDE)).toEqual({ w: 1920, h: 1080 });
  });
  it("E2 기본(완성 예상·최종 프레임)은 긴 변 1024 — 9/30 까지 쌩얼도 이 크기였다", () => {
    expect(fitSize(1080, 1920)).toEqual({ w: 576, h: 1024 });
    expect(fitSize(640, 480)).toEqual({ w: 640, h: 480 });   // 작으면 키우지 않는다
  });
});
