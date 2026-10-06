// 화장 전후 사진 한 쌍에서 화장 층만 뽑아 표준 얼굴 판(템플릿)으로 굽는다.
//
// 왜 이게 되나
// -----------
// 같은 사람의 맨얼굴(B)과 화장한 얼굴(M)이 있으면 화장은 이렇게 얹힌 것이다.
//     M = α·C + (1−α)·B      (α = 얼마나 덮였나, C = 화장 자체의 색)
// 조명과 피부톤은 B 에도 M 에도 똑같이 들어 있어 빼는 과정에서 사라진다.
// 예전에 화장 사진 한 장만으로 층을 떼어내려다 "뿌연 막"이 생긴 것은 B 가 없었기 때문이다.
//
// 먼저 해야 할 일 — 정렬
// ----------------------
// 두 사진은 각도·표정·크기가 다르다. 그대로 빼면 "얼굴이 움직인 차이"가 화장으로 잡힌다.
// 그래서 얼굴 점 468 개로 삼각형을 만들어, 화장 사진을 맨얼굴의 점 위치로 휘어 맞춘 뒤 뺀다.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
const UV = 1024;
const state = { faceUV: null, tris: null, lmk: null, mine: null, mineLm: null, tpl: null };

/**
 * 재료 후보.
 * FFHQ 쌍은 같은 얼굴에 화장만 합성한 것이라 각도·조명·표정이 완전히 같다 — 추출에 가장 좋은 조건.
 * 사진 쌍(ref)은 유튜브 캡처라 각도·조명·보정이 달라, 화장이 아니라 그 차이가 추출된다.
 */
const PAIRS = {
  ffhq1: { name: "FFHQ 1 (합성 쌍)", bare: "./data/002937_bare.png", makeup: "./data/002937_makeup_02.png" },
  ffhq2: { name: "FFHQ 2 (합성 쌍)", bare: "./data/004428_bare.png", makeup: "./data/004428_makeup_03.png" },
  ffhq3: { name: "FFHQ 3 (합성 쌍)", bare: "./data/006381_bare.png", makeup: "./data/006381_makeup_04.png" },
  ref: { name: "사진 쌍 (각도·조명 다름)", bare: "./data/ref_a.png", makeup: "./data/ref_b.png" },
  sm: { name: "Stable-Makeup 생성 쌍 (지원님 얼굴)", bare: "./data/sm_bare.png", makeup: "./data/sm_result.png" },
  xl: { name: "★ AI 생성 얼굴 + 참고 화장", bare: "./data/xl_bare.png", makeup: "./data/xl_makeup.png" },
};

async function loadImage(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const c = cv.getContext("2d", { willReadFrequently: true });
  // 투명 배경(PNG)은 흰색으로 깔아 준다 — 알파가 섞이면 색이 어두워진다
  c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
  c.drawImage(img, 0, 0);
  return cv;
}

const show = (id, cv, bg) => {
  const el = $(id);
  el.width = cv.width; el.height = cv.height;
  const c = el.getContext("2d");
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, el.width, el.height); }
  c.drawImage(cv, 0, 0);
};

