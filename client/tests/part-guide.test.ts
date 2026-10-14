import { describe, expect, it } from "vitest";
import { LM } from "../src/core/landmarks";
import type { PartMask } from "../src/core/makeup-extract";
import { LIPS_INNER, PART_GUIDE, partGuides } from "../src/core/part-guide";
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

  // 높이는 더 안 본다 — 섀도는 라이너 윗선부터 눈썹 아래까지 틀 모양 (사용자 2026-10-09, 시험 ST1)
  it("S3 섀도: 양쪽 높이가 달라도(20 · 30px) 거울처럼 같고, 윗선은 톱니 없이 매끈", () => {
    const lidR = eyeOf("R").upper.map(P), lidL = eyeOf("L").upper.map(P);
    const lidY = (lid: readonly Pt[]) => (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
    const yR = lidY(lidR), yL = lidY(lidL);
    const mR = mask((x, y) => x >= 175 && x <= 255 && y <= yR(x) && y >= yR(x) - 20 - (x % 6 < 3 ? 3 : 0));   // 톱니 윗선
    const mL = mask((x, y) => x >= 345 && x <= 425 && y <= yL(x) && y >= yL(x) - 30);
    const r = partGuides([part("shadow", "R", mR), part("shadow", "L", mL)], LMS, W, H);
    expect(sym(r, "shadow"), "거울처럼 같다").toBeLessThan(1);
    const poly = get(r, "shadow", "R")!.polys[0]!;
    const top = poly.filter((p) => yR(p.x) - p.y > 3).sort((a, b) => a.x - b.x);
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

  // 꼬리 윗선 모양은 더 안 따라간다 — 물결 틀, 사진에서는 꼬리 끝 자리만 읽는다 (사용자 2026-10-09, 시험 LT2)
  it("L2 휜 꼬리라도 꼬리 끝은 실제 꼬리 끝 자리", () => {
    const sT = 0.3, vT = 0.12;
    const hi = (s: number) => vT * (s / sT) + 0.08 * (1 - s / sT) + 0.05 * Math.sin((Math.PI * s) / sT);
    const m = mask((x, y) => {
      if (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 7) return true;   // 띠
      const q = sv(x, y);
      return q.s >= 0 && q.s <= sT && q.v >= vT * (q.s / sT) && q.v <= hi(q.s);
    });
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
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

describe("부위 가이드 — 라이너 물결 · 눈썹 빈 곳 (사용자 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };

  it("W1 띠와 꼬리 사이 실제 물결(눈꼬리 근처에서 살짝 내려갔다 꼬리로 올라감)은 남기고, 툭 꺾이는 곳은 없다 — 사용자: 부채꼴 말고 뗀 화장처럼 물결", () => {
    // 띠 4px 그대로 + 눈꼬리에서 위로 9px 시작하는 꼬리 — 두 윗선 사이가 눈꼬리 근처에서 오목하다 (물결)
    const o = P(LM.eyeA.outer), tip = { x: o.x - 24, y: o.y - 12 };
    const wing = [{ x: o.x, y: o.y }, tip, { x: o.x, y: o.y - 9 }];
    const m = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 4) || inPoly(x, y, wing));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const ti = poly.reduce((bi, p, i) => (p.x < poly[bi]!.x ? i : bi), 0), upper = poly.slice(ti);   // 꼬리 끝 → 윗선 → 눈머리
    const topAt = (x: number) => { const ys: number[] = []; for (let i = 1; i < upper.length; i++) { const a = upper[i - 1]!, c = upper[i]!; if ((x - a.x) * (x - c.x) <= 0 && a.x !== c.x) ys.push(a.y + ((c.y - a.y) * (x - a.x)) / (c.x - a.x)); } return Math.min(...ys); };
    // 물결: 눈꼬리 근처(x 172) 윗선이 띠(x 188)와 꼬리 가운데(x 158) 윗선을 이은 직선보다 아래로 들어가 있다 (부채꼴로 메우면 직선 위)
    const chord = topAt(188) + ((topAt(158) - topAt(188)) * (172 - 188)) / (158 - 188);
    expect(topAt(172) - chord, `눈꼬리 근처 윗선 ${topAt(172).toFixed(1)} · 직선 ${chord.toFixed(1)}`).toBeGreaterThan(1);
    // 매끄러움: 꼬리 끝 말고는 크게 꺾인 곳이 없다
    const turn = upper.slice(1, -1).map((a, i) => {
      const p = upper[i]!, n = upper[i + 2]!, u = Math.atan2(a.y - p.y, a.x - p.x), v = Math.atan2(n.y - a.y, n.x - a.x);
      return Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    });
    expect(Math.max(...turn), "꼬리 끝 말고 가장 크게 꺾인 각도").toBeLessThan(40);
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

describe("부위 가이드 — 마스카라 속눈썹은 라이너가 아니다 (실사진: 띠가 두꺼워지고 꼬리와 뭉쳤다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  it("L12 띠 위 속눈썹 가닥은 빼고 띠 두께는 라이너만, 가는 꼬리는 끝까지", () => {
    const o = P(LM.eyeA.outer), tip = { x: o.x - 30, y: o.y - 14 };
    const made = image((x, y) => {
      const ly = lidY(x);
      if (Number.isFinite(ly) && x >= 172 && x <= 258 && y <= ly && y >= ly - 4) return INK;                          // 라이너 4px
      if (seg(x, y, { x: o.x, y: o.y - 2 }, tip) <= 1.2) return INK;                                                    // 가는 꼬리 (2px)
      if (Number.isFinite(ly) && x >= 175 && x <= 255 && x % 4 === 0 && y < ly - 4 && y >= ly - 13) return INK;      // 속눈썹 가닥 (1px, 4px 마다)
      return null;
    });
    const diff = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 13);
    const poly = get(partGuides([part("liner", "R", diff)], LMS, W, H, { made }), "liner", "R")!.polys[0]!;
    for (const x of [235, 215]) {
      const top = Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y));
      expect(Math.abs(lidY(x) - top - 4), `x ${x}: 띠 높이 ${(lidY(x) - top).toFixed(1)}px (라이너 4px, 속눈썹까지 13px)`).toBeLessThan(1.5);
    }
    const far = poly.reduce((a, b) => (b.x < a.x ? b : a));
    expect(Math.hypot(far.x - tip.x, far.y - tip.y), `꼬리 끝 (${far.x.toFixed(1)}, ${far.y.toFixed(1)})`).toBeLessThan(4);
  });
});

