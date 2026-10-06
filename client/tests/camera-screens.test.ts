// @vitest-environment jsdom
// 화면 1(촬영) · 화면 4 · 2-b AR · 화면 6 정면 1장이 공용 카메라 루프(#245)를 쓰나 — 카메라 새 장면에만 얼굴을 찾고, 화면 그리기(rAF)로는 안 찾는다. 떠나면 멈춘다.
// 카메라·모델·rVFC·rAF 는 전부 가짜. 얼굴은 안 찾아지는 장면만 (분석 횟수만 본다)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_GUIDE } from "@core/flow";
import { GATE_TEXT } from "@core/gate";
import { LIVE_SMOOTH } from "@core/smooth-params";
import { LM } from "@core/landmarks";
import { createLogger, memorySink } from "@core/log";
import type { Baseline, Pt, Versions } from "@core/types";
import { captureScreen, type CaptureDeps } from "@screens/capture";
import { fullRenderScreen } from "@screens/fullrender";
import { LIVE_TEXT, liveScreen, type LiveDeps } from "@screens/live";
import { startReviewShot } from "@screens/review-shot";
import { ATTEMPT_TEXT, attemptScreen } from "@screens/attempt";
import type { ScreenContext } from "@screens/shell";
import { LMS } from "./helpers/synth-face";

type Res = { faceLandmarks: Pt[][]; faceBlendshapes: never[]; facialTransformationMatrixes: never[] };
const NO_FACE: Res = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
const detect = vi.fn((): Res => NO_FACE);
vi.mock("@screens/landmarker", () => ({ createLandmarker: async () => ({ detectForVideo: detect, close: () => {} }) }));
// 픽셀 측정은 jsdom 에 캔버스가 없어 가짜로 — 선명·이마 밝기는 늘 괜찮은 값
vi.mock("@screens/frame-measure", () => ({
  sharpnessOf: () => 400,
  foreheadLabOf: () => ({ skin: { L: 62, a: 12, b: 16 }, raw: { L: 62, a: 12, b: 16 } }),
  grabFrame: () => document.createElement("canvas"),
}));
// 2-b AR 은 WebGL 로 그린다 — jsdom 에 없으니 그리기만 가짜로 (분석 횟수·카메라 잠금만 본다)
vi.mock("@screens/makeup-gl", () => ({ MakeupGl: class { render(): void {} dispose(): void {} } }));

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
  detect.mockImplementation(() => NO_FACE);
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
  // 2-b AR 은 영상 크기가 0 이면 그 장면을 건너뛴다
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);  Object.assign(HTMLVideoElement.prototype, { requestVideoFrameCallback: cam.add, cancelVideoFrameCallback: cam.remove });
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

