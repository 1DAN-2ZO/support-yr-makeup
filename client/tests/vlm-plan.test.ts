// 개인화 계획 — VLM 제안 전체(라이너·얼굴형·눈썹·섀도·진하기·근거 문장)를 측정·규칙으로 거르는 관문
// VLM 출력은 믿지 않는 JSON 이다. 모양이 틀리거나 측정과 모순되면 그 항목만 규칙값으로 되돌린다.
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { BROW_ADJUST_SCALE, JKSC_BROW_ADJUST_MM, PLAN_RULES, resolvePlan } from "@core/personalize";
import type { FaceShape } from "@core/types";

function measure(ab = -4, o: { lidGap?: number; lipRatio?: number | null } = {}): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 3, heightRatio: 1 / 3, lidGapRatio: o.lidGap ?? 0.55 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, lip: { upperLowerRatio: o.lipRatio === undefined ? 0.8 : o.lipRatio, heightWidthRatio: 0.4 }, faceAspect: 0.85, mmPerPx: 0.5 };
}
const model = (label: FaceShape["label"], confidence = 0.9): FaceShape => ({ label, confidence, method: "model", version: "t" });

describe("개인화 계획 — 제안이 없을 때", () => {
  it("전부 규칙값: 라이너는 측정 규칙, 얼굴형을 모르면 눈썹 조정 없음, 섀도·진하기는 기본", () => {
    const p = resolvePlan(measure());
    expect(p.liner.plan.style).toBe("winged");
    expect(p.brow).toEqual({ faceShape: null, source: "rule", heightMm: 0, glabellaMm: 0, arch: "standard" });
    expect(p.shadow).toEqual({ range: 1, source: "rule" });
    expect(p.intensity).toEqual({});
    expect(p.rationale).toEqual({});
    expect(p.rejected).toEqual([]);
  });

  it("얼굴형으로 눈썹을 옮기지 않는다 — 표준 눈썹만 (#166: JKSC 와 Morikawa 가 방향이 부딪힌다)", () => {
    expect(BROW_ADJUST_SCALE).toBe(0);
    expect(JKSC_BROW_ADJUST_MM).toEqual({ oblong: { height: -4, glabella: -4 }, heart: { height: 0, glabella: 0 }, square: { height: 0, glabella: 0 }, oval: { height: 4, glabella: -4 }, round: { height: 4, glabella: -4 } });
    const p = resolvePlan(measure(), { faceShape: model("round") });
    expect(p.brow).toMatchObject({ faceShape: "round", source: "rule", heightMm: 0, glabellaMm: 0 });
  });

  it("굽기도 표준 그대로 — 얼굴형과 상관없이 standard", () => {
    for (const s of ["round", "oblong", "square"] as const) expect(resolvePlan(measure(), { faceShape: model(s) }).brow.arch).toBe("standard");
  });
});

describe("개인화 계획 — VLM 제안 받기", () => {
  it("모양이 맞고 측정과 모순이 없으면 받는다", () => {
    const p = resolvePlan(measure(), {}, {
      liner: { style: "extend" },
      faceShape: { label: "oblong" },
      brow: { arch: "flatter" },
      shadow: { range: 1.1 },
      intensity: { lip: 0.8, cheek: 1.2 },
      rationale: { liner: "눈꼬리가 올라간 눈이라 꼬리를 곧게 뺐어요" },
    });
    expect(p.liner.source).toBe("vlm");
    expect(p.brow).toMatchObject({ faceShape: "oblong", source: "vlm", heightMm: 0, glabellaMm: 0, arch: "standard" });
    expect(p.shadow).toEqual({ range: 1.1, source: "vlm" });
    expect(p.intensity).toEqual({ lip: 0.8, cheek: 1.2 });
    expect(p.rationale.liner).toBe("눈꼬리가 올라간 눈이라 꼬리를 곧게 뺐어요");
    expect(p.rejected).toEqual(["눈썹 굽기: 지금은 표준 눈썹만 쓴다"]);
  });

  it("JSON 이 아니거나 엉뚱한 모양이면 통째로 규칙값", () => {
    for (const bad of [null, "winged", 3, [1, 2]]) {
      const p = resolvePlan(measure(), {}, bad);
      expect(p.liner.source).toBe("rule");
      expect(p.rejected.length).toBeGreaterThan(0);
    }
  });
});

