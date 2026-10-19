// 흰 배경 기준 조명 보정 (배경 표본 · 흰지 검사 · 배수)
import { describe, expect, it } from "vitest";
import { backgroundGain, isWhiteBackground, sampleBackground } from "@core/skin-bg-wb";
import type { RgbaImage } from "@core/color";
import type { Rgb } from "@core/skin-color";
import type { Pt } from "@core/types";

const W = 400, H = 400;
/** 얼굴 상자 (150~250) 만 피부색, 나머지는 bg */
function scene(bg: Rgb, skin: Rgb = [200, 150, 120]): { im: RgbaImage; lm: Pt[] } {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inFace = x >= 150 && x < 250 && y >= 150 && y < 250;
    const c = inFace ? skin : bg, i = (y * W + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  const lm: Pt[] = [{ x: 150, y: 150 }, { x: 249, y: 150 }, { x: 150, y: 249 }, { x: 249, y: 249 }];
  return { im: { data, w: W, h: H }, lm };
}

describe("흰 배경 보정", () => {
  it("B1 순백 배경 → 배수 1, 흰 배경으로 인정", () => {
    const { im, lm } = scene([250, 250, 250]);
    const bg = sampleBackground(im, lm)!;
    expect(bg.rgb).toEqual([250, 250, 250]);
    expect(isWhiteBackground(bg)).toBe(true);
    const g = backgroundGain(bg)!;
    for (const k of g) expect(k).toBeCloseTo(1, 6);
  });

  it("B2 노란 조명이 든 흰 배경 → 파랑을 올리고 빨강을 내리는 배수, 밝기(평균)는 유지", () => {
    const { im, lm } = scene([235, 225, 200]);
    const bg = sampleBackground(im, lm)!;
    const g = backgroundGain(bg)!;
    expect(g[0]).toBeLessThan(1);
    expect(g[2]).toBeGreaterThan(1);
    const fixed = bg.rgb.map((c, k) => c * g[k]!);
    expect(fixed[0]).toBeCloseTo(fixed[1]!, 6);
    expect(fixed[1]).toBeCloseTo(fixed[2]!, 6);
    expect((fixed[0]! + fixed[1]! + fixed[2]!) / 3).toBeCloseTo((235 + 225 + 200) / 3, 6);
  });

  it("B3 색 벽(파란 벽) · 어두운 배경은 흰 배경이 아니라서 배수를 안 낸다", () => {
    for (const bg of [[120, 150, 220], [90, 90, 90]] as Rgb[]) {
      const { im, lm } = scene(bg);
      const s = sampleBackground(im, lm)!;
      expect(isWhiteBackground(s), String(bg)).toBe(false);
      expect(backgroundGain(s), String(bg)).toBeNull();
    }
  });

  it("B4 얼굴 안쪽 피부는 배경 표본에 안 섞인다", () => {
    const { im, lm } = scene([245, 245, 245], [10, 10, 10]);
    expect(sampleBackground(im, lm)!.rgb).toEqual([245, 245, 245]);
  });

  it("B5 배경에 머리카락(어두운 덩어리)이 섞여도 밝은 쪽 중앙값이라 흰색이 나온다", () => {
    const { im, lm } = scene([245, 245, 245]);
    // 얼굴 왼쪽 옆 띠(x 60~110)를 머리카락처럼 어둡게 — 배경 표본 영역의 약 1/4
    for (let y = 0; y < H; y++) for (let x = 60; x < 110; x++) { const i = (y * W + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 20; }
    expect(sampleBackground(im, lm)!.rgb).toEqual([245, 245, 245]);
  });

  it("B6 배수가 상한(0.6~1.7)을 넘어야 하면 null — 터무니없는 보정은 안 한다", () => {
    const bg = { rgb: [250, 250, 60] as Rgb, n: 500, L: 90, chroma: 5 };   // 채도 값만 통과시킨 가짜 표본
    expect(backgroundGain(bg)).toBeNull();
  });

  it("B7 얼굴이 화면을 거의 다 채워 배경 표본이 모자라면 null", () => {
    const { im } = scene([250, 250, 250]);
    const lm: Pt[] = [{ x: 5, y: 5 }, { x: 395, y: 5 }, { x: 5, y: 395 }, { x: 395, y: 395 }];
    expect(sampleBackground(im, lm)).toBeNull();
    expect(sampleBackground(im, [])).toBeNull();
  });
});
