// C1이 만든 화장 레이어(이미지 공간)를 canonical UV 공간 텍스처로 한 번만 굽는다.
// 런타임엔 이 구운 텍스처를 매 프레임 다시 만들지 않고 재사용 — solveAffine(lib/affine.js)을
// 758개(눈 구멍 제거 후) 삼각형 전부에 적용해 이미지 공간 → UV 공간으로 역워핑.
//
// flipY 규약: face-uv.json은 tools/extract-face-uv.js에서 이미 (1-v)로 뒤집혀 있다 — 즉 이 UV는
// "캔버스 좌표계"(위가 0, 아래로 갈수록 증가) 기준이다. 여기서 굽는 캔버스도 같은 관례(Canvas2D
// 기본 좌표계)를 쓰고, 별도로 뒤집지 않는다. flipY는 이 프로젝트 전체에서 face-uv.json 추출
// 단계 딱 한 곳에서만 일어난다 — 다른 데서 또 뒤집으면 안 된다.

import { solveAffine } from "./affine.js";
import { featherAlpha } from "./blur.js";

function toCanvas(imageDataLike) {
  const cv = document.createElement("canvas");
  cv.width = imageDataLike.width; cv.height = imageDataLike.height;
  const ctx = cv.getContext("2d");
  ctx.putImageData(new ImageData(imageDataLike.data, imageDataLike.width, imageDataLike.height), 0, 0);
  return cv;
}

// 삼각형을 자기 중심 기준으로 살짝 부풀려서 인접 삼각형과 겹치게 그린다 — 안 그러면 아핀 워핑의
// 반올림 오차로 삼각형 경계에 실선(seam)이 비친다.
function inflate(pts, px) {
  const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * px, y + (dy / len) * px];
  });
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} layerImageData C1(extractLayer) 출력, RGBA
 * @param {Array<{x:number,y:number}>} landmarks 468점, layerImageData와 같은 이미지 공간(정규화 0..1 좌표)
 * @param {Array<[number,number]>} faceUV assets/face-uv.json (468개, 이미 flipY 적용됨)
 * @param {number[]} faceTriangles assets/face-triangles.json (눈 구멍 제거된 인덱스 목록)
 * @param {number} [canvasSize] UV 캔버스 한 변 크기 (기본 1024)
 * @param {number} [feather] 알파 페더링 반경(px, canvasSize=1024 기준). 0이면 경계 그대로(하드 엣지).
 * @returns {HTMLCanvasElement} 구운 UV 텍스처 (RGBA, 마스크 밖·눈 안쪽은 투명)
 */
export function bakeLayer(layerImageData, landmarks, faceUV, faceTriangles, canvasSize = 1024, feather = 0) {
  const srcCanvas = toCanvas(layerImageData);
  const srcW = layerImageData.width, srcH = layerImageData.height;

  const uvCanvas = document.createElement("canvas");
  uvCanvas.width = canvasSize; uvCanvas.height = canvasSize;
  const ctx = uvCanvas.getContext("2d");

  for (let i = 0; i < faceTriangles.length; i += 3) {
    const [a, b, c] = [faceTriangles[i], faceTriangles[i + 1], faceTriangles[i + 2]];

    const srcPts = [a, b, c].map((idx) => [landmarks[idx].x * srcW, landmarks[idx].y * srcH]);
    const dstPtsRaw = [a, b, c].map((idx) => [faceUV[idx][0] * canvasSize, faceUV[idx][1] * canvasSize]);
    const dstPts = inflate(dstPtsRaw, 1); // 1px 여유(이음매 방지)

    const m = solveAffine(srcPts, dstPts);
    if (!m) continue; // 세 점이 일직선(면적 0) — 드물지만 방어

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstPts[0][0], dstPts[0][1]);
    ctx.lineTo(dstPts[1][0], dstPts[1][1]);
    ctx.lineTo(dstPts[2][0], dstPts[2][1]);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.restore();
  }

  // C3: 알파만 블러 — 경계를 부드럽게(색은 안 번짐). canvasSize가 1024가 아니면 반경을 비례 조정.
  featherAlpha(uvCanvas, feather * (canvasSize / 1024));

  return uvCanvas;
}
