// @vitest-environment jsdom
// 동의 · 이용 불가 화면 (F-01, 정의서 1-6)
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import type { Versions } from "@core/types";
import { CONSENT_TEXT, consentScreen, deniedScreen } from "@screens/consent";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = { app: "test", score: "s", look: "l", faceshape: "f", transfer: "t" };

function setup() {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const go = vi.fn();
  const ctx: ScreenContext<null> = { root, session: null, go, goPart: vi.fn(), log: createLogger({ sid: "s1", screen: "consent", part: null, ver }, m.sink) };
  return { root, ctx, go };
}
const click = (root: HTMLElement, text: string): void => {
  const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent === text);
  if (!b) throw new Error(`버튼 없음: ${text}`);
  b.click();
};

describe("동의 화면", () => {
  it("C1 동의하면 세션에 적고 consent(true) 를 찍고 촬영으로", () => {
    const { root, ctx, go } = setup();
    const setConsent = vi.fn(), onConsent = vi.fn();
    consentScreen<null>({ setConsent, onConsent }).mount(ctx);
    click(root, CONSENT_TEXT.agree);
    expect(setConsent).toHaveBeenCalledWith(true);
    expect(onConsent).toHaveBeenCalledWith(true);
    expect(go).toHaveBeenCalledWith("capture");
  });

  // 2026-10-06 새 흐름: 아래 버튼이 '거부' 가 아니라 '닫기' 다. 안내 시트만 닫고 아무것도 적지 않는다
  it("C2 '닫기' 는 안내 시트만 닫는다 — 동의도 거부도 적지 않고 화면도 안 옮긴다", () => {
    const { root, ctx, go } = setup();
    const setConsent = vi.fn(), onConsent = vi.fn();
    consentScreen<null>({ setConsent, onConsent }).mount(ctx);
    const sheet = root.querySelector<HTMLElement>(".consent-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>(".intro-camera-start")!.click();
    expect(sheet!.hidden).toBe(false);
    click(root, CONSENT_TEXT.deny);
    expect(sheet!.hidden).toBe(true);
    expect(setConsent).not.toHaveBeenCalled();
    expect(onConsent).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("C3 이용 불가 화면은 정의서 문구 그대로, 다시 동의 화면으로만 갈 수 있다", () => {
    const { root, ctx, go } = setup();
    deniedScreen<null>().mount(ctx);
    expect(root.textContent).toContain("서버 처리에 동의해야 사용할 수 있어요");
    expect(root.querySelectorAll("button")).toHaveLength(1);
    click(root, CONSENT_TEXT.back);
    expect(go).toHaveBeenCalledWith("consent");
  });
});
