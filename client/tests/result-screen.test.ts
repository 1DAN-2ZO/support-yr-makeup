// @vitest-environment jsdom
// 화면 5·5-b 부위 결과 (이슈 #100) — 합성 얼굴로 실제 채점까지 돌려서 화면에 뜨는 것·버튼·로그·세션 반영을 본다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RgbaImage } from "@core/color";
import { LM } from "@core/landmarks";
import type { HairMask } from "@core/sampling";
import { applyResult, applySkip, createSession, nextPart, setCurrentPart, type Session } from "@core/flow";
import { createLogger, memorySink } from "@core/log";
import { hasDigit } from "@core/score";
import type { Baseline, CaptureBundle, PartId, Versions } from "@core/types";
import { resultScreen, type ResultDeps } from "@screens/result";
import type { ScreenContext } from "@screens/shell";
import { LMS, SHADE, guide, image, linerPaint, regionPaint } from "./helpers/synth-face";

const ver: Versions = { app: "test", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "transfer-stub-v0" };

// jsdom 에는 ImageBitmap 이 없다. 픽셀은 toRgba 를 끼워 넣어 돌린다
class FakeBitmap { constructor(public im: RgbaImage) {} width = 600; height = 600; }
const bareIm = image();
const baseline = (): Baseline => ({
  lm: LMS, unit: { eye: 90, lip: 120, face: 400 }, foreheadL: 70, scleraLab: null,
  faceShape: { label: "oval", confidence: 1, method: "rule", version: "t" },
  bareImage: new FakeBitmap(bareIm) as unknown as ImageBitmap, w: 600, h: 600,
});
const bundle = (im: RgbaImage): CaptureBundle => ({
  frames: [new FakeBitmap(im) as unknown as ImageBitmap], pts: [LMS], handOverlap: [null], foreheadL: [70],
});

function setup(part: PartId, captured: RgbaImage | null, over: Partial<ResultDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  let session: Session = setCurrentPart(createSession(() => 1), part);
  const m = memorySink();
  const ctx: ScreenContext<null> = {
    root, session: null, go: vi.fn(), goPart: vi.fn(),
    log: createLogger({ sid: "s", screen: "result", part, ver }, m.sink),
  };
  const deps: ResultDeps = {
    getPart: () => part,
    getBaseline: baseline,
    getCapture: () => (captured ? bundle(captured) : null),
    guide: () => guide,
    getStatus: (p) => session.parts.find((x) => x.partId === p)!.status,
    apply: (p, o) => { session = applyResult(session, p, o, () => 2); },
    skip: (p) => { session = applySkip(session, p, () => 2); },
    nextPart: (after) => nextPart(session, after),
    toRgba: async (src) => (src as unknown as FakeBitmap).im,
    ...over,
  };
  resultScreen<null>(deps).mount(ctx);
  return { root, ctx, events: m.events, session: () => session };
}

const btn = (root: HTMLElement, text: string): HTMLButtonElement => {
  const f = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
  if (!f) throw new Error(`"${text}" 버튼이 없습니다`);
  return f;
};
/** 채점(비동기)이 끝날 때까지 */
const scored = async (root: HTMLElement) => {
  for (let i = 0; i < 50 && root.querySelector(".result-score")?.textContent === "채점 중…"; i++) await new Promise((r) => setTimeout(r, 20));
};

