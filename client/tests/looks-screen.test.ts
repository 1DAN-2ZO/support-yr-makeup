// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { CONTOUR_PRODUCTS, LOOKS } from "@core/looks";
import { standardPlan } from "@core/personalize";
import type { Versions } from "@core/types";
import { fullRenderScreen } from "@screens/fullrender";
import { looksScreen } from "@screens/looks";
import type { ScreenContext } from "@screens/shell";

/** 첫 화장 (rules/looks.json 순서) — id 를 박지 않는다: 화장 목록이 바뀌어도 "첫 카드" 의 뜻은 같다 */
const FIRST = LOOKS[0]!.id;

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

function setup(lookId: string | null = null) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const state = { lookId };
  const go = vi.fn();
  const ctx: ScreenContext<null> = {
    root,
    session: null,
    go,
    goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "looks", part: null, ver }, m.sink),
  };
  const deps = {
    getLookId: () => state.lookId,
    setLookId: (id: string) => {
      state.lookId = id;
    },
  };
  return { root, ctx, go, deps, state, events: m.events };
}

function cards(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button.look-card")];
}

function byText(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  );
  if (!found) throw new Error(`"${text}" 버튼이 없습니다`);
  return found;
}

describe("화면 2 — 룩 선택", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("화장 10개가 처음부터 전부 눌린다 — 기다릴 서버 그림이 없다 (2026-09-29)", () => {
    const { root, ctx, deps } = setup();
    looksScreen<null>(deps).mount(ctx);
    const cs = cards(root);
    expect(cs).toHaveLength(LOOKS.length);
    expect(cs.every((c) => !c.disabled)).toBe(true);
    expect(cs[0]?.textContent).toContain(LOOKS[0]!.name);
  });

  it("대표 이미지가 없으면 그 화장의 색 견본을 보여 준다", () => {
    const { root, ctx, deps } = setup();
    looksScreen<null>(deps).mount(ctx);
    expect(root.querySelectorAll(".look-thumb .swatch i").length).toBeGreaterThan(0);
  });

  it("누르면 그 화장을 고르고 바로 2-b(AR)로 간다 — 기다림 화면이 없다 (2026-10-05: 얼굴을 재서 화장을 바꾸는 단계를 뺐다)", () => {
    const { root, ctx, go, deps, state } = setup();
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    expect(state.lookId).toBe(FIRST);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith("fullrender");
    expect(root.querySelector(".personalizing")).toBeNull();
    expect(root.querySelector("[role=status]")).toBeNull();
  });

  it("화면에 '개인화' · '조정' 이라는 말이 없다 — 누르기 전에도, 누른 뒤에도", () => {
    const { root, ctx, deps } = setup();
    looksScreen<null>(deps).mount(ctx);
    expect(root.textContent).not.toMatch(/개인화|조정/);
    expect(root.querySelector("p.muted")?.textContent).toBe("누르면 내 얼굴에 입혀 볼 수 있어요.");
    (cards(root)[1] as HTMLButtonElement).click();
    expect(root.textContent).not.toMatch(/개인화|조정/);
  });

  it("다른 화장을 누르면 그 화장으로 간다", () => {
    const { root, ctx, go, deps, state } = setup(FIRST);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[1] as HTMLButtonElement).click();
    expect(state.lookId).toBe(LOOKS[1]!.id);
    expect(go).toHaveBeenCalledWith("fullrender");
  });
});

describe("화면 2-b — AR 완성 예상 (카메라를 못 열면 서버 그림)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("카메라를 못 쓰면 안내하고, 그래도 '화장하러 가기' 로 부위 반복을 시작한다", () => {
    const { root, ctx, go, deps } = setup(FIRST);
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector("h1")?.textContent).toContain(LOOKS[0]?.name ?? "");
    expect(root.querySelector(".full-img")?.textContent).toContain("미리보기를 볼 수 없어요");
    const start = byText(root, "화장하러 가기");
    start.click();
    expect(go).toHaveBeenCalledWith("guide");
  });

  it("쓰는 제품을 보여 준다 — 근거 문장 칸은 없다 (2026-10-05: 얼굴을 재서 바꾸는 것이 없어 말할 근거도 없다)", () => {
    const { root, ctx, deps } = setup(FIRST);
    fullRenderScreen<null>({ ...deps, getPlan: () => standardPlan() }).mount(ctx);
    expect(root.querySelector(".ar-why")).toBeNull();
    const items = root.querySelectorAll(".look-detail li");
    expect(items).toHaveLength((LOOKS[0]?.products.length ?? 0) + CONTOUR_PRODUCTS.length);
  });

  it("맨 위에도 뒤로 가기가 있다 — 카메라·제품 목록에 밀려 아래 버튼이 안 보여도 (2026-09-29 폰)", () => {
    const { root, ctx, go, deps } = setup(FIRST);
    fullRenderScreen<null>(deps).mount(ctx);
    const top = root.querySelector<HTMLButtonElement>(".fullrender > .back");
    expect(top).not.toBeNull();
    expect(root.querySelector(".fullrender")?.firstElementChild).toBe(top);
    top!.click();
    expect(go).toHaveBeenCalledWith("looks");
  });

  it("'화장하러 가기' 는 부위 반복으로 간다 (화면 3 완성본은 쌩얼 + 같은 계획으로 다시 그림, #192)", () => {
    const { root, ctx, go, deps } = setup(FIRST);
    fullRenderScreen<null>(deps).mount(ctx);
    byText(root, "화장하러 가기").click();
    expect(go).toHaveBeenCalledWith("guide");
  });

  it("다른 화장 보기로 화면 2 로 돌아간다", () => {
    const { root, ctx, go, deps } = setup(FIRST);
    fullRenderScreen<null>(deps).mount(ctx);
    byText(root, "다른 화장 보기").click();
    expect(go).toHaveBeenCalledWith("looks");
  });
});
