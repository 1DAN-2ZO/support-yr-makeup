/**
 * 정답사진 화면 — 서버 주소가 비어 있을 때 (screens/Answer, `hasAnswerServer: false`) (#454 D7).
 * 본 앱 `ui-preview`(makeAnswer 를 안 주는 길)와 같은 자리 — 서버를 부르지 않고 읽은 색으로만 안내하며, 다음으로는 갈 수 있다.
 * `hasAnswerServer` 는 모듈 상수라 파일을 따로 둔다 (answer.test.tsx 는 켜진 쪽)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Answer from "../../src/screens/Answer";
import { makeAnswerPicture } from "../../src/api";
import { blockNetwork, flush } from "./helpers";

vi.mock("../../src/api", () => ({
  hasAnswerServer: false,
  makeAnswerPicture: vi.fn(),
}));

beforeEach(() => {
  blockNetwork();
});

describe("정답사진 — 서버가 안 붙었을 때", () => {
  it("서버를 부르지 않고, 빈 자리와 올린 참고 사진 · '아직 안 붙었어요' 한 줄을 보여 주며, 「다음」으로 갈 수 있다", async () => {
    const onMade = vi.fn(), onNext = vi.fn();
    const photo = new File([new Uint8Array([1])], "ref.png", { type: "image/png" });
    const { container } = render(<Answer source={{ photo }} preview="data:ref" read={5} bare={null} made={null} onMade={onMade} onNext={onNext} />);
    await flush();
    expect(makeAnswerPicture).not.toHaveBeenCalled();
    expect(onMade).not.toHaveBeenCalled();
    expect(container.textContent).toContain("참고 사진에서 색을 읽었어요");
    // 그림이 없을 때 참고 사진으로 그 자리를 채우지 않는다 — 올린 사진은 작게 따로
    expect(container.textContent).toContain("여기에 예상 메이크업이 나와요");
    expect(screen.getByRole("img", { name: "올린 참고 사진" }).getAttribute("src")).toBe("data:ref");
    expect(screen.queryByRole("img", { name: "예상 메이크업" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("아직 안 붙었어요");
    fireEvent.click(screen.getByRole("button", { name: "다음 · 화장 가이드 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
