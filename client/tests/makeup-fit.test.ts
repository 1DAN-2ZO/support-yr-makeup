// 모양 숫자 재기 (2026-10-06 사용자) — 화장 구역(틀)은 고정하고, 틀의 크기 · 위치 숫자만 AI 사진에서 읽는다.
// 픽셀을 오려 내면 실사진에서 조각났다 → 넓게 평균 내서 숫자 몇 개만 정한다. 못 읽으면 기본 틀(템플릿)로 채우고 표시
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import { lookGuide } from "@core/guides";
import { LM } from "@core/landmarks";
import { fitMakeup } from "@core/makeup-fit";
import type { Pt } from "@core/types";
import { BARE, INK, LMS, P, SHADE, SKIN, eyeOf, geomOf, image, naturalPaint, type Paint, type Rgb } from "./helpers/synth-face";

const G = lookGuide({});
const nat = (extra?: Paint) => image((x, y) => extra?.(x, y) ?? naturalPaint(x, y));
const bare = nat();
const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
function ellipseOf(poly: readonly Pt[]) {
  const c = mean(poly), d = poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y)), far = poly[d.indexOf(Math.max(...d))]!;
  return { c, rx: Math.max(...d), ry: Math.min(...d), deg: (Math.atan2(far.y - c.y, far.x - c.x) * 180) / Math.PI };
}
const angleDiff = (a: number, b: number) => { const d = Math.abs(((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const get = (r: ReturnType<typeof fitMakeup>, part: string, side: "R" | "L") => r.find((p) => p.part === part && p.side === side)!;

/** 완성본과 같은 방사형 블러셔 (가이드 타원의 1.3배까지 퍼짐). hole: 구멍 낼 픽셀 (실사진처럼 조각남) */
function blush(hole: (x: number, y: number) => boolean = () => false, alpha = 0.35, color: Rgb = [226, 120, 130]): Paint {
  const ells = (["R", "L"] as const).map((s) => ellipseOf(G("cheek", BARE).regions![s]));
  return (x, y) => {
    if (hole(x, y)) return null;
    let k = 0;
    for (const e of ells) {
      const t = (e.deg * Math.PI) / 180, dx = x - e.c.x, dy = y - e.c.y;
      const u = (dx * Math.cos(t) + dy * Math.sin(t)) / (e.rx * 1.3), v = (-dx * Math.sin(t) + dy * Math.cos(t)) / (e.ry * 1.3), r = Math.hypot(u, v);
      k = Math.max(k, r >= 1 ? 0 : r <= 0.5 ? 1 - 0.9 * r : (0.55 * (1 - r)) / 0.5);
    }
    if (k <= 0) return null;
    return SKIN.map((c, i) => c * (1 - alpha * k) + color[i]! * alpha * k) as unknown as Rgb;
  };
}

/** 섀도: 윗눈꺼풀 → 눈썹 아랫선 쪽 height 비율까지 */
function shadowTo(height: number): Paint {
  const bands = (["R", "L"] as const).map((s) => {
    const lid = eyeOf(s).upper.map(P), bl = (s === "R" ? LM.browA : LM.browB).lower.map(P);
    const top = lid.map((p, i) => mix(p, bl[Math.round((i / (lid.length - 1)) * (bl.length - 1))]!, height));
    return [...lid, ...top.reverse()];
  });
  return (x, y) => (bands.some((b) => pointInPoly(x, y, b)) ? (SKIN.map((c, i) => c * 0.5 + SHADE[i]! * 0.5) as unknown as Rgb) : null);
}

describe("모양 숫자 재기 — 블러셔", () => {
  it("F1 볼 타원의 가운데 · 크기 · 기울기를 읽는다", () => {
    const r = fitMakeup(BARE.im, image((x, y) => blush()(x, y) ?? SKIN), LMS, G);
    for (const s of ["R", "L"] as const) {
      const want = ellipseOf(G("cheek", BARE).regions![s]), f = get(r, "cheek", s), got = ellipseOf(f.poly);
      expect(f.fromPhoto, s).toBe(true);
      expect(Math.hypot(got.c.x - want.c.x, got.c.y - want.c.y), `${s} 가운데`).toBeLessThan(5);
      expect(got.rx / want.rx, `${s} 긴 반지름`).toBeGreaterThan(0.8);
      expect(got.rx / want.rx, `${s} 긴 반지름`).toBeLessThan(1.2);
      expect(angleDiff(got.deg, want.deg), `${s} 기울기`).toBeLessThan(12);
    }
  });

  it("F2 3분의 1이 구멍 나도(실사진처럼 조각남) 같은 타원", () => {
    const hole = (x: number, y: number) => ((x >> 3) + (y >> 3)) % 3 === 0;
    const r = fitMakeup(BARE.im, image((x, y) => blush(hole)(x, y) ?? SKIN), LMS, G);
    for (const s of ["R", "L"] as const) {
      const want = ellipseOf(G("cheek", BARE).regions![s]), got = ellipseOf(get(r, "cheek", s).poly);
      expect(get(r, "cheek", s).fromPhoto, s).toBe(true);
      expect(Math.hypot(got.c.x - want.c.x, got.c.y - want.c.y), s).toBeLessThan(6);
      expect(got.rx / want.rx, s).toBeGreaterThan(0.75);
      expect(got.rx / want.rx, s).toBeLessThan(1.25);
    }
  });

  it("F8 볼 자리 가장자리에 어두운 줄(AI 가 바꾼 턱선 경계)이 있어도 같은 타원 — 아주 어두운 픽셀은 블러셔가 아니다", () => {
    // 사진 왼쪽 볼 바깥쪽 · 오른쪽 볼 바깥쪽에 세로로 4px 어두운 줄
    const stripe = (x: number, y: number): Rgb | null => ((x >= 124 && x < 128) || (x >= 472 && x < 476)) && y > 290 && y < 400 ? [40, 30, 30] : null;
    const r = fitMakeup(BARE.im, image((x, y) => stripe(x, y) ?? blush()(x, y) ?? SKIN), LMS, G);
    for (const s of ["R", "L"] as const) {
      const want = ellipseOf(G("cheek", BARE).regions![s]), got = ellipseOf(get(r, "cheek", s).poly);
      expect(get(r, "cheek", s).fromPhoto, s).toBe(true);
      expect(Math.hypot(got.c.x - want.c.x, got.c.y - want.c.y), s).toBeLessThan(5);
      expect(got.rx / want.rx, s).toBeLessThan(1.2);
    }
  });

  it("F10 얼굴 옆선이 누렇게 바뀌면(AI 가 바꾼 윤곽 · 톤) 블러셔로 안 읽는다 — 블러셔 증거는 '붉어짐'", () => {
    // 사진 오른쪽 볼 아래 옆선을 따라 세로로 긴 누런 띠 — 색은 바뀌었지만 붉어진 게 아니다. 블러셔와는 안 겹치게
    const strip = (x: number, y: number): Rgb | null => (x >= 462 && x < 478 && y > 372 && y < 420 ? [214, 182, 100] : null);
    const r = fitMakeup(BARE.im, image((x, y) => strip(x, y) ?? blush()(x, y) ?? SKIN), LMS, G);
    const want = ellipseOf(G("cheek", BARE).regions!.L), got = ellipseOf(get(r, "cheek", "L").poly);
    // 가짜 블러셔는 기본 틀 자리에 칠했다 — 기본 틀로 돌아가도 같은 타원이라, 사진에서 읽었는지도 본다
    expect(get(r, "cheek", "L").fromPhoto).toBe(true);
    expect(Math.hypot(got.c.x - want.c.x, got.c.y - want.c.y)).toBeLessThan(6);
    expect(got.rx / want.rx).toBeLessThan(1.25);
    expect(got.ry / got.rx, "세로로 긴 줄이 아니다").toBeGreaterThan(0.4);
  });

  it("F13 붉은 세로 줄만 있으면(블러셔 모양이 아님) 못 읽음 — 기본 틀", () => {
    const red = (x: number, y: number): Rgb | null => (x >= 455 && x < 470 && y > 280 && y < 420 ? [226, 130, 135] : null);
    const r = fitMakeup(BARE.im, image((x, y) => red(x, y) ?? SKIN), LMS, G);
    expect(get(r, "cheek", "L").fromPhoto).toBe(false);
  });

  it("F3 블러셔가 없으면 기본 틀(템플릿 타원) — 사진에서 못 읽음으로 표시", () => {
    const r = fitMakeup(bare, nat(), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "cheek", s);
      expect(f.fromPhoto).toBe(false);
      expect(f.poly).toEqual(G("cheek", BARE).regions![s]);
    }
  });
});

describe("모양 숫자 재기 — 아이섀도", () => {
  it("F4 눈꺼풀 → 눈썹 쪽 몇 %까지 칠했는지 읽는다 (40% · 80%)", () => {
    for (const h of [0.4, 0.8]) {
      const r = fitMakeup(bare, nat(shadowTo(h)), LMS, G);
      for (const s of ["R", "L"] as const) {
        const f = get(r, "shadow", s);
        expect(f.fromPhoto, `${h} ${s}`).toBe(true);
        expect(Math.abs(f.params.height! - h), `${h} ${s} 높이 ${f.params.height}`).toBeLessThan(0.1);
      }
    }
  });

  it("F11 AI 가 눈썹을 아래로 두껍게 바꿔도 섀도 높이는 섀도만 — 눈썹 둘레는 안 본다", () => {
    // 눈썹 아랫선에서 아래로 12px 더 진한 눈썹 — 섀도 띠에 붙는다 (실사진: 옅은 눈썹 → AI 가 진하고 두껍게)
    const thickBrow: Paint = (x, y) => {
      for (const b of [LM.browA, LM.browB]) {
        const poly = [...b.upper.map(P), ...[...b.lower].reverse().map((i) => ({ x: P(i).x, y: P(i).y + 12 }))];
        if (pointInPoly(x, y, poly)) return [80, 55, 45];
      }
      return null;
    };
    const r = fitMakeup(bare, nat((x, y) => thickBrow(x, y) ?? shadowTo(0.4)(x, y)), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "shadow", s);
      expect(Math.abs(f.params.height! - 0.4), `${s} 높이 ${f.params.height}`).toBeLessThan(0.12);
    }
  });

  it("F5 섀도가 없으면 기본 틀", () => {
    const r = fitMakeup(bare, nat(), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "shadow", s);
      expect(f.fromPhoto).toBe(false);
      expect(f.poly).toEqual(G("shadow", BARE).regions![s]);
    }
  });
});

describe("모양 숫자 재기 — 아이라이너", () => {
  /** 점 (x, y) 와 선분 a-b 사이 거리 */
  const nearSeg = (x: number, y: number, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  /** 속눈썹 선 위 5px 두께 + 꼬리 끝(눈꼬리에서 바깥 · 위로). upto: 눈꼬리부터 윗눈꺼풀 점 몇 개까지 칠할지 (9 = 눈머리까지) */
  function linerWith(tip: Record<"R" | "L", Pt>, upto = 9): Paint {
    const paths = (["R", "L"] as const).map((s) => [...eyeOf(s).upper.slice(0, upto).map(P).reverse(), tip[s]]);
    return (x, y) => {
      for (const path of paths) for (let i = 1; i < path.length; i++) {
        const a = { x: path[i - 1]!.x, y: path[i - 1]!.y - 3 }, b = { x: path[i]!.x, y: path[i]!.y - 3 };
        if (nearSeg(x, y, a, b) <= 2.5) return INK;
      }
      return null;
    };
  }
  const tips = { R: { x: P(LM.eyeA.outer).x - 22, y: P(LM.eyeA.outer).y - 10 }, L: { x: P(LM.eyeB.outer).x + 22, y: P(LM.eyeB.outer).y - 10 } };

  it("F6 꼬리 끝 자리를 읽는다", () => {
    const r = fitMakeup(bare, nat(linerWith(tips)), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "liner", s);
      expect(f.fromPhoto, s).toBe(true);
      expect(Math.hypot(f.params.tipX! - tips[s].x, f.params.tipY! - (tips[s].y - 3)), `${s} 꼬리 끝 (${f.params.tipX}, ${f.params.tipY})`).toBeLessThan(5);
      expect(f.poly.some((p) => Math.hypot(p.x - tips[s].x, p.y - (tips[s].y - 3)) < 6), `${s} 테두리가 꼬리 끝까지`).toBe(true);
    }
  });

  it("F9 꼬리가 중간에 조금(2px) 끊겨도 끝까지 읽는다 — AI 그림은 꼬리가 흐리게 끊기기도 한다", () => {
    const base = linerWith(tips);
    // 눈꼬리에서 바깥으로 10~12px 사이를 비운다
    const broken: Paint = (x, y) => {
      const R = P(LM.eyeA.outer), L = P(LM.eyeB.outer);
      if ((x <= R.x - 10 && x > R.x - 12) || (x >= L.x + 10 && x < L.x + 12)) return null;
      return base(x, y);
    };
    const r = fitMakeup(bare, nat(broken), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "liner", s);
      expect(Math.hypot(f.params.tipX! - tips[s].x, f.params.tipY! - (tips[s].y - 3)), s).toBeLessThan(5);
    }
  });

  it("F14 눈 가운데부터 시작하는 라이너 + 꼬리 위로 뻗은 바깥 속눈썹 가닥 — 시작점과 꼬리 끝을 진짜 라이너 자리로", () => {
    // 라이너: 윗눈꺼풀 가운데(9점 중 5번째) → 눈꼬리 → 꼬리 끝. 속눈썹 가닥: 눈꼬리 라이너 윗선에 붙어서 바깥 · 위로 30° 40px (1px 굵기) —
    // 꼬리(약 24°)보다 조금 가팔라서 처음 몇 px 은 꼬리와 붙어 있다가 갈라진다
    const half = linerWith(tips, 5);
    const withLash: Paint = (x, y) => {
      for (const [o, sgn] of [[P(LM.eyeA.outer), -1], [P(LM.eyeB.outer), 1]] as const) {
        const a = { x: o.x, y: o.y - 5 }, b = { x: o.x + sgn * 40 * Math.cos(Math.PI / 6), y: o.y - 5 - 40 * Math.sin(Math.PI / 6) };
        if (nearSeg(x, y, a, b) <= 0.6) return INK;
      }
      return half(x, y);
    };
    const r = fitMakeup(bare, nat(withLash), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "liner", s);
      expect(f.fromPhoto, s).toBe(true);
      expect(Math.hypot(f.params.tipX! - tips[s].x, f.params.tipY! - (tips[s].y - 3)), `${s} 꼬리 끝 (${f.params.tipX?.toFixed(0)}, ${f.params.tipY?.toFixed(0)})`).toBeLessThan(5);
      expectStartsMidLid(f, s);
    }
  });

  /** 테두리가 윗눈꺼풀 가운데 점(9점 중 5번째)까지는 오고, 눈머리 쪽(눈 폭 25% 안)은 비어 있다 */
  function expectStartsMidLid(f: ReturnType<typeof get>, s: "R" | "L") {
    const eye = eyeOf(s), inner = P(eye.inner), mid = P(eye.upper[4]!), ew = Math.hypot(P(eye.outer).x - inner.x, P(eye.outer).y - inner.y);
    const nearestToInner = Math.min(...f.poly.map((p) => Math.hypot(p.x - inner.x, p.y - inner.y)));
    expect(nearestToInner / ew, `${s} 눈머리 쪽은 비어 있어야 (가장 가까운 점 ${(nearestToInner / ew).toFixed(2)} 눈 폭)`).toBeGreaterThan(0.25);
    const nearestToMid = Math.min(...f.poly.map((p) => Math.hypot(p.x - mid.x, p.y - mid.y)));
    expect(nearestToMid, `${s} 가운데 점까지 와야 (가장 가까운 점 ${nearestToMid.toFixed(1)}px)`).toBeLessThan(4);
  }

  it("F16 라이너 중간이 조금(4px) 끊겨도 시작점은 진짜 시작 — AI 그림은 선이 흐리게 끊기기도 한다", () => {
    const half = linerWith(tips, 5);
    const xs = (["R", "L"] as const).map((s) => P(eyeOf(s).upper[2]!).x);
    const broken: Paint = (x, y) => (xs.some((c) => Math.abs(x - c) < 2) ? null : half(x, y));
    const r = fitMakeup(bare, nat(broken), LMS, G);
    for (const s of ["R", "L"] as const) expectStartsMidLid(get(r, "liner", s), s);
  });

  it("F17 눈머리 근처에 떨어진 어두운 점은 라이너 시작이 아니다 — 시작점은 선이 끊긴 자리", () => {
    const half = linerWith(tips, 5);
    const dots = (["R", "L"] as const).map((s) => { const p = P(eyeOf(s).upper[7]!); return { x: p.x, y: p.y - 3 }; });
    const dotted: Paint = (x, y) => (dots.some((d) => Math.hypot(x - d.x, y - d.y) <= 2.5) ? INK : half(x, y));
    const r = fitMakeup(bare, nat(dotted), LMS, G);
    for (const s of ["R", "L"] as const) expectStartsMidLid(get(r, "liner", s), s);
  });

  it("F15 꼬리 끝에 붙은 진한 섀도 덩어리는 꼬리가 아니다 — 선이 아니라 넓은 덩어리면 거기서 꼬리 끝", () => {
    const base = linerWith(tips);
    // 꼬리 끝 바깥 · 위에 진한 타원 (가로 반지름 10, 세로 9) — 꼬리 끝 근처에서 꼬리와 겹친다
    const blob: Paint = (x, y) => {
      for (const [o, sgn] of [[P(LM.eyeA.outer), -1], [P(LM.eyeB.outer), 1]] as const) {
        const cx = o.x + sgn * 28, cy = o.y - 20;
        if (((x - cx) / 10) ** 2 + ((y - cy) / 9) ** 2 <= 1) return INK;
      }
      return base(x, y);
    };
    const r = fitMakeup(bare, nat(blob), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "liner", s);
      expect(Math.hypot(f.params.tipX! - tips[s].x, f.params.tipY! - (tips[s].y - 3)), `${s} 꼬리 끝 (${f.params.tipX?.toFixed(0)}, ${f.params.tipY?.toFixed(0)})`).toBeLessThan(5);
    }
  });

  it("F7 라이너가 없으면 기본 틀 (가이드 꼬리)", () => {
    const r = fitMakeup(bare, nat(), LMS, G);
    for (const s of ["R", "L"] as const) {
      const f = get(r, "liner", s);
      expect(f.fromPhoto).toBe(false);
      const [, end] = geomOf("liner").liner ? G("liner", BARE).liner!.wing[s] : [null, null];
      expect(f.poly.some((p) => Math.hypot(p.x - end!.x, p.y - end!.y) < 3)).toBe(true);
    }
  });
});
