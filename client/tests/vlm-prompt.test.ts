// VLM 프롬프트 — 맨얼굴 사진과 함께 넘길 글. 허용 값은 관문(resolvePlan)과 같은 상수에서 뽑는다
import { describe, expect, it } from "vitest";
import type { EyeMeasure, FaceMeasure } from "@core/face-measure";
import { lookById } from "@core/looks";
import { PLAN_LIMITS } from "@core/personalize";
import { buildVlmPrompt } from "@core/vlm-prompt";

function measure(ab: number): FaceMeasure {
  const eye = (): EyeMeasure => ({ tiltDeg: 8.4, alphaDeg: 30 + ab / 2, betaDeg: 30 - ab / 2, outerCornerDown: ab > 0, aspect: 2.9, heightRatio: 0.34, lidGapRatio: 0.55 });
  return { rollDeg: 0, eye: { R: eye(), L: eye() }, brow: { R: { curvature: 0.15 }, L: { curvature: 0.16 } }, lip: { upperLowerRatio: 0.8, heightWidthRatio: 0.4 }, faceAspect: 0.82, mmPerPx: 0.3 };
}
const look = lookById("edgy")!;

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
    for (const v of ["winged", "extend", "drop", "oval", "round", "square", "oblong", "heart"]) expect(p).toContain(v);
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
  it("얼굴형은 쉐딩·하이라이트만 바꾸고 눈썹은 표준 그대로라고 적는다 — 근거 문장이 실제 적용과 어긋나지 않게", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toMatch(/쉐딩·하이라이트 자리만 바뀝니다/);
    expect(p).toMatch(/눈썹은 표준 눈썹 그대로/);
    expect(p).not.toContain("brow.arch");
  });
});

describe("VLM 프롬프트 — 모든 부위", () => {
  it("새 측정값(눈두덩·입술 비)과 규칙이 정한 값을 알려 준다", () => {
    const p = buildVlmPrompt(measure(-4), look);
    expect(p).toMatch(/눈두덩/);
    expect(p).toMatch(/윗입술 ÷ 아랫입술: 0\.80/);
  });

  it("새로 정할 것(입술 오버라인·볼·T존·라이너 두께)과 허용 범위를 관문 상수에서 적는다", () => {
    const p = buildVlmPrompt(measure(-4), look);
    for (const k of ["lip.overline", "blush.position", "blush.size", "highlight.tZone", "linerThick.scale", "higher", "lower"]) expect(p).toContain(k);
    expect(p).toContain(`${PLAN_LIMITS.lipOverline[0]}~${PLAN_LIMITS.lipOverline[1]}`);
    expect(p).toContain(`${PLAN_LIMITS.blushSize[0]}~${PLAN_LIMITS.blushSize[1]}`);
    expect(p).toContain(`${PLAN_LIMITS.linerThick[0]}~${PLAN_LIMITS.linerThick[1]}`);
  });

  it("진하기 상한(눈썹·눈 화장)을 알려 준다 — 모르고 올리면 늘 거절당한다", () => {
    expect(buildVlmPrompt(measure(-4), look)).toMatch(/brow 1.*liner 1\.15.*shadow 1\.15/s);
  });
});
