// @vitest-environment jsdom
// 화장 템플릿 고르기 (#420) — 지금은 화면만. 고른 뒤 예상 메이크업을 만드는 연결은 아직 없다.
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { TEMPLATES, templateById } from "@core/templates";
import type { Versions } from "@core/types";
import { templatesSlot } from "@screens/flow-slots";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const go = vi.fn();
  const ctx: ScreenContext<null> = {
    root, session: null, go, goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "templates", part: null, ver }, memorySink().sink),
  };
  templatesSlot<null>({ getPart: () => null, clearAll: async () => {} }).mount(ctx);
  return { root, ctx, go };
}
const cards = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>(".tpl-card")];

describe("화장 템플릿 고르기 (#420)", () => {
  it("TP1 템플릿 10종이 목록 순서대로 나온다", () => {
    expect(TEMPLATES).toHaveLength(10);
    const { root } = setup();
    expect(cards(root).map((c) => c.querySelector("strong")?.textContent))
      .toEqual(TEMPLATES.map((t) => t.name));
  });

  it("TP2 카드마다 썸네일 주소가 붙는다 — 번호로 찾을 수 있다", () => {
    const { root } = setup();
    const srcs = cards(root).map((c) => c.querySelector("img")?.getAttribute("src"));
    expect(srcs).toEqual(TEMPLATES.map((t) => t.thumb));
    for (const t of TEMPLATES) expect(templateById(t.id)).toEqual(t);
  });

  it("TP3 고르면 그 카드만 켜진다 — 색만이 아니라 aria-pressed 로도", () => {
    const { root } = setup();
    const c = cards(root);
    c[2]!.click();
    expect(c.filter((x) => x.classList.contains("is-on"))).toHaveLength(1);
    expect(c[2]!.getAttribute("aria-pressed")).toBe("true");
    c[5]!.click();
    expect(c[2]!.getAttribute("aria-pressed")).toBe("false");
    expect(c[5]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("TP4 아직 이어지지 않았다고 말한다 — 눌러도 화면을 넘기지 않는다", () => {
    const { root, go } = setup();
    cards(root)[0]!.click();
    const note = root.querySelector(".tpl-note");
    expect(note?.textContent).toContain("곧 이어져요");
    expect(go).not.toHaveBeenCalled();
  });

  it("TP5 이름의 조사를 받침에 맞춘다 — '을(를)' 을 그대로 읽히지 않게", () => {
    const { root } = setup();
    const c = cards(root);
    const pick = (name: string) => {
      const i = TEMPLATES.findIndex((t) => t.name === name);
      c[i]!.click();
      return root.querySelector(".tpl-note")?.textContent ?? "";
    };
    expect(pick("가을")).toContain("가을을 골랐어요");     // ㄹ 받침 → 을
    expect(pick("누드")).toContain("누드를 골랐어요");     // 받침 없음 → 를
  });

  it("TP6 뒤로는 참고 사진 화면으로", () => {
    const { root, go } = setup();
    root.querySelector<HTMLButtonElement>(".slot-back")!.click();
    expect(go).toHaveBeenCalledWith("answer");
  });
});
