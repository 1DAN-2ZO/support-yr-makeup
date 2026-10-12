// 볼 피부색 측정 (스파이크 skin-tone-probe) — 합성 사진: 볼 자리만 의미 있고 나머지 점은 한곳에 모여 있다
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { rgbToLab } from "@core/color";
import {
  CHEEK_POLY, ROI_DEFAULT, TONE_DEFAULT, WB_SANITY, applyGain, cheekPoly, combineTones, measureCheek, measureFrame, skinTone, wbPlausible,
} from "@core/skin-measure";
import type { RoiParams, SkinFrame, Side } from "@core/skin-measure";
import type { Pt } from "@core/types";

const W = 400, H = 400;
type Rgb = [number, number, number];
const SKIN: Rgb = [214, 160, 130];

/** 478점. 볼 8점을 사각형 둘레에 놓는다 (R: x 60~160, L: x 240~340, 둘 다 y 200~300). 나머지는 (200,20) */
function lmWithCheeks(): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 200, y: 20 }));
  const ring = (x0: number, x1: number): Pt[] => {
    const xm = (x0 + x1) / 2, y0 = 200, y1 = 300, ym = 250;
    return [{ x: x0, y: y0 }, { x: xm, y: y0 }, { x: x1, y: y0 }, { x: x1, y: ym }, { x: x1, y: y1 }, { x: xm, y: y1 }, { x: x0, y: y1 }, { x: x0, y: ym }];
  };
  CHEEK_POLY.R.forEach((id, k) => { lm[id] = ring(60, 160)[k]!; });
  CHEEK_POLY.L.forEach((id, k) => { lm[id] = ring(240, 340)[k]!; });
  return lm;
}

function image(paint: (x: number, y: number) => Rgb): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = paint(x, y), i = (y * W + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { data, w: W, h: H };
}
const flat = (c: Rgb) => image(() => c);
const LM = lmWithCheeks();
const roi = (p: Partial<RoiParams> = {}): RoiParams => ({ ...ROI_DEFAULT, ...p });

describe("볼 다각형·측정", () => {
  it("M1 균일한 피부는 그 색 그대로, 분위수를 0~1 로 두면 하나도 안 버린다", () => {
    const c = measureCheek(flat(SKIN), LM, "R", roi({ qLo: 0, qHi: 1 }))!;
    expect(c.rgb).toEqual(SKIN);
    expect(c.n).toBe(c.total);
    expect(c.dropped).toHaveLength(0);
  });

  it("M2 밝기 분위수 10~90 이면 약 80% 만 남고, 남은 것과 버려진 것의 좌표가 합쳐 전체다", () => {
    // 가로로 L* 가 고르게 변하는 그림 (x 가 커질수록 밝음)
    const im = image((x) => { const v = 120 + (x / W) * 100; return [v, v * 0.78, v * 0.64]; });
    const c = measureCheek(im, LM, "R", roi())!;
    expect(c.n / c.total).toBeGreaterThan(0.75);
    expect(c.n / c.total).toBeLessThan(0.85);
    expect(c.kept.length / 2 + c.dropped.length / 2).toBe(c.total);
  });

  it("M3 하이라이트 조각(밝은 10%)은 상한 분위수로 걸러진다 — 남은 표본에는 없다", () => {
    const HI: Rgb = [255, 245, 235];
    const im = image((x, y) => (x >= 150 && x <= 160 && y >= 200 && y <= 300 ? HI : SKIN));   // 오른쪽 끝 띠 ≈ 10%
    const c = measureCheek(im, LM, "R", roi({ qHi: 0.85 }))!;
    for (let i = 0; i < c.kept.length; i += 2) expect(c.kept[i]! >= 150 && c.kept[i]! <= 160).toBe(false);
  });

  it("M4 a* 꼬리 자르기: 붉은 점(홍조)이 남은 표본에서 빠진다", () => {
    const RED: Rgb = [225, 120, 110];
    const im = image((x, y) => (x >= 60 && x <= 80 && y >= 200 && y <= 300 ? RED : SKIN));   // 왼쪽 띠 ≈ 20%
    const keep = measureCheek(im, LM, "R", roi({ qLo: 0, qHi: 1, aCut: 0 }))!;
    const cut = measureCheek(im, LM, "R", roi({ qLo: 0, qHi: 1, aCut: 0.25 }))!;
    expect(cut.n).toBeLessThan(keep.n);
    for (let i = 0; i < cut.kept.length; i += 2) expect(cut.kept[i]! <= 80).toBe(false);
  });

  it("M5 영역을 줄이면 다각형·표본 수가 줄고 남은 표본은 안쪽에만 있다", () => {
    const full = cheekPoly(LM, "R", 1), half = cheekPoly(LM, "R", 0.5);
    const w = (p: Pt[]) => Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
    expect(w(half)).toBeCloseTo(w(full) / 2, 5);
    const c = measureCheek(flat(SKIN), LM, "R", roi({ qLo: 0, qHi: 1, area: 0.5 }))!;
    expect(c.total).toBeLessThan(measureCheek(flat(SKIN), LM, "R", roi({ qLo: 0, qHi: 1 }))!.total / 3);
    for (let i = 0; i < c.kept.length; i += 2) {
      expect(c.kept[i]!).toBeGreaterThanOrEqual(85);
      expect(c.kept[i]!).toBeLessThanOrEqual(135);
    }
  });

  it("M6 표본이 너무 적으면(볼이 화면 밖) null — 던지지 않는다", () => {
    const off = LM.map((p) => ({ x: p.x + 1000, y: p.y }));
    expect(measureCheek(flat(SKIN), off, "R", roi())).toBeNull();
    expect(() => measureFrame(flat(SKIN), off, roi())).not.toThrow();
  });

  it("M7 눈 점이 없는 합성 사진은 흰자 보정 배수가 null", () => {
    expect(measureFrame(flat(SKIN), LM, roi()).gain).toBeNull();
  });
});

