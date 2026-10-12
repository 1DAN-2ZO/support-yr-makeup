// @vitest-environment jsdom
// 화면 6 피드백 (#318 모양 · #332 재료). 화면은 ⑥ 이 준 것을 그리기만 한다 — 문장을 만들지 않는다.
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { WholeFeedback } from "@core/feedback-whole";
import type { Versions } from "@core/types";
import { feedbackSlot } from "@screens/flow-slots";
import type { FeedbackLoad } from "@screens/feedback-source";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const go = vi.fn();
  const ctx: ScreenContext<null> = {
    root, session: null, go, goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "feedback", part: null, ver }, memorySink().sink),
  };
  return { root, ctx, go };
}

const dispose = vi.fn();
function view(feedback: WholeFeedback) {
  return {
    answerUrl: "blob:answer", attemptUrl: "blob:attempt",
    answer: new Blob(), attempt: new Blob(),
    feedback, ms: 10, frames: 5, hairFrames: 0, movedFailed: false, dispose,
  };
}
const FULL: WholeFeedback = {
  ok: ["눈썹"], fix: ["라이너"],
  parts: [
    { part: "brow", name: "눈썹", tone: "ok", line: "예상 메이크업과 비슷해요" },
    { part: "liner", name: "라이너", tone: "fix", line: "꼬리가 짧아요", more: "오른쪽은 비슷해요", fix: "꼬리를 빼 보세요" },
    { part: "cheek", name: "볼", tone: "info", line: "이번에는 볼 수 없었어요" },
  ],
};

const mount = async (load: () => Promise<FeedbackLoad>, surveyUrl?: string) => {
  const s = setup();
  const off = feedbackSlot<null>({ getFeedback: load, clearAll: async () => {}, ...(surveyUrl ? { surveyUrl } : {}) }).mount(s.ctx) as () => void;
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  return { ...s, off };
};

