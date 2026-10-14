/**
 * 가이드 테두리 그리기 — 화면 3(완성본 위)·화면 4(라이브 위)가 같이 쓴다.
 * 선만, 면 채우기·숫자 없음 (F-07). 색은 기본이 화면 5 결과 테두리와 같은 청록, 부위 가이드(사진 · 실시간)는 부위 색(partColor).
 * 테두리는 점선, 퍼지는 방향 표시(블러셔·섀도우·쉐딩, core/spread-marks)는 실선 화살표 + 작은 점.
 */

import type { Outline } from "../core/overlay";
import type { Pt } from "../core/types";

export const GUIDE_COLOR = "#3FD1C4";

/** 부위 가이드 테두리 색 — 사진 가이드(guide-source) · 실시간 가이드(live)가 같이 쓴다. ② 시험 페이지(flow-poc COLOR)와 같은 값 (#413) */
export const PART_COLOR: Readonly<Partial<Record<string, string>>> = {
  brow: "rgb(255,159,28)", liner: "rgb(0,209,255)", shadow: "rgb(177,75,255)", underShadow: "rgb(224,123,255)", lip: "rgb(255,59,92)", cheek: "rgb(255,126,182)",
};

/** 그 부위 색 — 색이 없는 부위(쉐딩 등)는 청록 */
export const partColor = (part: string): string => PART_COLOR[part] ?? GUIDE_COLOR;

/** 지금 좌표계(변환 포함) 그대로 점선으로 긋는다 */
export function strokeOutline(g: CanvasRenderingContext2D, o: Outline, lineWidth: number, color: string = GUIDE_COLOR): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.setLineDash([lineWidth * 3, lineWidth * 2]);
  const path = (pts: readonly Pt[], close: boolean): void => {
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    if (close) g.closePath();
    g.stroke();
  };
  for (const p of o.polys) path(p, true);
  for (const l of o.lines) path(l, false);
  g.restore();
  strokeMarks(g, o, lineWidth, color);
}

/**
 * 퍼지는 방향 표시만 — 실선 화살표(머리는 화면 크기, 선 굵기 배수로 붙여 얼굴 크기와 상관없이 같은 모양) + 채운 작은 점.
 * 지금 좌표계 그대로 긋는다. 부위 가이드(블러셔)는 부위 색으로 (2026-10-09)
 */
export function strokeMarks(g: CanvasRenderingContext2D, m: { dots?: readonly Pt[]; arrows?: readonly (readonly Pt[])[] }, lineWidth: number, color: string): void {
  if (!m.arrows?.length && !m.dots?.length) return;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = lineWidth;
  g.lineCap = "round";
  g.setLineDash([]);
  const path = (pts: readonly Pt[]): void => {
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.stroke();
  };
  const head = lineWidth * 3.5;
  for (const a of m.arrows ?? []) {
    if (a.length < 2) continue;
    const from = a[a.length - 2]!, to = a[a.length - 1]!, len = Math.hypot(to.x - from.x, to.y - from.y);
    path(a);
    if (len < 1e-6) continue;
    const ux = (to.x - from.x) / len, uy = (to.y - from.y) / len, h = Math.min(head, len * 0.5);
    for (const s of [1, -1]) {
      // 30° 벌린 두 갈래
      const c = Math.cos(Math.PI / 6), n = Math.sin(Math.PI / 6) * s;
      path([to, { x: to.x - h * (ux * c - uy * n), y: to.y - h * (uy * c + ux * n) }]);
    }
  }
  for (const d of m.dots ?? []) {
    g.beginPath();
    g.arc(d.x, d.y, lineWidth * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
