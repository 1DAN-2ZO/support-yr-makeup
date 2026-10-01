// 화장 10종 새 효과를 앱 그리기에 (#250 1단계) — 섀도우 두 색 · 눈꼬리 연장 · 입술 가운데 → 가장자리.
// ④ 실험 화면(makeup-probe.ts)과 같은 방법으로 그린다. 새 칸이 없는 화장은 전과 똑같이
import { describe, expect, it } from "vitest";
import { lookById, type Look } from "@core/looks";
import { paintLookOf, paintMakeup, type Layers } from "@screens/makeup-paint";
import { LMS } from "./helpers/synth-face";

type Call = { op: string; args: unknown[] };

/** 부른 것만 적는 가짜 2D 컨텍스트 — 그라데이션은 색 멈춤을 모은다 */
function fakeCtx(calls: Call[]) {
  const grad = (kind: string) => (...args: unknown[]) => {
    const g = { kind, args, stops: [] as [number, string][], addColorStop: (at: number, c: string) => { g.stops.push([at, c]); } };
    calls.push({ op: kind, args: [g] });
    return g;
  };
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  // filter 가 문자열 = 번짐 기능이 있는 브라우저 (없는 쪽은 makeup-paint-nofilter.test.ts)
  return new Proxy({ filter: "none" } as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "createLinearGradient") return grad("linear");
      if (k === "createRadialGradient") return grad("radial");
      return rec(k);
    },
    set(t, k: string, v) { t[k] = v; if (k === "fillStyle" || k === "filter") calls.push({ op: k, args: [v] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function paintAll(look: Look): { calls: Call[]; light: Call[]; mul: Call[] } {
  const calls: Call[] = [], light: Call[] = [], mul: Call[] = [];
  const off = { width: 600, height: 600, getContext: () => fakeCtx(calls) } as unknown as HTMLCanvasElement;
  const layers: Layers = { mul: fakeCtx(mul), col: fakeCtx([]), light: fakeCtx(light) };
  paintMakeup(layers, off, LMS, paintLookOf(look), null, "winged");
  return { calls, light, mul };
}
const paintCalls = (look: Look): Call[] => paintAll(look).calls;

type Grad = { kind: string; stops: [number, string][] };
const grads = (calls: Call[], kind: string): Grad[] => calls.filter((c) => c.op === kind).map((c) => c.args[0] as Grad);
/** 섀도우 그라데이션 = 선형 그라데이션 중 볼(방사형)이 아닌 것 */
const shadowGrads = (calls: Call[]) => grads(calls, "linear");

/** 옛 화장처럼 새 칸이 하나도 없는 화장 */
function plain(look: Look): Look {
  const { stops: _s, tailExtend: _t, finish: _f, axis: _a, ...shadow } = look.parts.shadow!;
  const { edge: _e, ...lip } = look.parts.lip!;
  const { extras: _x, ...rest } = look;
  return { ...rest, parts: { ...look.parts, shadow, lip } };
}

describe("화장 새 효과 — 앱 그리기 (#250 1단계)", () => {
  it("F1 paintLookOf 가 섀도우 두 색·눈꼬리 연장·입술 가장자리 색을 넘긴다 · 없으면 비운다", () => {
    const chic = paintLookOf(lookById("chic"));
    expect(chic.shadowStops).toEqual([{ at: 0, color: "#5c4033" }, { at: 1, color: "#b0897a" }]);
    expect(chic.shadowTail).toBe(true);
    expect(chic.lipEdge).toBe("#a85d62");
    const p = paintLookOf(plain(lookById("chic")));
    expect(p.shadowStops).toBeUndefined();
    expect(p.shadowTail).toBe(false);
    expect(p.lipEdge).toBeUndefined();
  });

  it("F2 섀도우 두 색: 속눈썹 쪽(0)은 첫 색, 눈썹 쪽(1)은 둘째 색 — 두 눈 모두", () => {
    const g = shadowGrads(paintCalls(lookById("chic")));
    expect(g).toHaveLength(2);
    for (const x of g) expect(x.stops).toEqual([[0, "#5c4033"], [1, "#b0897a"]]);
  });

  it("F3 두 색이 없으면 전처럼 한 색이 위로 옅어진다", () => {
    const g = shadowGrads(paintCalls(plain(lookById("chic"))));
    expect(g).toHaveLength(2);
    expect(g[0]!.stops.map(([at]) => at)).toEqual([0, 0.55, 1]);
    expect(g[0]!.stops[2]![1]).toMatch(/,0\)$/);
  });

  it("F4 입술 가장자리 색이 있으면 가운데 → 가장자리 방사형 · 없으면 한 색", () => {
    const withEdge = grads(paintCalls(lookById("chic")), "radial").filter((x) => x.stops.some(([, c]) => c === "#a85d62"));
    expect(withEdge).toHaveLength(1);
    expect(withEdge[0]!.stops).toEqual([[0.2, "#8b3a3a"], [1, "#a85d62"]]);
    const none = grads(paintCalls(plain(lookById("chic"))), "radial").filter((x) => x.stops.some(([, c]) => c.startsWith("#8b3a3a")));
    expect(none).toHaveLength(0);
  });

  it("F5 눈꼬리 연장이 있으면 섀도우 띠가 눈꼬리 쪽으로 두 점 더 뻗는다", () => {
    const lines = (look: Look) => paintCalls(look).filter((c) => c.op === "lineTo").length;
    const withTail = { ...lookById("chic") }, noTail = { ...withTail, parts: { ...withTail.parts, shadow: { ...withTail.parts.shadow!, tailExtend: false } } };
    expect(lines(withTail) - lines(noTail)).toBe(4);   // 두 눈 × 두 점
  });

  it("F6 새 칸이 없는 화장은 그리는 순서·호출이 전과 같다 (출근/학생의 입술 등)", () => {
    const daily = lookById("daily");
    expect(daily.parts.lip!.edge).toBeUndefined();
    const { extras: _x, ...noExtras } = daily;
    const a = paintCalls(plain(daily)).map((c) => c.op), b = paintCalls({ ...noExtras, parts: { ...daily.parts, shadow: plain(daily).parts.shadow! } }).map((c) => c.op);
    expect(b).toEqual(a);
  });
});

describe("화장 새 효과 — 글리터 · 애교살 (#250 2단계)", () => {
  const drawsOnLight = (look: Look) => paintAll(look).light.filter((c) => c.op === "drawImage").length;
  const count = (calls: Call[], op: string) => calls.filter((c) => c.op === op).length;

  it("G1 paintLookOf 가 애교살 색·진하기와 글리터 여부를 넘긴다", () => {
    const k = paintLookOf(lookById("kitsch"));
    expect(k.color.aegyo).toBe("#ffd1dc");
    expect(k.alpha.aegyo).toBeCloseTo(0.55);
    expect(k.glitter).toEqual({ shadow: true, aegyo: true });
    const d = paintLookOf(lookById("daily"));
    expect(d.color.aegyo).toBe("#f5f5dc");
    expect(d.glitter).toEqual({ shadow: false, aegyo: false });
    expect(paintLookOf(plain(lookById("daily"))).color.aegyo).toBeUndefined();
  });

  it("G2 애교살은 밝히기 층에 — 하이라이트와 함께 두 장 · 애교살이 없는 화장은 하이라이트 한 장(전과 같음)", () => {
    expect(drawsOnLight(lookById("daily"))).toBe(2);
    expect(drawsOnLight(plain(lookById("daily")))).toBe(1);
  });

  it("G3 글리터 화장은 섀도우 띠(두 눈)·애교살 안에만 점을 흩뿌린다 — 번짐 없이", () => {
    const { calls } = paintAll(lookById("kitsch"));
    expect(count(calls, "clip")).toBe(3);   // 섀도우 두 눈 + 애교살
    expect(count(calls, "arc")).toBeGreaterThan(100);
    // 점을 찍기 직전에 번짐을 끈다 — 번지면 점이 아니라 흐린 얼룩이 된다
    const clipAt = calls.findIndex((c) => c.op === "clip");
    expect(calls.slice(0, clipAt).reverse().find((c) => c.op === "filter")?.args[0]).toBe("none");
  });

  it("G4 글리터가 아닌 화장은 점을 안 찍는다", () => {
    const { calls } = paintAll(lookById("daily"));
    expect(count(calls, "clip")).toBe(0);
  });

  it("G5 점 자리는 매번 같다 — AR 에서 반짝이며 흔들리지 않게 (고정 시드)", () => {
    const arcs = () => paintAll(lookById("idol")).calls.filter((c) => c.op === "arc").map((c) => c.args.slice(0, 3));
    expect(arcs().length).toBeGreaterThan(100);
    expect(arcs()).toEqual(arcs());
  });
});
