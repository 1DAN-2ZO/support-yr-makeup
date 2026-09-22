// 화면 4(실시간 테두리) POC — 핵심 계산 모듈 (순수 함수). 브라우저·Node 공용 ESM.
//
// mm 척도를 쓰지 않는다. 모든 치수는 눈 너비 비율이다.
// DOM·캔버스·MediaPipe를 참조하지 않으므로 Node에서 그대로 검증할 수 있다.

// ---------------- 랜드마크 인덱스 (MediaPipe 468 + 홍채 10) ----------------

export const IDX = {
  // 윗 속눈썹 선 (바깥 → 안쪽). 가이드 기준선
  lashL: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  lashR: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  innerL: 362, outerL: 263, irisCL: 473,
  innerR: 133, outerR: 33, irisCR: 468,
  irisRingL: [474, 475, 476, 477],
  irisRingR: [469, 470, 471, 472],
  forehead: [10, 109, 108, 151, 337, 338],
  faceOval: [10, 234, 152, 454],   // 위·왼·아래·오른 (얼굴 박스 근사)
};

// 룩 템플릿이 주는 고정값. 얼굴형과 무관하고, 전부 눈 너비 대비 비율이다.
export const DEFAULT_GUIDE = {
  thickness: 0.08,    // 선 두께 = 눈 너비의 8%
  wingLen: 0.25,      // 꼬리 길이 = 눈 너비의 25%
  wingAngleDeg: 15,   // 눈이 뻗은 방향에서 위로 꺾는 각도
  samples: 64,
};

// ---------------- 작은 기하 도우미 ----------------

const P = (x, y) => ({ x, y });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 정규화 좌표(0~1) → 픽셀 좌표 */
export function toPx(lm, i, w, h) {
  return P(lm[i].x * w, lm[i].y * h);
}

/** 경로를 n개 점으로 균등 재샘플. 각 점에 진행 거리 t를 함께 담는다. */
export function resample(points, n) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + dist(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  const out = [];
  if (total <= 0) {
    for (let k = 0; k < n; k++) out.push({ ...points[0], t: 0 });
    return { pts: out, total: 0 };
  }
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const s0 = cum[i - 1], s1 = cum[i];
    const u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const p = lerp(points[i - 1], points[i], u);
    out.push({ x: p.x, y: p.y, t });
  }
  return { pts: out, total };
}

/** 각 점의 법선. away에서 멀어지는 쪽으로 부호를 맞춘다(눈 바깥쪽). */
export function normalsAlong(pts, away) {
  const ns = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y;
    const L = Math.hypot(tx, ty) || 1;
    return P(-ty / L, tx / L);
  });
  const m = Math.floor(pts.length / 2);
  const d = P(pts[m].x - away.x, pts[m].y - away.y);
  const s = ns[m].x * d.x + ns[m].y * d.y >= 0 ? 1 : -1;
  return ns.map((n) => P(n.x * s, n.y * s));
}