// ── 삼각형 단위 변형 ────────────────────────────────────────────────────────
/** 삼각형 하나를 원본에서 목적지로 아핀 변형해 그린다 */
function warpTri(ctx, img, s, d) {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = s;
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = d;
  const den = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0;
  if (!den) return;
  const m11 = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / den;
  const m12 = (sy1 * dy2 + sy0 * (dy1 - dy2) - sy2 * dy1 + (sy2 - sy1) * dy0) / den;
  const m21 = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / den;
  const m22 = -(sx1 * dy2 + sx0 * (dy1 - dy2) - sx2 * dy1 + (sx2 - sx1) * dy0) / den;
  const dx = (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / den;
  const dy = (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / den;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** 화장 사진을 맨얼굴의 얼굴 점 위치로 휘어 맞춘다 */
function alignTo(srcCv, srcLm, dstLm, w, h) {
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const c = out.getContext("2d", { willReadFrequently: true });
  const sw = srcCv.width, sh = srcCv.height;
  for (let t = 0; t < state.tris.length; t += 3) {
    const i0 = state.tris[t], i1 = state.tris[t + 1], i2 = state.tris[t + 2];
    const s = [i0, i1, i2].map((i) => [srcLm[i].x * sw, srcLm[i].y * sh]);
    const d = [i0, i1, i2].map((i) => [dstLm[i].x * w, dstLm[i].y * h]);
    warpTri(c, srcCv, s, d);
  }
  return out;
}

/** 표준 얼굴 판(UV)으로 굽는다 */
function bakeUV(srcCv, lm, w, h) {
  const out = document.createElement("canvas");
  out.width = out.height = UV;
  const c = out.getContext("2d");
  for (let t = 0; t < state.tris.length; t += 3) {
    const i0 = state.tris[t], i1 = state.tris[t + 1], i2 = state.tris[t + 2];
    const s = [i0, i1, i2].map((i) => [lm[i].x * w, lm[i].y * h]);
    const d = [i0, i1, i2].map((i) => [state.faceUV[i][0] * UV, state.faceUV[i][1] * UV]);
    warpTri(c, srcCv, s, d);
  }
  return out;
}

/** 판에서 다시 얼굴로 */
function unbakeUV(uvCv, lm, w, h) {
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const c = out.getContext("2d");
  for (let t = 0; t < state.tris.length; t += 3) {
    const i0 = state.tris[t], i1 = state.tris[t + 1], i2 = state.tris[t + 2];
    const s = [i0, i1, i2].map((i) => [state.faceUV[i][0] * UV, state.faceUV[i][1] * UV]);
    const d = [i0, i1, i2].map((i) => [lm[i].x * w, lm[i].y * h]);
    warpTri(c, uvCv, s, d);
  }
  return out;
}

// ── 조명 맞추기 ────────────────────────────────────────────────────────────
// 두 사진은 조명이 다르다. 그대로 빼면 "빛이 더 닿은 쪽"이 화장으로 잡혀 볼에 붉은 얼룩이 생긴다.
// 그래서 화장을 하지 않는 자리(이마·코등·턱)의 색을 기준으로 삼아 밝기·색조를 먼저 맞춘다.

/** 화장이 거의 닿지 않는 자리 — 여기 색은 두 사진에서 같아야 한다 */
const NEUTRAL = [
  [10, 151, 9, 8],        // 이마 가운데 ~ 미간
  [6, 197, 195, 5],       // 코등
  [152, 148, 176, 377],   // 턱 끝
  [234, 93, 132, 58],     // 왼쪽 관자
  [454, 323, 361, 288],   // 오른쪽 관자
];

/** 그 자리들의 채널별 평균 색 */
function neutralColor(data, lm, w, h) {
  const sum = [0, 0, 0]; let n = 0;
  for (const quad of NEUTRAL) {
    const xs = quad.map((i) => lm[i].x * w), ys = quad.map((i) => lm[i].y * h);
    const x0 = Math.max(0, Math.round(Math.min(...xs))), x1 = Math.min(w - 1, Math.round(Math.max(...xs)));
    const y0 = Math.max(0, Math.round(Math.min(...ys))), y1 = Math.min(h - 1, Math.round(Math.max(...ys)));
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const k = (y * w + x) * 4;
        sum[0] += data[k]; sum[1] += data[k + 1]; sum[2] += data[k + 2]; n++;
      }
    }
  }
  return n ? sum.map((v) => v / n) : [128, 128, 128];
}

/**
 * 화장 사진의 조명을 맨얼굴 쪽에 맞춘다 — 채널마다 곱셈 하나로.
 * (화이트밸런스를 맞추는 것과 같은 계산이다)
 */
function matchLighting(makeCv, bareCv, lm, w, h) {
  const mc = makeCv.getContext("2d", { willReadFrequently: true });
  const bc = bareCv.getContext("2d", { willReadFrequently: true });
  const m = mc.getImageData(0, 0, w, h), b = bc.getImageData(0, 0, w, h);
  const nm = neutralColor(m.data, lm, w, h), nb = neutralColor(b.data, lm, w, h);
  // 너무 큰 보정은 오히려 망가뜨린다 — 0.7~1.4 로 묶는다
  const gain = nm.map((v, i) => Math.max(0.7, Math.min(1.4, nb[i] / Math.max(1, v))));
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const oc = out.getContext("2d", { willReadFrequently: true });
  const img = oc.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    img.data[k] = Math.min(255, m.data[k] * gain[0]);
    img.data[k + 1] = Math.min(255, m.data[k + 1] * gain[1]);
    img.data[k + 2] = Math.min(255, m.data[k + 2] * gain[2]);
    img.data[k + 3] = 255;
  }
  oc.putImageData(img, 0, 0);
  return { canvas: out, gain };
}

