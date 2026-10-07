// 룩 옮기기 — 부위 가이드를 얼굴 점에 묶어 다른 화면의 얼굴 위에 다시 놓기 (core/look-anchor.ts)
import { describe, expect, it } from "vitest";
import { FOLLOW, anchorGuide, anchorPoint, followLandmarks, mapGuide, placeGuide, placePoint } from "@core/look-anchor";
import { GUIDE_PARTS } from "@core/look-guide";
import type { LookGuide, PartGuide } from "@core/look-guide";
import type { Pt } from "@core/types";

/** 얼굴 점 478개 — 정해진 순서로 흩은 점 (그물의 모양이 진짜 얼굴이 아니어도 "같은 삼각형의 같은 자리" 계산은 똑같다) */
function landmarks(): Pt[] {
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: 478 }, () => ({ x: 100 + 400 * rnd(), y: 100 + 400 * rnd() }));
}
const LMS = landmarks();
const empty = (): PartGuide => ({ found: false, outline: { polys: [], lines: [] }, dots: [], color: null, notes: [], zones: [], arrows: [], measures: [], steps: [] });
function guide(): LookGuide {
  const g = {} as LookGuide;
  for (const p of GUIDE_PARTS) g[p] = empty();
  g.wing = {
    ...empty(), found: true, color: [40, 30, 30],
    outline: { polys: [], lines: [[{ x: 210, y: 240 }, { x: 180, y: 232 }, { x: 160, y: 224 }]] },
    dots: [{ at: { x: 160, y: 224 }, label: "오른쪽 꼬리 끝" }],
    arrows: [{ from: { x: 210, y: 240 }, to: { x: 160, y: 224 }, label: "36% · 20°" }],
    notes: [{ label: "오른쪽 눈", value: "눈꼬리 점에서 눈 폭의 36%" }],
    steps: ["눈꼬리에서 바깥으로 뺀다"],
  };
  g.shadow = {
    ...empty(), found: true,
    outline: { polys: [[{ x: 220, y: 230 }, { x: 300, y: 205 }, { x: 330, y: 235 }, { x: 250, y: 250 }]], lines: [] },
    zones: [{ poly: [{ x: 250, y: 225 }, { x: 290, y: 220 }, { x: 280, y: 240 }], label: "가장 진하게" }],
    measures: [{ from: { x: 280, y: 245 }, to: { x: 280, y: 210 }, label: "25%" }],
  };
  return g;
}
/** 화면 안에서 돌리고 · 키우고 · 옮기는 변환 */
const move = (deg: number, k: number, dx: number, dy: number) => (p: Pt): Pt => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return { x: k * (c * p.x - s * p.y) + dx, y: k * (s * p.x + c * p.y) + dy };
};
const points = (g: LookGuide): Pt[] => {
  const out: Pt[] = [];
  mapGuide(g, (p) => {
    out.push(p);
    return p;
  });
  return out;
};

describe("anchorGuide → placeGuide", () => {
  it("같은 얼굴 점에 다시 놓으면 제자리다", () => {
    const g = guide(), placed = placeGuide(anchorGuide(g, LMS), LMS);
    points(g).forEach((p, k) => {
      const q = points(placed)[k]!;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
    });
  });

  it("얼굴이 화면에서 옮겨 가고 · 커지고 · 기울면 가이드도 똑같이 따라간다", () => {
    const g = guide(), a = anchorGuide(g, LMS);
    for (const T of [move(0, 1, 80, -40), move(0, 0.6, 0, 0), move(17, 1.3, 30, 60), move(-25, 0.8, -100, 200)]) {
      const placed = points(placeGuide(a, LMS.map(T)));
      points(g).forEach((p, k) => {
        const want = T(p);
        expect(Math.hypot(want.x - placed[k]!.x, want.y - placed[k]!.y)).toBeLessThan(1e-6);
      });
    }
  });

  it("점의 좌표만 바뀐다 — 문장 · 숫자 · 색 · 있고 없음은 그대로", () => {
    const g = guide(), placed = placeGuide(anchorGuide(g, LMS), LMS.map(move(10, 1.2, 5, 5)));
    expect(placed.wing.found).toBe(true);
    expect(placed.wing.notes).toEqual(g.wing.notes);
    expect(placed.wing.steps).toEqual(g.wing.steps);
    expect(placed.wing.color).toEqual(g.wing.color);
    expect(placed.wing.dots[0]!.label).toBe("오른쪽 꼬리 끝");
    expect(placed.shadow.zones[0]!.label).toBe("가장 진하게");
    expect(placed.shadow.measures[0]!.label).toBe("25%");
    expect(placed.lip.found).toBe(false);
    expect(placed.shadow.outline.polys[0]).toHaveLength(4);
  });
});

describe("anchorPoint · placePoint", () => {
  it("삼각형 안의 점은 그 삼각형에 묶인다 (좌표가 전부 0 ~ 1)", () => {
    const tris = [[0, 1, 2]] as const, lm = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    const a = anchorPoint({ x: 2, y: 3 }, lm, tris);
    expect(a.tri).toBe(0);
    expect(a.b1).toBeCloseTo(0.2, 9);
    expect(a.b2).toBeCloseTo(0.3, 9);
    // 삼각형이 찌그러지면 그 안의 같은 자리로 간다
    expect(placePoint(a, [{ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 100, y: 140 }], tris)).toEqual({ x: 104, y: 112 });
  });

  it("그물 밖의 점은 가장 가까운 삼각형에 묶이고, 얼굴이 움직이면 같이 움직인다", () => {
    const tris = [[0, 1, 2], [3, 4, 5]] as const;
    const lm = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 100, y: 100 }, { x: 110, y: 100 }, { x: 100, y: 110 }];
    const a = anchorPoint({ x: -3, y: 4 }, lm, tris);
    expect(a.tri).toBe(0);
    const T = move(30, 2, 7, -9);
    const q = placePoint(a, lm.map(T), tris), want = T({ x: -3, y: 4 });
    expect(Math.hypot(q.x - want.x, q.y - want.y)).toBeLessThan(1e-9);
  });
});

describe("followLandmarks", () => {
  const U = 100;
  it("처음에는 새 값 그대로", () => {
    expect(followLandmarks(null, [{ x: 1, y: 2 }], U)).toEqual([{ x: 1, y: 2 }]);
  });

  it("가만히 있을 때의 작은 떨림은 줄인다", () => {
    const prev = [{ x: 100, y: 100 }, { x: 200, y: 100 }], cur = [{ x: 100.2, y: 100 }, { x: 200.2, y: 100 }];
    const out = followLandmarks(prev, cur, U);
    expect(out[0]!.x).toBeCloseTo(100.2 - 0.2 * FOLLOW.keep, 6);
  });

  it("얼굴이 움직이면 새 값을 바로 따른다 (가이드가 뒤처지지 않는다)", () => {
    const prev = [{ x: 100, y: 100 }, { x: 200, y: 100 }], cur = [{ x: 110, y: 100 }, { x: 210, y: 100 }];
    expect(followLandmarks(prev, cur, U)).toEqual(cur);
  });
});
