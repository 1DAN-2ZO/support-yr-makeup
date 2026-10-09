// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@core/wait-limit";

describe("기다리는 한도 (within)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("W1 한도 안에 끝나면 그 값", async () => {
    const p = within(new Promise<string>((ok) => setTimeout(() => ok("그림"), 1000)), 5000, "늦음");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toBe("그림");
  });

  it("W2 한도를 넘기면 대신 줄 값 — 끝나기를 더 기다리지 않는다", async () => {
    const p = within(new Promise<string>((ok) => setTimeout(() => ok("그림"), 60_000)), 5000, "늦음");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe("늦음");
  });

  it("W3 실패는 그대로 던진다 (한도 안에)", async () => {
    const p = within(Promise.reject(new Error("서버 꺼짐")), 5000, "늦음");
    await expect(p).rejects.toThrow("서버 꺼짐");
  });

  it("W4 끝난 뒤에는 타이머를 남기지 않는다", async () => {
    await within(Promise.resolve(1), 5000, 0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
