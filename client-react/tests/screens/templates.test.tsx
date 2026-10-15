/**
 * 화장 템플릿 고르기 (screens/Templates) — 본 앱 `client/tests/templates-slot.test.ts` TP1~TP7 을 옮긴 것 (#454 D7).
 *
 * 지키는 것: 템플릿 10종이 목록 차례대로 · 고르면 그 카드만 켜진다(aria-pressed) · 카드를 눌렀다고 바로 넘어가지 않는다 ·
 * 조사(을/를)를 받침에 맞춘다 · 「적용하기」는 고른 뒤에만 눌리고 고른 템플릿을 onPick 으로 넘긴다.
 * TP8(template-store) · TP9(뒤로)는 이 버전에 그 부품이 없다 — 뒤로는 App 의 화살표라 app-flow 시험에서 본다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TEMPLATES } from "@core/templates";
import Templates from "../../src/screens/Templates";
import { blockNetwork } from "./helpers";

beforeEach(() => {
  blockNetwork();
});

/** 카드 버튼들 — 화면 차례대로. 카드는 전부 aria-pressed 가 있는 버튼이다 */
const cards = (): HTMLButtonElement[] =>
  (screen.getAllByRole("button") as HTMLButtonElement[]).filter((b) => b.classList.contains("tpl-card"));
const apply = (): HTMLButtonElement => screen.getByRole("button", { name: "적용하기" }) as HTMLButtonElement;

describe("화장 템플릿 고르기", () => {
  // templates-slot.test.ts TP1 · TP2
  it("템플릿 10종이 목록 차례대로, 카드마다 썸네일이 붙는다", () => {
    expect(TEMPLATES).toHaveLength(10);
    render(<Templates onPick={() => {}} />);
    const c = cards();
    expect(c.map((x) => x.querySelector("strong")?.textContent)).toEqual(TEMPLATES.map((t) => t.name));
    expect(c.map((x) => x.querySelector("img")?.getAttribute("src"))).toEqual(TEMPLATES.map((t) => t.thumb));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("화장 템플릿");
    expect(screen.getByText("사진을 올리지 않아도 여기서 고를 수 있어요")).toBeTruthy();
  });

  // templates-slot.test.ts TP3
  it("고르면 그 카드만 켜진다 — 색만이 아니라 aria-pressed 로도", () => {
    render(<Templates onPick={() => {}} />);
    fireEvent.click(cards()[2]!);
    let c = cards();
    expect(c.filter((x) => x.classList.contains("is-on"))).toHaveLength(1);
    expect(c[2]!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(c[5]!);
    c = cards();
    expect(c[2]!.getAttribute("aria-pressed")).toBe("false");
    expect(c[5]!.getAttribute("aria-pressed")).toBe("true");
  });

  // templates-slot.test.ts TP4 · TP6
  it("카드를 눌렀다고 바로 넘어가지 않는다 — 안내 한 줄이 뜨고 「적용하기」가 그때 켜진다", () => {
    const onPick = vi.fn();
    render(<Templates onPick={onPick} />);
    expect(apply().disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(cards()[0]!);
    expect(screen.getByRole("status").textContent).toContain("적용하기를 누르면");
    expect(onPick).not.toHaveBeenCalled();
    expect(apply().disabled).toBe(false);
  });

  // templates-slot.test.ts TP5
  it("이름의 조사를 받침에 맞춘다 — '을(를)' 을 그대로 읽히지 않게", () => {
    render(<Templates onPick={() => {}} />);
    const pick = (name: string): string => {
      fireEvent.click(cards()[TEMPLATES.findIndex((t) => t.name === name)]!);
      return screen.getByRole("status").textContent ?? "";
    };
    expect(pick("가을")).toContain("가을을 골랐어요");
    expect(pick("누드")).toContain("누드를 골랐어요");
  });

  // templates-slot.test.ts TP7 — 이 버전은 저장소 대신 onPick 으로 곧장 넘긴다
  it("「적용하기」를 누르면 고른 템플릿을 onPick 으로 넘긴다", () => {
    const onPick = vi.fn();
    render(<Templates onPick={onPick} />);
    fireEvent.click(cards()[2]!);
    fireEvent.click(apply());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(TEMPLATES[2]);
  });
});
