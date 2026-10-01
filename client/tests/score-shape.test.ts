// 결과 모양 채점 실험 (score-shape 브랜치, 2026-10-01) — 맨얼굴과 비교하지 않고 **지금 사진 한 장**에서
// "가이드 안이 얼마나 채워져 있나" 를 잰다. 원래 있던 눈썹과 새로 그린 것을 가리지 않는다 (팀 방향: 눈썹이 이미 정답 모양이면 무시하지 않는다)
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { frameOf } from "@core/sampling";
import { shapeFill } from "@core/score-shape";
import type { Pt } from "@core/types";
import { BROWN, LMS, P, browPaint, image, type Paint } from "./helpers/synth-face";

const outline: Pt[] = [...LM.browA.upper.map(P), ...LM.browA.lower.map(P).reverse()];
const frame = (p: Paint) => frameOf(image(p), LMS);

describe("결과 모양 — 가이드 안 채움 (지금 사진만)", () => {
  it("H1 맨피부면 채움 0 · 가이드 안이 전부 눈썹이면 1 에 가깝다", () => {
    expect(shapeFill(frame(() => null), outline).coverage).toBe(0);
    expect(shapeFill(frame(browPaint), outline).coverage).toBeGreaterThan(0.9);
  });

  it("H2 꼬리 쪽 절반만 눈썹이면 채움도 절반쯤", () => {
    const half: Paint = (x, y) => (x < 215 ? browPaint(x, y) : null);   // 눈썹 x 160~270 의 바깥 절반
    const c = shapeFill(frame(half), outline).coverage;
    expect(c).toBeGreaterThan(0.35);
    expect(c).toBeLessThan(0.65);
  });

  it("H3 맨얼굴 사진이 없어도 된다 — 원래 눈썹이든 그린 것이든 같은 채움", () => {
    // 같은 그림이면 '원래 있던 것' 인지 '그린 것' 인지와 상관없이 같은 값 (맨얼굴을 안 본다)
    expect(shapeFill(frame(browPaint), outline).coverage).toBe(shapeFill(frame(browPaint), outline).coverage);
  });

  it("H4 전체가 어두워져도(조명) 주변 피부와 같이 어두워지면 채움 0 — 기준이 주변 피부라서", () => {
    const dim = frameOf(image(() => null, 0.7), LMS);
    expect(shapeFill(dim, outline).coverage).toBe(0);
  });

  it("H5 주변 피부보다 조금만 어두운 칸은 안 센다 (그림자·잡티)", () => {
    const faint: Paint = (x, y) => (browPaint(x, y) ? [210, 160, 130] : null);   // 피부(224,172,140)보다 살짝만
    expect(shapeFill(frame(faint), outline).coverage).toBe(0);
    expect(BROWN[0]).toBeLessThan(120);
  });
});
