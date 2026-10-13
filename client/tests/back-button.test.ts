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
    ["부위 가이드", () => partGuideSlot<null>({ getPart: () => "brow", clearAll: async () => {} }), "answer", "예상 메이크업으로 돌아가기"],
    ["피드백", () => feedbackSlot<null>({ getFeedback: () => new Promise(() => {}), clearAll: async () => {} }), "attempt", "시도사진으로 돌아가기"],
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

  // #369 피드백 (10/9 실사용): 아이라이너에서 뒤로를 눌렀더니 눈썹이 아니라 참고 사진까지 갔다
  it("BK 부위 가이드에서 뒤로는 한 부위 앞으로 — 첫 부위에서만 예상 메이크업으로", () => {
    for (const [part, call, arg] of [["liner", "goPart", "brow"], ["shadow", "goPart", "liner"]] as const) {
      const { root, ctx } = setup();
      partGuideSlot<null>({ getPart: () => part, clearAll: async () => {} }).mount(ctx);
      back(root)!.click();
      expect(ctx[call]).toHaveBeenCalledWith(arg);
    }
    const first = setup();
    partGuideSlot<null>({ getPart: () => "brow", clearAll: async () => {} }).mount(first.ctx);
    back(first.root)!.click();
    expect(first.go).toHaveBeenCalledWith("answer");
  });

  // 부위 순서: 눈썹 → 아이라이너 → 섀도우 → 입술 → 볼터치 → 쉐딩·하이라이트
  it("BK 돌아갈 곳 이름의 조사를 받침에 맞춘다 — '(으)로' 를 그대로 읽히지 않게", () => {
    const labelAt = (part: "liner" | "shadow" | "lip") => {
      const { root, ctx } = setup();
      partGuideSlot<null>({ getPart: () => part, clearAll: async () => {} }).mount(ctx);
      return back(root)!.getAttribute("aria-label");
    };
    expect(labelAt("liner")).toBe("눈썹으로 돌아가기");      // ㅂ 받침 → 으로
    expect(labelAt("shadow")).toBe("아이라이너로 돌아가기");  // 받침 없음 → 로
    expect(labelAt("lip")).toBe("섀도우로 돌아가기");        // 받침 없음 → 로
  });

  it("BK 로고를 누르면 처음부터 다시 — 지우기 전에 한 번 묻는다", async () => {
    const { root, ctx, go } = setup();
    const clearAll = vi.fn(async () => {});
    partGuideSlot<null>({ getPart: () => "liner", clearAll }).mount(ctx);

    const h = root.querySelector<HTMLButtonElement>(".slot-home");
    expect(h, "로고가 버튼이어야 한다").not.toBeNull();
    expect(h!.getAttribute("aria-label")).toBe("처음 안내 화면으로");

    h!.click();
    // 바로 지우지 않는다 — 되돌릴 수 없어서 먼저 묻는다
    expect(clearAll).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    const ask = document.querySelector(".done-modal");
    expect(ask, "확인 창이 떠야 한다").not.toBeNull();
    expect(ask!.textContent).toContain("지워져요");

    const yes = [...ask!.querySelectorAll("button")].find((b) => b.textContent === "지우고 다시 시작");
    yes!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("consent");
  });

  it("BK '그냥 둘게요' 를 누르면 아무것도 지우지 않고 보던 화면에 남는다", () => {
    const { root, ctx, go } = setup();
    const clearAll = vi.fn(async () => {});
    partGuideSlot<null>({ getPart: () => "liner", clearAll }).mount(ctx);
    root.querySelector<HTMLButtonElement>(".slot-home")!.click();
    const ask = document.querySelector(".done-modal")!;
    [...ask.querySelectorAll("button")].find((b) => b.textContent === "그냥 둘게요")!.click();
    expect(clearAll).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect(document.querySelector(".done-modal"), "창이 닫혀야 한다").toBeNull();
  });

  // 저장소만 지우면(clearAll) 앱이 메모리에 든 앞 세션의 맨얼굴 · 예상 메이크업 · 시도사진과 닫힌 사용 기록이 그대로 남는다 —
  // 끝내기는 "끝" 화면이 그 뒷정리(restart)를 하지만 로고 길은 그 화면을 안 거친다 (#404 ⑥ 리뷰)
  it.each([
    ["부위 가이드", (d: { clearAll: () => Promise<void>; startOver: () => Promise<void> }) => partGuideSlot<null>({ getPart: () => "liner", ...d })],
    ["피드백", (d: { clearAll: () => Promise<void>; startOver: () => Promise<void> }) => feedbackSlot<null>({ getFeedback: () => new Promise(() => {}), ...d })],
    ["저장", (d: { clearAll: () => Promise<void>; startOver: () => Promise<void> }) => saveSlot<null>(d)],
  ] as const)("BK %s — 처음부터 다시(startOver)를 주면 로고는 저장소만 지우는 clearAll 대신 그것을 부른다", async (_name, make) => {
    const { root, ctx, go } = setup();
    const clearAll = vi.fn(async () => {}), startOver = vi.fn(async () => {});
    make({ clearAll, startOver }).mount(ctx);
    root.querySelector<HTMLButtonElement>(".slot-home")!.click();
    const yes = [...document.querySelector(".done-modal")!.querySelectorAll("button")].find((b) => b.textContent === "지우고 다시 시작");
    yes!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(startOver).toHaveBeenCalledTimes(1);
    expect(clearAll).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith("consent");
  });

  it("BK 지울 길이 없으면 묻지 않고 안내 화면으로만 간다 — 안 지우면서 '지워져요' 라고 하지 않게", () => {
    const { root, ctx, go } = setup();
    partGuideSlot<null>({ getPart: () => "liner" }).mount(ctx);
    root.querySelector<HTMLButtonElement>(".slot-home")!.click();
    expect(document.querySelector(".done-modal")).toBeNull();
    expect(go).toHaveBeenCalledWith("consent");
  });

  it("BK 참고 사진 화면은 다시 그려도 뒤로 가는 길이 사라지지 않는다 (resetPage)", () => {
    const { root, ctx } = setup();
    partGuideSlot<null>({ getPart: () => "brow", clearAll: async () => {} }).mount(ctx);
    const row = root.querySelector(".slot-logo-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".slot-back")).not.toBeNull();
  });
});
