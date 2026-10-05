// 블러셔·섀도우·쉐딩은 테두리를 꽉 채우는 게 아니라 진한 곳에서 퍼지게 칠한다 (2026-10-05 사용자).
// 화면 3·4: 테두리는 그대로 두고, 안에 시작점(점) + 퍼지는 방향(화살표). 선만 — 면 채우기 없음(정의서 F-07). 화면 5 는 안 그린다(정의서 5-1)
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import { lookGuide } from "@core/guides";
import { LM } from "@core/landmarks";
import { outlineOf } from "@core/live-run";
import { lookById } from "@core/looks";
import { guideOutline } from "@core/overlay";
import { planGuide } from "@core/personal-guide";
import { spreadMarks } from "@core/spread-marks";
import type { Pt } from "@core/types";
import { BARE, LMS } from "./helpers/synth-face";

const G = lookGuide({});
const d = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
/** 점이 들어 있는 다각형 */
const owner = (polys: readonly (readonly Pt[])[], p: Pt) => polys.find((q) => pointInPoly(p.x, p.y, q));

describe("퍼지는 방향 표시 (spreadMarks)", () => {
  it("S1 블러셔: 좌우 타원마다 가운데 점 하나 + 네 방향 화살표 — 점에서 바깥으로, 테두리 안에서 끝난다", () => {
    const polys = outlineOf("cheek", LMS, G).polys, m = spreadMarks("cheek", polys);
    expect(m.dots).toHaveLength(2);
    expect(m.arrows).toHaveLength(8);
    for (const poly of polys) {
      const dot = m.dots.find((p) => pointInPoly(p.x, p.y, poly))!;
      expect(dot).toBeDefined();
      const r = Math.max(...poly.map((p) => d(p, mean(poly))));
      expect(d(dot, mean(poly)), "점 = 타원 가운데").toBeLessThan(0.03 * r);
      const mine = m.arrows.filter(([a]) => pointInPoly(a!.x, a!.y, poly));
      expect(mine).toHaveLength(4);
      for (const [a, b] of mine) {
        expect(pointInPoly(b!.x, b!.y, poly), "화살표 끝이 테두리 안").toBe(true);
        expect(d(b!, dot), "점에서 바깥으로").toBeGreaterThan(d(a!, dot));
        expect(d(a!, b!), "충분히 길게").toBeGreaterThan(0.25 * Math.min(...poly.map((p) => d(p, dot))));
      }
    }
  });

  it("S2 섀도우: 눈마다 속눈썹 선 가운데에 점 하나 + 눈썹 쪽으로 퍼지는 화살표 셋 (완성본 그러데이션 방향) — 꼬리 있는 화장도", () => {
    for (const guide of [G, planGuide(lookById("chic").parts, null)]) {
      const polys = outlineOf("shadow", LMS, guide).polys, m = spreadMarks("shadow", polys);
      expect(m.dots).toHaveLength(2);
      expect(m.arrows).toHaveLength(6);
      for (const [poly, eye] of [[polys[0]!, LM.eyeA], [polys[1]!, LM.eyeB]] as const) {
        const n = eye.upper.length, lidMid = poly[Math.floor(n / 2)]!, topMid = poly[2 * n - 1 - Math.floor(n / 2)]!;
        const dot = m.dots.find((p) => pointInPoly(p.x, p.y, poly))!;
        expect(dot).toBeDefined();
        expect(d(dot, lidMid), "점은 속눈썹 쪽").toBeLessThan(d(dot, topMid));
        const mine = m.arrows.filter(([a]) => owner(polys, a!) === poly);
        expect(mine).toHaveLength(3);
        for (const [a, b] of mine) {
          expect(pointInPoly(b!.x, b!.y, poly), "화살표 끝이 테두리 안").toBe(true);
          expect(b!.y, "위(눈썹 쪽)로").toBeLessThan(a!.y);
        }
      }
    }
  });

  it("S3 쉐딩·하이라이트: 띠마다 가운데 점 + 띠 긴 쪽 양 끝으로 화살표, 전부 그 띠 안", () => {
    const polys = outlineOf("contour", LMS, G).polys, m = spreadMarks("contour", polys);
    expect(polys.length).toBeGreaterThan(0);
    expect(m.dots).toHaveLength(polys.length);
    for (const poly of polys) {
      const dot = m.dots.find((p) => pointInPoly(p.x, p.y, poly));
      expect(dot, "띠마다 점").toBeDefined();
      const mine = m.arrows.filter(([a]) => pointInPoly(a!.x, a!.y, poly));
      expect(mine.length).toBeGreaterThanOrEqual(2);
      for (const [a, b] of mine) {
        expect(pointInPoly(b!.x, b!.y, poly)).toBe(true);
        expect(d(b!, dot!)).toBeGreaterThan(d(a!, dot!));
      }
    }
  });

  it("S4 눈썹·라이너·입술은 표시 없음 — 선을 따라 그리는 부위", () => {
    for (const part of ["brow", "liner", "lip"] as const) {
      expect(spreadMarks(part, outlineOf(part, LMS, G).polys)).toEqual({ dots: [], arrows: [] });
    }
  });

  it("S5 화면 3·4 테두리(outlineOf)에만 붙고, 화면 5 결과 테두리(guideOutline)에는 없다 — 정의서 5-1", () => {
    for (const part of ["cheek", "shadow", "contour"] as const) {
      const o = outlineOf(part, LMS, G);
      expect(o.dots!.length, part).toBeGreaterThan(0);
      expect(o.arrows!.length, part).toBeGreaterThan(0);
      const r = guideOutline(part, LMS, G(part, BARE));
      expect(r.dots ?? [], part).toEqual([]);
      expect(r.arrows ?? [], part).toEqual([]);
    }
  });
});