export function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function boxesOverlap(a, b) {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

// ---------------- 아이라이너 가이드 ----------------

/**
 * 눈 하나의 가이드 테두리를 만든다.
 * lash: 윗 속눈썹 선 점들(바깥 → 안쪽), inner/outer: 눈 안쪽·바깥쪽 끝, irisC: 홍채 중심
 * 반환: center(중심선), upper·lower(테두리 두 줄). 면 채우기는 하지 않는다(v6 규칙).
 */
export function eyeGuide({ lash, inner, outer, irisC }, opts = {}) {
  const o = { ...DEFAULT_GUIDE, ...opts };
  const eyeW = dist(inner, outer);
  const path = lash.slice();

  if (o.wingLen > 0.001) {
    // 눈이 뻗은 방향에서 위로 꺾어 꼬리를 붙인다. 기준은 화면이 아니라 눈 자체다.
    const dx = outer.x - inner.x, dy = outer.y - inner.y;
    const a = Math.atan2(dy, dx);
    const sign = Math.sign(dx) || 1;
    const a2 = a - sign * (o.wingAngleDeg * Math.PI / 180);
    const len = eyeW * o.wingLen;
    path.unshift(P(outer.x + Math.cos(a2) * len, outer.y + Math.sin(a2) * len));
  }

  const { pts, total } = resample(path, o.samples);
  const ns = normalsAlong(pts, irisC);
  const half = (eyeW * o.thickness) / 2;
  // 중심선을 바깥쪽으로 half만큼 밀어 속눈썹 선 위에 띠가 얹히게 한다
  const center = pts.map((p, i) => P(p.x + ns[i].x * half, p.y + ns[i].y * half));
  const upper = center.map((p, i) => P(p.x + ns[i].x * half, p.y + ns[i].y * half));
  const lower = center.map((p, i) => P(p.x - ns[i].x * half, p.y - ns[i].y * half));

  return { center, upper, lower, eyeW, thicknessPx: half * 2, lengthPx: total };
}

// ---------------- 고개 각도 (facialTransformationMatrixes) ----------------

/**
 * MediaPipe가 주는 4x4 변환행렬(열 우선 16개)에서 yaw·pitch·roll(도)을 뽑는다.
 * 부호가 사용자 체감과 맞는지는 실기기에서 확인할 것.
 */
export function matrixToEuler(data) {
  const R = (r, c) => data[c * 4 + r];
  const sy = Math.hypot(R(0, 0), R(1, 0));
  const deg = 180 / Math.PI;
  if (sy < 1e-6) {
    return { pitch: Math.atan2(-R(1, 2), R(1, 1)) * deg, yaw: Math.atan2(-R(2, 0), sy) * deg, roll: 0 };
  }
  return {
    pitch: Math.atan2(R(2, 1), R(2, 2)) * deg,
    yaw: Math.atan2(-R(2, 0), sy) * deg,
    roll: Math.atan2(R(1, 0), R(0, 0)) * deg,
  };
}

// ---------------- 품질 게이트 ----------------

// 안 맞는 것 하나만 보여준다. 근본적인 것부터 짚는 순서 (기능 정의서 F-07).
export const GATE_ORDER = ['front', 'eyes', 'hand', 'sharp', 'bright'];
export const GATE_MSG = {
  front: '조금만 정면으로',
  eyes: '양쪽 눈이 보이게 해 주세요',
  hand: '손을 내려 주세요',
  sharp: '잠시 멈춰 주세요',
  bright: '조금 더 밝은 곳에서',
};

/** flags = { front: true, eyes: false, ... } → 첫 번째로 걸린 것 하나만 */
export function resolveGate(flags) {
  for (const k of GATE_ORDER) {
    if (flags[k] === false) return { ok: false, firstFail: k, message: GATE_MSG[k] };
  }
  return { ok: true, firstFail: null, message: '확인받을 준비 됨' };
}

/** 연속 n프레임 충족해야 통과. 버튼이 깜빡이는 것을 막는다. */
export class Stability {
  constructor(n = 5) { this.n = n; this.run = 0; }
  push(ok) { this.run = ok ? this.run + 1 : 0; return this.ok; }
  get ok() { return this.run >= this.n; }
  reset() { this.run = 0; }
}

// ---------------- 1€ 필터 (Casiez et al., CHI 2012) ----------------
//
// 느릴 때는 많이 섞어 떨림을 없애고, 빠를 때는 적게 섞어 따라붙는다.
// 튜닝 절차: beta=0, minCutoff≈1 로 시작 → 가만히 두고 minCutoff를 내려 떨림 제거
//            → 빠르게 움직이며 beta를 0.0001부터 10배씩 올려 지연 제거

const alphaOf = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  /** x: 값, t: 초 단위 시각 */
  filter(x, t) {
    if (this.x === null || this.t === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-4, t - this.t);
    this.t = t;
    const dxRaw = (x - this.x) / dt;
    this.dx = this.dx + alphaOf(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x = this.x + alphaOf(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

/**
 * 랜드마크 전체에 축별로 1€ 필터를 건다. 얼굴이 사라지면 반드시 reset().
 *
 * 주의: 여기 들어오는 좌표는 정규화(0~1)라 속도 |dx|가 초당 1~3 수준으로 작다.
 * 논문이 예로 든 beta 0.0001 같은 값은 픽셀 단위 신호 기준이라 여기서는 아무 일도 일어나지 않는다.
 * 정규화 좌표에서는 beta가 1~20 규모여야 빠른 움직임에서 풀린다.
 */
export class LandmarkSmoother {
  constructor(opts = {}) { this.opts = { ...opts }; this.fx = new Map(); }
  reset() { this.fx.clear(); }
  /** 돌아가는 중에 파라미터를 바꾼다. 이미 만들어진 필터에도 반영된다. */
  setParams(opts) {
    Object.assign(this.opts, opts);
    for (const f of this.fx.values()) { Object.assign(f.x, opts); Object.assign(f.y, opts); }
    return this.opts;
  }
  apply(landmarks, tSec) {
    const out = new Array(landmarks.length);
    for (let i = 0; i < landmarks.length; i++) {
      let f = this.fx.get(i);
      if (!f) { f = { x: new OneEuroFilter(this.opts), y: new OneEuroFilter(this.opts) }; this.fx.set(i, f); }
      out[i] = { x: f.x.filter(landmarks[i].x, tSec), y: f.y.filter(landmarks[i].y, tSec), z: landmarks[i].z };
    }
    return out;
  }
}

// ---------------- 선명도 · 밝기 ----------------

/** RGBA 바이트 배열 → 그레이스케일 */
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return g;
}

/**
 * 라플라시안 분산. 선명하면 크고 흐리면 작다 (Pech-Pacheco et al., ICPR 2000).
 * 절대 임계는 기기·장면마다 흔들리므로 세션 기준 대비 비율로 쓸 것.
 */
export function laplacianVariance(gray, w, h) {
  if (w < 3 || h < 3) return 0;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      sum += v; sum2 += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** sRGB → CIE L*a*b* (D65) */
export function srgbToLab(r, g, b) {
  const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = k(x); y = k(y); z = k(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// ---------------- 자세: 두 경로 ----------------
//
// 같은 프레임에서 둘 다 계산해 차이를 본다. 어느 쪽이 옳은지가 아니라 "얼마나 다른지"를 잰다.

export const POSE_IDX = { faceL: 234, faceR: 454, noseTip: 1, forehead: 10, chin: 152 };

/** 랜드마크만으로 yaw/pitch 근사 (팀 정본 gate.js 의 anglesFromLandmarks 와 같은 식). 공짜 */
export function anglesFromLandmarks(pts) {
  const l = pts[POSE_IDX.faceL], r = pts[POSE_IDX.faceR], n = pts[POSE_IDX.noseTip];
  const top = pts[POSE_IDX.forehead], chin = pts[POSE_IDX.chin];
  return {
    yaw: ((n.x - l.x) / ((r.x - l.x) || 1) - 0.5) * 90,
    pitch: ((n.y - top.y) / ((chin.y - top.y) || 1) - 0.55) * 90,
    roll: Math.atan2(r.y - l.y, r.x - l.x) * 180 / Math.PI,
  };
}

// ---------------- 표정: 두 경로 ----------------

// R = 피험자 오른쪽 눈(화면 왼쪽). 팀 정본 eyeClosed 와 같은 인덱스
export const EAR_IDX = {
  R: { upper: [159, 158], lower: [145, 153], corner: [33, 133] },
  L: { upper: [386, 385], lower: [374, 380], corner: [263, 362] },
};
export const EAR_CLOSED = 0.15;   // 팀 정본 고정 임계

/** 눈 가로세로비. 공짜 */
export function earOf(pts, side) {
  const e = EAR_IDX[side];
  const d = (a, b) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
  const w = d(e.corner[0], e.corner[1]) || 1;
  return (d(e.upper[0], e.lower[0]) + d(e.upper[1], e.lower[1])) / (2 * w);
}

/** 블렌드셰이프 52종에서 이름으로 점수 뽑기. 없으면 null */
export function blendScore(categories, name) {
  if (!categories) return null;
  const c = categories.find((x) => (x.categoryName || x.displayName) === name);
  return c ? c.score : null;
}

// ---------------- 두 경로 비교 통계 ----------------

/** |a − b| 의 분포 */
export class DiffStats {
  constructor(cap = 900) { this.cap = cap; this.v = []; }
  push(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return this;
    this.v.push(Math.abs(a - b));
    if (this.v.length > this.cap) this.v.shift();
    return this;
  }
  reset() { this.v = []; }
  summary() {
    if (!this.v.length) return { n: 0, mean: 0, p95: 0, max: 0 };
    return { n: this.v.length, mean: this.v.reduce((x, y) => x + y, 0) / this.v.length, p95: percentile(this.v, 95), max: Math.max(...this.v) };
  }
}

/** 두 판정(불리언)이 얼마나 같은가. 어느 쪽만 참인지도 센다 */
export class AgreeStats {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.same = 0; this.aOnly = 0; this.bOnly = 0; }
  push(a, b) {
    if (a == null || b == null) return this;
    this.n++;
    if (a === b) this.same++; else if (a) this.aOnly++; else this.bOnly++;
    return this;
  }
  summary() { return { n: this.n, rate: this.n ? this.same / this.n : 0, aOnly: this.aOnly, bOnly: this.bOnly }; }
}

/** 최대·평균 (웃음 같은 계수가 실제로 반응하는지 확인용) */
export class PeakStats {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.sum = 0; this.max = 0; }
  push(v) { if (!Number.isFinite(v)) return this; this.n++; this.sum += v; if (v > this.max) this.max = v; return this; }
  summary() { return { n: this.n, max: this.max, mean: this.n ? this.sum / this.n : 0 }; }
}

// ---------------- 측정 ----------------

export function percentile(values, p) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const i = clamp(Math.round((p / 100) * (s.length - 1)), 0, s.length - 1);
  return s[i];
}

/** 최근 N개 구간 시간을 모아 평균·중앙값·p95·fps를 낸다. */
export class FrameStats {
  constructor(cap = 120) { this.cap = cap; this.v = []; }
  push(ms) { this.v.push(ms); if (this.v.length > this.cap) this.v.shift(); return this; }
  reset() { this.v = []; }
  summary() {
    if (!this.v.length) return { n: 0, avg: 0, p50: 0, p95: 0, max: 0, fps: 0 };
    const avg = this.v.reduce((a, b) => a + b, 0) / this.v.length;
    return {
      n: this.v.length,
      avg,
      p50: percentile(this.v, 50),
      p95: percentile(this.v, 95),
      max: Math.max(...this.v),
      fps: avg > 0 ? 1000 / avg : 0,
    };
  }
}
