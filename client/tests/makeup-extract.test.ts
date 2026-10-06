// 화장 떼기 (2026-10-06 POC) — AI 가 내 얼굴에 입힌 화장 사진에서, 맨얼굴과의 차이로 부위별 화장 모양을 떼서 가이드로.
// 정답을 아는 합성 화장으로 먼저 본다: 블러셔(가운데에서 퍼지는 방사형)를 칠하고 떼서 자리 · 크기 · 기울기가 돌아오나
import { describe, expect, it } from "vitest";
import { lookGuide } from "@core/guides";
import { BLUSH_EXTRACT, extractCheek } from "@core/makeup-extract";
import type { Pt } from "@core/types";
import { BARE, LMS, SKIN, image, type Rgb } from "./helpers/synth-face";

const G = lookGuide({});
const truth = G("cheek", BARE).regions!;   // 우리 가이드 타원 — 칠할 정답
const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
/** 타원 다각형의 가운데 · 긴 반지름 · 짧은 반지름 · 기울기(°) */
function ellipseOf(poly: readonly Pt[]): { c: Pt; rx: number; ry: number; deg: number } {
  const c = mean(poly), d = poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  const far = poly[d.indexOf(Math.max(...d))]!;
  return { c, rx: Math.max(...d), ry: Math.min(...d), deg: (Math.atan2(far.y - c.y, far.x - c.x) * 180) / Math.PI };
}
const angleDiff = (a: number, b: number) => { const d = Math.abs(((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };

/**
 * 완성본(makeup-paint)과 같은 방사형 블러셔: 가운데 1 → 반지름 절반 0.55 → 1.3배 반지름 0. 진하기 alpha, 화장색 color.
 * shift: 그림 전체 밝기 변화(AI 가 조명 · 피부 톤을 조금 바꾸는 것 흉내)
 */
function blushImage(color: Rgb = [226, 120, 130], alpha = 0.35, shift = 0) {
  const ells = (["R", "L"] as const).map((s) => ellipseOf(truth[s]));
  return image((x, y) => {
    let k = 0;
    for (const e of ells) {
      const t = (e.deg * Math.PI) / 180, dx = x - e.c.x, dy = y - e.c.y;
      const u = (dx * Math.cos(t) + dy * Math.sin(t)) / (e.rx * 1.3), v = (-dx * Math.sin(t) + dy * Math.cos(t)) / (e.ry * 1.3);
      const r = Math.hypot(u, v);
      const s = r >= 1 ? 0 : r <= 0.5 ? 1 - 0.9 * r : 0.55 * (1 - r) / 0.5;
      k = Math.max(k, s);
    }
    const base = SKIN.map((c) => c + shift) as unknown as Rgb;
    return k > 0 ? (base.map((c, i) => c * (1 - alpha * k) + color[i]! * alpha * k) as unknown as Rgb) : base;
  });
}

describe("화장 떼기 — 블러셔", () => {
  it("X1 칠한 블러셔에서 자리 · 크기 · 기울기를 되찾는다 (가장 진한 곳의 30% 까지 = 가이드 타원)", () => {
    const got = extractCheek(BARE.im, blushImage(), LMS);
    for (const s of ["R", "L"] as const) {
      const want = ellipseOf(truth[s]), e = got[s]!;
      expect(e, s).not.toBeNull();
      expect(Math.hypot(e.center.x - want.c.x, e.center.y - want.c.y), `${s} 가운데`).toBeLessThan(3);
      expect(e.rx / want.rx, `${s} 긴 반지름`).toBeGreaterThan(0.85);
      expect(e.rx / want.rx, `${s} 긴 반지름`).toBeLessThan(1.15);
      expect(e.ry / want.ry, `${s} 짧은 반지름`).toBeGreaterThan(0.85);
      expect(e.ry / want.ry, `${s} 짧은 반지름`).toBeLessThan(1.15);
      expect(angleDiff(e.angleDeg, want.deg), `${s} 기울기`).toBeLessThan(8);
      expect(e.outline.length).toBeGreaterThan(8);
    }
  });

  it("X2 그림 전체 밝기가 바뀌어도(AI 가 톤을 조금 바꿈) 화장 안 하는 자리(이마)로 빼고 같은 답", () => {
    const got = extractCheek(BARE.im, blushImage(undefined, undefined, 8), LMS);
    for (const s of ["R", "L"] as const) {
      const want = ellipseOf(truth[s]), e = got[s]!;
      expect(Math.hypot(e.center.x - want.c.x, e.center.y - want.c.y), s).toBeLessThan(3);
      expect(e.rx / want.rx, s).toBeGreaterThan(0.85);
      expect(e.rx / want.rx, s).toBeLessThan(1.15);
    }
  });

  it("X3 블러셔가 없으면 없음(null) — 작은 차이를 화장으로 지어내지 않는다", () => {
    const got = extractCheek(BARE.im, blushImage(undefined, 0, 8), LMS);
    expect(got.R).toBeNull();
    expect(got.L).toBeNull();
    expect(BLUSH_EXTRACT.minDeltaE).toBeGreaterThan(0);
  });

  it("X5 AI 사진이 닿지 않는 빈칸(투명 — 맞춰 넣고 남은 바깥)은 화장으로 안 본다", () => {
    const made = blushImage(undefined, 0);   // 화장 없음
    // 사진 왼쪽 볼 쪽 절반을 빈칸으로 (검정 · 투명)
    for (let y = 0; y < made.h; y++) for (let x = 0; x < 200; x++) { const i = (y * made.w + x) * 4; made.data[i] = 0; made.data[i + 1] = 0; made.data[i + 2] = 0; made.data[i + 3] = 0; }
    const got = extractCheek(BARE.im, made, LMS);
    expect(got.R).toBeNull();
    expect(got.L).toBeNull();
  });

  it("X4 진하기(가장 진한 곳 색 차)도 같이 알려 준다 — 진할수록 크다", () => {
    const light = extractCheek(BARE.im, blushImage(undefined, 0.2), LMS).R!, deep = extractCheek(BARE.im, blushImage(undefined, 0.45), LMS).R!;
    expect(deep.peakDeltaE).toBeGreaterThan(light.peakDeltaE);
  });
});

// ---------- 모든 부위 (extractAll) ----------
// 진짜 같은 맨얼굴(속눈썹 · 흰자 · 눈썹 털) 위에 부위 하나씩 칠해서 떼면 그 부위로 돌아오나. 다른 부위는 비어 있어야 한다
import { EXTRACT, extractAll, type ExtractPart } from "@core/makeup-extract";
import { deltaE, labAt, pointInPoly, type RgbaImage } from "@core/color";
import { LM } from "@core/landmarks";
import { browPaint, eyeballPaint, eyeOf, INK, lipPaint, linerPaint, naturalPaint, regionPaint, SHADE, P, type Paint } from "./helpers/synth-face";

describe("화장 떼기 — 모든 부위", () => {
  const nat = (extra?: Paint) => image((x, y) => extra?.(x, y) ?? naturalPaint(x, y));
  const bare = nat();
  const count = (r: ReturnType<typeof extractAll>, part: ExtractPart) => r.parts.filter((p) => p.part === part).reduce((s, p) => s + p.count, 0);
  /** 칠한 픽셀 중 그 부위로 뗀 비율. visible: 맨얼굴과 색이 확실히 다른(ΔE ≥ 15) 픽셀만 — 원래 속눈썹 위에 칠한 까만 선은 사진으로 못 가른다 */
  const recall = (r: ReturnType<typeof extractAll>, part: ExtractPart, painted: Paint, visible?: { bare: RgbaImage; made: RgbaImage }) => {
    let n = 0, hit = 0;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!painted(x, y)) continue;
      if (visible && deltaE(labAt(visible.bare, x, y), labAt(visible.made, x, y)) < 15) continue;
      n++;
      if (r.parts.some((p) => p.part === part && p.mask[y * r.w + x])) hit++;
    }
    return n ? hit / n : 0;
  };
  const others = (r: ReturnType<typeof extractAll>, part: ExtractPart) => r.parts.filter((p) => p.part !== part).reduce((s, p) => s + p.count, 0);

  it("X10 화장이 없으면 어느 부위도 안 뗀다 — 속눈썹 · 눈썹 털을 화장으로 지어내지 않는다", () => {
    const r = extractAll(bare, nat(), LMS);
    expect(r.parts.reduce((s, p) => s + p.count, 0)).toBe(0);
  });

  it("X11 입술", () => {
    const r = extractAll(bare, nat(lipPaint), LMS);
    expect(recall(r, "lip", lipPaint)).toBeGreaterThan(0.85);
    expect(others(r, "lip")).toBeLessThan(count(r, "lip") * 0.1);
  });

  it("X12 눈썹 — 맨얼굴 눈썹 털 위에 칠한 것", () => {
    const r = extractAll(bare, nat(browPaint), LMS);
    expect(recall(r, "brow", browPaint)).toBeGreaterThan(0.8);
    expect(others(r, "brow")).toBeLessThan(count(r, "brow") * 0.1);
  });

  it("X13 아이라이너 — 속눈썹 선 위 어두운 선, 꼬리까지 · 섀도로 안 본다 (원래 속눈썹과 겹친 자리는 못 가른다 — 보이는 선만)", () => {
    const liner = linerPaint(), m = nat(liner);
    const r = extractAll(bare, m, LMS);
    expect(recall(r, "liner", liner, { bare, made: m })).toBeGreaterThan(0.85);
    // 원래 속눈썹 위에 겹친 선도 더 어두워졌으면 라이너 — 라이너는 진하기 비율이 아니라 '어두운 선' 으로 가른다
    expect(recall(r, "liner", liner)).toBeGreaterThan(0.9);
    expect(count(r, "shadow")).toBeLessThan(count(r, "liner") * 0.2);
  });

  it("X14 아이섀도 — 눈꺼풀 ~ 눈썹 사이 · 눈알(흰자)은 안 건드린다", () => {
    const shadow = regionPaint("shadow", SHADE);
    const r = extractAll(bare, nat(shadow), LMS);
    expect(recall(r, "shadow", shadow) + recall(r, "liner", shadow)).toBeGreaterThan(0.7);
    // 섀도 색은 어둡지 않다 — 속눈썹 선 위 띠라도 라이너로 가져가지 않는다
    expect(count(r, "liner")).toBeLessThan(count(r, "shadow") * 0.1);
    // 눈알 자리는 어느 부위에도 안 들어간다
    for (const eye of [LM.eyeA, LM.eyeB]) {
      const open = [...eye.upper.map(P), ...[...eye.lower].reverse().map(P)];
      const c = { x: open.reduce((s, p) => s + p.x, 0) / open.length, y: open.reduce((s, p) => s + p.y, 0) / open.length };
      expect(pointInPoly(c.x, c.y, open)).toBe(true);
      expect(r.parts.some((p) => p.mask[Math.round(c.y) * r.w + Math.round(c.x)])).toBe(false);
    }
  });

  it("X17 띠보다 두꺼운 라이너(속눈썹 선에서 위로 16px)도 위쪽까지 라이너 — 아주 어두운 픽셀은 섀도로 안 본다", () => {
    const thick: Paint = (x, y) => {
      for (const s of ["R", "L"] as const) {
        const lid = eyeOf(s).upper.map(P), near = lid.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b)), xs = lid.map((p) => p.x);
        if (x >= Math.min(...xs) && x <= Math.max(...xs) && y <= near.y - 1 && y >= near.y - 16) return INK;
      }
      return null;
    };
    const r = extractAll(bare, nat(thick), LMS);
    expect(count(r, "liner")).toBeGreaterThan(1500);
    expect(count(r, "shadow")).toBeLessThan(count(r, "liner") * 0.1);
  });

  it("X16 눈알 색이 바뀌어도(AI 가 렌즈 색 · 시선을 바꿈) 화장으로 안 본다", () => {
    const r = extractAll(bare, nat(eyeballPaint([90, 60, 50])), LMS);
    expect(r.parts.reduce((s, p) => s + p.count, 0)).toBeLessThan(EXTRACT.minPixels * 2);
  });

  it("X15 블러셔도 같이 — 볼 자리", () => {
    const r = extractAll(BARE.im, blushImage(), LMS);
    expect(count(r, "cheek")).toBeGreaterThan(200);
    expect(r.parts.filter((p) => p.part === "cheek").map((p) => p.side).sort()).toEqual(["L", "R"]);
  });
});
