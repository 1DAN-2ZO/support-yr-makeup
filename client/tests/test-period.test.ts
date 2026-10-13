// 테스트 기간이 끝나면 앱을 닫는다 (2026-10-13 결정) — 10월 19일 오후 3시(한국 시간)부터
import { describe, expect, it } from "vitest";
import { TEST_ENDS_AT_MS, isTestClosed } from "@core/test-period";

describe("isTestClosed", () => {
  it("TP1 끝나는 때는 2026-10-19 오후 3시 한국 시간이다 — 동의 화면에 적은 그 시각", () => {
    expect(new Date(TEST_ENDS_AT_MS).toISOString()).toBe("2026-10-19T06:00:00.000Z");
  });

  it("TP2 그 전에는 열려 있고, 그 시각부터 닫힌다", () => {
    expect(isTestClosed(TEST_ENDS_AT_MS - 1, "")).toBe(false);
    expect(isTestClosed(TEST_ENDS_AT_MS, "")).toBe(true);
    expect(isTestClosed(TEST_ENDS_AT_MS + 86_400_000, "?utm_source=youtube")).toBe(true);
  });

  it("TP3 주소에 ?team 을 붙이면 닫힌 뒤에도 열린다 — 발표 시연 · 확인용. 비슷한 이름으로는 안 열린다", () => {
    expect(isTestClosed(TEST_ENDS_AT_MS + 1, "?team")).toBe(false);
    expect(isTestClosed(TEST_ENDS_AT_MS + 1, "?utm_source=x&team=1")).toBe(false);
    expect(isTestClosed(TEST_ENDS_AT_MS + 1, "?teammate")).toBe(true);
    expect(isTestClosed(TEST_ENDS_AT_MS + 1, "?utm_source=team")).toBe(true);
  });
});
