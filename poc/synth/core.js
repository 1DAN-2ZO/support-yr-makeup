// 합성 학습 데이터 생성기 — 핵심 계산 모듈 (순수 함수). 브라우저·Node 공용 ESM.
//
// 맨얼굴 랜드마크(MediaPipe 468점)에서 부위별 화장 폴리곤을 절차적으로 만든다.
// 그린 폴리곤이 곧 정답 마스크이므로 사람이 라벨을 달 필요가 없다.
// DOM·캔버스를 쓰지 않는다. 렌더링은 app.js가 한다.

// ---------------- 랜드마크 인덱스 ----------------

export const IDX = {
  // 눈 테두리 (중심 계산용)
  eyeRingL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeRingR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  // 윗속눈썹 선 (바깥 → 안쪽). 라이너·섀도우 기준선
  lashUpperL: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  lashUpperR: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  // 눈썹 (위 능선 + 아래 능선)
  browUpperL: [70, 63, 105, 66, 107],
  browLowerL: [55, 65, 52, 53, 46],
  browUpperR: [300, 293, 334, 296, 336],
  browLowerR: [285, 295, 282, 283, 276],
  // 입술 바깥 테두리 (닫힌 고리)
  lipOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  // 볼터치 기준점 (눈 아래 ~ 입꼬리 사이에서 잡는다)
  eyeBottomL: 145, eyeBottomR: 374,
  mouthCornerL: 61, mouthCornerR: 291,
  // 척도
  eyeOuterL: 33, eyeOuterR: 263,
};

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek'];

// 마스크 라벨값. 부위마다 고유해야 한다 (0 = 배경)
export const PART_LABEL = { brow: 1, liner: 2, shadow: 3, lip: 4, cheek: 5 };

// ---------------- 난수 (시드 고정 → 재현 가능) ----------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

// 색 후보. 룩 템플릿의 "색 계열"에 대응한다 (브랜드·상품명 없음)
export const PALETTE = {
  brow: ['#4a3728', '#5c4033', '#6b4f3a', '#3d2b1f'],
  liner: ['#12100f', '#1c1917', '#3b2f2a'],
  shadow: ['#8b6f5e', '#a67f6b', '#7d5f52', '#b08a7a'],
  lip: ['#c2615e', '#d4776f', '#b8504f', '#cf8177', '#a84a52'],
  cheek: ['#e08b86', '#dd7f7f', '#e69a92'],
};

/**
 * 한 장을 만들 변형 파라미터. 같은 seed면 항상 같은 값이 나온다.
 * 값은 전부 눈 너비·얼굴 너비에 대한 비율이라 해상도와 무관하다.
 */
export function randomParams(seed) {
  const rng = mulberry32(seed);
  // 좌우 비대칭. 실제 초보자 화장을 흉내내고, 채점기의 좌우 차이 판정 학습에도 쓰인다
  const asym = between(rng, -0.18, 0.18);
  return {
    seed,
    asym,
    brow: {
      color: pick(rng, PALETTE.brow),
      alpha: between(rng, 0.4, 0.72),
      fill: between(rng, 1.0, 1.18),      // 자연 눈썹보다 얼마나 키워 그리나
      tailLift: between(rng, -0.1, 0.22), // 꼬리를 올리는 정도 (눈 너비 비율)
    },
    liner: {
      color: pick(rng, PALETTE.liner),
      alpha: between(rng, 0.75, 1.0),
      thickness: between(rng, 0.05, 0.13), // 눈 너비 비율
      wingLen: between(rng, 0.0, 0.30),
      wingAngle: between(rng, 0.05, 0.55),  // 라디안, 위로
    },
    shadow: {
      color: pick(rng, PALETTE.shadow),
      alpha: between(rng, 0.2, 0.5),
      height: between(rng, 0.15, 0.42),     // 눈 너비 비율
      present: rng() > 0.25,
    },
    lip: {
      color: pick(rng, PALETTE.lip),
      alpha: between(rng, 0.6, 0.95),
      overline: between(rng, -0.04, 0.10),  // 음수면 안쪽으로 작게
    },
    cheek: {
      color: pick(rng, PALETTE.cheek),
      alpha: between(rng, 0.15, 0.4),
      radius: between(rng, 0.22, 0.40),     // 얼굴 너비 비율
      present: rng() > 0.2,
    },
  };
}

// ---------------- 기하 도우미 ----------------

const P = (x, y) => ({ x, y });
const sub = (a, b) => P(a.x - b.x, a.y - b.y);
const add = (a, b) => P(a.x + b.x, a.y + b.y);
const mul = (a, k) => P(a.x * k, a.y * k);
const len = (a) => Math.hypot(a.x, a.y) || 1;
const norm = (a) => mul(a, 1 / len(a));
const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

