// 화면 4 표정 게이트 (#27) — 맨얼굴 정면 때 표정(블렌드셰이프)과 지금 표정 비교
// 채점은 맨얼굴을 이동·회전·크기로만 겹친다 → 표정이 다르면 비교 자리가 어긋난다. 결정 D1: 찍기 전에 막는다, 웃음 포함
import { describe, expect, it } from "vitest";
import { EXPR_KEYS, exprDiff } from "@core/expression";

const calm: Record<string, number> = { mouthSmileLeft: 0.02, mouthSmileRight: 0.03, mouthPucker: 0.05, jawOpen: 0.04, eyeSquintLeft: 0.1, eyeSquintRight: 0.1, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05, cheekPuff: 0.01 };

describe("exprDiff", () => {
  it("X1 맨얼굴 표정 값이 없으면 잴 수 없다(undefined) — ① #177 반영 전에는 조건을 건너뛴다", () => {
    expect(exprDiff("lip", null, calm)).toBeUndefined();
    expect(exprDiff("lip", calm, null)).toBeUndefined();
  });

  it("X2 같은 표정이면 0", () => {
    expect(exprDiff("lip", calm, { ...calm })).toBe(0);
  });

  it("X3 입 내밀기는 입술 단계에서만 본다 — 라이너 단계에는 상관없다", () => {
    const pucker = { ...calm, mouthPucker: 0.6 };
    expect(exprDiff("lip", calm, pucker)).toBeCloseTo(0.55, 6);
    expect(exprDiff("liner", calm, pucker)).toBe(0);
  });

  it("X4 웃음은 눈·입술·볼 단계 모두에서 본다 (웃으면 눈이 가늘어지고 볼이 올라간다)", () => {
    const smile = { ...calm, mouthSmileLeft: 0.7, mouthSmileRight: 0.72 };
    for (const p of ["brow", "liner", "shadow", "lip", "cheek", "contour"] as const) expect(exprDiff(p, calm, smile)).toBeCloseTo(0.69, 6);
  });

  it("X5 눈 깜빡임은 안 본다 — 라이너는 눈 감은 장도 쓴다", () => {
    expect(exprDiff("liner", calm, { ...calm, eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 })).toBe(0);
    for (const keys of Object.values(EXPR_KEYS)) expect(keys.some((k) => k.startsWith("eyeBlink"))).toBe(false);
  });

  it("X6 한쪽에만 있는 이름은 건너뛴다 (모델마다 이름이 빠질 수 있다)", () => {
    const { jawOpen: _drop, ...noJaw } = calm;
    expect(exprDiff("lip", calm, { ...noJaw, mouthPucker: 0.05 })).toBe(0);
  });
});
