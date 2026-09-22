/**
 * 부위별 아핀 워핑 조립 — poc/look-tryon/client/app.js 의 warpPolygon 함수 그대로 타입만 붙임.
 * 팬 삼각분할(centroid + 인접 정점 2개)로 폴리곤을 삼각형 N개로 나누고, 삼각형마다 3점 아핀으로
 * 소스 이미지를 목적지 폴리곤 모양에 맞춰 그린다. app.js(v2 Canvas2D 워핑) POC에서 실사용
 * 검증된 그대로. 중복 구현 금지, 여기 하나만.
 */

import { solveAffine } from "./affine";
import type { Pt } from "./affine";
import { centroid } from "./regions";

/** srcPts 폴리곤(소스 이미지 좌표) -> dstPts 폴리곤(캔버스 좌표) 팬 삼각분할 아핀 워핑 */
export function warpPolygon(
  ctx: CanvasRenderingContext2D,
  srcPts: readonly Pt[],
  dstPts: readonly Pt[],
  srcImg: CanvasImageSource,
  alpha: number,
): void {
  const srcC = centroid(srcPts), dstC = centroid(dstPts);
  const n = srcPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const sp0 = srcPts[i], sp1 = srcPts[j];
    const dp0 = dstPts[i], dp1 = dstPts[j];
    if (!sp0 || !sp1 || !dp0 || !dp1) continue;
    const m = solveAffine([srcC, sp0, sp1], [dstC, dp0, dp1]);
    if (!m) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstC[0], dstC[1]);
    ctx.lineTo(dp0[0], dp0[1]);
    ctx.lineTo(dp1[0], dp1[1]);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.setTransform(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!);
    ctx.drawImage(srcImg, 0, 0);
    ctx.restore();
  }
}
