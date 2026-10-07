// 룩 옮기기 4단계 — 떼어 낸 화장에서 "어디에 얼마나" 를 점 · 선으로 뽑기 (core/look-guide.ts)
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import type { RgbaImage } from "@core/color";
import { LM } from "@core/landmarks";
import { extractMakeup } from "@core/look-extract";
import { buildGuide } from "@core/look-guide";
import type { Pt } from "@core/types";
import { H, W, faceLandmarks } from "./helpers/synth-face";
import type { Rgb } from "./helpers/synth-face";

const SKIN: Rgb = [224, 172, 140], SHADOW: Rgb = [215, 130, 90], INK: Rgb = [30, 25, 28], BROWN: Rgb = [110, 75, 60], LIPSTICK: Rgb = [205, 110, 120];

/** 합성 얼굴 점: 아랫눈꺼풀을 더하고, 눈두덩에 자리가 생기게 눈썹을 25px 올린다 (눈 폭 90px) */
function landmarks(): Pt[] {
  const lm = faceLandmarks();
  const lower = (x0: number, x1: number): Pt[] => Array.from({ length: 9 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 8, y: 250 + 12 * Math.sin((Math.PI * i) / 8), z: 0 }));
  LM.eyeA.lower.forEach((id, i) => { lm[id] = lower(170, 260)[i]!; });
  LM.eyeB.lower.forEach((id, i) => { lm[id] = lower(430, 340)[i]!; });
  for (const id of [...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower]) lm[id] = { ...lm[id]!, y: lm[id]!.y - 25 };
  // 볼 영역의 점 (look-extract 의 CHEEK_POLY 와 같은 번호) — 합성 얼굴에는 없어서 눈 아래에 놓는다. 왼쪽은 좌우를 뒤집은 자리
  const cheek: [number, number, number, number][] = [[116, 345, 150, 290], [117, 346, 185, 285], [118, 347, 225, 288], [101, 330, 250, 300], [36, 266, 255, 330], [205, 425, 240, 360], [187, 411, 190, 370], [123, 352, 150, 340]];
  for (const [r, l, x, y] of cheek) {
    lm[r] = { x, y, z: 0 };
    lm[l] = { x: W - x, y, z: 0 };
  }
  return lm;
}
const LMS = landmarks();
const P = (i: number): Pt => LMS[i]!;

function photo(paint: (x: number, y: number) => Rgb | null = () => null): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...(paint(x, y) ?? SKIN), 255], (y * W + x) * 4);
  return { data, w: W, h: H };
}
const bare = photo();
/** 같은 얼굴에 화장을 그린 그림(= 정답사진)에서 뗀 것으로 가이드를 만든다 */
const guideOf = (paint: (x: number, y: number) => Rgb | null) => {
  const made = photo(paint);
  return buildGuide(extractMakeup(bare, { data: made.data as Uint8ClampedArray, w: W, h: H }, LMS), LMS);
};
const near = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const pctOf = (s: string): number => Number(/(\d+)%/.exec(s)?.[1] ?? NaN);

// 사진에서 왼쪽 눈 = 본인 오른쪽(R). 윗눈꺼풀은 (170,250) → (260,250), 가운데가 y 232
const lidR = LM.eyeA.upper.map(P);
const shadowBand = (height: number): Pt[] => [...lidR, ...[...lidR].reverse().map((p) => ({ x: p.x, y: p.y - height }))];

