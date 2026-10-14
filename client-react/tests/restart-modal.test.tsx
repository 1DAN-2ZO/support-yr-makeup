/** 로고의 "처음부터 다시 할까요?" (screens/RestartModal) — #454 C3. 되돌릴 수 없는 쪽이 실수로 눌리면 안 된다 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RestartModal from "../src/screens/RestartModal";

describe("RestartModal", () => {
  it("무엇이 지워지는지 먼저 말하고, '지우고 다시 시작' 을 누르면 onRestart", () => {
    const onRestart = vi.fn(), onCancel = vi.fn();
    render(<RestartModal onRestart={onRestart} onCancel={onCancel} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/찍은 사진과 올려 주신 사진이 모두 지워져요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "지우고 다시 시작" }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("'그냥 둘게요' · 뒷배경 · Esc 는 전부 안 지우는 쪽이다", () => {
    const onRestart = vi.fn(), onCancel = vi.fn();
    const { container } = render(<RestartModal onRestart={onRestart} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "그냥 둘게요" }));
    const back = container.querySelector(".done-modal-back")!;
    fireEvent.click(back);
    fireEvent.keyDown(back, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it("뜨면 포커스는 안 지우는 쪽('그냥 둘게요')에 있다", () => {
    render(<RestartModal onRestart={() => {}} onCancel={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "그냥 둘게요" }));
  });
});