const at = (lm, i) => P(lm[i].x, lm[i].y);
const many = (lm, idxs) => idxs.map((i) => at(lm, i));

export function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return P(x / poly.length, y / poly.length);
}

/** 신발끈 공식. 방향과 무관하게 양수로 돌려준다. */
export function polygonArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** 각 점의 법선. away에서 멀어지는 쪽을 향하도록 부호를 맞춘다. */
function outwardNormals(pts, away) {
  const ns = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const t = norm(sub(b, a));
    return P(-t.y, t.x);
  });
  const m = Math.floor(pts.length / 2);
  const d = sub(pts[m], away);
  const s = ns[m].x * d.x + ns[m].y * d.y >= 0 ? 1 : -1;
  return ns.map((n) => mul(n, s));
}

/** 기준선을 바깥으로 두께만큼 밀어 띠 모양 폴리곤을 만든다. */
function band(pts, away, thicknessAt) {
  const ns = outwardNormals(pts, away);
  const outer = pts.map((p, i) => add(p, mul(ns[i], thicknessAt(i, pts.length))));
  return [...outer, ...pts.slice().reverse()];
}

/** 얼굴 척도: 양 눈 바깥 끝 사이 거리 */
export function faceWidth(lm) {
  return len(sub(at(lm, IDX.eyeOuterR), at(lm, IDX.eyeOuterL)));
}

function eyeWidth(lm, side) {
  const lash = many(lm, side === 'L' ? IDX.lashUpperL : IDX.lashUpperR);
  return len(sub(lash[lash.length - 1], lash[0]));
}

// ---------------- 부위별 폴리곤 ----------------

/** 아이라이너: 윗속눈썹 선을 바깥으로 밀고, 바깥 끝에 꼬리를 붙인다. */
export function linerPolygon(lm, side, p) {
  const lash = many(lm, side === 'L' ? IDX.lashUpperL : IDX.lashUpperR);
  const ring = many(lm, side === 'L' ? IDX.eyeRingL : IDX.eyeRingR);
  const eye = eyeWidth(lm, side);
  const c = centroid(ring);

  // 바깥이 두껍고 안쪽으로 갈수록 얇아진다
  const base = eye * p.thickness;
  const poly = band(lash, c, (i, n) => base * (1 - 0.55 * (i / (n - 1))));

  if (p.wingLen > 0.01) {
    const outer = lash[0], inner = lash[lash.length - 1];
    const dir = norm(sub(outer, inner));
    // 화면 좌표는 y가 아래로 커진다. 꼬리는 양쪽 다 위로 뻗어야 하므로
    // 바깥 방향이 서로 반대인 좌우는 회전 부호도 반대여야 한다.
    const a = side === 'L' ? p.wingAngle : -p.wingAngle;
    const rot = P(dir.x * Math.cos(a) - dir.y * Math.sin(a), dir.x * Math.sin(a) + dir.y * Math.cos(a));
    const tip = add(outer, mul(rot, eye * p.wingLen));
    poly.unshift(tip);
  }
  return poly;
}

/** 섀도우: 속눈썹 선 위쪽 눈꺼풀 띠. 라이너보다 넓고 연하다. */
export function shadowPolygon(lm, side, p) {
  const lash = many(lm, side === 'L' ? IDX.lashUpperL : IDX.lashUpperR);
  const ring = many(lm, side === 'L' ? IDX.eyeRingL : IDX.eyeRingR);
  const eye = eyeWidth(lm, side);
  const c = centroid(ring);
  const h = eye * p.height;
  // 가운데가 가장 높은 둥근 띠
  return band(lash, c, (i, n) => {
    const t = i / (n - 1);
    return h * (0.45 + 0.55 * Math.sin(Math.PI * t));
  });
}

/** 눈썹: 자연 눈썹 테두리를 중심에서 키우고 꼬리를 들어올린다. */
export function browPolygon(lm, side, p) {
  const upper = many(lm, side === 'L' ? IDX.browUpperL : IDX.browUpperR);
  const lower = many(lm, side === 'L' ? IDX.browLowerL : IDX.browLowerR);
  const poly = [...upper, ...lower];
  const c = centroid(poly);
  const eye = eyeWidth(lm, side);

  // 꼬리(바깥 끝)가 어디인지: 얼굴 중심에서 먼 쪽
  const faceC = centroid(many(lm, [IDX.eyeOuterL, IDX.eyeOuterR]));
  const tailIsFirst = len(sub(upper[0], faceC)) > len(sub(upper[upper.length - 1], faceC));

  return poly.map((pt, i) => {
    const grown = add(c, mul(sub(pt, c), p.fill));
    // 꼬리 쪽 점일수록 위로 더 든다
    const idxInUpper = i < upper.length ? i : poly.length - 1 - i + upper.length - 1;
    const t = upper.length > 1 ? idxInUpper / (upper.length - 1) : 0;
    const w = tailIsFirst ? 1 - t : t;
    return P(grown.x, grown.y - eye * p.tailLift * Math.max(0, w));
  });
}

