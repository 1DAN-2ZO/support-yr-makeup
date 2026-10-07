import { describe, expect, it } from "vitest";
import { LM } from "../src/core/landmarks";
import type { PartMask } from "../src/core/makeup-extract";
import { LIPS_INNER, partGuides } from "../src/core/part-guide";
import type { Pt } from "../src/core/types";
import { BROWN, INK, LMS, P, eyeOf, image } from "./helpers/synth-face";

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
    // 화장 영역: 눈썹 아래쪽 반만 + 위로 2px 굵기 30px 털 가닥 (5px 마다)
    const lowY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI);
    const m = mask((x, y) => (x >= 165 && x <= 265 && y <= lowY(x) && y >= lowY(x) - 6) || (x >= 170 && x <= 260 && x % 5 < 2 && y < lowY(x) - 6 && y >= lowY(x) - 36));
    const g = get(partGuides([part("brow", "R", m)], LMS, W, H), "brow", "R")!;
    const poly = g.polys[0]!;
    // 꼬리 끝 위 · 아래 점(70 · 46)은 아치 꼬리가 한 점으로 모이며 안쪽으로 들어간다 — 나머지를 본다
    for (const id of [...LM.browA.upper.slice(1), ...LM.browA.lower.slice(1)]) {
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

  it("G6 블러셔는 볼록한 모양 (오목한 곳 없이), 가운데는 영역 가운데", () => {
    // C 모양 (가운데가 파인) 볼 영역
    const m = mask((x, y) => ((x - 190) / 40) ** 2 + ((y - 340) / 28) ** 2 <= 1 && !(x > 195 && Math.abs(y - 340) < 9));
    const poly = get(partGuides([part("cheek", "R", m)], LMS, W, H), "cheek", "R")!.polys[0]!;
    const cross = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length]!, c = poly[(i + 2) % poly.length]!;
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    expect(cross.every((v) => v >= -1e-6) || cross.every((v) => v <= 1e-6), "볼록").toBe(true);
    const cx = poly.reduce((t, p) => t + p.x, 0) / poly.length, cy = poly.reduce((t, p) => t + p.y, 0) / poly.length;
    expect(Math.abs(cx - 188) < 6 && Math.abs(cy - 340) < 3, `가운데 (${cx.toFixed(0)}, ${cy.toFixed(0)})`).toBe(true);
  });

  it("G7 칠할 수 있는 곳(clip) 밖 픽셀은 가이드에서 뺀다 — 원본에 되붙인 경계 차이", () => {
    // 볼 + 얼굴 옆선 띠 (볼보다 크게 — 실사진에서 띠가 볼 테두리로 잡혔다)
    const m = mask((x, y) => (x - 190) ** 2 + (y - 340) ** 2 <= 400 || (x >= 100 && x <= 112 && y >= 260 && y <= 420));
    const clip = [{ x: 120, y: 200 }, { x: 480, y: 200 }, { x: 480, y: 500 }, { x: 120, y: 500 }];
    const poly = get(partGuides([part("cheek", "R", m)], LMS, W, H, { clip }), "cheek", "R")!.polys[0]!;
    expect(Math.min(...poly.map((p) => p.x))).toBeGreaterThan(160);
  });
});

