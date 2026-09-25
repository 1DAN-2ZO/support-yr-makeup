// VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글. 허용 값은 관문(resolvePlan)과 같은 상수에서 뽑는다
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { lookById } from "@core/looks";
import { PLAN_LIMITS } from "@core/personalize";
import { buildVlmPrompt } from "@core/vlm-prompt";

function measure(ab: number): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8.4, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 2.9, heightRatio: 0.34 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.15 }, L: { curvature: 0.16 } }, faceAspect: 0.82, mmPerPx: 0.3 };
}
const look = lookById("smoky")!;

describe("VLM 프롬프트", () => {
  it("측정값과 규칙의 판단을 글로 넘긴다 — VLM 이 사진만 보고 추측하지 않게", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toContain("8.4");          // 눈꼬리 기울기
    expect(p).toContain("-4.0");         // α − β
    expect(p).toMatch(/처진 눈 아님/);
    expect(p).toContain("winged");       // 규칙이 고른 스타일
  });

  it("템플릿(룩 이름·부위 색)을 넘긴다", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toContain(look.name);
    expect(p).toMatch(/#[0-9a-f]{6}/);
  });

  it("허용 값은 관문 상수에서 온다 — 둘이 어긋나면 VLM 이 늘 거절당한다", () => {
    const p = buildVlmPrompt(measure(-4), look);
    for (const v of ["winged", "extend", "drop", "oval", "round", "square", "oblong", "heart", "flatter", "standard", "arched"]) expect(p).toContain(v);
    expect(p).toContain(`${PLAN_LIMITS.shadowRange[0]}~${PLAN_LIMITS.shadowRange[1]}`);
    expect(p).toContain(`${PLAN_LIMITS.intensity[0]}~${PLAN_LIMITS.intensity[1]}`);
    expect(p).toContain(`${PLAN_LIMITS.rationaleMax}자`);
  });

  it("⑤ 얼굴형 판정이 있으면 알려 준다", () => {
    const p = buildVlmPrompt(measure(-4), look, { label: "square", confidence: 0.9, method: "model", version: "t" });
    expect(p).toMatch(/얼굴형 판정: square/);
  });

  it("JSON 하나만 답하라고 한다", () => {
    expect(buildVlmPrompt(measure(-4), look)).toMatch(/JSON 하나만/);
  });
});

describe("VLM 프롬프트 — 얼굴형의 결과를 알려 준다", () => {
  it("얼굴형마다 눈썹이 어떻게 바뀌는지 JKSC 표에서 적는다 — 근거 문장이 실제 적용과 어긋나지 않게", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toContain("oblong → 눈썹 낮게, 미간 좁게");
    expect(p).toContain("round → 눈썹 높게, 미간 좁게");
    expect(p).toContain("square → 눈썹 그대로, 미간 그대로");
  });
});
