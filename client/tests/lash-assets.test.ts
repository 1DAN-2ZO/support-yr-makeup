// 마스카라 텍스처는 앱 시작 때 한 번 불러 둔다 (#250) — 화면 3·2-b 는 준비됐으면 쓰고, 아니면 마스카라만 뺀다
import { afterEach, describe, expect, it, vi } from "vitest";
import { LASHES, loadLashes, resetLashesForTest } from "@screens/lash-assets";

afterEach(() => { vi.restoreAllMocks(); resetLashesForTest(); });

describe("마스카라 텍스처 불러 두기", () => {
  it("A1 여러 번 불러도 한 번만 받는다", async () => {
    const load = vi.spyOn(LASHES, "load").mockResolvedValue();
    await Promise.all([loadLashes(), loadLashes()]);
    await loadLashes();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("A2 실패하면 다음에 다시 받는다 (네트워크가 잠깐 끊겼던 것)", async () => {
    const load = vi.spyOn(LASHES, "load").mockRejectedValueOnce(new Error("끊김")).mockResolvedValue();
    await expect(loadLashes()).rejects.toThrow("끊김");
    await loadLashes();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("A3 앱 주소 기준 lashes/natural/ 에서 받는다 (배포 경로가 / 가 아니어도)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("x"));
    await expect(loadLashes()).rejects.toThrow();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${import.meta.env.BASE_URL}lashes/natural/lashes.json`);
  });
});
