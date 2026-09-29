/**
 * 가이드 테두리 그리기 — 화면 3(완성본 위)·화면 4(라이브 위)가 같이 쓴다.
 * 선만, 면 채우기·숫자 없음 (F-07). 색은 화면 5 결과 테두리와 같은 청록.
 */

import type { Outline } from "@core/overlay";
import type { Pt } from "@core/types";

export const GUIDE_COLOR = "#3FD1C4";

/** 지금 좌표계(변환 포함) 그대로 점선으로 긋는다 */
export function strokeOutline(g: CanvasRenderingContext2D, o: Outline, lineWidth: number): void {
  g.save();
  g.strokeStyle = GUIDE_COLOR;
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
}