describe("보정·합치기", () => {
  const frame = (r: Rgb | null, l: Rgb | null, gain: Rgb | null = null): SkinFrame => {
    const mk = (side: Side, rgb: Rgb | null) => rgb && ({ side, rgb, n: 100, total: 120, poly: [], kept: [], dropped: [], step: 2 });
    return { R: mk("R", r) ?? null, L: mk("L", l) ?? null, gain };
  };
  const A: Rgb = [220, 170, 140], B: Rgb = [200, 150, 120];

  it("G1 strength 0 이면 그대로, 1 이면 배수가 곱해진다", () => {
    expect(applyGain(A, [1.1, 1, 0.9], 0)).toEqual(A);
    const x = applyGain([100, 100, 100], [1.1, 1, 0.9], 1);
    expect(x[0]).toBeCloseTo(110, 5);
    expect(x[2]).toBeCloseTo(90, 5);
    const half = applyGain([100, 100, 100], [1.2, 1, 0.8], 0.5);
    expect(half[0]).toBeCloseTo(110, 5);
  });

  it("G2 255 를 넘기지 않는다", () => {
    expect(applyGain([250, 250, 250], [1.5, 1, 1], 1)[0]).toBe(255);
  });

  it("G3 선형에서 곱하면 sRGB 에서 곱한 것과 값이 다르다 (둘 다 흰 쪽으로 단조)", () => {
    const s = applyGain([120, 120, 120], [1.2, 1, 1], 1, false)[0];
    const l = applyGain([120, 120, 120], [1.2, 1, 1], 1, true)[0];
    expect(s).not.toBeCloseTo(l, 1);
    expect(l).toBeGreaterThan(120);
  });

  it("T1 보정을 끄면 두 볼의 평균 그대로, 켜면 gain 이 걸린다", () => {
    const f = frame(A, B, [1.1, 1, 0.9]);
    const off = skinTone(f, { ...TONE_DEFAULT, wb: false })!;
    expect(off.wbApplied).toBe(false);
    expect(off.rgb[0]).toBeCloseTo((A[0] + B[0]) / 2, 8);
    const on = skinTone(f, TONE_DEFAULT)!;
    expect(on.wbApplied).toBe(true);
    expect(on.rgb[0]).toBeCloseTo(((A[0] + B[0]) / 2) * 1.1, 8);
  });

  it("T2 gain 이 null 이면 보정을 켜 둬도 걸지 않는다 (wbApplied=false)", () => {
    const t = skinTone(frame(A, B, null), TONE_DEFAULT)!;
    expect(t.wbApplied).toBe(false);
    expect(t.rgb[1]).toBeCloseTo((A[1] + B[1]) / 2, 8);
  });

  it("T3 합치기: 어두운 쪽 / 밝은 쪽은 L* 로 고른다", () => {
    const f = frame(A, B);
    expect(skinTone(f, { ...TONE_DEFAULT, merge: "dark" })!.rgb).toEqual(B);
    expect(skinTone(f, { ...TONE_DEFAULT, merge: "bright" })!.rgb).toEqual(A);
  });

  it("T4 한쪽 볼만 잰 경우 그 볼 값, 둘 다 못 쟀으면 null", () => {
    expect(skinTone(frame(A, null), TONE_DEFAULT)!.rgb).toEqual(A);
    expect(skinTone(frame(null, null), TONE_DEFAULT)).toBeNull();
  });

  it("T5 Lab·색상각·ITA 가 rgb 와 맞는다", () => {
    const t = skinTone(frame(A, A), { ...TONE_DEFAULT, wb: false })!;
    const lab = rgbToLab(A[0], A[1], A[2]);
    expect(t.lab.L).toBeCloseTo(lab.L, 8);
    expect(t.lch.h).toBeCloseTo((Math.atan2(lab.b, lab.a) * 180) / Math.PI, 6);
  });

  it("T6 프레임 합치기: 채널별 중앙값이라 튀는 한 장에 안 끌린다", () => {
    const tones = [A, A, A, [255, 0, 0] as Rgb, A].map((c) => skinTone(frame(c, c), { ...TONE_DEFAULT, wb: false })!);
    expect(combineTones(tones)!.rgb).toEqual(A);
    expect(combineTones([])).toBeNull();
  });
});