describe("개인화 계획 — VLM 제안 거르기 (항목별로, 나머지는 살린다)", () => {
  it("라이너: 처진 눈이 아닌데 drop 이면 거절 (기존 관문)", () => {
    const p = resolvePlan(measure(-4), {}, { liner: { style: "drop" }, shadow: { range: 1.1 } });
    expect(p.liner.source).toBe("rule");
    expect(p.shadow.source).toBe("vlm");
    expect(p.rejected.join()).toMatch(/drop/);
  });

  it("얼굴형: 모르는 이름이면 거절", () => {
    const p = resolvePlan(measure(), {}, { faceShape: { label: "diamond" } });
    expect(p.brow.faceShape).toBeNull();
    expect(p.rejected.join()).toMatch(/얼굴형/);
  });

  it("얼굴형: ⑤ 모델 판정(확신 0.6 이상)과 다르면 ⑤ 를 따른다", () => {
    const p = resolvePlan(measure(), { faceShape: model("square", 0.8) }, { faceShape: { label: "round" } });
    expect(p.brow).toMatchObject({ faceShape: "square", source: "rule" });
    expect(p.rejected.join()).toMatch(/⑤/);
  });

  it("얼굴형: ⑤ 판정이 확신이 낮으면 VLM 을 받는다", () => {
    const p = resolvePlan(measure(), { faceShape: model("square", 0.4) }, { faceShape: { label: "round" } });
    expect(p.brow).toMatchObject({ faceShape: "round", source: "vlm" });
  });

  it("눈썹 굽기 제안은 받지 않는다 — 지금은 표준 눈썹만", () => {
    const p = resolvePlan(measure(), { faceShape: model("round") }, { brow: { arch: "arched" } });
    expect(p.brow.arch).toBe("standard");
    expect(p.rejected.join()).toMatch(/표준 눈썹/);
  });

  it("섀도 범위: 0.8~1.2 밖이면 거절", () => {
    expect(resolvePlan(measure(), {}, { shadow: { range: 1.5 } }).shadow).toEqual({ range: 1, source: "rule" });
    expect(resolvePlan(measure(), {}, { shadow: { range: "넓게" } }).shadow.source).toBe("rule");
  });

  it("진하기: 부위별로 0.7~1.3 밖이거나 모르는 부위면 그 부위만 뺀다", () => {
    const p = resolvePlan(measure(), {}, { intensity: { lip: 2, cheek: 0.9, nose: 1 } });
    expect(p.intensity).toEqual({ cheek: 0.9 });
    expect(p.rejected.join()).toMatch(/lip/);
  });

  it("근거 문장: 숫자가 있거나(F-09) 40자를 넘으면 그 문장만 뺀다", () => {
    const p = resolvePlan(measure(), {}, { rationale: { liner: "꼬리를 15° 올렸어요", lip: "입술 가운데를 진하게 했어요", brow: "가".repeat(41) } });
    expect(p.rationale).toEqual({ lip: "입술 가운데를 진하게 했어요" });
  });
});

describe("개인화 계획 — 믿을 수 없는 얼굴형은 쓰지 않는다 (개인화가 채점 정답이 되므로)", () => {
  it("VLM 제안이 없을 때 ⑤ 판정이 확신이 낮으면 얼굴형 조정 없음", () => {
    expect(resolvePlan(measure(), { faceShape: model("round", 0.4) }).brow).toMatchObject({ faceShape: null, heightMm: 0, glabellaMm: 0 });
  });

  it("규칙 판정(method rule, 정확도 22%)은 확신도와 상관없이 믿지 않는다", () => {
    const rule: FaceShape = { label: "round", confidence: 1, method: "rule", version: "faceshape-rule-v1" };
    expect(resolvePlan(measure(), { faceShape: rule }).brow.faceShape).toBeNull();
  });
});

describe("개인화 계획 — 나머지 부위 (규칙값)", () => {
  it("가정값은 한 곳에 모여 있다", () => {
    expect(PLAN_RULES).toEqual({
      lidGapStd: 0.55, shadowGain: 0.5, lidGapTol: 0.05,
      lipTarget: 0.8, lipOverlineMax: 0.3,
      intensityCap: { brow: 1, liner: 1.15, shadow: 1.15 }, intensityMeanCap: 1.15,
      blushShift: 0.03,
    });
  });

  it("제안이 없으면 새 항목도 기본: 입술 오버라인 0, T존 하이라이트 켬, 볼 표준, 라이너 두께 1", () => {
    const p = resolvePlan(measure());
    expect(p.faceShape).toBeNull();
    expect(p.lip).toEqual({ overline: 0, source: "rule" });
    expect(p.highlight).toEqual({ tZone: true, source: "rule" });
    expect(p.blush).toEqual({ position: "standard", size: 1, source: "rule" });
    expect(p.linerThick).toEqual({ scale: 1, source: "rule" });
  });

  it("섀도: 눈두덩이 넓으면 범위를 넓히고 좁으면 줄인다 (0.8~1.2)", () => {
    expect(resolvePlan(measure(-4, { lidGap: 0.66 })).shadow.range).toBeCloseTo(1 + 0.5 * (0.66 / 0.55 - 1), 6);
    expect(resolvePlan(measure(-4, { lidGap: 0.44 })).shadow.range).toBeCloseTo(1 + 0.5 * (0.44 / 0.55 - 1), 6);
    expect(resolvePlan(measure(-4, { lidGap: 2 })).shadow.range).toBe(1.2);
    expect(resolvePlan(measure(-4, { lidGap: 0.1 })).shadow.range).toBe(0.8);
  });

  it("입술: 윗입술이 얇으면(비 < 0.8) 윗입술 가운데를 올린다 — 모자란 만큼의 절반, 최대 0.3", () => {
    // 비 0.64 → 목표까지 윗입술을 0.8/0.64 − 1 = 25% 늘려야 한다 → 절반 12.5%
    expect(resolvePlan(measure(-4, { lipRatio: 0.64 })).lip.overline).toBeCloseTo(0.125, 6);
    expect(resolvePlan(measure(-4, { lipRatio: 0.2 })).lip.overline).toBe(0.3);
    expect(resolvePlan(measure(-4, { lipRatio: 0.9 })).lip.overline).toBe(0);
    expect(resolvePlan(measure(-4, { lipRatio: null })).lip.overline).toBe(0);
  });

  it("얼굴형이 정해지면 계획 맨 위에도 둔다 (눈썹·쉐딩이 같이 쓴다)", () => {
    expect(resolvePlan(measure(), { faceShape: model("round") }).faceShape).toBe("round");
  });
});

