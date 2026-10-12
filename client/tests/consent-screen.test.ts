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
  it("C0 테스트 기간이 언제까지인지 · 지워 달라는 말을 어디에 하는지 · 사용 기록을 언제 지우는지 적는다 (2026-10-12 결정)", () => {
    const body = CONSENT_TEXT.body;
    expect(body).toContain("10월 19일 오후 3시까지");
    expect(body).toContain("후기 설문");
    expect(body).toContain("사용 기록도 10월 19일 오후 5시에 모두 지워요");
    // 사진도 받은 날부터 7일이 아니라 같은 때에 지운다 (2026-10-12 결정)
    expect(body).toContain("서버에 10월 19일 오후 5시까지 보관해요");
    expect(body).not.toContain("7일");
    expect(body).toContain("어느 링크로 들어왔는지");   // 유입 경로도 사용 기록에 든다 (#408)
  });
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

  // 2026-10-08 (#338 ③): 촬영 안내 화면이 여기로 옮겨오면서 소리를 열어 두던 호출이 같이 사라졌었다.
  // iOS 는 **사용자가 누르는 그 순간**에 열어 둬야 나중에 "삑" 이 난다. 눈 감은 장은 화면을 못 보니
  // 그 소리가 찍혔다는 유일한 신호다 — 다시 없어지면 폰에서만 드러나므로 여기서 지킨다
  it("C4 '동의하고 시작' 을 누르면 소리를 열어 둔다 (iOS) — '닫기' 로는 열지 않는다", () => {
    const made: { resumed: boolean }[] = [];
    class FakeAudioContext {
      resumed = false;
      constructor() { made.push(this); }
      resume(): Promise<void> { this.resumed = true; return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    try {
      const { root, ctx } = setup();
      consentScreen<null>({ setConsent: vi.fn(), onConsent: vi.fn() }).mount(ctx);
      root.querySelector<HTMLButtonElement>(".intro-camera-start")!.click();
      click(root, CONSENT_TEXT.deny);
      expect(made).toHaveLength(0);

      root.querySelector<HTMLButtonElement>(".intro-camera-start")!.click();
      click(root, CONSENT_TEXT.agree);
      expect(made).toHaveLength(1);
      expect(made[0]!.resumed).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
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
