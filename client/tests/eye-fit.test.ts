// C안 (2026-10-02 PC) — 눈 모양 틀에 맞추기. 정면 눈 모양(눈꺼풀 점 16개)을 하나의 틀로 지금 눈꺼풀 점에 한꺼번에 맞추되,
// 튀는 점(먼 쪽 눈머리가 코 쪽으로 삐져나옴)은 무시한다. 틀을 세로로 눌러 맞출 수 있어 눈을 감거나 내리깔아도 따라간다
import { describe, expect, it } from "vitest";
import { EYE_CONTOUR, FAR_EYE_DEFAULT, computeFarEyeFix, farEyeWeight, robustAffine, stretchAlong } from "@core/eye-fit";
import { applyAffine } from "@core/eye-fit";
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";

/** 정면 눈: 폭 90 · 높이 30 타원 둘레 16점 (0 = 눈꼬리, 8 = 눈머리) */
const EYE: Pt[] = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * 2 * Math.PI;
  return { x: 200 + 45 * Math.cos(a), y: 250 - 15 * Math.sin(a) };
});
/** 고개를 돌려 가로로 0.7 배 · 6° 기울고 옮겨진 눈 */
const T = (p: Pt): Pt => {
  const a = (6 * Math.PI) / 180, x = (p.x - 200) * 0.7, y = p.y - 250;
  return { x: 230 + x * Math.cos(a) - y * Math.sin(a), y: 240 + x * Math.sin(a) + y * Math.cos(a) };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe("eye fit (C안)", () => {
  it("C1 튀는 점이 없으면 틀이 그대로 맞는다", () => {
    const t = robustAffine(EYE, EYE.map(T), 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(p))).toBeLessThan(1e-6);
  });

  it("C2 튀는 점 두 개(눈머리 20px · 눈꼬리 10px)는 무시하고 나머지에 맞춘다", () => {
    const cur = EYE.map(T);
    cur[8] = { x: cur[8]!.x - 20, y: cur[8]!.y };    // 눈머리가 코 쪽으로
    cur[0] = { x: cur[0]!.x + 4, y: cur[0]!.y + 9 }; // 눈꼬리가 눈동자 쪽으로
    const t = robustAffine(EYE, cur, 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(p)), JSON.stringify(p)).toBeLessThan(0.5);
  });

  it("C3 눈을 반쯤 감으면(세로 0.4 배) 틀도 눌려서 따라간다", () => {
    const half = (p: Pt): Pt => ({ x: p.x, y: 250 + (p.y - 250) * 0.4 });
    const t = robustAffine(EYE, EYE.map((p) => T(half(p))), 1)!;
    for (const p of EYE) expect(dist(applyAffine(t, p), T(half(p)))).toBeLessThan(1e-6);
  });

  it("C4 눈꺼풀 점 16개 — 위·아래 눈꺼풀, 눈꼬리·눈머리는 한 번씩", () => {
    for (const [s, eye] of [["R", LM.eyeA], ["L", LM.eyeB]] as const) {
      expect(EYE_CONTOUR[s]).toHaveLength(16);
      expect(new Set(EYE_CONTOUR[s]).size).toBe(16);
      for (const i of [...eye.upper, ...eye.lower]) expect(EYE_CONTOUR[s]).toContain(i);
    }
  });

  it("F1 한 방향으로만 늘이기 — 가운데를 지나는 축 방향 성분만 f 배, 수직 성분은 그대로 (눈 폭만 고치기)", () => {
    const c = { x: 100, y: 50 }, dir = { x: Math.cos(0.3), y: Math.sin(0.3) };
    const n = { x: -dir.y, y: dir.x };
    const p = { x: c.x + 10 * dir.x + 4 * n.x, y: c.y + 10 * dir.y + 4 * n.y };
    const q = stretchAlong(p, c, dir, 1.5);
    expect(dist(q, { x: c.x + 15 * dir.x + 4 * n.x, y: c.y + 15 * dir.y + 4 * n.y })).toBeLessThan(1e-9);
    expect(dist(stretchAlong(c, c, dir, 3), c)).toBeLessThan(1e-12);
  });

  it("C5 먼 쪽 눈을 틀로 넘기는 정도 — 각도 차 12 까지 0, 25 부터 1, 사이는 차츰", () => {
    expect(farEyeWeight(12)).toBe(0);
    expect(farEyeWeight(25)).toBe(1);
    expect(farEyeWeight(18)).toBeGreaterThan(0);
    expect(farEyeWeight(18)).toBeLessThan(1);
  });
});

