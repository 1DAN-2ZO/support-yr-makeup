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

  // #369 피드백 (10/9 실사용): 아이라이너에서 뒤로를 눌렀더니 눈썹이 아니라 참고 사진까지 갔다
  it("BK 부위 가이드에서 뒤로는 한 부위 앞으로 — 첫 부위에서만 예상 메이크업으로", () => {
    for (const [part, call, arg] of [["liner", "goPart", "brow"], ["shadow", "goPart", "liner"]] as const) {
      const { root, ctx } = setup();
      partGuideSlot<null>({ getPart: () => part }).mount(ctx);
      back(root)!.click();
      expect(ctx[call]).toHaveBeenCalledWith(arg);
    }
    const first = setup();
    partGuideSlot<null>({ getPart: () => "brow" }).mount(first.ctx);
    back(first.root)!.click();
    expect(first.go).toHaveBeenCalledWith("answer");
  });

  // 부위 순서: 눈썹 → 아이라이너 → 섀도우 → 입술 → 볼터치 → 쉐딩·하이라이트
  it("BK 돌아갈 곳 이름의 조사를 받침에 맞춘다 — '(으)로' 를 그대로 읽히지 않게", () => {
    const labelAt = (part: "liner" | "shadow" | "lip") => {
      const { root, ctx } = setup();
      partGuideSlot<null>({ getPart: () => part }).mount(ctx);
      return back(root)!.getAttribute("aria-label");
    };
    expect(labelAt("liner")).toBe("눈썹으로 돌아가기");      // ㅂ 받침 → 으로
    expect(labelAt("shadow")).toBe("아이라이너로 돌아가기");  // 받침 없음 → 로
    expect(labelAt("lip")).toBe("섀도우로 돌아가기");        // 받침 없음 → 로
  });

  it("BK 로고를 누르면 맨 처음 안내 화면으로 — 어느 화면에서든", () => {
    for (const make of [
      () => partGuideSlot<null>({ getPart: () => "liner" }),
      () => feedbackSlot<null>({ getFeedback: () => new Promise(() => {}) }),
      () => saveSlot<null>({ clearAll: async () => {} }),
    ]) {
      const { root, ctx, go } = setup();
      make().mount(ctx);
      const h = root.querySelector<HTMLButtonElement>(".slot-home");
      expect(h, "로고가 버튼이어야 한다").not.toBeNull();
      expect(h!.getAttribute("aria-label")).toBe("처음 안내 화면으로");
      h!.click();
      expect(go).toHaveBeenCalledWith("consent");
    }
  });

  it("BK 참고 사진 화면은 다시 그려도 뒤로 가는 길이 사라지지 않는다 (resetPage)", () => {
    const { root, ctx } = setup();
    partGuideSlot<null>({ getPart: () => "brow" }).mount(ctx);
    const row = root.querySelector(".slot-logo-row");
    expect(row).not.toBeNull();
    expect(row!.querySelector(".slot-back")).not.toBeNull();
  });
});
