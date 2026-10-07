// @vitest-environment jsdom
// 새 흐름 뼈대 (2026-10-06) — 담당이 화면을 올리기 전 자리. 흐름을 끝까지 눌러 볼 수 있게 "다음" 이 있다
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { PART_NAME } from "@core/score";
import { PART_IDS, type PartId, type Versions } from "@core/types";
import { partGuideSlot, saveSlot, slotScreen } from "@screens/flow-slots";
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
  const SPEC = { title: "참고 사진 · 정답사진", owner: "①·②·④", todo: ["참고 사진 업로드", "정답사진 생성"], next: "partguide" } as const;

  it("FS1 사진을 고르기 전에는 '적용하기' 가 안 눌린다 — 잴 사진이 없다", () => {
    const ctx = ctxOf();
    slotScreen<null>(SPEC, { analyze: async () => fakeAnalysis() }).mount(ctx);
    expect(ctx.root.textContent).toContain("참고 사진 · 정답사진");
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
    await vi.waitFor(() => expect(ctx.root.textContent).toContain("정답사진 완성"));
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

  it("FS1b 부위 가이드가 아닌 다음 화면은 그대로 go", () => {
    const ctx = ctxOf();
    slotScreen<null>({ title: "6 피드백", owner: "③", todo: [], next: "save" }).mount(ctx);
    button(ctx.root, "다음").click();
    expect(ctx.go).toHaveBeenCalledWith("save");
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
