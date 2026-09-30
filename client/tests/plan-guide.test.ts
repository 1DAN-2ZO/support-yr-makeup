// 개인화 가이드 — 개인화 계획(VLM + 관문)이 가이드와 채점의 정답이 된다 (결정 2026-09-25: 개인화된 얼굴이 정답)
// 계획이 없으면 지금 가이드(lookGuide = pocGuide)와 똑같아야 한다 — 개인화 전 점수가 바뀌지 않게.
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { GUIDE_PARAMS, lookGuide } from "@core/guides";
import { browOnFace, lipOutline, planGuide, styledGuide } from "@core/personal-guide";
import { contourOutline } from "@core/contour";
import { LM, dist } from "@core/landmarks";
import { lookById } from "@core/looks";
import { guideOutline } from "@core/overlay";
import { resolvePlan, type PersonalPlan } from "@core/personalize";
import type { PartId } from "@core/types";
import { unitScale } from "@core/baseline";
import type { SampleFrame } from "@core/sampling";
import { face } from "./helpers/measure-face";
import { BARE, LMS } from "./helpers/synth-face";

/** 눈썹 시험용: 동공·콧방울이 있는 가짜 얼굴 (채점용 합성 얼굴에는 없다 — mm 를 모른다) */
const MEASURED: SampleFrame = { ...BARE, lm: face(), unit: unitScale(face()) };

const edgy = lookById("edgy").parts;
const PARTS: PartId[] = ["liner", "lip", "shadow", "cheek", "contour", "brow"];

function measure(ab = -4): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 3, heightRatio: 1 / 3, lidGapRatio: 0.55 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, lip: { upperLowerRatio: 0.8, heightWidthRatio: 0.4 }, faceAspect: 0.85, mmPerPx: 0.5 };
}
const plan = (proposal: unknown): PersonalPlan => resolvePlan(measure(), {}, proposal);
/** 윗입술이 얇은 얼굴(윗:아래 0.7) — 오버라인 제안이 받아들여진다 */
const thinLipPlan = (proposal: unknown): PersonalPlan => resolvePlan({ ...measure(), lip: { upperLowerRatio: 0.7, heightWidthRatio: 0.4 } }, {}, proposal);

describe("개인화 가이드 — 계획이 없을 때", () => {
  it("지금 가이드와 똑같다 (모든 부위)", () => {
    for (const p of PARTS) expect(planGuide(edgy, null)(p, BARE)).toEqual(lookGuide(edgy)(p, BARE));
  });
});

