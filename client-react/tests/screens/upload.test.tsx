/**
 * 참고 사진 올리기 (screens/Upload) — 본 앱 `client/tests/flow-slots.test.ts` 의 FS1 · FS1c · FS4c 자리 (#454 D7).
 *
 * 지키는 것: 사진을 고르기 전에는 「적용하기」가 안 눌린다 · 색을 읽으면 onDone 으로 읽은 것과 파일을 넘긴다 ·
 * 얼굴을 못 찾으면 까닭만 말하고 여기 머문다(다음으로 안 간다) · 「템플릿 선택」은 다른 길이다.
 * 색 읽기(`lib/ref-analyze`)는 MediaPipe 를 부르므로 가짜로 바꾼다 — 실패 문구(REF_FAIL_TEXT)는 진짜 것을 쓴다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describeColor } from "@core/color-name";
import Upload from "../../src/screens/Upload";
import { analyzeRefPhoto, REF_FAIL_TEXT, type RefAnalysis } from "../../src/lib/ref-analyze";
import { blockNetwork, stubObjectUrl } from "./helpers";

vi.mock("../../src/lib/ref-analyze", async (orig) => ({
  ...(await orig<typeof import("../../src/lib/ref-analyze")>()),
  analyzeRefPhoto: vi.fn(),
}));
const analyze = vi.mocked(analyzeRefPhoto);

/** 본 앱 시험의 `fakeAnalysis` — 입술 하나만 읽힌 사진 */
function fakeAnalysis(): RefAnalysis {
  const rgb: [number, number, number] = [150, 104, 97];
  const name = describeColor(rgb, "lip");
  return { colors: { lip: { hex: "#966861", rgb, name, product: { hex: "#966861", rgb, name }, n: 500 } }, preview: "data:,", w: 10, h: 10 };
}

/** 사진을 고른 것처럼 — jsdom 에는 파일 선택 창이 없다 */
function pickPhoto(container: HTMLElement): File {
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  const file = new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

const apply = (): HTMLButtonElement => screen.getByRole("button", { name: "적용하기" }) as HTMLButtonElement;

beforeEach(() => {
  blockNetwork();
  stubObjectUrl();
  analyze.mockReset();
});

describe("참고 사진 올리기", () => {
  // flow-slots.test.ts FS1
  it("사진을 고르기 전에는 「적용하기」가 안 눌린다 — 고르면 켜지고 미리보기가 뜬다", () => {
    const { container } = render(<Upload onDone={() => {}} onTemplates={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("참고 사진 · 예상 메이크업");
    expect(apply().disabled).toBe(true);
    pickPhoto(container);
    expect(apply().disabled).toBe(false);
    expect(screen.getByRole("img", { name: "올린 참고 사진" })).toBeTruthy();
    expect(screen.getByText("다른 사진으로 바꾸기")).toBeTruthy();
  });

  // flow-slots.test.ts FS1a 앞부분 — 이 버전은 색 읽기까지만 여기서 하고 서버는 다음 화면(Answer)이 부른다
  it("「적용하기」→ 읽는 동안 기다리는 칸 → 읽은 색과 고른 파일을 onDone 으로 넘긴다", async () => {
    let done: (r: RefAnalysis) => void = () => {};
    analyze.mockImplementation(() => new Promise<RefAnalysis>((r) => { done = r; }));
    const onDone = vi.fn();
    const { container } = render(<Upload onDone={onDone} onTemplates={() => {}} />);
    const file = pickPhoto(container);
    fireEvent.click(apply());
    expect(container.querySelector(".slot-answer-loading")).not.toBeNull();
    // 아직 서버를 안 불렀으니 "만들고 있어요" 라고 하지 않는다 — 읽는 중이라고만
    expect(container.textContent).toContain("사진을 읽고 있어요");
    expect(container.textContent).not.toContain("예상 메이크업을 만들고 있어요");
    const found = fakeAnalysis();
    done(found);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith(found, file);
    expect(analyze).toHaveBeenCalledWith(file);
  });

  // flow-slots.test.ts FS1c · FS4c — 얼굴을 못 찾으면 안내하고 머문다. 다음(서버)으로는 안 간다
  it("얼굴을 못 찾으면 까닭을 알리고 여기 머문다 — 「적용하기」를 다시 누를 수 있고 onDone 은 안 부른다", async () => {
    analyze.mockResolvedValue("noFace");
    const onDone = vi.fn();
    const { container } = render(<Upload onDone={onDone} onTemplates={() => {}} />);
    pickPhoto(container);
    fireEvent.click(apply());
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(REF_FAIL_TEXT.noFace));
    expect(screen.getByRole("status").textContent).toContain("얼굴을 못 찾았어요");
    expect(apply().disabled).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("읽다가 터지면 본 앱처럼 '사진을 읽지 못했어요'(noCanvas) 로 몰아 둔다", async () => {
    analyze.mockRejectedValue(new Error("모델 못 받음"));
    const { container } = render(<Upload onDone={() => {}} onTemplates={() => {}} />);
    pickPhoto(container);
    fireEvent.click(apply());
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(REF_FAIL_TEXT.noCanvas));
  });

  // 본 앱 #420 — 올릴 사진이 없는 사람의 다른 길
  it("「템플릿 선택」은 사진 없이도 눌리고 onTemplates 로 간다", () => {
    const onTemplates = vi.fn();
    render(<Upload onDone={() => {}} onTemplates={onTemplates} />);
    fireEvent.click(screen.getByRole("button", { name: "템플릿 선택" }));
    expect(onTemplates).toHaveBeenCalledTimes(1);
  });

  // flow-slots.test.ts FS4e 와 같은 규칙 — 떠난 뒤에 온 답으로는 아무것도 하지 않는다
  it("읽는 사이에 화면을 떠나면 뒤늦게 온 답으로 onDone 을 부르지 않는다", async () => {
    let done: (r: RefAnalysis) => void = () => {};
    analyze.mockImplementation(() => new Promise<RefAnalysis>((r) => { done = r; }));
    const onDone = vi.fn();
    const { container, unmount } = render(<Upload onDone={onDone} onTemplates={() => {}} />);
    pickPhoto(container);
    fireEvent.click(apply());
    unmount();
    done(fakeAnalysis());
    await new Promise((r) => setTimeout(r, 0));
    expect(onDone).not.toHaveBeenCalled();
  });
});