describe("부위 가이드 — 섀도는 눈머리부터 라이너 꼬리 끝까지 부채꼴, 높이는 보이는 그대로 (사용자 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  const o = P(LM.eyeA.outer), tip = { x: o.x - 24, y: o.y - 12 };
  const liner = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 4) || (x <= o.x + 2 && seg(x, y, { x: o.x, y: o.y - 3 }, tip) <= 2.5));

  it("SH1 섀도는 눈머리부터 적어도 라이너 꼬리 끝까지 (더 번졌으면 그 너머까지 — SH3)", () => {
    const sh = mask((x, y) => x >= 140 && x <= 258 && y <= (lidY(x) || o.y) - 4 && y >= (lidY(x) || o.y) - 24);
    const r = partGuides([part("liner", "R", liner), part("shadow", "R", sh)], LMS, W, H);
    const poly = get(r, "shadow", "R")!.polys[0]!, ltip = get(r, "liner", "R")!.polys[0]!.reduce((a, b) => (b.x < a.x ? b : a));
    const far = poly.reduce((a, b) => (b.x < a.x ? b : a)), near = poly.reduce((a, b) => (b.x > a.x ? b : a));
    expect(far.x, `섀도 바깥 끝 (${far.x.toFixed(1)}, ${far.y.toFixed(1)}) · 라이너 꼬리 끝 (${ltip.x.toFixed(1)}, ${ltip.y.toFixed(1)})`).toBeLessThan(ltip.x + 3);
    expect(near.x, "눈머리 쪽까지").toBeGreaterThan(250);
  });

});

describe("부위 가이드 — 섀도가 라이너 꼬리 끝 바깥까지 번졌으면 거기까지 (사용자: 뗀 섀도보다 범위가 모자라다)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const seg = (x: number, y: number, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a.x - t * dx, y - a.y - t * dy); };
  it("SH3 섀도가 테두리 밖까지 번져도 테두리는 정한 모양 그대로(최대 범위 고정, 사용자 2026-10-14) — 대신 눈꼬리 쪽 화살표가 테두리 끝까지 길어진다", () => {
    const o = P(LM.eyeA.outer), tip = { x: o.x - 24, y: o.y - 12 };
    const liner = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 4) || (x <= o.x + 2 && seg(x, y, { x: o.x, y: o.y - 3 }, tip) <= 2.5));
    const out = [{ x: o.x, y: o.y - 6 }, { x: tip.x, y: tip.y - 3 }, { x: o.x - 48, y: o.y - 34 }, { x: o.x - 6, y: o.y - 30 }];
    const lidBand = (x: number, y: number) => x >= 172 && x <= 258 && y <= lidY(x) - 5 && y >= lidY(x) - 24;
    const spread = get(partGuides([part("liner", "R", liner), part("shadow", "R", mask((x, y) => lidBand(x, y) || inPoly(x, y, out)))], LMS, W, H), "shadow", "R")!;
    const plain = get(partGuides([part("liner", "R", liner), part("shadow", "R", mask(lidBand))], LMS, W, H), "shadow", "R")!;
    const far = (g: typeof spread) => Math.min(...g.polys[0]!.map((p) => p.x));
    expect(Math.abs(far(spread) - far(plain)), `바깥 끝 ${far(plain).toFixed(1)} → ${far(spread).toFixed(1)} — 번져도 그대로`).toBeLessThan(0.5);
    const len = (g: typeof spread) => near(g.marks!.dots[2]!, g.marks!.arrows[2]![1]!);
    expect(len(spread) - len(plain), `눈꼬리 쪽 화살표 ${len(plain).toFixed(1)} → ${len(spread).toFixed(1)}px`).toBeGreaterThan(6);
  });
});

