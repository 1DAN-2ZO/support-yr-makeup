// sRGB <-> CIE Lab, D65 백색점. rgb2lab/deltaE는 poc/app.js에서 실기기 검증을 통과한 수식 그대로
// 가져온 것 — 새로 구현하거나 "개선"하지 않는다. lab2rgb는 그 역변환(신규, 같은 행렬 상수 사용).

export function rgb2lab(r, g, b) {
  const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function lab2rgb([L, a, b]) {
  const y = (L + 16) / 116;
  const x = a / 500 + y;
  const z = y - b / 200;
  const g2inv = (t) => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const X = g2inv(x) * 0.95047, Y = g2inv(y) * 1.0, Z = g2inv(z) * 1.08883;
  const R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  const G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  const B = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
  const finv = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.min(255, Math.max(0, Math.round(v * 255))); };
  return [finv(R), finv(G), finv(B)];
}

// CIE76 (유클리드). CIEDE2000 불필요 — 부위 판정용 임계 비교엔 CIE76으로 충분.
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
