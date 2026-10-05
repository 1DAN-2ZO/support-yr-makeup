/**
 * 퍼지는 방향 표시 — 블러셔 · 섀도우 · 쉐딩은 테두리를 꽉 채우는 게 아니라 진한 곳에서 퍼지게 칠한다 (2026-10-05 사용자).
 * 테두리는 그대로 두고, 안에 시작점(점) + 퍼지는 방향(화살표). 화면 3·4 만 (live-run outlineOf) — 화면 5 결과는 안 그린다(정의서 5-1).
 * 선과 점만, 면 채우기 없음 (정의서 F-07).
 *
 * 방향은 완성본(makeup-paint)이 칠한 그러데이션을 따른다 —
 *  - 블러셔: 가운데가 가장 진하고 사방으로 옅어짐 (방사형) → 타원 가운데 점 + 긴 축 · 짧은 축 네 방향
 *  - 섀도우: 속눈썹 선이 가장 진하고 눈썹 쪽으로 옅어짐 → 속눈썹 선 가운데 점 + 눈썹 쪽 부채꼴 셋
 *  - 쉐딩 · 하이라이트: 띠를 칠하고 번짐 → 띠 가운데 점 + 긴 쪽 양 끝 (둥근 띠면 짧은 쪽도)
 * 화살표 길이 · 위치 비율은 눈대중 시작값 — PC · 폰에서 보고 맞춘다.
 */

import { LM } from "./landmarks";
import type { PartId, Pt } from "./types";

export interface SpreadMarks {
  /** 시작점 (진한 곳) */
  dots: Pt[];
  /** 화살표 [시작, 끝] — 머리는 그릴 때 화면 크기로 붙인다 */
  arrows: Pt[][];
}

/** 화살표가 점에서 떨어져 시작하는 자리 · 끝나는 자리 (점 → 테두리 거리 비율) */
export const SPREAD = { start: 0.2, end: 0.65, shadowDot: 0.15, shadowEnd: 0.8, roundBand: 0.6 } as const;

const NONE: SpreadMarks = { dots: [], arrows: [] };
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const along = (c: Pt, u: Pt, t: number): Pt => ({ x: c.x + u.x * t, y: c.y + u.y * t });

/** 넓이 무게중심 (넓이가 0 에 가까우면 꼭짓점 평균) */
function centroid(poly: readonly Pt[]): Pt {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!, c = p.x * q.y - q.x * p.y;
    a += c; x += (p.x + q.x) * c; y += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  return { x: x / (3 * a), y: y / (3 * a) };
}

/** 꼭짓점 퍼짐의 긴 축 방향 (단위 벡터) */
function majorAxis(poly: readonly Pt[], c: Pt): Pt {
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of poly) { const dx = p.x - c.x, dy = p.y - c.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: Math.cos(th), y: Math.sin(th) };
}

/** c 에서 u 방향으로 다각형 테두리까지 거리. 못 만나면 0 */
function rayToEdge(poly: readonly Pt[], c: Pt, u: Pt): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, ex = b.x - a.x, ey = b.y - a.y;
    const den = u.x * ey - u.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den, s = ((a.x - c.x) * u.y - (a.y - c.y) * u.x) / den;
    if (t > 1e-9 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

/** 가운데에서 사방으로 — 긴 축 양쪽, 짧은 축은 띠가 충분히 둥글 때만 (minorRatio 이상) */
function radial(poly: readonly Pt[], minorRatio: number): SpreadMarks {
  const c = centroid(poly), u = majorAxis(poly, c), v = { x: -u.y, y: u.x };
  const dirs = [u, { x: -u.x, y: -u.y }];
  const major = Math.min(rayToEdge(poly, c, dirs[0]!), rayToEdge(poly, c, dirs[1]!));
  const minor = Math.min(rayToEdge(poly, c, v), rayToEdge(poly, c, { x: -v.x, y: -v.y }));
  if (major > 0 && minor >= minorRatio * major) dirs.push(v, { x: -v.x, y: -v.y });
  const arrows = dirs.map((w) => {
    const r = rayToEdge(poly, c, w);
    return r > 0 ? [along(c, w, SPREAD.start * r), along(c, w, SPREAD.end * r)] : null;
  }).filter((a): a is Pt[] => a !== null);
  return { dots: [c], arrows };
}

/** 섀도 영역 = 눈꺼풀 n 점 + 위 테두리 n 점(거꾸로) (+ 꼬리 두 점) — 속눈썹 선 가운데에서 위 테두리 쪽 부채꼴 */
function shadowFan(poly: readonly Pt[], n: number): SpreadMarks {
  if (poly.length < 2 * n) return NONE;
  const lid = poly.slice(0, n), top = poly.slice(n, 2 * n).reverse();
  const mid = Math.floor(n / 2), dot = mix(lid[mid]!, top[mid]!, SPREAD.shadowDot);
  const arrows = [Math.round((n - 1) * 0.2), mid, Math.round((n - 1) * 0.8)].map((k) => {
    const to = mix(lid[k]!, top[k]!, SPREAD.shadowEnd);
    return [mix(dot, to, SPREAD.start), mix(dot, to, SPREAD.end + 0.2)];
  });
  return { dots: [dot], arrows };
}

export function spreadMarks(partId: PartId, polys: readonly (readonly Pt[])[]): SpreadMarks {
  const each = (f: (p: readonly Pt[]) => SpreadMarks): SpreadMarks => {
    const ms = polys.map(f);
    return { dots: ms.flatMap((m) => m.dots), arrows: ms.flatMap((m) => m.arrows) };
  };
  if (partId === "cheek") return each((p) => radial(p, 0));
  if (partId === "contour") return each((p) => radial(p, SPREAD.roundBand));
  if (partId === "shadow") return each((p) => shadowFan(p, LM.eyeA.upper.length));
  return { dots: [], arrows: [] };
}
