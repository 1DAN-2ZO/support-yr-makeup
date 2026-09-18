// 화면 3 부위 완성본 — 크롭 박스 계산 (순수 함수). 브라우저·Node 공용 ESM.
//
// 완성본 이미지에서 "이 부위를 어디까지 잘라 보여줄 것인가"를 정한다.
// 좌표는 전부 랜드마크 기준이라 화면 방향·해상도와 무관하다 (impl-screen1-5 3-2b).
//
// DOM·캔버스를 쓰지 않는다. 그리는 것은 호출하는 쪽이 한다.

// ---------------- 랜드마크 인덱스 ----------------

export const IDX = {
  // 척도·기준
  eyeOuterL: 33, eyeOuterR: 263,
  chin: 152,
  faceLeft: 234, faceRight: 454,   // 얼굴에서 가장 넓은 두 점 (광대 바깥)

  // 부위
  browL: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  browR: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  eyeRingL: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  eyeRingR: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  lipOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],

  // 볼터치 기준 (눈 아래 ~ 입꼬리 사이를 바깥으로 민 자리. poc/synth와 같은 규칙)
  eyeBottomL: 145, eyeBottomR: 374,
  mouthCornerL: 61, mouthCornerR: 291,

  // 얼굴 윤곽 (쉐딩·하이라이트 범위 산출용)
  faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
             378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
             162, 21, 54, 103, 67, 109],
};

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek', 'contour'];

/**
 * 부위별 화면 방향 (screen-image-brief-v6 화면 3).
 * 눈썹·아이라이너·섀도우는 좌우를 같이 봐야 해서 가로, 나머지는 세로.
 */
export const PART_ORIENTATION = {
  brow: 'landscape', liner: 'landscape', shadow: 'landscape',
  lip: 'portrait', cheek: 'portrait', contour: 'portrait',
};

/** 표시 영역 종횡비 기본값 (가로/세로). 실제 값은 호출하는 쪽이 넘긴다. */
export const DEFAULT_ASPECT = { landscape: 16 / 9, portrait: 3 / 4 };

/**
 * 부위를 감쌀 여백. 부위 크기에 대한 비율이다.
 * 눈 단계는 브리프의 "여백 15%"를 그대로 쓴다.
 * 입술은 0.15에서 얼굴 대비 약 2.4배가 나온다 (브리프의 "2~3배").
 */
export const DEFAULT_MARGIN = {
  brow: 0.15, liner: 0.15, shadow: 0.15,
  lip: 0.15, cheek: 0.18, contour: 0.10,
};

/**
 * 얼굴 대비 확대율의 상한. **좌우를 같이 담아야 하는 부위는 1배를 넘을 수 없다.**
 *
 * 눈썹·아이라이너·섀도우는 양쪽 눈(얼굴 너비의 0.69배)을,
 * 볼터치는 양쪽 볼(0.96배)을, 쉐딩은 광대~턱(1.0배)을 한 화면에 담아야 한다.
 * 그래서 `zoom`(얼굴 너비 ÷ 크롭 너비)이 1 근처에서 묶인다.
 *
 * 브리프의 "2~3배 확대"가 실제로 가능한 부위는 **입술뿐**이다.
 * 나머지 부위에서 사용자가 느끼는 확대는 `zoom`이 아니라
 * **크롭을 화면에 꽉 채우는 것**(`upscaleFactor`)에서 온다.
 */
export const ZOOM_NOTE = '좌우를 같이 담는 부위는 zoom ≤ 약 1.1. 입술만 2~3배 가능.';

// ---------------- 기하 도우미 ----------------

const at = (lm, i) => {
  const p = lm[i];
  return Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y };
};

