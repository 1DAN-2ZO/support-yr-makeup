// 개인화 가이드 — 개인화 계획(VLM + 관문)이 가이드와 채점의 정답이 된다 (결정 2026-09-25: 개인화된 얼굴이 정답)
// 계획이 없으면 지금 가이드(lookGuide = pocGuide)와 똑같아야 한다 — 개인화 전 점수가 바뀌지 않게.
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { browStandard, lookGuide, planGuide } from "@core/guides";
import { LM, dist } from "@core/landmarks";
import { lookById } from "@core/looks";
import { guideOutline } from "@core/overlay";
import { resolvePlan, type PersonalPlan } from "@core/personalize";
import type { PartId } from "@core/types";
import { unitScale } from "@core/baseline";
import type { SampleFrame } from "@core/sampling";
import { face } from "./helpers/measure-face";
import { BARE, LMS } from "./helpers/synth-face";

/** 눈썹 시험용: 홍채·콧방울이 있는 가짜 얼굴 (채점용 합성 얼굴에는 없다 — mm 를 모른다) */
const MEASURED: SampleFrame = { ...BARE, lm: face(), unit: unitScale(face()) };

const smoky = lookById("smoky").parts;
const PARTS: PartId[] = ["liner", "lip", "shadow", "cheek", "contour", "brow"];

function measure(ab = -4): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 3, heightRatio: 1 / 3 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, faceAspect: 0.85, mmPerPx: 0.5 };
}
const plan = (proposal: unknown): PersonalPlan => resolvePlan(measure(), {}, proposal);

describe("개인화 가이드 — 계획이 없을 때", () => {
  it("지금 가이드와 똑같다 (모든 부위)", () => {
    for (const p of PARTS) expect(planGuide(smoky, null)(p, BARE)).toEqual(lookGuide(smoky)(p, BARE));
  });
});

describe("개인화 가이드 — 계획이 정답을 바꾼다", () => {
  it("라이너 꼬리는 계획의 스타일", () => {
    const g = planGuide(smoky, plan({ liner: { style: "extend" } }));
    expect(g("liner", BARE)).toEqual(lookGuide(smoky, "extend")("liner", BARE));
  });

  it("섀도 범위는 계획의 배율만큼 눈썹 쪽으로 넓어진다", () => {
    const base = lookGuide(smoky)("shadow", BARE).regions!.R;
    const wide = planGuide(smoky, plan({ shadow: { range: 1.2 } }))("shadow", BARE).regions!.R;
    const n = LM.eyeA.upper.length;               // 영역 = 눈꺼풀 n 점 + 위 테두리 n 점(거꾸로)
    const lid = base[0]!;
    const topOf = (r: readonly { x: number; y: number }[]) => r[r.length - 1]!;   // 눈꺼풀 첫 점의 위 테두리
    expect(wide.slice(0, n)).toEqual(base.slice(0, n));
    expect(dist(lid, topOf(wide))).toBeCloseTo(dist(lid, topOf(base)) * 1.2, 6);
  });

  it("눈썹은 표준 눈썹(얼굴형 조정 포함)이 정답 영역", () => {
    const p = plan({ faceShape: { label: "round" } });
    const g = planGuide(smoky, p)("brow", MEASURED);
    const std = browStandard(MEASURED, p.brow)!;
    expect(g.regions).toEqual({ R: std.R.outline, L: std.L.outline });
  });

  it("mm 를 모르면(홍채가 없음) 눈썹 정답 영역을 내지 않는다 — 채점은 지금처럼 랜드마크 눈썹", () => {
    expect(planGuide(smoky, plan({}))("brow", BARE)).toEqual({});
  });

  it("입술·볼·쉐딩은 아직 계획이 바꾸지 않는다", () => {
    const g = planGuide(smoky, plan({ shadow: { range: 1.2 } }));
    for (const p of ["lip", "cheek", "contour"] as PartId[]) expect(g(p, BARE)).toEqual(lookGuide(smoky)(p, BARE));
  });
});

describe("결과 화면 테두리 — 눈썹", () => {
  it("가이드가 눈썹 영역을 주면 그 영역을 그린다 (개인화 정답)", () => {
    const g = planGuide(smoky, plan({}))("brow", MEASURED);
    expect(guideOutline("brow", MEASURED.lm, g).polys).toEqual([[...g.regions!.R], [...g.regions!.L]]);
  });

  it("안 주면 지금처럼 랜드마크 윤곽", () => {
    expect(guideOutline("brow", LMS, {}).polys.map((p) => p.length)).toEqual([10, 10]);
  });
});