describe("부위 가이드 — 양쪽 같은 모양 · 단순한 모양 (사용자: 울퉁불퉁하면 믿음이 안 간다)", () => {
  const mirror = (poly: readonly Pt[]) => poly.map((p) => ({ x: 600 - p.x, y: p.y }));
  /** 두 닫힌 다각형이 얼마나 다른가 — 꼭짓점에서 상대 변까지 가장 먼 거리 */
  const hausdorff = (a: readonly Pt[], b: readonly Pt[]) => Math.max(...a.map((q) => edgeDist(q, b)), ...b.map((q) => edgeDist(q, a)));
  const centroid = (p: readonly Pt[]) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  const ell = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const sym = (r: ReturnType<typeof partGuides>, p: string) => hausdorff(mirror(get(r, p, "R")!.polys[0]!), get(r, p, "L")!.polys[0]!);

  it("S1 블러셔: 양쪽이 달라도 결과는 거울처럼 같은 타원, 자리 · 크기는 둘의 중간", () => {
    const r = partGuides([part("cheek", "R", mask(ell(190, 340, 40, 28))), part("cheek", "L", mask(ell(415, 345, 46, 24)))], LMS, W, H);
    expect(sym(r, "cheek"), "거울처럼 같다").toBeLessThan(1);
    const c = centroid(get(r, "cheek", "R")!.polys[0]!);
    expect(Math.hypot(c.x - 187.5, c.y - 342.5), `가운데 (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`).toBeLessThan(2);
  });

  it("S2 블러셔: 톱니처럼 울퉁불퉁한 영역도 매끈한 타원", () => {
    const saw = (x: number, y: number) => { const t = Math.atan2(y - 340, x - 190), r = 1 + 0.12 * Math.sign(Math.sin(t * 12)); return ((x - 190) / (40 * r)) ** 2 + ((y - 340) / (28 * r)) ** 2 <= 1; };
    const poly = get(partGuides([part("cheek", "R", mask(saw))], LMS, W, H), "cheek", "R")!.polys[0]!;
    const c = centroid(poly), rad = poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    const bump = Math.max(...rad.map((v, i) => Math.abs(rad[(i + rad.length - 1) % rad.length]! - 2 * v + rad[(i + 1) % rad.length]!)));
    expect(bump, "반지름이 매끈하게 변한다 (톱니 없음)").toBeLessThan(1);
  });

  it("S3 섀도: 양쪽 높이가 달라도(20 · 30px) 거울처럼 같고 중간 높이, 윗선은 톱니 없이 매끈", () => {
    const lidR = eyeOf("R").upper.map(P), lidL = eyeOf("L").upper.map(P);
    const lidY = (lid: readonly Pt[]) => (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
    const yR = lidY(lidR), yL = lidY(lidL);
    const mR = mask((x, y) => x >= 175 && x <= 255 && y <= yR(x) && y >= yR(x) - 20 - (x % 6 < 3 ? 3 : 0));   // 톱니 윗선
    const mL = mask((x, y) => x >= 345 && x <= 425 && y <= yL(x) && y >= yL(x) - 30);
    const r = partGuides([part("shadow", "R", mR), part("shadow", "L", mL)], LMS, W, H);
    expect(sym(r, "shadow"), "거울처럼 같다").toBeLessThan(1);
    const poly = get(r, "shadow", "R")!.polys[0]!;
    const top = poly.filter((p) => yR(p.x) - p.y > 3).sort((a, b) => a.x - b.x);
    const hMid = yR(215) - Math.min(...poly.filter((p) => Math.abs(p.x - 215) < 6).map((p) => p.y));
    expect(Math.abs(hMid - 25.75), `가운데 높이 ${hMid.toFixed(1)}px (R 톱니 평균 21.5 · L 30 의 중간)`).toBeLessThan(2.5);
    // 가운데 구간에서 톱니 없음 (양 끝은 눈꺼풀로 내려오는 곡선 — S8)
    const mid = top.filter((p) => Math.abs(p.x - 215) < 25);
    const d2 = mid.slice(1, -1).map((p, i) => Math.abs(mid[i]!.y - 2 * p.y + mid[i + 2]!.y));
    expect(Math.max(...d2), "윗선 톱니 없음").toBeLessThan(1);
  });

  it("S4 라이너: 눈머리 → 눈꼬리는 얼굴 점에 고정, 꼬리 끝은 양쪽 평균 자리 · 양쪽 같은 모양", () => {
    const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
    const liner = (s: "R" | "L", tip: Pt) => mask((x, y) => {
      const path = [...eyeOf(s).upper.map(P).reverse(), tip];
      for (let i = 1; i < path.length; i++) if (seg(x, y, { x: path[i - 1]!.x, y: path[i - 1]!.y - 3 }, { x: path[i]!.x, y: path[i]!.y - 3 }) <= 2.5) return true;
      return false;
    });
    const oR = P(LM.eyeA.outer), oL = P(LM.eyeB.outer);
    const r = partGuides([part("liner", "R", liner("R", { x: oR.x - 22, y: oR.y - 10 })), part("liner", "L", liner("L", { x: oL.x + 30, y: oL.y - 12 }))], LMS, W, H);
    expect(sym(r, "liner"), "거울처럼 같다").toBeLessThan(1);
    const poly = get(r, "liner", "R")!.polys[0]!, lid = eyeOf("R").upper.map(P);
    for (const q of [lid[0]!, lid[lid.length - 1]!]) expect(edgeDist(q, poly), `눈꼬리 · 눈머리 (${q.x}, ${q.y.toFixed(0)}) 를 지난다`).toBeLessThan(0.5);
    const tip = poly.reduce((a, b) => (b.x < a.x ? b : a));   // 사진 왼쪽 눈은 꼬리가 왼쪽
    // 그린 꼬리 끝 평균 = 눈꼬리에서 바깥 26 · 위 11+3 (둥근 끝 반지름 2.5 만큼 더 나갈 수 있다)
    expect(Math.hypot(tip.x - (oR.x - 26), tip.y - (oR.y - 14)), `꼬리 끝 (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`).toBeLessThan(4);
  });

  it("S5 눈썹: 양쪽 두께가 달라도 같은 모양으로 — 원래 눈썹은 다 덮는다", () => {
    const browMask = (s: "R" | "L", extra: number) => {
      const b = s === "R" ? LM.browA : LM.browB, poly = [...b.upper, ...[...b.lower].reverse()].map(P).map((p, i) => (i < 5 ? { x: p.x, y: p.y - extra } : p));
      return mask((x, y) => inPoly(x, y, poly));
    };
    const r = partGuides([part("brow", "R", browMask("R", 4)), part("brow", "L", browMask("L", 8))], LMS, W, H);
    expect(sym(r, "brow"), "거울처럼 같다").toBeLessThan(1);
    const poly = get(r, "brow", "R")!.polys[0]!;
    for (const id of [...LM.browA.upper.slice(1), ...LM.browA.lower.slice(1)]) expect(inPoly(P(id).x, P(id).y, poly) || edgeDist(P(id), poly) < 0.03 * 90, `눈썹 점 ${id}`).toBe(true);
  });

  it("S6 한쪽만 잡혀도 반대쪽에 거울로 — 화장은 양쪽 같게 한다", () => {
    const r = partGuides([part("cheek", "R", mask(ell(190, 340, 40, 28)))], LMS, W, H);
    expect(get(r, "cheek", "L"), "반대쪽도 있다").toBeDefined();
    expect(sym(r, "cheek")).toBeLessThan(1);
  });
});

describe("부위 가이드 — 실사진에서 나온 문제", () => {
  it("S7 블러셔: 볼 자리에 흩어진 작은 점(반짝이)은 빼고 가장 큰 덩어리로 타원 — 실사진: 눈부터 입까지 긴 타원이 됐다", () => {
    const blob = (x: number, y: number) => ((x - 190) / 30) ** 2 + ((y - 340) / 20) ** 2 <= 1;
    const dots = [[170, 270], [230, 280], [175, 400], [225, 410], [240, 300]];
    // 점은 작은 점 버리기(30px)에 안 걸리게 반지름 5 — 따로 떨어진 덩어리
    const m = mask((x, y) => blob(x, y) || dots.some(([dx, dy]) => Math.hypot(x - dx!, y - dy!) <= 5));
    const poly = get(partGuides([part("cheek", "R", m)], LMS, W, H), "cheek", "R")!.polys[0]!;
    const ys = poly.map((p) => p.y), xs = poly.map((p) => p.x);
    expect(Math.max(...ys) - Math.min(...ys), "높이 ≈ 덩어리 높이 40").toBeLessThan(48);
    expect(Math.max(...xs) - Math.min(...xs), "너비 ≈ 덩어리 너비 60").toBeLessThan(68);
  });

  it("S8 섀도: 양 끝은 라이너 윗선으로 내려와 닫힌다 (네모가 아니라 초승달) — 실사진: 양 끝이 세로로 끊겼다", () => {
    const lid = eyeOf("R").upper.map(P);
    const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
    const m = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 20);
    const poly = get(partGuides([part("shadow", "R", m)], LMS, W, H), "shadow", "R")!.polys[0]!;
    const h = (p: Pt) => lidY(p.x) - p.y;
    const xs = poly.map((p) => p.x), left = Math.min(...xs), right = Math.max(...xs);
    for (const end of [left, right]) {
      const hs = poly.filter((p) => Math.abs(p.x - end) < 1).map(h);
      expect(Math.max(...hs), `끝 (x ${end.toFixed(0)}) 높이 — 눈꺼풀로 내려와 닫힘 (라이너 없음)`).toBeLessThan(2);
    }
  });
});