describe("부위 가이드 — 섀도 테두리도 이웃 점끼리 매끄럽게 (사용자 2026-10-07)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  it("SH4 톱니 같은 섀도 윗선 · 번진 끝도 가이드 바깥 테두리는 매끄럽다 (아랫선은 라이너에 붙어 그대로)", () => {
    const o = P(LM.eyeA.outer);
    const saw = (x: number) => (Math.floor(x / 4) % 2 ? 4 : 0);
    const out = [{ x: o.x, y: o.y - 6 }, { x: o.x - 24, y: o.y - 14 }, { x: o.x - 40, y: o.y - 30 }, { x: o.x - 6, y: o.y - 32 }];
    const sh = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) - 1 && y >= lidY(x) - 22 - saw(x)) || (inPoly(x, y, out) && y >= o.y - 32 - saw(x)));
    const poly = get(partGuides([part("shadow", "R", sh)], LMS, W, H), "shadow", "R")!.polys[0]!;
    const outer = poly.slice(PART_GUIDE.profileN + 1);
    const turn = outer.slice(1, -1).map((a, i) => {
      const p = outer[i]!, n = outer[i + 2]!, u = Math.atan2(a.y - p.y, a.x - p.x), v = Math.atan2(n.y - a.y, n.x - a.x);
      return Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
    });
    expect(Math.max(...turn.slice(1, -1)), "바깥 테두리에서 가장 크게 꺾인 각도").toBeLessThan(35);
  });

});

describe("부위 가이드 — 눈썹 · 섀도가 정답사진의 다시 그린 자리 전체로 부풀지 않게 (실사진 2026-10-09: 섀도가 눈썹 밑까지 · 눈썹이 이마까지)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
  const loY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI), upY = (x: number) => 200 - 8 * Math.sin(((x - 160) / 110) * Math.PI);

  it("B4 눈썹 위에 붙어 이어진 넓은 그늘(옅은 눈썹 · 앞머리 그림자)이 있어도 가이드 윗선은 원래 눈썹 두께의 절반 넘게 올라가지 않는다", () => {
    // 눈썹(검정) 바로 위로 살 틈 없이 14px 갈색 그늘 — 실사진 공효진: 눈썹 가이드가 이마까지 부풀었다
    const made = image((x, y) => {
      if (x >= 162 && x <= 268 && y >= upY(x) && y <= loY(x)) return INK;
      if (x >= 165 && x <= 265 && y >= upY(x) - 14 && y < upY(x)) return [50, 40, 38];   // 눈썹만큼 어두운 그늘
      return null;
    });
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H, { made }), "brow", "R")!.polys[0]!;
    const top = Math.min(...poly.filter((p) => Math.abs(p.x - 215) < 3).map((p) => p.y)), T = loY(215) - upY(215);
    expect(upY(215) - top, `가운데 윗선이 눈썹 윗선보다 ${(upY(215) - top).toFixed(1)}px 위 (원래 두께 ${T.toFixed(1)}, 그늘 14)`).toBeLessThanOrEqual(0.5 * T + 1);
  });

  it("SH7 섀도가 눈썹 바로 밑까지 이어져도 섀도 가이드는 눈썹 가이드와 겹치지 않는다", () => {
    const sh = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) - 2 && y >= loY(x) - 1);
    const r = partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own))), part("shadow", "R", sh)], LMS, W, H);
    const brow = get(r, "brow", "R")!.polys[0]!, shadow = get(r, "shadow", "R")!.polys[0]!;
    const inside = shadow.filter((p) => inPoly(p.x, p.y, brow));
    expect(inside.length, `눈썹 가이드 안에 든 섀도 테두리 점 ${inside.length}개`).toBe(0);
    const gap = Math.min(...shadow.map((p) => edgeDist(p, brow)));
    expect(gap, `섀도 테두리와 눈썹 가이드 사이 가장 가까운 거리 ${gap.toFixed(1)}px`).toBeGreaterThanOrEqual(2);
  });
});

