/**
 * 부위 가이드 모양 (2026-10-07) — 부위별 화장 영역(makeup-extract PartMask)에서 숫자 몇 개만 읽고, 모양은 얼굴 점 위에 단순하게 그린다.
 * 화장 영역 테두리를 그대로 따면 울퉁불퉁하고 양쪽이 달라 믿음이 안 간다 (사용자 캡처 2026-10-07) →
 *  - 양쪽 같게: 좌우 숫자를 거울로 맞춰 평균 내고(한쪽만 잡히면 그쪽 숫자로), 같은 모양을 각자 눈 · 볼 자리에 놓는다.
 *    숫자는 그쪽 눈꼬리를 원점으로 한 눈 좌표(바깥 방향 s · 위 v, 눈 폭 단위) — 좌우가 거울처럼 맞는다
 *  - 단순하게:
 *    입술: 얼굴 점 입술선 그대로 (벌린 입이면 윗입술 · 아랫입술). 입술 화장이 잡혔을 때만
 *    눈썹: 원래 눈썹(얼굴 점)을 위 · 아래로 같은 두께만큼 넓힌다 (화장 영역이 눈썹선 밖으로 나간 정도의 중앙값 — 털 톱니는 무시).
 *      선은 얼굴 점을 그대로 지나는 매끈한 곡선(캣멀-롬) — 모서리 다듬기는 점 5개짜리 선의 양끝을 7px 가까이 깎았다
 *    라이너: 눈머리 → 눈꼬리 윗눈꺼풀 띠는 고정 (앱 기본 두께 GUIDE_PARAMS.liner.thick), 꼬리 끝만 화장 영역이 눈꼬리 밖으로
 *      가장 멀리 간 자리 (사용자 2026-10-07 — 띠 두께를 재니 진한 속눈썹까지 잡혀 눈을 감싸는 렌즈가 됐다)
 *    섀도: 라이너 윗선에서 시작해 겹치지 않게, 높이 하나(라이너 윗선 위 화장 영역 높이의 중앙값)로 라이너 윗선을 따라가는 띠 —
 *      양 끝은 라이너 윗선으로 내려와 닫힌다 (사용자: 엉망 · 라이너와 겹치면 안 된다 — 2차 곡선은 가운데만 솟은 돔이 됐다)
 *    아래 섀도: 아랫눈꺼풀에서 내려간 높이를 매끈한 2차 곡선으로
 *    블러셔: 화장 영역 모멘트 타원
 *  - 쉐딩 · 하이라이트(참고)는 뺀다. clip 밖 픽셀(klein 이면 얼굴 윤곽 0.9 밖 — 원본에 되붙인 경계 차이)도 뺀다.
 */

import { pointInPoly } from "./color";
import { GUIDE_PARAMS } from "./guides";
import { LM } from "./landmarks";
import type { ExtractPart, PartMask } from "./makeup-extract";
import { maskOutlines } from "./region-outline";
import type { Side } from "./score";
import type { Pt } from "./types";

/** 속입술 — 왼쪽 입꼬리(78) → 위(13) → 오른쪽(308) → 아래(14) */
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95] as const;

export interface PartGuide {
  part: ExtractPart;
  side: PartMask["side"];
  /** 닫힌 테두리들 */
  polys: Pt[][];
  /** 그쪽 화장 영역 픽셀 수 (반대쪽을 거울로 받았으면 0) */
  count: number;
  /** landmark: 얼굴 점 선 · mixed: 얼굴 점 + 화장 영역 숫자 · region: 화장 영역 숫자 */
  from: "landmark" | "mixed" | "region";
}

/**
 * mouthOpen: 속입술 위아래가 입 폭의 이 비율 넘게 벌어지면 벌린 입 · profileN: 섀도 높이를 잴 눈꺼풀 칸 수 ·
 * shadowMax · underMax · browMax: 높이 · 두께를 찾을 거리(눈 폭) · minH: 이보다 낮은 칸은 섀도 없음 ·
 * wingMin: 눈꼬리 밖으로 이만큼 넘어야 꼬리 ·
 * taper: 섀도 양 끝에서 이 비율 구간 동안 눈꺼풀로 내려온다. 눈대중 시작값
 */
