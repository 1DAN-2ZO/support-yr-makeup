// @vitest-environment jsdom
// 새 흐름 뼈대 (2026-10-06) — 담당이 화면을 올리기 전 자리. 흐름을 끝까지 눌러 볼 수 있게 "다음" 이 있다
import { GUIDE_PART_IDS } from "@core/screens";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { MakeResult } from "@core/picture-maker";
import { PART_NAME } from "@core/score";
import { PART_IDS, type PartId, type Versions } from "@core/types";
import { partGuideSlot, saveSlot, slotScreen, type PartGuideSlotDeps } from "@screens/flow-slots";
import { SAVE_TEXT, SHARE_HINT, type SaveKit } from "@screens/feedback-card";
import type { GuideLoad, GuideView } from "@screens/guide-source";
import type { RefAnalysis, RefFailure } from "@screens/ref-analyze";
import { describeColor } from "@core/color-name";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function ctxOf() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const ctx: ScreenContext<null> = { root, session: null, go: vi.fn(), goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "answer", part: null, ver }, memorySink().sink) };
  return ctx;
}
// jsdom 에는 createObjectURL 이 없다 — 미리보기 주소를 만드는 자리라 채워 준다
beforeAll(() => {
  URL.createObjectURL = (): string => "blob:test";
  URL.revokeObjectURL = (): void => {};
});

/** 사진을 고른 것처럼 — jsdom 에는 파일 선택 창이 없다 */
function pickPhoto(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>(".slot-upload-input");
  if (!input) throw new Error("파일 입력이 없습니다");
  const file = new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** 가짜 분석기 — 진짜는 MediaPipe 를 부른다 */
function fakeAnalysis(): RefAnalysis {
  const rgb: [number, number, number] = [150, 104, 97];
  const name = describeColor(rgb, "lip");
  return { colors: { lip: { hex: "#966861", rgb, name, product: { hex: "#966861", rgb, name }, n: 500 } }, preview: "data:,", w: 10, h: 10 };
}

const button = (root: HTMLElement, text: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`"${text}" 버튼이 없습니다`);
  return b;
};

