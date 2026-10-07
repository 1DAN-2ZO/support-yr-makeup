import { describe, expect, it } from "vitest";
import { LM } from "../src/core/landmarks";
import type { PartMask } from "../src/core/makeup-extract";
import { LIPS_INNER, partGuides } from "../src/core/part-guide";
import type { Pt } from "../src/core/types";
import { LMS, P, eyeOf } from "./helpers/synth-face";

const W = 600, H = 600;
function mask(inside: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) m[y * W + x] = 1;
  return m;
}
const part = (p: PartMask["part"], side: PartMask["side"], m: Uint8Array): PartMask => ({ part: p, side, mask: m, count: m.reduce((s, v) => s + v, 0), peakDeltaE: 20 });
const get = (r: ReturnType<typeof partGuides>, p: string, side: PartMask["side"]) => r.find((g) => g.part === p && g.side === side);
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** 점에서 닫힌 다각형 변까지 가장 가까운 거리 */
function edgeDist(q: Pt, poly: readonly Pt[]): number {
  return Math.min(...poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!, dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0;
    return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
  }));
}
function inPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** 합성 얼굴 + 속입술 (gap: 윗 · 아랫 속입술 사이 px — 0 이면 다문 입) */
function withInnerLips(gap: number): Pt[] {
  const lm = LMS.map((p) => ({ ...p }));
  LIPS_INNER.forEach((id, k) => {
    const t = (k * Math.PI) / 10, up = k <= 10;
    lm[id] = { x: 300 - 45 * Math.cos(t), y: 420 + (up ? -1 : 1) * (gap / 2) * Math.abs(Math.sin(t)) };
  });
  return lm;
}
const lipMask = mask((x, y) => ((x - 300) / 60) ** 2 + ((y - 420) / 25) ** 2 <= 1);