describe("부위 가이드 — 섀도는 라이너 위 (사용자 2026-10-07)", () => {
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  const lid = eyeOf("R").upper.map(P), mid = lid[4]!;
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  /** 눈꺼풀 위 r px 두께 라이너 + 꼬리 */
  const linerMask = (r: number) => mask((x, y) => {
    const o = P(LM.eyeA.outer), path = [...[...lid].reverse(), { x: o.x - 22, y: o.y - 10 }];
    for (let i = 1; i < path.length; i++) if (seg(x, y, { x: path[i - 1]!.x, y: path[i - 1]!.y - r }, { x: path[i]!.x, y: path[i]!.y - r }) <= r) return true;
    return false;
  });

  it("S10 섀도는 라이너 윗선에서 시작 — 라이너 띠와 겹치지 않는다", () => {
    const sh = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 24);
    const r = partGuides([part("liner", "R", linerMask(2.5)), part("shadow", "R", sh)], LMS, W, H);
    const liner = get(r, "liner", "R")!.polys[0]!, shadow = get(r, "shadow", "R")!.polys[0]!;
    for (const p of shadow) expect(inPoly(p.x, p.y, liner) && edgeDist(p, liner) > 0.5, `섀도 점 (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) 이 라이너 안`).toBe(false);
    const low = Math.max(...shadow.filter((p) => Math.abs(p.x - mid.x) < 3).map((p) => p.y));
    expect(lidY(mid.x) - low, "섀도 아랫선이 라이너(두께 2.5px 띠) 위").toBeGreaterThan(2);
  });
});