describe("빈 자리 화면", () => {
  const SPEC = { title: "참고 사진 · 예상 메이크업", owner: "①·②·④", todo: ["참고 사진 업로드", "예상 메이크업 생성"], next: "partguide" } as const;

  it("FS1 사진을 고르기 전에는 '적용하기' 가 안 눌린다 — 잴 사진이 없다", () => {
    const ctx = ctxOf();
    slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis() }).mount(ctx);
    expect(ctx.root.textContent).toContain("참고 사진 · 예상 메이크업");
    expect(ctx.root.textContent).toContain("①·②·④");
    expect(button(ctx.root, "적용하기").disabled).toBe(true);
    pickPhoto(ctx.root);
    expect(button(ctx.root, "적용하기").disabled).toBe(false);
  });

  it("FS1a 사진 고름 → 분석 → 색조 팔레트 → '다음' 으로 흐름을 이어 간다", async () => {
    const ctx = ctxOf();
    const analyze = vi.fn(async () => fakeAnalysis());
    slotScreen<null>(SPEC, { analyze }).mount(ctx);
    pickPhoto(ctx.root);
    button(ctx.root, "적용하기").click();
    expect(ctx.root.textContent).toContain("분석중");
    await vi.waitFor(() => expect(ctx.root.textContent).toContain("예상 메이크업 완성"));
    expect(analyze).toHaveBeenCalledTimes(1);
    // 읽은 색이 그대로 화면에 — 48색에 없는 탁한 색이라 규칙으로 지은 이름이 나온다
    expect(ctx.root.textContent).toContain("뮤트 브릭");
    button(ctx.root, "다음").click();
    // 부위 가이드로 갈 때는 첫 부위부터 — 진행 칩과 같은 goPart (지금 부위가 정해져 칩에 표시된다)
    expect(ctx.goPart).toHaveBeenCalledWith(PART_IDS[0]);
    expect(ctx.go).not.toHaveBeenCalled();
  });

  it("FS1c 얼굴을 못 찾으면 안내하고 업로드 화면으로 돌아온다 — 흐름이 멈추지 않는다", async () => {
    const ctx = ctxOf();
    slotScreen<null>(SPEC, { analyze: async (): Promise<RefFailure> => "noFace" }).mount(ctx);
    pickPhoto(ctx.root);
    button(ctx.root, "적용하기").click();
    await vi.waitFor(() => expect(ctx.root.textContent).toContain("얼굴을 못 찾았어요"));
    expect(button(ctx.root, "적용하기").disabled).toBe(false);
  });

  describe("정답사진 만들기 (서버 부르기)", () => {
    const made = new Blob([new Uint8Array([9, 9, 9])], { type: "image/webp" });
    const small = new Blob([new Uint8Array([7])], { type: "image/webp" });
    const img = (root: HTMLElement): HTMLImageElement | null => root.querySelector<HTMLImageElement>(".slot-answer-ref");
    // 가로챈 것(createObjectURL 등)은 테스트가 실패해도 돌려놓는다 — 다음 테스트가 같이 깨지지 않게
    afterEach(() => { vi.restoreAllMocks(); });

    it("FS4 '적용하기' → 줄인 참고 사진으로 정답사진을 만들어 달라고 하고, 받은 그림을 보여 준다", async () => {
      const urls = new Map<string, Blob>();
      vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { const u = `blob:${urls.size}`; urls.set(u, b as Blob); return u; });
      let done: (r: MakeResult) => void = () => {};
      const makeAnswer = vi.fn(() => new Promise<MakeResult>((r) => { done = r; }));
      const shrink = vi.fn(async () => small);
      const ctx = ctxOf();
      slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis(), makeAnswer, shrink }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(makeAnswer).toHaveBeenCalledTimes(1));
      // 폰 사진첩의 큰 사진을 그대로 올리지 않는다 — 줄인 것을 보낸다
      expect(makeAnswer).toHaveBeenCalledWith(small);
      // 기다리는 동안: 만들고 있다는 것과 얼마나 걸리는지
      expect(ctx.root.textContent).toContain("예상 메이크업을 만들고 있어요");
      expect(ctx.root.textContent).toContain("1분");
      expect(ctx.root.textContent).not.toContain("예상 메이크업 완성");
      done({ ok: true, picture: made, ms: 8600 });
      await vi.waitFor(() => expect(ctx.root.textContent).toContain("예상 메이크업 완성"));
      // 보여 주는 것은 참고 사진이 아니라 받은 정답사진
      expect(urls.get(img(ctx.root)!.src)).toBe(made);
      expect(img(ctx.root)!.alt).toBe("예상 메이크업");
      expect(ctx.root.textContent).toContain("뮤트 브릭");
      button(ctx.root, "다음").click();
      expect(ctx.goPart).toHaveBeenCalledWith(PART_IDS[0]);
    });

    it.each([
      ["busy", "사람이 많아요"],
      ["down", "답하지 않아요"],
      ["off", "만들 수 없어요"],
      ["timeout", "오래 걸려서"],
      ["network", "인터넷"],
      ["too_large", "너무 커요"],
      ["rejected", "맨얼굴"],
      ["no_bare", "맨얼굴"],
    ] as const)("FS4b 못 만들면(%s) 까닭을 알리고 업로드 화면으로 — 다시 누를 수 있다", async (why, text) => {
      const makeAnswer = vi.fn(async (): Promise<MakeResult> => ({ ok: false, why }));
      const ctx = ctxOf();
      slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis(), makeAnswer, shrink: async (b) => b }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(ctx.root.querySelector(".slot-upload-warn")?.textContent).toContain(text));
      expect(ctx.root.textContent).not.toContain("예상 메이크업 완성");
      expect(button(ctx.root, "적용하기").disabled).toBe(false);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(makeAnswer).toHaveBeenCalledTimes(2));
    });

    it("FS4c 참고 사진에서 얼굴을 못 찾으면 서버를 부르지 않는다 — 못 쓸 사진으로 GPU 를 쓰지 않는다", async () => {
      const makeAnswer = vi.fn(async (): Promise<MakeResult> => ({ ok: true, picture: made, ms: null }));
      const ctx = ctxOf();
      slotScreen<null>(SPEC, { analyze: async (): Promise<RefFailure> => "noFace", makeAnswer, shrink: async (b) => b }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(ctx.root.textContent).toContain("얼굴을 못 찾았어요"));
      expect(makeAnswer).not.toHaveBeenCalled();
    });

    it("FS4d 사진을 줄이지 못하면 고른 사진 그대로 보낸다", async () => {
      const makeAnswer = vi.fn(async (_ref: Blob): Promise<MakeResult> => ({ ok: true, picture: made, ms: null }));
      const ctx = ctxOf();
      slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis(), makeAnswer, shrink: async () => { throw new Error("못 줄임"); } }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(ctx.root.textContent).toContain("예상 메이크업 완성"));
      expect(makeAnswer.mock.calls[0]![0]).toBeInstanceOf(File);
    });

    it("FS4e 기다리다 화면을 떠나면 뒤늦게 온 답으로 화면을 그리지 않는다", async () => {
      let done: (r: MakeResult) => void = () => {};
      const makeAnswer = vi.fn(() => new Promise<MakeResult>((r) => { done = r; }));
      const ctx = ctxOf();
      const leave = slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis(), makeAnswer, shrink: async (b) => b }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(makeAnswer).toHaveBeenCalled());
      if (typeof leave === "function") leave();
      done({ ok: true, picture: made, ms: null });
      await new Promise((r) => setTimeout(r, 0));
      expect(ctx.root.textContent).not.toContain("예상 메이크업 완성");
    });

    it("FS4f 만든 뒤에는 참고 사진을 들고 있지 않는다 — 다른 사람 사진이라 바로 놓는다", async () => {
      const revoke = vi.spyOn(URL, "revokeObjectURL");
      const ctx = ctxOf();
      slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis(), makeAnswer: async () => ({ ok: true, picture: made, ms: null }), shrink: async (b) => b }).mount(ctx);
      pickPhoto(ctx.root);
      button(ctx.root, "적용하기").click();
      await vi.waitFor(() => expect(ctx.root.textContent).toContain("예상 메이크업 완성"));
      // 고른 참고 사진의 미리보기 주소를 놓았다
      expect(revoke).toHaveBeenCalledWith("blob:test");
    });
  });

  it("FS1b 부위 가이드가 아닌 다음 화면은 그대로 go", () => {
    const ctx = ctxOf();
    slotScreen<null>({ title: "6 피드백", owner: "③", todo: [], next: "save" }).mount(ctx);
    button(ctx.root, "다음").click();
    expect(ctx.go).toHaveBeenCalledWith("save");
  });

  it("FS1c 지금 받아 둔 것을 한 줄로 보여 줄 수 있다 — 들어올 때마다 새로 읽는다 (다음 담당이 무엇을 받아 쓰는지)", () => {
    let got = "시도사진 없음";
    const screen = slotScreen<null>({ title: "6 피드백", owner: "③", todo: [], next: "save", status: () => got });
    const ctx = ctxOf();
    screen.mount(ctx);
    expect(ctx.root.querySelector(".slot-status")?.textContent).toBe("시도사진 없음");
    got = "시도사진 2장 받음";
    const ctx2 = ctxOf();
    screen.mount(ctx2);
    expect(ctx2.root.querySelector(".slot-status")?.textContent).toBe("시도사진 2장 받음");
  });

  it("FS2 부위 가이드 자리 — 지금 부위를 보여 주고 '다음' 은 다음 부위, 마지막 부위면 시도사진으로", () => {
    // 가이드가 도는 부위만 본다 — 쉐딩·하이라이트는 뺐다 (2026-10-09)
    const first = GUIDE_PART_IDS[0]!, second = GUIDE_PART_IDS[1]!, last = GUIDE_PART_IDS[GUIDE_PART_IDS.length - 1]!;
    let part: PartId | null = first;
    const ctx = ctxOf();
    const screen = partGuideSlot<null>({ getPart: () => part });
    screen.mount(ctx);
    expect(ctx.root.textContent).toContain(PART_NAME[first]);
    button(ctx.root, "다음").click();
    expect(ctx.goPart).toHaveBeenCalledWith(second);

    part = last;
    const ctx2 = ctxOf();
    screen.mount(ctx2);
    button(ctx2.root, "다음").click();
    expect(ctx2.go).toHaveBeenCalledWith("attempt");
    expect(ctx2.goPart).not.toHaveBeenCalled();
  });

  it("FS2b 부위가 아직 없으면 첫 부위를 보여 준다", () => {
    const ctx = ctxOf();
    partGuideSlot<null>({ getPart: () => null }).mount(ctx);
    expect(ctx.root.textContent).toContain(PART_NAME[PART_IDS[0]!]);
    button(ctx.root, "다음").click();
    expect(ctx.goPart).toHaveBeenCalledWith(PART_IDS[1]);
  });

  describe("부위 가이드 — 정답사진을 잘라 보여 주기", () => {
    const view = { pages: {}, found: ["brow", "lip"], size: { w: 600, h: 600 }, picture: {}, ms: 1, dispose: () => {} } as unknown as GuideView;
    const photo = (root: HTMLElement): HTMLElement => root.querySelector<HTMLElement>(".slot-guide-photo")!;
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

    it("FS5 정답사진이 있으면 견본 그림 대신 그 부위로 자른 정답사진을 그린다", async () => {
      const paintGuide = vi.fn(() => true);
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => ({ ok: true, view }), paintGuide }).mount(ctx);
      await vi.waitFor(() => expect(paintGuide).toHaveBeenCalledTimes(1));
      const canvas = photo(ctx.root).querySelector("canvas");
      expect(canvas).not.toBeNull();
      expect(paintGuide).toHaveBeenCalledWith(canvas, view, "lip");
      // 견본(점선 · 점)은 치운다 — 진짜 그림 위에 가짜 선이 남으면 안 된다
      expect(photo(ctx.root).querySelector(".slot-guide-line, .slot-guide-dot")).toBeNull();
      expect(ctx.root.textContent).not.toContain("찾지 못했어요");
    });

    it("FS5b 기다리는 동안은 견본 그림을 보여 주지 않는다 — 가짜 얼굴이 먼저 떴다 바뀌지 않게", () => {
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: () => new Promise(() => {}), paintGuide: () => true }).mount(ctx);
      expect(photo(ctx.root).querySelector(".slot-guide-line, .slot-guide-dot")).toBeNull();
      expect(photo(ctx.root).textContent).toContain("준비");
    });

    it("FS5c 그 부위의 화장을 못 찾았으면 자른 그림은 보여 주되 못 찾았다고 알린다", async () => {
      const paintGuide = vi.fn(() => true);
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "cheek", getGuide: async () => ({ ok: true, view }), paintGuide }).mount(ctx);
      await vi.waitFor(() => expect(paintGuide).toHaveBeenCalledWith(expect.anything(), view, "cheek"));
      expect(ctx.root.textContent).toContain("찾지 못했어요");
    });

    it("FS5e 그 부위의 화장을 못 찾았으면 실시간 가이드로 가는 버튼을 뺀다 — 그릴 테두리가 없다. 찾았으면 둔다", async () => {
      const live = (root: HTMLElement): Element | null => root.querySelector("button.slot-live");
      const none = ctxOf();
      partGuideSlot<null>({ getPart: () => "cheek", getGuide: async () => ({ ok: true, view }), paintGuide: () => true }).mount(none);
      expect(live(none.root)).not.toBeNull();   // 알기 전에는 둔다
      await vi.waitFor(() => expect(none.root.textContent).toContain("찾지 못했어요"));
      expect(live(none.root)).toBeNull();
      const has = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => ({ ok: true, view }), paintGuide: () => true }).mount(has);
      await flush(); await flush();
      expect(live(has.root)).not.toBeNull();
    });

    it.each(["answer", "bare", "answer_size"] as const)("FS5d 재료가 없으면(%s) 견본 그림 그대로 — 화면이 비지 않는다", async (missing) => {
      const paintGuide = vi.fn(() => true);
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => ({ ok: false, missing }), paintGuide }).mount(ctx);
      await flush();
      expect(paintGuide).not.toHaveBeenCalled();
      expect(photo(ctx.root).querySelector(".slot-guide-line")).not.toBeNull();
      expect(photo(ctx.root).querySelector("canvas")).toBeNull();
    });

    it("FS5e 만들다 실패하거나 캔버스를 못 열어도 견본 그림으로 돌아온다", async () => {
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => { throw new Error("풀지 못함"); }, paintGuide: () => true }).mount(ctx);
      await flush();
      expect(photo(ctx.root).querySelector(".slot-guide-line")).not.toBeNull();
      const ctx2 = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => ({ ok: true, view }), paintGuide: () => false }).mount(ctx2);
      await flush();
      expect(photo(ctx2.root).querySelector(".slot-guide-line")).not.toBeNull();
      expect(photo(ctx2.root).querySelector("canvas")).toBeNull();
    });

    it("FS5f 쉐딩은 정답사진 가이드가 없는 부위다 — 재료를 부르지 않고 견본 그대로", async () => {
      const getGuide = vi.fn(async (): Promise<GuideLoad> => ({ ok: true, view }));
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "contour", getGuide, paintGuide: () => true }).mount(ctx);
      await flush();
      expect(getGuide).not.toHaveBeenCalled();
      expect(photo(ctx.root).querySelector(".slot-guide-line")).not.toBeNull();
    });

    // #361 이 견본 그림에 "예시" 딱지 · 말풍선을 붙였다 — 진짜 정답사진 그림이 뜨면 "예시" 라고 말하면 안 된다
    const coachText = (root: HTMLElement): string => root.querySelector(".slot-coach")?.textContent?.trim() ?? "";

    it("FS5h 진짜 정답사진 그림이 뜨면 말풍선이 '예시' 가 아니라 정답사진을 잘라 보여 준다고 말한다 — 딱지도 없다", async () => {
      const paintGuide = vi.fn(() => true);
      const ctx = ctxOf();
      partGuideSlot<null>({ getPart: () => "lip", getGuide: async () => ({ ok: true, view }), paintGuide }).mount(ctx);
      await vi.waitFor(() => expect(paintGuide).toHaveBeenCalled());
      expect(coachText(ctx.root)).toBe("예상 메이크업에서 이 부위만 크게 잘라서 보여드릴게요");
      expect(ctx.root.textContent).not.toContain("예시");
    });

    it("FS5i 견본 그림일 때(재료 없음 · 못 그림 · 쉐딩 · 재료를 안 받음)는 '예시' 말풍선과 딱지 그대로", async () => {
      const cases: PartGuideSlotDeps[] = [
        { getPart: () => "lip" },
        { getPart: () => "lip", getGuide: async () => ({ ok: false, missing: "answer" }), paintGuide: () => true },
        { getPart: () => "lip", getGuide: async () => ({ ok: true, view }), paintGuide: () => false },
        { getPart: () => "lip", getGuide: async () => { throw new Error("풀지 못함"); }, paintGuide: () => true },
        { getPart: () => "contour", getGuide: async () => ({ ok: true, view }), paintGuide: () => true },
      ];
      for (const [i, deps] of cases.entries()) {
        const ctx = ctxOf();
        partGuideSlot<null>(deps).mount(ctx);
        await flush();
        expect(coachText(ctx.root), `경우 ${i}`).toContain("예시 그림이에요");
        expect(photo(ctx.root).querySelector(".slot-guide-sample")?.textContent, `경우 ${i}`).toBe("예시");
      }
    });

    it("FS5g 기다리다 화면을 떠나면 뒤늦게 온 재료로 그리지 않는다", async () => {
      let done: (r: GuideLoad) => void = () => {};
      const paintGuide = vi.fn(() => true);
      const ctx = ctxOf();
      const leave = partGuideSlot<null>({ getPart: () => "lip", getGuide: () => new Promise<GuideLoad>((r) => { done = r; }), paintGuide }).mount(ctx);
      if (typeof leave === "function") leave();
      done({ ok: true, view });
      await flush();
      expect(paintGuide).not.toHaveBeenCalled();
    });
  });

  it("FS3 저장 · 공유 자리 — '끝내기' 는 폰에 남은 사진 · 기록을 다 지운 뒤에 끝 화면으로", async () => {
    let finish: () => void = () => {};
    const clearAll = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const ctx = ctxOf();
    saveSlot<null>({ clearAll }).mount(ctx);
    button(ctx.root, "끝내기").click();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(ctx.go).not.toHaveBeenCalled();
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.go).toHaveBeenCalledWith("done");
  });

  describe("저장 · 공유 — 결과 한 장 저장하기", () => {
    const card = new Blob([new Uint8Array([5, 5])], { type: "image/jpeg" });
    const kitOf = (over: Partial<SaveKit> = {}): SaveKit => ({ card, usesShareSheet: false, save: vi.fn(async () => "downloaded" as const), ...over });
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    const has = (root: HTMLElement, text: string): boolean => [...root.querySelectorAll("button")].some((b) => b.textContent?.includes(text));
    afterEach(() => { vi.restoreAllMocks(); });

    it("FS6 결과 한 장이 준비되면 그 그림과 '저장하기' 를 보여 준다 — 누르면 그 자리에서 바로 저장을 부른다", async () => {
      const urls = new Map<string, Blob>();
      vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { const u = `blob:${urls.size}`; urls.set(u, b as Blob); return u; });
      const kit = kitOf();
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kit }).mount(ctx);
      await vi.waitFor(() => expect(has(ctx.root, "저장하기")).toBe(true));
      const img = ctx.root.querySelector<HTMLImageElement>(".slot-save-preview")!;
      expect(urls.get(img.src)).toBe(card);
      button(ctx.root, "저장하기").click();
      // await 뒤에 부르면 iOS 가 공유 창을 안 연다 — 누른 그 순간에 불려 있어야 한다
      expect(kit.save).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(ctx.root.textContent).toContain(SAVE_TEXT.downloaded));
    });

    it.each(["shared", "downloaded", "cancelled", "unavailable"] as const)("FS6b 저장 결과(%s)를 정해 둔 문장으로 알린다", async (outcome) => {
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf({ save: async () => outcome }) }).mount(ctx);
      await vi.waitFor(() => expect(has(ctx.root, "저장하기")).toBe(true));
      button(ctx.root, "저장하기").click();
      await vi.waitFor(() => expect(ctx.root.textContent).toContain(SAVE_TEXT[outcome]));
    });

    it("FS6c 공유 창을 쓰는 기기(아이폰)면 누르기 전에 '이미지 저장' 을 누르라고 알린다 — 아니면 안 알린다", async () => {
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf({ usesShareSheet: true }) }).mount(ctx);
      await vi.waitFor(() => expect(ctx.root.textContent).toContain(SHARE_HINT));
      const ctx2 = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf() }).mount(ctx2);
      await vi.waitFor(() => expect(has(ctx2.root, "저장하기")).toBe(true));
      expect(ctx2.root.textContent).not.toContain(SHARE_HINT);
    });

    it("FS6d 저장할 결과가 없으면(피드백을 안 거침 · 다시 찍기로 끝남) '저장하기' 없이 그렇다고 알린다 — 끝내기는 된다", async () => {
      const clearAll = vi.fn(async () => {});
      const ctx = ctxOf();
      saveSlot<null>({ clearAll, getSave: async () => null }).mount(ctx);
      await vi.waitFor(() => expect(ctx.root.textContent).toContain("저장할 결과가 없어요"));
      expect(has(ctx.root, "저장하기")).toBe(false);
      button(ctx.root, "끝내기").click();
      expect(clearAll).toHaveBeenCalledTimes(1);
    });

    it("FS6e 결과 그림을 못 만들었으면 '저장하기' 를 두지 않고 캡처하라고 알린다", async () => {
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf({ card: null }) }).mount(ctx);
      await vi.waitFor(() => expect(ctx.root.textContent).toContain(SAVE_TEXT.unavailable));
      expect(has(ctx.root, "저장하기")).toBe(false);
    });

    it("FS6f 준비하다 오류가 나도 화면은 그대로 — 끝내기는 된다", async () => {
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => { throw new Error("못 만듦"); } }).mount(ctx);
      await flush();
      expect(has(ctx.root, "저장하기")).toBe(false);
      expect(has(ctx.root, "끝내기")).toBe(true);
      expect(ctx.root.textContent).toContain("저장할 결과가 없어요");
    });

    it("FS6g 저장하는 중에 또 눌러도 한 번만 부른다", async () => {
      let done: (o: "downloaded") => void = () => {};
      const save = vi.fn(() => new Promise<"downloaded">((r) => { done = r; }));
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf({ save }) }).mount(ctx);
      await vi.waitFor(() => expect(has(ctx.root, "저장하기")).toBe(true));
      button(ctx.root, "저장하기").click();
      button(ctx.root, "저장하기").click();
      expect(save).toHaveBeenCalledTimes(1);
      done("downloaded");
      await flush();
      // 끝난 뒤에는 다시 저장할 수 있다
      button(ctx.root, "저장하기").click();
      expect(save).toHaveBeenCalledTimes(2);
    });

    it("FS6h 준비되기 전에 화면을 떠나면 뒤늦게 그리지 않는다 — 떠날 때 그림 주소를 놓는다", async () => {
      let done: (k: SaveKit) => void = () => {};
      const ctx = ctxOf();
      const leave = saveSlot<null>({ clearAll: async () => {}, getSave: () => new Promise<SaveKit>((r) => { done = r; }) }).mount(ctx);
      if (typeof leave === "function") leave();
      done(kitOf());
      await flush();
      expect(has(ctx.root, "저장하기")).toBe(false);

      const revoke = vi.spyOn(URL, "revokeObjectURL");
      const ctx2 = ctxOf();
      const leave2 = saveSlot<null>({ clearAll: async () => {}, getSave: async () => kitOf() }).mount(ctx2);
      await vi.waitFor(() => expect(has(ctx2.root, "저장하기")).toBe(true));
      if (typeof leave2 === "function") leave2();
      expect(revoke).toHaveBeenCalledWith("blob:test");
    });

    it("FS6i 재료를 안 넘기면 지금까지와 같다 — '저장하기' 도 안내도 없다", async () => {
      const ctx = ctxOf();
      saveSlot<null>({ clearAll: async () => {} }).mount(ctx);
      await flush();
      expect(has(ctx.root, "저장하기")).toBe(false);
      expect(ctx.root.textContent).not.toContain("저장할 결과가 없어요");
    });
  });
});