describe("부위 가이드 — 틀 모양 (사용자 2026-10-09: 라이너는 물결 틀에 길이 · 두께만, 섀도는 눈 위 ~ 눈썹 아래 부채꼴, 블러셔는 넓게 + 사방 화살표)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
  const browMask = mask((x, y) => inPoly(x, y, own));
  const turns = (line: readonly Pt[]) => line.slice(1, -1).map((a, i) => {
    const p = line[i]!, n = line[i + 2]!, u = Math.atan2(a.y - p.y, a.x - p.x), v = Math.atan2(n.y - a.y, n.x - a.x);
    return Math.abs(((v - u + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * (180 / Math.PI);
  });

  it("LT1 라이너 띠는 매끈한 틀 — 칸마다 들쭉날쭉한 두께(2 · 7px 이 6px 마다 번갈아)라도 가이드 두께는 출렁이지 않는다", () => {
    const T = (x: number) => (Math.floor(x / 6) % 2 ? 7 : 2);
    const m = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - T(x));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const xs = Array.from({ length: 17 }, (_, k) => 184 + 4 * k);
    const th = xs.map((x) => lidY(x) - Math.min(...poly.filter((p) => Math.abs(p.x - x) < 2.5 && p.y < lidY(x) + 0.5).map((p) => p.y)));
    // 0.5px 넘게 바뀐 것만 센다 — 시험의 눈꺼풀(lidY)은 꺾은선, 가이드 눈꺼풀은 매끈한 곡선이라 0.3px 남짓은 그 차이
    const d = th.slice(1).map((v, i) => v - th[i]!).filter((v) => Math.abs(v) > 0.5), flips = d.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(d[i]!)).length;
    expect(flips, `두께 ${th.map((v) => v.toFixed(1)).join(" ")} — 늘었다 줄었다 바뀐 횟수`).toBeLessThanOrEqual(1);
    const mean = th.reduce((a, v) => a + v, 0) / th.length;
    expect(Math.abs(mean - 4.5), `평균 두께 ${mean.toFixed(1)}px (실제 평균 4.5)`).toBeLessThan(1.5);
  });

  it("LT2 꼬리 윗선은 물결 틀 — 사진의 꼬리 윗선에 혹(6px)이 솟아도 가이드는 따라가지 않고 매끄럽게, 꼬리 끝은 실제 꼬리 끝 자리", () => {
    const o = P(LM.eyeA.outer), tip = { x: o.x - 27, y: o.y - 11 };
    const hump = (x: number) => 6 * Math.max(0, Math.sin((Math.PI * (o.x - x)) / (o.x - tip.x)));
    const wing = (x: number, y: number) => {
      if (x > o.x || x < tip.x) return false;
      const t = (o.x - x) / (o.x - tip.x), lo = o.y + (tip.y - o.y) * t, hi = o.y - 7 + (tip.y - (o.y - 7)) * t - hump(x);
      return y <= lo && y >= hi;
    };
    const m = mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) && y >= lidY(x) - 4) || wing(x, y));
    const poly = get(partGuides([part("liner", "R", m)], LMS, W, H), "liner", "R")!.polys[0]!;
    const ti = poly.reduce((bi, p, i) => (p.x < poly[bi]!.x ? i : bi), 0), g = poly[ti]!;
    expect(Math.hypot(g.x - tip.x, g.y - tip.y), `꼬리 끝 (${g.x.toFixed(1)}, ${g.y.toFixed(1)}) · 실제 (${tip.x}, ${tip.y})`).toBeLessThan(3.5);
    const midX = (o.x + tip.x) / 2, humpTop = o.y - 7 + (tip.y - (o.y - 7)) * 0.5 - 6;
    const top = Math.min(...poly.slice(ti).filter((p) => Math.abs(p.x - midX) < 2).map((p) => p.y));
    expect(top - humpTop, `꼬리 가운데 윗선 ${top.toFixed(1)} · 혹 꼭대기 ${humpTop.toFixed(1)} — 혹을 따라가지 않는다`).toBeGreaterThan(3);
    const upper = poly.slice(ti).filter((p) => p.x < o.x + 4);   // 꼬리 끝 → 눈꼬리 근처까지 윗선
    expect(Math.max(...turns(upper).slice(1)), "꼬리 윗선에서 가장 크게 꺾인 각도").toBeLessThan(25);
  });

  it("ST1 섀도는 라이너 윗선부터 눈썹 아래까지 — 섀도 화장이 아래쪽 10px 띠뿐이어도 가이드 윗선은 눈썹 가이드 바로 밑", () => {
    const sh = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) - 1 && y >= lidY(x) - 11);
    const r = partGuides([part("brow", "R", browMask), part("shadow", "R", sh)], LMS, W, H);
    const brow = get(r, "brow", "R")!.polys[0]!, poly = get(r, "shadow", "R")!.polys[0]!;
    const top = poly.filter((p) => Math.abs(p.x - 215) < 3).reduce((a, c) => (c.y < a.y ? c : a));
    const browLow = Math.max(...brow.filter((p) => Math.abs(p.x - 215) < 3).map((p) => p.y));
    expect(top.y - browLow, `가운데 섀도 윗선 ${top.y.toFixed(1)} · 눈썹 가이드 아랫선 ${browLow.toFixed(1)}`).toBeLessThan(6);
    expect(top.y - browLow, "눈썹 가이드와는 떨어져 있다").toBeGreaterThan(1);
  });

  it("ST2 섀도는 부채꼴 — 옆선은 위로 갈수록 바깥으로 벌어지고(세로로 끊긴 네모가 아님), 아랫선 양 끝은 눈머리 · 눈꼬리", () => {
    const o = P(LM.eyeA.outer), inner = P(LM.eyeA.inner);
    const sh = mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) - 1 && y >= lidY(x) - 11);
    const poly = get(partGuides([part("brow", "R", browMask), part("shadow", "R", sh)], LMS, W, H), "shadow", "R")!.polys[0]!;
    const near = (q: Pt) => Math.min(...poly.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    expect(near(inner), "눈머리를 지난다").toBeLessThan(3);
    expect(near(o), "눈꼬리를 지난다 (라이너 없음)").toBeLessThan(3);
    // 사진 왼쪽 눈 — 바깥은 왼쪽(작은 x). 위쪽 절반에서 가장 바깥 점이 눈꼬리보다 바깥, 가장 안쪽 점은 눈머리보다 바깥(안으로 벌어지지 않음)
    const midY = (Math.min(...poly.map((p) => p.y)) + o.y) / 2, upper = poly.filter((p) => p.y < midY);
    expect(Math.min(...upper.map((p) => p.x)), "위쪽이 바깥으로 벌어진다").toBeLessThan(o.x - 2);
    expect(Math.max(...upper.map((p) => p.x)), "위쪽 안쪽 끝은 눈머리보다 바깥").toBeLessThan(inner.x);
  });

  it("BL1 블러셔 타원은 화장 덩어리를 다 덮을 만큼 넓게 — 한쪽으로 늘어난 덩어리의 98% 넘게 안에", () => {
    const blob = (x: number, y: number) => Math.hypot(x - 190, y - 340) <= 22 || ((x - 216) / 18) ** 2 + ((y - 354) / 12) ** 2 <= 1;
    const poly = get(partGuides([part("cheek", "R", mask(blob))], LMS, W, H), "cheek", "R")!.polys[0]!;
    let n = 0, inside = 0;
    for (let y = 300; y < 380; y++) for (let x = 150; x < 250; x++) if (blob(x, y)) { n++; if (inPoly(x, y, poly)) inside++; }
    expect(inside / n, `덩어리 중 타원 안 ${((100 * inside) / n).toFixed(1)}%`).toBeGreaterThan(0.98);
  });

  it("BL2 블러셔 타원 안에 가운데 점 + 사방(네 방향) 화살표 — 가운데에서 바깥으로", () => {
    const g = get(partGuides([part("cheek", "R", mask((x, y) => ((x - 190) / 40) ** 2 + ((y - 340) / 28) ** 2 <= 1))], LMS, W, H), "cheek", "R")!;
    const poly = g.polys[0]!, marks = g.marks!;
    expect(marks.dots, "가운데 점 하나").toHaveLength(1);
    expect(marks.arrows, "화살표 넷").toHaveLength(4);
    const c = marks.dots[0]!;
    expect(inPoly(c.x, c.y, poly), "점은 타원 안").toBe(true);
    for (const [a, e] of marks.arrows) {
      expect(inPoly(a!.x, a!.y, poly) && inPoly(e!.x, e!.y, poly), "화살표는 타원 안").toBe(true);
      expect(Math.hypot(e!.x - c.x, e!.y - c.y), "바깥쪽을 향한다").toBeGreaterThan(Math.hypot(a!.x - c.x, a!.y - c.y));
    }
  });
});