describe("부위 가이드 — 라이너는 실제 두께 · 꼬리 모양대로 (사용자 그림 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  /** 사진 왼쪽 눈 눈꼬리 (170, 250) 기준 눈 좌표 — 바깥(왼쪽) s · 위 v, 눈 폭 90px */
  const sv = (x: number, y: number) => ({ s: (170 - x) / 90, v: (250 - y) / 90 });

  it("L1 띠 두께는 실제 라이너를 따라 — 눈머리 쪽 2px 에서 눈꼬리 쪽 7px 로 두꺼워지면 가이드도", () => {
    const T = (x: number) => 2 + (5 * (260 - x)) / 90;
    const m = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - T(x));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    for (const x of [250, 215, 182]) {
      const top = Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y));
      expect(Math.abs(lidY(x) - top - T(x)), `x ${x}: 띠 높이 ${(lidY(x) - top).toFixed(1)}px (실제 ${T(x).toFixed(1)}px)`).toBeLessThan(1.5);
    }
  });

  it("L2 꼬리 윗선은 실제 꼬리 모양 그대로 (위로 볼록하게 휜 꼬리), 아랫선은 눈꼬리 → 꼬리 끝", () => {
    const sT = 0.3, vT = 0.12;
    const hi = (s: number) => vT * (s / sT) + 0.08 * (1 - s / sT) + 0.05 * Math.sin((Math.PI * s) / sT);
    const m = mask((x, y) => {
      if (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 7) return true;   // 띠
      const q = sv(x, y);
      return q.s >= 0 && q.s <= sT && q.v >= vT * (q.s / sT) && q.v <= hi(q.s);
    });
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const midTop = { x: 170 - 90 * sT / 2, y: 250 - 90 * hi(sT / 2) };
    expect(edgeDist(midTop, poly), `꼬리 가운데 윗선 (${midTop.x}, ${midTop.y.toFixed(1)})`).toBeLessThan(1.5);
    const tip = poly.reduce((a, b) => (b.x < a.x ? b : a));
    expect(Math.hypot(tip.x - (170 - 90 * sT), tip.y - (250 - 90 * vT)), `꼬리 끝 (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`).toBeLessThan(3);
  });
});