describe("보정 후 피부 검사 (wbPlausible)", () => {
  const cheeks = (c: Rgb) => ({ R: c, L: c });

  it("P1 약한 조명 보정은 통과한다", () => {
    expect(wbPlausible(cheeks([225, 185, 165]), [0.95, 1.0, 1.06])).toBe(true);
  });

  it("P2 피부를 초록으로 만드는 보정은 거른다 (눈꺼풀을 흰자로 잘못 잡았을 때의 모양)", () => {
    expect(wbPlausible(cheeks([225, 185, 165]), [0.8, 1.1, 1.0])).toBe(false);
  });

  it("P3 피부를 파랑으로 만드는 보정은 거른다", () => {
    expect(wbPlausible(cheeks([225, 185, 165]), [0.7, 1.0, 1.5])).toBe(false);
  });

  it("P4 색상각이 범위 안이어도 변화가 너무 크면 거르고, 상한 안이면 통과한다", () => {
    expect(WB_SANITY.maxShift).toBe(18);
    expect(wbPlausible(cheeks([225, 185, 165]), [0.4, 0.4, 0.4])).toBe(false);   // 색은 그대로인데 확 어두워짐 (L* 78 → 약 36)
    expect(wbPlausible(cheeks([225, 185, 165]), [0.9, 0.9, 0.9])).toBe(true);
  });

  it("P5 볼을 못 쟀으면 판단할 피부가 없으므로 막지 않는다", () => {
    expect(wbPlausible({ R: null, L: null }, [0.5, 1, 1.6])).toBe(true);
  });

  it("P6 measureFrame: 눈 점이 없는 합성 사진은 배수가 없고 취소된 것도 아니다", () => {
    const fr = measureFrame(flat(SKIN), LM, roi());
    expect(fr.gain).toBeNull();
    expect(fr.wbRejected).toBeUndefined();
  });
});