describe("화면 5 — 부위 결과", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("가이드대로 그린 라이너: 점수·'잘 됐어요'·사진 위 테두리, 다음을 누르면 passed 로 반영되고 다음 부위로", async () => {
    const { root, ctx, events, session } = setup("liner", image(linerPaint()));
    expect(root.querySelector(".result-score")?.textContent).toBe("채점 중…");
    expect(btn(root, "다음").disabled).toBe(true);   // 결과 없이 passed 가 되면 안 된다
    await scored(root);
    const num = Number(root.querySelector(".result-num")?.textContent);
    expect(num).toBeGreaterThanOrEqual(85);
    expect(root.querySelector(".result-say")?.textContent).toBe("잘 됐어요");
    const canvas = root.querySelector("canvas")!;
    expect(Number(canvas.dataset.lines)).toBe(4);   // 속눈썹 선 둘 + 꼬리 둘
    expect(events.find((e) => e.name === "score")).toMatchObject({ part: "liner", status: "passed", check_reason: null });

    btn(root, "다음").click();
    expect(session().parts.find((p) => p.partId === "liner")).toMatchObject({ status: "passed", score: num, attempts: 1 });
    expect(events.find((e) => e.name === "part_status")).toMatchObject({ part: "liner", from: "in_progress", to: "passed", score: num });
    expect(ctx.goPart).toHaveBeenCalledWith("shadow");
  });

  it("확인받기 묶음 전체를 채점한다 — 가려진 장은 빼고, 점수는 안 가려진 장들로 (3-3)", async () => {
    const good = image(linerPaint()), bad = image(linerPaint({ R: 14, L: 14 }));
    const b: CaptureBundle = {
      // 가려진(흔들린) 나쁜 장이 마지막 — 마지막 장만 채점하면 틀린 점수가 나온다
      frames: [good, good, bad].map((im) => new FakeBitmap(im) as unknown as ImageBitmap),
      pts: [LMS, LMS, LMS], handOverlap: [false, null, true], foreheadL: [70, 70, 70],
    };
    const only = setup("liner", good);
    await scored(only.root);
    const { root } = setup("liner", null, { getCapture: () => b });
    await scored(root);
    expect(root.querySelector(".result-score")?.textContent).toBe(only.root.querySelector(".result-score")?.textContent);
  });

  it("묶음이 전부 가려졌으면 확인만(가림)", async () => {
    const good = image(linerPaint());
    const b: CaptureBundle = { frames: [new FakeBitmap(good) as unknown as ImageBitmap], pts: [LMS], handOverlap: [true], foreheadL: [70] };
    const { root, events } = setup("liner", null, { getCapture: () => b });
    await scored(root);
    expect(events.some((e) => e.name === "score" && (e as { check_reason?: string }).check_reason === "occluded")).toBe(true);
  });

  it("화면에 숫자는 점수 하나뿐 — 나머지 글에 숫자가 없다 (F-09)", async () => {
    const { root } = setup("liner", image(linerPaint()));
    await scored(root);
    expect(root.querySelector(".result-score")?.textContent).toMatch(/^\d+\/ 100$/);   // 점수 블록 = "NN / 100"
    root.querySelector(".result-score")?.remove();
    expect(hasDigit(root.textContent ?? "")).toBe(false);   // 그 밖의 글에는 숫자가 없다
  });

  it("맨얼굴 그대로(화장 없음): '확인만' + 이유, 다음을 누르면 check_only 로 반영", async () => {
    const { root, events, session } = setup("lip", bareIm);
    await scored(root);
    expect(root.querySelector(".result-score")?.textContent).toBe("확인만");
    expect(root.querySelector(".result-say")?.textContent).toContain("색이 옅어서");
    expect(events.find((e) => e.name === "score")).toMatchObject({ status: "check_only", check_reason: "faint" });
    btn(root, "다음").click();
    expect(session().parts.find((p) => p.partId === "lip")).toMatchObject({ status: "check_only", score: null, checkReason: "faint" });
    // 퍼널(E-8): 확인만으로 넘어간 것도 part_status 로 남는다 (#37)
    expect(events.find((e) => e.name === "part_status")).toMatchObject({ part: "lip", from: "in_progress", to: "check_only", score: null });
  });

  it("강도 부위: 볼터치 감지 안 되면 '감지되지 않음', 쉐딩은 항상 확인만 + 좌우 한 줄, 마지막 부위라 '결과 보러 가기'", async () => {
    const cheek = setup("cheek", bareIm);
    await scored(cheek.root);
    expect(cheek.root.querySelector(".result-extra")?.textContent).toBe("감지되지 않음");

    const c = setup("contour", image(regionPaint("contour", SHADE, ["L"])));
    await scored(c.root);
    expect(c.root.querySelector(".result-score")?.textContent).toBe("확인만");
    expect(c.root.querySelector(".result-say")?.textContent).toBe("확인하고 넘어가세요. 왼쪽이 조금 진해요");
    btn(c.root, "결과 보러 가기").click();
    expect(c.session().parts.find((p) => p.partId === "contour")).toMatchObject({ status: "check_only", checkReason: "contour" });
    expect(c.ctx.go).toHaveBeenCalledWith("review");
  });

  it("다시 확인받기는 결과를 남기지 않고 화면 4 로, 건너뛰기는 skipped 로 다음 부위", async () => {
    const a = setup("liner", image(linerPaint()));
    await scored(a.root);
    btn(a.root, "다시 확인받기").click();
    expect(a.ctx.go).toHaveBeenCalledWith("live");
    expect(a.session().parts.find((p) => p.partId === "liner")).toMatchObject({ status: "in_progress", attempts: 0 });

    const b = setup("liner", image(linerPaint()));
    btn(b.root, "건너뛰기").click();   // 채점이 끝나기 전에도 건너뛸 수 있다
    expect(b.session().parts.find((p) => p.partId === "liner")?.status).toBe("skipped");
    expect(b.events.find((e) => e.name === "part_status")).toMatchObject({ to: "skipped", score: null });
    expect(b.ctx.goPart).toHaveBeenCalledWith("shadow");
  });

  it("확인받기 결과가 없으면(화면 4 를 안 거침) 채점하지 않고 다시 확인받기만 연다", () => {
    const { root, events } = setup("brow", null);
    expect(root.textContent).toContain("확인받기 결과가 없어요");
    expect(root.querySelector("canvas")).toBeNull();
    expect(btn(root, "다음").disabled).toBe(true);
    expect(events.find((e) => e.name === "score")).toBeUndefined();
  });

  it("가이드가 모양을 안 줘 채점이 실패하면 점수를 지어내지 않고 error 로그 + 다시 확인받기", async () => {
    const { root, events } = setup("liner", image(linerPaint()), { guide: () => () => ({}) });
    await scored(root);
    expect(root.querySelector(".result-score")?.textContent).toBe("채점하지 못했어요");
    expect(btn(root, "다음").disabled).toBe(true);
    expect(events.find((e) => e.name === "error")).toMatchObject({ where: "result" });
  });
});

