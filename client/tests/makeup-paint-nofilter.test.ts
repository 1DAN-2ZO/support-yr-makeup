// 캔버스 번짐(ctx.filter)이 없는 브라우저 — 일부 WebKit(Safari, ④ #263 실기기 확인: getContext("2d").filter 가 undefined).
// `o.filter = "blur(…)"` 가 조용히 무시돼 화장이 번짐 없이 딱딱한 도형으로 나왔다 (2-b AR · 화면 3 완성본).
// 기능을 한 번 감지해서, 없으면 작게 줄였다 다시 키워 번지게 한다. 글리터 점은 번짐 뒤에 찍는다 (점이 흐려지지 않게)
import { afterEach, describe, expect, it } from "vitest";
import { lookById, type Look } from "@core/looks";
import { paintEnv, paintLookOf, paintMakeup, softenLevels, type Layers } from "@screens/makeup-paint";
import { LMS } from "./helpers/synth-face";

type Call = { op: string; args: unknown[] };

/** 부른 것만 적는 가짜 2D 컨텍스트. withFilter = 번짐 기능이 있는 브라우저 */
function fakeCtx(calls: Call[], withFilter: boolean): CanvasRenderingContext2D {
  const grad = () => ({ addColorStop: () => {} });
  const target: Record<string, unknown> = withFilter ? { filter: "none" } : {};
  return new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "filter") return undefined;   // 기능이 없는 브라우저 — 속성 자체가 없다
      if (k === "createLinearGradient" || k === "createRadialGradient") return grad;
      return (...args: unknown[]) => { calls.push({ op: k, args }); };
    },
    set(t, k: string, v) { t[k] = v; if (k === "filter") calls.push({ op: "filter", args: [v] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

const realEnv = { ...paintEnv };
afterEach(() => { Object.assign(paintEnv, realEnv); });

function paint(look: Look, withFilter: boolean) {
  const calls: Call[] = [], tmpCalls: Call[] = [], made: { width: number; height: number }[] = [];
  const off = { width: 600, height: 600, getContext: () => fakeCtx(calls, withFilter) } as unknown as HTMLCanvasElement;
  paintEnv.makeCanvas = () => {
    const c = { width: 0, height: 0, getContext: () => fakeCtx(tmpCalls, withFilter) };
    made.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  const layers: Layers = { mul: fakeCtx([], withFilter), col: fakeCtx([], withFilter), light: fakeCtx([], withFilter) };
  paintMakeup(layers, off, LMS, paintLookOf(look), null, "winged");
  return { calls, tmpCalls, made, off };
}
/** 작업 캔버스에 '다른 캔버스를 통째로' 다시 그린 것 — 줄였다 키운 결과를 되돌려 놓는 호출 */
const resized = (calls: Call[]) => calls.filter((c) => c.op === "drawImage" && c.args.length === 5);

describe("번짐 기능이 없는 브라우저 (Safari)", () => {
  it("N1 부위마다 줄였다 다시 키워 번지게 한다 — 작업 캔버스에 되돌려 놓는 건 부위마다 한 번", () => {
    const { calls, tmpCalls, made, off } = paint(lookById("chic"), false);
    expect(resized(calls).length).toBeGreaterThanOrEqual(7);   // 쉐딩·하이라이트·볼·애교살·눈썹·섀도우·라이너·입술
    const steps = tmpCalls.filter((c) => c.op === "drawImage");
    expect(steps.length).toBeGreaterThanOrEqual(resized(calls).length);
    for (const c of steps) expect(c.args[3] as number).toBeLessThan(off.width);
    expect(made.length).toBeLessThanOrEqual(6);   // 임시 캔버스는 단계 수만큼만 만들고 부위마다 다시 쓴다
  });

  it("N2 절반씩 줄인다 — 한 번에 크게 줄이면 볼·쉐딩이 계단 모양으로 나온다 (캡처로 확인)", () => {
    const { tmpCalls, off } = paint(lookById("chic"), false);
    const widths = [...new Set(tmpCalls.filter((c) => c.op === "drawImage").map((c) => c.args[3] as number))].sort((a, b) => b - a);
    expect(widths[0]).toBe(off.width / 2);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBe(Math.round(off.width / 2 ** (i + 1)));
    expect(widths.length).toBeGreaterThanOrEqual(3);   // 볼·쉐딩은 여러 단계
  });

  it("N2b 번짐이 클수록 단계가 많다 — 라이너(거의 안 번짐) 1단계, 볼(크게) 여러 단계", () => {
    expect(softenLevels(0.5)).toBe(1);
    expect(softenLevels(2)).toBe(2);
    expect(softenLevels(8)).toBe(4);
    expect(softenLevels(500)).toBe(6);   // 상한
  });

  it("N3 글리터 점은 번짐 뒤에 찍는다 — 점이 흐려지지 않게", () => {
    const { calls } = paint(lookById("kitsch"), false);
    const firstArcAfterClip = calls.findIndex((c, i) => c.op === "arc" && calls.slice(0, i).some((p) => p.op === "clip"));
    const clipAt = calls.findIndex((c) => c.op === "clip");
    const lastResizeBeforeClip = calls.slice(0, clipAt).map((c, i) => (c.op === "drawImage" && c.args.length === 5 ? i : -1)).filter((i) => i >= 0).pop();
    expect(lastResizeBeforeClip).toBeDefined();
    // 줄였다 키운 뒤(번짐 끝) → 클립 → 점. 그 사이에 다시 번지게 하는 호출이 없다
    expect(calls.slice(clipAt, firstArcAfterClip).some((c) => c.op === "drawImage" && c.args.length === 5)).toBe(false);
    expect(lastResizeBeforeClip!).toBeLessThan(clipAt);
  });

  it("N4 번짐 기능이 있는 브라우저는 전과 같이 — 임시 캔버스를 안 만들고 filter 로 번진다", () => {
    const { calls, made } = paint(lookById("kitsch"), true);
    expect(made.length).toBe(0);
    expect(resized(calls).length).toBe(0);
    expect(calls.some((c) => c.op === "filter" && String(c.args[0]).startsWith("blur("))).toBe(true);
  });
});
