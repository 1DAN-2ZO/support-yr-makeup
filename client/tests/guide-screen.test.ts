// @vitest-environment jsdom
// 화면 3 (부위 완성본) — 글·버튼·부위 없을 때. 그림(완성본 크롭)은 브라우저에서만
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { LOOKS } from "@core/looks";
import type { Versions } from "@core/types";
import { GUIDE_TEXT, guideScreen, type GuideDeps } from "@screens/guide";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };
const look = LOOKS[0]!;

function setup(over: Partial<GuideDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const go = vi.fn(), goPart = vi.fn();
  const ctx: ScreenContext<null> = { root, session: null, go, goPart, log: createLogger({ sid: "s1", screen: "guide", part: "liner", ver }, memorySink().sink) };
  const deps: GuideDeps = {
    getPart: () => "liner", firstPart: () => "brow", getBaseline: () => null, getLook: () => look,
    getFaceShape: () => null, fullRenderUrl: () => null, ...over,
  };
  return { root, ctx, go, goPart, deps };
}

describe("화면 3", () => {
  it("GS1 제목 · 근거 한 줄 · 필요한 것 한 줄", () => {
    const { root, ctx, deps } = setup();
    guideScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("아이라이너");
    expect(root.textContent).toContain(look.rationale.liner!);
    expect(root.textContent).toContain("지금 필요한 것:");
  });

  it("GS2 '따라 하기' → 화면 4", () => {
    const { root, ctx, go, deps } = setup();
    guideScreen<null>(deps).mount(ctx);
    const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent === GUIDE_TEXT.start)!;
    b.click();
    expect(go).toHaveBeenCalledWith("live");
  });

  it("GS3 부위가 안 정해졌으면(2-b '시작'에서 바로) 첫 부위로", () => {
    const { ctx, goPart, deps } = setup({ getPart: () => null });
    guideScreen<null>(deps).mount(ctx);
    expect(goPart).toHaveBeenCalledWith("brow");
  });

  it("GS4 그림이 하나도 없으면 '준비 중' — 흐름은 막지 않는다", () => {
    const { root, ctx, deps } = setup();
    guideScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".guide-img")?.textContent).toBe(GUIDE_TEXT.noImage);
    expect(Array.from(root.querySelectorAll("button")).some((x) => x.textContent === GUIDE_TEXT.start)).toBe(true);
  });
});
