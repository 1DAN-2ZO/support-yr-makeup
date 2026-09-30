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
  const sink = memorySink();
  const ctx: ScreenContext<null> = { root, session: null, go, goPart, log: createLogger({ sid: "s1", screen: "guide", part: "liner", ver }, sink.sink) };
  const deps: GuideDeps = {
    getPart: () => "liner", firstPart: () => "brow", getBaseline: () => null, getLook: () => look,
    getFaceShape: () => null, ...over,
  };
  return { root, ctx, go, goPart, deps, events: sink.events };
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

  // #192 완성본 = 쌩얼 정면(촬영 원본 우선) + 개인화 계획 화장 (2-b AR 과 같은 그리기 코드). 그림 합성(WebGL)은 브라우저에서만 — 여기서는 순서만
  const baseline = { lm: Array.from({ length: 478 }, () => ({ x: 10, y: 20 })), unit: { eye: 1, lip: 1, face: 1 }, foreheadL: 60, scleraLab: null,
    faceShape: { label: "oval" as const, confidence: 0, method: "rule" as const, version: "t" }, bareImage: new Blob(["bare"]), w: 1000, h: 800 };
  const plan = { tag: "plan" } as unknown as NonNullable<ReturnType<NonNullable<GuideDeps["getPlan"]>>>;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const original = () => { const c = document.createElement("canvas"); c.width = 2000; c.height = 1600; return c; };
  /** 테두리를 그릴 때 받은 얼굴 점의 첫 점 */
  const spyGuide = () => {
    const seen: { x: number; y: number }[] = [];
    const getGuide = () => ((_p: unknown, f: { lm: readonly { x: number; y: number }[] }) => { seen.push(f.lm[0]!); return {}; }) as never;
    return { seen, getGuide };
  };

  it("GS5 계획이 있으면 촬영 원본 위에 그 계획으로 화장을 그린다 — 얼굴 점은 원본 크기에 맞춰", async () => {
    const paint = vi.fn(() => document.createElement("canvas"));
    const toBitmap = vi.fn();
    const { ctx, deps } = setup({ getBaseline: () => baseline, getPlan: () => plan, getBareSource: original, paint, toBitmap });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(paint).toHaveBeenCalledTimes(1);
    const [d, lm, lookArg, planArg] = paint.mock.calls[0] as unknown as [{ w: number; h: number }, { x: number; y: number }[], unknown, unknown];
    expect([d.w, d.h]).toEqual([2000, 1600]);
    expect(lm[0]).toEqual({ x: 20, y: 40 });   // 1000×800 → 2000×1600
    expect(lookArg).toBe(look);
    expect(planArg).toBe(plan);
    expect(toBitmap).not.toHaveBeenCalled();   // 원본이 있으면 저장한 쌩얼을 안 연다
  });

  it("GS6 원본이 없으면(앱을 다시 켬) 저장한 쌩얼 위에 그린다", async () => {
    const paint = vi.fn(() => document.createElement("canvas"));
    const toBitmap = vi.fn(async () => ({ width: 500, height: 400, close: vi.fn() }) as unknown as ImageBitmap);
    const { ctx, deps } = setup({ getBaseline: () => baseline, getPlan: () => plan, paint, toBitmap });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(toBitmap).toHaveBeenCalledWith(baseline.bareImage);
    const [d, lm] = paint.mock.calls[0] as unknown as [{ w: number }, { x: number }[]];
    expect(d.w).toBe(500);
    expect(lm[0]!.x).toBe(5);
  });

  it("GS7 계획이 없거나 그리기가 실패하면 쌩얼만 — 테두리는 그대로 맨얼굴 점", async () => {
    for (const over of [{ getPlan: () => null }, { getPlan: () => plan, paint: vi.fn(() => null) }]) {
      const { seen, getGuide } = spyGuide();
      const { ctx, deps } = setup({ getBaseline: () => baseline, getBareSource: original, getGuide, ...over });
      guideScreen<null>(deps).mount(ctx);
      await flush();
      expect(seen[0]).toEqual({ x: 20, y: 40 });
    }
  });

  it("GS8 테두리 점 = 맨얼굴 점을 그린 그림 크기에 맞춘 것 (완성본·테두리·채점이 한 얼굴)", async () => {
    const { seen, getGuide } = spyGuide();
    const { ctx, deps } = setup({ getBaseline: () => baseline, getPlan: () => plan, getBareSource: original, paint: () => document.createElement("canvas"), getGuide });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(seen[0]).toEqual({ x: 20, y: 40 });
  });

  it("GS11 화장을 그리다 오류가 나도(예: WebGL 컨텍스트 잃음) 쌩얼 + 테두리는 뜬다 · 오류는 기록 (#195 리뷰)", async () => {
    const { seen, getGuide } = spyGuide();
    const paint = vi.fn(() => { throw new Error("context lost"); });
    const { ctx, deps, events } = setup({ getBaseline: () => baseline, getPlan: () => plan, getBareSource: original, paint, getGuide });
    guideScreen<null>(deps).mount(ctx);
    await flush();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(seen[0]).toEqual({ x: 20, y: 40 });   // 쌩얼로 그리기까지 갔다
    expect(events.some((e) => e.name === "error" && (e as { where?: string }).where === "guide")).toBe(true);
  });
});
