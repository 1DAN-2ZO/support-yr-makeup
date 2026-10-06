// 화장 템플릿 만들기 — "색 숫자"가 아니라 "모양이 있는 반투명 층"으로.
//
// 왜 이렇게 바꾸나
// ----------------
// 색·진하기·번짐 숫자 세 개로 칠하면, 아무리 값을 맞춰도 타원형 얼룩이 된다.
// 진짜 아이섀도는 눈꺼풀 주름을 따라 층이 지고, 눈꼬리가 진하고 안쪽이 옅다.
// 그 "모양"은 숫자로 못 적는다. 실제 화장 사진에서 가져와야 한다.
//
// 어떻게 뽑나
// -----------
// 같은 사람의 맨얼굴(B)과 화장한 얼굴(M)이 있으면, 화장은 이렇게 얹힌 것이다.
//     M = α·C + (1−α)·B        (α = 얼마나 덮였나, C = 화장 자체의 색)
// 부위마다 C 를 하나로 추정하면 픽셀마다 α 를 되짚을 수 있다.
//     α = |M − B| / |C − B|
// 이 α 지도가 곧 "화장의 모양"이다. 조명·피부톤은 B 에도 M 에도 똑같이 들어 있어
// 빼는 과정에서 사라진다 — 예전에 층을 통째로 떼어내 붙였을 때 뿌연 막이 생긴 원인이 이것이었다.
//
// 표준 얼굴 좌표(UV)로 펴서 저장하므로, 누구 얼굴에든 다시 씌울 수 있다.

const LAB_CACHE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LAB_CACHE[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * 한 부위의 화장 색 C 를 추정한다.
 * 맨얼굴과 가장 많이 달라진 픽셀들의 화장 쪽 색을 모아 중앙값을 쓴다 —
 * 평균은 경계의 어중간한 픽셀에 끌려가고, 중앙값은 "화장이 제대로 올라간 색"에 붙는다.
 */
function estimateColor(mk, br, mask, w, h) {
  const diffs = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i * 4 + 3] < 128) continue;
    const k = i * 4;
    const d = Math.abs(mk[k] - br[k]) + Math.abs(mk[k + 1] - br[k + 1]) + Math.abs(mk[k + 2] - br[k + 2]);
    if (d > 12) diffs.push([d, mk[k], mk[k + 1], mk[k + 2]]);
  }
  if (diffs.length < 30) return null;
  diffs.sort((a, b) => b[0] - a[0]);
  // 차이가 큰 위쪽 40% 만 본다 — 경계의 옅은 픽셀을 빼려고
  const top = diffs.slice(0, Math.max(20, Math.round(diffs.length * 0.4)));
  const med = (idx) => {
    const v = top.map((t) => t[idx]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return [med(1), med(2), med(3)];
}

/**
 * 맨얼굴·화장 한 쌍에서 부위별 화장 층을 뽑는다.
 * @returns {{color:number[], alpha:Float32Array}[]} 부위별 색과 모양(알파 지도)
 */
export function extractLayers(makeupData, bareData, masks, w, h) {
  const mk = makeupData.data, br = bareData.data;
  const out = {};
  for (const [name, mask] of Object.entries(masks)) {
    const m = mask.getContext("2d").getImageData(0, 0, w, h).data;
    const C = estimateColor(mk, br, m, w, h);
    if (!C) continue;
    const alpha = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (m[i * 4 + 3] < 8) continue;
      const k = i * 4;
      const B = [br[k], br[k + 1], br[k + 2]];
      const M = [mk[k], mk[k + 1], mk[k + 2]];
      const denom = dist3(C, B);
      if (denom < 8) continue; // 화장색과 피부색이 거의 같으면 알 수 없다
      let a = dist3(M, B) / denom;
      // 마스크 가장자리는 부드럽게 — 마스크 자체의 알파를 곱한다
      a *= m[k + 3] / 255;
      alpha[i] = Math.max(0, Math.min(1, a));
    }
    out[name] = { color: C, alpha };
  }
  return out;
}

/**
 * 뽑은 층을 표준 얼굴 좌표(UV)로 편다 — 삼각형마다 원본에서 UV 로 옮긴다.
 * 이렇게 저장하면 다른 사람 얼굴에도 같은 모양으로 씌울 수 있다.
 * @param {Float32Array} alpha 알파 지도 (원본 크기)
 * @param {number[]} color 화장 색
 * @param {object} lm 원본 얼굴 점
 * @param {number[][]} faceUV 468점의 UV 좌표
 * @param {number[]} tris 삼각형 인덱스
 * @param {number} size UV 판 크기
 */
export function bakeToUV(alpha, color, lm, faceUV, tris, w, h, size = 512) {
  // 알파 지도를 먼저 캔버스로 만든다 (색은 단색, 알파만 모양)
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const sctx = src.getContext("2d");
  const img = sctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = color[0];
    img.data[i * 4 + 1] = color[1];
    img.data[i * 4 + 2] = color[2];
    img.data[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  sctx.putImageData(img, 0, 0);

  const uv = document.createElement("canvas");
  uv.width = uv.height = size;
  const c = uv.getContext("2d");
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
    const sp = [i0, i1, i2].map((i) => [lm[i].x * w, lm[i].y * h]);
    const dp = [i0, i1, i2].map((i) => [faceUV[i][0] * size, faceUV[i][1] * size]);
    drawTriangle(c, src, sp, dp);
  }
  return uv;
}

/** 삼각형 하나를 원본에서 목적지로 옮겨 그린다 (아핀 변형) */
function drawTriangle(ctx, img, s, d) {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
  const denom = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0;
  if (!denom) return;
  const m11 = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom;
  const m12 = (sy1 * dy2 + sy0 * (dy1 - dy2) - sy2 * dy1 + (sy2 - sy1) * dy0) / denom;
  const m21 = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / denom;
  const m22 = -(sx1 * dy2 + sx0 * (dy1 - dy2) - sx2 * dy1 + (sx2 - sx1) * dy0) / denom;
  const dx = (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / denom;
  const dy = (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** UV 판을 다시 사람 얼굴 위로 씌운다 — bakeToUV 의 반대 */
export function applyFromUV(uvCanvas, lm, faceUV, tris, w, h, size = 512) {
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const c = out.getContext("2d");
  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
    const sp = [i0, i1, i2].map((i) => [faceUV[i][0] * size, faceUV[i][1] * size]);
    const dp = [i0, i1, i2].map((i) => [lm[i].x * w, lm[i].y * h]);
    drawTriangle(c, uvCanvas, sp, dp);
  }
  return out;
}