export const PART_GUIDE = {
  mouthOpen: 0.06, profileN: 24, shadowMax: 1.0, underMax: 0.6, browMax: 0.4, minH: 0.03,
  wingMin: 0.03, taper: 0.2,
} as const;

type SV = { s: number; v: number };
interface EyeFrame { o: Pt; out: Pt; up: Pt; ew: number; from: (q: SV) => Pt; to: (p: Pt) => SV }

export function partGuides(parts: readonly PartMask[], lm: readonly Pt[], w: number, h: number, opts: { clip?: readonly Pt[] } = {}): PartGuide[] {
  const P = (i: number): Pt => lm[i]!;
  const masks = new Map<string, { m: Uint8Array; count: number }>();
  for (const p of parts) {
    if (p.part === "contour" || p.part === "highlight" || !p.count) continue;
    let m = p.mask;
    if (opts.clip) {
      m = m.slice();
      for (let i = 0; i < m.length; i++) if (m[i] && !pointInPoly(i % w, Math.floor(i / w), opts.clip)) m[i] = 0;
    }
    masks.set(`${p.part}:${p.side ?? ""}`, { m, count: p.count });
  }
  const at = (m: Uint8Array) => (q: Pt) => {
    const x = Math.round(q.x), y = Math.round(q.y);
    return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  };
  const F = { R: eyeFrame(lm, "R"), L: eyeFrame(lm, "L") };
  const out: PartGuide[] = [];
  /** 좌우 숫자 읽기 → 거울 평균 (한쪽만이면 그쪽) → 각자 자리에 같은 모양 */
  function both<T>(part: ExtractPart, read: (inside: (q: Pt) => boolean, f: EyeFrame, side: Side, m: Uint8Array) => T | null, avg: (a: T, b: T) => T, draw: (v: T, f: EyeFrame, side: Side) => Pt[], from: PartGuide["from"]): void {
    const got = (["R", "L"] as const).map((s) => { const e = masks.get(`${part}:${s}`); return e ? read(at(e.m), F[s], s, e.m) : null; });
    const v = got[0] && got[1] ? avg(got[0], got[1]) : got[0] ?? got[1];
    if (!v) return;
    for (const s of ["R", "L"] as const) {
      const poly = draw(v, F[s], s);
      if (poly.length >= 3) out.push({ part, side: s, polys: [poly], count: masks.get(`${part}:${s}`)?.count ?? 0, from });
    }
  }

  const lip = masks.get("lip:");
  if (lip) out.push({ part: "lip", side: null, polys: lipShapes(lm), count: lip.count, from: "landmark" });

  // 눈썹: 위 · 아래 넓힐 두께
  const browLines = (s: Side) => { const b = s === "R" ? LM.browA : LM.browB; return { up: b.upper.map(P), lo: b.lower.map(P) }; };
  both("brow", (inside, f, s) => {
    const { up, lo } = browLines(s);
    const dU = median(samples(up, 9).map((p) => reach(inside, p, f.up, PART_GUIDE.browMax * f.ew))) / f.ew;
    const dL = median(samples(lo, 9).map((p) => reach(inside, p, neg(f.up), PART_GUIDE.browMax * f.ew))) / f.ew;
    return { dU, dL };
  }, (a, b) => ({ dU: (a.dU + b.dU) / 2, dL: (a.dL + b.dL) / 2 }), ({ dU, dL }, f, s) => {
    const { up, lo } = browLines(s);
    return [...spline(up.map((p) => add(p, f.up, dU * f.ew))), ...spline([...lo].reverse().map((p) => add(p, f.up, -dL * f.ew)))];
  }, "mixed");

  // 눈꺼풀 선 (눈머리 → 눈꼬리) — 얼굴 점을 지나는 매끈한 곡선. 꺾은선 그대로 띄우면 꺾인 데가 섀도 윗선에 도드라졌다 (시험 S3)
  const lidOf = (s: Side, upper: boolean) => { const e = s === "R" ? LM.eyeA : LM.eyeB; return spline([...(upper ? e.upper : e.lower)].reverse().map(P)); };

  // 라이너: 띠는 고정, 꼬리 끝만 (눈 좌표)
  const linerPoly: Partial<Record<Side, Pt[]>> = {};
  const hasLiner = masks.has("liner:R") || masks.has("liner:L");
  const linerT = (f: EyeFrame) => (hasLiner ? GUIDE_PARAMS.liner.thick * f.ew : 0);
  both("liner", (inside, f) => {
    const R = Math.ceil(f.ew), cand: SV[] = [];
    for (let y = Math.floor(f.o.y - R); y <= f.o.y + R; y++) for (let x = Math.floor(f.o.x - R); x <= f.o.x + R; x++) {
      if (!inside({ x, y })) continue;
      const q = f.to({ x, y });
      if (q.s >= PART_GUIDE.wingMin && Math.abs(q.v) < 0.5) cand.push(q);
    }
    if (!cand.length) return { tip: null as SV | null };
    // 가장 먼 자리 + 그 둘레 높이 평균 — 끝 한 픽셀에 덜 흔들린다
    const sMax = Math.max(...cand.map((q) => q.s)), near = cand.filter((q) => q.s >= sMax - 0.03);
    return { tip: { s: sMax, v: near.reduce((a, q) => a + q.v, 0) / near.length } as SV | null };
  }, (a, b) => ({ tip: a.tip && b.tip ? { s: (a.tip.s + b.tip.s) / 2, v: (a.tip.v + b.tip.v) / 2 } : a.tip ?? b.tip }),
  ({ tip }, f, s) => (linerPoly[s] = linerShape(lidOf(s, true), linerT(f), tip ? f.from(tip) : null, f)), "mixed");

  // 섀도: 라이너 윗선(라이너가 없으면 눈꺼풀)에서 올라간 높이 하나
  const shadowBase = (s: Side, f: EyeFrame) => samples(offsetLine(lidOf(s, true), linerT(f), f.up), PART_GUIDE.profileN + 1);
  both("shadow", (inside, f, s) => {
    const base = shadowBase(s, f), nrm = normals(base, f.up);
    return base.map((p, i) => reach(inside, p, nrm[i]!, PART_GUIDE.shadowMax * f.ew) / f.ew);
  }, (a, b) => a.map((x, i) => (x + b[i]!) / 2), (prof, f, s) => {
    const on = prof.map((x) => x >= PART_GUIDE.minH), i0 = on.indexOf(true), i1 = on.lastIndexOf(true);
    if (i0 < 0 || i1 <= i0) return [];
    // 높이는 가운데 60% 칸에서 — 양 끝 칸은 영역 밖으로 일찍 빠져 낮게 재진다
    const m0 = i0 + Math.floor((i1 - i0) * 0.2), m1 = i1 - Math.floor((i1 - i0) * 0.2);
    const H = median(prof.slice(m0, m1 + 1).filter((x) => x >= PART_GUIDE.minH)) * f.ew;
    const t = prof.map((_, i) => i / PART_GUIDE.profileN).slice(i0, i1 + 1), span = t[t.length - 1]! - t[0]!;
    const taper = (x: number) => { const u = Math.min(x - t[0]!, t[t.length - 1]! - x) / (PART_GUIDE.taper * span); return u >= 1 ? 1 : u <= 0 ? 0 : u * u * (3 - 2 * u); };
    const all = shadowBase(s, f), nrmAll = normals(all, f.up), liner = linerPoly[s];
    // 라이너 꼬리 쪽은 윗선을 볼록하게 이어 띠보다 높다 — 그 안에 든 아랫선 점은 라이너 밖으로 밀어 올린다
    const base = all.slice(i0, i1 + 1).map((p, i) => (liner ? pushOut(p, nrmAll[i0 + i]!, liner) : p)), nrm = nrmAll.slice(i0, i1 + 1);
    return [...base, ...base.map((p, i) => add(p, nrm[i]!, H * taper(t[i]!))).reverse()];
  }, "mixed");

  // 아래 섀도: 아랫눈꺼풀에서 내려간 높이 → 2차 곡선
  for (const [part, upper, maxH] of [["underShadow", false, PART_GUIDE.underMax]] as const) {
    both(part, (inside, f, s) => {
      const dir = upper ? f.up : neg(f.up);
      return samples(lidOf(s, upper), PART_GUIDE.profileN + 1).map((p) => reach(inside, p, dir, maxH * f.ew) / f.ew);
    }, (a, b) => a.map((x, i) => (x + b[i]!) / 2), (prof, f, s) => {
      const ts = prof.map((_, i) => i / PART_GUIDE.profileN), on = prof.map((x) => x >= PART_GUIDE.minH);
      const i0 = on.indexOf(true), i1 = on.lastIndexOf(true);
      if (i0 < 0 || i1 <= i0) return [];
      const t = ts.slice(i0, i1 + 1), fit = quadFit(t, prof.slice(i0, i1 + 1));
      // 양 끝은 눈꺼풀로 부드럽게 내려와 닫힌다 (초승달) — 그대로 두면 양 끝이 세로로 끊긴 네모였다 (실사진)
      const span = t[t.length - 1]! - t[0]!, taper = (x: number) => { const u = Math.min(x - t[0]!, t[t.length - 1]! - x) / (PART_GUIDE.taper * span); return u >= 1 ? 1 : u <= 0 ? 0 : u * u * (3 - 2 * u); };
      const dir = upper ? f.up : neg(f.up), lid = samples(lidOf(s, upper), PART_GUIDE.profileN + 1).slice(i0, i1 + 1);
      return [...lid, ...lid.map((p, i) => add(p, dir, Math.max(0, fit(t[i]!)) * taper(t[i]!) * f.ew)).reverse()];
    }, "mixed");
  }

  // 블러셔: 모멘트 타원 (눈 좌표)
  // 가장 큰 덩어리만 — 흩어진 작은 점(반짝이)까지 넣으니 눈부터 입까지 긴 타원이 됐다 (실사진)
  both("cheek", (_inside, f, _s, m) => {
    const main = maskOutlines(m, w, h, { close: Math.max(1, Math.round(f.ew * 0.06)) })[0];
    if (!main) return null;
    const xs = main.map((p) => p.x), ys = main.map((p) => p.y), pts: SV[] = [];
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (pointInPoly(x, y, main)) pts.push(f.to({ x, y }));
    }
    return pts.length >= 10 ? ellipseOf(pts) : null;
  }, (a, b) => ({ cs: (a.cs + b.cs) / 2, cv: (a.cv + b.cv) / 2, rx: (a.rx + b.rx) / 2, ry: (a.ry + b.ry) / 2, ang: (a.ang + b.ang) / 2 }), (e, f) =>
    Array.from({ length: 64 }, (_, k) => {
      const t = (2 * Math.PI * k) / 64, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t);
      return f.from({ s: e.cs + x * Math.cos(e.ang) - y * Math.sin(e.ang), v: e.cv + x * Math.sin(e.ang) + y * Math.cos(e.ang) });
    }), "region");

  // 그 밖 부위 (있다면) — 화장 영역 테두리 그대로
  for (const [k, e] of masks) {
    const [part, side] = k.split(":") as [ExtractPart, string];
    if (["lip", "brow", "shadow", "underShadow", "liner", "cheek"].includes(part)) continue;
    const polys = maskOutlines(e.m, w, h);
    if (polys.length) out.push({ part, side: (side || null) as PartMask["side"], polys, count: e.count, from: "region" });
  }
  return out;
}