// ── 화장 층 뽑기 ───────────────────────────────────────────────────────────
/**
 * 정렬된 화장 사진(M)과 맨얼굴(B)에서 화장 층을 만든다.
 * 픽셀마다 얼마나 달라졌는지로 투명도를, 화장 쪽 색으로 색을 정한다.
 * 얼굴 안쪽만 본다 — 머리카락·배경의 차이가 섞이면 안 된다.
 */
function extractLayer(mkData, brData, w, h, faceMask) {
  const m = mkData.data, b = brData.data, fm = faceMask.data;
  const out = new ImageData(w, h);
  const o = out.data;
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const fa = fm[k + 3] / 255;
    if (fa < 0.02) continue; // 화장 부위 밖
    const dr = m[k] - b[k], dg = m[k + 1] - b[k + 1], db = m[k + 2] - b[k + 2];
    // 밝기만 달라진 것은 그늘·광이지 화장이 아니다. 색이 달라진 정도를 따로 본다.
    const dl = (dr + dg + db) / 3;
    const cr = dr - dl, cg = dg - dl, cb = db - dl;
    const dChroma = Math.sqrt(cr * cr + cg * cg + cb * cb);
    // 밝기 차이는 아예 안 쓴다.
    // 생성 모델이 얼굴을 다시 그리면서 피부톤이 통째로 조금 달라지는데,
    // 그것까지 세면 "남의 볼 피부색 한 덩어리"가 화장으로 뽑혀 얼굴에 판때기로 찍힌다.
    // 진짜 화장은 색(붉은기·분홍기)이 바뀐다. 그 성분만 본다.
    let a = Math.max(0, Math.min(1, (dChroma - 9) / 26));
    a = a * a * (3 - 2 * a);        // 가장자리만 부드럽게
    a = Math.min(a, 0.85);          // 립처럼 확실한 곳은 진하게 나오도록 여유를 둔다
    if (a <= 0.004) continue;
    o[k] = m[k]; o[k + 1] = m[k + 1]; o[k + 2] = m[k + 2];
    o[k + 3] = Math.round(a * fa * 255);  // 부위 경계에서 부드럽게
  }
  return out;
}

/**
 * 화장을 볼 수 있는 자리 마스크.
 *
 * 얼굴 전체를 보면 안 된다. 생성 모델(Stable-Makeup)은 화장만 얹는 것이 아니라 그림 전체를
 * 다시 그려서 피부까지 미세하게 달라진다. 그래서 얼굴 전체 차이를 쓰면 얼굴이 통째로 뽑힌다.
 *
 * 그렇다고 부위 다각형 안쪽을 그대로 쓰면 그 도형 모양이 얼굴에 찍힌다(삼각형 볼터치).
 * 그래서 부위로 제한하되, 경계를 크게 흐려 어디서 끝나는지 눈에 안 보이게 만든다.
 * 특히 볼은 실제로도 가운데가 진하고 바깥으로 사라지므로 흐린 마스크가 오히려 맞다.
 */
