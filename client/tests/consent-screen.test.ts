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

  it("C2 거부하면 이용 불가로 — 촬영으로 가지 않는다", () => {
    const { root, ctx, go } = setup();
    const setConsent = vi.fn(), onConsent = vi.fn();
    consentScreen<null>({ setConsent, onConsent }).mount(ctx);
    click(root, CONSENT_TEXT.deny);
    expect(setConsent).toHaveBeenCalledWith(false);
    expect(onConsent).toHaveBeenCalledWith(false);
    expect(go).toHaveBeenCalledWith("denied");
    expect(go).not.toHaveBeenCalledWith("capture");
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
