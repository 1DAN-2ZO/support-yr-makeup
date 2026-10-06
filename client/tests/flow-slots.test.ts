// @vitest-environment jsdom
// 새 흐름 뼈대 (2026-10-06) — 담당이 화면을 올리기 전 자리. 흐름을 끝까지 눌러 볼 수 있게 "다음" 이 있다
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { PART_NAME } from "@core/score";
import { PART_IDS, type PartId, type Versions } from "@core/types";
import { partGuideSlot, saveSlot, slotScreen } from "@screens/flow-slots";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function ctxOf() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const ctx: ScreenContext<null> = { root, session: null, go: vi.fn(), goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "answer", part: null, ver }, memorySink().sink) };
  return ctx;
}
const button = (root: HTMLElement, text: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`"${text}" 버튼이 없습니다`);
  return b;
};

describe("빈 자리 화면", () => {
  it("FS1 무엇이 들어올 자리인지 · 누가 만드는지 보여 주고, '다음' 으로 흐름을 이어 간다", () => {
    const ctx = ctxOf();
    slotScreen<null>({ title: "참고 사진 · 정답사진", owner: "①·②·④", todo: ["참고 사진 업로드", "정답사진 생성"], next: "partguide" }).mount(ctx);
    expect(ctx.root.textContent).toContain("참고 사진 · 정답사진");
    expect(ctx.root.textContent).toContain("①·②·④");
    expect(ctx.root.textContent).toContain("정답사진 생성");
    button(ctx.root, "다음").click();
    // 부위 가이드로 갈 때는 첫 부위부터 — 진행 칩과 같은 goPart (지금 부위가 정해져 칩에 표시된다)
    expect(ctx.goPart).toHaveBeenCalledWith(PART_IDS[0]);
    expect(ctx.go).not.toHaveBeenCalled();
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
    const first = PART_IDS[0]!, second = PART_IDS[1]!, last = PART_IDS[PART_IDS.length - 1]!;
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
});
