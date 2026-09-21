// 색 변환·이마·눈 흰자 참조 검증 (1-4·1-6)
import { describe, expect, it } from "vitest";
import { EYE_A, EYE_B, FOREHEAD_POLY, deltaE, foreheadLab, labDrift, meanLabPoly, rgbToLab, scleraLab } from "@core/color";
import type { RgbaImage } from "@core/color";
import type { Pt } from "@core/types";

/** 단색 이미지에 눈 자리만 다른 색으로 칠한 가짜 사진 */
function makeImage(w: number, h: number, fill: [number, number, number], paint: (x: number, y: number) => [number, number, number] | null): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = paint(x, y) ?? fill;
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { data, w, h };
}

/** 478점 가짜 랜드마크: 필요한 인덱스만 의미 있는 위치, 나머지는 얼굴 가운데 */
function fakeLm(): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 100, y: 120 }));
  // 이마 다각형: (60,20)~(140,60) 사각형 근처
  const fore: Pt[] = [{ x: 100, y: 20 }, { x: 120, y: 22 }, { x: 135, y: 30 }, { x: 140, y: 45 }, { x: 138, y: 58 }, { x: 62, y: 58 }, { x: 60, y: 45 }, { x: 65, y: 30 }, { x: 80, y: 22 }, { x: 90, y: 20 }, { x: 95, y: 19 }];
  FOREHEAD_POLY.forEach((idx, k) => { lm[idx] = fore[k]!; });
  // 눈 A: 중심 (70,100) 반지름 12 의 원 테두리, 홍채 중심 (70,100) 반지름 4
  const ringA = EYE_A.ring, ringB = EYE_B.ring;
  const circle = (cx: number, cy: number, r: number, n: number): Pt[] => Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }));
  circle(70, 100, 12, ringA.length).forEach((p, k) => { lm[ringA[k]!] = p; });
  circle(130, 100, 12, ringB.length).forEach((p, k) => { lm[ringB[k]!] = p; });
  lm[EYE_A.outer] = { x: 58, y: 100 }; lm[EYE_A.inner] = { x: 82, y: 100 };
  lm[EYE_B.outer] = { x: 142, y: 100 }; lm[EYE_B.inner] = { x: 118, y: 100 };
  lm[EYE_A.iris[0]] = { x: 70, y: 100 }; EYE_A.iris.slice(1).forEach((i, k) => { lm[i] = { x: 70 + (k % 2 ? 4 : 0), y: 100 + (k % 2 ? 0 : 4) }; });
  lm[EYE_B.iris[0]] = { x: 130, y: 100 }; EYE_B.iris.slice(1).forEach((i, k) => { lm[i] = { x: 130 + (k % 2 ? 4 : 0), y: 100 + (k % 2 ? 0 : 4) }; });
  return lm;
}

describe("rgbToLab", () => {
  it("흰색은 L*≈100, a*b*≈0 / 검정은 L*≈0", () => {
    const w = rgbToLab(255, 255, 255);
    expect(w.L).toBeCloseTo(100, 0); expect(Math.abs(w.a)).toBeLessThan(1); expect(Math.abs(w.b)).toBeLessThan(1);
    expect(rgbToLab(0, 0, 0).L).toBeCloseTo(0, 0);
  });
  it("빨강은 a*>0, 파랑은 b*<0", () => {
    expect(rgbToLab(255, 0, 0).a).toBeGreaterThan(50);
    expect(rgbToLab(0, 0, 255).b).toBeLessThan(-50);
  });
  it("deltaE 는 같은 색 0", () => {
    expect(deltaE(rgbToLab(120, 90, 80), rgbToLab(120, 90, 80))).toBe(0);
  });
});

describe("이마·눈 흰자 참조", () => {
  const skin: [number, number, number] = [220, 180, 160];
  const white: [number, number, number] = [235, 232, 230];
  const irisDark: [number, number, number] = [40, 30, 30];
  const lm = fakeLm();
  const im = makeImage(200, 160, skin, (x, y) => {
    for (const cx of [70, 130]) {
      const d = Math.hypot(x - cx, y - 100);
      if (d <= 4.6) return irisDark;          // 홍채
      if (d <= 12) return white;             // 흰자
    }
    return null;
  });

  it("foreheadLab 은 이마 다각형 안 피부색", () => {
    const f = foreheadLab(im, lm)!;
    const skinLab = rgbToLab(...skin);
    expect(deltaE(f, skinLab)).toBeLessThan(0.5);
  });

  it("scleraLab 은 홍채를 빼고 흰자만 평균한다 (a*b*≈0, L* 높음)", () => {
    const s = scleraLab(im, lm)!;
    expect(s).not.toBeNull();
    expect(s.L).toBeGreaterThan(85);
    expect(Math.abs(s.a)).toBeLessThan(3);
    expect(Math.abs(s.b)).toBeLessThan(3);
    expect(s.n).toBeGreaterThan(12);
  });

  it("흰자가 없으면(눈 감음 = 피부색) null", () => {
    const closed = makeImage(200, 160, skin, () => null);
    expect(scleraLab(closed, lm)).toBeNull();
  });

  it("조명이 노랗게 돌면 흰자 b* 가 양수로 움직인다", () => {
    const warm = makeImage(200, 160, skin, (x, y) => {
      for (const cx of [70, 130]) {
        const d = Math.hypot(x - cx, y - 100);
        if (d <= 4.6) return irisDark;
        if (d <= 12) return [240, 230, 200];
      }
      return null;
    });
    const s = scleraLab(warm, lm)!;
    expect(s.b).toBeGreaterThan(8);
  });

  it("meanLabPoly 는 점이 3개 미만이면 null", () => {
    expect(meanLabPoly(im, [{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
  });
});

describe("labDrift (1-4)", () => {
  it("4장의 이마 Lab 변동 폭과 첫 장 대비 최대 ΔE", () => {
    const d = labDrift([{ L: 70, a: 10, b: 15 }, { L: 72, a: 11, b: 14 }, { L: 66, a: 9, b: 18 }, { L: 71, a: 10, b: 15 }])!;
    expect(d.rangeL).toBeCloseTo(6); expect(d.rangeA).toBeCloseTo(2); expect(d.rangeB).toBeCloseTo(4);
    expect(d.maxDeltaE).toBeCloseTo(Math.hypot(4, 1, 3));
  });
  it("한 장이면 null", () => {
    expect(labDrift([{ L: 1, a: 2, b: 3 }])).toBeNull();
  });
});
