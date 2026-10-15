/**
 * 후기 설문 기록 — 본 앱 done-survey.test SM1 · SM3 · DS3 와 같은 약속 (#454 발견 2, 2026-10-15).
 * 모달이 뜨면 `survey_shown`, 링크를 누르면 `survey_open`, 그 밖으로 닫으면 `survey_later`. 끝 화면 링크도 `survey_open`.
 * 몇 명이 설문으로 갔는지 집계하려면 이 이름이 본 앱과 같아야 한다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Survey from "../../src/screens/Survey";
import Done from "../../src/screens/Done";
import { ops } from "../../src/lib/ops";

type Logged = { name: string; button?: string };
/** 기록기에 찍힌 것 중 버튼 이름만 */
const buttons = (spy: { mock: { calls: unknown[][] } }): (string | undefined)[] =>
  spy.mock.calls.map((c) => c[0] as Logged).filter((e) => e.name === "button").map((e) => e.button);

describe("설문 기록", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 }))));

  it("모달: 뜨면 survey_shown, 링크를 누르면 survey_open", () => {
    const spy = vi.spyOn(ops().log, "log");
    render(<Survey url="https://example.test/form" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("link", { name: "후기 남기기" }));
    expect(buttons(spy)).toEqual(["survey_shown", "survey_open"]);
  });

  it("모달: '다음에 할게요' · 뒷배경 · Esc 는 survey_later", () => {
    const spy = vi.spyOn(ops().log, "log");
    const { container } = render(<Survey url="https://example.test/form" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "다음에 할게요" }));
    const back = container.querySelector(".done-modal-back")!;
    fireEvent.click(back);
    fireEvent.keyDown(back, { key: "Escape" });
    expect(buttons(spy).filter((b) => b === "survey_later")).toHaveLength(3);
  });

  it("끝 화면: 설문 링크를 누르면 survey_open", () => {
    const spy = vi.spyOn(ops().log, "log");
    render(<Done onRestart={() => {}} />);
    fireEvent.click(screen.getByRole("link", { name: "후기 남기기 (1분)" }));
    expect(buttons(spy)).toContain("survey_open");
  });
});
