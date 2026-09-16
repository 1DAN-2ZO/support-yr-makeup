// 화면 2 룩 얹어보기 — 브랜치 poc/screen2 (poc/look-tryon/client/app.js) 에서 가져옴.
// (1) 서버 화장 전이: Stable-Makeup Gradio 데모(http://127.0.0.1:7860)에 원본 + 룩 참조 사진을 보내 "완성 예상" 1장을 받는다 (fp16 10 step ≈ 3초, RTX 3060 실측).
// (2) 실시간 매핑: 생성 이미지의 눈썹/눈(섀도우 밴드)/입술/볼 부위를 팬 삼각분할 3점 아핀으로 라이브 얼굴에 워핑한다. 부위 밖은 합성하지 않는다.

const EYES = { R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33] }, L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263] } };
const BROW = { R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] };
const CHEEK = { R: [116, 117, 118, 101, 36, 205, 187, 123], L: [345, 346, 347, 330, 266, 425, 411, 352] };
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const EYESHADOW_REACH = 0.45;
export const REGION_KEYS = ['browR', 'browL', 'eyeR', 'eyeL', 'lips', 'cheekR', 'cheekL'];

const centroid = (pts) => { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 정규화 랜드마크 + 이미지 크기 → 부위별 폴리곤(픽셀) */
export function buildRegions(lm, w, h) {
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const browR = BROW.R.map(P), browL = BROW.L.map(P), browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  return {
    browR, browL,
    eyeR: [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()],
    eyeL: [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()],
    lips: LIPS.map(P), cheekR: CHEEK.R.map(P), cheekL: CHEEK.L.map(P),
  };
}
/** src 3점 → dst 3점 아핀 [a,b,c,d,e,f] (Canvas setTransform 순서) */
export function solveAffine(src, dst) {
  const [[x0, y0], [x1, y1], [x2, y2]] = src, [[u0, v0], [u1, v1], [u2, v2]] = dst;
  const d = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1); if (Math.abs(d) < 1e-6) return null;
  const row = (p0, p1, p2) => [(p0 * (y1 - y2) - p1 * (y0 - y2) + p2 * (y0 - y1)) / d, (x0 * (p1 - p2) - x1 * (p0 - p2) + x2 * (p0 - p1)) / d, (x0 * (y1 * p2 - y2 * p1) - x1 * (y0 * p2 - y2 * p0) + x2 * (y0 * p1 - y1 * p0)) / d];
  const [a, c, e] = row(u0, u1, u2), [b, dd, f] = row(v0, v1, v2); return [a, b, c, dd, e, f];
}
/** 폴리곤을 팬 삼각분할해 src 이미지의 해당 부위를 dst 위치로 워핑 */
export function warpPolygon(ctx, srcPts, dstPts, srcImg, alpha) {
  const srcC = centroid(srcPts), dstC = centroid(dstPts), n = srcPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, m = solveAffine([srcC, srcPts[i], srcPts[j]], [dstC, dstPts[i], dstPts[j]]); if (!m) continue;
    ctx.save(); ctx.beginPath(); ctx.moveTo(dstC[0], dstC[1]); ctx.lineTo(dstPts[i][0], dstPts[i][1]); ctx.lineTo(dstPts[j][0], dstPts[j][1]); ctx.closePath(); ctx.clip();
    ctx.globalAlpha = alpha; ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); ctx.drawImage(srcImg, 0, 0); ctx.restore();
  }
}
/** 룩 렌더(부위 폴리곤 포함)를 라이브 프레임 위에 부위별로 워핑 */
export function drawTryOn(ctx, look, liveLm, w, h, alpha = 0.85) {
  const live = buildRegions(liveLm, w, h);
  for (const k of REGION_KEYS) warpPolygon(ctx, look.regions[k], live[k], look.img, alpha);
}

/** Stable-Makeup Gradio 서버로 생성. 실패하면 throw (서버 없음·CORS 등) */
export async function generateViaGradio(sourceCanvas, refFile, { url = 'http://127.0.0.1:7860', steps = 10, guidance = 1.6 } = {}) {
  const { Client } = await import('https://esm.sh/@gradio/client@2.6.0');
  const blob = await new Promise((r) => sourceCanvas.toBlob(r, 'image/jpeg', 0.95));
  const client = await Client.connect(url); const t0 = performance.now();
  const result = await client.predict('/predict', [blob, refFile, steps, guidance]);
  const [imgData, info] = result.data; const imgUrl = imgData.url || (imgData.path ? `${url}/file=${imgData.path}` : null);
  if (!imgUrl) throw new Error('서버 응답에 이미지가 없음');
  const img = new Image(); img.crossOrigin = 'anonymous'; await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgUrl; });
  return { img, info, ms: performance.now() - t0 };
}
