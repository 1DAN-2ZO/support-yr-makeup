// 화면 3(부위 완성본) 핵심 계산 모듈 (순수 함수). 브라우저·Node 공용 ESM.
// DOM·캔버스·MediaPipe를 쓰지 않는다. 랜드마크 숫자만 다룬다.
// 얼굴형 판정은 하지 않는다 — label 을 입력으로 받는다 (파트 1 F-02 담당).

import { SMOKY, CONTOUR_RULES } from './rules.js';
import { ORIENTATION, ASPECT, SIDE_MARGIN, PORTRAIT_ZOOM } from './rules.js';

/** 부위 근거 한 줄. contour 는 얼굴형별 멘트. 숫자를 넣지 않는다. */
export function rationale(partId, faceShape = 'oval') {
  if (partId === 'contour') {
    const rule = CONTOUR_RULES[faceShape] || CONTOUR_RULES.oval;
    return rule.rationale;
  }
  const s = SMOKY.rationale[partId];
  if (!s) throw new Error(`알 수 없는 partId: ${partId}`);
  return s;
}

/** "지금 필요한 것: …" 한 줄. */
export function products(partId) {
  const p = SMOKY.products[partId];
  if (!p) throw new Error(`알 수 없는 partId: ${partId}`);
  return `지금 필요한 것: ${p}`;
}

