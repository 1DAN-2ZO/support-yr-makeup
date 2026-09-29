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
    getFaceShape: () => null, ...over,
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

  it("GS3 부위가 안 정해졌으면(2-b '시작'에서 바로) 첫 부위로 — mount 가 끝난 뒤에 (정리 함수가 덮이지 않게, #167 리뷰)", async () => {
    const { ctx, goPart, deps } = setup({ getPart: () => null });
    guideScreen<null>(deps).mount(ctx);
    expect(goPart).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(goPart).toHaveBeenCalledWith("brow");
  });

  it("GS4 그림이 하나도 없으면 '준비 중' — 흐름은 막지 않는다", () => {
    const { root, ctx, deps } = setup();
    guideScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".guide-img")?.textContent).toBe(GUIDE_TEXT.noImage);
    expect(Array.from(root.querySelectorAll("button")).some((x) => x.textContent === GUIDE_TEXT.start)).toBe(true);
  });

  // #182 완성본 = 2-b AR 장면. 그림 그리기(캔버스)는 브라우저에서만 — 여기서는 무엇을 꺼내는지만
  const baseline = { lm: Array.from({ length: 478 }, () => ({ x: 10, y: 10 })), unit: { eye: 1, lip: 1, face: 1 }, foreheadL: 60, scleraLab: null,
    faceShape: { label: "oval" as const, confidence: 0, method: "rule" as const, version: "t" }, bareImage: new Blob(["bare"]), w: 1000, h: 800 };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("GS5 AR 장면이 있으면 그 장면을 연다 (쌩얼이 아니라)", async () => {
    const arImage = new Blob(["ar"]);
    const toBitmap = vi.fn(async () => ({ width: 1280, height: 720, close: vi.fn() }) as unknown as ImageBitmap);
    const { ctx, deps } = setup({ getBaseline: () => baseline, getArFrame: async () => ({ lookId: "x", image: arImage, lm: baseline.lm, w: 1280, h: 720 }), toBitmap });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(toBitmap).toHaveBeenCalledTimes(1);
    expect(toBitmap).toHaveBeenCalledWith(arImage);
  });

  it("GS6 AR 장면이 없으면 쌩얼을 연다", async () => {
    const toBitmap = vi.fn(async () => ({ width: 1000, height: 800, close: vi.fn() }) as unknown as ImageBitmap);
    const { ctx, deps } = setup({ getBaseline: () => baseline, getArFrame: async () => null, toBitmap });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(toBitmap).toHaveBeenCalledWith(baseline.bareImage);
  });

  it("GS7 테두리는 그 그림의 얼굴 점으로 — AR 장면이면 장면의 점을 그림 크기에 맞춰 (맨얼굴 점이 아니라)", async () => {
    const arLm = Array.from({ length: 478 }, () => ({ x: 50, y: 40 }));
    const seen: { x: number; y: number }[] = [];
    const getGuide = () => ((_p: unknown, f: { lm: readonly { x: number; y: number }[] }) => { seen.push(f.lm[0]!); return {}; }) as never;
    const toBitmap = vi.fn(async () => ({ width: 640, height: 360, close: vi.fn() }) as unknown as ImageBitmap);   // 저장한 1280×720 의 절반
    const { ctx, deps } = setup({ getBaseline: () => baseline, getArFrame: () => ({ lookId: "x", image: new Blob(["ar"]), lm: arLm, w: 1280, h: 720 }), toBitmap, getGuide });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(seen[0]).toEqual({ x: 25, y: 20 });
  });
});
