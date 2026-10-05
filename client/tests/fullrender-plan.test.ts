// @vitest-environment jsdom
// 2-b AR 은 늘 표준 계획으로 그린다 (2026-10-05) — 계획을 안 넘겨도 카메라 얼굴을 재서 규칙 계획을 만들지 않는다.
// 카메라 · 모델 · WebGL · 그리기는 가짜. 그리기 함수가 받은 계획만 본다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { standardPlan } from "@core/personalize";
import type { Pt, Versions } from "@core/types";
import { fullRenderScreen } from "@screens/fullrender";
import type { ScreenContext } from "@screens/shell";
import { LMS } from "./helpers/synth-face";

const paint = vi.fn();
vi.mock("@screens/makeup-paint", () => ({ paintMakeup: (...a: unknown[]) => paint(...a), paintLookOf: () => ({}) }));
vi.mock("@screens/makeup-gl", () => ({ MakeupGl: class { render(): void {} dispose(): void {} } }));
// 합성 얼굴(600×600)을 그대로 돌려준다
const face = LMS.map((p: Pt) => ({ x: p.x / 600, y: p.y / 600 }));
vi.mock("@screens/landmarker", () => ({ createLandmarker: async () => ({ detectForVideo: () => ({ faceLandmarks: [face], faceBlendshapes: [], facialTransformationMatrixes: [] }), close: () => {} }) }));

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };
type Cb = (now: number) => void;
let frames: Cb[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  paint.mockClear();
  frames = [];
  const track = { stop: () => {}, getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => {} };
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as unknown as CanvasRenderingContext2D);
  Object.assign(HTMLVideoElement.prototype, { requestVideoFrameCallback: (cb: Cb) => frames.push(cb), cancelVideoFrameCallback: () => {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as { cancelVideoFrameCallback?: unknown }).cancelVideoFrameCallback;
});

async function mount(deps: Partial<Parameters<typeof fullRenderScreen>[0]> = {}): Promise<() => void> {
  document.body.innerHTML = `<div id="root"></div>`;
  const ctx: ScreenContext<null> = { root: document.getElementById("root") as HTMLElement, session: null, go: vi.fn(), goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "fullrender", part: null, ver }, memorySink().sink) };
  const off = fullRenderScreen<null>({ getLookId: () => "edgy", ...deps }).mount(ctx) as () => void;
  await vi.advanceTimersByTimeAsync(100);
  frames.shift()?.(33);
  return off;
}

describe("2-b AR 화장 계획", () => {
  it("FP1 계획을 안 넘기면 표준 계획으로 그린다 — 카메라 얼굴을 재서 모양을 바꾸지 않는다", async () => {
    const off = await mount();
    expect(paint).toHaveBeenCalledTimes(1);
    const [, , , , plan, style] = paint.mock.calls[0] as unknown[];
    expect(plan).toEqual(standardPlan());
    expect(style).toBe("winged");
    off();
  });

  it("FP2 넘긴 계획이 있으면 그 계획으로 그린다", async () => {
    const given = { ...standardPlan(), linerThick: { scale: 1.2, source: "rule" as const } };
    const off = await mount({ getPlan: () => given });
    expect((paint.mock.calls[0] as unknown[])[4]).toBe(given);
    off();
  });
});
