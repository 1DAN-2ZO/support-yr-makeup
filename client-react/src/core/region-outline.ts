/**
 * 화장 영역 테두리 (2026-10-06) — 부위별 화장 픽셀 마스크(makeup-extract PartMask) → 바깥 테두리 선.
 * FLUX.2 klein 은 칠한 영역 밖이 원본 그대로라 원래 맨얼굴과의 차이가 깨끗하다 — 템플릿 모양에 숫자를 읽는 대신(Stable-Makeup 때 makeup-fit, 지금은 지움)
 * 화장이 실제로 들어간 영역의 테두리를 그대로 가이드로 쓴다 (사용자 2026-10-06).
 *  1) 가까운 조각 메우기: 반지름 close 상자 안에서 절반 넘게 칠해진 곳 (크기는 거의 그대로, 사이 빈틈은 메워진다)
 *  2) 이어진 덩어리마다(minArea 보다 작은 점은 버림) 바깥 테두리를 따라간다 (무어 이웃 추적) — 안쪽 구멍은 무시
 *  3) 픽셀 계단 다듬기(차이킨 smooth 번) 뒤 꼭짓점 줄이기(더글러스-포이커, simplify px)
 */

import type { Pt } from "./types";

export interface OutlineOptions {
  close: number;
  minArea: number;
  simplify: number;
  smooth: number;
}
export const OUTLINE: OutlineOptions = { close: 2, minArea: 30, simplify: 0.8, smooth: 2 };

/** 마스크(1 = 칠함) → 덩어리마다 바깥 테두리 (큰 덩어리 먼저) */
export function maskOutlines(mask: Uint8Array, w: number, h: number, opts: Partial<OutlineOptions> = {}): Pt[][] {
  const o = { ...OUTLINE, ...opts };
  const m = o.close > 0 ? closeMask(mask, w, h, Math.round(o.close)) : mask;
  const label = new Int32Array(w * h).fill(-1);
  const comps: { start: number; area: number; id: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || label[i]! >= 0) continue;
    const id = comps.length;
    let area = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!, x = j % w, y = (j - x) / w;
      area++;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (m[k] && label[k]! < 0) { label[k] = id; stack.push(k); }
      }
    }
    comps.push({ start: i, area, id });   // 래스터 순서 첫 픽셀 = 가장 위 · 왼쪽
  }
  return comps
    .filter((c) => c.area >= o.minArea)
    .sort((a, b) => b.area - a.area)
    .map((c) => {
      let p = traceOuter((x, y) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === c.id, c.start % w, Math.floor(c.start / w), c.area);
      // 픽셀 계단을 먼저 다듬고 꼭짓점을 줄인다 — 줄인 뒤 다듬으면 긴 변 모서리가 변 길이의 25% 씩 깎였다 (시험 R6)
      for (let k = 0; k < o.smooth && p.length > 2; k++) p = chaikin(p);
      if (p.length > 3) p = simplifyClosed(p, o.simplify);
      return p;
    });
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** 시계 방향 (화면 y 아래) — 서 · 북서 · 북 · 북동 · 동 · 남동 · 남 · 남서 */
const D8 = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]] as const;

/** 상자 (2r+1)² 안에서 절반 넘게 칠해진 곳 — 사진 밖은 세지 않는다 */
function closeMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const S = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += mask[y * w + x] ? 1 : 0; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1]! + row; }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = S[y1 * (w + 1) + x1]! - S[y0 * (w + 1) + x1]! - S[y1 * (w + 1) + x0]! + S[y0 * (w + 1) + x0]!;
      if (sum * 2 > (x1 - x0) * (y1 - y0)) out[y * w + x] = 1;
    }
  }
  return out;
}

/** 무어 이웃 추적 — 가장 위 · 왼쪽 픽셀(서쪽은 바깥)에서 출발해 바깥 테두리를 시계 방향으로 한 바퀴 */
function traceOuter(inside: (x: number, y: number) => boolean, sx: number, sy: number, area: number): Pt[] {
  const out: Pt[] = [{ x: sx, y: sy }];
  let cx = sx, cy = sy, start = 0, second: Pt | null = null;
  for (let guard = 0; guard < 4 * area + 16; guard++) {
    let nd = -1;
    for (let k = 0; k < 8; k++) {
      const d = (start + k) % 8;
      if (inside(cx + D8[d]![0], cy + D8[d]![1])) { nd = d; break; }
    }
    if (nd < 0) break;   // 한 픽셀짜리
    const nx = cx + D8[nd]![0], ny = cy + D8[nd]![1];
    if (cx === sx && cy === sy && second && nx === second.x && ny === second.y) break;   // 한 바퀴 돌았다
    if (!second) second = { x: nx, y: ny };
    cx = nx; cy = ny;
    start = (nd + 5) % 8;   // 방금 온 픽셀 바로 다음(시계 방향)부터
    out.push({ x: cx, y: cy });
  }
  if (out.length > 1 && out[out.length - 1]!.x === sx && out[out.length - 1]!.y === sy) out.pop();
  return out;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function rdp(p: readonly Pt[], eps: number): Pt[] {
  if (p.length < 3) return [...p];
  let k = 0, dmax = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = segDist(p[i]!, p[0]!, p[p.length - 1]!); if (d > dmax) { dmax = d; k = i; } }
  if (dmax <= eps) return [p[0]!, p[p.length - 1]!];
  return [...rdp(p.slice(0, k + 1), eps).slice(0, -1), ...rdp(p.slice(k), eps)];
}
/** 닫힌 다각형 꼭짓점 줄이기 — 첫 점과 가장 먼 점에서 둘로 나눠 각자 */
function simplifyClosed(p: readonly Pt[], eps: number): Pt[] {
  let k = 0, dmax = -1;
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i]!.x - p[0]!.x, p[i]!.y - p[0]!.y); if (d > dmax) { dmax = d; k = i; } }
  const a = rdp(p.slice(0, k + 1), eps), b = rdp([...p.slice(k), p[0]!], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function chaikin(p: readonly Pt[]): Pt[] {
  return p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length]!;
    return [{ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y }];
  });
}
