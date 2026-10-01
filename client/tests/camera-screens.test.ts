// @vitest-environment jsdom
// 화면 1(촬영) · 화면 4 가 공용 카메라 루프(#245)를 쓰나 — 카메라 새 장면에만 얼굴을 찾고, 화면 그리기(rAF)로는 안 찾는다. 떠나면 멈춘다.
// 카메라·모델·rVFC·rAF 는 전부 가짜. 얼굴은 안 찾아지는 장면만 (분석 횟수만 본다)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_GUIDE } from "@core/flow";
import { createLogger, memorySink } from "@core/log";
import type { Baseline, Versions } from "@core/types";
import { captureScreen, type CaptureDeps } from "@screens/capture";
import { liveScreen, type LiveDeps } from "@screens/live";
import type { ScreenContext } from "@screens/shell";
import { LMS } from "./helpers/synth-face";

const detect = vi.fn(() => ({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }));
vi.mock("@screens/landmarker", () => ({ createLandmarker: async () => ({ detectForVideo: detect, close: () => {} }) }));

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

type Cb = (now: number) => void;
const queue = () => {
  let n = 1;
  const m = new Map<number, Cb>();
  return { add: (cb: Cb) => { const h = n++; m.set(h, cb); return h; }, remove: (h: number) => { m.delete(h); }, fire: (t: number) => { const cbs = [...m.values()]; m.clear(); cbs.forEach((cb) => cb(t)); }, size: () => m.size };
};
let cam = queue(), draw = queue();
/** 카메라에 한 일 차례대로 — applyConstraints 의 "칸=값" · 끄기 "stop" */
let camLog: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  detect.mockClear();
  cam = queue(); draw = queue(); camLog = [];
  // 노출·색·초점 모두 수동 잠금이 되는 카메라 (지금 값도 알려 줌)
  const modes = ["manual", "continuous"];
  const track = {
    stop: () => { camLog.push("stop"); },
    getCapabilities: () => ({ exposureMode: modes, whiteBalanceMode: modes, focusMode: modes }),
    getSettings: () => ({ exposureTime: 166, iso: 400, colorTemperature: 4800, focusDistance: 0.3 }),
    applyConstraints: async (c: { advanced?: Record<string, unknown>[] }) => {
      for (const a of c.advanced ?? []) for (const [k, v] of Object.entries(a)) if (k.endsWith("Mode")) camLog.push(`${k}=${String(v)}`);
    },
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => stream }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  Object.assign(HTMLVideoElement.prototype, { requestVideoFrameCallback: cam.add, cancelVideoFrameCallback: cam.remove });
  vi.stubGlobal("requestAnimationFrame", draw.add);
  vi.stubGlobal("cancelAnimationFrame", draw.remove);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as { cancelVideoFrameCallback?: unknown }).cancelVideoFrameCallback;
});

function ctxOf(screen: "capture" | "live"): ScreenContext<null> {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  return { root, session: null, go: vi.fn(), goPart: vi.fn(), log: createLogger({ sid: "s1", screen, part: null, ver }, memorySink().sink) };
}

/** 화면을 띄우고 카메라 준비가 끝날 때까지 (wait: 흘려 보낼 시간 ms) */
async function mountCapture(wait = 2000): Promise<() => void> {
  const ctx = ctxOf("capture");
  const deps: CaptureDeps = {
    getShots: () => ({}), setShot: vi.fn(), getBaseline: () => null, setBaseline: vi.fn(),
    saveBare: async () => {}, setFaceShapeFrames: vi.fn(),
    events: { consent: vi.fn(), shot: vi.fn(), blocked: vi.fn(() => false), faceLost: vi.fn() } as unknown as CaptureDeps["events"],
    next: "looks",
  };
  const off = captureScreen<null>(deps).mount(ctx) as () => void;
  Array.from(ctx.root.querySelectorAll("button")).find((b) => b.textContent === CAPTURE_GUIDE.button)!.click();
  await vi.advanceTimersByTimeAsync(wait);
  return off;
}

async function mountLive(wait = 2000): Promise<() => void> {
  const ctx = ctxOf("live");
  const baseline = { lm: LMS, unit: { eye: 60, lip: 100, face: 300 }, foreheadL: 60, w: 600, h: 600, expression: null } as unknown as Baseline;
  const deps: LiveDeps = { getPart: () => "lip", getBaseline: () => baseline, getBaseAb: () => null, getLookParts: () => ({}), setCapture: vi.fn(), next: "result" };
  const off = liveScreen<null>(deps).mount(ctx) as () => void;
  await vi.advanceTimersByTimeAsync(wait);
  return off;
}

describe.each([
  ["촬영(화면 1)", mountCapture],
  ["화면 4", mountLive],
])("%s 카메라 루프", (_name, mount) => {
  it("CS1 화면만 다시 그려질 때는 얼굴을 안 찾고, 카메라 새 장면마다 한 번 찾는다", async () => {
    const off = await mount();
    for (let t = 16; t <= 64; t += 16) draw.fire(t);
    expect(detect).not.toHaveBeenCalled();
    cam.fire(33);
    cam.fire(66);
    expect(detect).toHaveBeenCalledTimes(2);
    off();
  });

  it("CS2 화면을 떠나면 더 안 찾는다 — 걸어 둔 예약도 지운다", async () => {
    const off = await mount();
    cam.fire(33);
    off();
    expect(cam.size()).toBe(0);
    cam.fire(66);
    draw.fire(80);
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("CS3 카메라를 잠그지 않는다 — 노출·색·초점 모두 자동 (DEFAULT_LOCKS, #267·#268: 잠그면 PC 웹캠이 하얗게·파랗게)", async () => {
    const off = await mount();
    expect(camLog.filter((e) => e.endsWith("=manual"))).toEqual([]);
    off();
  });

  it("CS4 켤 때 남아 있던 잠금을 풀고(자동으로), 끌 때도 풀고 나서 끈다 — PC 웹캠은 잠금을 기기에 저장한다 (#267)", async () => {
    const off = await mount();
    expect(camLog).toEqual(expect.arrayContaining(["exposureMode=continuous", "whiteBalanceMode=continuous", "focusMode=continuous"]));
    expect(camLog).not.toContain("stop");
    camLog = [];
    off();
    await vi.advanceTimersByTimeAsync(0);
    expect(camLog.at(-1)).toBe("stop");
    expect(camLog.slice(0, -1)).toEqual(expect.arrayContaining(["exposureMode=continuous", "whiteBalanceMode=continuous", "focusMode=continuous"]));
  });

  it("CS5 잠글 게 없으면 1.5초 안 기다린다 — 카메라가 켜지자마자 얼굴을 찾기 시작", async () => {
    const off = await mount(100);
    cam.fire(33);
    expect(detect).toHaveBeenCalledTimes(1);
    off();
  });
});
