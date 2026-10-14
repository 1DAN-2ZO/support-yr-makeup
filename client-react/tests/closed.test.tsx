/** 테스트 기간 마감 화면 (screens/Closed, core/test-period) — #454 A1 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CLOSED_TEXT, TEST_ENDS_AT_MS, isTestClosed } from "@core/test-period";
import { SID_KEY } from "@core/session-id";
import Closed from "../src/screens/Closed";

describe("isTestClosed (본 앱 규칙 그대로)", () => {
  it("10월 19일 오후 3시 전에는 열려 있다", () => {
    expect(isTestClosed(TEST_ENDS_AT_MS - 1, "")).toBe(false);
  });
  it("그 뒤에는 닫히고, ?team 을 붙이면 연다", () => {
    expect(isTestClosed(TEST_ENDS_AT_MS, "")).toBe(true);
    expect(isTestClosed(TEST_ENDS_AT_MS, "?team")).toBe(false);
  });
});

describe("Closed 화면", () => {
  it("본 앱과 같은 글을 보여 주고, 폰에 남은 세션 번호를 지운다", () => {
    window.localStorage.setItem(SID_KEY, JSON.stringify({ sid: "old", t: 0 }));
    render(<Closed />);
    expect(screen.getByRole("heading", { name: CLOSED_TEXT.title })).toBeTruthy();
    expect(screen.getByText(CLOSED_TEXT.body)).toBeTruthy();
    expect(screen.getByRole("link", { name: CLOSED_TEXT.survey })).toBeTruthy();
    expect(window.localStorage.getItem(SID_KEY)).toBeNull();
  });
});
