// 화장 렌더링 2판 — "색을 덮어쓰지 않고 얇은 층을 덮는" 방식.
//
// 왜 1판(paint.js)이 촌스러워 보였나
// ---------------------------------
// 색을 위에 칠해 덮어버려서, 원본 입술의 주름·광택·음영이 사라진다. 그래서
//   ① 부위 안이 단색으로 평평하고  ② 색이 피부 위에 떠 있고  ③ 경계가 칼로 자른 듯하다.
//
// 논문이 말하는 해법 네 가지를 그대로 넣었다.
//   1. 밝기는 원본 것을 쓰고 색만 바꾼다 (Guo & Sim 2009 의 층 분해, Perfect Corp 의 휘도 변환)
//   2. 색 계산을 선형 공간에서 한다 — sRGB 값끼리 섞으면 물리적으로 틀린 색이 나온다
//   3. 원본의 잔무늬(고주파)를 화장 위에 되돌린다 (CSD-MT 2024: 화장은 저주파에만 있다)
//   4. 경계에서 안쪽으로 진해지는 두께 그라데이션 — 가운데가 진한 립스틱이 저절로 나온다
//
// 여기서는 정지 사진 기준으로 픽셀을 직접 다룬다. 실시간은 이 결과를 보고
// 셰이더로 옮길지 판단한다.

/** sRGB(화면 값) → 선형(빛의 양). 색을 섞으려면 선형이어야 맞다 */
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  S2L[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const l2s = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};
/** 사람이 느끼는 밝기 (선형 값 기준) */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [S2L[(n >> 16) & 255], S2L[(n >> 8) & 255], S2L[n & 255]];
};

/**
 * 마스크 그림(흰=칠할 곳)에서 '두께 지도'를 만든다.
 * 경계에서 멀수록 1에 가까워져, 가운데가 진하고 가장자리가 옅어진다.
 * 정확한 거리 변환 대신 흐림을 여러 번 겹쳐 근사한다 — 캔버스만으로 되고 충분히 비슷하다.
 * @param {number} feather 번지는 폭 (px)
 */
function thicknessMap(maskCanvas, w, h, feather) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.filter = `blur(${Math.max(0.5, feather)}px)`;
  c.drawImage(maskCanvas, 0, 0, w, h);
  c.filter = "none";
  const d = c.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    // 흐린 마스크를 그대로 쓰면 경계가 밋밋하다. 살짝 S자로 눌러 가운데를 더 진하게.
    const a = d[i * 4 + 3] / 255;
    out[i] = a * a * (3 - 2 * a);
  }
  return out;
}

/**
 * 피부 보정 — 화장을 얹기 '전에' 바탕을 만든다 (소다 같은 뷰티 앱이 하는 첫 단계).
 *
 * 맨 피부의 모공·잡티·그림자 위에 색만 칠하면 그 색이 붙인 것처럼 뜬다.
 * 실제 화장도 프라이머·파운데이션으로 피부결을 먼저 정리하고 색을 올린다.
 *
 * 방법은 '주파수 분리'다. 사진을 큰 덩어리(색·명암)와 잔무늬(모공·잡티)로 나눈 뒤,
 * 잔무늬만 약하게 줄인다. 그래서 윤곽과 이목구비는 선명한 채로 피부만 고와진다.
 * @param {number} amount 0~1 — 잔무늬를 얼마나 줄일지
 */