describe("화면 6 피드백", () => {
  it("FB1 들어오면 먼저 기다린다 — 부위 줄은 아직 없다 (다 준비되면 한 번에)", () => {
    const { root } = setup();
    feedbackSlot<null>({ getFeedback: () => new Promise(() => {}) }).mount({
      root, session: null, go: vi.fn(), goPart: vi.fn(),
      log: createLogger({ sid: "s", screen: "feedback", part: null, ver }, memorySink().sink),
    });
    expect(root.querySelector(".slot-answer-loading")).not.toBeNull();
    expect(root.querySelector(".fb-lines")).toBeNull();
  });

  it("FB2 결과 — 사진 두 장 · 요약 둘 · 부위 줄을 ⑥ 이 준 순서 그대로", async () => {
    const { root } = await mount(async () => ({ ok: true, view: view(FULL) }));
    const imgs = [...root.querySelectorAll<HTMLImageElement>(".fb-photos img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["blob:answer", "blob:attempt"]);
    expect([...root.querySelectorAll(".fb-sum")]).toHaveLength(2);
    const names = [...root.querySelectorAll(".fb-line strong")].map((e) => e.textContent);
    expect(names).toEqual(["눈썹", "라이너", "볼"]);   // 순서는 ③ 가 정한 그대로
  });

  it("FB3 종류를 색만으로 가르지 않는다 — class 와 글자 둘 다", async () => {
    const { root } = await mount(async () => ({ ok: true, view: view(FULL) }));
    const rows = [...root.querySelectorAll(".fb-line")];
    expect(rows.map((r) => r.className)).toEqual(["fb-line is-ok", "fb-line is-fix", "fb-line is-info"]);
    expect(rows.map((r) => r.querySelector("em")?.textContent)).toEqual(["비슷해요", "다시 볼 곳", "알림"]);
  });

  it("FB4 '고칠 것' 일 때만 고치는 방법 · 덧붙이는 말은 있을 때만", async () => {
    const { root } = await mount(async () => ({ ok: true, view: view(FULL) }));
    const rows = [...root.querySelectorAll(".fb-line")];
    expect(rows[0]!.querySelector(".fb-fix")).toBeNull();
    expect(rows[1]!.querySelector(".fb-fix")?.textContent).toBe("꼬리를 빼 보세요");
    expect(rows[1]!.querySelector(".fb-more")?.textContent).toBe("오른쪽은 비슷해요");
    expect(rows[2]!.querySelector(".fb-fix")).toBeNull();
  });

  it("FB5 점수·숫자를 보여 주지 않는다 (#318 정해진 것)", async () => {
    const { root } = await mount(async () => ({ ok: true, view: view(FULL) }));
    expect(/\d/.test(root.textContent ?? "")).toBe(false);
  });

  it("FB6 다시 찍기 — 안내 한 줄과 다시 찍는 버튼만, 부위 줄은 없다", async () => {
    const blocked: WholeFeedback = { blocked: "밝기가 많이 달라요. 다시 찍어 주세요", parts: [], ok: [], fix: [] };
    const { root, go } = await mount(async () => ({ ok: true, view: view(blocked) }));
    expect(root.querySelector(".fb-lines")).toBeNull();
    expect(root.querySelector(".fb-note")?.textContent).toBe(blocked.blocked);
    [...root.querySelectorAll("button")].find((b) => b.textContent === "시도사진 다시 찍기")!.click();
    expect(go).toHaveBeenCalledWith("attempt");
  });

  it("FB7 재료가 없으면 까닭을 사람 말로 — 흐름은 막지 않는다", async () => {
    const { root, go } = await mount(async () => ({ ok: false, missing: "answer" }));
    expect(root.querySelector(".fb-note")?.textContent).toContain("예상 메이크업이 아직 없어요");
    expect(root.querySelector(".fb-photos")).toBeNull();
    [...root.querySelectorAll("button")].find((b) => b.textContent === "다음 · 저장하러 가기")!.click();
    expect(go).toHaveBeenCalledWith("save");
  });

  it("FB8 화면을 떠나면 사진 주소를 돌려준다 (객체 URL 이 쌓이지 않게)", async () => {
    dispose.mockClear();
    const { off } = await mount(async () => ({ ok: true, view: view(FULL) }));
    expect(dispose).not.toHaveBeenCalled();
    off();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  // 2026-10-08 (⑥): 재료 모으기가 오류로 끝나면(사진을 못 풂 등) 기다리는 화면에서 멈췄다 — 나갈 길이 없었다
  it("FB9 재료 모으기가 오류로 끝나도 멈추지 않는다 — 안내하고 흐름은 막지 않는다", async () => {
    const { root, go } = await mount(async () => { throw new Error("사진을 풀지 못함"); });
    expect(root.textContent).not.toContain("찍은 사진을 보고 있어요");
    expect(root.querySelector(".fb-note")?.textContent).toContain("지금은 피드백을 만들 수 없어요");
    expect(root.querySelector(".fb-lines")).toBeNull();
    [...root.querySelectorAll("button")].find((b) => b.textContent?.includes("다음"))!.click();
    expect(go).toHaveBeenCalledWith("save");
  });

  it("FB10 화면을 떠난 뒤에 난 오류로는 아무것도 그리지 않는다", async () => {
    let fail: (e: Error) => void = () => {};
    const s = setup();
    const off = feedbackSlot<null>({ getFeedback: () => new Promise<FeedbackLoad>((_r, j) => { fail = j; }), clearAll: async () => {} }).mount(s.ctx) as () => void;
    off();
    const before = s.root.innerHTML;
    fail(new Error("늦은 오류"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.root.innerHTML).toBe(before);
  });

  // #431 — 설문이 저장 화면의 "끝내기" 에만 걸려 있어 46개 세션 중 1번만 떴다. 길을 하나 더 둔다
  it("FB9 후기 설문 주소를 주면 피드백 아래에 링크가 나온다 — 주지 않으면 안 나온다", async () => {
    const { root, off } = await mount(async () => ({ ok: true, view: view(FULL) }), "https://forms.example/x");
    const a = root.querySelector<HTMLAnchorElement>(".slot-survey a");
    expect(a?.href).toBe("https://forms.example/x");
    expect(a?.target).toBe("_blank");
    // 새 창으로 여는 링크는 rel 을 달아야 한다 (연 쪽 창을 건드릴 수 있다)
    expect(a?.rel).toContain("noopener");
    // "다음 · 저장하러 가기" 보다 **뒤에** 있어야 한다 — 앞서면 흐름을 끊는다
    const btns = [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(btns.some((t) => t.includes("저장하러"))).toBe(true);
    const page = root.querySelector<HTMLElement>(".slot-survey")!.parentElement!;
    const kids = [...page.children];
    const next = kids.findIndex((e) => e.textContent?.includes("저장하러"));
    const line = kids.findIndex((e) => e.classList.contains("slot-survey"));
    expect(next).toBeGreaterThanOrEqual(0);
    expect(line).toBeGreaterThan(next);
    off();

    const plain = await mount(async () => ({ ok: true, view: view(FULL) }));
    expect(plain.root.querySelector(".slot-survey")).toBeNull();
    plain.off();
  });
});
