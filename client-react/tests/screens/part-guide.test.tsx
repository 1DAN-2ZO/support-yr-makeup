/**
 * 부위 가이드 (screens/PartGuide) — 본 앱 `client/tests/flow-slots.test.ts` 의 FS2 · FS2b · FS5 묶음을 옮긴 것 (#454 D7).
 *
 * 지키는 것: 부위 차례(눈썹 → 아이라이너 → 아이섀도우 → 입술 → 볼터치) · 「다음」은 다음 부위, 마지막이면 「다음 · 완성사진 찍기」로 onDone ·
 * 칩으로 건너뛰기 · 곁 화면(실시간 가이드)에서 돌아올 때 보던 부위(startPart) · 정답사진 재료가 있으면 캔버스, 없으면 「예시」 견본 ·
 * 기다리는 동안은 견본을 보여 주지 않는다 · 그 부위의 화장을 못 찾았으면 자른 그림은 두고 글로 밝힌다 · 떠난 뒤에 온 재료로 그리지 않는다.
 * 캔버스에 그리는 일(`drawGuidePage`)은 jsdom 에 2D 캔버스가 없어 가짜로 바꾼다 — 본 앱 시험의 `paintGuide` 자리
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PartGuide from "../../src/screens/PartGuide";
import { drawGuidePage, type GuideLoad, type GuideView } from "../../src/lib/guide-source";
import { PART_NAME, PART_ORDER } from "../../src/parts";
import { blockNetwork, fakeColors, flush } from "./helpers";

vi.mock("../../src/lib/guide-source", async (orig) => ({
  ...(await orig<typeof import("../../src/lib/guide-source")>()),
  drawGuidePage: vi.fn(() => true),
}));
const paint = vi.mocked(drawGuidePage);

/** 본 앱 시험의 `view` — 눈썹 · 입술만 찾은 재료 */
const view = { pages: {}, found: ["brow", "lip"], size: { w: 600, h: 600 }, picture: {}, ms: 1, dispose: () => {} } as unknown as GuideView;

const photo = (c: HTMLElement): HTMLElement => c.querySelector<HTMLElement>(".slot-guide-photo")!;
const coach = (c: HTMLElement): string => c.querySelector(".coach p")?.textContent?.trim() ?? "";
const current = (): string => screen.getByRole("button", { current: true }).textContent ?? "";
const next = (): HTMLButtonElement => screen.getByRole("button", { name: /^다음/ }) as HTMLButtonElement;

beforeEach(() => {
  blockNetwork();
  paint.mockClear();
});

