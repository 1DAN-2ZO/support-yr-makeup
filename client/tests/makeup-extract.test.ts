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

  it("X4 진하기(가장 진한 곳 색 차)도 같이 알려 준다 — 진할수록 크다", () => {
    const light = extractCheek(BARE.im, blushImage(undefined, 0.2), LMS).R!, deep = extractCheek(BARE.im, blushImage(undefined, 0.45), LMS).R!;
    expect(deep.peakDeltaE).toBeGreaterThan(light.peakDeltaE);
  });
});
