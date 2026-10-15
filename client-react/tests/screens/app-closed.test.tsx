/**
 * App — 테스트 기간이 끝났으면 닫힌 화면만 (src/App.tsx `CLOSED` → screens/Closed) — 본 앱 `main.ts` `boot()` 의 맨 앞 확인 (#454 A1 · D7).
 * `isTestClosed` 는 모듈을 읽을 때 한 번 재므로(App.tsx 의 `const CLOSED`) 여기서는 그 함수를 "닫힘" 으로 바꿔 두고 App 을 읽는다.
 * 지키는 것: 닫혔으면 흐름(스플래시 · 동의)을 아예 그리지 않고, 운영 연결도 건드리지 않는다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CLOSED_TEXT } from "@core/test-period";
import App from "../../src/App";
import { blockNetwork } from "./helpers";

vi.mock("@core/test-period", async (orig) => ({
  ...(await orig<typeof import("@core/test-period")>()),
  isTestClosed: () => true,
}));
const enter = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/ops", () => ({ ops: () => ({ enter }) }));

beforeEach(() => {
  blockNetwork();
});

describe("App — 마감", () => {
  it("닫혔으면 닫힌 화면만 그린다 — 스플래시도 동의도 없고 화면 기록도 안 찍는다", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: CLOSED_TEXT.title })).toBeTruthy();
    expect(screen.getByRole("link", { name: CLOSED_TEXT.survey })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(enter).not.toHaveBeenCalled();
  });
});
