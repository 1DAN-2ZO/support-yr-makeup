/**
 * 동의 화면 (screens/Intro + screens/Consent) — 본 앱 `client/tests/consent-screen.test.ts` 를 옮긴 것 (#454 D7).
 *
 * 지키는 것: 동의문 네 묶음이 본 앱 `CONSENT_SECTIONS` 와 같은지, 「촬영 시작」→ 시트 → 「동의하고 시작」/「닫기」 동작,
 * 「동의하고 시작」에서만 셔터 소리를 열어 두는지(iOS), 거절 화면(`Denied`)의 글과 버튼.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CONSENT_SECTIONS, CONSENT_TEXT } from "@screens/consent";
import Intro from "../../src/screens/Intro";
import { Denied } from "../../src/screens/Consent";
import { blockNetwork } from "./helpers";

beforeEach(() => {
  blockNetwork();
});

/** 바탕의 「촬영 시작」을 눌러 시트를 연다 */
function openSheet(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: CONSENT_TEXT.start }));
  return screen.getByRole("dialog", { name: CONSENT_TEXT.title });
}

describe("동의 화면 바탕 (Intro)", () => {
  // consent-screen.test.ts C2 앞부분 — 시트는 「촬영 시작」을 누르기 전에는 없다
  it("확인할 것 셋(앞머리·안경·밝기)과 말풍선 제목·「촬영 시작」이 본 앱 글 그대로이고, 시트는 아직 없다", () => {
    render(<Intro onAgree={() => {}} />);
    expect(screen.getByRole("heading", { level: 1, name: CONSENT_TEXT.coachMessage })).toBeTruthy();
    for (const c of CONSENT_TEXT.checks) expect(screen.getByText(c)).toBeTruthy();
    expect(screen.getByRole("button", { name: CONSENT_TEXT.start })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // 쉐딩 딱지도 본 앱과 같이 사진 장식으로 있다
    expect(screen.getByText("쉐딩")).toBeTruthy();
  });

  it("「촬영 시작」을 누르면 처리 안내 시트가 뜨고, 그동안 바탕은 inert 로 막힌다", () => {
    const { container } = render(<Intro onAgree={() => {}} />);
    const back = container.querySelector(".intro-camera")!;
    expect(back.hasAttribute("inert")).toBe(false);
    openSheet();
    expect(back.hasAttribute("inert")).toBe(true);
  });
});

describe("처리 안내 시트 (Consent)", () => {
  // consent-screen.test.ts C0b — 소제목 넷과 굵은 조각. 글은 본 앱 CONSENT_SECTIONS 가 기준이다
  it("소제목 넷이 본 앱 CONSENT_SECTIONS 와 같은 차례로 뜨고, 핵심을 굵게 보여 준다", () => {
    render(<Intro onAgree={() => {}} />);
    const sheet = openSheet();
    const heads = within(sheet).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(CONSENT_SECTIONS.map((s) => s.head));
    const strong = [...sheet.querySelectorAll("strong")].map((s) => s.textContent);
    for (const key of ["서버에 10월 19일 오후 5시까지 보관해요.", "10월 19일 오후 5시에 모두 지우고", "끝낼 때 나오는 후기 설문에 적어 주세요.", "참고 사진은 보관하지 않고", "사진과 얼굴 위치는 보내지 않아요."]) expect(strong).toContain(key);
    // 굵게 표시(**)가 화면에 새지 않는다
    expect(sheet.textContent).not.toContain("**");
  });

  it("「서버로 보내는 사진」·「테스트 기간 보관」·「사용 기록」 세 묶음의 글은 본 앱과 글자까지 같다", () => {
    render(<Intro onAgree={() => {}} />);
    const sheet = openSheet();
    const paras = [...sheet.querySelectorAll(".consent-body p")].map((p) => p.textContent);
    const plain = (t: string): string => t.replaceAll("**", "");
    expect(paras[0]).toBe(plain(CONSENT_SECTIONS[0].text));
    expect(paras[1]).toBe(plain(CONSENT_SECTIONS[1].text));
    expect(paras[3]).toBe(plain(CONSENT_SECTIONS[3].text));
  });

  // 본 앱은 폰(IndexedDB)에 사진을 두었다가 2시간 뒤 지우지만, 이 버전은 폰에 저장하지 않는다 (Consent.tsx 머리글).
  // 그래서 셋째 묶음만 일부러 다르다 — 본 앱이 글을 바꾸거나 이 버전이 폰 저장을 들이면 이 시험부터 고친다
  it("「폰에 남는 것」만 이 버전 사정에 맞춰 다르다 — '끝내기를 누르면 바로' 는 같고, '2시간' 대신 '창을 닫는 순간' 이다", () => {
    render(<Intro onAgree={() => {}} />);
    const sheet = openSheet();
    const phone = [...sheet.querySelectorAll(".consent-body p")][2]!.textContent!;
    expect(phone).toContain("끝내기를 누르면 바로 지워져요");
    expect(phone).toContain("창을 닫는 순간 사라져요");
    expect(phone).not.toContain("2시간");
    expect(CONSENT_SECTIONS[2].text).toContain("2시간");
  });

  // consent-screen.test.ts C0 — 날짜 · 설문 · 사용 기록 삭제 시점이 적혀 있다
  it("테스트 기간 · 지워 달라는 말을 어디에 하는지 · 사용 기록을 언제 지우는지 적는다", () => {
    render(<Intro onAgree={() => {}} />);
    const body = openSheet().querySelector(".consent-body")!.textContent!;
    expect(body).toContain("10월 19일 오후 3시까지");
    expect(body).toContain("후기 설문");
    expect(body).toContain("사용 기록도 10월 19일 오후 5시에 모두 지워요");
    expect(body).toContain("서버에 10월 19일 오후 5시까지 보관해요");
    expect(body).not.toContain("7일");
    expect(body).toContain("어느 링크로 들어왔는지");
  });

  // consent-screen.test.ts C1 — 동의하면 위로 올린다
  it("「동의하고 시작」을 누르면 onAgree", () => {
    const onAgree = vi.fn();
    render(<Intro onAgree={onAgree} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: CONSENT_TEXT.agree }));
    expect(onAgree).toHaveBeenCalledTimes(1);
  });

  // consent-screen.test.ts C2 — 「닫기」는 시트만 닫는다. 동의도 거절도 아니다
  it("「닫기」는 시트만 닫는다 — onAgree 는 안 부르고, 바탕으로 돌아와 다시 열 수 있다", () => {
    const onAgree = vi.fn();
    render(<Intro onAgree={onAgree} />);
    const sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: CONSENT_TEXT.deny }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAgree).not.toHaveBeenCalled();
    // 닫은 뒤 포커스는 열었던 버튼으로 돌아온다
    expect(document.activeElement).toBe(screen.getByRole("button", { name: CONSENT_TEXT.start }));
    openSheet();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("뒷배경 · Esc 도 그냥 닫는 쪽이다 (restart-modal 규칙)", () => {
    const onAgree = vi.fn();
    const { container } = render(<Intro onAgree={onAgree} />);
    openSheet();
    fireEvent.click(container.querySelector(".consent-sheet-back")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    openSheet();
    fireEvent.keyDown(container.querySelector(".consent-sheet-back")!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAgree).not.toHaveBeenCalled();
  });

  it("뜨면 포커스는 버튼이 아니라 창 자체에 있다 — 엔터 한 번에 동의가 눌리지 않게", () => {
    render(<Intro onAgree={() => {}} />);
    const sheet = openSheet();
    expect(document.activeElement).toBe(sheet);
  });

  // consent-screen.test.ts C4 — iOS 는 사용자가 누르는 그 순간에 소리를 열어 둬야 나중에 셔터 소리가 난다.
  // lib/shutter-cue 는 모듈 하나에 AudioContext 를 한 번만 만드니 「닫기」→「동의」 차례를 한 시험 안에서 본다
  it("「동의하고 시작」을 누르면 소리를 열어 둔다 — 「닫기」로는 열지 않는다", () => {
    const made: { resumed: boolean }[] = [];
    class FakeAudioContext {
      resumed = false;
      constructor() { made.push(this); }
      resume(): Promise<void> { this.resumed = true; return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<Intro onAgree={() => {}} />);
    let sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: CONSENT_TEXT.deny }));
    expect(made).toHaveLength(0);
    sheet = openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: CONSENT_TEXT.agree }));
    expect(made).toHaveLength(1);
    expect(made[0]!.resumed).toBe(true);
  });
});

describe("이용 불가 화면 (Denied)", () => {
  // consent-screen.test.ts C3 — 정의서 문구 그대로, 돌아가는 버튼 하나뿐
  it("본 앱 문구 그대로이고, 「다시 생각해 볼게요」 하나로만 돌아간다", () => {
    const onBack = vi.fn();
    render(<Denied onBack={onBack} />);
    expect(screen.getByRole("heading", { name: CONSENT_TEXT.denied })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: CONSENT_TEXT.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