const MAKEUP_REGIONS = {
  // 입술 — 안쪽(치아)은 뺀다. 경계가 뚜렷해야 하므로 덜 흐린다.
  lip: { out: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
         hole: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
         blur: 0.004 },
  // 눈두덩 — 윗눈꺼풀에서 눈썹 아래까지. 눈알 자리는 뺀다.
  lidR: { band: [[33, 246, 161, 160, 159, 158, 157, 173, 133], [46, 53, 52, 65, 55]],
          hole: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
          blur: 0.006 },
  lidL: { band: [[263, 466, 388, 387, 386, 385, 384, 398, 362], [276, 283, 282, 295, 285]],
          hole: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
          blur: 0.006 },
  // 볼터치 — 가장 크게 흐린다. 도형 모양이 남으면 바로 티가 나는 자리다.
  cheekR: { out: [116, 117, 118, 101, 36, 205, 187, 123], blur: 0.018 },
  cheekL: { out: [345, 346, 347, 330, 266, 425, 411, 352], blur: 0.018 },
};

/** 눈두덩 띠 — 쌍꺼풀 선에서 눈썹 아래로 */
function bandPts(lm, lid, brow, w, h, reach) {
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const top = lid.map((li, k) => {
    const b = P(brow[Math.min(brow.length - 1, Math.round((k / (lid.length - 1)) * (brow.length - 1)))]);
    const l = P(li);
    return [l[0] + (b[0] - l[0]) * reach, l[1] + (b[1] - l[1]) * reach];
  });
  return [...lid.map(P), ...top.reverse()];
}

