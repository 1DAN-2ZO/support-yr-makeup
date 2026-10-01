// 라이너 개인화 (논문 기술 B) 검증
// 규칙: 측정값 → 라이너 스타일. 기하: 스타일 → 꼬리 끝 (ILoveEye 2022: 15°, 눈 폭의 12%).
// VLM 이 제안을 내도 같은 검증 관문을 지난다 — 측정과 모순되면 규칙값으로 되돌린다.
import { describe, expect, it } from "vitest";
import type { FaceMeasure, EyeMeasure } from "@core/face-measure";
import { lookGuide } from "@core/guides";
import { PERSONAL_LINER, linerOutline, styledGuide } from "@core/personal-guide";
import { LM, dist } from "@core/landmarks";
import { lookById } from "@core/looks";
import { DROOP_TILT_DEG, planLiner, resolveLiner } from "@core/personalize";
import type { Pt } from "@core/types";
import { BARE, LMS } from "./helpers/synth-face";

/** 눈꼬리 기울기만 바꾼 측정값. α·β 는 처진 눈 판정에 더 쓰지 않는다 — 일부러 "처진" 값(α > β)으로 둔다 */
function measure(tiltR: number, tiltL: number = tiltR): FaceMeasure {
  const eye = (tilt: number): EyeMeasure => ({ tiltDeg: tilt, alphaDeg: 36, betaDeg: 24, outerCornerDown: true, aspect: 3, heightRatio: 1 / 3, lidGapRatio: 0.55 });
  return { rollDeg: 0, eye: { R: eye(tiltR), L: eye(tiltL) }, brow: { R: { curvature: 0.1 }, L: { curvature: 0.1 } }, lip: { upperLowerRatio: 0.8, heightWidthRatio: 0.4 }, faceAspect: 0.85, mmPerPx: 0.5 };
}

const deg = (a: Pt, b: Pt): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const angleBetween = (o: Pt, a: Pt, b: Pt): number => {
  const d = Math.abs(deg(o, a) - deg(o, b)) % 360;
  return d > 180 ? 360 - d : d;
};

describe("라이너 개인화 — 규칙", () => {
  it("눈꼬리가 올라간 눈은 처진 눈이 아니다 — α > β 여도 (FFHQ 동양인 30장 모두 기울기 +, ILoveEye α>β 로는 21장이 처진 눈이었다)", () => {
    expect(planLiner(measure(7.0, 8.1))).toEqual({ style: "winged", reason: "not_down" });
  });

  it("처진 눈 + 룩이 '따라감' 이면 Drop", () => {
    expect(planLiner(measure(-3), "follow")).toEqual({ style: "drop", reason: "down_follow" });
  });

  it("처진 눈 + 룩이 '보정'(기본) 이면 Extend", () => {
    expect(planLiner(measure(-3))).toEqual({ style: "extend", reason: "down_correct" });
  });

  it("처진 눈 = 눈꼬리 기울기가 기준(4°)보다 작은 눈 — 사람 표시로 맞춘 값 (평균보다 덜 올라간 눈)", () => {
    expect(DROOP_TILT_DEG).toBe(4);
    expect(planLiner(measure(4.5)).style).toBe("winged");
    expect(planLiner(measure(4)).style).toBe("winged");
    expect(planLiner(measure(3.5)).style).toBe("extend");
    expect(planLiner(measure(2.3)).style).toBe("extend");   // ea_021189 — 사람이 처진 눈으로 표시
  });

  it("두 눈을 평균해 한 스타일을 정한다 — 좌우가 다르게 그려지지 않게", () => {
    expect(planLiner(measure(10, -1)).style).toBe("winged");   // 평균 4.5°
    expect(planLiner(measure(6, 0)).style).toBe("extend");     // 평균 3°
  });
});

