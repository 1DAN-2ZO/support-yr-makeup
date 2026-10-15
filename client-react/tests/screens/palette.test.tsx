/**
 * 색조 팔레트 (screens/Palette) — 본 앱 `client/src/screens/color-palette.ts` 자리 (#454 D7).
 * 본 앱에는 이 화면만의 시험 파일이 없어, 지키는 약속을 여기서 처음 적는다:
 * 다섯 부위가 `PART_ORDER`(= 본 앱 LOOK_PART_IDS) 차례로 · 색 이름이 본문이고 부위 이름이 붙는다 · 「부위별로 보기」로 다음.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LOOK_PART_IDS } from "@core/types";
import Palette from "../../src/screens/Palette";
import { PART_NAME, PART_ORDER } from "../../src/parts";
import { blockNetwork, fakeColors, TEMPLATE } from "./helpers";

beforeEach(() => {
  blockNetwork();
});

describe("색조 팔레트", () => {
  it("부위 차례는 본 앱 가이드 부위(LOOK_PART_IDS)와 같다 — 쉐딩은 없다", () => {
    expect([...PART_ORDER]).toEqual([...LOOK_PART_IDS]);
    expect(PART_ORDER).not.toContain("contour");
  });

  it("다섯 줄이 부위 차례대로, 줄마다 색 이름(본문)과 부위 이름이 붙는다", () => {
    const colors = fakeColors();
    render(<Palette template={TEMPLATE} colors={colors} onNext={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`${TEMPLATE.name} 화장의 색`);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.querySelector("em")?.textContent)).toEqual(PART_ORDER.map((p) => PART_NAME[p]));
    expect(rows.map((r) => r.querySelector("strong")?.textContent)).toEqual(PART_ORDER.map((p) => colors[p].name.text));
    // 질감 그림은 줄의 color 로 칠한다 — 줄마다 그 부위의 색이 내려간다
    expect(rows.map((r) => (r as HTMLElement).style.color)).toEqual(PART_ORDER.map((p) => rgbText(colors[p].hex)));
  });

  it("「부위별로 보기」로 다음 — 아래 큰 버튼은 그것 하나다 (뒤로는 맨 위 화살표)", () => {
    const onNext = vi.fn();
    render(<Palette template={TEMPLATE} colors={fakeColors()} onNext={onNext} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "부위별로 보기" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

/** jsdom 은 style.color 를 `rgb(r, g, b)` 로 돌려준다 */
function rgbText(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
