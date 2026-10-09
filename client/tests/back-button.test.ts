// @vitest-environment jsdom
// 뒤로 가기 (#369) — 화면마다 앞 화면으로 돌아가는 길. 화살표는 글자가 없으니 aria-label 로 어디로 가는지 알린다.
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";
import { feedbackSlot, partGuideSlot, saveSlot } from "@screens/flow-slots";
import { attemptScreen } from "@screens/attempt";
import type { Screen, ScreenContext } from "@screens/shell";

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

const back = (root: HTMLElement) => root.querySelector<HTMLButtonElement>(".slot-back");

describe("뒤로 가기 (#369)", () => {
  const cases: [string, () => Screen<null>, string, string][] = [
    ["부위 가이드", () => partGuideSlot<null>({ getPart: () => "brow" }), "answer", "예상 메이크업으로 돌아가기"],
    ["피드백", () => feedbackSlot<null>({ getFeedback: () => new Promise(() => {}) }), "attempt", "시도사진으로 돌아가기"],
    ["저장", () => saveSlot<null>({ clearAll: async () => {} }), "feedback", "피드백으로 돌아가기"],
    ["시도사진", () => attemptScreen<null>({ setAttempt: () => {}, next: "feedback" }), "partguide", "부위 가이드로 돌아가기"],
  ];

  for (const [name, make, to, label] of cases) {
    it(`BK ${name} — 뒤로 누르면 ${to} 로, 어디로 가는지 읽어 준다`, () => {
      const { root, ctx, go } = setup();
      make().mount(ctx);
      const b = back(root);
      expect(b, "뒤로 가는 화살표가 있어야 한다").not.toBeNull();
      expect(b!.getAttribute("aria-label")).toBe(label);
      b!.click();
      expect(go).toHaveBeenCalledWith(to);
    });
  }

  it("BK 참고 사진 화면은 다시 그려도 뒤로 가는 길이 사라지지 않는다 (resetPage)", () => {
    const { root, ctx } = setup();
    partGuideSlot<null>({ getPart: () => "brow" }).mount(ctx);
    const row = root.querySelector(".slot-logo-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".slot-back")).not.toBeNull();
  });
});
