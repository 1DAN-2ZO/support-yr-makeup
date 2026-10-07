// 룩 옮기기 — 아이라인 꼬리 찾기 (core/look-wing.ts): 능선 그림 → 곧은 선 후보 → 판정
import { describe, expect, it } from "vitest";
import { WING, findWing, pairWings, scanWing, wingProb } from "@core/look-wing";
import type { WingFound, WingInput } from "@core/look-wing";
import type { Pt } from "@core/types";

// 눈 폭 100px. 눈꼬리 점은 (200, 150), 눈 축은 오른쪽(+x), 눈썹 쪽은 위(−y)
const W = 420, H = 300, U = 100, OUTER: Pt = { x: 200, y: 150 };

/** 그림 한 장: 어두워진 정도(+ 가 어두워짐) · 믿을 수 있는 정도 · 맨얼굴 밝기 */
function canvas(): { raw: Float32Array; weight: Float32Array; bareL: Float32Array; input: WingInput } {
  const raw = new Float32Array(W * H), weight = new Float32Array(W * H).fill(1), bareL = new Float32Array(W * H).fill(70);
  const read = (a: Float32Array) => (x: number, y: number): number => {
    const i = Math.round(x), j = Math.round(y);
    return i < 0 || j < 0 || i >= W || j >= H ? 0 : a[j * W + i]!;
  };
  return { raw, weight, bareL, input: { raw: read(raw), weight: read(weight), bareL: read(bareL), outer: OUTER, ax: { x: 1, y: 0 }, up: { x: 0, y: -1 }, u: U, step: 1, strict: false, minStations: 3 } };
}
/** a → b 로 굵기 width(px) · 진하기 dark 의 선을 더한다 (가장자리는 1px 에 걸쳐 옅어진다) */
function stroke(arr: Float32Array, a: Pt, b: Pt, width: number, dark: number): void {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const d = Math.hypot(x - a.x - dx * r, y - a.y - dy * r) - width / 2;
    if (d < 1) arr[y * W + x] = Math.max(arr[y * W + x]!, dark * Math.max(0, Math.min(1, 1 - d)));
  }
}
/** 눈꼬리 점에서 눈 폭의 len 배 · 눈 축에서 위로 deg 도인 자리 */
const tipAt = (len: number, deg: number): Pt => ({ x: OUTER.x + len * U * Math.cos((deg * Math.PI) / 180), y: OUTER.y - len * U * Math.sin((deg * Math.PI) / 180) });
const near = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("findWing", () => {
  it("아무것도 안 그렸으면 꼬리가 없다", () => {
    const found = findWing(canvas().input);
    expect(found.wing).toBeNull();
    expect(found.outerLine).toBeNull();
    expect(found.why).toContain("없음");
  });

  it("눈꼬리에서 눈 폭의 30% · 위로 20° 로 뺀 선: 꼬리로 받고, 끝점 · 길이 · 방향이 그린 대로 나온다", () => {
    const c = canvas(), tip = tipAt(0.3, 20);
    stroke(c.raw, { x: 204, y: 147 }, tip, 4, 30);
    const { wing } = findWing(c.input);
    expect(wing).not.toBeNull();
    expect(near(wing!.end, tip)).toBeLessThan(0.03 * U);
    expect(wing!.len / U).toBeCloseTo(0.3, 1);
    expect(Math.abs(wing!.deg - 20)).toBeLessThanOrEqual(4);
    expect(wing!.p).toBeGreaterThan(WING.accept);
    // 그릴 선은 눈꼬리 점 밖에 있고 꼬리 끝에서 끝난다
    expect(wing!.line.every((p) => p.x >= OUTER.x)).toBe(true);
    expect(near(wing!.line[wing!.line.length - 1]!, wing!.end)).toBeLessThan(1e-6);
  });

  it("길이를 바꾸면 그만큼 달라진다 — 15% 와 40%", () => {
    for (const len of [0.15, 0.4]) {
      const c = canvas();
      stroke(c.raw, { x: 203, y: 148 }, tipAt(len, 10), 4, 30);
      const { wing } = findWing(c.input);
      expect(wing, `길이 ${len}`).not.toBeNull();
      expect(Math.abs(wing!.len / U - len), `길이 ${len}`).toBeLessThan(0.04);
    }
  });

  it("넓게 번진 섀도 옆에 그은 꼬리도 찾는다 — 섀도 덩어리는 선이 아니다", () => {
    const c = canvas(), tip = tipAt(0.3, 20);
    // 눈두덩 쪽에 넓고 어두운 덩어리 (반지름 40px)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.raw[y * W + x] = 22 * Math.exp(-((x - 185) ** 2 + (y - 105) ** 2) / (2 * 28 ** 2));
    const blobOnly = findWing(c.input);
    expect(blobOnly.wing).toBeNull();
    stroke(c.raw, { x: 204, y: 147 }, tip, 4, 45);
    const { wing } = findWing(c.input);
    expect(wing).not.toBeNull();
    expect(near(wing!.end, tip)).toBeLessThan(0.04 * U);
  });

  it("둘레가 밝아진 곳에 그은 꼬리도 찾는다 — 어두워진 크기가 아니라 양쪽과의 차이를 본다", () => {
    const c = canvas(), tip = tipAt(0.3, 15);
    // 생성 그림이 관자놀이 그늘을 걷어 내 둘레가 15 만큼 밝아졌고, 그 위의 꼬리는 맨얼굴보다 5 만 어둡다
    c.raw.fill(-15);
    stroke(c.raw, { x: 204, y: 148 }, tip, 4, 20);
    for (let i = 0; i < c.raw.length; i++) if (c.raw[i]! > 0) c.raw[i] = c.raw[i]! - 15;
    const { wing } = findWing(c.input);
    expect(wing).not.toBeNull();
    expect(near(wing!.end, tip)).toBeLessThan(0.04 * U);
  });

  it("속눈썹 가닥(눈꺼풀 선 위에서 시작해 가파르게 올라가는 여러 가닥)은 꼬리로 안 본다", () => {
    const c = canvas();
    // 눈꼬리 점보다 12 ~ 18px 위에서 시작해 45 ~ 55° 로 올라가는 가는 가닥 다섯
    for (let k = 0; k < 5; k++) {
      const a = { x: 186 + 7 * k, y: 138 - 2 * k }, th = ((45 + 2.5 * k) * Math.PI) / 180;
      stroke(c.raw, a, { x: a.x + 24 * Math.cos(th), y: a.y - 24 * Math.sin(th) }, 2, 22);
    }
    const found = findWing(c.input);
    expect(found.wing).toBeNull();
    expect(found.outerLine).toBeNull();
  });

  it("맨얼굴의 속눈썹 선 위를 따라 그은 선은 꼬리가 아니다 (눈꼬리 끝의 라이너) — 맨살 위로 뺀 것만 꼬리", () => {
    const c = canvas(), tip = tipAt(0.3, 5);
    // 맨얼굴에서 이미 어두운 선(속눈썹 선의 바깥 끝)이 같은 자리에 있다
    const lash = new Float32Array(W * H);
    stroke(lash, { x: 196, y: 149 }, { x: tip.x + 6, y: tip.y }, 6, 1);
    for (let i = 0; i < lash.length; i++) c.bareL[i] = 70 - 40 * lash[i]!;
    stroke(c.raw, { x: 204, y: 149 }, tip, 4, 30);
    const found = findWing(c.input);
    expect(found.wing).toBeNull();
    expect(found.outerLine).not.toBeNull();
  });

  it("믿을 수 없는 곳(머리카락이 덮은 곳)의 선은 보지 않는다", () => {
    const c = canvas();
    stroke(c.raw, { x: 204, y: 147 }, tipAt(0.3, 20), 4, 30);
    for (let y = 0; y < H; y++) for (let x = OUTER.x + 5; x < W; x++) c.weight[y * W + x] = 0;
    expect(findWing(c.input).wing).toBeNull();
  });

  it("화장 사진을 직접 포갠 것(strict)에서는 더 확실해야 받는다", () => {
    const c = canvas();
    stroke(c.raw, { x: 204, y: 147 }, tipAt(0.3, 20), 4, 30);
    const cd = scanWing(c.input).cands[0]!;
    expect(wingProb(cd)).toBeGreaterThan(WING.acceptStrict);
    expect(findWing({ ...c.input, strict: true }).wing).not.toBeNull();
    // 흐린 선은 strict 에서 안 받는다
    const faint = canvas();
    stroke(faint.raw, { x: 204, y: 147 }, tipAt(0.18, 20), 3, 9);
    expect(findWing({ ...faint.input, strict: true }).wing).toBeNull();
  });
});