/** 입술선 — 다문 입이면 바깥선 하나, 벌린 입이면 [윗입술, 아랫입술] */
export function lipShapes(lm: readonly Pt[]): Pt[][] {
  const outer = LM.lipsOuter.map((i) => lm[i]!), inner = LIPS_INNER.map((i) => lm[i]!);
  const width = Math.hypot(outer[0]!.x - outer[10]!.x, outer[0]!.y - outer[10]!.y);
  const gap = Math.hypot(inner[5]!.x - inner[15]!.x, inner[5]!.y - inner[15]!.y);
  if (gap < PART_GUIDE.mouthOpen * width) return [outer];
  // 위: 바깥선 왼쪽 입꼬리 → 위 → 오른쪽, 속선 오른쪽 → 위 → 왼쪽 / 아래: 바깥선 오른쪽 → 아래 → 왼쪽, 속선 왼쪽 → 아래 → 오른쪽
  const upper = [...outer.slice(0, 11), ...inner.slice(0, 11).reverse()];
  const lower = [...outer.slice(10), outer[0]!, inner[0]!, ...inner.slice(10).reverse()];
  return [upper, lower];
}

/** 그쪽 눈꼬리 원점 · 바깥 방향 s · 위 v (눈 폭 단위). 위 방향은 두 눈꼬리 선에 수직 — 좌우가 거울로 맞는다 */
function eyeFrame(lm: readonly Pt[], side: Side): EyeFrame {
  const A = lm[LM.eyeA.outer]!, B = lm[LM.eyeB.outer]!, L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const e = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  let up = { x: e.y, y: -e.x };
  if (up.y > 0) up = neg(up);
  const ew = (Math.hypot(lm[33]!.x - lm[133]!.x, lm[33]!.y - lm[133]!.y) + Math.hypot(lm[263]!.x - lm[362]!.x, lm[263]!.y - lm[362]!.y)) / 2 || 1;
  const o = side === "R" ? A : B, out = side === "R" ? neg(e) : e;
  return {
    o, out, up, ew,
    from: (q) => ({ x: o.x + (out.x * q.s + up.x * q.v) * ew, y: o.y + (out.y * q.s + up.y * q.v) * ew }),
    to: (p) => ({ s: ((p.x - o.x) * out.x + (p.y - o.y) * out.y) / ew, v: ((p.x - o.x) * up.x + (p.y - o.y) * up.y) / ew }),
  };
}

