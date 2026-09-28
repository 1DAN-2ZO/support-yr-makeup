// @vitest-environment jsdom
// 화면 4 (실시간 테두리) — 카메라를 열기 전에 막히는 경우만. 프레임 진행은 live-run.test.ts
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";
import { LIVE_TEXT, deliverBundle, liveScreen, type LiveDeps } from "@screens/live";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup(over: Partial<LiveDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const go = vi.fn();
  const ctx: ScreenContext<null> = { root, session: null, go, goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "live", part: "liner", ver }, memorySink().sink) };
  const deps: LiveDeps = {
    getPart: () => "liner", getBaseline: () => null, getBaseAb: () => null,
    getLookParts: () => ({}), setCapture: vi.fn(), next: "result", ...over,
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

// 확인받기 묶음 → 비트맵 → 세션 → 화면 5 (#167 리뷰: 실패하면 멈추고, 떠나도 끌려오던 곳)
describe("deliverBundle", () => {
  const bundle = { frames: ["a", "b", "c"], pts: [[], [], []], handOverlap: [null, null, null], foreheadL: [60, 60, 60] };
  const bmp = (i: string) => Promise.resolve(`bmp:${i}` as unknown as ImageBitmap);
  const opts = (over: Partial<Parameters<typeof deliverBundle<string>>[1]> = {}) => {
    const sink = memorySink();
    return {
      part: "liner" as const, toBitmap: bmp, mounted: () => true, setCapture: vi.fn(), go: vi.fn(), next: "result" as const,
      log: createLogger({ sid: "s1", screen: "live", part: "liner", ver }, sink.sink), sink, ...over,
    };
  };

  it("D1 바꾸면 그 부위에 두고 화면 5 로", async () => {
    const o = opts();
    expect(await deliverBundle(bundle, o)).toBe("delivered");
    expect(o.setCapture).toHaveBeenCalledWith("liner", { ...bundle, frames: ["bmp:a", "bmp:b", "bmp:c"] });
    expect(o.go).toHaveBeenCalledWith("result");
  });

  it("D2 바꾸는 사이 화면을 떠났으면 아무것도 안 한다 (결과로 끌려오지 않게)", async () => {
    let on = true;
    const o = opts({ mounted: () => on, toBitmap: (i) => { on = false; return bmp(i); } });
    expect(await deliverBundle(bundle, o)).toBe("left");
    expect(o.setCapture).not.toHaveBeenCalled();
    expect(o.go).not.toHaveBeenCalled();
  });

  it("D3 바꾸다 실패하면 화면 4 를 다시 연다 (멈추지 않게) + 오류 기록", async () => {
    const o = opts({ toBitmap: () => Promise.reject(new Error("oom")) });
    expect(await deliverBundle(bundle, o)).toBe("failed");
    expect(o.setCapture).not.toHaveBeenCalled();
    expect(o.go).toHaveBeenCalledWith("live");
    expect(JSON.stringify(o.sink.events)).toContain("bitmap:");
  });

  it("D4 실패했는데 이미 떠났으면 다시 열지 않는다", async () => {
    let on = true;
    const o = opts({ mounted: () => on, toBitmap: () => { on = false; return Promise.reject(new Error("oom")); } });
    expect(await deliverBundle(bundle, o)).toBe("left");
    expect(o.go).not.toHaveBeenCalled();
  });
});