// MediaPipe Face Landmarker 468점 + 홍채 10점 인덱스.
// ⚠️ 자료마다 조금씩 달라서 Task 4 에서 샘플에 그려 눈으로 확인한 뒤 확정한다.
// cheek 는 poc/app.js 에서 이미 쓰고 있는 값을 그대로 가져왔다.
export const IDX = {
  eyeOuter: { r: 33, l: 263 },
  eyeRing: {
    r: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    l: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  },
  brow: {
    r: [70, 63, 105, 66, 107, 46, 53, 52, 65, 55],
    l: [300, 293, 334, 296, 336, 276, 283, 282, 295, 285],
  },
  lipOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
  cheek: { r: [116, 117, 118, 101, 36, 205, 187, 123], l: [345, 346, 347, 330, 266, 425, 411, 352] },
  jawline: [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  faceEdge: { r: 234, l: 454 },
  foreheadTop: 10,
  foreheadSide: { r: 54, l: 284 },
  chinTip: 152,
  noseBridge: [168, 6, 197, 195, 5, 4],
  underEye: { r: [228, 229, 230, 231, 232], l: [448, 449, 450, 451, 452] },
  iris: { r: [469, 470, 471, 472], l: [474, 475, 476, 477] },
};

const PART_INDICES = {
  brow: [...IDX.brow.r, ...IDX.brow.l, IDX.eyeOuter.r, IDX.eyeOuter.l],
  liner: [...IDX.eyeRing.r, ...IDX.eyeRing.l],
  shadow: [...IDX.eyeRing.r, ...IDX.eyeRing.l, ...IDX.brow.r, ...IDX.brow.l],
  lip: [...IDX.lipOuter],
  cheek: [...IDX.cheek.r, ...IDX.cheek.l],
  contour: [...IDX.cheek.r, ...IDX.cheek.l, ...IDX.jawline, IDX.faceEdge.r, IDX.faceEdge.l],
};

const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 정규화 랜드마크 → 픽셀 좌표 배열 */
export function toPx(landmarks, imgSize, indices) {
  return indices.map((i) => {
    const p = landmarks[i];
    if (!p) throw new Error(`랜드마크 ${i} 없음`);
    return [p.x * imgSize.w, p.y * imgSize.h];
  });
}

export function partLandmarks(landmarks, imgSize, partId) {
  const idxs = PART_INDICES[partId];
  if (!idxs) throw new Error(`알 수 없는 partId: ${partId}`);
  return toPx(landmarks, imgSize, idxs);
}

export function boundsOf(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * 부위 크롭 박스. 여백 적용 → 종횡비 확장 → 경계 처리(축소는 마지막 수단).
 * clamped=true 는 문서의 여백·배수 가정값이 이 사진에서 성립하지 않는다는 신호다.
 */
export function cropSpec(landmarks, imgSize, partId, opts = {}) {
  const orientation = ORIENTATION[partId];
  if (!orientation) throw new Error(`알 수 없는 partId: ${partId}`);
  const aspect = ASPECT[orientation];
  const pts = partLandmarks(landmarks, imgSize, partId);
  const b = boundsOf(pts);

  let w, h;
  if (orientation === 'landscape') {
    w = b.w * (1 + 2 * (opts.sideMargin ?? SIDE_MARGIN));
    h = w / aspect;
  } else {
    w = imgSize.w / (opts.zoom ?? PORTRAIT_ZOOM);
    h = w / aspect;
  }
  // 부위가 박스보다 크면 담을 수 있을 만큼 키운다
  if (b.w > w) { w = b.w; h = w / aspect; }
  if (b.h > h) { h = b.h; w = h * aspect; }

  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const clampedSides = [];
  let clamped = false;

  // 1) 이미지보다 크면 축소 (확대율을 희생)
  if (w > imgSize.w || h > imgSize.h) {
    const k = Math.min(imgSize.w / w, imgSize.h / h);
    w *= k; h *= k; clamped = true;
  }
  // 2) 중심을 유지하되 이미지 안으로 이동
  let x = cx - w / 2, y = cy - h / 2;
  if (x < 0) clampedSides.push('left');
  if (y < 0) clampedSides.push('top');
  if (x + w > imgSize.w) clampedSides.push('right');
  if (y + h > imgSize.h) clampedSides.push('bottom');
  x = clampNum(x, 0, imgSize.w - w);
  y = clampNum(y, 0, imgSize.h - h);

  const covered = pts.every((p) => p[0] >= x - 0.5 && p[0] <= x + w + 0.5 && p[1] >= y - 0.5 && p[1] <= y + h + 0.5);
  return { x, y, w, h, orientation, aspect, zoomRatio: imgSize.w / w, covered, clamped, clampedSides };
}

const IRIS_MM = 11.7;

/** 홍채 지름 11.7mm 로 px→mm 척도. poc/app.js 의 irisScale 과 같은 방식. */
export function mmPerPx(landmarks, imgSize) {
  const d = (side) => {
    const p = toPx(landmarks, imgSize, IDX.iris[side]);
    return Math.max(
      Math.hypot(p[0][0] - p[2][0], p[0][1] - p[2][1]),
      Math.hypot(p[1][0] - p[3][0], p[1][1] - p[3][1]),
    );
  };
  const px = (d('r') + d('l')) / 2;
  return px > 2 ? IRIS_MM / px : 0.1;
}

const midOf = (pts) => {
  const n = pts.length || 1;
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
};

/** 폴리곤 배열에서 바운딩 박스가 가장 큰 것의 중심 */
function anchorOf(polys) {
  if (!polys.length) return [0, 0];
  let best = polys[0], bestArea = -1;
  for (const p of polys) {
    const b = boundsOf(p);
    const area = b.w * b.h;
    if (area > bestArea) { bestArea = area; best = p; }
  }
  return midOf(best);
}

/** 링 랜드마크를 중심 기준 위/아래로 갈라 폴리라인으로 만든다 (인덱스 추측 없이) */
const halfRing = (pts, which) => {
  const cy = midOf(pts)[1];
  const half = pts.filter((p) => (which === 'upper' ? p[1] <= cy : p[1] >= cy));
  return (half.length >= 2 ? half : pts).slice().sort((a, b) => a[0] - b[0]);
};

/** region 이름 → 폴리라인(픽셀) 배열. 좌우가 나뉘는 부위는 두 개를 돌려준다. */
const REGION_BUILDERS = {
  jawline: (lm, s) => [toPx(lm, s, IDX.jawline)],
  jawCorner: (lm, s) => {
    const j = toPx(lm, s, IDX.jawline);
    const k = Math.max(2, Math.round(j.length / 3));
    return [j.slice(0, k), j.slice(-k)];
  },
  underCheek: (lm, s) => [halfRing(toPx(lm, s, IDX.cheek.r), 'lower'), halfRing(toPx(lm, s, IDX.cheek.l), 'lower')],
  cheekTop: (lm, s) => [halfRing(toPx(lm, s, IDX.cheek.r), 'upper'), halfRing(toPx(lm, s, IDX.cheek.l), 'upper')],
  foreheadSide: (lm, s) => {
    const [top] = toPx(lm, s, [IDX.foreheadTop]);
    const [r] = toPx(lm, s, [IDX.foreheadSide.r]);
    const [l] = toPx(lm, s, [IDX.foreheadSide.l]);
    return [[r, [(r[0] + top[0]) / 2, top[1]]], [l, [(l[0] + top[0]) / 2, top[1]]]];
  },
  foreheadTop: (lm, s) => {
    const [r] = toPx(lm, s, [IDX.foreheadSide.r]);
    const [l] = toPx(lm, s, [IDX.foreheadSide.l]);
    const [top] = toPx(lm, s, [IDX.foreheadTop]);
    return [[[r[0], top[1]], [l[0], top[1]]]];
  },
  chinTip: (lm, s) => {
    const [c] = toPx(lm, s, [IDX.chinTip]);
    const d = s.w * 0.06;
    return [[[c[0] - d, c[1]], [c[0] + d, c[1]]]];
  },
  noseBridge: (lm, s) => [toPx(lm, s, IDX.noseBridge)],
  tZone: (lm, s) => [toPx(lm, s, [IDX.foreheadTop, ...IDX.noseBridge])],
  underEye: (lm, s) => [toPx(lm, s, IDX.underEye.r), toPx(lm, s, IDX.underEye.l)],
};

export const REGION_NAMES = Object.keys(REGION_BUILDERS);

/** 폴리라인을 법선 방향으로 ±half 밀어 닫힌 밴드 폴리곤으로 만든다. */
function bandFromPolyline(pts, widthPx) {
  if (pts.length < 2) return [];
  const half = widthPx / 2, up = [], dn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx;
    up.push([pts[i][0] + nx * half, pts[i][1] + ny * half]);
    dn.push([pts[i][0] - nx * half, pts[i][1] - ny * half]);
  }
  return [...up, ...dn.reverse()];
}

/**
 * 얼굴형 규칙으로 쉐딩·하이라이트 자리를 만든다.
 * 얼굴형 판정은 하지 않는다 — faceShape 는 파트 1(F-02)이 주는 label 이다.
 * 법선 맵이 없으므로 source 는 항상 'landmark_only'.
 */
export function contourOutline(landmarks, imgSize, faceShape = 'oval') {
  const rule = CONTOUR_RULES[faceShape] || CONTOUR_RULES.oval;
  const mm = mmPerPx(landmarks, imgSize);
  const build = (specs) => specs.flatMap(({ region, widthMm }) => {
    const lines = (REGION_BUILDERS[region] || (() => []))(landmarks, imgSize);
    return lines.map((line) => bandFromPolyline(line, widthMm / mm)).filter((p) => p.length >= 4);
  });
  const shading = build(rule.shading);
  const highlight = build(rule.highlight);

  // 라벨 앵커: 각 그룹에서 가장 큰 폴리곤의 중심
  const shadingAnchor = anchorOf(shading);
  const highlightAnchor = anchorOf(highlight);

  // 두 앵커가 너무 가까우면 y 방향으로 벌린다
  const minDist = imgSize.h * 0.06;
  const sx = shadingAnchor[0], sy = shadingAnchor[1];
  const hx = highlightAnchor[0], hy = highlightAnchor[1];
  const dist = Math.hypot(sx - hx, sy - hy);

  if (dist < minDist) {
    const half = minDist / 2;
    // 쉐딩을 아래로, 하이라이트를 위로 민다
    shadingAnchor[1] = clampNum(sy + half, 0, imgSize.h);
    highlightAnchor[1] = clampNum(hy - half, 0, imgSize.h);
  }

  return {
    shading, highlight,
    labels: [
      { text: '쉐딩', anchor: shadingAnchor },
      { text: '하이라이트', anchor: highlightAnchor },
    ],
    source: 'landmark_only',
  };
}