describe("화면 5 — 머리카락 마스크", () => {
  // 오른쪽 눈썹을 덮는 앞머리 (화장은 안 함)
  const browR = [...LM.browA.upper, ...LM.browA.lower].map((i) => LMS[i]!);
  const x0 = Math.min(...browR.map((p) => p.x)) - 12, x1 = Math.max(...browR.map((p) => p.x)) + 12;
  const y0 = Math.min(...browR.map((p) => p.y)) - 20, y1 = Math.max(...browR.map((p) => p.y)) + 12;
  const bangs = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const hairIm = image((x, y) => (bangs(x, y) ? [28, 22, 20] : null));
  const mask: HairMask = { w: 600, h: 600, data: Float32Array.from({ length: 600 * 600 }, (_, i) => (bangs(i % 600, Math.floor(i / 600)) ? 1 : 0)) };

  it("RH1 마스크 함수를 받으면 맨얼굴·확인받기 사진마다 부르고, 앞머리가 덮으면 확인만(가림)", async () => {
    const hairMask = vi.fn(async (im: RgbaImage) => (im === hairIm ? mask : null));
    const { root } = setup("brow", hairIm, { hairMask });
    await scored(root);
    expect(hairMask).toHaveBeenCalledTimes(2);
    expect(root.querySelector(".result-score")?.textContent).toBe("확인만");
    expect(root.querySelector(".result-say")?.textContent).toContain("머리카락");
  });

  it("RH3 마스크가 시간 안에 안 오면(모델 내려받기가 멈춤) 기다리지 않고 마스크 없이 채점한다", async () => {
    const { root } = setup("liner", image(linerPaint()), { hairMask: () => new Promise(() => {}), hairTimeoutMs: 30 });
    await scored(root);
    expect(Number(root.querySelector(".result-num")?.textContent)).toBeGreaterThan(0);
  });

  it("RH2 마스크를 못 만들면(null) 마스크 없이 전처럼 채점한다", async () => {
    const { root } = setup("liner", image(linerPaint()), { hairMask: async () => null });
    await scored(root);
    expect(Number(root.querySelector(".result-num")?.textContent)).toBeGreaterThan(0);
  });
});