describe("부위 가이드 — 눈썹은 실제 털에 딱 맞게 · 아래 섀도는 안 그림 (사용자 2026-10-09)", () => {
  const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
  const browMask = mask((x, y) => inPoly(x, y, own));
  const upY = (x: number) => 200 - 8 * Math.sin(((x - 160) / 110) * Math.PI), loY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI);
  const cY = (x: number) => (upY(x) + loY(x)) / 2;
  /** 가이드의 x 에서 위 · 아래 끝 */
  const span = (poly: readonly Pt[], x: number) => { const ys = poly.filter((p) => Math.abs(p.x - x) < 2).map((p) => p.y); return { top: Math.min(...ys), bot: Math.max(...ys) }; };
  const browOf = (paint: (x: number, y: number) => boolean) => get(partGuides([part("brow", "R", browMask)], LMS, W, H, { made: image((x, y) => (paint(x, y) ? INK : null)) }), "brow", "R")!.polys[0]!;

  it("U1 아래 섀도는 화장이 잡혀도 가이드를 그리지 않는다 — 가이드에서 뺐다", () => {
    const low = eyeOf("R").lower.map(P);
    const m = mask((x, y) => low.some((p) => Math.abs(p.x - x) < 3 && y > p.y + 1 && y < p.y + 12));
    expect(get(partGuides([part("underShadow", "R", m)], LMS, W, H), "underShadow", "R")).toBeUndefined();
  });

  it("BF1 꼬리로 갈수록 가늘어지는 눈썹 — 가이드도 머리 쪽은 두껍고 꼬리 쪽은 가늘다 (한 두께로 넓혀 꼬리가 뚱뚱했다)", () => {
    const half = (x: number) => 2.5 + (4.5 * (x - 162)) / 106;   // 꼬리(x 162) 5px → 머리(x 268) 14px
    const poly = browOf((x, y) => x >= 162 && x <= 268 && Math.abs(y - cY(x)) <= half(x));
    const head = span(poly, 255), tail = span(poly, 178);
    expect(Math.abs(head.bot - head.top - 2 * half(255)), `머리 쪽 두께 ${(head.bot - head.top).toFixed(1)} (실제 ${(2 * half(255)).toFixed(1)})`).toBeLessThan(3);
    expect(Math.abs(tail.bot - tail.top - 2 * half(178)), `꼬리 쪽 두께 ${(tail.bot - tail.top).toFixed(1)} (실제 ${(2 * half(178)).toFixed(1)})`).toBeLessThan(3);
  });

  // 꼬리 끝은 털 끝이 아니라 얼굴 점 꼬리 끝에 둔다 (사용자 2026-10-09: 끝부분 점은 지켜줘) — 털 끝을 따라가니 U 자로 막혀 끝이 안 맞았다
  it("BF2 꼬리 끝은 얼굴 점 꼬리 끝(윗선 · 아랫선 끝의 가운데) — 털을 길게 · 짧게 그렸어도", () => {
    const tail = { x: (P(b.upper[0]!).x + P(b.lower[0]!).x) / 2, y: (P(b.upper[0]!).y + P(b.lower[0]!).y) / 2 };
    for (const end of [150, 185]) {
      const poly = browOf((x, y) => x >= end && x <= 268 && Math.abs(y - cY(x)) <= 5);
      const tip = poly.reduce((a2, c) => (c.x < a2.x ? c : a2));
      expect(Math.hypot(tip.x - tail.x, tip.y - tail.y), `털 끝 x ${end} · 가이드 꼬리 끝 (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)}) · 얼굴 점 꼬리 끝 (${tail.x}, ${tail.y})`).toBeLessThan(1.5);
    }
  });

  it("BF3 꼬리는 뾰족하게 — 꼬리 끝에서 눈썹 길이의 6% 안쪽 두께가 가운데 두께의 절반 밑 (U 자로 둥글게 막히지 않는다), 아래로 처지지 않는다", () => {
    const poly = browOf((x, y) => x >= 162 && x <= 268 && Math.abs(y - cY(x)) <= 5);
    const tip = poly.reduce((a2, c) => (c.x < a2.x ? c : a2)), len = Math.max(...poly.map((p) => p.x)) - tip.x;
    const thick = (x: number) => { const ys = poly.filter((p) => Math.abs(p.x - x) < 1.5).map((p) => p.y); return Math.max(...ys) - Math.min(...ys); };
    expect(thick(tip.x + 0.06 * len), `꼬리 끝 안쪽 두께 ${thick(tip.x + 0.06 * len).toFixed(1)} · 가운데 ${thick(tip.x + 0.5 * len).toFixed(1)}`).toBeLessThan(0.5 * thick(tip.x + 0.5 * len));
    const below = poly.filter((p) => p.x < 175 && p.y > cY(p.x) + 6);
    expect(below.length, "꼬리 근처에서 털 아래로 처진 점").toBe(0);
  });
});