function makeupMaskOf(lm, w, h) {
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const oc = out.getContext("2d", { willReadFrequently: true });
  const unit = Math.min(w, h);

  // 부위마다 따로 그려서 따로 흐린 뒤 합친다 — 립은 또렷하게, 볼은 아주 부드럽게
  for (const r of Object.values(MAKEUP_REGIONS)) {
    const one = document.createElement("canvas");
    one.width = w; one.height = h;
    const c = one.getContext("2d", { willReadFrequently: true });
    const poly = (pts) => {
      c.beginPath();
      pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath(); c.fill();
    };
    c.fillStyle = "#fff";
    if (r.band) poly(bandPts(lm, r.band[0], r.band[1], w, h, 0.62));
    else poly(r.out.map((i) => [lm[i].x * w, lm[i].y * h]));
    if (r.hole) {
      c.globalCompositeOperation = "destination-out";
      poly(r.hole.map((i) => [lm[i].x * w, lm[i].y * h]));
      c.globalCompositeOperation = "source-over";
    }
    oc.filter = `blur(${Math.max(2, unit * r.blur)}px)`;
    oc.drawImage(one, 0, 0);
    oc.filter = "none";
  }

  // 눈알·입안은 흐리는 과정에서 다시 덮였을 수 있으니 마지막에 확실히 파낸다
  oc.globalCompositeOperation = "destination-out";
  for (const idx of [
    [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
    [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
    [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
  ]) {
    oc.beginPath();
    idx.forEach((i, k) => { const x = lm[i].x * w, y = lm[i].y * h; k ? oc.lineTo(x, y) : oc.moveTo(x, y); });
    oc.closePath(); oc.fill();
  }
  oc.globalCompositeOperation = "source-over";

  return oc.getImageData(0, 0, w, h);
}

/** 부위별 대표 색 — 어디에 어떤 화장이 얼마나 올라갔는지 보여주려고 */
const REGIONS = {
  입술: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  "눈두덩(오른쪽)": [33, 246, 161, 160, 159, 158, 157, 173, 133, 46, 53, 52, 65, 55],
  "눈두덩(왼쪽)": [263, 466, 388, 387, 386, 385, 384, 398, 362, 276, 283, 282, 295, 285],
  "볼(오른쪽)": [116, 117, 118, 101, 36, 205, 187, 123],
  "볼(왼쪽)": [345, 346, 347, 330, 266, 425, 411, 352],
  "눈썹(오른쪽)": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  "눈썹(왼쪽)": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};
function regionColors(layer, lm, w, h) {
  const out = [];
  for (const [name, idx] of Object.entries(REGIONS)) {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.fillStyle = "#fff";
    c.beginPath();
    idx.forEach((i, k) => { const x = lm[i].x * w, y = lm[i].y * h; k ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.closePath(); c.fill();
    const mask = c.getImageData(0, 0, w, h).data;
    const px = [[], [], []]; let aSum = 0, n = 0;
    for (let i = 0; i < w * h; i++) {
      if (mask[i * 4 + 3] < 128) continue;
      const a = layer.data[i * 4 + 3] / 255;
      n++; aSum += a;
      if (a < 0.25) continue;
      for (let ch = 0; ch < 3; ch++) px[ch].push(layer.data[i * 4 + ch]);
    }
    if (px[0].length < 20) continue;
    const med = (v) => { v.sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    out.push({ name, rgb: px.map(med), cover: n ? aSum / n : 0 });
  }
  return out;
}

// ── 흐름 ───────────────────────────────────────────────────────────────────
async function run() {
  setStatus("사진을 읽고 얼굴 점을 찾는 중…");
  const pair = PAIRS[$("pair").value] ?? PAIRS.ffhq1;
  const bare = await loadImage(pair.bare);
  const make = await loadImage(pair.makeup);
  show("cBare", bare); show("cMake", make);

  const bLm = state.lmk.detect(bare).faceLandmarks?.[0];
  const mLm = state.lmk.detect(make).faceLandmarks?.[0];
  if (!bLm || !mLm) { setStatus("두 사진 중 하나에서 얼굴을 못 찾았어요"); return; }

  const w = bare.width, h = bare.height;
  setStatus("화장 사진을 맨얼굴에 맞춰 정렬하는 중…");
  const aligned = alignTo(make, mLm, bLm, w, h);
  show("cAlign", aligned);

  setStatus("조명을 맞추는 중…");
  const { canvas: lit, gain } = matchLighting(aligned, bare, bLm, w, h);
  show("cAlign", lit);   // 조명까지 맞춘 것을 보여 준다

  setStatus("화장 층을 뽑는 중…");
  const bc = bare.getContext("2d", { willReadFrequently: true });
  const ac = lit.getContext("2d", { willReadFrequently: true });
  const layer = extractLayer(ac.getImageData(0, 0, w, h), bc.getImageData(0, 0, w, h), w, h, makeupMaskOf(bLm, w, h));
  console.log("조명 보정 계수 (R,G,B):", gain.map((v) => v.toFixed(3)).join(", "));

  const layerCv = document.createElement("canvas");
  layerCv.width = w; layerCv.height = h;
  layerCv.getContext("2d").putImageData(layer, 0, 0);
  show("cLayer", layerCv, "#111");

  // 표준 얼굴 판으로 굽기
  state.tpl = bakeUV(layerCv, bLm, w, h);
  show("cUV", state.tpl, "#111");

  // 부위별 색
  $("colors").innerHTML = regionColors(layer, bLm, w, h)
    .map((r) => `<span class="chip"><i style="background:rgb(${r.rgb.join(",")})"></i>${r.name} rgb(${r.rgb.join(", ")}) · 덮인 정도 ${(r.cover * 100).toFixed(0)}%</span>`)
    .join("");

  setStatus("④에 화장만 떠 있으면 제대로 뽑힌 것입니다. '내 얼굴에 씌워 보기'를 눌러 보세요.");
}

function applyToMine() {
  if (!state.tpl || !state.mineLm) { setStatus("내 얼굴 사진을 못 읽었어요"); return; }
  const w = state.mine.width, h = state.mine.height;
  show("cMine", state.mine);
  const warped = unbakeUV(state.tpl, state.mineLm, w, h);
  const out = $("cOut");
  out.width = w; out.height = h;
  const c = out.getContext("2d");
  c.drawImage(state.mine, 0, 0);
  // 실시간과 같은 방식으로 얹는다 — 덮어 칠하면 스티커가 된다
  c.globalCompositeOperation = "multiply";
  c.drawImage(warped, 0, 0);
  c.globalCompositeOperation = "color";
  c.globalAlpha = 0.45;
  c.drawImage(warped, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  setStatus("⑦ 뽑아낸 화장을 내 얼굴 점에 맞춰 씌운 결과입니다.");
}

(async () => {
  const [uv, tri] = await Promise.all([
    fetch("../../poc/look-tryon/client/assets/face-uv.json").then((r) => r.json()),
    fetch("../../poc/look-tryon/client/assets/face-triangles.json").then((r) => r.json()),
  ]);
  state.faceUV = uv; state.tris = tri;

  // 얼굴 점 프로그램과 모델은 한 번만 받아서 사진용·카메라용이 같이 쓴다
  state.vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  state.modelBuf = new Uint8Array(await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  ).then((r) => r.arrayBuffer()));
  state.lmk = await FaceLandmarker.createFromOptions(state.vision, {
    baseOptions: { modelAssetBuffer: state.modelBuf.slice() },
    numFaces: 1, runningMode: "IMAGE",
  });

  state.mine = await loadImage("./data/my_face.png");
  state.mineLm = state.lmk.detect(state.mine).faceLandmarks?.[0];

  $("pair").innerHTML = Object.entries(PAIRS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  $("pair").value = "xl";   // 생성 쌍을 기본으로 — 같은 얼굴·같은 조명이라 화장만 깨끗이 남는다
  $("pair").onchange = () => run();
  $("run").onclick = () => run();
  $("apply").onclick = applyToMine;
  $("save").onclick = () => {
    if (!state.tpl) return;
    const a = document.createElement("a");
    a.download = "makeup-template.png";
    a.href = state.tpl.toDataURL("image/png");
    a.click();
  };
  await run();
})();

// ── 실시간 ─────────────────────────────────────────────────────────────────
// 뽑아낸 템플릿(표준 얼굴 판)을 매 프레임 내 얼굴 점에 맞춰 씌운다.
// 합성은 단순히 덮지 않는다 — 곱하기로 얹어 피부 결·그늘이 비쳐 보이게 한다.

const live = { on: false, bare: false, lmkV: null, out: null, ctx: null, warp: null, wctx: null };

/** 표준 판을 이번 프레임 얼굴로 휘어 한 장 만든다 */
function warpTemplate(lm, w, h) {
  if (!live.warp || live.warp.width !== w || live.warp.height !== h) {
    live.warp = document.createElement("canvas");
    live.warp.width = w; live.warp.height = h;
    live.wctx = live.warp.getContext("2d");
  }
  live.wctx.setTransform(1, 0, 0, 1, 0, 0);
  live.wctx.clearRect(0, 0, w, h);
  for (let t = 0; t < state.tris.length; t += 3) {
    const i0 = state.tris[t], i1 = state.tris[t + 1], i2 = state.tris[t + 2];
    const s = [i0, i1, i2].map((i) => [state.faceUV[i][0] * UV, state.faceUV[i][1] * UV]);
    const d = [i0, i1, i2].map((i) => [lm[i].x * w, lm[i].y * h]);
    warpTri(live.wctx, state.tpl, s, d);
  }
  return live.warp;
}

let lFrames = 0, lLast = performance.now();
function liveLoop() {
  if (!live.on) return;
  const video = $("video");
  if (video.readyState >= 2 && state.tpl) {
    const w = video.videoWidth, h = video.videoHeight;
    const cv = live.out;
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    const c = live.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.drawImage(video, 0, 0);

    const lm = live.lmkV.detectForVideo(video, performance.now()).faceLandmarks?.[0];
    if (lm && !live.bare) {
      const warped = warpTemplate(lm, w, h);
      // 곱하기로 얹는다 — 피부 결·그늘·광이 그대로 비친다 (덮어 칠하면 스티커가 된다)
      c.globalCompositeOperation = "multiply";
      c.drawImage(warped, 0, 0);
      // 색이 너무 죽지 않게 색상 층을 살짝 한 번 더
      c.globalCompositeOperation = "color";
      c.globalAlpha = 0.45;
      c.drawImage(warped, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    }
    if (++lFrames >= 20) {
      const now = performance.now();
      setStatus(`${lm ? "얼굴 추적 중" : "얼굴 미검출"}${live.bare ? " · 화장 끔" : ""} · 초당 ${(lFrames / ((now - lLast) / 1000)).toFixed(0)}장`);
      lFrames = 0; lLast = now;
    }
  }
  video.requestVideoFrameCallback ? video.requestVideoFrameCallback(liveLoop) : requestAnimationFrame(liveLoop);
}

async function startLive() {
  if (!state.tpl) { setStatus("먼저 템플릿을 뽑아야 합니다"); return; }
  setStatus("카메라를 여는 중…");
  // 위에서 이미 받아 둔 것을 그대로 쓴다 — 다시 내려받지 않는다
  live.lmkV = live.lmkV ?? await FaceLandmarker.createFromOptions(state.vision, {
    baseOptions: { modelAssetBuffer: state.modelBuf.slice() },
    numFaces: 1, runningMode: "VIDEO",
  });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  live.out = $("live");
  live.ctx = live.out.getContext("2d");
  live.out.style.width = "100%";
  live.out.style.transform = "scaleX(-1)";
  $("liveCard").style.display = "block";
  live.on = true;
  liveLoop();
}

$("cam").onclick = () => startLive().catch((e) => setStatus("카메라 실패: " + e.message));
$("bare").onclick = (e) => {
  live.bare = !live.bare;
  e.target.textContent = live.bare ? "화장 켜기" : "화장 끄기";
};

// ── 템플릿 여러 장 한 번에 ─────────────────────────────────────────────────
// 재료(사진 쌍)마다 템플릿을 뽑아 나란히 보여 준다. 어떤 재료가 쓸 만한지 한눈에 비교하려고.

async function buildAll() {
  const saved = $("pair").value;
  const made = [];
  for (const key of Object.keys(PAIRS)) {
    $("pair").value = key;
    await run();
    if (!state.tpl) continue;
    const cv = document.createElement("canvas");
    cv.width = state.tpl.width; cv.height = state.tpl.height;
    cv.getContext("2d").drawImage(state.tpl, 0, 0);
    // 내 얼굴에 씌운 결과도 같이
    const w = state.mine.width, h = state.mine.height;
    const on = document.createElement("canvas");
    on.width = w; on.height = h;
    const c = on.getContext("2d");
    c.drawImage(state.mine, 0, 0);
    c.drawImage(unbakeUV(cv, state.mineLm, w, h), 0, 0);
    made.push({ name: PAIRS[key].name, tpl: cv, on });
  }
  $("pair").value = saved;
  state.all = made;
  renderAll(made);
  setStatus(`템플릿 ${made.length}개를 뽑았습니다. 쓸 만한 것을 고른 뒤 실시간으로 확인해 보세요.`);
}

function renderAll(made) {
  let box = $("allBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "allBox";
    box.style.cssText = "margin-top:16px";
    document.querySelector("main").appendChild(box);
  }
  box.innerHTML = '<div class="card"><h2>재료별 템플릿과 결과 — 왼쪽이 템플릿, 오른쪽이 내 얼굴에 씌운 것</h2><div id="allRow" class="row"></div></div>';
  const row = $("allRow");
  made.forEach((m, i) => {
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `<h2>${m.name}</h2>`;
    for (const cv of [m.tpl, m.on]) {
      const el = document.createElement("canvas");
      el.width = cv.width; el.height = cv.height;
      const c = el.getContext("2d");
      c.fillStyle = "#0c0f14"; c.fillRect(0, 0, el.width, el.height);
      c.drawImage(cv, 0, 0);
      el.style.marginBottom = "6px";
      d.appendChild(el);
    }
    const b = document.createElement("button");
    b.textContent = "이 템플릿 쓰기";
    b.style.width = "100%";
    b.onclick = () => { state.tpl = m.tpl; setStatus(`"${m.name}" 템플릿을 골랐습니다. '카메라로 실시간 보기'를 눌러 보세요.`); };
    d.appendChild(b);
    row.appendChild(d);
    void i;
  });
}

const allBtn = document.createElement("button");
allBtn.id = "buildAll";
allBtn.textContent = "재료 전부 뽑아 비교";
allBtn.className = "key";
document.querySelector("header").appendChild(allBtn);
allBtn.onclick = () => buildAll().catch((e) => setStatus("실패: " + e.message));
