// @vitest-environment jsdom
// 화면 5 시도사진 화면 — 카메라 · 모델 · 측정은 가짜. 찍는 차례와 결과 넘기기만 본다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { STEP_TEXT } from "@core/capture-run";
import type { Pt, Versions } from "@core/types";
import { ATTEMPT_TEXT, attemptScreen, type AttemptShots } from "@screens/attempt";
import type { ScreenContext } from "@screens/shell";
import { LMS } from "./helpers/synth-face";

type Res = { faceLandmarks: Pt[][]; faceBlendshapes: { categories: { categoryName: string; score: number }[] }[]; facialTransformationMatrixes: never[] };
const face = LMS.map((p: Pt) => ({ x: p.x / 600, y: p.y / 600 }));
let eyes: "open" | "closed" = "open";
const detect = vi.fn((): Res => ({
  faceLandmarks: [face],
  faceBlendshapes: [{ categories: [{ categoryName: "eyeBlinkLeft", score: eyes === "closed" ? 0.9 : 0.05 }, { categoryName: "eyeBlinkRight", score: eyes === "closed" ? 0.9 : 0.05 }] }],
  facialTransformationMatrixes: [],
}));
vi.mock("@screens/landmarker", () => ({ createLandmarker: async () => ({ detectForVideo: detect, close: () => {} }) }));
// 측정은 늘 통과하는 값 — 화면이 판정 규칙(① capture-run)을 그대로 부르는지만 본다
vi.mock("@core/capture-measure", async (orig) => ({
  ...(await orig<typeof import("@core/capture-measure")>()),
  yawFromLandmarks: () => ({ yaw: 0, pitch: 0 }),
  faceRatioOf: () => 0.5, faceInsetOf: () => 0.1, eyeWidthPxOf: () => 120,
}));
vi.mock("@screens/frame-measure", () => ({
  sharpnessOf: () => 400,
  foreheadLabOf: () => ({ skin: { L: 62, a: 12, b: 16 }, raw: { L: 62, a: 12, b: 16 } }),
  grabFrame: () => { grabs++; return document.createElement("canvas"); },
}));
let encoded = 0;
let grabs = 0;
let encodeSides: (number | undefined)[] = [];
vi.mock("@screens/image-encode", () => ({
  BARE_MAX_SIDE: Number.POSITIVE_INFINITY,
  encodeForStore: async (_src: unknown, maxSide?: number) => { encodeSides.push(maxSide); return { blob: new Blob([`jpeg${++encoded}`]), w: 600, h: 600 }; },
}));

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };
type Cb = (now: number) => void;
let frames: Cb[] = [];
let stopped = 0;
const fire = (t: number): void => { const cbs = frames; frames = []; cbs.forEach((cb) => cb(t)); };

let urls: string[] = [], revoked: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  urls = []; revoked = [];
  // jsdom 에는 객체 URL 이 없다 — 만든 것 · 돌려준 것을 센다
  Object.assign(URL, { createObjectURL: () => { const u = `blob:t${urls.length}`; urls.push(u); return u; }, revokeObjectURL: (u: string) => { revoked.push(u); } });
  detect.mockClear();
  eyes = "open"; frames = []; stopped = 0; encoded = 0; encodeSides = []; grabs = 0;
  const track = { stop: () => { stopped++; }, getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => {} };
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }) }, configurable: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(600);
  Object.assign(HTMLVideoElement.prototype, { requestVideoFrameCallback: (cb: Cb) => frames.push(cb), cancelVideoFrameCallback: () => {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (HTMLVideoElement.prototype as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback;
  delete (HTMLVideoElement.prototype as { cancelVideoFrameCallback?: unknown }).cancelVideoFrameCallback;
});

function mount(setAttempt = vi.fn()) {
  document.body.innerHTML = `<div id="root"></div>`;
  const ctx: ScreenContext<null> = { root: document.getElementById("root") as HTMLElement, session: null, go: vi.fn(), goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "attempt", part: null, ver }, memorySink().sink) };
  const off = attemptScreen<null>({ setAttempt, next: "feedback" }).mount(ctx) as () => void;
  return { ctx, off, setAttempt };
}
const start = async (ctx: ScreenContext<null>) => {
  [...ctx.root.querySelectorAll("button")].find((b) => b.textContent === ATTEMPT_TEXT.start)!.click();
  await vi.advanceTimersByTimeAsync(100);
};
/** t0 부터 ms 동안 33ms 간격으로 장면을 보낸다 */
const run = async (t0: number, ms: number): Promise<number> => {
  let t = t0;
  for (; t < t0 + ms; t += 33) fire(t);
  await vi.advanceTimersByTimeAsync(0);
  return t;
};