// 띠 높이 허용 1.5px — 가이드 눈꺼풀은 얼굴 점을 지나는 매끈한 곡선, 시험의 lidY 는 꺾은선이라 가파른 양 끝에서 1px 남짓 차이 (실사진으론 0.5px)
describe("부위 가이드 — 라이너 두께는 보이는 그대로 (사용자: 모든 화장이 눈꼬리 쪽이 두꺼운 게 아니다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const bandAt = (T: (x: number) => number, xs: readonly number[]) => {
    const m = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - T(x));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    return xs.map((x) => lidY(x) - Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y)));
  };

  it("L3 고른 두께(5px) 라이너는 가이드도 고르게", () => {
    for (const [x, h] of [250, 215, 182].map((x, i) => [x, bandAt(() => 5, [250, 215, 182])[i]!] as const)) expect(Math.abs(h - 5), `x ${x}: ${h.toFixed(1)}px`).toBeLessThan(1.5);
  });

  it("L4 눈머리 쪽이 두껍고(7px) 눈꼬리 쪽이 얇은(2px) 라이너도 그대로", () => {
    const T = (x: number) => 2 + (5 * (x - 170)) / 90;
    const hs = bandAt(T, [250, 215, 182]);
    [250, 215, 182].forEach((x, i) => expect(Math.abs(hs[i]! - T(x)), `x ${x}: ${hs[i]!.toFixed(1)}px (실제 ${T(x).toFixed(1)})`).toBeLessThan(1.5));
  });

  it("L5 눈꼬리 쪽 절반만 칠한 라이너 — 칠한 곳은 그 두께, 안 칠한 눈머리 쪽은 얇은 선", () => {
    const T = (x: number) => (x < 215 ? 6 : 0);
    const hs = bandAt(T, [250, 235, 195, 182]);
    expect(hs[0]!, `눈머리 쪽 ${hs[0]!.toFixed(1)}px`).toBeLessThan(2);
    expect(hs[1]!, `눈머리 쪽 ${hs[1]!.toFixed(1)}px`).toBeLessThan(2);
    expect(Math.abs(hs[2]! - 6), `눈꼬리 쪽 ${hs[2]!.toFixed(1)}px`).toBeLessThan(1.5);
    expect(Math.abs(hs[3]! - 6), `눈꼬리 쪽 ${hs[3]!.toFixed(1)}px`).toBeLessThan(1.5);
  });
});

describe("부위 가이드 — 실사진 라이너 꼬리 · 아치 눈썹 (사용자 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };

  it("L6 눈꼬리에 속눈썹이 뭉쳐 띠가 두껍게 재지고 꼬리 중간이 2px 끊겨도 꼬리를 잡는다 — 실사진: 꼬리를 통째로 놓쳤다", () => {
    const o = P(LM.eyeA.outer), tip = { x: o.x - 24, y: o.y - 12 };
    const m = mask((x, y) => {
      if (x >= 168 && x <= 258 && y <= lidY(x) + 1 && y >= lidY(x) - 5) return true;            // 띠 5px
      if (x >= 166 && x <= 182 && y <= (lidY(x) || o.y) + 1 && y >= (lidY(x) || o.y) - 15) return true;   // 눈꼬리 점까지 덮은 속눈썹 뭉치
      if (x <= o.x - 9 && x > o.x - 11) return false;                                             // 꼬리 중간 2px 끊김
      return x <= o.x && seg(x, y, { x: o.x, y: o.y - 3 }, tip) <= 2.5;                           // 꼬리
    });
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const far = poly.reduce((a, b) => (b.x < a.x ? b : a));
    expect(Math.hypot(far.x - tip.x, far.y - tip.y), `꼬리 끝 (${far.x.toFixed(1)}, ${far.y.toFixed(1)})`).toBeLessThan(4);
  });

  it("B1 눈썹은 아치 — 꼬리는 한 점으로 모이고 각진 모서리가 없다 (실사진: 꼬리 · 앞머리가 뚝 잘린 사다리꼴)", () => {
    const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H), "brow", "R")!.polys[0]!;
    const tailX = Math.min(...poly.map((p) => p.x)), nearTail = poly.filter((p) => p.x < tailX + 3).map((p) => p.y);
    expect(Math.max(...nearTail) - Math.min(...nearTail), "꼬리 끝 3px 안 두께 (뾰족)").toBeLessThan(3);
    const turn = poly.map((a, i) => {
      const p = poly[(i + poly.length - 1) % poly.length]!, n = poly[(i + 1) % poly.length]!;
      const u = Math.atan2(a.y - p.y, a.x - p.x), v = Math.atan2(n.y - a.y, n.x - a.x);
      return Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    });
    const tip = poly.reduce((a, c) => (c.x < a.x ? c : a));
    expect(Math.max(...turn.filter((_, i) => Math.hypot(poly[i]!.x - tip.x, poly[i]!.y - tip.y) > 4)), "꼬리 끝 말고 가장 크게 꺾인 각도").toBeLessThan(45);
  });
});