describe("개인화 가이드 — 계획이 정답을 바꾼다", () => {
  it("라이너 꼬리는 계획의 스타일", () => {
    const g = planGuide(edgy, plan({ liner: { style: "extend" } }));
    expect(g("liner", BARE)).toEqual(styledGuide(edgy, "extend")("liner", BARE));
  });

  it("섀도 범위는 계획의 배율만큼 눈썹 쪽으로 넓어진다", () => {
    const base = lookGuide(edgy)("shadow", BARE).regions!.R;
    const wide = planGuide(edgy, plan({ shadow: { range: 1.2 } }))("shadow", BARE).regions!.R;
    const n = LM.eyeA.upper.length;               // 영역 = 눈꺼풀 n 점 + 위 테두리 n 점(거꾸로)
    const lid = base[0]!;
    const topOf = (r: readonly { x: number; y: number }[]) => r[r.length - 1]!;   // 눈꺼풀 첫 점의 위 테두리
    expect(wide.slice(0, n)).toEqual(base.slice(0, n));
    expect(dist(lid, topOf(wide))).toBeCloseTo(dist(lid, topOf(base)) * 1.2, 6);
  });

  it("눈썹은 표준 눈썹(얼굴형 조정 포함)을 실제 눈썹 높이에 맞춘 것이 정답 영역 (폰 시험 2026-09-30)", () => {
    const p = plan({ faceShape: { label: "round" } });
    const g = planGuide(edgy, p)("brow", MEASURED);
    const std = browOnFace(MEASURED, p.brow)!;
    expect(g.regions).toEqual({ R: std.R.outline, L: std.L.outline });
  });

  it("mm 를 모르면(동공 점이 없음) 눈썹 정답 영역을 내지 않는다 — 채점은 지금처럼 랜드마크 눈썹", () => {
    expect(planGuide(edgy, plan({}))("brow", BARE)).toEqual({});
  });

  it("계획이 기본값이면 입술·볼은 지금 가이드 그대로", () => {
    const g = planGuide(edgy, plan({}));
    for (const p of ["lip", "cheek"] as PartId[]) expect(g(p, BARE)).toEqual(lookGuide(edgy)(p, BARE));
  });

  it("쉐딩·하이라이트: 계획의 얼굴형 규칙 밴드 (모르면 계란형), T존은 계획대로", () => {
    const round = plan({ faceShape: { label: "round" }, highlight: { tZone: false } });
    expect(planGuide(edgy, round)("contour", BARE).contour).toEqual(contourOutline(BARE.lm, "round", { tZone: false }));
    expect(planGuide(edgy, plan({}))("contour", BARE).contour).toEqual(contourOutline(BARE.lm, "oval", { tZone: true }));
  });

  it("볼: 위치 higher 는 얼굴 폭 × 0.03 위로, 크기는 타원 크기 배율", () => {
    const c = (r: readonly { x: number; y: number }[]) => ({ x: r.reduce((a, q) => a + q.x, 0) / r.length, y: r.reduce((a, q) => a + q.y, 0) / r.length });
    const base = lookGuide(edgy)("cheek", BARE).regions!.R;
    const g = planGuide(edgy, plan({ blush: { position: "higher", size: 1.2 } }))("cheek", BARE).regions!.R;
    expect(c(g).y).toBeCloseTo(c(base).y - 0.03 * BARE.unit.face, 6);
    expect(c(g).x).toBeCloseTo(c(base).x, 6);
    const w = (r: readonly { x: number }[]) => Math.max(...r.map((q) => q.x)) - Math.min(...r.map((q) => q.x));
    expect(w(g)).toBeCloseTo(w(base) * 1.2, 6);
  });

  it("라이너: 두께에 계획의 배율을 곱한다", () => {
    const g = planGuide(edgy, plan({ linerThick: { scale: 0.9 } }))("liner", BARE);
    expect(g.liner!.thick).toBeCloseTo(edgy.liner!.thick! * 0.9, 9);
  });

  it("입술: 오버라인이 있으면 가이드가 그 양을 넘긴다", () => {
    const g = planGuide(edgy, thinLipPlan({ lip: { overline: 0.2 } }))("lip", BARE);
    expect(g.lip).toEqual({ offset: GUIDE_PARAMS.lip.offset, upperOverline: 0.2 });
  });
});

describe("결과 화면 테두리 — 눈썹", () => {
  it("가이드가 눈썹 영역을 주면 그 영역을 그린다 (개인화 정답)", () => {
    const g = planGuide(edgy, plan({}))("brow", MEASURED);
    expect(guideOutline("brow", MEASURED.lm, g).polys).toEqual([[...g.regions!.R], [...g.regions!.L]]);
  });

  it("안 주면 지금처럼 랜드마크 윤곽", () => {
    expect(guideOutline("brow", LMS, {}).polys.map((p) => p.length)).toEqual([10, 10]);
  });
});

describe("입술 윤곽 — 오버라인", () => {
  const up = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  it("윗입술 가운데(0)는 윗입술 두께 × 오버라인만큼 올라가고, 입꼬리는 그대로", () => {
    const lm = MEASURED.lm;
    const o = lipOutline(lm, 0.2);
    const i0 = LM.lipsOuter.indexOf(0), i61 = LM.lipsOuter.indexOf(61), i291 = LM.lipsOuter.indexOf(291);
    expect(o[i0]!.y).toBeCloseTo(lm[0]!.y - 0.2 * up(lm[0]!, lm[13]!), 6);
    expect(o[i61]).toEqual(lm[61]);
    expect(o[i291]).toEqual(lm[291]);
  });

  it("아랫입술 점은 움직이지 않는다", () => {
    const lm = MEASURED.lm, o = lipOutline(lm, 0.2);
    expect(o[LM.lipsOuter.indexOf(17)]).toEqual(lm[17]);
  });

  it("결과 화면 테두리도 오버라인한 입술선을 그린다", () => {
    const g = planGuide(edgy, thinLipPlan({ lip: { overline: 0.2 } }))("lip", MEASURED);
    expect(guideOutline("lip", MEASURED.lm, g).polys[0]).toEqual(lipOutline(MEASURED.lm, 0.2));
  });
});