describe("pairWings", () => {
  const line = (len: number, deg: number, p: number) => ({ end: tipAt(len, deg), len: len * U, deg, dark: 20, free: len * U, p, line: [OUTER, tipAt(len, deg)] });
  const sure: WingFound = { wing: line(0.3, 20, 0.95), outerLine: null, maybe: null, why: "" };
  const weak = (len: number, deg: number, p: number): WingFound => ({ wing: null, outerLine: null, maybe: line(len, deg, p), why: "꼬리로 보기 어려움" });

  it("한쪽 눈에 꼬리가 있고 반대쪽의 '꼬리일 수도 있는 선' 이 같은 모양이면 그것도 꼬리로 받는다", () => {
    const [a, b] = pairWings(sure, weak(0.26, 14, 0.6), U);
    expect(a).toBe(sure);
    expect(b.wing).not.toBeNull();
    expect(b.wing!.len / U).toBeCloseTo(0.26, 5);
  });

  it("모양이 다르거나(길이 · 방향) 너무 흐리면 안 받는다", () => {
    expect(pairWings(sure, weak(0.1, 18, 0.6), U)[1].wing).toBeNull();
    expect(pairWings(sure, weak(0.28, 45, 0.6), U)[1].wing).toBeNull();
    expect(pairWings(sure, weak(0.28, 18, 0.2), U)[1].wing).toBeNull();
  });

  it("두 눈 다 꼬리가 없으면 그대로다", () => {
    const [a, b] = pairWings(weak(0.3, 20, 0.6), weak(0.3, 20, 0.6), U);
    expect(a.wing).toBeNull();
    expect(b.wing).toBeNull();
  });
});
