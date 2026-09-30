// 화장 새 효과 3단계 — 마스카라 (#250). ④ 텍스처(public/lashes · core/lash · screens/lash-render)를 앱 그리기에 붙인다.
// 화장은 기준 얼굴에 한 번 그리고 셰이더가 휘어 붙이므로, 마스카라도 그때 한 번만 그린다 (AR 프레임마다 다시 안 그림)
import { describe, expect, it } from "vitest";
import type { LashMeta } from "@core/lash";
import { lookById, type Look } from "@core/looks";
import { paintLookOf, paintMakeup, type Layers } from "@screens/makeup-paint";
import type { LashTextures } from "@screens/lash-render";
import { LMS } from "./helpers/synth-face";

type Call = { op: string; args: unknown[] };
function rec(calls: Call[]): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return (...args: unknown[]) => { calls.push({ op: k, args }); };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

const META: LashMeta = {
  version: 2, uMin: -0.06, uMax: 1.22,
  textures: { up: { file: "u.png", vMin: -0.05, vMax: 0.36 }, mid: { file: "m.png", vMin: -0.16, vMax: 0.2 }, down: { file: "d.png", vMin: -0.4, vMax: 0.05 }, lower: { file: "l.png", vMin: -0.04, vMax: 0.2 } },
};
/** 불러 둔 텍스처 흉내 — 색 입힌 그림을 달라고 한 색을 적어 둔다 */
function fakeLashes(ready = true) {
  const tinted: string[] = [];
  const tex = { meta: ready ? META : null, get ready() { return ready; }, tint: (_f: string, color: string) => { tinted.push(color); return { width: 400, height: 100 } as HTMLCanvasElement; } };
  return { tex: tex as unknown as LashTextures, tinted };
}

function paint(look: Look, lashes: LashTextures | null) {
  const off: Call[] = [], mul: Call[] = [];
  const offCanvas = { width: 600, height: 600, getContext: () => rec(off) } as unknown as HTMLCanvasElement;
  const layers: Layers = { mul: rec(mul), col: rec([]), light: rec([]) };
  paintMakeup(layers, offCanvas, LMS, paintLookOf(look), null, "winged", lashes);
  return { off, mulDraws: mul.filter((c) => c.op === "drawImage").length };
}

describe("화장 새 효과 — 마스카라 (#250 3단계)", () => {
  it("L1 paintLookOf 가 마스카라 색·진하기를 넘긴다 · 없는 화장(출근/학생)은 비운다", () => {
    expect(paintLookOf(lookById("edgy")).lash).toEqual({ color: "#0d0b09", alpha: 0.95 });
    expect(paintLookOf(lookById("daily")).lash).toBeUndefined();
  });

  it("L2 텍스처가 준비돼 있으면 곱하기 층에 한 장 더 — 화장 색으로 입힌 그림을 쓴다", () => {
    const { tex, tinted } = fakeLashes();
    const withLash = paint(lookById("edgy"), tex), none = paint(lookById("edgy"), null);
    expect(withLash.mulDraws - none.mulDraws).toBe(1);
    expect(new Set(tinted)).toEqual(new Set(["#0d0b09"]));
    expect(withLash.off.filter((c) => c.op === "drawImage").length).toBeGreaterThan(50);   // 삼각형마다 그림 한 조각
  });

  it("L3 마스카라가 없는 화장은 텍스처가 있어도 안 그린다", () => {
    const { tex, tinted } = fakeLashes();
    expect(paint(lookById("daily"), tex).mulDraws).toBe(paint(lookById("daily"), null).mulDraws);
    expect(tinted).toHaveLength(0);
  });

  it("L4 텍스처를 아직 못 불렀으면(네트워크 느림·실패) 마스카라만 빼고 그린다 — 화면을 막지 않는다", () => {
    const { tex } = fakeLashes(false);
    expect(() => paint(lookById("edgy"), tex)).not.toThrow();
    expect(paint(lookById("edgy"), tex).mulDraws).toBe(paint(lookById("edgy"), null).mulDraws);
  });
});
