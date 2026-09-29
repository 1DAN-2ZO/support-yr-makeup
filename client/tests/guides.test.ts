// ② 가이드 기하 (2-1, #21) 검증
// 채점이 받는 값(PartGeometry)은 임시 guide-poc.ts 와 같아야 한다 — 갈아끼워도 점수가 안 바뀌게.
// 새로 더하는 것은 화면에 그릴 라이너 두께 윤곽.
import { describe, expect, it } from "vitest";
import { GUIDE_PARAMS, linerOutline, lookGuide } from "@core/guides";
import { pocGuide } from "@core/guide-poc";
import { LM, dist } from "@core/landmarks";
import { lookById } from "@core/looks";
import { scorePart } from "@core/score-part";
import type { PartId, Pt } from "@core/types";
import { BARE, LMS, linerPaint, lipPaint, made, regionPaint, BLUSH } from "./helpers/synth-face";

const daily = lookById("daily").parts;
const smoky = lookById("smoky").parts;
const PARTS: PartId[] = ["liner", "lip", "shadow", "cheek", "contour", "brow"];

/** 신발끈 공식 넓이 */
const area = (poly: readonly Pt[]): number => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

describe("guides — 채점에 주는 값", () => {
  it("G1 라이너 두께는 고른 룩에서 온다", () => {
    expect(lookGuide(daily)("liner", BARE).liner!.thick).toBe(0.03);
    expect(lookGuide(smoky)("liner", BARE).liner!.thick).toBe(0.052);
  });

  it("G2 룩에 두께가 없으면 기본값 — 룩이 빈 평가 문항", () => {
    expect(lookGuide()("liner", BARE).liner!.thick).toBe(GUIDE_PARAMS.liner.thick);
    expect(lookGuide({ liner: {} })("liner", BARE).liner!.thick).toBe(GUIDE_PARAMS.liner.thick);
  });

  it("G3 임시 guide-poc 와 같은 값을 낸다 — 갈아끼워도 채점이 안 바뀐다", () => {
    for (const parts of [daily, smoky, {}]) {
      for (const p of PARTS) expect(lookGuide(parts)(p, BARE)).toEqual(pocGuide(parts)(p, BARE));
    }
  });

  it("G4 R 은 이미지 왼쪽 눈(eyeA) — 진단 문구 '오른쪽 꼬리' 가 여기 묶여 있다", () => {
    const w = lookGuide(daily)("liner", BARE).liner!.wing;
    expect(w.R[0]).toEqual(LMS[LM.eyeA.outer]);
    expect(w.L[0]).toEqual(LMS[LM.eyeB.outer]);
    expect(w.R[0].x).toBeLessThan(w.L[0].x);
  });

  it("G5 꼬리는 눈 폭의 0.15, 눈 축에서 30° 위로", () => {
    const w = lookGuide(daily)("liner", BARE).liner!.wing.R;
    const len = dist(w[0], w[1]);
    expect(len / BARE.unit.eye).toBeCloseTo(GUIDE_PARAMS.liner.wing, 6);
    const axis = { x: LMS[LM.eyeA.outer]!.x - LMS[LM.eyeA.inner]!.x, y: LMS[LM.eyeA.outer]!.y - LMS[LM.eyeA.inner]!.y };
    const tail = { x: w[1].x - w[0].x, y: w[1].y - w[0].y };
    const cos = (axis.x * tail.x + axis.y * tail.y) / (Math.hypot(axis.x, axis.y) * Math.hypot(tail.x, tail.y));
    expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(GUIDE_PARAMS.liner.wingAngle, 4);
    expect(w[1].y).toBeLessThan(w[0].y);   // 화면 위쪽
  });

  it("G6 채점이 그대로 받는다 — 부위마다 던지지 않고 결과가 나온다", () => {
    const g = lookGuide(daily);
    expect(() => scorePart("liner", BARE, made(linerPaint()), g)).not.toThrow();
    expect(() => scorePart("lip", BARE, made(lipPaint), g)).not.toThrow();
    expect(() => scorePart("shadow", BARE, made(regionPaint("shadow", BLUSH)), g)).not.toThrow();
    expect(() => scorePart("cheek", BARE, made(regionPaint("cheek", BLUSH)), g)).not.toThrow();
    expect(() => scorePart("contour", BARE, BARE, g)).not.toThrow();
  });
});

describe("guides — 화면에 그릴 라이너 두께 윤곽", () => {
  it("G7 아래 테두리는 속눈썹 선 그대로다", () => {
    const o = linerOutline(BARE, 0.045);
    const lid = LM.eyeA.upper.map((i) => LMS[i]!);
    for (const p of lid) expect(o.R).toContainEqual(p);
  });

  it("G8 위 테두리는 속눈썹 선에서 화면 위쪽으로 두께만큼 떨어져 있다", () => {
    const thick = 0.045, o = linerOutline(BARE, thick).R;
    const n = LM.eyeA.upper.length;
    const bottom = o.slice(0, n), top = o.slice(n + 1).reverse();   // [속눈썹 선 …, 꼬리 끝, 위 테두리 …]
    expect(top).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      expect(dist(bottom[i]!, top[i]!) / BARE.unit.eye).toBeCloseTo(thick, 6);
      expect(top[i]!.y).toBeLessThan(bottom[i]!.y);
    }
  });

  it("G9 꼬리 끝이 윤곽에 들어 있다 — 채점의 꼬리 선과 같은 점", () => {
    const tip = lookGuide(daily)("liner", BARE).liner!.wing.R[1];
    expect(linerOutline(BARE, 0.03).R).toContainEqual(tip);
  });

  it("G10 두꺼운 룩일수록 윤곽이 넓다", () => {
    expect(area(linerOutline(BARE, 0.052).R)).toBeGreaterThan(area(linerOutline(BARE, 0.03).R));
  });

  it("G11 양쪽 눈 다 만든다", () => {
    const o = linerOutline(BARE, 0.045);
    expect(o.L).toContainEqual(LMS[LM.eyeB.outer]);
  });

  it("G12 꼬리 선을 넘겨받으면 그 끝을 쓴다 — 개인화 가이드의 꼬리 모양을 윤곽이 따른다", () => {
    const tipR = { x: 150, y: 200 }, tipL = { x: 450, y: 200 };
    const o = linerOutline(BARE, 0.045, { R: [LMS[LM.eyeA.outer]!, tipR], L: [LMS[LM.eyeB.outer]!, tipL] });
    expect(o.R).toContainEqual(tipR);
    expect(o.L).toContainEqual(tipL);
    expect(o.R).not.toContainEqual(lookGuide()("liner", BARE).liner!.wing.R[1]);
  });
});