describe("부위 가이드 — 옅은 눈썹 머리 (실사진 2026-10-09 공효진: 머리 쪽이 옅으니 가이드 머리가 바늘처럼 가늘게 뻗었다)", () => {
  const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
  const upY = (x: number) => 200 - 8 * Math.sin(((x - 160) / 110) * Math.PI), loY = (x: number) => 214 - 4 * Math.sin(((x - 160) / 110) * Math.PI);
  const cY = (x: number) => (upY(x) + loY(x)) / 2;
  it("BF4 머리 쪽 털이 옅은(살보다 조금만 어두운) 눈썹 — 가이드 머리도 털 두께만큼 (가늘게 뻗지 않는다)", () => {
    // 꼬리 ~ 가운데는 진한 털(INK), 머리 쪽 1/3 은 옅은 털(살 SKIN 224,172,140 보다 17 쯤 어두운 갈색),
    // 꼬리 쪽 위에는 옆머리가 털에 붙어 내려와 있다 — 실사진에서 꼬리 쪽은 두껍게, 머리 쪽은 비어 머리가 가늘게 꺾였다
    const made = image((x, y) => {
      if (x >= 162 && x <= 268 && Math.abs(y - cY(x)) <= 6) return x > 232 ? [205, 156, 126] : INK;
      if (x >= 158 && x <= 195 && y < cY(x) - 6 && y >= cY(x) - 18) return [50, 40, 38];
      return null;
    });
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H, { made }), "brow", "R")!.polys[0]!;
    const ys = poly.filter((p) => Math.abs(p.x - 255) < 2).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys), `머리 쪽(x 255) 두께 ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} (털 12)`).toBeGreaterThan(8);
    const headX = Math.max(...poly.map((p) => p.x));
    expect(headX, `머리 끝 x ${headX.toFixed(1)} (털 끝 268)`).toBeLessThan(276);
  });

  it("BF5 눈썹 꼬리 옆에 붙은 옆머리(두꺼운 어두운 덩어리)는 꼬리가 아니다 — 꼬리가 관자놀이로 뻗지 않는다 (실사진 2026-10-09)", () => {
    const made = image((x, y) => {
      if (x >= 162 && x <= 268 && Math.abs(y - cY(x)) <= 5) return INK;
      if (x >= 140 && x < 162 && Math.abs(y - cY(162)) <= 14) return [50, 40, 38];   // 꼬리에 붙은 옆머리
      return null;
    });
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], LMS, W, H, { made }), "brow", "R")!.polys[0]!;
    const tipX = Math.min(...poly.map((p) => p.x));
    expect(tipX, `가이드 꼬리 끝 x ${tipX.toFixed(1)} (털 끝 162, 옆머리 끝 140)`).toBeGreaterThan(157);
  });

  it("BS1 눈썹 테두리는 매끈한 아치 — 얼굴 점이 조금 들쭉날쭉해도(±2.5px) 윗선 · 아랫선이 한쪽으로만 휜다 (사용자: 선이 구불구불하다)", () => {
    const lm = LMS.map((p) => ({ ...p }));
    [...LM.browA.upper, ...LM.browA.lower].forEach((id, k) => { lm[id] = { ...lm[id]!, y: lm[id]!.y + (k % 2 ? 2.5 : -2.5) }; });
    const made = image((x, y) => (x >= 162 && x <= 268 && Math.abs(y - cY(x)) <= 6 ? INK : null));
    const poly = get(partGuides([part("brow", "R", mask((x, y) => inPoly(x, y, own)))], lm, W, H, { made }), "brow", "R")!.polys[0]!;
    // 꼬리(가장 왼쪽) → 머리(가장 오른쪽)로 윗선 · 아랫선을 나눠, 양 끝 15% 를 뺀 가운데에서 휘는 방향이 바뀐 횟수
    const ti = poly.reduce((bi, p, i) => (p.x < poly[bi]!.x ? i : bi), 0), hi = poly.reduce((bi, p, i) => (p.x > poly[bi]!.x ? i : bi), 0);
    const ring = (a: number, b: number) => { const out: Pt[] = []; for (let i = a; ; i = (i + 1) % poly.length) { out.push(poly[i]!); if (i === b) break; } return out; };
    const x0 = poly[ti]!.x, x1 = poly[hi]!.x, inMid = (p: Pt) => p.x > x0 + 0.15 * (x1 - x0) && p.x < x1 - 0.15 * (x1 - x0);
    for (const [name, line] of [["윗선 또는 아랫선", ring(ti, hi)], ["다른 쪽 선", ring(hi, ti)]] as const) {
      const pts = line.filter(inMid).filter((_, i) => i % 3 === 0);
      const cross = pts.slice(1, -1).map((a, i) => { const p = pts[i]!, n = pts[i + 2]!; return (a.x - p.x) * (n.y - a.y) - (a.y - p.y) * (n.x - a.x); });
      const sig = cross.filter((c) => Math.abs(c) > 0.05);
      const flips = sig.slice(1).filter((c, i) => Math.sign(c) !== Math.sign(sig[i]!)).length;
      expect(flips, `${name} 가운데에서 휘는 방향이 바뀐 횟수`).toBeLessThanOrEqual(1);
    }
  });
});

