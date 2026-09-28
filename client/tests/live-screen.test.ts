// @vitest-environment jsdom
// 화면 4 (실시간 테두리) — 카메라를 열기 전에 막히는 경우만. 프레임 진행은 live-run.test.ts
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";
import { LIVE_TEXT, liveScreen, type LiveDeps } from "@screens/live";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup(over: Partial<LiveDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const go = vi.fn();
  const ctx: ScreenContext<null> = { root, session: null, go, goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "live", part: "liner", ver }, memorySink().sink) };
  const deps: LiveDeps = {
    getPart: () => "liner", getBaseline: () => null, getBaseAb: () => null, getLookParts: () => ({}),
    setCapture: vi.fn(), next: "result", ...over,
  };
  return { root, ctx, go, deps };
}

describe("화면 4", () => {
  it("LS1 맨얼굴 기준이 없으면 카메라를 열지 않고 촬영으로 돌려보낸다", () => {
    const gum = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: gum }, configurable: true });
    const { root, ctx, go, deps } = setup();
    liveScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain(LIVE_TEXT.noBaseline);
    expect(gum).not.toHaveBeenCalled();
    const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent === LIVE_TEXT.toCapture);
    b!.click();
    expect(go).toHaveBeenCalledWith("capture");
  });

  it("LS2 부위가 없으면 한 줄만", () => {
    const { root, ctx, deps } = setup({ getPart: () => null });
    liveScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain(LIVE_TEXT.noPart);
  });
});