describe("부위 가이드 — 꼬리 윗선 홈 · 눈썹 빈 곳 (사용자 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };

  it("L7 꼬리가 띠에서 이어져 나올 때 만나는 곳에 홈이 없다 — 실사진: 꼬리와 띠가 만나는 곳이 꺾여 튀었다", () => {
    // 실제 라이너처럼 눈꼬리 쪽에서 띠가 두꺼워지며(4 → 9px) 꼬리로 이어진다
    const o = P(LM.eyeA.outer), tip = { x: o.x - 24, y: o.y - 12 };
    const T = (x: number) => (x >= 195 ? 4 : 4 + (5 * (195 - x)) / 25);
    const wing = [{ x: o.x, y: o.y }, tip, { x: o.x, y: o.y - 9 }];
    const m = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - T(x)) || inPoly(x, y, wing));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const ti = poly.reduce((bi, p, i) => (p.x < poly[bi]!.x ? i : bi), 0), upper = poly.slice(ti);   // 꼬리 끝 → 윗선 → 눈머리
    for (let i = 1; i + 1 < upper.length; i++) {
      const a = upper[i - 1]!, m2 = upper[i]!, c = upper[i + 1]!;
      if (c.x - a.x < 1e-6) continue;
      const yLine = a.y + ((c.y - a.y) * (m2.x - a.x)) / (c.x - a.x);
      // 1px 미만 — 합성 얼굴은 실사진보다 3배 커서 실사진으론 0.3px (안 보임). 실사진의 튐은 2px 남짓이었다
      expect(m2.y - yLine, `윗선 (${m2.x.toFixed(1)}, ${m2.y.toFixed(1)}) 홈`).toBeLessThan(1);
    }
  });

  it("B2 AI 가 눈썹을 원래보다 얇게 그렸으면 가이드도 실제 어두운 눈썹에 맞춘다 — 빈 살은 안 잡는다 (실사진)", () => {
    const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
    const loY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI), upY = (x: number) => 200 - 8 * Math.sin(((x - 160) / 110) * Math.PI);
    const darkTop = (x: number) => loY(x) - 0.6 * (loY(x) - upY(x));   // 실제 눈썹은 아래 60%
    const made = image((x, y) => (x >= 162 && x <= 268 && y >= darkTop(x) && y <= loY(x) ? INK : null));
    const g = partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H, { made });
    const poly = get(g, "brow", "R")!.polys[0]!;
    const top = Math.min(...poly.filter((p) => Math.abs(p.x - 215) < 3).map((p) => p.y));
    expect(Math.abs(top - darkTop(215)), `가운데 윗선 ${top.toFixed(1)} (실제 눈썹 윗선 ${darkTop(215).toFixed(1)}, 얼굴 점 윗선 ${upY(215).toFixed(1)})`).toBeLessThan(2);
  });
});

describe("부위 가이드 — 눈썹 위 떨어진 어두운 곳 (실사진: 옅은 눈썹에서 위쪽 그늘까지 잡혀 커졌다)", () => {
  it("B3 눈썹 위로 살 틈을 두고 떨어진 어두운 곳(그늘 · 머리카락)은 눈썹이 아니다 — 이어진 어두운 부분만", () => {
    const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
    const loY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI), upY = (x: number) => 200 - 8 * Math.sin(((x - 160) / 110) * Math.PI);
    const made = image((x, y) => {
      if (x >= 162 && x <= 268 && y >= upY(x) && y <= loY(x)) return INK;                 // 눈썹
      if (x >= 170 && x <= 260 && y >= upY(x) - 9 && y <= upY(x) - 4) return INK;         // 위로 4px 틈 두고 그늘
      return null;
    });
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H, { made }), "brow", "R")!.polys[0]!;
    const top = Math.min(...poly.filter((p) => Math.abs(p.x - 215) < 3).map((p) => p.y));
    expect(Math.abs(top - upY(215)), `가운데 윗선 ${top.toFixed(1)} (눈썹 윗선 ${upY(215).toFixed(1)}, 그늘 위 ${(upY(215) - 9).toFixed(1)})`).toBeLessThan(2);
  });
});