describe("부위 가이드 모양 — 입술 · 눈썹은 얼굴 점, 나머지는 화장 영역", () => {
  it("G1 입을 벌리면 입술은 윗입술 · 아랫입술 두 모양 — 얼굴 점 선 그대로 (화장 영역은 이 사이가 들쭉날쭉했다)", () => {
    const lm = withInnerLips(14);
    const g = get(partGuides([part("lip", null, lipMask)], lm, W, H), "lip", null)!;
    expect(g.polys).toHaveLength(2);
    const [upper, lower] = g.polys as [Pt[], Pt[]];
    expect(upper.some((p) => near(p, lm[0]!) < 0.01) && upper.some((p) => near(p, lm[13]!) < 0.01), "윗입술 = 위 바깥선 + 위 속선").toBe(true);
    expect(lower.some((p) => near(p, lm[17]!) < 0.01) && lower.some((p) => near(p, lm[14]!) < 0.01), "아랫입술 = 아래 바깥선 + 아래 속선").toBe(true);
  });

  it("G2 다문 입이면 바깥 입술선 하나", () => {
    const lm = withInnerLips(0);
    const g = get(partGuides([part("lip", null, lipMask)], lm, W, H), "lip", null)!;
    expect(g.polys).toHaveLength(1);
    expect(g.polys[0]!.length).toBe(LM.lipsOuter.length);
  });

  it("G3 입술 화장이 안 잡히면 입술 가이드 없음", () => {
    expect(get(partGuides([], withInnerLips(14), W, H), "lip", null)).toBeUndefined();
  });

  it("G4 눈썹은 원래 눈썹(얼굴 점)을 다 덮고, 위로 삐죽한 털 톱니는 없다", () => {
    // 화장 영역: 눈썹 아래쪽 반만 + 위로 2px 굵기 16px 털 여러 가닥
    const lowY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI);
    const m = mask((x, y) => (x >= 165 && x <= 265 && y <= lowY(x) && y >= lowY(x) - 6) || (x >= 170 && x <= 260 && x % 9 < 2 && y < lowY(x) - 6 && y >= lowY(x) - 22));
    const g = get(partGuides([part("brow", "R", m)], LMS, W, H), "brow", "R")!;
    const poly = g.polys[0]!;
    for (const id of [...LM.browA.upper, ...LM.browA.lower]) {
      const q = P(id);
      // 매끈하게 다듬으면 뾰족한 꼬리 모서리가 조금 둥글어진다 — 눈 폭의 3% (합성 2.7px, 실제 사진에선 1px 남짓)까지
      expect(inPoly(q.x, q.y, poly) || edgeDist(q, poly) < 0.03 * 90, `눈썹 점 ${id} (${q.x.toFixed(0)}, ${q.y.toFixed(0)}) 변까지 ${edgeDist(q, poly).toFixed(1)}px`).toBe(true);
    }
    // 털: 테두리가 원래 눈썹 윗선보다 3px 넘게 위로 삐져나온 곳이 없다
    const up = LM.browA.upper.map(P);
    const upY = (x: number) => { for (let i = 1; i < up.length; i++) { const a = up[i - 1]!, b = up[i]!; if ((x - a.x) * (x - b.x) <= 0) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return -Infinity; };
    for (const p of poly) expect(p.y, `(${p.x.toFixed(0)}, ${p.y.toFixed(0)}) 윗선 ${upY(p.x).toFixed(0)}`).toBeGreaterThan(upY(p.x) - 3);
  });

  it("G5 섀도 테두리는 윗눈꺼풀 선 아래로 안 내려가고, 눈꺼풀 아래 떨어진 조각은 섀도가 아니다", () => {
    const lid = eyeOf("R").upper.map(P);
    // 눈두덩에서 눈 아래까지 + 눈 아래 떨어진 조각
    const m = mask((x, y) => (x >= 172 && x <= 258 && y >= 215 && y <= 262) || (x >= 190 && x <= 240 && y >= 270 && y <= 285));
    const g = get(partGuides([part("shadow", "R", m)], LMS, W, H), "shadow", "R")!;
    const lidY = (x: number) => {
      for (let i = 1; i < lid.length; i++) {
        const a = lid[i - 1]!, b = lid[i]!;
        if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
      return Infinity;
    };
    expect(g.polys, "눈 아래 조각은 빠짐").toHaveLength(1);
    for (const p of g.polys[0]!) expect(p.y, `(${p.x.toFixed(0)}, ${p.y.toFixed(0)}) 눈꺼풀 ${lidY(p.x).toFixed(1)}`).toBeLessThanOrEqual(lidY(p.x) + 0.5);
  });

  it("G6 블러셔는 볼록하게 감싼다 — 조각 사이 오목한 곳 없이", () => {
    // C 모양 (가운데가 파인) 볼 영역
    const m = mask((x, y) => ((x - 190) / 40) ** 2 + ((y - 340) / 28) ** 2 <= 1 && !(x > 195 && Math.abs(y - 340) < 9));
    const poly = get(partGuides([part("cheek", "R", m)], LMS, W, H), "cheek", "R")!.polys[0]!;
    const cross = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length]!, c = poly[(i + 2) % poly.length]!;
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    expect(cross.every((v) => v >= -1e-6) || cross.every((v) => v <= 1e-6), "볼록").toBe(true);
    expect(inPoly(220, 340, poly), "파인 곳도 감쌈").toBe(true);
  });

  it("G7 칠할 수 있는 곳(clip) 밖 픽셀은 가이드에서 뺀다 — 원본에 되붙인 경계 차이", () => {
    // 볼 + 얼굴 옆선 띠 (볼보다 크게 — 실사진에서 띠가 볼 테두리로 잡혔다)
    const m = mask((x, y) => (x - 190) ** 2 + (y - 340) ** 2 <= 400 || (x >= 100 && x <= 112 && y >= 260 && y <= 420));
    const clip = [{ x: 120, y: 200 }, { x: 480, y: 200 }, { x: 480, y: 500 }, { x: 120, y: 500 }];
    const poly = get(partGuides([part("cheek", "R", m)], LMS, W, H, { clip }), "cheek", "R")!.polys[0]!;
    expect(Math.min(...poly.map((p) => p.x))).toBeGreaterThan(160);
  });
});