/** 라이너 — [눈머리 → 눈꼬리 눈꺼풀, 꼬리 끝, 윗선 눈꼬리 → 눈머리]. 윗선은 눈꺼풀에 수직으로 띄우고, 꼬리 끝에서 위로 볼록하게만 잇는다 */
function linerShape(lid: readonly Pt[], t: number, tip: Pt | null, f: EyeFrame): Pt[] {
  const top = offsetLine(lid, t, f.up).reverse();
  if (!tip) return [...lid, ...top];
  const chain: Pt[] = [tip];
  for (const p of top) {
    while (chain.length >= 2) {
      const a = f.to(chain[chain.length - 2]!), b = f.to(chain[chain.length - 1]!), c = f.to(p);
      if (Math.abs(c.s - a.s) < 1e-9 || b.v >= a.v + ((c.v - a.v) * (b.s - a.s)) / (c.s - a.s)) break;
      chain.pop();
    }
    chain.push(p);
  }
  return [...lid, ...chain];
}

/** 점 p 에서 방향 d 로 최대 maxPx 까지 — 화장 영역의 가장 먼 픽셀 거리 (없으면 0, 사이가 비어도 더 간다) */
function reach(inside: (q: Pt) => boolean, p: Pt, d: Pt, maxPx: number): number {
  let last = 0;
  for (let k = 0; k <= maxPx; k += 0.5) if (inside(add(p, d, k))) last = k;
  return last;
}

