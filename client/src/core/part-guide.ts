/**
 * 부위 가이드 모양 (2026-10-07) — 부위별 화장 영역(makeup-extract PartMask)을 부위마다 알맞은 모양으로 다듬는다.
 * 화장 영역 테두리만 따면(region-outline) 입술은 벌어진 입 사이에서, 눈썹은 털 끝에서 들쭉날쭉했다 (사용자 캡처) —
 * 모서리가 뚜렷한 곳은 얼굴 점이 낫다 (사용자 2026-10-07).
 *  - 입술: 얼굴 점 입술선 그대로 (입을 벌리면 윗입술 · 아랫입술 두 모양). 입술 화장이 잡혔을 때만
 *  - 눈썹: 원래 눈썹(얼굴 점) ∪ 화장 영역(작은 털 톱니는 메우기로 지운 뒤) — AI 가 더 그린 자리까지 덮는다
 *  - 섀도: 화장 영역, 아래쪽은 윗눈꺼풀 선까지만
 *  - 블러셔: 화장 영역을 볼록하게 감싼다 (그라데이션이라 경계보다 범위)
 *  - 라이너 · 아래 섀도: 화장 영역 테두리 그대로. 쉐딩 · 하이라이트(참고)는 뺀다
 * clip: 칠할 수 있는 곳 (klein 이면 얼굴 윤곽 0.9 안) — 그 밖 픽셀은 원본에 되붙인 경계 차이라 뺀다.
 */

import { pointInPoly } from "./color";
import { LM } from "./landmarks";
import type { ExtractPart, PartMask } from "./makeup-extract";
import { maskOutlines } from "./region-outline";
import type { Pt } from "./types";

/** 속입술 — 왼쪽 입꼬리(78) → 위(13) → 오른쪽(308) → 아래(14) */
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95] as const;

export interface PartGuide {
  part: ExtractPart;
  side: PartMask["side"];
  /** 닫힌 테두리들 (큰 것 먼저) */
  polys: Pt[][];
  /** 화장 영역 픽셀 수 */
  count: number;
  /** landmark: 얼굴 점 선 · mixed: 얼굴 점 ∪ 화장 영역 · region: 화장 영역 */
  from: "landmark" | "mixed" | "region";
}

/**
 * close · minArea: 조각 메우기 반지름 · 버릴 작은 점 한 변 (눈 폭 비율) · mouthOpen: 속입술 위아래가 입 폭의 이 비율 넘게 벌어지면 벌린 입.
 * 눈대중 시작값
 */
export const PART_GUIDE = { close: 0.06, minArea: 0.15, mouthOpen: 0.06 } as const;

export function partGuides(parts: readonly PartMask[], lm: readonly Pt[], w: number, h: number, opts: { clip?: readonly Pt[] } = {}): PartGuide[] {
  const P = (i: number): Pt => lm[i]!;
  const ew = Math.hypot(P(33).x - P(133).x, P(33).y - P(133).y) || 1;
  const o = { close: Math.max(1, Math.round(ew * PART_GUIDE.close)), minArea: Math.max(12, Math.round((ew * PART_GUIDE.minArea) ** 2)) };
  const out: PartGuide[] = [];
  for (const p of parts) {
    if (p.part === "contour" || p.part === "highlight" || !p.count) continue;
    const base = { part: p.part, side: p.side, count: p.count };
    let m = p.mask;
    if (opts.clip) {
      m = m.slice();
      for (let i = 0; i < m.length; i++) if (m[i] && !pointInPoly(i % w, Math.floor(i / w), opts.clip)) m[i] = 0;
    }
    if (p.part === "lip") {
      out.push({ ...base, polys: lipShapes(lm), from: "landmark" });
    } else if (p.part === "brow" && p.side) {
      // 털 톱니는 메우기로 먼저 지우고(작은 덩어리 · 1px 가닥은 사라진다) 원래 눈썹과 합친 뒤 다시 테두리
      const brow = p.side === "R" ? LM.browA : LM.browB;
      const own = [...brow.upper, ...[...brow.lower].reverse()].map(P);
      const merged = rasterize([...maskOutlines(m, w, h, o), own], w, h);
      out.push({ ...base, polys: maskOutlines(merged, w, h, { ...o, close: 1 }).slice(0, 1), from: "mixed" });
    } else if (p.part === "shadow" && p.side) {
      const lidY = lineY((p.side === "R" ? LM.eyeA : LM.eyeB).upper.map(P));
      const cut = m.slice();
      for (let i = 0; i < cut.length; i++) if (cut[i] && Math.floor(i / w) > lidY(i % w)) cut[i] = 0;
      out.push({ ...base, polys: maskOutlines(cut, w, h, o), from: "region" });
    } else if (p.part === "cheek") {
      out.push({ ...base, polys: maskOutlines(m, w, h, o).slice(0, 1).map((poly) => chaikin(chaikin(convexHull(poly)))), from: "region" });
    } else {
      out.push({ ...base, polys: maskOutlines(m, w, h, o), from: "region" });
    }
  }
  return out.filter((g) => g.polys.length > 0);
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

/** 다각형들을 칠한 마스크 */
function rasterize(polys: readonly (readonly Pt[])[], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (const poly of polys) {
    if (poly.length < 3) continue;
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++) {
        if (pointInPoly(x, y, poly)) m[y * w + x] = 1;
      }
    }
  }
  return m;
}

/** 꺾은선의 x 자리 높이 (선 밖이면 Infinity — 자르지 않음) */
function lineY(line: readonly Pt[]): (x: number) => number {
  return (x) => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!, b = line[i]!;
      if ((x - a.x) * (x - b.x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
    return Infinity;
  };
}

/** 볼록 껍질 (앤드루 단조 사슬) */
function convexHull(pts: readonly Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of s) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...s].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function chaikin(p: readonly Pt[]): Pt[] {
  return p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length]!;
    return [{ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y }];
  });
}