describe("라이너 개인화 — 검증 관문 (VLM 제안도 여기를 지난다)", () => {
  it("제안이 없으면 규칙값", () => {
    expect(resolveLiner(measure(8))).toEqual({ plan: { style: "winged", reason: "not_down" }, source: "rule" });
  });

  it("처진 눈이 아닌데 Drop 을 제안하면 거절하고 규칙값으로", () => {
    const r = resolveLiner(measure(8), "correct", { style: "drop" });
    expect(r.source).toBe("rule");
    expect(r.plan.style).toBe("winged");
    expect(r.rejected).toMatch(/처진 눈이 아닌데/);
  });

  it("모르는 스타일은 거절", () => {
    const r = resolveLiner(measure(8), "correct", { style: "cat-eye" });
    expect(r.source).toBe("rule");
    expect(r.rejected).toMatch(/모르는 스타일/);
  });

  it("측정과 모순되지 않는 제안은 받는다", () => {
    const r = resolveLiner(measure(-3), "correct", { style: "drop" });
    expect(r.source).toBe("vlm");
    expect(r.plan.style).toBe("drop");
    expect(r.rejected).toBeUndefined();
  });
});

describe("라이너 개인화 — 꼬리 모양 (ILoveEye 2022)", () => {
  // 합성 얼굴의 오른쪽 눈(eyeA): 바깥 (170, 250) → 안쪽 (260, 250), 윗눈꺼풀 꼭대기 (215, 232)
  const outer = LMS[LM.eyeA.outer]!, inner = LMS[LM.eyeA.inner]!;
  const apex = LMS[LM.eyeA.upper[4]]!;
  const len = PERSONAL_LINER.length * BARE.unit.eye;
  const tip = (style: "winged" | "drop" | "extend") => styledGuide({}, style)("liner", BARE).liner!.wing.R;

  it("치수는 ILoveEye 값 — 15°, 눈 폭의 12%", () => {
    expect(PERSONAL_LINER).toEqual({ wingedDeg: 15, length: 0.12 });
  });

  it("Winged: 눈 축에서 윗눈꺼풀 쪽으로 15°", () => {
    const [o, e] = tip("winged");
    expect(o).toEqual(outer);
    expect(dist(o, e)).toBeCloseTo(len, 6);
    // 눈 축의 바깥 방향 = 안쪽 → 바깥
    const ahead = { x: outer.x + (outer.x - inner.x), y: outer.y + (outer.y - inner.y) };
    expect(angleBetween(o, e, ahead)).toBeCloseTo(15, 6);
    expect(e.y).toBeLessThan(o.y);   // 윗눈꺼풀 쪽(화면 위)
  });

  it("Extend: 눈 축을 곧게 연장", () => {
    const [o, e] = tip("extend");
    expect(dist(o, e)).toBeCloseTo(len, 6);
    expect(e.y).toBeCloseTo(o.y, 6);   // 합성 얼굴의 눈 축은 수평
    expect(e.x).toBeLessThan(o.x);      // 바깥 쪽으로
  });

  it("Drop: 윗눈꺼풀 꼭대기 → 눈꼬리 선을 연장", () => {
    const [o, e] = tip("drop");
    expect(dist(o, e)).toBeCloseTo(len, 6);
    expect(angleBetween(o, e, { x: 2 * o.x - apex.x, y: 2 * o.y - apex.y })).toBeCloseTo(0, 6);
    expect(e.y).toBeGreaterThan(o.y);   // 눈꼬리 선을 따라 내려간다
  });

  it("왼쪽 눈도 바깥 쪽으로 뻗는다", () => {
    const [o, e] = styledGuide({}, "winged")("liner", BARE).liner!.wing.L;
    expect(e.x).toBeGreaterThan(o.x);
    expect(e.y).toBeLessThan(o.y);
  });

  it("스타일을 주지 않으면 지금 가이드와 똑같다 — 개인화하지 않은 채점은 바뀌지 않는다", () => {
    const daily = lookById("daily").parts;
    expect(lookGuide(daily)("liner", BARE)).toEqual(styledGuide(daily, undefined)("liner", BARE));
    expect(dist(...lookGuide(daily)("liner", BARE).liner!.wing.R) / BARE.unit.eye).toBeCloseTo(0.15, 6);
  });

  it("두께는 스타일과 무관하게 룩에서 온다", () => {
    const edgy = lookById("edgy").parts;
    expect(styledGuide(edgy, "extend")("liner", BARE).liner!.thick).toBe(0.06);
  });

  it("화면용 윤곽도 같은 꼬리 끝을 쓴다 — 가이드와 채점이 어긋나지 않게", () => {
    const e = tip("drop")[1];
    expect(linerOutline(BARE, 0.045, "drop").R).toContainEqual(e);
  });
});
