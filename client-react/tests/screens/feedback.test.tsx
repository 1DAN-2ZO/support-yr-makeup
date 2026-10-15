/**
 * 피드백 (screens/Feedback) — 본 앱 `client/src/screens/flow-slots.ts` 의 `feedbackSlot` 자리 (#454 D7).
 * 본 앱 시험(`client/tests/feedback-run.test.ts` 등)은 채점 자체를 보고, 화면은 back-button.test.ts 가 뒤로만 본다 —
 * 그래서 화면이 지키는 약속을 여기서 적는다:
 * 점수·숫자 없이 묶음(비슷해요 / 다시 볼 곳 / 알림)과 문장 한 줄 · 견준 결과는 `core/feedback-whole` 이 준 차례 그대로 ·
 * 「이번에는 볼 수 없었어요」 안내(.fb-side)는 `movedFailed` 일 때만 · 판정이 막히면(blocked) 다시 찍으러 가는 길 ·
 * 못 견줬으면(cannot) 본보기 문장이되 **왜 견준 결과가 아닌지** 한 줄을 반드시 같이 적는다 · 「다음 · 저장하러 가기」.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WholeFeedback } from "@core/feedback-whole";
import Feedback from "../../src/screens/Feedback";
import type { FeedbackLoad, FeedbackView } from "../../src/lib/feedback-source";
import { blockNetwork, fakeColors, flush, TEMPLATE } from "./helpers";

const whole: WholeFeedback = {
  parts: [
    { part: "brow", name: "눈썹", tone: "ok", line: "예상 메이크업과 비슷해요" },
    { part: "shadow", name: "섀도우", tone: "fix", line: "예상보다 연해요", fix: "한 번 더 덧발라 보세요" },
    { part: "liner", name: "라이너", tone: "info", line: "이번에는 볼 수 없었어요" },
    { part: "lip", name: "입술", tone: "ok", line: "예상 메이크업과 비슷해요", more: "색도 거의 같아요" },
  ],
  ok: ["눈썹", "입술"],
  fix: ["섀도우"],
};

function viewOf(over: Partial<FeedbackView> = {}): FeedbackView {
  return {
    answerUrl: "blob:answer",
    attemptUrl: "blob:attempt",
    answer: new Blob([new Uint8Array([1])]),
    attempt: new Blob([new Uint8Array([2])]),
    feedback: whole,
    ms: 10,
    frames: 1,
    hairFrames: 0,
    movedFailed: false,
    dispose: () => {},
    ...over,
  };
}

function renderWith(getFeedback?: () => Promise<FeedbackLoad>) {
  const onNext = vi.fn(), onRetake = vi.fn();
  const r = render(<Feedback template={TEMPLATE} colors={fakeColors()} getFeedback={getFeedback} onNext={onNext} onRetake={onRetake} />);
  return { ...r, onNext, onRetake };
}

const SIDE = "라이너는 이번에 못 쟀어요";

beforeEach(() => {
  blockNetwork();
});

describe("피드백 — 견준 결과", () => {
  it("견주는 동안은 기다리는 칸 — 결과가 오면 사진 두 장 · 요약 두 줄 · 부위별 줄을 준 차례 그대로 그린다", async () => {
    let done: (r: FeedbackLoad) => void = () => {};
    const { container, onNext } = renderWith(() => new Promise<FeedbackLoad>((r) => { done = r; }));
    expect(container.querySelector(".slot-answer-loading")).not.toBeNull();
    expect(container.textContent).toContain("찍은 사진을 보고 있어요");
    done({ ok: true, view: viewOf() });
    await waitFor(() => expect(screen.getByRole("img", { name: "예상 메이크업" })).toBeTruthy());
    expect(screen.getByRole("img", { name: "예상 메이크업" }).getAttribute("src")).toBe("blob:answer");
    expect(screen.getByRole("img", { name: "내 화장" }).getAttribute("src")).toBe("blob:attempt");
    expect(container.querySelector(".fb-sum.is-ok")?.textContent).toBe("비슷한 곳눈썹 · 입술");
    expect(container.querySelector(".fb-sum.is-fix")?.textContent).toBe("다시 볼 곳섀도우");
    const lines = [...container.querySelectorAll(".fb-line")];
    expect(lines.map((l) => l.querySelector("strong")?.textContent)).toEqual(["눈썹", "섀도우", "라이너", "입술"]);
    expect(lines.map((l) => l.querySelector("em")?.textContent)).toEqual(["비슷해요", "다시 볼 곳", "알림", "비슷해요"]);
    expect(lines[1]!.querySelector(".fb-fix")?.textContent).toBe("한 번 더 덧발라 보세요");
    expect(lines[3]!.querySelector(".fb-more")?.textContent).toBe("색도 거의 같아요");
    // 점수 · 숫자를 보여 주지 않는다
    expect(container.textContent).not.toMatch(/\d+\s*점/);
    fireEvent.click(screen.getByRole("button", { name: "다음 · 저장하러 가기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // #454 B1 — 옮긴 그림이 늦거나 실패했을 때만 밝힌다
  it("'이번에는 볼 수 없었어요' 안내(.fb-side)는 movedFailed 일 때만 뜬다", async () => {
    const a = renderWith(async () => ({ ok: true, view: viewOf({ movedFailed: false }) }));
    await waitFor(() => expect(screen.getByRole("img", { name: "내 화장" })).toBeTruthy());
    expect(a.container.querySelector(".fb-side")).toBeNull();
    expect(a.container.textContent).not.toContain(SIDE);
    a.unmount();

    const b = renderWith(async () => ({ ok: true, view: viewOf({ movedFailed: true }) }));
    await waitFor(() => expect(b.container.querySelector(".fb-side")).not.toBeNull());
    expect(b.container.querySelector(".fb-side")?.textContent).toContain(SIDE);
    expect(b.container.querySelector(".fb-side")?.textContent).toContain("이번에는 볼 수 없었어요");
  });

  it("요약 묶음이 비어 있으면 그 줄을 안 그린다", async () => {
    const { container } = renderWith(async () => ({ ok: true, view: viewOf({ feedback: { ...whole, ok: [], fix: [] } }) }));
    await waitFor(() => expect(screen.getByRole("img", { name: "내 화장" })).toBeTruthy());
    expect(container.querySelector(".fb-summary")).toBeNull();
  });
});

describe("피드백 — 판정이 막혔을 때 (blocked)", () => {
  it("안내 한 줄과 「완성사진 다시 찍기」(onRetake) — 이 버전은 「다음」도 같이 둔다", async () => {
    const blocked = "처음 찍은 사진과 밝기가 많이 달라요. 같은 자리에서 다시 찍어 주세요";
    const { container, onNext, onRetake } = renderWith(async () => ({ ok: true, view: viewOf({ feedback: { blocked, parts: [], ok: [], fix: [] } }) }));
    await waitFor(() => expect(container.querySelector(".fb-note")?.textContent).toBe(blocked));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("다시 찍기");
    expect(container.querySelector(".fb-line")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "완성사진 다시 찍기" }));
    expect(onRetake).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "다음 · 저장하러 가기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("onRetake 를 안 주면 다시 찍기 버튼은 없고 「다음」만 남는다", async () => {
    const { container } = render(<Feedback template={TEMPLATE} colors={fakeColors()} getFeedback={async () => ({ ok: true, view: viewOf({ feedback: { blocked: "막힘", parts: [], ok: [], fix: [] } }) })} onNext={() => {}} />);
    await waitFor(() => expect(container.querySelector(".fb-note")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "완성사진 다시 찍기" })).toBeNull();
    expect(screen.getByRole("button", { name: "다음 · 저장하러 가기" })).toBeTruthy();
  });
});

describe("피드백 — 못 견줬을 때 (cannot)", () => {
  it.each([
    ["bare", "맨얼굴 사진이 없어요"],
    ["answer", "예상 메이크업이 아직 없어요"],
    ["attempt", "화장한 사진이 없어요"],
    ["answer_size", "크기가 달라요"],
  ] as const)("재료가 없으면(%s) 본보기 문장으로 떨어지되, 왜 견준 결과가 아닌지 한 줄을 같이 적는다", async (missing, why) => {
    const { container, onNext } = renderWith(async () => ({ ok: false, missing }));
    await waitFor(() => expect(container.querySelector(".fb-note")).not.toBeNull());
    const note = container.querySelector(".fb-note")!.textContent!;
    expect(note).toContain(why);
    expect(note).toContain("견준 결과가 아니에요");
    // 견준 사진이 없으니 고른 화장 한 장만, 본보기 줄은 다섯 부위
    expect(screen.queryByRole("img", { name: "내 화장" })).toBeNull();
    expect(screen.getByRole("img", { name: `${TEMPLATE.name} 화장 참고 사진` })).toBeTruthy();
    expect(container.querySelectorAll(".fb-line")).toHaveLength(5);
    expect(container.querySelector(".fb-side")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다음 · 저장하러 가기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("보관함을 안 주면 곧바로 본보기 — 재다가 터져도 기다리는 화면에서 멈추지 않는다", async () => {
    const a = renderWith(undefined);
    expect(a.container.querySelector(".fb-note")?.textContent).toContain("예상 메이크업이 아직 없어요");
    a.unmount();
    const b = renderWith(async () => { throw new Error("사진을 못 풂"); });
    await waitFor(() => expect(b.container.querySelector(".fb-note")).not.toBeNull());
    expect(b.container.querySelector(".fb-note")?.textContent).toContain("사진을 견주다가 멈췄어요");
  });

  it("기다리다 화면을 떠나면 뒤늦게 온 결과로 그리지 않는다", async () => {
    let done: (r: FeedbackLoad) => void = () => {};
    const { unmount } = renderWith(() => new Promise<FeedbackLoad>((r) => { done = r; }));
    unmount();
    done({ ok: true, view: viewOf() });
    await flush();
    expect(screen.queryByRole("img", { name: "내 화장" })).toBeNull();
  });
});
