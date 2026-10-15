/**
 * 정답사진(예상 메이크업) 화면 (screens/Answer) — 본 앱 `client/tests/flow-slots.test.ts` 의 FS4 · FS4b · FS4d · FS4e · FT1 자리 (#454 D7).
 *
 * 지키는 것: 들어오면 줄인 참고 사진으로 서버를 한 번 부른다 · 기다리는 동안 "만들고 있어요" 와 얼마나 걸리는지(1분) ·
 * 받은 그림은 onMade 로 올리고 「다음」으로 간다 · 못 만들면 `lib/answer-make` 의 까닭별 문장을 보여 주고
 * 「다시 시도」·「그냥 화장 가이드 보기」를 둘 다 둔다 · 템플릿은 번호만 보낸다 · 이미 만든 그림이 있으면 다시 안 보낸다.
 * 서버(`src/api`)는 가짜다 — 주소가 있는 것처럼(`hasAnswerServer: true`) 둔다. 주소가 없을 때는 answer-offline 시험에서 본다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TransferRef } from "@core/transfer-client";
import Answer from "../../src/screens/Answer";
import { makeAnswerPicture } from "../../src/api";
import { MAKE_WAIT_TEXT, makeFailText, shrinkForUpload, type MakeFail, type MakeResult } from "../../src/lib/answer-make";
import { blockNetwork, flush } from "./helpers";

vi.mock("../../src/api", () => ({
  hasAnswerServer: true,
  makeAnswerPicture: vi.fn(),
}));
vi.mock("../../src/lib/answer-make", async (orig) => ({
  ...(await orig<typeof import("../../src/lib/answer-make")>()),
  shrinkForUpload: vi.fn(),
}));
const make = vi.mocked(makeAnswerPicture);
const shrink = vi.mocked(shrinkForUpload);

const bare = new Blob([new Uint8Array([1])], { type: "image/jpeg" });
const made = new Blob([new Uint8Array([9, 9, 9])], { type: "image/webp" });
const small = new Blob([new Uint8Array([7])], { type: "image/webp" });
const photo = new File([new Uint8Array([1, 2, 3])], "ref.png", { type: "image/png" });

const ok = (): MakeResult => ({ ok: true, picture: made, ms: 8600 });
const fail = (why: MakeFail): MakeResult => ({ ok: false, why });

function renderPhoto(over: Partial<React.ComponentProps<typeof Answer>> = {}) {
  const onMade = vi.fn(), onNext = vi.fn();
  const r = render(<Answer source={{ photo }} preview="data:," read={5} bare={bare} made={null} onMade={onMade} onNext={onNext} {...over} />);
  return { ...r, onMade, onNext };
}

beforeEach(() => {
  blockNetwork();
  make.mockReset();
  shrink.mockReset();
  shrink.mockResolvedValue(small);
});

describe("정답사진 만들기", () => {
  // flow-slots.test.ts FS4
  it("들어오면 줄인 참고 사진으로 한 번 부른다 — 기다리는 동안 만들고 있다는 것과 '1분' 을 적고, 받은 그림을 onMade 로 올린다", async () => {
    let done: (r: MakeResult) => void = () => {};
    make.mockImplementation(() => new Promise<MakeResult>((r) => { done = r; }));
    const { container, onMade, onNext, rerender } = renderPhoto();
    await waitFor(() => expect(make).toHaveBeenCalledTimes(1));
    // 폰 사진첩의 큰 사진을 그대로 올리지 않는다 — 줄인 것을 보낸다
    expect(make).toHaveBeenCalledWith(bare, small);
    expect(container.textContent).toContain("예상 메이크업을 만들고 있어요");
    expect(screen.getByRole("status").textContent).toBe(MAKE_WAIT_TEXT);
    expect(MAKE_WAIT_TEXT).toContain("1분");
    expect(container.textContent).not.toContain("예상 메이크업 완성");
    done(ok());
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(made));
    // 주소를 만드는 것은 App 이다 — 그 주소가 내려오면 받은 그림을 보여 준다
    rerender(<Answer source={{ photo }} preview="data:," read={5} bare={bare} made="blob:made" onMade={onMade} onNext={onNext} />);
    expect(container.textContent).toContain("예상 메이크업 완성");
    const img = screen.getByRole("img", { name: "예상 메이크업" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:made");
    expect(container.textContent).toContain("다섯 부위의 색을 모두 읽었어요");
    fireEvent.click(screen.getByRole("button", { name: "다음 · 화장 가이드 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledTimes(1);
  });

  // flow-slots.test.ts FS4b — 까닭별 문장은 lib/answer-make 의 makeFailText 그대로
  it.each([
    ["busy", "사람이 많아요"],
    ["down", "답하지 않아요"],
    ["off", "만들 수 없어요"],
    ["timeout", "오래 걸려서"],
    ["network", "인터넷"],
    ["too_large", "너무 커요"],
    ["rejected", "맨얼굴"],
    ["no_bare", "맨얼굴"],
  ] as const)("못 만들면(%s) 까닭을 알리고 — 「다시 시도」로 다시 부르고, 「그냥 화장 가이드 보기」로도 갈 수 있다", async (why, text) => {
    make.mockResolvedValue(fail(why));
    const { container, onMade, onNext } = renderPhoto();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(makeFailText(why)));
    expect(screen.getByRole("status").textContent).toContain(text);
    expect(container.textContent).toContain("예상 메이크업을 못 만들었어요");
    expect(container.textContent).not.toContain("예상 메이크업 완성");
    expect(onMade).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(make).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "그냥 화장 가이드 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("취소(cancelled)는 아무 말도 하지 않는다 — makeFailText 가 null 이라 까닭 줄이 없다", async () => {
    make.mockResolvedValue(fail("cancelled"));
    const { container } = renderPhoto();
    await waitFor(() => expect(container.textContent).toContain("예상 메이크업을 못 만들었어요"));
    expect(makeFailText("cancelled")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  // flow-slots.test.ts FS4d
  it("사진을 줄이지 못하면 고른 사진 그대로 보낸다", async () => {
    shrink.mockRejectedValue(new Error("못 줄임"));
    make.mockResolvedValue(ok());
    const { onMade } = renderPhoto();
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(made));
    expect(make.mock.calls[0]![1]).toBe(photo);
  });

  // flow-slots.test.ts FT1 — 템플릿은 줄일 사진이 없다. 번호(숫자)만 보낸다
  it("템플릿이면 맨얼굴 + 번호만 보내고 줄이지 않는다", async () => {
    make.mockResolvedValue(ok());
    const { onMade } = renderPhoto({ source: { template: 3 } });
    await waitFor(() => expect(onMade).toHaveBeenCalledWith(made));
    expect(make).toHaveBeenCalledWith(bare, { template: 3 } satisfies TransferRef);
    expect(shrink).not.toHaveBeenCalled();
  });

  // flow-slots.test.ts FS4e
  it("기다리다 화면을 떠나면 뒤늦게 온 답으로 onMade 를 부르지 않는다", async () => {
    let done: (r: MakeResult) => void = () => {};
    make.mockImplementation(() => new Promise<MakeResult>((r) => { done = r; }));
    const { onMade, unmount } = renderPhoto();
    await waitFor(() => expect(make).toHaveBeenCalled());
    unmount();
    done(ok());
    await flush();
    expect(onMade).not.toHaveBeenCalled();
  });

  // 색조 팔레트에서 뒤로 돌아왔을 때 — GPU 가 같은 그림을 또 그리지 않게
  it("이미 만든 그림(made)이 있으면 서버를 다시 부르지 않고 완성 화면이다", async () => {
    const { container } = renderPhoto({ made: "blob:old" });
    await flush();
    expect(make).not.toHaveBeenCalled();
    expect(container.textContent).toContain("예상 메이크업 완성");
  });

  it("맨얼굴이 없으면(no_bare) 서버 쪽이 바로 까닭을 돌려주고 — 그래도 「그냥 화장 가이드 보기」로 갈 수 있다", async () => {
    make.mockResolvedValue(fail("no_bare"));
    const { onNext } = renderPhoto({ bare: null });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(makeFailText("no_bare")));
    fireEvent.click(screen.getByRole("button", { name: "그냥 화장 가이드 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("다섯 부위를 다 못 읽었으면 몇 개를 읽었는지 글로 말한다", async () => {
    make.mockResolvedValue(ok());
    const { container } = renderPhoto({ read: 3, made: "blob:x" });
    await flush();
    expect(container.textContent).toContain("다섯 부위 가운데 3개 부위의 색을 읽었어요");
  });
});
