// 3점 대응 아핀 변형. app.js(v2 Canvas2D 워핑)가 쓰는 공용 함수 — 중복 구현 금지, 여기 하나만.

// src 3점 -> dst 3점 을 만족하는 2x3 아핀 행렬 [a,b,c,d,e,f] (Canvas2D setTransform 순서)
export function solveAffine(src, dst) {
  const [[x0, y0], [x1, y1], [x2, y2]] = src;
  const [[u0, v0], [u1, v1], [u2, v2]] = dst;
  const d = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
  if (Math.abs(d) < 1e-6) return null;
  const solveRow = (p0, p1, p2) => {
    const a = (p0 * (y1 - y2) - p1 * (y0 - y2) + p2 * (y0 - y1)) / d;
    const b = (x0 * (p1 - p2) - x1 * (p0 - p2) + x2 * (p0 - p1)) / d;
    const c = (x0 * (y1 * p2 - y2 * p1) - x1 * (y0 * p2 - y2 * p0) + x2 * (y0 * p1 - y1 * p0)) / d;
    return [a, b, c];
  };
  const [a, c, e] = solveRow(u0, u1, u2);
  const [b, dd, f] = solveRow(v0, v1, v2);
  return [a, b, c, dd, e, f];
}