/** 꺾은선 점마다 선에 수직인 방향 (up 쪽) */
function normals(line: readonly Pt[], up: Pt): Pt[] {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    return n.x * up.x + n.y * up.y < 0 ? neg(n) : n;
  });
}

/** 꺾은선을 선에 수직(up 쪽)으로 d 만큼 띄운 선 */
function offsetLine(line: readonly Pt[], d: number, up: Pt): Pt[] {
  const n = normals(line, up);
  return line.map((p, i) => add(p, n[i]!, d));
}

/** 다각형 안에 든 점을 방향 n 으로 밀어 밖으로 (0.25px 씩, 최대 100px) */
function pushOut(p: Pt, n: Pt, poly: readonly Pt[]): Pt {
  let q = p;
  for (let k = 0; k < 400 && pointInPoly(q.x, q.y, poly); k++) q = add(q, n, 0.25);
  return q;
}

/** 꺾은선을 길이 따라 n 점으로 */
function samples(line: readonly Pt[], n: number): Pt[] {
  const seg = line.slice(1).map((b, i) => Math.hypot(b.x - line[i]!.x, b.y - line[i]!.y)), total = seg.reduce((a, b) => a + b, 0) || 1;
  return Array.from({ length: n }, (_, k) => {
    let d = (total * k) / (n - 1), i = 0;
    while (i < seg.length - 1 && d > seg[i]!) { d -= seg[i]!; i++; }
    const a = line[i]!, b = line[i + 1] ?? a, t = seg[i] ? Math.min(1, d / seg[i]!) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

/** 2차 곡선 맞추기 (최소제곱) — 점이 셋 못 되면 평균 */
function quadFit(t: readonly number[], y: readonly number[]): (x: number) => number {
  const n = t.length;
  const mean = y.reduce((a, b) => a + b, 0) / (n || 1);
  if (n < 3) return () => mean;
  const S = (f: (i: number) => number) => t.reduce((a, _, i) => a + f(i), 0);
  const M = [[n, S((i) => t[i]!), S((i) => t[i]! ** 2)], [0, 0, S((i) => t[i]! ** 3)], [0, 0, S((i) => t[i]! ** 4)]];
  M[1]![0] = M[0]![1]!; M[1]![1] = M[0]![2]!; M[2]![0] = M[0]![2]!; M[2]![1] = M[1]![2]!;
  const B = [S((i) => y[i]!), S((i) => t[i]! * y[i]!), S((i) => t[i]! ** 2 * y[i]!)];
  const det = (m: number[][]) => m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) - m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) + m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
  const D = det(M);
  if (Math.abs(D) < 1e-12) return () => mean;
  const c = [0, 1, 2].map((j) => det(M.map((row, r) => row.map((v, k) => (k === j ? B[r]! : v)))) / D);
  return (x) => c[0]! + c[1]! * x + c[2]! * x * x;
}

/** 점들의 모멘트 타원 — 가운데 · 반지름(고르게 찬 타원이면 축 방향 분산 = 반지름² / 4) · 기울기 */
function ellipseOf(pts: readonly SV[]): { cs: number; cv: number; rx: number; ry: number; ang: number } {
  const n = pts.length, cs = pts.reduce((a, p) => a + p.s, 0) / n, cv = pts.reduce((a, p) => a + p.v, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const p of pts) { const dx = p.s - cs, dy = p.v - cv; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  xx /= n; yy /= n; xy /= n;
  const tr = (xx + yy) / 2, d = Math.sqrt(Math.max(0, ((xx - yy) / 2) ** 2 + xy * xy));
  return { cs, cv, rx: 2 * Math.sqrt(tr + d), ry: 2 * Math.sqrt(Math.max(0, tr - d)), ang: 0.5 * Math.atan2(2 * xy, xx - yy) };
}

const neg = (p: Pt): Pt => ({ x: -p.x, y: -p.y });
const add = (a: Pt, d: Pt, k: number): Pt => ({ x: a.x + d.x * k, y: a.y + d.y * k });
const median = (v: readonly number[]): number => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1]! : 0; };

/** 점들을 그대로 지나는 매끈한 열린 곡선 (캣멀-롬, 구간마다 k 칸) */
function spline(p: readonly Pt[], k = 8): Pt[] {
  if (p.length < 3) return [...p];
  const q = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))]!, out: Pt[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = q(i - 1), p1 = q(i), p2 = q(i + 1), p3 = q(i + 2);
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(p[p.length - 1]!);
  return out;
}