describe("개인화 계획 — 나머지 부위 (VLM 제안 거르기)", () => {
  it("섀도: 측정과 반대 방향이면 거절 — 눈두덩이 넓은데 줄이자거나, 좁은데 넓히자", () => {
    const wide = resolvePlan(measure(-4, { lidGap: 0.66 }), {}, { shadow: { range: 0.9 } });
    expect(wide.shadow.source).toBe("rule");
    expect(wide.rejected.join()).toMatch(/눈두덩/);
    const narrow = resolvePlan(measure(-4, { lidGap: 0.44 }), {}, { shadow: { range: 1.1 } });
    expect(narrow.shadow.source).toBe("rule");
    expect(resolvePlan(measure(-4, { lidGap: 0.44 }), {}, { shadow: { range: 0.85 } }).shadow).toEqual({ range: 0.85, source: "vlm" });
  });

  it("입술: 0~0.3 이면 받고, 윗입술이 이미 목표 이상인데 올리자면 거절", () => {
    expect(resolvePlan(measure(-4, { lipRatio: 0.7 }), {}, { lip: { overline: 0.1 } }).lip).toEqual({ overline: 0.1, source: "vlm" });
    const thick = resolvePlan(measure(-4, { lipRatio: 0.9 }), {}, { lip: { overline: 0.1 } });
    expect(thick.lip).toEqual({ overline: 0, source: "rule" });
    expect(thick.rejected.join()).toMatch(/윗입술/);
    expect(resolvePlan(measure(), {}, { lip: { overline: 0.5 } }).lip.source).toBe("rule");
  });

  it("진하기: 눈썹은 올리지 않고(1 까지), 라이너·섀도는 1.15 까지 — 넘으면 그 부위만 뺀다", () => {
    const p = resolvePlan(measure(), {}, { intensity: { brow: 1.1, liner: 1.2, shadow: 1.1, lip: 1.2 } });
    expect(p.intensity).toEqual({ shadow: 1.1, lip: 1.2 });   // 평균 1.15 — 전체 상한 안
    expect(p.rejected.join()).toMatch(/brow/);
    expect(p.rejected.join()).toMatch(/liner/);
  });

  it("진하기: 받은 배율의 평균이 1.15 를 넘으면 1 보다 큰 쪽을 같은 비율로 줄인다 (전체가 진해지지 않게)", () => {
    const p = resolvePlan(measure(), {}, { intensity: { lip: 1.3, cheek: 1.3, shadow: 1.15 } });
    const vals = Object.values(p.intensity);
    expect(vals.reduce((a, b) => a + b, 0) / vals.length).toBeCloseTo(1.15, 6);
    expect(p.rejected.join()).toMatch(/전체/);
  });

  it("하이라이트: T존을 끄자는 제안(번들거리는 피부)은 받는다", () => {
    expect(resolvePlan(measure(), {}, { highlight: { tZone: false } }).highlight).toEqual({ tZone: false, source: "vlm" });
    expect(resolvePlan(measure(), {}, { highlight: { tZone: "no" } }).highlight.source).toBe("rule");
  });

  it("볼: 위치(higher/standard/lower)·크기(0.8~1.2)만 받는다", () => {
    expect(resolvePlan(measure(), {}, { blush: { position: "higher", size: 0.9 } }).blush).toEqual({ position: "higher", size: 0.9, source: "vlm" });
    const bad = resolvePlan(measure(), {}, { blush: { position: "chin", size: 2 } });
    expect(bad.blush).toEqual({ position: "standard", size: 1, source: "rule" });
    expect(bad.rejected.length).toBe(2);
  });

  it("라이너 두께: 0.8~1.2 배만 받는다", () => {
    expect(resolvePlan(measure(), {}, { linerThick: { scale: 0.9 } }).linerThick).toEqual({ scale: 0.9, source: "vlm" });
    expect(resolvePlan(measure(), {}, { linerThick: { scale: 1.5 } }).linerThick.source).toBe("rule");
  });
});