describe("화면 5 시도사진", () => {
  it("AS1 시작 전 안내 — 화장을 다 했으면 찍는다. 누르기 전에는 카메라를 안 켠다", () => {
    const { ctx } = mount();
    expect(ctx.root.textContent).toContain(ATTEMPT_TEXT.title);
    expect(frames).toHaveLength(0);
    expect(detect).not.toHaveBeenCalled();
  });

/** 시작해서 눈 뜬 묶음을 찍는다 — 찍은 뒤 미리보기까지 (눈 감은 장은 뺐다 #386) */
async function shoot(_ctx: ScreenContext<null>, t0 = 1000): Promise<number> {
  eyes = "open";
  const t = await run(t0, 3000);                  // 자리 잡기(1.5초) + 안정 + 다섯 장 묶음
  await vi.advanceTimersByTimeAsync(0);
  return t;
}
const buttonOf = (ctx: ScreenContext<null>, text: string) => [...ctx.root.querySelectorAll("button")].find((b) => b.textContent === text);

  it("AS2 눈 뜬 장을 자동으로 찍고, 찍은 사진을 보여 준 뒤 '이대로 피드백 받기' 로 넘긴다 — 눈을 감으라고 하지 않는다 (#386)", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    const line = () => ctx.root.querySelector(".cam-step")?.textContent;
    expect(line()).toBe(STEP_TEXT.front_open);
    await run(1000, 3000);                         // 자리 잡기(1.5초) + 안정 + 다섯 장 묶음
    await vi.advanceTimersByTimeAsync(0);
    // 미리보기 — 사진 한 장과 버튼 둘. 아직 넘기지 않는다
    const imgs = [...ctx.root.querySelectorAll<HTMLImageElement>(".attempt-preview img")];
    expect(imgs).toHaveLength(1);
    expect(ctx.root.textContent).toContain(ATTEMPT_TEXT.openLabel);
    expect(ctx.root.textContent).not.toContain("감은");
    expect(ctx.root.textContent).not.toContain("감아");
    expect(stopped).toBeGreaterThan(0);            // 다 찍으면 카메라를 끈다
    expect(setAttempt).not.toHaveBeenCalled();
    expect(ctx.go).not.toHaveBeenCalled();
    buttonOf(ctx, ATTEMPT_TEXT.confirm)!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(setAttempt).toHaveBeenCalledTimes(1);
    const shots = setAttempt.mock.calls[0]![0] as AttemptShots;
    expect(Object.keys(shots)).toEqual(["front_open"]);
    for (const s of Object.values(shots).flat()) {
      expect(s.blob).toBeInstanceOf(Blob);
      expect(s.lm).toHaveLength(LMS.length);
      expect([s.w, s.h]).toEqual([600, 600]);
    }
    expect(ctx.go).toHaveBeenCalledWith("feedback");
  });

  it("AS6 '다시 찍기' 를 누르면 처음부터 다시 찍고, 다시 미리보기 — 넘기는 건 마지막에 찍은 묶음", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    const t = await shoot(ctx);
    buttonOf(ctx, ATTEMPT_TEXT.retake)!.click();
    await vi.advanceTimersByTimeAsync(100);
    expect(ctx.root.querySelector(".attempt-preview")).toBeNull();
    expect(ctx.root.querySelector(".cam-step")?.textContent).toBe(STEP_TEXT.front_open);
    expect(revoked).toEqual(urls);                  // 앞 미리보기 사진은 돌려준다
    await shoot(ctx, t + 1000);
    expect(ctx.root.querySelectorAll(".attempt-preview img")).toHaveLength(1);
    expect(setAttempt).not.toHaveBeenCalled();
    buttonOf(ctx, ATTEMPT_TEXT.confirm)!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(setAttempt).toHaveBeenCalledTimes(1);
    const shots = setAttempt.mock.calls[0]![0] as AttemptShots;
    // 다시 찍은 것 — 앞 묶음(눈 뜬 5장)은 jpeg1~5
    expect(await Promise.all(shots.front_open.map((s) => s.blob.text()))).toEqual(["jpeg6", "jpeg7", "jpeg8", "jpeg9", "jpeg10"]);
  });

  it("AS7 '이대로 피드백 받기' 를 두 번 눌러도 한 번만 넘긴다", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    await shoot(ctx);
    const b = buttonOf(ctx, ATTEMPT_TEXT.confirm)!;
    b.click(); b.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(setAttempt).toHaveBeenCalledTimes(1);
    expect(ctx.go).toHaveBeenCalledTimes(1);
  });

  it("AS8 눈 뜬 장은 다섯 장 묶음 — 피드백(③)이 값마다 가운데 값을 쓴다 (#328)", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    await shoot(ctx);
    buttonOf(ctx, ATTEMPT_TEXT.confirm)!.click();
    await vi.advanceTimersByTimeAsync(0);
    const shots = setAttempt.mock.calls[0]![0] as AttemptShots;
    expect(shots.front_open).toHaveLength(5);
    expect(ctx.root.querySelectorAll(".attempt-preview img")).toHaveLength(1);   // 미리보기는 셔터 장만
  });

  it("AS9 사진을 줄이지 않는다 — 맨얼굴과 같은 원본 크기 (줄이면 얼굴 점과 크기가 어긋나고 라이너 꼬리가 사라진다, #328 · #240)", async () => {
    const { ctx } = mount();
    await start(ctx);
    await shoot(ctx);
    expect(encodeSides).toHaveLength(5);
    expect(encodeSides.every((s) => s === Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("AS10 묶음을 모으는 동안 눈을 감으면 그 장면은 넣지 않고, 시간이 지나면 모은 만큼으로 넘어간다", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    // 셔터(첫 장을 잡는 순간)까지만 눈을 뜨고, 그 뒤로는 계속 감는다
    let t = 1000;
    for (; grabs === 0 && t < 6000; t += 33) fire(t);
    expect(grabs).toBe(1);
    eyes = "closed";
    await run(t, 2500);                            // 묶음 제한 시간(1.5초)이 지나면 모은 만큼으로 끝낸다
    await vi.advanceTimersByTimeAsync(0);
    buttonOf(ctx, ATTEMPT_TEXT.confirm)!.click();
    await vi.advanceTimersByTimeAsync(0);
    const shots = setAttempt.mock.calls[0]![0] as AttemptShots;
    expect(shots.front_open).toHaveLength(1);      // 눈 감은 장면은 눈 뜬 묶음에 안 들어간다
  });

  it("AS11 미리보기 사진은 화면 폭 안에 들어온다 — 원본 크기 사진이라 그대로 두면 구석만 보이고 버튼이 화면 밖으로 밀린다 (폰 확인 2026-10-08, #344)", async () => {
    const { ctx } = mount();
    await start(ctx);
    await shoot(ctx);
    const row = ctx.root.querySelector<HTMLElement>(".attempt-preview")!;
    expect(row.style.display).toBe("grid");
    expect(row.style.gridTemplateColumns).toBe("minmax(0, 260px)");   // 한 장이라 가운데에, 너무 커지지 않게
    for (const img of row.querySelectorAll<HTMLImageElement>("img")) {
      expect(img.style.width).toBe("100%");     // 칸 폭에 맞춘다
      expect(img.style.height).toBe("auto");    // 비율은 그대로
    }
    for (const fig of row.querySelectorAll<HTMLElement>("figure")) expect(fig.style.margin).toBe("0px");   // 브라우저 기본 여백(양옆 40px)이 칸을 좁힌다
  });

  it("AS3 눈을 감고 있으면 찍지 않는다 — 넘어가지 않는다", async () => {
    const { ctx, setAttempt } = mount();
    await start(ctx);
    eyes = "closed";
    await run(1000, 6000);
    expect(ctx.root.querySelector(".attempt-preview")).toBeNull();
    expect(setAttempt).not.toHaveBeenCalled();
    expect(ctx.go).not.toHaveBeenCalled();
  });

  it("AS4 화면을 떠나면 카메라를 끄고 더 찍지 않는다", async () => {
    const { ctx, off, setAttempt } = mount();
    await start(ctx);
    off();
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBeGreaterThan(0);
    const before = detect.mock.calls.length;
    await run(1000, 3000);
    expect(detect.mock.calls.length).toBe(before);
    expect(setAttempt).not.toHaveBeenCalled();
  });

  it("AS5 카메라를 못 열면 안내하고 다시 시도할 수 있다 — 흐름을 넘기지 않는다", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => { throw new Error("NotAllowedError"); } }, configurable: true });
    const { ctx, setAttempt } = mount();
    await start(ctx);
    expect(ctx.root.textContent).toContain(ATTEMPT_TEXT.cameraFail);
    expect([...ctx.root.querySelectorAll("button")].some((b) => b.textContent === ATTEMPT_TEXT.retry)).toBe(true);
    expect(setAttempt).not.toHaveBeenCalled();
    expect(ctx.go).not.toHaveBeenCalled();
  });
});