/** 입술: 바깥 테두리를 중심에서 키우거나 줄인다 (오버립 / 인립). */
export function lipPolygon(lm, p) {
  const poly = many(lm, IDX.lipOuter);
  const c = centroid(poly);
  const k = 1 + p.overline;
  return poly.map((pt) => add(c, mul(sub(pt, c), k)));
}

/** 볼터치: 광대 위. 눈 아래와 입꼬리 사이에서 잡고 바깥쪽으로 밀어낸다. */
export function cheekPolygon(lm, side, p, steps = 24) {
  const eyeB = at(lm, side === 'L' ? IDX.eyeBottomL : IDX.eyeBottomR);
  const mouth = at(lm, side === 'L' ? IDX.mouthCornerL : IDX.mouthCornerR);
  const fw = faceWidth(lm);
  // 그냥 눈과 입 사이를 반으로 나누면 코 옆에 붙어 다크서클처럼 보인다.
  // 얼굴 중심 반대쪽으로 밀어 광대 위에 오게 한다.
  const faceC = centroid(many(lm, [IDX.eyeOuterL, IDX.eyeOuterR]));
  const mid = lerp(eyeB, mouth, 0.5);
  const c = P(mid.x + Math.sign(mid.x - faceC.x) * fw * 0.12, mid.y);
  const rx = fw * p.radius * 0.5;
  const ry = rx * 0.62;
  const out = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(P(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry));
  }
  return out;
}

// ---------------- 한 장 조립 ----------------

/**
 * 랜드마크 + 파라미터 → 그릴 것들의 목록.
 * 그리는 순서대로 담는다 (섀도우 → 라이너 → 눈썹 → 입술 → 볼터치).
 * 각 항목의 polys가 곧 그 부위의 정답 마스크다.
 */
export function buildSample(lm, params) {
  const parts = [];
  const side = (base, k) => ({ ...base, [k]: base[k] * (1 + params.asym) });
  const sideNeg = (base, k) => ({ ...base, [k]: base[k] * (1 - params.asym) });

  if (params.shadow.present) {
    parts.push({
      id: 'shadow', label: PART_LABEL.shadow,
      color: params.shadow.color, alpha: params.shadow.alpha, feather: 0.5,
      polys: [
        shadowPolygon(lm, 'L', side(params.shadow, 'height')),
        shadowPolygon(lm, 'R', sideNeg(params.shadow, 'height')),
      ],
    });
  }
  parts.push({
    id: 'liner', label: PART_LABEL.liner,
    color: params.liner.color, alpha: params.liner.alpha, feather: 0.06,
    polys: [
      linerPolygon(lm, 'L', side(params.liner, 'thickness')),
      linerPolygon(lm, 'R', sideNeg(params.liner, 'thickness')),
    ],
  });
  parts.push({
    id: 'brow', label: PART_LABEL.brow,
    color: params.brow.color, alpha: params.brow.alpha, feather: 0.22,
    polys: [
      browPolygon(lm, 'L', side(params.brow, 'fill')),
      browPolygon(lm, 'R', sideNeg(params.brow, 'fill')),
    ],
  });
  parts.push({
    id: 'lip', label: PART_LABEL.lip,
    color: params.lip.color, alpha: params.lip.alpha, feather: 0.08,
    polys: [lipPolygon(lm, params.lip)],
  });
  if (params.cheek.present) {
    parts.push({
      id: 'cheek', label: PART_LABEL.cheek,
      color: params.cheek.color, alpha: params.cheek.alpha, feather: 0.7,
      polys: [
        cheekPolygon(lm, 'L', side(params.cheek, 'radius')),
        cheekPolygon(lm, 'R', sideNeg(params.cheek, 'radius')),
      ],
    });
  }
  return { params, parts };
}

/** 부위별 마스크 면적 (픽셀²). 학습 데이터 통계·검증용. */
export function sampleStats(sample) {
  const out = {};
  for (const part of sample.parts) {
    out[part.id] = part.polys.reduce((s, poly) => s + polygonArea(poly), 0);
  }
  return out;
}
