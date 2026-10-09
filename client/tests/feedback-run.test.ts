// 화면 6 피드백 잇기 (⑥, #332) — 앱이 가진 것(맨얼굴 · 정답사진 · 시도사진 묶음)을 ③ 의 feedbackWhole 에 넣는 부분
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import { runFeedback, type FeedbackSources } from "@core/feedback-run";
import { LM } from "@core/landmarks";
import { LMS, P, RED, SKIN, image, type Paint, type Rgb } from "./helpers/synth-face";

const lipPoly = LM.lipsOuter.map(P);
const tint = (c: Rgb, k: number): Rgb => SKIN.map((s, i) => Math.round(s + (c[i]! - s) * k)) as unknown as Rgb;
const lips = (k: number): Paint => (x, y) => (pointInPoly(x, y, lipPoly) ? tint(RED, k) : null);
const shot = (p?: Paint) => ({ image: image(p), lm: LMS });
const src = (over: Partial<FeedbackSources> = {}): FeedbackSources => ({ bare: shot(), answer: image(lips(0.6)), attempt: [shot(lips(0.6))], ...over });
const lipLine = (s: FeedbackSources): string | undefined => {
  const r = runFeedback(s);
  return r.ok ? r.feedback.parts.find((p) => p.part === "lip")?.line : `missing:${r.missing}`;
};

describe("피드백 잇기 (runFeedback)", () => {
  it("FR1 맨얼굴 · 정답사진 · 시도사진이 다 있으면 ③ 의 문장이 그대로 나온다", () => {
    expect(lipLine(src())).toBe("예상 메이크업과 비슷해요");
    expect(lipLine(src({ attempt: [shot()] }))).toBe("내 화장에서 변화를 찾지 못했어요");
  });

  it("FR2 없는 것이 있으면 판정하지 않고 무엇이 없는지 돌려준다 — 화면이 안내한다", () => {
    expect(runFeedback(src({ bare: null }))).toEqual({ ok: false, missing: "bare" });
    expect(runFeedback(src({ answer: null }))).toEqual({ ok: false, missing: "answer" });
    expect(runFeedback(src({ attempt: [] }))).toEqual({ ok: false, missing: "attempt" });
  });

  it("FR3 정답사진이 맨얼굴과 크기가 다르면 판정하지 않는다 — 겹친다는 조건이 깨진 그림으로는 결과가 틀린다 (feedback-input-contract 지킬 것 1)", () => {
    const im = image(lips(0.6));
    expect(runFeedback(src({ answer: { data: im.data, w: im.w, h: im.h - 10 } }))).toEqual({ ok: false, missing: "answer_size" });
  });

  it("FR4 시도사진 묶음(여러 장)을 그대로 넘긴다 — 한 장만 다른 것은 가운데 값에 묻힌다", () => {
    const five = [shot(lips(0.6)), shot(lips(0.6)), shot(), shot(lips(0.6)), shot(lips(0.6))];
    expect(lipLine(src({ attempt: five }))).toBe("예상 메이크업과 비슷해요");
  });

  it("FR5 옮긴 그림이 없으면 라이너는 볼 수 없다고 나오고, 크기가 다른 옮긴 그림은 쓰지 않는다 (나머지 부위는 그대로 판정)", () => {
    const liner = (s: FeedbackSources) => { const r = runFeedback(s); return r.ok ? { tone: r.feedback.parts.find((p) => p.part === "liner")?.tone, dropped: r.movedDropped } : null; };
    expect(liner(src())).toEqual({ tone: "info", dropped: false });
    const im = image();
    const bad = src({ moved: { data: im.data, w: im.w - 4, h: im.h } });
    expect(liner(bad)).toEqual({ tone: "info", dropped: true });
    expect(lipLine(bad)).toBe("예상 메이크업과 비슷해요");
  });
});
