// 랜드마크 폴리곤(점 목록)을 픽셀 마스크(0..1 커버리지)로 래스터화. 브라우저 Canvas 2D 필요(Node 불가).
// deltaLayer.js가 기대하는 마스크 형식({width,height,data:Float32Array})을 만든다.

export function rasterizePolygon(polygonPts, width, height) {
  const cv = document.createElement("canvas");
  cv.width = width; cv.height = height;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  polygonPts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
  const img = ctx.getImageData(0, 0, width, height);
  const data = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) data[i] = img.data[i * 4 + 3] / 255; // 알파 채널 = 커버리지
  return { width, height, data };
}