export function smoothSkin(srcCanvas, amount = 0.6, radius = null) {
  const w = srcCanvas.width, h = srcCanvas.height;
  if (amount <= 0) return srcCanvas;
  const r = radius ?? Math.max(1.5, Math.min(w, h) * 0.008);
  const blurred = detailLayer(srcCanvas, w, h, r);
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const oc = out.getContext("2d");
  const img = oc.createImageData(w, h);
  const s = src.data, d = img.data;
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    for (let c = 0; c < 3; c++) {
      const detail = s[k + c] - blurred[k + c];
      // 큰 굴곡(윤곽·그림자)은 그대로 두고, 작은 잔무늬만 줄인다.
      // 차이가 클수록 덜 지운다 — 눈·눈썹 같은 또렷한 경계를 지키려고.
      const keep = Math.min(1, Math.abs(detail) / 26);
      d[k + c] = Math.max(0, Math.min(255, blurred[k + c] + detail * (keep + (1 - keep) * (1 - amount))));
    }
    d[k + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  return out;
}

/**
 * 전체 색감 통일 — 화장을 얹은 '뒤' 마지막에 한 겹 덮는다.
 * 칠한 부분과 안 칠한 피부가 같은 색 공간에 들어가 경계가 덜 보인다.
 * 소다가 "필터와 메이크업의 콜라보"라고 말하는 그 단계다.
 * @param {number} warmth 따뜻하게(+)/차갑게(−) 0~1
 * @param {number} lift 전체를 밝게 0~1
 */
export function toneFilter(ctx, w, h, { warmth = 0.25, lift = 0.15, fade = 0.08 } = {}) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    for (let c = 0; c < 3; c++) {
      let v = d[k + c] / 255;
      v = v + (1 - v) * lift * 0.35; // 밝히기 — 어두운 쪽을 더 많이 올린다
      v = fade + v * (1 - fade); // 아주 어두운 곳을 살짝 들어 올려 필름 같은 느낌
      d[k + c] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
    d[k] = Math.min(255, d[k] + warmth * 10); // 붉은기
    d[k + 2] = Math.max(0, d[k + 2] - warmth * 6); // 푸른기 덜기
  }
  ctx.putImageData(img, 0, 0);
}

/** 원본에서 잔무늬(주름·솜털·광택)만 뽑는다 — 화장을 얹은 뒤 되돌려 준다 */
function detailLayer(srcCanvas, w, h, radius) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.filter = `blur(${radius}px)`;
  c.drawImage(srcCanvas, 0, 0);
  c.filter = "none";
  return c.getImageData(0, 0, w, h).data;
}

/**
 * 한 장에 화장을 얹는다.
 * @param {CanvasRenderingContext2D} ctx 결과를 그릴 곳 (원본이 이미 그려져 있어야 한다)
 * @param {HTMLCanvasElement} srcCanvas 원본 사진
 * @param {object} parts {부위이름: {mask, color, alpha, feather, gloss}}
 * @param {object} opt {detail: 잔무늬 되돌리는 세기(0~1.5), sharpen: 음영 선명화(0~1)}
 */