// computeFarEyeFix — 화면 4(core/live-run.ts)·2-b AR(screens/fullrender.ts)가 같이 쓰는 합친 함수 (#291 리뷰: 중복 구현 지적 반영)
describe("computeFarEyeFix (화면 4·2-b AR 공용)", () => {
  const arcN = (x0: number, x1: number, y: number, rise: number, n: number): Pt[] =>
    Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y - rise * Math.sin((Math.PI * i) / (n - 1)) }));

  /** 478점 정면 얼굴 — 눈 둘(좌우 대칭) · 눈썹 둘 · 코끝(4) · 이마 위(10) · 미간(168)만 채운다 */
  function face(): Pt[] {
    const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 300, y: 300 }));
    const put = (ids: readonly number[], pts: readonly Pt[]) => ids.forEach((id, i) => { lm[id] = pts[i]!; });
    put(LM.eyeA.upper, arcN(170, 260, 250, 18, 9));
    put(LM.eyeA.lower, arcN(170, 260, 250, -10, 9));
    put(LM.eyeB.upper, arcN(340, 430, 250, 18, 9));
    put(LM.eyeB.lower, arcN(340, 430, 250, -10, 9));
    put(LM.browA.upper, arcN(160, 270, 205, 8, 5));
    put(LM.browA.lower, arcN(160, 270, 215, 5, 5));
    put(LM.browB.upper, arcN(330, 440, 205, 8, 5));
    put(LM.browB.lower, arcN(330, 440, 215, 5, 5));
    lm[4] = { x: 300, y: 290 };
    lm[10] = { x: 300, y: 120 };
    lm[168] = { x: 300, y: 230 };
    return lm;
  }
  /** base 를 그대로 복사하되 코끝을 dx 만큼 옮기고(= yaw), eyeB(far 가 되는 쪽) 눈꺼풀을 눈 가운데로 오그려 MediaPipe 가
   * 먼 쪽 눈에서 틀리는 모양을 흉내 낸다. eyeA·눈썹 둘·코/이마는 base 와 똑같이 둔다(가까운 쪽은 잘 잡힌다는 가정) */
  function turned(base: readonly Pt[], dx: number, shrink: number): Pt[] {
    const cur = base.map((p) => ({ ...p }));
    cur[4] = { x: base[4]!.x + dx, y: base[4]!.y };
    const c = { x: 385, y: 250 };   // eyeB 가운데
    for (const i of EYE_CONTOUR.L) cur[i] = { x: c.x + (base[i]!.x - c.x) * shrink, y: c.y + (base[i]!.y - c.y) * shrink };
    return cur;
  }

  it("D1 각도 차가 12° 안쪽이면 null — 보정 없음", () => {
    const base = face();
    const cur = turned(base, 3, 1);   // 코끝 3px 만 옮김 — yaw 작음
    expect(computeFarEyeFix(base, cur, FAR_EYE_DEFAULT)).toBeNull();
  });

  it("D2 크게 돌리면 null 이 아니고, 일부러 오그린 쪽(eyeB)을 먼 쪽으로 잡는다", () => {
    const base = face();
    const cur = turned(base, 40, 0.5);   // 코끝 40px + eyeB 절반으로 오그림 — yaw 큼
    const r = computeFarEyeFix(base, cur, FAR_EYE_DEFAULT);
    expect(r).not.toBeNull();
    expect(r!.far).toBe("L");
    expect(r!.weight).toBeGreaterThan(0);
  });

  it("D3 보정을 먼 쪽 눈 점에만 적용하면(실제 호출부와 같은 패턴) 그 눈 점만 바뀌고 나머지는 그대로", () => {
    const base = face();
    const cur = turned(base, 40, 0.5);
    const r = computeFarEyeFix(base, cur, FAR_EYE_DEFAULT)!;
    expect(r).not.toBeNull();
    const out = cur.map((p) => ({ ...p }));
    for (const i of EYE_CONTOUR[r.far]) {
      const q = r.place(base[i]!);
      out[i] = { x: out[i]!.x + (q.x - out[i]!.x) * r.weight, y: out[i]!.y + (q.y - out[i]!.y) * r.weight };
    }
    // 먼 쪽(eyeB) 눈꺼풀 점은 적어도 하나는 바뀌어야 한다
    expect(EYE_CONTOUR[r.far].some((i) => Math.abs(out[i]!.x - cur[i]!.x) > 0.5 || Math.abs(out[i]!.y - cur[i]!.y) > 0.5)).toBe(true);
    // 가까운 쪽 눈·눈썹 둘·코끝·이마·미간은 전혀 안 바뀐다
    const untouched = [...EYE_CONTOUR.R, ...LM.browA.upper, ...LM.browA.lower, ...LM.browB.upper, ...LM.browB.lower, 4, 10, 168];
    for (const i of untouched) expect(out[i]).toEqual(cur[i]);
  });
});
