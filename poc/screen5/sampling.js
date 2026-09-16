// 이미지에서 Lab 샘플 뽑기 (브라우저 전용). 기준 쌩얼과 내 화장을 각자의 랜드마크 위치에서 같은 mm 격자로 샘플링하므로 픽셀 정합이 필요 없다.
import { LM } from './landmarks.js';
import { buildGuide, pxPerMm } from './guides.js';

const OFF_RANGE = 3.0, OFF_STEP = 0.25;
export const OFFS = []; for (let d = -OFF_RANGE; d <= OFF_RANGE + 1e-6; d += OFF_STEP) OFFS.push(+d.toFixed(3));

export function rgb2lab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = h(x); y = h(y); z = h(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** 이미지 → { data, w, h, lm(px), mm } */
export function prepare(source, landmarksNorm, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lm = landmarksNorm.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z }));
  return { data, w, h, lm, mm: pxPerMm(lm), canvas: cv };
}
export function labAt(im, x, y) {
  const xi = Math.max(0, Math.min(im.w - 1, Math.round(x))), yi = Math.max(0, Math.min(im.h - 1, Math.round(y))), i = (yi * im.w + xi) * 4;
  return rgb2lab(im.data[i], im.data[i + 1], im.data[i + 2]);
}
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y }), add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 폴리라인을 등간격 N점으로 재샘플 + 법선 */
function resample(poly, N, irisC) {
  const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + dist(poly[i - 1], poly[i]));
  const total = cum[cum.length - 1], out = [];
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * total; let i = 1; while (i < cum.length - 1 && cum[i] < t) i++;
    const s0 = cum[i - 1], s1 = cum[i], u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const p = add(poly[i - 1], mul(sub(poly[i], poly[i - 1]), u)); const tg = norm(sub(poly[i], poly[i - 1]));
    let n = { x: -tg.y, y: tg.x };
    if (irisC) { if (n.y > 0) n = mul(n, -1); }                                          // 라이너: 법선은 항상 화면 위쪽 (+ = 위)
    out.push({ p, n, t });
  }
  return { pts: out, total };
}

/** 아이라이너 스트립 (양쪽 눈): 속눈썹 선 + 꼬리 선을 따라 법선 방향 −3…+3mm */
export function sampleLiner(im, eyeKey) {
  const eye = eyeKey === 'R' ? LM.eyeA : LM.eyeB;   // A = 이미지 왼쪽 = 피험자 오른쪽 눈
  const g = buildGuide('liner', im.lm), P = (i) => im.lm[i];
  const lid = eye.upper.map(P).slice().reverse();          // 안쪽 → 바깥쪽
  const wing = g.polylines.filter((l) => l.style === 'solid')[eyeKey === 'R' ? 0 : 1].pts;
  const poly = [...lid, wing[1]]; const lidLen = lid.reduce((s, p, i) => (i ? s + dist(lid[i - 1], p) : 0), 0);
  const irisC = P(eye.iris[0]); const { pts } = resample(poly, 80, irisC);
  const centerShift = 0; const lab = [], isWing = [], tFromCornerMm = [], pos = [];
  for (const s of pts) {
    pos.push(OFFS.map((o) => ({ x: s.p.x + s.n.x * o * im.mm, y: s.p.y + s.n.y * o * im.mm })));
    lab.push(OFFS.map((o) => labAt(im, s.p.x + s.n.x * (o * im.mm + centerShift), s.p.y + s.n.y * (o * im.mm + centerShift))));
    isWing.push(s.t > lidLen); tFromCornerMm.push((s.t - lidLen) / im.mm);
  }
  return { lab, pos, meta: { offsMm: OFFS, isWing, tFromCornerMm, wingLenMm: dist(wing[0], wing[1]) / im.mm } };
}

/** 눈썹 격자: (u 24 × v 10) 매개변수 격자. u=0 바깥 꼬리 → 1 안쪽, v 0~1 영역 안, v<0·v>1 은 바깥 띠. 두 이미지에서 같은 K */
export function sampleBrow(im) {
  const P = (i) => im.lm[i], lab = [], inside = [], tail = [], side = [], pos = [];
  const along = (pts, u) => { const t = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(t)), f = t - i; return add(pts[i], mul(sub(pts[i + 1], pts[i]), f)); };
  for (const [brow, key] of [[LM.browA, 'R'], [LM.browB, 'L']]) {
    const up = brow.upper.map(P), lo = brow.lower.map(P);      // 인덱스 0 = 바깥 꼬리
    for (let ui = 0; ui < 24; ui++) {
      const u = ui / 23, a = along(lo, u), b = along(up, u);
      for (const v of [-0.6, -0.3, 0.1, 0.3, 0.5, 0.7, 0.9, 1.3, 1.6]) {
        const q = add(a, mul(sub(b, a), v)); pos.push(q); lab.push(labAt(im, q.x, q.y)); inside.push(v >= 0 && v <= 1); tail.push(u < 0.4); side.push(key);
      }
    }
  }
  return { lab, pos, meta: { inside, tail, side } };
}