function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const union = (a, b) => {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** 박스를 중심 기준으로 비율만큼 키운다. */
export function padBox(box, ratio) {
  const dx = box.w * ratio, dy = box.h * ratio;
  return { x: box.x - dx, y: box.y - dy, w: box.w + dx * 2, h: box.h + dy * 2 };
}

/**
 * 목표 종횡비에 맞춘다. **절대 줄이지 않고 늘리기만 한다** —
 * 줄이면 부위가 화면 밖으로 잘려 나간다.
 */
export function fitAspect(box, aspect) {
  const cur = box.w / box.h;
  if (Math.abs(cur - aspect) < 1e-9) return { ...box };
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let { w, h } = box;
  if (cur < aspect) w = h * aspect;   // 너무 좁다 → 가로로 늘림
  else h = w / aspect;                // 너무 넓다 → 세로로 늘림
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * 이미지 안으로 넣는다. 종횡비는 유지한다.
 * 이미지보다 크면 먼저 줄이고(그만큼 확대율이 떨어진다), 그다음 안쪽으로 민다.
 */
export function clampToImage(box, imgW, imgH) {
  let { x, y, w, h } = box;
  const k = Math.min(1, imgW / w, imgH / h);
  if (k < 1) {
    const cx = x + w / 2, cy = y + h / 2;
    w *= k; h *= k; x = cx - w / 2; y = cy - h / 2;
  }
  x = Math.min(Math.max(x, 0), imgW - w);
  y = Math.min(Math.max(y, 0), imgH - h);
  return { x, y, w, h, clamped: k < 1 };
}

/** 얼굴 너비 — 가장 넓은 두 점(광대 바깥) 사이. 확대율의 기준이다. */
export const faceWidth = (lm) => Math.abs(at(lm, IDX.faceRight).x - at(lm, IDX.faceLeft).x);

/** 눈 바깥 끝 사이 거리. 얼굴 너비와 다르다 (실측 약 0.68배). */
export const eyeSpan = (lm) => Math.abs(at(lm, IDX.eyeOuterR).x - at(lm, IDX.eyeOuterL).x);

// ---------------- 부위 영역 ----------------

/** 볼터치 자리. poc/synth/core.js의 cheekPolygon과 같은 규칙으로 잡는다. */
function cheekBounds(lm) {
  const fw = Math.abs(at(lm, IDX.faceRight).x - at(lm, IDX.faceLeft).x);
  const faceCx = (at(lm, IDX.eyeOuterL).x + at(lm, IDX.eyeOuterR).x) / 2;
  const pts = [];
  for (const side of ['L', 'R']) {
    const eyeB = at(lm, side === 'L' ? IDX.eyeBottomL : IDX.eyeBottomR);
    const mouth = at(lm, side === 'L' ? IDX.mouthCornerL : IDX.mouthCornerR);
    const mid = { x: (eyeB.x + mouth.x) / 2, y: (eyeB.y + mouth.y) / 2 };
    const c = { x: mid.x + Math.sign(mid.x - faceCx) * fw * 0.12, y: mid.y };
    const rx = fw * 0.31 * 0.5, ry = rx * 0.62;   // 반지름 기본값(0.22~0.40의 중간)
    pts.push({ x: c.x - rx, y: c.y - ry }, { x: c.x + rx, y: c.y + ry });
  }
  return bounds(pts);
}

/** 쉐딩·하이라이트 범위. 광대(얼굴 최대 폭)에서 턱 끝까지 (화면 브리프 3-c). */
function contourBounds(lm) {
  const l = at(lm, IDX.faceLeft), r = at(lm, IDX.faceRight), chin = at(lm, IDX.chin);
  const top = Math.min(l.y, r.y);
  return { x: Math.min(l.x, r.x), y: top, w: Math.abs(r.x - l.x), h: chin.y - top };
}

/** 부위 자체를 감싸는 최소 박스 (여백·종횡비 적용 전). */
export function partBounds(lm, partId) {
  const many = (idxs) => bounds(idxs.map((i) => at(lm, i)));
  switch (partId) {
    case 'brow':   return union(many(IDX.browL), many(IDX.browR));
    case 'liner':
    case 'shadow': return union(many(IDX.eyeRingL), many(IDX.eyeRingR));
    case 'lip':    return many(IDX.lipOuter);
    case 'cheek':  return cheekBounds(lm);
    case 'contour':return contourBounds(lm);
    default: throw new Error(`알 수 없는 부위: ${partId}`);
  }
}

// ---------------- 크롭 박스 ----------------

/**
 * 부위 하나의 크롭 박스를 만든다.
 *
 * 가로 부위(눈썹·아이라이너·섀도우)는 **양쪽 눈 바깥 끝에서 끝까지**를 반드시 포함한다
 * (screen-image-brief-v6: "눈 바깥쪽 끝에서 끝까지 + 여백 15%").
 * 눈썹은 눈보다 위에 있으므로 세로 범위는 눈썹까지 넓힌다.
 *
 * @param {Array} lm 랜드마크 468점 이상 ([x,y] 또는 {x,y})
 * @param {string} partId brow|liner|shadow|lip|cheek|contour
 * @param {object} opts { imageW, imageH, aspect, margin }
 * @returns {object} CropSpec
 */
export function cropSpec(lm, partId, opts = {}) {
  if (!PART_IDS.includes(partId)) throw new Error(`알 수 없는 부위: ${partId}`);
  const orientation = PART_ORIENTATION[partId];
  const aspect = opts.aspect ?? DEFAULT_ASPECT[orientation];
  const margin = opts.margin ?? DEFAULT_MARGIN[partId];
  if (!(aspect > 0)) throw new Error(`종횡비가 잘못됐습니다: ${aspect}`);

  let content = partBounds(lm, partId);

  // 가로 부위는 양쪽 눈 바깥 끝을 가로 범위에 강제로 포함시킨다
  if (orientation === 'landscape') {
    const l = at(lm, IDX.eyeOuterL), r = at(lm, IDX.eyeOuterR);
    content = union(content, { x: Math.min(l.x, r.x), y: Math.min(l.y, r.y),
                               w: Math.abs(r.x - l.x), h: Math.abs(r.y - l.y) });
  }

  const padded = padBox(content, margin);
  const fitted = fitAspect(padded, aspect);
  const box = opts.imageW && opts.imageH
    ? clampToImage(fitted, opts.imageW, opts.imageH)
    : { ...fitted, clamped: false };

  const fw = faceWidth(lm);
  return {
    partId,
    orientation,
    aspect,
    margin,
    content,                        // 여백 전 부위 범위 (검증·디버그용)
    box: { x: box.x, y: box.y, w: box.w, h: box.h },
    clamped: box.clamped,
    // 얼굴 전체를 볼 때 대비 몇 배로 확대되나. 브리프의 "2~3배"가 이 값이다
    zoom: fw / box.w,
  };
}

/** 부위 6개를 한 번에. 진행 칩으로 이동할 때 미리 계산해 두면 된다. */
export function allCropSpecs(lm, opts = {}) {
  return Object.fromEntries(PART_IDS.map((p) => [p, cropSpec(lm, p, opts)]));
}

/**
 * 크롭 박스를 표시 영역에 채울 때의 확대 배율.
 * 완성본 원본이 작으면 이 값이 커지고, 화질이 그만큼 떨어진다
 * (`docs/screen3-tech-v6.md` 3장의 7.4배 / 3.6배가 이 계산이다).
 */
export function upscaleFactor(spec, displayW) {
  return displayW / spec.box.w;
}

/** 부위 랜드마크가 박스 안에 전부 들어가는지. 검증용. */
export function containsPart(spec, lm) {
  const b = spec.box, c = spec.content;
  return c.x >= b.x - 1e-6 && c.y >= b.y - 1e-6 &&
         c.x + c.w <= b.x + b.w + 1e-6 && c.y + c.h <= b.y + b.h + 1e-6;
}
