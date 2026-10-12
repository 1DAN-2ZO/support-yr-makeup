// 폰의 뒤로 버튼 (#369) — 사이트를 나가지 않고 화면 안의 "뒤로" 와 같은 자리로 간다
import { describe, expect, it, vi } from "vitest";
import { backTarget } from "@core/screens";
import { armPhoneBack } from "@screens/phone-back";

describe("backTarget — 뒤로 가면 설 자리 (화면 안의 뒤로 버튼과 같다)", () => {
  it("PB1 부위 가이드는 한 부위 앞으로 · 첫 부위면 예상 메이크업으로", () => {
    expect(backTarget("partguide", "liner")).toEqual({ screen: "partguide", part: "brow" });
    expect(backTarget("partguide", "lip")).toEqual({ screen: "partguide", part: "shadow" });
    expect(backTarget("partguide", "brow")).toEqual({ screen: "answer" });
    expect(backTarget("partguide", null)).toEqual({ screen: "answer" });
  });

  it("PB2 실시간 가이드 → 부위 가이드 · 시도사진 → 부위 가이드 · 피드백 → 시도사진 · 저장 → 피드백", () => {
    expect(backTarget("live", "lip")).toEqual({ screen: "partguide" });
    expect(backTarget("attempt", "cheek")).toEqual({ screen: "partguide" });
    expect(backTarget("feedback", null)).toEqual({ screen: "attempt" });
    expect(backTarget("save", null)).toEqual({ screen: "feedback" });
  });

  it("PB3 앞 화면이 없는 곳은 null — 동의 · 촬영 · 예상 메이크업 · 끝 (화면에도 뒤로 버튼이 없다)", () => {
    for (const s of ["consent", "denied", "capture", "answer", "done"] as const) expect(backTarget(s, null)).toBeNull();
  });
});

describe("armPhoneBack", () => {
  function setup(where: { screen: Parameters<typeof backTarget>[0]; part: Parameters<typeof backTarget>[1] }) {
    let onPop: (() => void) | null = null;
    const history = { pushState: vi.fn(), back: vi.fn() };
    const go = vi.fn(), goPart = vi.fn(), log = vi.fn();
    const off = armPhoneBack({
      listen: (fn) => { onPop = fn; return () => { onPop = null; }; },
      history, where: () => where, go, goPart, log,
    });
    return { history, go, goPart, log, off, pop: () => onPop?.(), armed: () => onPop !== null };
  }

  it("PB4 켜면 기록 한 칸을 쌓아 둔다 — 그래야 뒤로를 눌러도 사이트를 나가지 않는다", () => {
    const k = setup({ screen: "partguide", part: "liner" });
    expect(k.history.pushState).toHaveBeenCalledTimes(1);
  });

  it("PB5 뒤로를 누르면 앞 화면으로 가고, 다음 뒤로를 위해 한 칸을 다시 쌓는다", () => {
    const k = setup({ screen: "feedback", part: null });
    k.pop();
    expect(k.go).toHaveBeenCalledWith("attempt");
    expect(k.history.pushState).toHaveBeenCalledTimes(2);
    expect(k.history.back).not.toHaveBeenCalled();
    expect(k.log).toHaveBeenCalledWith("back_phone:feedback");
  });

  it("PB6 부위 가이드에서는 부위를 한 칸 앞으로 (goPart)", () => {
    const k = setup({ screen: "partguide", part: "shadow" });
    k.pop();
    expect(k.goPart).toHaveBeenCalledWith("liner");
    expect(k.go).not.toHaveBeenCalled();
  });

  it("PB7 앞 화면이 없으면 막지 않는다 — 한 번 더 뒤로 보내 원래대로 나가게 한다", () => {
    const k = setup({ screen: "answer", part: null });
    k.pop();
    expect(k.go).not.toHaveBeenCalled();
    expect(k.history.back).toHaveBeenCalledTimes(1);
    expect(k.history.pushState).toHaveBeenCalledTimes(1);   // 다시 쌓지 않는다
  });

  it("PB8 끄면 더 듣지 않는다", () => {
    const k = setup({ screen: "save", part: null });
    k.off();
    expect(k.armed()).toBe(false);
  });
});
