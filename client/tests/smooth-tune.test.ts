// @vitest-environment jsdom
// [개발용 ?tune] 떨림 필터 슬라이더 — 2-b AR 과 화면 4 가 같이 쓴다 (#235 · #244)
import { describe, expect, it, vi } from "vitest";
import { LIVE_SMOOTH, SMOOTH } from "@core/smooth-params";
import { smoothTuner } from "@screens/smooth-tune";

describe("smoothTuner", () => {
  it("T1 슬라이더 세 개가 SMOOTH 값에서 시작하고, 움직이면 그 값으로 필터를 바꾼다", () => {
    const sm = { setParams: vi.fn() };
    const box = smoothTuner(sm);
    const rs = Array.from(box.querySelectorAll<HTMLInputElement>("input[type=range]"));
    expect(rs.map((r) => Number(r.value))).toEqual([SMOOTH.minCutoff, SMOOTH.beta, SMOOTH.dCutoff]);
    rs[1]!.value = "0.5";
    rs[1]!.dispatchEvent(new Event("input"));
    expect(sm.setParams).toHaveBeenLastCalledWith(SMOOTH.minCutoff, 0.5, SMOOTH.dCutoff);
    expect(box.textContent).toContain("반응성 0.50");
  });

  it("T2 화면마다 시작 값을 받는다 — 화면 4 는 LIVE_SMOOTH. 최대값에서 더 올려 볼 수 있게 범위를 넉넉히", () => {
    const sm = { setParams: vi.fn() };
    const rs = Array.from(smoothTuner(sm, LIVE_SMOOTH).querySelectorAll<HTMLInputElement>("input[type=range]"));
    expect(rs.map((r) => Number(r.value))).toEqual([LIVE_SMOOTH.minCutoff, LIVE_SMOOTH.beta, LIVE_SMOOTH.dCutoff]);
    rs.forEach((r, i) => expect(Number(r.max), r.parentElement?.textContent ?? "").toBeGreaterThan([LIVE_SMOOTH.minCutoff, LIVE_SMOOTH.beta, LIVE_SMOOTH.dCutoff][i]!));
  });
});
