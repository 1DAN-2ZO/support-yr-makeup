// VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글. 허용 값은 관문(resolvePlan)과 같은 상수에서 뽑는다
// 형식 E (vlm-prompt-v2): VLM 선정 실험(eval/vlm, 2026-09-30)에서 확정 — 예시 없음 · 관찰→근거→결정 · 숫자는 선택지
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { lookById } from "@core/looks";
import { DROOP_MARGIN_DEG, PLAN_LIMITS, PLAN_RULES } from "@core/personalize";
import { allowedChoices, buildVlmPrompt } from "@core/vlm-prompt";

function measure(ab: number, o: { gap?: number; lip?: number } = {}): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8.4, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 2.9, heightRatio: 0.34, lidGapRatio: o.gap ?? 0.55 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.15 }, L: { curvature: 0.16 } }, lip: { upperLowerRatio: o.lip ?? 0.8, heightWidthRatio: 0.4 }, faceAspect: 0.82, mmPerPx: 0.3 };
}
const look = lookById("edgy")!;
const decide = (p: string): string => p.slice(p.indexOf("## 정할 것"));

describe("VLM 프롬프트", () => {
  it("측정값과 규칙의 판단을 글로 넘긴다 — VLM 이 사진만 보고 추측하지 않게", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toContain("8.4");          // 눈꼬리 기울기
    expect(p).toContain("-4.0");         // α − β
    expect(p).toMatch(/처진 눈 아님/);
    expect(p).toMatch(/규칙 출발점: 라이너 winged/);
  });

  it("템플릿(룩 이름·부위 색)을 넘긴다", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toContain(look.name);
    expect(p).toMatch(/#[0-9a-f]{6}/);
  });

  it("⑤ 얼굴형 판정이 있으면 알려 준다", () => {
    const p = buildVlmPrompt(measure(-4), look, { label: "square", confidence: 0.9, method: "model", version: "t" });
    expect(p).toMatch(/얼굴형 판정: square/);
  });

  it("처진 눈 기준은 관문 상수와 같다 — 어긋나면 drop 이 늘 거절된다", () => {
    const p = buildVlmPrompt(measure(1), look);   // 0 < α − β ≤ 기준
    expect(p).toMatch(/처진 눈 아님/);
    expect(p).toContain(`${DROOP_MARGIN_DEG}° 를 넘으면 처진 눈`);
    expect(buildVlmPrompt(measure(DROOP_MARGIN_DEG + 1), look)).toMatch(/→ 처진 눈 \(/);
  });
});

describe("VLM 프롬프트 — 형식 E", () => {
  it("답 모양 예시를 주지 않는다 — 작은 모델이 예시 값·예시 문장(나쁜 예까지)을 베꼈다", () => {
    const answer = buildVlmPrompt(measure(-4), look).split("## 답")[1]!;
    expect(answer).toMatch(/JSON 하나만/);
    expect(answer).not.toContain("{");
    expect(buildVlmPrompt(measure(-4), look)).not.toMatch(/나쁜 예|좋은 예/);
  });

  it("관찰 → 근거 → 결정 순서로 쓰게 한다", () => {
    const d = decide(buildVlmPrompt(measure(-4), look));
    expect(d.indexOf("observation")).toBeLessThan(d.indexOf("rationale"));
    expect(d.indexOf("rationale")).toBeLessThan(d.indexOf("liner.style"));
  });

  it("근거 지시는 금지어를 나열하지 않고 긍정형으로 — 금지어를 적으면 그 말이 나온다", () => {
    const d = decide(buildVlmPrompt(measure(-4), look));
    expect(d).toMatch(/일상어/);
    expect(d).toContain(`${PLAN_LIMITS.rationaleMax}자`);
    expect(d).not.toMatch(/쓰지 않|쓰지 마|overline 0/);
  });

  it("숫자는 0.1 단위 선택지로 준다 — llama.cpp 는 소수 범위를 강제하지 않는다", () => {
    const d = decide(buildVlmPrompt(measure(-4, { lip: 0.6 }), look));
    expect(d).toContain("linerThick.scale: 0.8 / 0.9 / 1 / 1.1 / 1.2");
    expect(d).toContain("lip.overline: 0 / 0.1 / 0.2 / 0.3");
    for (const k of ["blush.position", "blush.size", "highlight.tZone", "faceShape.label", "higher", "lower", "oval", "heart"]) expect(d).toContain(k);
  });
});

describe("선택지 — 이 얼굴에서 관문이 받아 주는 값만", () => {
  it("처진 눈이 아니면 drop 을 주지 않는다", () => {
    expect(allowedChoices(measure(-4)).liner).not.toContain("drop");
    expect(allowedChoices(measure(DROOP_MARGIN_DEG + 1)).liner).toContain("drop");
    expect(decide(buildVlmPrompt(measure(-4), look))).not.toContain("drop");
  });

  it("눈두덩이 좁으면 섀도를 넓히는 값, 넓으면 줄이는 값을 뺀다", () => {
    const std = PLAN_RULES.lidGapStd;
    expect(allowedChoices(measure(-4, { gap: std * 0.8 })).shadow).toEqual([0.8, 0.9, 1]);
    expect(allowedChoices(measure(-4, { gap: std * 1.2 })).shadow).toEqual([1, 1.1, 1.2]);
    expect(allowedChoices(measure(-4, { gap: std })).shadow).toEqual([0.8, 0.9, 1, 1.1, 1.2]);
  });

  it("윗입술이 이미 목표 이상이면 오버라인은 0 만", () => {
    expect(allowedChoices(measure(-4, { lip: PLAN_RULES.lipTarget })).overline).toEqual([0]);
    expect(allowedChoices(measure(-4, { lip: 0.6 })).overline).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("진하기는 부위별 상한까지 — 눈썹은 올리지 않고 눈 화장은 조금만", () => {
    const a = allowedChoices(measure(-4));
    expect(Math.max(...a.intensity.brow)).toBe(1);
    expect(Math.max(...a.intensity.liner)).toBeLessThanOrEqual(PLAN_RULES.intensityCap.liner!);
    expect(Math.max(...a.intensity.lip)).toBe(PLAN_LIMITS.intensity[1]);
    expect(decide(buildVlmPrompt(measure(-4), look))).toMatch(/brow 0\.7~1, liner 0\.7~1\.1, shadow 0\.7~1\.1/);
  });
});
