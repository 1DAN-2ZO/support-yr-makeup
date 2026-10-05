// 섀도 눈꼬리 연장 (#30) — 꼬리 있는 화장(시크·아이돌·스트릿·키치)은 화면 3·4 테두리에도 꼬리를 그린다.
// 꼬리는 칠하기(2-b · 화면 3 완성본, makeup-paint)와 같은 계산(shadowTail). 채점 영역(regions)도 꼬리까지 — 테두리와 같은 모양 (#284 ⑥ 결정)
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { LM, dist } from "@core/landmarks";
import { outlineOf } from "@core/live-run";
import { LOOKS, lookById, type Look } from "@core/looks";
import { guideOutline } from "@core/overlay";
import { SHADOW_TAIL_RATIO, planGuide } from "@core/personal-guide";
import { resolvePlan, type PersonalPlan } from "@core/personalize";
import type { Pt } from "@core/types";
import { paintLookOf, paintMakeup, type Layers } from "@screens/makeup-paint";
import { pointInPoly } from "@core/color";
import { frameOf } from "@core/sampling";
import { scorePart } from "@core/score-part";
import { BARE, LMS, SHADE, image } from "./helpers/synth-face";

function measure(): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8, alphaDeg: 28, betaDeg: 32, outerCornerDown: false, aspect: 3, heightRatio: 1 / 3, lidGapRatio: 0.55 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, lip: { upperLowerRatio: 0.8, heightWidthRatio: 0.4 }, faceAspect: 0.85, mmPerPx: 0.5 };
}
const plan = (proposal: unknown = {}): PersonalPlan => resolvePlan(measure(), {}, proposal);
const noTail = (look: Look): Look => ({ ...look, parts: { ...look.parts, shadow: { ...look.parts.shadow!, tailExtend: false } } });

describe("섀도 꼬리 테두리 (#30)", () => {
  it("T1 꼬리 있는 화장만 섀도 채점 영역(regions) 끝에 꼬리 두 점이 붙는다 — 앞부분은 꼬리 없는 영역 그대로", () => {
    const p = plan();
    const tails = LOOKS.filter((l) => l.parts.shadow?.tailExtend).map((l) => l.id);
    expect(tails).toEqual(expect.arrayContaining(["chic", "idol", "street", "kitsch"]));
    for (const l of LOOKS) {
      const g = planGuide(l.parts, p)("shadow", BARE), plain = planGuide(noTail(l).parts, p)("shadow", BARE);
      for (const s of ["R", "L"] as const) {
        expect(g.regions![s].length - plain.regions![s].length, `${l.id} ${s}`).toBe(l.parts.shadow?.tailExtend ? 2 : 0);
        expect(g.regions![s].slice(0, plain.regions![s].length)).toEqual(plain.regions![s]);
      }
    }
  });

  it("T2 꼬리 끝은 눈꼬리에서 바깥으로 눈 폭 × 0.35 — 계획이 없어도 붙는다", () => {
    const chic = lookById("chic");
    for (const p of [plan(), null]) {
      const g = planGuide(chic.parts, p)("shadow", BARE);
      for (const [s, eye] of [["R", LM.eyeA], ["L", LM.eyeB]] as const) {
        const outer = LMS[eye.outer]!, inner = LMS[eye.inner]!, tip = g.regions![s].at(-1)!;
        expect(dist(outer, tip)).toBeCloseTo(SHADOW_TAIL_RATIO * BARE.unit.eye, 6);
        expect(dist(inner, tip)).toBeGreaterThan(dist(inner, outer));
      }
    }
  });

  it("T3 화면 3·4 테두리 = 채점 영역 그대로 (꼬리까지 한 모양) — 테두리대로 칠한 곳을 채점이 본다", () => {
    const g = planGuide(lookById("idol").parts, plan());
    const geo = g("shadow", BARE);
    const want = [[...geo.regions!.R], [...geo.regions!.L]];
    expect(guideOutline("shadow", LMS, geo).polys).toEqual(want);
    expect(outlineOf("shadow", LMS, g).polys).toEqual(want);
    // 꼬리 없는 화장은 전과 같다
    const plain = planGuide(lookById("daily").parts, plan())("shadow", BARE);
    expect(guideOutline("shadow", LMS, plain).polys).toEqual([[...plain.regions!.R], [...plain.regions!.L]]);
  });

  it("T4 칠하는 섀도 띠(2-b · 화면 3 완성본)와 테두리가 같은 모양 — 계획의 범위·라이너 두께·꼬리 스타일까지", () => {
    for (const id of ["chic", "street"]) {
      const look = lookById(id);
      const p = plan({ shadow: { range: 1.2 }, liner: { style: "extend" }, linerThick: { scale: 1.2 } });
      const outline = guideOutline("shadow", LMS, planGuide(look.parts, p)("shadow", BARE)).polys;
      const painted = paintedPaths(look, p);
      for (const poly of outline) {
        const hit = painted.find((q) => q.length === poly.length && q.every((pt, i) => Math.abs(pt.x - poly[i]!.x) < 1e-9 && Math.abs(pt.y - poly[i]!.y) < 1e-9));
        expect(hit, `${id} 칠한 띠 중에 테두리와 같은 것`).toBeDefined();
      }
    }
  });
});

describe("섀도 꼬리 채점 (#284 ⑥ 결정)", () => {
  it("T5 꼬리 자리만 칠하면 꼬리 있는 화장은 채점이 그 색을 본다 — 꼬리를 뺀 영역으로 재면 둘레 맨살 띠에 들어가 거의 안 보인다", () => {
    const p = plan(), chic = lookById("chic");
    const tailed = planGuide(chic.parts, p), plain = planGuide(noTail(chic).parts, p);
    const t = tailed("shadow", BARE).regions!, o = plain("shadow", BARE).regions!;
    // 꼬리 영역 = 꼬리까지 한 모양 안이면서 꼬리 없는 모양 밖
    const im = image((x, y) => (["R", "L"] as const).some((s) => pointInPoly(x, y, t[s]) && !pointInPoly(x, y, o[s])) ? SHADE : null);
    const delta = (g: typeof tailed) => scorePart("shadow", BARE, frameOf(im, LMS), g).result.metrics.deltas as Record<"R" | "L", number>;
    const withTail = delta(tailed), without = delta(plain);
    for (const s of ["R", "L"] as const) {
      expect(withTail[s], s).toBeGreaterThan(1);
      expect(withTail[s], s).toBeGreaterThan(without[s]! + 1);
    }
  });
});

/** 칠하면서 그린 경로들 (moveTo 부터 다음 moveTo 전까지) — 섀도 띠가 이 중에 있다 */
function paintedPaths(look: Look, p: PersonalPlan): Pt[][] {
  const paths: Pt[][] = [];
  const rec = new Proxy({ filter: "none" } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "moveTo") return (x: number, y: number) => { paths.push([{ x, y }]); };
      if (k === "lineTo") return (x: number, y: number) => { paths.at(-1)?.push({ x, y }); };
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return () => {};
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  const quiet = new Proxy({} as Record<string, unknown>, { get: (_t, k: string) => (k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: () => {} }) : () => {}) }) as unknown as CanvasRenderingContext2D;
  const off = { width: 600, height: 600, getContext: () => rec } as unknown as HTMLCanvasElement;
  const layers: Layers = { mul: quiet, col: quiet, light: quiet };
  paintMakeup(layers, off, LMS, paintLookOf(look), p, p.liner.plan.style);
  return paths;
}