describe("부위 가이드 — 섀도는 둥근 돔(최대 범위) + 퍼지는 화살표 (사용자 그림 2026-10-14: 정확한 영역 대신 넓게, 화장 정도는 화살표 길이로)", () => {
  const lid = eyeOf("R").upper.map(P);
  const lidY = (x: number) => { for (let i = 1; i < lid.length; i++) { const a = lid[i - 1]!, b = lid[i]!; if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); } return NaN; };
  const o = P(LM.eyeA.outer), inner = P(LM.eyeA.inner), ew = Math.hypot(o.x - inner.x, o.y - inner.y);
  const b = LM.browA, own = [...b.upper, ...[...b.lower].reverse()].map(P);
  const browMask = mask((x, y) => inPoly(x, y, own));
  /** 눈꺼풀 위 hgt px 섀도 띠 (눈 안쪽 폭만) */
  const band = (hgt: number) => mask((x, y) => x >= 172 && x <= 258 && y <= lidY(x) - 1 && y >= lidY(x) - hgt);
  const shadowOf = (m: Uint8Array) => get(partGuides([part("brow", "R", browMask), part("shadow", "R", m)], LMS, W, H), "shadow", "R")!;
  /** 사진 왼쪽 눈 — 바깥은 -x, 위는 -y. 바깥 방향에서 위로 몇 도인가 */
  const deg = (a: Pt, c: Pt) => (Math.atan2(-(c.y - a.y), -(c.x - a.x)) * 180) / Math.PI;
  const len = (g: ReturnType<typeof shadowOf>, k: number) => near(g.marks!.dots[k]!, g.marks!.arrows[k]![1]!);

  it("SD1 테두리는 섀도 화장 크기와 상관없이 같은 최대 범위 — 낮은 띠(6px)여도 높은 띠(24px)와 같다", () => {
    const a = shadowOf(band(6)).polys[0]!, c = shadowOf(band(24)).polys[0]!;
    const box = (q: readonly Pt[]) => [Math.min(...q.map((p) => p.x)), Math.min(...q.map((p) => p.y)), Math.max(...q.map((p) => p.x)), Math.max(...q.map((p) => p.y))];
    box(a).forEach((v, i) => expect(Math.abs(v - box(c)[i]!), `테두리 상자 ${box(a).map((x) => x.toFixed(1))} · ${box(c).map((x) => x.toFixed(1))}`).toBeLessThan(1));
  });

  it("SD2 사용자가 잡은 돔 (2026-10-14 섀도 모양 잡기) — 눈꼬리 바깥으로 눈 폭의 40% 넘게 나가고, 바깥 아래 끝은 눈꼬리 높이 근처 (눈 밑으로는 안)", () => {
    const poly = shadowOf(band(10)).polys[0]!;
    expect(Math.min(...poly.map((p) => p.x)), "눈꼬리 바깥으로").toBeLessThan(o.x - 0.4 * ew);
    const low = Math.max(...poly.filter((p) => p.x < o.x - 2).map((p) => p.y));
    expect(Math.abs(low - o.y), `바깥 쪽 가장 낮은 점 y ${low.toFixed(1)} · 눈꼬리 ${o.y}`).toBeLessThan(0.1 * ew);
  });

  it("SD6 테두리는 사용자가 잡은 받침점(PART_GUIDE.shadowShape)을 그대로 지난다 — 가로 s 는 눈꼬리에서 눈 폭 몇 배, 세로 k 는 눈꺼풀(0) ~ 눈썹 아랫선 − browGap(1)", () => {
    const poly = shadowOf(band(10)).polys[0]!;
    // 사진 왼쪽 눈의 눈 좌표 (합성 얼굴: 두 눈꼬리가 수평 → 바깥 = -x, 위 = -y, 눈 폭 90)
    const toS = (q: Pt) => ({ s: (o.x - q.x) / ew, v: (o.y - q.y) / ew });
    const lidSV = eyeOf("R").upper.map((i) => toS(P(i))).sort((a, c) => a.s - c.s), browSV = LM.browA.lower.map((i) => toS(P(i))).sort((a, c) => a.s - c.s);
    const lerp = (arr: { s: number; v: number }[], x: number) => {
      if (x <= arr[0]!.s) return arr[0]!.v;
      for (let k = 1; k < arr.length; k++) if (x <= arr[k]!.s) { const a = arr[k - 1]!, c = arr[k]!; return a.v + ((c.v - a.v) * (x - a.s)) / (c.s - a.s); }
      return arr[arr.length - 1]!.v;
    };
    for (const [x, k] of PART_GUIDE.shadowShape) {
      const v = lerp(lidSV, x) + k * (lerp(browSV, x) - PART_GUIDE.browGap - lerp(lidSV, x)), q = { x: o.x - x * ew, y: o.y - v * ew };
      const d = edgeDist(q, poly);
      expect(d, `받침점 (s ${x}, k ${k}) → (${q.x.toFixed(1)}, ${q.y.toFixed(1)}) 에서 테두리 선까지 ${d.toFixed(2)}px`).toBeLessThan(1);
    }
  });

  it("SD3 점 셋은 라이너 윗선(라이너가 없으면 눈꺼풀) 위 눈머리 쪽 · 가운데 · 눈꼬리 쪽, 화살표는 점에서 위 → 대각선 → 바깥으로 펼쳐진다", () => {
    const g = shadowOf(band(24)), dots = g.marks?.dots ?? [], arrows = g.marks?.arrows ?? [];
    expect(dots, "점 셋").toHaveLength(3);
    expect(arrows, "화살표 셋").toHaveLength(3);
    for (const d of dots) expect(Math.abs(d.y - lidY(d.x)), `점 (${d.x.toFixed(1)}, ${d.y.toFixed(1)}) · 눈꺼풀 ${lidY(d.x).toFixed(1)}`).toBeLessThan(2);
    expect(dots[0]!.x > dots[1]!.x && dots[1]!.x > dots[2]!.x, "눈머리 → 눈꼬리 순서").toBe(true);
    arrows.forEach((a, k) => expect(near(a[0]!, dots[k]!), `화살표 ${k} 가 점에서 시작`).toBeLessThan(0.05 * ew));
    const angs = arrows.map((a) => deg(dots[arrows.indexOf(a)]!, a[1]!));
    expect(angs[0], `눈머리 쪽은 거의 위로 (${angs.map((v) => v.toFixed(0)).join(" · ")}°)`).toBeGreaterThan(55);
    expect(angs[1]).toBeGreaterThan(25);
    expect(angs[1]).toBeLessThan(60);
    expect(angs[2], "눈꼬리 쪽은 바깥으로").toBeLessThan(30);
  });

  it("SD4 화살표 길이는 그쪽으로 섀도가 퍼진 만큼 — 높게 칠한 섀도(24px)가 낮은 띠(8px)보다 위쪽 화살표가 길고, 화살표 끝은 테두리 안", () => {
    const lo = shadowOf(band(8)), hi = shadowOf(band(24));
    expect(len(hi, 0) - len(lo, 0), `눈머리 쪽 화살표 ${len(lo, 0).toFixed(1)} → ${len(hi, 0).toFixed(1)}px`).toBeGreaterThan(8);
    for (const g of [lo, hi]) for (const a of g.marks!.arrows) expect(inPoly(a[1]!.x, a[1]!.y, g.polys[0]!), "화살표 끝이 테두리 안").toBe(true);
  });

  it("SD5 눈꼬리 바깥으로 뺀 섀도가 있으면 바깥 화살표가 길어진다", () => {
    const flat = shadowOf(band(10));
    const wing = shadowOf(mask((x, y) => (x >= 172 && x <= 258 && y <= lidY(x) - 1 && y >= lidY(x) - 10) || (x >= o.x - 30 && x < 172 && y >= o.y - 25 && y <= o.y - 2)));
    expect(len(wing, 2) - len(flat, 2), `눈꼬리 쪽 화살표 ${len(flat, 2).toFixed(1)} → ${len(wing, 2).toFixed(1)}px`).toBeGreaterThan(8);
  });
});