/** 입술 경계 스트립: 바깥 윤곽 20점을 따라 안쪽(−) … 바깥쪽(+) 3mm */
export function sampleLip(im) {
  const P = (i) => im.lm[i], lip = LM.lipsOuter.map(P), c = lip.reduce((a, p) => add(a, mul(p, 1 / lip.length)), { x: 0, y: 0 });
  const { pts } = resample([...lip, lip[0]], 60, null); const lab = [], half = [], side = [], pos = [];
  for (const s of pts) {
    let n = norm(sub(s.p, c));                       // 법선 = 입술 중심에서 바깥
    pos.push(OFFS.map((o) => ({ x: s.p.x + n.x * o * im.mm, y: s.p.y + n.y * o * im.mm })));
    lab.push(OFFS.map((o) => labAt(im, s.p.x + n.x * o * im.mm, s.p.y + n.y * o * im.mm)));
    half.push(s.p.y < c.y ? 'upper' : 'lower'); side.push(s.p.x < c.x ? 'R' : 'L');
  }
  return { lab, pos, meta: { offsMm: OFFS, half, side } };
}

/** 다각형 안 평균 Lab (2px 간격) */
export function meanLabPoly(im, poly, step = 2) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y); let L = 0, A = 0, B = 0, n = 0;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    if (!pointInPoly(x, y, poly)) continue; const l = labAt(im, x, y); L += l[0]; A += l[1]; B += l[2]; n++;
  }
  return n ? [L / n, A / n, B / n] : [0, 0, 0];
}
const scalePoly = (poly, k) => { const c = poly.reduce((a, p) => add(a, mul(p, 1 / poly.length)), { x: 0, y: 0 }); return poly.map((p) => add(c, mul(sub(p, c), k))); };
/** 링 참조: 영역을 1.7배 키운 다각형 평균 − 안쪽 평균의 근사(바깥 띠 샘플) */
function ringLab(im, poly) {
  const big = scalePoly(poly, 1.8), xs = big.map((p) => p.x), ys = big.map((p) => p.y); let L = 0, A = 0, B = 0, n = 0;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) {
    if (!pointInPoly(x, y, big) || pointInPoly(x, y, scalePoly(poly, 1.3))) continue; const l = labAt(im, x, y); L += l[0]; A += l[1]; B += l[2]; n++;
  }
  return n ? [L / n, A / n, B / n] : [0, 0, 0];
}
/** 강도 부위: 좌·우 영역 평균 + 인접 링(비화장 참조) + 이마. 섀도우는 안쪽/바깥쪽 반 평균도(방향) */
export function sampleIntensity(im, partId) {
  const g = buildGuide(partId, im.lm), P = (i) => im.lm[i];
  const fore = meanLabPoly(im, [P(LM.forehead), P(103), P(67), P(109), P(10), P(338), P(297), P(332)].filter(Boolean));
  const out = { fore, R: {}, L: {} };
  const regs = partId === 'contour' ? g.regions.filter((r) => r.kind !== 'highlight') : g.regions;
  regs.forEach((r, i) => {
    const key = i === 0 ? 'R' : 'L';
    out[key] = { part: meanLabPoly(im, r.pts), ring: ringLab(im, r.pts) };
    if (partId === 'shadow') {
      const xs = r.pts.map((p) => p.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      const outerSide = key === 'R' ? r.pts.filter((p) => p.x <= mid) : r.pts.filter((p) => p.x >= mid);
      const innerSide = key === 'R' ? r.pts.filter((p) => p.x > mid) : r.pts.filter((p) => p.x < mid);
      out[key].outer = meanLabPoly(im, outerSide.length > 2 ? outerSide : r.pts); out[key].inner = meanLabPoly(im, innerSide.length > 2 ? innerSide : r.pts);
    }
  });
  if (partId === 'contour') g.regions.filter((r) => r.kind === 'highlight').forEach((r, i) => { out[i === 0 ? 'R' : 'L'].hi = meanLabPoly(im, r.pts); });
  return out;
}
export function sampleAll(im, partId) {
  if (partId === 'liner') return { R: sampleLiner(im, 'R'), L: sampleLiner(im, 'L'), fore: sampleIntensity(im, 'cheek').fore };
  if (partId === 'brow') return { grid: sampleBrow(im), fore: sampleIntensity(im, 'cheek').fore };
  if (partId === 'lip') return { strip: sampleLip(im), fore: sampleIntensity(im, 'cheek').fore };
  return sampleIntensity(im, partId);
}