describe("부위 가이드 — 차례", () => {
  // flow-slots.test.ts FS2 · FS2b
  it("첫 부위(눈썹)부터 — 「다음」은 다음 부위 이름을 달고 한 칸씩, 마지막에는 「다음 · 완성사진 찍기」로 onDone", () => {
    const onDone = vi.fn();
    render(<PartGuide colors={fakeColors()} onDone={onDone} />);
    for (let i = 0; i < PART_ORDER.length; i++) {
      const name = PART_NAME[PART_ORDER[i]!];
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(name);
      expect(current()).toBe(name);
      if (i < PART_ORDER.length - 1) {
        expect(next().textContent).toBe(`다음 — ${PART_NAME[PART_ORDER[i + 1]!]}`);
        fireEvent.click(next());
        expect(onDone).not.toHaveBeenCalled();
      }
    }
    // 마지막 부위 다음은 피드백이 아니라 완성사진 촬영이다 (FLOW: partguide → attempt)
    expect(next().textContent).toBe("다음 · 완성사진 찍기");
    fireEvent.click(next());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("칩은 다섯 부위가 차례대로, 누르면 그 부위로 건너뛴다 — 쉐딩 칩은 없다", () => {
    render(<PartGuide colors={fakeColors()} onDone={() => {}} />);
    const chips = screen.getByRole("navigation", { name: "부위 고르기" });
    const names = [...chips.querySelectorAll("button")].map((b) => b.textContent);
    expect(names).toEqual(PART_ORDER.map((p) => PART_NAME[p]));
    expect(names).not.toContain("쉐딩");
    fireEvent.click(screen.getByRole("button", { name: "입술" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("입술");
    expect(current()).toBe("입술");
  });

  it("곁 화면에서 돌아올 때 보던 부위(startPart)를 다시 펼친다", () => {
    render(<PartGuide colors={fakeColors()} startPart="shadow" onDone={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PART_NAME.shadow);
  });

  it("「실시간 가이드로 보기」는 지금 부위를 들고 onLive — 안 주면 버튼이 없다", () => {
    const onLive = vi.fn();
    const { unmount } = render(<PartGuide colors={fakeColors()} onDone={() => {}} onLive={onLive} />);
    fireEvent.click(screen.getByRole("button", { name: "아이라이너" }));
    fireEvent.click(screen.getByRole("button", { name: "실시간 가이드로 보기" }));
    expect(onLive).toHaveBeenCalledWith("liner");
    unmount();
    render(<PartGuide colors={fakeColors()} onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "실시간 가이드로 보기" })).toBeNull();
  });

  it("색 한 줄은 본 앱 표기 — 이름 뒤에 늘 '계열' 이 붙는다", () => {
    const colors = fakeColors();
    const { container } = render(<PartGuide colors={fakeColors()} onDone={() => {}} />);
    expect(container.querySelector(".slot-color strong")?.textContent).toBe(`${colors.brow.name.text} 계열`);
  });
});

describe("부위 가이드 — 정답사진을 잘라 보여 주기", () => {
  // flow-slots.test.ts FS5 · FS5h
  it("재료가 있으면 견본 대신 그 부위로 자른 캔버스를 그린다 — 말풍선도 '예시' 가 아니다", async () => {
    const { container } = render(<PartGuide colors={fakeColors()} startPart="lip" getGuide={async () => ({ ok: true, view })} onDone={() => {}} />);
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(1));
    const canvas = photo(container).querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(paint).toHaveBeenCalledWith(canvas, view, "lip");
    expect(photo(container).querySelector(".slot-guide-line, .slot-guide-dot")).toBeNull();
    expect(container.textContent).not.toContain("찾지 못했어요");
    expect(coach(container)).toBe("예상 메이크업에서 이 부위만 크게 잘라서 보여드릴게요");
    expect(container.textContent).not.toContain("예시");
  });

  // flow-slots.test.ts FS5b
  it("기다리는 동안은 견본 그림을 보여 주지 않는다 — 가짜 얼굴이 먼저 떴다 바뀌지 않게", () => {
    const { container } = render(<PartGuide colors={fakeColors()} startPart="lip" getGuide={() => new Promise(() => {})} onDone={() => {}} />);
    expect(photo(container).querySelector(".slot-guide-line, .slot-guide-dot")).toBeNull();
    expect(photo(container).textContent).toContain("준비");
  });

  // flow-slots.test.ts FS5c
  it("그 부위의 화장을 못 찾았으면 자른 그림은 보여 주되 못 찾았다고 알린다", async () => {
    const { container } = render(<PartGuide colors={fakeColors()} startPart="cheek" getGuide={async () => ({ ok: true, view })} onDone={() => {}} />);
    await waitFor(() => expect(paint).toHaveBeenCalledWith(expect.anything(), view, "cheek"));
    expect(container.textContent).toContain("찾지 못했어요");
  });

  // flow-slots.test.ts FS5d · FS5e(실패) · FS5i — 견본으로 돌아갈 때는 「예시」 딱지와 말풍선
  it.each([
    ["재료를 안 받음", undefined],
    ["맨얼굴 없음", async (): Promise<GuideLoad> => ({ ok: false, missing: "bare" })],
    ["정답사진 없음", async (): Promise<GuideLoad> => ({ ok: false, missing: "answer" })],
    ["크기 다름", async (): Promise<GuideLoad> => ({ ok: false, missing: "answer_size" })],
    ["만들다 실패", async (): Promise<GuideLoad> => { throw new Error("풀지 못함"); }],
  ])("%s — 견본 그림 그대로 '예시' 딱지와 말풍선, 캔버스는 없다", async (_name, getGuide) => {
    const { container } = render(<PartGuide colors={fakeColors()} startPart="lip" getGuide={getGuide} onDone={() => {}} />);
    await flush();
    expect(paint).not.toHaveBeenCalled();
    expect(photo(container).querySelector(".slot-guide-line")).not.toBeNull();
    expect(photo(container).querySelector("canvas")).toBeNull();
    expect(photo(container).querySelector(".slot-guide-sample")?.textContent).toBe("예시");
    expect(coach(container)).toContain("예시 그림이에요");
  });

  it("부위를 옮기면 다시 그리기만 한다 — 재료는 한 번만 받는다", async () => {
    const getGuide = vi.fn(async (): Promise<GuideLoad> => ({ ok: true, view }));
    render(<PartGuide colors={fakeColors()} getGuide={getGuide} onDone={() => {}} />);
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "입술" }));
    await waitFor(() => expect(paint).toHaveBeenCalledTimes(2));
    expect(paint).toHaveBeenLastCalledWith(expect.anything(), view, "lip");
    expect(getGuide).toHaveBeenCalledTimes(1);
  });

  // flow-slots.test.ts FS5g
  it("기다리다 화면을 떠나면 뒤늦게 온 재료로 그리지 않는다", async () => {
    let done: (r: GuideLoad) => void = () => {};
    const { unmount } = render(<PartGuide colors={fakeColors()} startPart="lip" getGuide={() => new Promise<GuideLoad>((r) => { done = r; })} onDone={() => {}} />);
    unmount();
    done({ ok: true, view });
    await flush();
    expect(paint).not.toHaveBeenCalled();
  });
});
