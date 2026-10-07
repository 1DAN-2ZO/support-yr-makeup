// @vitest-environment jsdom
// 끝 화면의 후기 설문 칸 — 주소가 있을 때만, 새 창으로, 누르면 기록이 남는다
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";
import { doneScreen } from "@screens/done";
import { saveSlot } from "@screens/flow-slots";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const sink = memorySink();
  const ctx: ScreenContext<null> = {
    root, session: null, go: vi.fn(), goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "done", part: null, ver }, sink.sink),
  };
  return { root, ctx, events: sink.events };
}

const FORM = "https://docs.google.com/forms/d/e/TEST/viewform";

describe("끝내기 후기 모달", () => {
  const save = (surveyUrl: string | null) => {
    const { root, ctx, events } = setup();
    const clearAll = vi.fn(async () => ({ remaining: 0 }));
    saveSlot<null>({ clearAll, surveyUrl }).mount(ctx);
    const finish = [...root.querySelectorAll("button")].find((b) => b.textContent === "끝내기")!;
    return { root, ctx, events, clearAll, finish };
  };

  it("SM1 '끝내기' 를 누르면 그 화면 위에 모달이 뜬다 — 화면을 넘긴 뒤가 아니라", () => {
    const { root, finish, events } = save(FORM);
    expect(root.querySelector(".done-modal")).toBeNull();
    finish.click();
    const box = root.querySelector(".done-modal");
    expect(box).not.toBeNull();
    expect(box!.textContent).toContain("사용자 의견을 들려주세요");
    expect(events.some((e) => e.name === "button" && e.button === "survey_shown")).toBe(true);
  });

  it("SM2 모달을 닫아야 그때 끝 화면으로 간다 — '다음에 할게요'", async () => {
    const { root, ctx, finish, clearAll } = save(FORM);
    finish.click();
    expect(clearAll).not.toHaveBeenCalled();
    expect(ctx.go).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>(".done-modal-later")!.click();
    expect(root.querySelector(".done-modal")).toBeNull();
    await vi.waitFor(() => expect(ctx.go).toHaveBeenCalledWith("done"));
    expect(clearAll).toHaveBeenCalledTimes(1);
  });

  it("SM3 '후기 남기기' 를 눌러도 끝 화면으로 간다 — 폼은 새 창에서 열린다", async () => {
    const { root, ctx, finish, events } = save(FORM);
    finish.click();
    const a = root.querySelector<HTMLAnchorElement>(".done-modal a.primary")!;
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    a.click();
    expect(events.some((e) => e.name === "button" && e.button === "survey_open")).toBe(true);
    await vi.waitFor(() => expect(ctx.go).toHaveBeenCalledWith("done"));
  });

  it("SM4 설문 주소가 없으면 모달 없이 바로 끝낸다 — 설문이 흐름을 막지 않는다", async () => {
    const { root, ctx, finish, clearAll } = save(null);
    finish.click();
    expect(root.querySelector(".done-modal")).toBeNull();
    await vi.waitFor(() => expect(ctx.go).toHaveBeenCalledWith("done"));
    expect(clearAll).toHaveBeenCalledTimes(1);
  });

  it("SM5 두 번 눌러도 한 번만 끝낸다", async () => {
    const { root, finish, clearAll } = save(FORM);
    finish.click();
    finish.click();
    expect(root.querySelectorAll(".done-modal")).toHaveLength(1);
    root.querySelector<HTMLButtonElement>(".done-modal-later")!.click();
    await vi.waitFor(() => expect(clearAll).toHaveBeenCalledTimes(1));
  });
});

describe("끝 화면 후기 칸", () => {
  it("DS1 주소가 없으면 후기 칸을 아예 안 그린다 — 눌리지 않는 빈 버튼을 두지 않는다", () => {
    const { root, ctx } = setup();
    doneScreen<null>({ restart: vi.fn() }).mount(ctx);
    expect(root.querySelector(".done-survey")).toBeNull();
    expect(root.textContent).toContain("끝났어요");
  });

  it("DS2 주소가 있으면 후기 칸이 뜨고, 새 창으로 열린다", () => {
    const { root, ctx } = setup();
    doneScreen<null>({ restart: vi.fn(), surveyUrl: FORM }).mount(ctx);
    const a = root.querySelector<HTMLAnchorElement>(".done-survey a");
    expect(a).not.toBeNull();
    expect(a!.href).toBe(FORM);
    expect(a!.target).toBe("_blank");
    // 새 창이 원래 창을 건드리지 못하게
    expect(a!.rel).toContain("noopener");
  });

  it("DS3 후기를 누르면 기록이 남는다 — 몇 명이 눌렀는지 세려고", () => {
    const { root, ctx, events } = setup();
    doneScreen<null>({ restart: vi.fn(), surveyUrl: FORM }).mount(ctx);
    root.querySelector<HTMLAnchorElement>(".done-survey a")!.click();
    expect(events.some((e) => e.name === "button" && e.button === "survey_open")).toBe(true);
  });

  it("DS4 후기 칸이 있어도 '다시 하기' 는 그대로 — 흐름이 막히지 않는다", () => {
    const { root, ctx } = setup();
    const restart = vi.fn();
    doneScreen<null>({ restart, surveyUrl: FORM }).mount(ctx);
    const again = [...root.querySelectorAll("button")].find((b) => b.textContent === "다시 하기");
    expect(again).toBeDefined();
    again!.click();
    expect(restart).toHaveBeenCalled();
  });

  it("DS5 지웠다는 안내는 후기 칸과 상관없이 그대로", () => {
    const { root, ctx } = setup();
    doneScreen<null>({ restart: vi.fn(), surveyUrl: FORM, remaining: () => 0 }).mount(ctx);
    expect(root.textContent).toContain("사진과 기록은 모두 지웠어요");
  });
});
