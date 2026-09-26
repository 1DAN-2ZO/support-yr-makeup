// 폴리곤(가운데점 팬 삼각분할) 단위 아핀 워핑. app.js(v2 사진 워핑)·app-delta.js(ΔLab 레이어 워핑)
// 공용 — 그리는 대상(srcImg)만 다르고 기하는 완전히 같다. 중복 구현 금지, 여기 하나만.

import { solveAffine } from "./affine.js";
import { centroid } from "./regions.js";

/** ctx에 srcImg의 srcPts 폴리곤 영역을 dstPts 폴리곤 모양으로 워핑해서 그린다(alpha는 전역 블렌드). */
export function warpPolygon(ctx, srcPts, dstPts, srcImg, alpha) {
  const srcC = centroid(srcPts), dstC = centroid(dstPts);
  const n = srcPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const m = solveAffine([srcC, srcPts[i], srcPts[j]], [dstC, dstPts[i], dstPts[j]]);
    if (!m) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstC[0], dstC[1]);
    ctx.lineTo(dstPts[i][0], dstPts[i][1]);
    ctx.lineTo(dstPts[j][0], dstPts[j][1]);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(srcImg, 0, 0);
    ctx.restore();
  }
}
