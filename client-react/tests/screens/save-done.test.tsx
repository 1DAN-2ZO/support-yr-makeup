/**
 * 저장 · 끝내기 (screens/Save + screens/Survey) 와 끝 화면 (screens/Done) —
 * 본 앱 `client/tests/flow-slots.test.ts` FS3 · FS6 묶음과 `client/tests/done-survey.test.ts` SM · DS 묶음을 옮긴 것 (#454 D7).
 *
 * 지키는 것: 「끝내기」는 설문 주소가 있으면 그 화면 위에 후기 모달을 먼저 띄우고, 어느 쪽으로 닫든 끝 화면(onDone)으로 한 번만 간다 ·
 * 주소가 없으면 모달 없이 바로 끝낸다 · 「결과 저장」은 재료가 될 때만 그리고, 결과는 본 앱 글(SAVE_TEXT · SHARE_HINT)로 말한다 ·
 * 끝 화면은 지웠다는 안내 · 후기 칸(주소가 있을 때만, 새 창) · 「다시 하기」.
 * 설문 주소(`survey-link`)와 한 장 만들기(`prepareSave`)는 가짜다 — 전자는 운영 연결(ops)을, 후자는 캔버스를 쓴다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WholeFeedback } from "@core/feedback-whole";
import Save from "../../src/screens/Save";
import Done from "../../src/screens/Done";
import { surveyLink } from "../../src/survey-link";
import { prepareSave, SAVE_TEXT, SHARE_HINT, type SaveKit } from "../../src/lib/feedback-card";
import type { FeedbackLoad, FeedbackView } from "../../src/lib/feedback-source";
import { blockNetwork, fakeColors, flush, TEMPLATE } from "./helpers";

vi.mock("../../src/survey-link", () => ({ surveyLink: vi.fn(() => null), SURVEY_BASE: "" }));
vi.mock("../../src/lib/feedback-card", async (orig) => ({
  ...(await orig<typeof import("../../src/lib/feedback-card")>()),
  prepareSave: vi.fn(),
}));
const survey = vi.mocked(surveyLink);
const prepare = vi.mocked(prepareSave);

const FORM = "https://docs.google.com/forms/d/e/TEST/viewform?usp=pp_url&entry.1=sid";
const whole: WholeFeedback = { parts: [{ part: "lip", name: "입술", tone: "ok", line: "비슷해요" }], ok: ["입술"], fix: [] };
const viewOf = (feedback: WholeFeedback = whole): FeedbackView => ({
  answerUrl: "blob:a", attemptUrl: "blob:b", answer: new Blob([new Uint8Array([1])]), attempt: new Blob([new Uint8Array([2])]),
  feedback, ms: 1, frames: 1, hairFrames: 0, movedFailed: false, dispose: () => {},
});
const card = new Blob([new Uint8Array([5, 5])], { type: "image/jpeg" });
const kitOf = (over: Partial<SaveKit> = {}): SaveKit => ({ card, usesShareSheet: false, save: vi.fn(async () => "downloaded" as const), ...over });

function renderSave(getFeedback?: () => Promise<FeedbackLoad>) {
  const onDone = vi.fn();
  const r = render(<Save template={TEMPLATE} colors={fakeColors()} getFeedback={getFeedback} onDone={onDone} />);
  return { ...r, onDone };
}
const finish = (): HTMLButtonElement => screen.getByRole("button", { name: "끝내기" }) as HTMLButtonElement;
const saveBtn = (): HTMLElement | null => screen.queryByRole("button", { name: "결과 저장" });

beforeEach(() => {
  blockNetwork();
  survey.mockReset();
  survey.mockReturnValue(null);
  prepare.mockReset();
});

describe("저장 화면 — 끝내기와 후기 모달", () => {
  // flow-slots.test.ts FS3 · done-survey.test.ts SM4
  it("설문 주소가 없으면 모달 없이 바로 끝 화면으로 — 설문이 흐름을 막지 않는다", () => {
    const { onDone } = renderSave();
    fireEvent.click(finish());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // done-survey.test.ts SM1 · SM2
  it("주소가 있으면 「끝내기」를 누른 그 화면 위에 모달이 뜨고, 「다음에 할게요」로 닫아야 그때 끝 화면으로", () => {
    survey.mockReturnValue(FORM);
    const { onDone } = renderSave();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(finish());
    const box = screen.getByRole("dialog");
    expect(box.textContent).toContain("사용자 의견을 들려주세요");
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다음에 할게요" }));
    // 모달을 치우는 것은 화면을 바꾸는 App 이다 — 이 화면은 onDone 을 한 번 올리는 데서 끝난다
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // done-survey.test.ts SM3
  it("「후기 남기기」를 눌러도 끝 화면으로 간다 — 폼은 새 창에서 열린다", () => {
    survey.mockReturnValue(FORM);
    const { onDone } = renderSave();
    fireEvent.click(finish());
    const a = screen.getByRole("link", { name: "후기 남기기" }) as HTMLAnchorElement;
    expect(a.href).toBe(FORM);
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    fireEvent.click(a);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // done-survey.test.ts SM5 — 두 번 눌러도 한 번만
  it("뒷배경 · Esc 로 닫아도 끝 화면으로 한 번만 간다 — 이 화면에 갇히지 않는다", () => {
    survey.mockReturnValue(FORM);
    const { container, onDone } = renderSave();
    fireEvent.click(finish());
    fireEvent.click(finish());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.keyDown(container.querySelector(".done-modal-back")!, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("저장 화면 — 결과 한 장 저장하기", () => {
  it("고른 화장과 다섯 부위의 색을 한 장에 모아 보여 준다", () => {
    const colors = fakeColors();
    const { container } = renderSave();
    expect(container.textContent).toContain(TEMPLATE.name);
    expect(screen.getByText(`입술 · ${colors.lip.name.text}`)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  // flow-slots.test.ts FS6 — 이 버전은 **누를 때** 만든다 (Save.tsx 머리글 1번)
  it("재료가 되면 「결과 저장」을 보여 주고 — 누르면 그때 한 장을 만들어 저장을 부르고 결과를 본 앱 글로 말한다", async () => {
    const kit = kitOf();
    prepare.mockResolvedValue(kit);
    renderSave(async () => ({ ok: true, view: viewOf() }));
    await waitFor(() => expect(saveBtn()).not.toBeNull());
    expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(saveBtn()!);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0]).toMatchObject({ feedback: whole });
    await waitFor(() => expect(kit.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SAVE_TEXT.downloaded));
  });

  // flow-slots.test.ts FS6b
  it.each(["shared", "downloaded", "cancelled", "unavailable"] as const)("저장 결과(%s)를 정해 둔 문장으로 알린다", async (outcome) => {
    prepare.mockResolvedValue(kitOf({ save: async () => outcome }));
    renderSave(async () => ({ ok: true, view: viewOf() }));
    await waitFor(() => expect(saveBtn()).not.toBeNull());
    fireEvent.click(saveBtn()!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SAVE_TEXT[outcome]));
  });

  // flow-slots.test.ts FS6c
  it("공유 창을 쓰는 기기(아이폰)면 '이미지 저장' 을 누르라고 먼저 알린다", async () => {
    let done: (o: "shared") => void = () => {};
    prepare.mockResolvedValue(kitOf({ usesShareSheet: true, save: () => new Promise<"shared">((r) => { done = r; }) }));
    renderSave(async () => ({ ok: true, view: viewOf() }));
    await waitFor(() => expect(saveBtn()).not.toBeNull());
    fireEvent.click(saveBtn()!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SHARE_HINT));
    done("shared");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SAVE_TEXT.shared));
  });

  // flow-slots.test.ts FS6e
  it("결과 그림을 못 만들었으면(card 없음) 캡처하라고 알린다", async () => {
    prepare.mockResolvedValue(kitOf({ card: null }));
    renderSave(async () => ({ ok: true, view: viewOf() }));
    await waitFor(() => expect(saveBtn()).not.toBeNull());
    fireEvent.click(saveBtn()!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(SAVE_TEXT.unavailable));
  });

  // flow-slots.test.ts FS6g
  it("저장하는 중에 또 눌러도 한 번만 부른다 — 끝난 뒤에는 다시 저장할 수 있고, 한 장은 다시 안 만든다", async () => {
    let done: (o: "downloaded") => void = () => {};
    const save = vi.fn(() => new Promise<"downloaded">((r) => { done = r; }));
    prepare.mockResolvedValue(kitOf({ save }));
    renderSave(async () => ({ ok: true, view: viewOf() }));
    await waitFor(() => expect(saveBtn()).not.toBeNull());
    fireEvent.click(saveBtn()!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(saveBtn()!);
    expect(save).toHaveBeenCalledTimes(1);
    done("downloaded");
    await waitFor(() => expect((saveBtn() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(saveBtn()!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  // flow-slots.test.ts FS6d · FS6f · FS6i — 못 만들면 버튼 대신 까닭 한 줄. 끝내기는 된다
  it.each([
    ["보관함 없음", undefined, "피드백을 거치지 않아서"],
    ["맨얼굴 없음", async (): Promise<FeedbackLoad> => ({ ok: false, missing: "bare" }), "맨얼굴 사진이 없어서"],
    ["정답사진 없음", async (): Promise<FeedbackLoad> => ({ ok: false, missing: "answer" }), "예상 메이크업이 없어서"],
    ["판정 막힘", async (): Promise<FeedbackLoad> => ({ ok: true, view: viewOf({ blocked: "막힘", parts: [], ok: [], fix: [] }) }), "사진 조건이 많이 달라"],
    ["문장 없음", async (): Promise<FeedbackLoad> => ({ ok: true, view: viewOf({ parts: [], ok: [], fix: [] }) }), "피드백 문장이 없어서"],
    ["재다가 오류", async (): Promise<FeedbackLoad> => { throw new Error("못 만듦"); }, "사진을 견주다가 멈춰서"],
  ])("%s — 「결과 저장」 없이 까닭을 적고, 「끝내기」는 된다", async (_name, getFeedback, why) => {
    const { container, onDone } = renderSave(getFeedback);
    await waitFor(() => expect(container.querySelector(".save-why")).not.toBeNull());
    expect(container.querySelector(".save-why")?.textContent).toContain(why);
    expect(saveBtn()).toBeNull();
    fireEvent.click(finish());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("재료가 오기 전에 화면을 떠나면 뒤늦게 그리지 않는다", async () => {
    let done: (r: FeedbackLoad) => void = () => {};
    const { unmount } = renderSave(() => new Promise<FeedbackLoad>((r) => { done = r; }));
    unmount();
    done({ ok: true, view: viewOf() });
    await flush();
    expect(saveBtn()).toBeNull();
  });
});

describe("끝 화면 (Done)", () => {
  // done-survey.test.ts DS1 · DS5
  it("주소가 없으면 후기 칸을 아예 안 그린다 — 지웠다는 안내와 「다시 하기」는 그대로", () => {
    const onRestart = vi.fn();
    const { container } = render(<Done onRestart={onRestart} />);
    expect(screen.getByRole("heading", { name: "끝났어요" })).toBeTruthy();
    expect(container.textContent).toContain("사진과 기록은 모두 지웠어요");
    // 서버 보관 날짜는 동의문(테스트 기간 보관)과 같은 날짜여야 한다
    expect(container.textContent).toContain("10월 19일 오후 5시에 지워요");
    expect(container.querySelector(".done-survey")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 하기" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  // done-survey.test.ts DS2 · DS4
  it("주소가 있으면 후기 칸이 뜨고 새 창으로 열린다 — 「다시 하기」는 그대로", () => {
    survey.mockReturnValue(FORM);
    const onRestart = vi.fn();
    render(<Done onRestart={onRestart} />);
    const a = screen.getByRole("link", { name: "후기 남기기 (1분)" }) as HTMLAnchorElement;
    expect(a.href).toBe(FORM);
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
    fireEvent.click(screen.getByRole("button", { name: "다시 하기" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