describe("부위 가이드 — 꼬리 끝이 높아도 띠는 그대로 (실사진: 띠가 쐐기로 덮였다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };

  it("L8 꼬리 끝이 눈꼬리보다 한참 높아도 눈꺼풀 띠는 보이는 두께 그대로 — 꼬리 다듬기는 눈꼬리 근처에서만", () => {
    const o = P(LM.eyeA.outer), tip = { x: o.x - 25, y: o.y - 24 };
    const m = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 5) || (x <= o.x + 2 && seg(x, y, { x: o.x, y: o.y - 3 }, tip) <= 2.5));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    for (const x of [235, 210, 195]) {
      const top = Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y));
      expect(Math.abs(lidY(x) - top - 5), `x ${x}: 띠 높이 ${(lidY(x) - top).toFixed(1)}px (실제 5px)`).toBeLessThan(1.5);
    }
  });
});

describe("부위 가이드 — 라이너는 AI 화장 사진의 가장 진한 선으로 (실사진: 차이에 섀도까지 섞여 부풀었다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };

  it("L9 눈두덩 섀도까지 차이로 잡혀도, 라이너 띠는 실제 검정 선 두께(4px)대로", () => {
    // AI 화장: 눈두덩 갈색 섀도(눈꺼풀 위 14px) + 검정 라이너(4px). 차이(라이너 부위)는 섀도까지 14px 로 잡혔다고 하자
    const made = image((x, y) => {
      const ly = lidY(x);
      if (!Number.isFinite(ly) || x < 172 || x > 258) return null;
      if (y <= ly && y >= ly - 4) return INK;
      if (y < ly - 4 && y >= ly - 14) return BROWN;
      return null;
    });
    const diff = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 14);
    const poly = get(partGuides([part("liner", "R", diff)], LMS, W, H, { made }), "liner", "R")!.polys[0]!;
    for (const x of [235, 215, 195]) {
      const top = Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y));
      expect(Math.abs(lidY(x) - top - 4), `x ${x}: 띠 높이 ${(lidY(x) - top).toFixed(1)}px (검정 선 4px, 섀도 14px)`).toBeLessThan(1.5);
    }
  });
});

describe("부위 가이드 — 라이너 꼬리 끝은 뾰족하게 (실사진: 끝이 뭉툭하게 잘렸다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  it("L10 굵고 짧은 꼬리라도 가이드 꼬리 끝은 한 점으로 모인다", () => {
    const o = P(LM.eyeA.outer);
    // 눈꼬리에서 바깥 22px 까지 높이 8px 짜리 뭉툭한 꼬리
    const m = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 6) || (x <= o.x && x >= o.x - 22 && y <= o.y && y >= o.y - 8));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const tipX = Math.min(...poly.map((p) => p.x)), near = poly.filter((p) => p.x < tipX + 3);
    // 끝에서 3px 안의 테두리 두께 (뾰족하면 작다)
    const ys = near.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys), `꼬리 끝 3px 안 두께`).toBeLessThan(3);
  });
});

describe("부위 가이드 — 라이너는 띠와 이어진 진한 선만 (실사진: 관자놀이 머리카락까지 꼬리로 잡혔다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  it("L11 꼬리 자리 끝에 따로 떨어진 진한 것(머리카락)은 꼬리가 아니다", () => {
    const o = P(LM.eyeA.outer);
    const made = image((x, y) => {
      const ly = lidY(x);
      if (Number.isFinite(ly) && x >= 172 && x <= 258 && y <= ly && y >= ly - 4) return INK;            // 라이너 띠
      if (x <= o.x - 38 && x >= o.x - 50 && y >= o.y - 14 && y <= o.y + 4) return INK;                     // 떨어진 머리카락
      return null;
    });
    const diff = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 4);
    const poly = get(partGuides([part("liner", "R", diff)], LMS, W, H, { made }), "liner", "R")!.polys[0]!;
    expect(Math.min(...poly.map((p) => p.x)), "꼬리가 머리카락까지 안 간다").toBeGreaterThan(o.x - 30);
  });
});