describe("buildGuide", () => {
  it("화장이 없으면 어느 부위도 없다", () => {
    const g = guideOf(() => null);
    for (const part of Object.values(g)) {
      expect(part.found).toBe(false);
      expect(part.outline.polys).toEqual([]);
      expect(part.color).toBeNull();
    }
  });

  it("섀도우: 속눈썹 선에서 위로 14px 칠했으면 위쪽 경계가 그 높이에 온다 — 칠한 쪽 눈만", () => {
    const band = shadowBand(14);
    const g = guideOf((x, y) => (pointInPoly(x, y, band) ? SHADOW : null));
    expect(g.shadow.found).toBe(true);
    expect(g.shadow.outline.polys).toHaveLength(1);
    const top = Math.min(...g.shadow.outline.polys[0]!.filter((p) => Math.abs(p.x - 215) < 8).map((p) => p.y));
    expect(Math.abs(top - (232 - 14))).toBeLessThanOrEqual(4);
    const note = g.shadow.notes.find((n) => n.label === "오른쪽 눈 — 위로");
    expect(pctOf(note!.value)).toBeGreaterThanOrEqual(11);   // 14px / 90px = 16%
    expect(pctOf(note!.value)).toBeLessThanOrEqual(21);
    expect(g.shadow.notes.some((n) => n.label.startsWith("왼쪽"))).toBe(false);
    expect(g.liner.found).toBe(false);   // 밝은 색 섀도는 라이너가 아니다
    expect(g.wing.found).toBe(false);
    expect(g.liner.notes.some((n) => n.value.includes("라이너가 안 보임"))).toBe(true);   // 왜 없다고 봤는지 남긴다 (칠하지 않은 쪽 눈)
    expect(g.liner.notes.some((n) => n.value.includes("어두운 섀도로 봄"))).toBe(true);   // 칠한 쪽은 넓어서 선이 아니다
    // 색은 칠한 섀도 색 쪽 (가장자리가 흐려져 조금 옅다)
    expect(g.shadow.color![0]).toBeGreaterThan(200);
    expect(g.shadow.color![2]).toBeLessThan(125);
  });

  it("섀도우를 더 높이 칠하면 경계도 올라간다", () => {
    const low = guideOf((x, y) => (pointInPoly(x, y, shadowBand(11)) ? SHADOW : null));
    const high = guideOf((x, y) => (pointInPoly(x, y, shadowBand(20)) ? SHADOW : null));
    const h = (g: ReturnType<typeof guideOf>): number => pctOf(g.shadow.notes.find((n) => n.label === "오른쪽 눈 — 위로")!.value);
    expect(h(high)).toBeGreaterThan(h(low) + 6);
    // 속눈썹 선 가까이의 얇은 띠(5px = 눈 폭의 6%)는 섀도우로 안 본다
    const thin = guideOf((x, y) => (pointInPoly(x, y, shadowBand(5)) ? SHADOW : null));
    expect(thin.shadow.found).toBe(false);
    expect(thin.shadow.notes.some((n) => n.value.includes("섀도우로 안 봄"))).toBe(true);
  });

  it("섀도우: 위 · 아래가 눈꼬리 밖에서 이어지면 눈을 감싸는 한 덩어리 테두리로 그린다", () => {
    const at = (pts: readonly Pt[], x: number): number => {
      const k = pts.findIndex((q, i) => i + 1 < pts.length && Math.min(q.x, pts[i + 1]!.x) <= x && x <= Math.max(q.x, pts[i + 1]!.x));
      const a = pts[Math.max(0, k)]!, b = pts[Math.max(0, k) + 1]!;
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
    };
    const underR = LM.eyeA.lower.map(P);
    // 눈 위로 14px, 눈 밑으로 10px, 눈꼬리(x 170) 밖으로 20px 까지 — 눈 뜬 틈은 비운다
    const g = guideOf((x, y) => {
      if (x >= 150 && x < 170) return y >= 236 && y <= 260 ? SHADOW : null;
      if (x < 170 || x > 260) return null;
      const up = at(lidR, x), lo = at(underR, x);
      return (y >= up - 14 && y < up) || (y > lo && y <= lo + 10) ? SHADOW : null;
    });
    expect(g.shadow.found).toBe(true);
    expect(g.shadow.outline.polys).toHaveLength(1);
    expect(g.shadow.notes.some((n) => n.label === "오른쪽 눈 — 모양" && n.value.includes("감싸"))).toBe(true);
    // 테두리가 눈 위 · 눈 밑 · 눈꼬리 밖을 다 지난다
    const ys = g.shadow.outline.polys[0]!.map((q) => q.y), xs = g.shadow.outline.polys[0]!.map((q) => q.x);
    expect(Math.min(...ys)).toBeLessThan(232);
    expect(Math.max(...ys)).toBeGreaterThan(262);
    expect(Math.min(...xs)).toBeLessThan(165);
  });

  // 아이라인은 두 갈래로 나온다: liner = 눈머리 ~ 눈꼬리의 속눈썹 선 (영역을 정해 둔다), wing = 눈꼬리 밖으로 뻗은 꼬리 (따로 알아본다)
  const wingAt = (deg: number, from: number, to: number, r: number) => {
    const outer = P(LM.eyeA.outer), th = (deg * Math.PI) / 180;
    const a = { x: outer.x - from * Math.cos(th), y: outer.y - from * Math.sin(th) }, end = { x: outer.x - to * Math.cos(th), y: outer.y - to * Math.sin(th) };   // 바깥(사진 왼쪽) · 위
    const len2 = (to - from) ** 2;
    const on = (x: number, y: number): boolean => {
      const t = Math.max(0, Math.min(1, ((x - a.x) * (end.x - a.x) + (y - a.y) * (end.y - a.y)) / len2));
      return Math.hypot(x - (a.x + (end.x - a.x) * t), y - (a.y + (end.y - a.y) * t)) <= r;
    };
    return { on, end };
  };
  const noteOf = (g: ReturnType<typeof guideOf>, part: "liner" | "wing", label: string): string => g[part].notes.find((n) => n.label === label)!.value;

  it("아이라인: 속눈썹 선에 띠를 그리고 꼬리를 뺐으면 — 속눈썹 선은 눈머리 ~ 눈꼬리 영역으로, 꼬리는 따로", () => {
    const band = shadowBand(5), w = wingAt(25, 0, 20, 2.2);
    const g = guideOf((x, y) => (pointInPoly(x, y, band) || w.on(x, y) ? INK : null));
    // 속눈썹 선: 두 눈 다 눈머리 ~ 눈꼬리 전체가 영역으로 나온다 (한쪽 눈에만 그렸어도)
    expect(g.liner.found).toBe(true);
    expect(g.liner.outline.lines).toHaveLength(2);
    expect(g.liner.zones).toHaveLength(2);
    expect(g.liner.dots.map((d) => d.label)).toEqual(["오른쪽 눈머리", "오른쪽 눈꼬리", "왼쪽 눈머리", "왼쪽 눈꼬리"]);
    const head = g.liner.dots[0]!.at, tail = g.liner.dots[1]!.at;
    expect(Math.abs(head.x - 260)).toBeLessThanOrEqual(4);   // 눈머리 x 260, 눈꼬리 x 170
    expect(Math.abs(tail.x - 170)).toBeLessThanOrEqual(4);
    expect(noteOf(g, "liner", "오른쪽 눈")).toContain("눈머리 ~ 눈꼬리 전체");
    const thick = Number(/그린 두께 눈 폭의 (\d+)%/.exec(noteOf(g, "liner", "오른쪽 눈"))?.[1]);
    expect(thick).toBeGreaterThanOrEqual(3);   // 5px / 90px = 6%
    expect(thick).toBeLessThanOrEqual(10);
    expect(noteOf(g, "liner", "왼쪽 눈")).toContain("반대쪽 눈에서 잰 두께");
    expect(g.liner.color![0]).toBeLessThan(110);   // 어두운 색
    // 꼬리: 따로
    expect(g.wing.found).toBe(true);
    const tip = g.wing.dots.find((d) => d.label === "오른쪽 꼬리 끝");
    expect(tip).toBeDefined();
    expect(near(tip!.at, w.end)).toBeLessThanOrEqual(7);
    const deg = Number(/위로 (\d+)°/.exec(noteOf(g, "wing", "오른쪽 눈"))?.[1]);
    expect(deg).toBeGreaterThanOrEqual(15);   // 그린 각도 25°
    expect(deg).toBeLessThanOrEqual(35);
    expect(g.wing.arrows.length).toBeGreaterThanOrEqual(1);
    expect(g.liner.arrows).toEqual([]);   // 꼬리 표시는 속눈썹 선 쪽에 섞이지 않는다
  });

  it("아이라인: 꼬리 없이 띠만 있으면 꼬리 부위는 없다", () => {
    const g = guideOf((x, y) => (pointInPoly(x, y, shadowBand(5)) ? INK : null));
    expect(g.liner.found).toBe(true);
    expect(g.wing.found).toBe(false);
    expect(g.wing.dots).toEqual([]);
    expect(noteOf(g, "wing", "오른쪽 눈")).toMatch(/^없음/);
    expect(g.liner.steps[0]).toContain("눈머리 점에서 눈꼬리 점까지");
  });

  it("아이라인: 속눈썹 선은 안 보이고 꼬리만 있어도 꼬리를 찾는다 (덮인 눈꺼풀) — 반대쪽 눈에는 옮겨 그린다", () => {
    // 눈꼬리 점에서 3px 떨어져 시작하는 24px 꼬리 — 얼굴 점이 조금 어긋나도 찾아야 한다
    const w = wingAt(20, 3, 27, 1.6);
    const g = guideOf((x, y) => (w.on(x, y) ? INK : null));
    expect(g.wing.found).toBe(true);
    const tip = g.wing.dots.find((d) => d.label === "오른쪽 꼬리 끝");
    expect(tip).toBeDefined();
    expect(near(tip!.at, w.end)).toBeLessThanOrEqual(8);
    expect(pctOf(noteOf(g, "wing", "오른쪽 눈"))).toBeGreaterThanOrEqual(24);   // 27px / 90px = 30%
    // 반대쪽 눈에는 같은 길이 · 같은 각도의 꼬리를 옮겨 그린다 — 눈꼬리(x 430)에서 바깥(오른쪽) 위로
    const mirrored = g.wing.dots.find((d) => d.label === "왼쪽 꼬리 끝");
    expect(mirrored).toBeDefined();
    expect(mirrored!.at.x).toBeGreaterThan(430 + 15);
    expect(mirrored!.at.y).toBeLessThan(250);
    expect(g.wing.steps.some((t) => t.includes("옮겨 그렸다"))).toBe(true);
    // 꼬리가 있으면 속눈썹 선도 긋는 것으로 보고 영역을 준다 — 두께는 못 쟀으니 가는 선으로
    expect(g.liner.found).toBe(true);
    expect(noteOf(g, "liner", "오른쪽 눈")).toContain("못 재서 가는 선으로");
    expect(noteOf(g, "liner", "오른쪽 눈")).toContain("라이너가 안 보임");
  });

  it("아이라인: 속눈썹 선의 일부(눈꼬리 쪽 절반)에만 가는 선이 있어도, 영역은 눈머리 ~ 눈꼬리 전체 — 보인 구간은 말로 알린다", () => {
    // 윗눈꺼풀 선에서 7px 위, 눈꼬리 쪽 절반(x 170 ~ 215)에 2px 굵기 선
    const onLine = (x: number, y: number): boolean => {
      if (x < 170 || x > 215) return false;
      const k = lidR.findIndex((q, i) => i + 1 < lidR.length && Math.min(q.x, lidR[i + 1]!.x) <= x && x <= Math.max(q.x, lidR[i + 1]!.x));
      if (k < 0) return false;
      const a = lidR[k]!, b = lidR[k + 1]!, lidY = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
      return Math.abs(y - (lidY - 7)) <= 1;
    };
    const g = guideOf((x, y) => (onLine(x, y) ? INK : null));
    expect(g.liner.found).toBe(true);
    expect(noteOf(g, "liner", "오른쪽 눈")).toContain("눈꼬리 쪽");
    expect(g.liner.outline.lines).toHaveLength(2);
    expect(g.liner.zones).toHaveLength(2);
    const xs = g.liner.outline.lines[0]!.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(80);   // 선은 눈 전체 길이(90px)로 그린다
    expect(g.liner.steps.some((t) => t.includes("눈꼬리 쪽"))).toBe(true);
    expect(g.wing.found).toBe(false);
  });

  it("아이라인 꼬리: 뿌리가 굵고 끝이 가는 꼬리도 끝까지 따라간다 — 굵은 데서 끊지 않는다", () => {
    // 눈꼬리(x 170)에서 바깥 위 10° 로 32px, 뿌리 반 굵기 6px → 끝 1px 로 가늘어지는 쐐기
    const outer = P(LM.eyeA.outer), th = (10 * Math.PI) / 180, len = 32;
    const end = { x: outer.x - len * Math.cos(th), y: outer.y - len * Math.sin(th) };
    const g = guideOf((x, y) => {
      const along = ((outer.x - x) * Math.cos(th) + (outer.y - y) * Math.sin(th));
      if (along < 0 || along > len) return null;
      const off = Math.abs(-(outer.x - x) * Math.sin(th) + (outer.y - y) * Math.cos(th));
      return off <= 1 + 5 * (1 - along / len) ? INK : null;
    });
    expect(g.wing.found).toBe(true);
    const tip = g.wing.dots.find((d) => d.label === "오른쪽 꼬리 끝");
    expect(tip).toBeDefined();
    expect(near(tip!.at, end)).toBeLessThanOrEqual(9);
    expect(pctOf(noteOf(g, "wing", "오른쪽 눈"))).toBeGreaterThanOrEqual(28);   // 32px / 90px = 36%
  });

  it("아이라인: 정답사진에서 뗀 것에 없으면, 화장 사진을 직접 포개서 뗀 것에서 찾는다", () => {
    const w = wingAt(20, 3, 30, 1.6);
    const layerOf = (paint: (x: number, y: number) => Rgb | null) => extractMakeup(bare, { data: photo(paint).data as Uint8ClampedArray, w: W, h: H }, LMS);
    const noLiner = layerOf(() => null), direct = layerOf((x, y) => (w.on(x, y) ? INK : null));
    const none = buildGuide(noLiner, LMS);
    expect(none.liner.found).toBe(false);
    expect(none.wing.found).toBe(false);
    const g = buildGuide(noLiner, LMS, direct);
    expect(g.wing.found).toBe(true);
    expect(g.wing.dots.some((d) => d.label === "오른쪽 꼬리 끝")).toBe(true);
    expect(g.wing.notes.some((n) => n.label === "오른쪽 눈 — 어디서 쟀나")).toBe(true);
    expect(g.liner.found).toBe(true);
  });

  // 사진에서 왼쪽 눈썹 = 본인 오른쪽(R). 꼬리는 x 160, 앞머리는 x 270
  const browR = [...LM.browA.upper.map(P), ...[...LM.browA.lower].reverse().map(P)];

  it("눈썹: 전체를 칠했으면 내 눈썹 모양의 테두리와 꼬리 · 앞머리", () => {
    const g = guideOf((x, y) => (pointInPoly(x, y, browR) ? BROWN : null));
    expect(g.brow.found).toBe(true);
    expect(g.brow.outline.polys).toHaveLength(1);
    const tail = g.brow.dots.find((d) => d.label === "오른쪽 눈썹 꼬리")!, head = g.brow.dots.find((d) => d.label === "오른쪽 눈썹 앞머리")!;
    expect(Math.abs(tail.at.x - 160)).toBeLessThanOrEqual(12);
    expect(Math.abs(head.at.x - 270)).toBeLessThanOrEqual(12);
    expect(g.shadow.found).toBe(false);
  });

  it("눈썹: 일부만 짙어진 조각은 테두리로 그리지 않는다 — 왜 안 봤는지 남긴다", () => {
    // 꼬리 쪽 1/3 만 칠함
    const g = guideOf((x, y) => (x < 197 && pointInPoly(x, y, browR) ? BROWN : null));
    expect(g.brow.found).toBe(false);
    expect(g.brow.outline.polys).toEqual([]);
    expect(g.brow.notes.some((n) => n.label === "오른쪽 눈썹" && n.value.includes("만 짙어짐"))).toBe(true);
  });

  it("눈썹: 내 눈썹보다 위로 두껍게 칠했으면 테두리가 그만큼 위로 나간다", () => {
    const topY = (poly: readonly Pt[]): number => Math.min(...poly.map((q) => q.y));
    const same = guideOf((x, y) => (pointInPoly(x, y, browR) ? BROWN : null));
    const thicker = guideOf((x, y) => (pointInPoly(x, y, browR) || pointInPoly(x, y + 7, browR) ? BROWN : null));   // 위로 7px 더
    expect(thicker.brow.found).toBe(true);
    expect(topY(same.brow.outline.polys[0]!) - topY(thicker.brow.outline.polys[0]!)).toBeGreaterThanOrEqual(4);
    const pctFirst = (g: typeof same): number => pctOf(g.brow.notes.find((n) => n.label === "오른쪽 눈썹 — 두께")!.value);
    expect(pctFirst(thicker)).toBeGreaterThan(pctFirst(same));
  });

  it("입술: 내 입술선 그대로 + 색", () => {
    const lips = LM.lipsOuter.map(P);
    const g = guideOf((x, y) => (pointInPoly(x, y, lips) ? LIPSTICK : null));
    expect(g.lip.found).toBe(true);
    // 테두리는 입술 점을 전부 지나고(점은 깎지 않는다), 그 사이를 곡선으로 잇는다
    for (const q of lips) expect(Math.min(...g.lip.outline.polys[0]!.map((o) => near(o, q)))).toBeLessThan(0.01);
    expect(g.lip.outline.polys[0]!.length).toBeGreaterThan(lips.length);
    g.lip.color!.forEach((v, k) => expect(Math.abs(v - LIPSTICK[k]!)).toBeLessThanOrEqual(10));
    expect(g.lip.notes[0]!.value).toBe("입술선을 따라 전체");
    expect(g.lip.steps).toEqual(["입술선을 따라 전체에 고르게 바른다"]);
  });

  it("볼: 붉어진 곳의 중심 · 테두리 · 가장 진한 자리 — 옆으로 길게 발랐으면 그렇게 말한다", () => {
    // 오른쪽 볼(사진 왼쪽)에 가로 64 · 세로 16 타원으로 붉게, 가운데가 가장 진하게.
    // 볼의 색 차이는 넓게 흐려서 떼므로(눈 폭의 30%) 모양이 실제보다 둥글게 재인다 — 뚜렷이 긴 것만 "길게" 로 나온다
    const c = { x: 200, y: 325 };
    const g = guideOf((x, y) => {
      const r = Math.hypot((x - c.x) / 64, (y - c.y) / 16);
      if (r > 1) return null;
      const k = 1 - 0.6 * r;   // 가운데 1 → 가장자리 0.4
      return [SKIN[0], Math.round(SKIN[1] - 45 * k), Math.round(SKIN[2] - 25 * k)];
    });
    expect(g.cheek.found).toBe(true);
    expect(g.cheek.outline.polys).toHaveLength(1);
    const mid = g.cheek.dots.find((d) => d.label === "오른쪽 볼 중심")!;
    expect(near(mid.at, c)).toBeLessThanOrEqual(8);
    expect(g.cheek.notes.find((n) => n.label === "오른쪽 볼 — 모양")!.value).toContain("옆으로 길게");
    expect(g.cheek.zones).toHaveLength(1);
    expect(g.cheek.arrows).toHaveLength(1);
    expect(g.cheek.steps.length).toBeGreaterThanOrEqual(2);
    expect(g.cheek.notes.some((n) => n.label === "좌우")).toBe(true);   // 한쪽 볼에만 발랐다
    expect(g.shadow.found).toBe(false);
  });
});