export function renderMakeup(ctx, srcCanvas, parts, opt = {}) {
  const w = srcCanvas.width, h = srcCanvas.height;
  // 잔무늬를 그대로 다 되돌리면 입 다문 선·주름이 시커멓게 도드라져 지저분해진다.
  // 화장 앱은 사실적이기만 해서는 안 되고 예뻐 보여야 하므로 기본을 약하게 잡는다.
  const detailAmt = opt.detail ?? 0.4;
  const keep = opt.lumKeep ?? 0.65;
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, o = out.data;

  // 잔무늬 = 원본 − 흐린 원본. 화장을 얹은 뒤 다시 더해 질감을 살린다.
  const blurR = Math.max(1, Math.round(Math.min(w, h) * 0.006));
  const blurred = detailAmt > 0 ? detailLayer(srcCanvas, w, h, blurR) : null;

  // 부위마다 두께 지도를 미리 만든다
  const layers = [];
  for (const [name, p] of Object.entries(parts)) {
    if (!p || !p.mask || p.alpha <= 0) continue;
    layers.push({
      name,
      t: thicknessMap(p.mask, w, h, p.feather ?? 3),
      col: hexToLinear(p.color),
      alpha: p.alpha,
      gloss: p.gloss ?? 0,
    });
  }

  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    let r = S2L[s[k]], g = S2L[s[k + 1]], b = S2L[s[k + 2]];
    let covered = 0; // 이 픽셀에 화장이 얼마나 덮였나 — 잔무늬는 덮인 곳에만 되돌린다

    for (const L of layers) {
      const a = L.t[i] * L.alpha;
      if (a <= 0.002) continue;
      covered = Math.max(covered, a);
      // ① 원본 밝기를 지키고 색만 바꾼다 — 룩 색을 이 픽셀 밝기에 맞춰 조정.
      // 다만 100% 지키면 색이 죽어 화장 같지 않다. keep 으로 "원본 밝기 : 룩 밝기" 를 섞는다.
      // keep=1 이면 완전히 사실적(색이 옅다), keep=0 이면 룩 색 그대로(평평하다).
      const srcLum = lum(r, g, b);
      const colLum = lum(L.col[0], L.col[1], L.col[2]) || 1e-4;
      const wantLum = srcLum * keep + colLum * (1 - keep);
      const scale = wantLum / colLum;
      const tr = L.col[0] * scale, tg = L.col[1] * scale, tb = L.col[2] * scale;
      // ② 선형 공간에서 섞는다
      r += (tr - r) * a;
      g += (tg - g) * a;
      b += (tb - b) * a;
      // ③ 광택 — 원래 밝던 곳(하이라이트)만 더 밝힌다. 립글로스가 빛을 받는 자리.
      if (L.gloss > 0 && srcLum > 0.35) {
        const hi = (srcLum - 0.35) / 0.65;
        const add = hi * hi * L.gloss * a;
        r += add; g += add; b += add;
      }
    }

    // ④ 원본 잔무늬를 되돌린다 — 주름·솜털·광이 화장 위로 비친다.
    // 화장이 덮인 만큼만 되돌린다. 얼굴 전체에 걸면 잡티·수염 자국까지 도드라진다.
    // 밝아지는 쪽(광택·솜털)은 그대로, 어두워지는 쪽(입 다문 선·주름 골)은 절반만.
    // 어두운 쪽까지 다 되돌리면 선이 시커멓게 도드라져 지저분해진다.
    if (blurred && covered > 0.002) {
      const d = detailAmt * covered;
      const add = (o0, b0) => { const v = S2L[o0] - S2L[b0]; return v * d * (v < 0 ? 0.45 : 1); };
      r += add(s[k], blurred[k]);
      g += add(s[k + 1], blurred[k + 1]);
      b += add(s[k + 2], blurred[k + 2]);
    }

    o[k] = l2s(r); o[k + 1] = l2s(g); o[k + 2] = l2s(b); o[k + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}

// ── 실시간용 ────────────────────────────────────────────────────────────────
// 픽셀을 하나씩 다루므로 원본 크기로는 무겁다(675×900 에 66ms = 초당 15장).
// 절반 크기로 칠하고 원본 크기로 키우면 초당 54장이 나온다. 화장은 원래 큰 색 덩어리라
// (CSD-MT 2024) 절반 해상도로 칠해도 눈에 띄는 손해가 없고, 잔무늬는 원본에서 되돌린다.

const rt = { small: null, sctx: null, out: null, octx: null };

/**
 * 영상 한 프레임에 화장을 얹는다 — 작게 칠하고 키워서 붙인다.
 * @param {CanvasRenderingContext2D} ctx 화면 (영상이 이미 그려져 있어야 한다)
 * @param {HTMLVideoElement|HTMLCanvasElement} source 이번 프레임 원본
 * @param {(w:number,h:number)=>object} makeParts 그 크기에 맞는 부위 재료를 만드는 함수
 * @param {object} opt {scale: 0~1 (기본 0.5), detail}
 */
export function renderMakeupLive(ctx, source, makeParts, opt = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sc = opt.scale ?? 0.5;
  const w = Math.max(64, Math.round(W * sc)), h = Math.max(64, Math.round(H * sc));

  if (!rt.small || rt.small.width !== w || rt.small.height !== h) {
    rt.small = document.createElement("canvas");
    rt.small.width = w; rt.small.height = h;
    rt.sctx = rt.small.getContext("2d", { willReadFrequently: true });
    rt.out = document.createElement("canvas");
    rt.out.width = w; rt.out.height = h;
    rt.octx = rt.out.getContext("2d", { willReadFrequently: true });
  }
  rt.sctx.drawImage(source, 0, 0, w, h);
  const parts = makeParts(w, h);
  if (!parts) return false;
  rt.octx.drawImage(rt.small, 0, 0);
  renderMakeup(rt.octx, rt.small, parts, opt);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(rt.out, 0, 0, W, H);
  return true;
}

/** 폴리곤들을 채운 흑백 마스크 캔버스를 만든다 (구멍 지원) */
export function maskFromPolys(polys, holes, w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  c.fillStyle = "#fff";
  c.beginPath();
  const path = (pts) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
  for (const p of polys) path(p);
  if (holes) for (const p of holes) path(p);
  c.fill("evenodd");
  return cv;
}
