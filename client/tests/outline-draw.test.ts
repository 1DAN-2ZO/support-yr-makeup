// 화면 3·4 테두리 그리기 — 테두리는 점선, 퍼지는 방향 표시는 실선 화살표(머리 포함) + 채운 작은 점 (2026-10-05)
import { describe, expect, it } from "vitest";
import { GUIDE_COLOR, partColor, strokeMarks, strokeOutline } from "@screens/outline-draw";

/** 그리기 호출을 차례대로 적는 가짜 캔버스 */
function recorder(): { g: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const state: Record<string, unknown> = {};
  const g = new Proxy(state, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...a: unknown[]) => { calls.push(`${k}(${a.map((v) => (Array.isArray(v) ? `[${v.join(",")}]` : String(v))).join(",")})`); };
    },
    set(t, k: string, v) { t[k] = v; calls.push(`${k}=${String(v)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { g, calls };
}

describe("strokeOutline", () => {
  it("D1 표시가 없으면 전과 같다 — 점선 테두리만, 채우기 없음", () => {
    const { g, calls } = recorder();
    strokeOutline(g, { polys: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]], lines: [] }, 2);
    expect(calls).toContain("setLineDash([6,4])");
    expect(calls.filter((c) => c.startsWith("fill(") || c.startsWith("arc("))).toEqual([]);
  });

  it("D2 화살표는 실선 + 끝에 머리 두 갈래, 점은 작은 원을 채운다", () => {
    const { g, calls } = recorder();
    strokeOutline(g, { polys: [], lines: [], dots: [{ x: 5, y: 5 }], arrows: [[{ x: 0, y: 0 }, { x: 20, y: 0 }]] }, 2);
    const solid = calls.indexOf("setLineDash([])");
    expect(solid).toBeGreaterThanOrEqual(0);
    // 실선으로 바꾼 뒤: 몸통(0,0 → 20,0) + 머리 두 갈래는 끝점(20,0)에서 뒤쪽(x < 20)으로
    const after = calls.slice(solid);
    expect(after).toContain("moveTo(0,0)");
    expect(after).toContain("lineTo(20,0)");
    const heads = after.filter((c) => /^lineTo\(/.test(c) && c !== "lineTo(20,0)").map((c) => Number(c.slice(7, -1).split(",")[0]));
    expect(heads.length).toBeGreaterThanOrEqual(2);
    for (const x of heads) expect(x).toBeLessThan(20);
    expect(calls.some((c) => c.startsWith("arc(5,5,"))).toBe(true);
    expect(calls).toContain("fill()");
  });

  it("D3 strokeMarks — 퍼지는 방향(실선 화살표 + 머리 · 채운 점)을 받은 색으로 그린다 (부위 가이드 블러셔, 2026-10-09)", () => {
    const { g, calls } = recorder();
    strokeMarks(g, { dots: [{ x: 5, y: 5 }], arrows: [[{ x: 0, y: 0 }, { x: 20, y: 0 }]] }, 2, "#ff69b4");
    expect(calls).toContain("strokeStyle=#ff69b4");
    expect(calls).toContain("fillStyle=#ff69b4");
    expect(calls).toContain("setLineDash([])");
    expect(calls).toContain("lineTo(20,0)");
    expect(calls.filter((c) => /^lineTo\(/.test(c) && c !== "lineTo(20,0)").length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.startsWith("arc(5,5,"))).toBe(true);
  });
});

describe("부위 색 — 실시간 가이드도 사진 가이드와 같은 색 (#413: 실시간 테두리만 한 색(청록))", () => {
  it("D4 strokeOutline 에 색을 주면 테두리 · 표시를 그 색으로, 안 주면 전처럼 청록", () => {
    const o = { polys: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]], lines: [], dots: [{ x: 5, y: 5 }] };
    const a = recorder(), b = recorder();
    strokeOutline(a.g, o, 2, partColor("lip"));
    strokeOutline(b.g, o, 2);
    expect(a.calls.filter((c) => c.startsWith("strokeStyle=") || c.startsWith("fillStyle="))).toEqual([`strokeStyle=${partColor("lip")}`, `strokeStyle=${partColor("lip")}`, `fillStyle=${partColor("lip")}`]);
    expect(b.calls).toContain(`strokeStyle=${GUIDE_COLOR}`);
  });

  it("D5 부위마다 다른 색 · 모르는 부위(쉐딩 등)는 청록", () => {
    const parts = ["brow", "liner", "shadow", "lip", "cheek"] as const;
    expect(new Set(parts.map(partColor)).size).toBe(parts.length);
    expect(partColor("contour")).toBe(GUIDE_COLOR);
  });
});