function ctxOf(screen: "capture" | "live" | "fullrender" | "review" | "attempt"): ScreenContext<null> {
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

/** 2-b AR (⑥) — 2026-10-01 공용 루프로 옮김 (#245) */
async function mountFullRender(wait = 2000): Promise<() => void> {
  const ctx = ctxOf("fullrender");
  const off = fullRenderScreen<null>({ getLookId: () => "edgy" }).mount(ctx) as () => void;
  await vi.advanceTimersByTimeAsync(wait);
  return off;
}

/** 화면 6 들어올 때 정면 1장 (⑥) */
async function mountReviewShot(wait = 2000): Promise<() => void> {
  const ctx = ctxOf("review");
  const off = startReviewShot(ctx.root, vi.fn(), ctx.log);
  await vi.advanceTimersByTimeAsync(wait);
  return off;
}

/** 화면 5 시도사진 (⑥, 2026-10-06 새 흐름) — "찍기 시작" 을 눌러야 카메라를 켠다 */
async function mountAttempt(wait = 2000): Promise<() => void> {
  const ctx = ctxOf("attempt");
  const off = attemptScreen<null>({ setAttempt: vi.fn(), next: "feedback" }).mount(ctx) as () => void;
  Array.from(ctx.root.querySelectorAll("button")).find((b) => b.textContent === ATTEMPT_TEXT.start)!.click();
  await vi.advanceTimersByTimeAsync(wait);
  return off;
}

describe.each([
  ["촬영(화면 1)", mountCapture],
  ["시도사진(화면 5)", mountAttempt],
  ["화면 4", mountLive],
  ["2-b AR", mountFullRender],
  ["리뷰 정면 1장(화면 6)", mountReviewShot],
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

// 화면 4 확인받기 (#235) — 각도·안정에 3초 넘게 막히면 버튼을 켠다. 얼굴은 합성 얼굴(600×600)
describe("화면 4 확인받기", () => {
  // 합성 얼굴은 턱(152)이 가운데라 숙인 것으로 잰다 → 턱을 내려 정면으로 (live-run.test 와 같게)
  const FACE: Pt[] = LMS.map((p, i) => (i === LM.chin ? { x: 300, y: 464 } : p));
  /** 코끝을 눈꼬리 거리의 11% 옆으로 — 기준 각도 차 약 13.6° (한계 12°) */
  const D = Math.hypot(FACE[LM.eyeB.outer]!.x - FACE[LM.eyeA.outer]!.x, FACE[LM.eyeB.outer]!.y - FACE[LM.eyeA.outer]!.y);
  const TURNED = FACE.map((p, i) => (i === 1 || i === 4 ? { x: p.x + D * 0.11, y: p.y } : p));
  const seen = (lm: Pt[]): Res => ({ ...NO_FACE, faceLandmarks: [lm.map((p) => ({ x: p.x / 600, y: p.y / 600 }))] });

  async function open(part: "liner" | "lip" = "liner"): Promise<{ root: HTMLElement; off: () => void }> {
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(600);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(600);
    const ctx = ctxOf("live");
    const baseline = { lm: FACE, unit: { eye: 60, lip: 100, face: 300 }, foreheadL: 62, w: 600, h: 600, expression: null } as unknown as Baseline;
    const deps: LiveDeps = { getPart: () => part, getBaseline: () => baseline, getBaseAb: () => null, getLookParts: () => ({}), setCapture: vi.fn(), next: "result" };
    const off = liveScreen<null>(deps).mount(ctx) as () => void;
    await vi.advanceTimersByTimeAsync(100);
    return { root: ctx.root, off };
  }

  it("LP1 각도 차로 3초 넘게 막히면 버튼이 켜진다 — 문구는 안내 그대로, 누르면 모은다", async () => {
    const { root, off } = await open();
    detect.mockImplementation(() => seen(TURNED));
    const btn = root.querySelector<HTMLButtonElement>("button.live-btn")!;
    const line = root.querySelector(".cam-gate")!;
    let t = 1000;
    for (; t < 1000 + 2900; t += 33) cam.fire(t);
    expect(btn.disabled).toBe(true);
    expect(line.textContent).toBe(GATE_TEXT.turnRight);
    for (; t < 1000 + 3200; t += 33) cam.fire(t);
    expect(btn.disabled).toBe(false);
    expect(line.textContent).toBe(GATE_TEXT.turnRight);
    expect(line.classList.contains("ready")).toBe(false);
    btn.click();
    expect(line.textContent).toBe(LIVE_TEXT.capturing);
    off();
  });

  it("LP2 정면이면 바로(안정 2프레임) 켜진다", async () => {
    const { root, off } = await open();
    detect.mockImplementation(() => seen(FACE));
    const btn = root.querySelector<HTMLButtonElement>("button.live-btn")!;
    cam.fire(1000);
    expect(btn.disabled).toBe(true);
    cam.fire(1033);
    expect(btn.disabled).toBe(false);
    expect(root.querySelector(".cam-gate")!.classList.contains("ready")).toBe(true);
    off();
  });

  it("LP3 주소에 ?tune 이면 떨림 필터 슬라이더 세 개 (2-b 와 같은 것) — 화면 4 값에서 시작", async () => {
    window.history.pushState({}, "", "/?tune");
    try {
      const { root, off } = await open();
      const rs = Array.from(root.querySelectorAll<HTMLInputElement>(".ar-tune input[type=range]"));
      expect(rs.map((r) => Number(r.value))).toEqual([LIVE_SMOOTH.minCutoff, LIVE_SMOOTH.beta, LIVE_SMOOTH.dCutoff]);
      off();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("LP4 입술을 가로 창에서 — 평소엔 '세로로 돌려 주세요' 로 막고, 주소에 ?norotate 면 안 막는다 (개발용 · PC 창은 늘 가로, #284 리뷰)", async () => {
    // 이 묶음의 미디어 쿼리는 늘 가로 (matches: true)
    const run = async (): Promise<{ text: string | null; disabled: boolean }> => {
      const { root, off } = await open("lip");
      detect.mockImplementation(() => seen(FACE));
      for (let t = 1000; t < 1100; t += 33) cam.fire(t);
      const r = { text: root.querySelector(".cam-gate")!.textContent, disabled: root.querySelector<HTMLButtonElement>("button.live-btn")!.disabled };
      off();
      return r;
    };
    expect(await run()).toEqual({ text: GATE_TEXT.toPortrait, disabled: true });
    window.history.pushState({}, "", "/?norotate");
    try {
      const r = await run();
      expect(r.text).not.toBe(GATE_TEXT.toPortrait);
      expect(r.disabled).toBe(false);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
