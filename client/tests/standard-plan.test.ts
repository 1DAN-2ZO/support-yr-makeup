// 표준 계획 (2026-10-05) — 얼굴을 재서 화장 모양을 바꾸지 않는다. 모두 같은 계획을 받는다.
// 얼굴에 맞추는 일(자리 · 크기)은 얼굴 점이 이미 한다 — 그 위에 모양까지 바꾸던 규칙(처진 눈 꼬리 · 섀도 높이 · 오버라인)을 뺐다.
// 표준 = 그 규칙이 "바꿀 것 없음" 으로 본 얼굴이 받던 계획 그대로 (대부분의 얼굴이 받던 것)
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { LOOKS } from "@core/looks";
import { planGuide } from "@core/personal-guide";
import { DROOP_TILT_DEG, FACESHAPE_TRUST, PLAN_RULES, resolvePlan, standardPlan } from "@core/personalize";
import { PART_IDS } from "@core/types";
import { BARE } from "./helpers/synth-face";

function measure(o: { tilt?: number; gap?: number; lip?: number } = {}): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: o.tilt ?? 8, alphaDeg: 28, betaDeg: 32, outerCornerDown: false, aspect: 3, heightRatio: 1 / 3, lidGapRatio: o.gap ?? PLAN_RULES.lidGapStd });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, lip: { upperLowerRatio: o.lip ?? PLAN_RULES.lipTarget, heightWidthRatio: 0.4 }, faceAspect: 0.85, mmPerPx: 0.5 };
}

describe("표준 계획", () => {
  it("SP1 모양을 바꾸는 값이 하나도 없다 — 위로 올리는 꼬리 · 배율 1 · 오버라인 0 · 볼 표준 · 근거 문장 없음", () => {
    const p = standardPlan();
    expect(p.liner).toEqual({ plan: { style: "winged", reason: "not_down" }, source: "rule" });
    expect(p.linerThick.scale).toBe(1);
    expect(p.shadow.range).toBe(1);
    expect(p.lip.overline).toBe(0);
    expect(p.blush).toMatchObject({ position: "standard", size: 1 });
    expect(p.highlight.tZone).toBe(true);
    expect(p.brow).toMatchObject({ heightMm: 0, glabellaMm: 0, arch: "standard" });
    expect(p.intensity).toEqual({});
    expect(p.rationale).toEqual({});
    expect(p.rejected).toEqual([]);
    expect(p.faceShape).toBeNull();
  });

  it("SP2 규칙이 '바꿀 것 없음' 으로 본 얼굴이 받던 계획과 같다 — 대부분의 얼굴은 테두리 · 채점 기준이 그대로", () => {
    expect(standardPlan()).toEqual(resolvePlan(measure()));
    const std = standardPlan(), rule = resolvePlan(measure());
    for (const look of LOOKS) for (const part of PART_IDS) {
      expect(planGuide(look.parts, std)(part, BARE), `${look.id} ${part}`).toEqual(planGuide(look.parts, rule)(part, BARE));
    }
  });

  it("SP3 처진 눈 · 좁은 눈두덩 · 얇은 윗입술이어도 같은 계획 — 규칙 계획은 이 얼굴들에서 달랐다", () => {
    const droop = resolvePlan(measure({ tilt: DROOP_TILT_DEG - 2 }));
    const narrow = resolvePlan(measure({ gap: PLAN_RULES.lidGapStd * 0.7 }));
    const thin = resolvePlan(measure({ lip: PLAN_RULES.lipTarget * 0.6 }));
    expect(droop.liner.plan.style).toBe("extend");
    expect(narrow.shadow.range).toBeLessThan(1);
    expect(thin.lip.overline).toBeGreaterThan(0);
    // 표준 계획은 얼굴을 재지 않는다 — 넘길 측정값 자체가 없다
    expect(standardPlan.length).toBeLessThanOrEqual(1);
    const p = standardPlan();
    expect([p.liner.plan.style, p.shadow.range, p.lip.overline]).toEqual(["winged", 1, 0]);
  });

  it("SP4 얼굴형은 화장 모양 규칙이 아니라 쉐딩 자리(F-04)라 그대로 — ⑤ 모델이 확신할 때만 쓴다", () => {
    const sure = standardPlan({ label: "round", confidence: FACESHAPE_TRUST, method: "model", version: "t" });
    expect(sure.faceShape).toBe("round");
    expect(sure.brow.faceShape).toBe("round");
    expect(standardPlan({ label: "round", confidence: FACESHAPE_TRUST - 0.01, method: "model", version: "t" }).faceShape).toBeNull();
    expect(standardPlan({ label: "round", confidence: 1, method: "rule", version: "t" }).faceShape).toBeNull();
    expect(standardPlan(null).faceShape).toBeNull();
    // 규칙 계획과 같은 판단
    expect(sure).toEqual(resolvePlan(measure(), { faceShape: { label: "round", confidence: FACESHAPE_TRUST, method: "model", version: "t" } }));
  });
});
