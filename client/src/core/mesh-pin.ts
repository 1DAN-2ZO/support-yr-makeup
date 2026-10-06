/**
 * 얼굴 그물에 점 붙이기 — 기준 얼굴(맨얼굴 정면)에서 그린 모양을 지금 얼굴로 옮긴다.
 *
 * 점마다 그 점을 품은 삼각형(face-mesh, 852개)과 그 안의 자리(무게중심 좌표 = 세 꼭짓점 무게)를 적어 두고,
 * 지금 얼굴의 같은 삼각형에 같은 무게로 놓는다. 풍선에 그린 그림처럼 얼굴과 같이 돌고, 고개를 돌리면 먼 쪽은 원근대로 좁아진다.
 * 2-b AR 이 화장을 기준 얼굴에 한 번 그려 삼각형마다 휘어 붙이는 것(makeup-gl)과 같은 방식.
 *
 * 그물 밖 점(얼굴 옆)은 가장 가까운 삼각형으로 늘려 붙인다 — 그 삼각형과 같이 움직인다.
 */

import { FACE_TRIANGLES, type Triangle } from "./face-mesh";
import type { Outline } from "./overlay";
import type { Pt } from "./types";

export interface Pin {
  tri: number;
  /** 세 꼭짓점 무게 (합 1). 삼각형 밖이면 음수가 섞인다 */
  w: readonly [number, number, number];
}

/** p 의 무게중심 좌표. 삼각형이 납작하면 null */
function bary(p: Pt, a: Pt, b: Pt, c: Pt): [number, number, number] | null {
  const v0x = b.x - a.x, v0y = b.y - a.y, v1x = c.x - a.x, v1y = c.y - a.y, v2x = p.x - a.x, v2y = p.y - a.y;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-9) return null;
  const v = (v2x * v1y - v1x * v2y) / den, w = (v0x * v2y - v2x * v0y) / den;
  return [1 - v - w, v, w];
}

function pinOne(base: readonly Pt[], p: Pt, tris: readonly Triangle[]): Pin {
  // 얼굴 점과 같은 자리면 그 얼굴 점에 붙인다 — 이웃 삼각형 변 위에 걸쳐 있어도 (라이너 아래 선 = 눈꺼풀 점 그대로)
  for (let tri = 0; tri < tris.length; tri++) {
    const c = tris[tri]!.findIndex((k) => { const q = base[k]; return !!q && Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9; });
    if (c >= 0) return { tri, w: [c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0] };
  }
  let inside: Pin | null = null, insideMin = -Infinity;
  let near: Pin | null = null, nearD = Infinity;
  tris.forEach(([i, j, k], tri) => {
    const a = base[i], b = base[j], c = base[k];
    if (!a || !b || !c) return;
    const w = bary(p, a, b, c);
    if (!w) return;
    const m = Math.min(...w);
    // 품은 삼각형이 여럿이면(코 옆처럼 겹쳐 보이는 곳) 가장 안쪽
    if (m >= -1e-9 && m > insideMin) { inside = { tri, w }; insideMin = m; }
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < nearD) { near = { tri, w }; nearD = d; }
  });
  const pin = inside ?? near;
  if (!pin) throw new Error("얼굴 그물이 비었다");
  return pin;
}

/** 기준 얼굴(base) 위의 점들을 그물에 붙인다 */
export function pinPoints(base: readonly Pt[], pts: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): Pin[] {
  return pts.map((p) => pinOne(base, p, tris));
}

/** 붙여 둔 점들을 지금 얼굴(cur)에 놓는다 */
export function placePins(cur: readonly Pt[], pins: readonly Pin[], tris: readonly Triangle[] = FACE_TRIANGLES): Pt[] {
  return pins.map(({ tri, w }) => {
    const [i, j, k] = tris[tri]!;
    const a = cur[i]!, b = cur[j]!, c = cur[k]!;
    return { x: w[0] * a.x + w[1] * b.x + w[2] * c.x, y: w[0] * a.y + w[1] * b.y + w[2] * c.y };
  });
}

export interface PinnedOutline {
  polys: Pin[][];
  lines: Pin[][];
  dots?: Pin[];
  arrows?: Pin[][];
}

/** 테두리(다각형·선)를 모양 그대로 그물에 붙인다 */
export function pinOutline(o: Outline, base: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): PinnedOutline {
  return {
    polys: o.polys.map((s) => pinPoints(base, s, tris)), lines: o.lines.map((s) => pinPoints(base, s, tris)),
    ...(o.dots ? { dots: pinPoints(base, o.dots, tris) } : {}),
    ...(o.arrows ? { arrows: o.arrows.map((s) => pinPoints(base, s, tris)) } : {}),
  };
}

export function placeOutline(p: PinnedOutline, cur: readonly Pt[], tris: readonly Triangle[] = FACE_TRIANGLES): Outline {
  return {
    polys: p.polys.map((s) => placePins(cur, s, tris)), lines: p.lines.map((s) => placePins(cur, s, tris)),
    ...(p.dots ? { dots: placePins(cur, p.dots, tris) } : {}),
    ...(p.arrows ? { arrows: p.arrows.map((s) => placePins(cur, s, tris)) } : {}),
  };
}
