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
import { LABEL, loadParser, maskToCanvas, parseFace } from "./parser.js";

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
  xl: { name: "AI 생성 얼굴 + 참고 화장 (전후 비교)", bare: "./data/xl_bare.png", makeup: "./data/xl_makeup.png" },
  one: { name: "참고 사진 한 장 (코랄립)", photo: "./data/look_ref.png", single: true },
  glam: { name: "★ 참고 사진 한 장 (진한 화장)", photo: "./data/look_glam.png", single: true },
  nb: { name: "생성 전후 쌍", bare: "./data/nb_bare.png", makeup: "./data/nb_makeup.png" },
  ip: { name: "★ 인페인팅 쌍 (지원님 얼굴)", bare: "./data/ip_bare.png", makeup: "./data/ip_makeup.png", clean: true },
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
/* 이마 — 화장이 거의 안 올라가는 자리. 팀 코드 server/app/regions.py FOREHEAD 와 같은 점들.
   모양을 만드는 데 쓰는 게 아니라 "기준 색을 어디서 잴까"에만 쓰므로 다각형이어도 괜찮다. */
const FOREHEAD = [10, 109, 108, 151, 337, 338];

function foreheadMaskOf(lm, w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.fillStyle = "#fff";
  c.beginPath();
  FOREHEAD.forEach((i, k) => { const x = lm[i].x * w, y = lm[i].y * h; k ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.closePath(); c.fill();
  return c.getImageData(0, 0, w, h);
}

function extractLayer(mkData, brData, w, h, faceMask, foreheadMask) {
  const m = mkData.data, b = brData.data, fm = faceMask.data;
  const out = new ImageData(w, h);
  const o = out.data;

  /* 생성 모델은 화장만 얹는 것이 아니라 그림 전체를 다시 그려서, 얼굴색이 통째로 조금 달라진다.
     그대로 빼면 "얼굴 전체가 화장"으로 잡힌다(실제로 그랬다).
     그래서 화장이 안 올라가는 이마에서 두 사진의 색 차이 가운데값을 재어, 그만큼을 먼저 빼 둔다.
     팀 코드 server/app/layer.py 가 쓰는 방법과 같다. */
  let bias = [0, 0, 0];
  if (foreheadMask) {
    const fm2 = foreheadMask.data;
    const ch = [[], [], []];
    for (let i = 0; i < w * h; i++) {
      if (fm2[i * 4 + 3] < 200) continue;
      for (let c = 0; c < 3; c++) ch[c].push(m[i * 4 + c] - b[i * 4 + c]);
    }
    if (ch[0].length > 200) {
      bias = ch.map((a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; });
      console.log("전역 색조 보정 (R,G,B):", bias.join(", "));
    }
  }

  // 바탕은 "아무 변화 없음"(흰색, 투명)으로 깔아 둔다.
  // 곱하기로 얹을 때 흰색은 바탕을 그대로 두므로 안전하고,
  // 검은색을 깔아 두면 가장자리에서 번져 얼굴이 지저분해진다.
  for (let i = 0; i < w * h; i++) { o[i * 4] = 255; o[i * 4 + 1] = 255; o[i * 4 + 2] = 255; }

  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const fa = fm[k + 3] / 255;
    if (fa < 0.02) continue;

    const dr = m[k] - b[k] - bias[0], dg = m[k + 1] - b[k + 1] - bias[1], db = m[k + 2] - b[k + 2] - bias[2];
    const dl = (dr + dg + db) / 3;
    const cr = dr - dl, cg = dg - dl, cb = db - dl;
    const dChroma = Math.sqrt(cr * cr + cg * cg + cb * cb);
    // 밝기 차이는 안 쓴다. 생성 모델이 얼굴을 다시 그리며 피부톤이 통째로 조금 달라지는데,
    // 그것까지 세면 "남의 볼 피부색 한 덩어리"가 화장으로 뽑혀 판때기로 찍힌다.
    let a = Math.max(0, Math.min(1, (dChroma - 9) / 26));
    a = a * a * (3 - 2 * a);
    a = Math.min(a, 0.85);
    if (a <= 0.004) continue;

    // 여기가 핵심.
    // 예전에는 화장 사진의 색을 그대로 떠 왔다(o[k] = m[k]).
    // 그러면 그 사람의 피부색까지 같이 따라와 남의 얼굴 조각을 붙인 꼴이 된다.
    // 대신 "몇 배로 바뀌었나"를 저장한다. 곱하기로 얹으면
    //     내 피부색 × 바뀐 배수 = 내 피부에 그 화장을 한 색
    // 이 되어, 내 피부결과 그늘이 그대로 비친다. 색안경을 씌우는 것과 같다.
    for (let c = 0; c < 3; c++) {
      const base = Math.max(8, b[k + c]);          // 0 으로 나누는 것 방지
      let ratio = m[k + c] / base;
      ratio = Math.max(0.15, Math.min(1, ratio));  // 곱하기는 어둡게만 된다
      o[k + c] = Math.round(ratio * 255);
    }
    o[k + 3] = Math.round(a * fa * 255);
  }
  return out;
}

/**
 * 화장을 볼 수 있는 자리 마스크 — 얼굴 점 다각형이 아니라 학습한 분할 모델로 만든다.
 *
 * 다각형으로 자르면 그 도형 모양이 얼굴에 그대로 찍힌다(육각형 볼터치). 경계를 흐려도
 * 사람 눈에는 "얼굴에 도형이 붙었다"로 읽혀서, 그 순간 쓸 수 없는 결과가 된다.
 *
 * 분할 모델은 픽셀마다 배경·피부·눈썹·눈·입술 중 무엇인지 판단한다.
 * 여기서는 "얼굴에 해당하는 곳"만 남기고 배경과 눈알을 뺀다.
 * 그 안에서 실제로 색이 바뀐 곳만 화장으로 잡으므로, 모양은 전적으로 사진에서 나온다.
 */
async function makeupMaskOf(source, lm, w, h) {
  const parsed = await parseFace(source, lm, w, h);
  if (!parsed) return null;   // 모델이 없으면 도형으로 대체하지 않는다 — 그건 쓸 수 없는 결과다

  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d", { willReadFrequently: true });

  /* 피부 전체를 보면 안 된다.
     생성 모델이 얼굴을 다시 그리면 이목구비까지 달라져서, 얼굴 전체가 "화장"으로 잡힌다.
     그래서 화장이 실제로 올라가는 자리만 본다 — 입술·눈썹·눈 주변.
     단 자리를 다각형으로 그리지 않고 분할 모델이 픽셀로 찾은 것을 쓰므로 도형이 생기지 않는다. */
  c.drawImage(maskToCanvas(parsed, LABEL.LIP, w, h), 0, 0);
  c.drawImage(maskToCanvas(parsed, LABEL.BROW, w, h), 0, 0);
  c.drawImage(eyeBandsOf(parsed, w, h), 0, 0);   // 눈 위·아래 띠 (눈두덩·언더)

  // 눈알은 뺀다 — 여기 차이는 화장이 아니라 눈을 얼마나 떴는지다
  c.globalCompositeOperation = "destination-out";
  c.drawImage(maskToCanvas(parsed, LABEL.EYE, w, h), 0, 0);
  c.globalCompositeOperation = "source-over";

  // 부위 경계에서 한두 픽셀 어긋나는 것만 다듬는다. 모양을 바꿀 만큼 흐리지는 않는다.
  const soft = document.createElement("canvas");
  soft.width = w; soft.height = h;
  const sc = soft.getContext("2d", { willReadFrequently: true });
  sc.filter = `blur(${Math.max(1, Math.min(w, h) * 0.004)}px)`;
  sc.drawImage(cv, 0, 0);
  sc.filter = "none";
  return sc.getImageData(0, 0, w, h);
}

/**
 * 화장한 사진 "한 장"에서 화장을 뜬다 — 맨얼굴 사진이 필요 없다.
 *
 * 왜 이렇게 하나
 * --------------
 * 전후 두 장을 빼는 방식은 두 장이 완전히 같아야 성립한다. 그런데 생성 모델은 화장을 얹으며
 * 얼굴을 다시 그려서 절대 같지 않고, 그 차이가 "남의 피부색 덩어리"로 뽑혀 나왔다.
 *
 * 한 장만 쓰면 그 문제가 통째로 사라진다. 대신 "화장 안 한 상태"를 사진 안에서 추정한다.
 * 이마·콧등처럼 화장이 거의 안 올라가는 피부의 색을 기준으로 삼고,
 * 그 기준보다 색이 붉거나 분홍으로 치우친 곳을 화장으로 본다.
 *
 * 모양은 전적으로 픽셀에서 나온다. 얼굴 점으로 그린 도형은 한 군데도 쓰지 않는다.
 */
async function extractFromSingle(photo, lm, w, h) {
  const parsed = await parseFace(photo, lm, w, h);
  if (!parsed) return null;

  const px = photo.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const grab = (label) => maskToCanvas(parsed, label, w, h)
    .getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const skin = grab(LABEL.SKIN), lip = grab(LABEL.LIP), brow = grab(LABEL.BROW), eye = grab(LABEL.EYE);

  // ① 화장 안 한 피부색 기준 잡기.
  //    피부로 분류된 픽셀 중 색이 튀지 않는 쪽(가운데값)을 쓴다.
  //    볼터치처럼 붉은 픽셀이 섞여 있어도 가운데값은 잘 흔들리지 않는다.
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < w * h; i++) {
    if (skin[i * 4 + 3] < 200) continue;
    rs.push(px[i * 4]); gs.push(px[i * 4 + 1]); bs.push(px[i * 4 + 2]);
  }
  if (rs.length < 500) return null;
  const mid = (arr) => { arr.sort((a, b2) => a - b2); return arr[Math.floor(arr.length / 2)]; };
  const base = [mid(rs), mid(gs), mid(bs)];
  const baseL = (base[0] + base[1] + base[2]) / 3;
  const baseC = [base[0] - baseL, base[1] - baseL, base[2] - baseL];   // 기준 피부의 색 치우침

  // 볼터치·섀도는 피부색과 "다르다"기보다 붉은 기가 올라온 것이다.
  // 그래서 색 차이 대신 붉은 기를 따로 재면 훨씬 민감하게 잡힌다.
  const redOf = (r, g, b) => r - (g + b) / 2;
  const baseRed = redOf(base[0], base[1], base[2]);

  // 눈두덩은 붉은 기보다 "어두워지는" 화장이다. 그런데 그늘도 어둡다.
  // 그래서 눈 주변에서만 어두워진 것을 화장으로 본다.
  // 눈 위치는 모델이 픽셀로 찾아 준 것을 번지게 해서 쓴다 — 손으로 그린 도형이 아니다.
  // 눈두덩은 "눈 위"다. 눈 아래까지 보면 다크서클·애교살 그늘이 화장으로 잡혀 얼룩이 된다.
  // 그래서 모델이 찾은 눈 자리를 위로 밀어 올려, 눈 바로 위 띠만 눈두덩으로 쓴다.
  // 손으로 그린 도형이 아니라 실제 눈 모양을 그대로 밀어 올린 것이다.
  const eyeCv = maskToCanvas(parsed, LABEL.EYE, w, h);
  const lift = Math.max(4, Math.min(w, h) * 0.035);
  // 눈 모양을 위·아래로 밀어 두 개의 띠를 만든다. 손으로 그린 도형이 아니라 실제 눈 모양이다.
  const band = (dy) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c2 = cv.getContext("2d", { willReadFrequently: true });
    c2.drawImage(eyeCv, 0, dy);
    c2.globalCompositeOperation = "destination-out";
    c2.drawImage(eyeCv, 0, 0);            // 눈알 자리는 뺀다
    c2.globalCompositeOperation = "source-over";
    const soft = document.createElement("canvas");
    soft.width = w; soft.height = h;
    const sc3 = soft.getContext("2d", { willReadFrequently: true });
    sc3.filter = `blur(${Math.max(2, Math.min(w, h) * 0.012)}px)`;
    sc3.drawImage(cv, 0, 0);
    sc3.filter = "none";
    return sc3.getImageData(0, 0, w, h).data;
  };
  const nearUp = band(-lift);              // 눈두덩 (위)
  const nearDown = band(lift * 0.85);      // 애교살 (아래)

  // ② 픽셀마다 기준보다 얼마나 색이 치우쳤는지 본다
  const out = new ImageData(w, h);
  const o = out.data;
  const isLip = new Uint8Array(w * h);   // 입술만 따로 표시해 둔다 (뭉갤 때 세기를 달리한다)
  for (let i = 0; i < w * h; i++) { o[i * 4] = 255; o[i * 4 + 1] = 255; o[i * 4 + 2] = 255; }

  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    if (eye[k + 3] > 120) continue;                       // 눈알은 화장이 아니다
    const onSkin = skin[k + 3] > 120, onLip = lip[k + 3] > 120, onBrow = brow[k + 3] > 120;
    if (!onSkin && !onLip && !onBrow) continue;           // 배경·머리카락 제외

    const r = px[k], g = px[k + 1], b = px[k + 2];
    const l = (r + g + b) / 3;

    // 머리카락 걸러내기.
    // 참고 사진의 앞머리·잔머리가 이마와 눈가를 덮고 있는데, 분할 모델이 256픽셀로 보다 보니
    // 가는 머리카락은 피부로 분류된다. 그대로 두면 머리카락 자국이 템플릿에 구워져
    // 씌웠을 때 얼굴에 머리 그림자가 남는다.
    // 화장은 아무리 진해도 피부보다 이만큼 어둡지 않다. 그래서 너무 어두우면 머리로 본다.
    if (!onLip && baseL - l > 46) continue;
    // 밝기를 뺀 "색 성분"만 비교한다 — 그늘과 광은 화장이 아니다
    const dC = Math.hypot((r - l) - baseC[0], (g - l) - baseC[1], (b - l) - baseC[2]);

    let a;
    if (onLip) {
      // 입술은 화장한 사진에서 거의 항상 발라져 있다. 모양은 모델이 픽셀로 잡아 준다.
      a = Math.max(0.75, Math.min(0.97, (dC - 2) / 16));
    } else if (onBrow) {
      a = Math.max(0, Math.min(0.7, (dC - 5) / 18));
    } else {
      // 피부 위 화장은 "눈두덩 띠 안"에서만 본다.
      // 얼굴 전체에서 톤이 다른 곳을 모두 집어오면 이마·관자놀이·눈 밑까지 딸려 와
      // 얼룩으로 찍힌다. 부위를 먼저 자르고, 그 안에서만 화장을 찾는다.
      const up = nearUp[k + 3] / 255, down = nearDown[k + 3] / 255;
      if (up < 0.05 && down < 0.05) continue;
      const dark = baseL - l;
      // 너무 어두운 것은 섀도가 아니라 속눈썹·머리카락이다
      const aDark = dark > 40 ? 0 : Math.max(0, Math.min(1, (dark - 2) / 16));
      const aRed = Math.max(0, Math.min(1, (redOf(r, g, b) - baseRed) / 7));
      // 위아래 모두 음영까지 화장으로 본다.
      // 참고 사진은 눈 아래에 일부러 섀도를 넣은 화장이라, 그 어두움이 곧 화장이다.
      // 눈 주변은 "화장인가 아닌가"를 골라내지 않는다.
      //
      // 눈 화장은 피부색과 차이가 아주 작아서, 기준을 낮춰도 거의 다 걸러졌다.
      // 립이 잘 되는 것은 색이 확 다르기 때문이지 방법이 좋아서가 아니다.
      // 그래서 눈은 입술과 같은 방식으로 간다 — 그 자리의 색을 그대로 가져오고,
      // 실제로 화장이 진한 곳은 더 진하게 실어 준다.
      // 자리(모양)는 모델이 찾은 눈 모양에서 나오므로 도형이 되지 않는다.
      const band = Math.max(up, down);
      const strong = Math.max(aRed, aDark);
      a = Math.min(0.9, band * (0.3 + 0.7 * strong)) * EYE_STRENGTH;
    }
    if (a <= 0.004) continue;

    // 색을 그대로 옮기지 않는다. "기준 피부 대비 몇 배"로 저장해
    // 곱하기로 얹으면 내 피부결·그늘이 그대로 비친다.
    // 눈 화장은 기준 피부색과 1~5% 밖에 차이가 없다. 그대로 저장하면 거의 흰색이 되어
    // 곱하기에서 아무 일도 일어나지 않는다. 그래서 그 작은 차이를 몇 배로 키운다.
    // 입술은 이미 차이가 커서 키우지 않는다 — 키우면 새까매진다.
    const gain = onLip ? 1 : 3.2;
    for (let c = 0; c < 3; c++) {
      let ratio = px[k + c] / Math.max(8, base[c]);
      ratio = 1 - (1 - ratio) * gain;
      ratio = Math.max(0.15, Math.min(1, ratio));
      o[k + c] = Math.round(ratio * 255);
    }
    o[k + 3] = Math.round(a * 255);
    if (onLip) isLip[i] = 1;
  }
  return { layer: out, isLip, base, parsed };
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
async function runSingle(pair) {
  const photo = await loadImage(pair.photo);
  show("cBare", photo); show("cMake", photo); show("cAlign", photo);
  const lm = state.lmk.detect(photo).faceLandmarks?.[0];
  if (!lm) { setStatus("사진에서 얼굴을 못 찾았어요"); return; }

  const w = photo.width, h = photo.height;
  setStatus("사진에서 화장을 뽑는 중…");
  const got = await extractFromSingle(photo, lm, w, h);
  if (!got) { setStatus("부위 분할 모델을 못 불러왔습니다 (data/face_parser.onnx)"); return; }
  const { layer, isLip, base, parsed } = got;
  state.tone = base;   // 참고 사진의 피부톤 — 씌울 때 여기에 맞춘다

  // 입술과 그 밖(피부 위 화장)을 나눠서 다르게 다듬는다.
  //
  // 왜 나누나
  // ---------
  // 참고 사진의 잔머리·속눈썹이 가는 줄로 남아 얼굴에 얼룩처럼 찍혔다. 값을 더 깎아 없애려 하면
  // 볼터치·섀도까지 같이 사라진다. 대신 성질로 구른다.
  // 피부 위 화장은 원래 뭉근하게 퍼져 있고, 머리카락은 가늘다. 그래서 피부 쪽만 크게 뭉개면
  // 가는 줄은 지워지고 넓게 퍼진 화장은 남는다.
  // 입술은 경계가 또렷해야 하므로 거의 건드리지 않는다.
  const unit = Math.min(w, h);
  const split = (want) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const d = new ImageData(new Uint8ClampedArray(layer.data), w, h);
    for (let i = 0; i < w * h; i++) if ((isLip[i] === 1) !== want) d.data[i * 4 + 3] = 0;
    cv.getContext("2d").putImageData(d, 0, 0);
    return cv;
  };

  const layerCv = document.createElement("canvas");
  layerCv.width = w; layerCv.height = h;
  const lc = layerCv.getContext("2d");
  lc.filter = `blur(${Math.max(2, unit * 0.022)}px)`;   // 피부 위 — 크게 뭉갠다
  lc.drawImage(split(false), 0, 0);
  lc.filter = `blur(${Math.max(1, unit * 0.004)}px)`;   // 입술 — 계단만 없앤다
  lc.drawImage(split(true), 0, 0);
  lc.filter = "none";
  show("cLayer", layerCv, "#111");

  state.tpl = bakeUV(layerCv, lm, w, h);
  show("cUV", state.tpl, "#111");
  // 얹을 때 내 얼굴의 부위에 맞춰 넣으려고 부위별 조각도 만들어 둔다
  state.parts = buildParts(layerCv, parsed, lm, w, h);
  $("colors").innerHTML = "";
  setStatus("④에 화장만 떠 있으면 제대로 뽑힌 것입니다. '내 얼굴에 씌워 보기'를 눌러 보세요.");
}

/* 마스크 밖이 원본과 픽셀 단위로 같은 쌍(인페인팅 결과)은 단순히 빼면 된다.
   색이 바뀐 정도를 재거나 이마로 보정하거나 부위로 자를 이유가 없다.
   차이가 나는 곳이 곧 화장이다. 그런 장치들은 재료가 어긋날 때 쓰는 것이고,
   여기서는 오히려 실제 화장을 깎아 먹는다. */
function extractClean(mkData, brData, w, h) {
  const m = mkData.data, b = brData.data;
  const out = new ImageData(w, h);
  const o = out.data;
  for (let i = 0; i < w * h; i++) { o[i * 4] = 255; o[i * 4 + 1] = 255; o[i * 4 + 2] = 255; }
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const dr = m[k] - b[k], dg = m[k + 1] - b[k + 1], db = m[k + 2] - b[k + 2];
    const de = Math.sqrt(dr * dr + dg * dg + db * db);
    // 기준을 높인다. 약한 차이는 화장이 아니라 인페인팅이 남긴 미세한 톤 변화다.
    // 그런 회색에 가까운 값이 쌓이면 얼굴이 퍼렇게 뜬다.
    const a = Math.max(0, Math.min(1, (de - 18) / 45));
    if (a < 0.08) continue;
    for (let c = 0; c < 3; c++) {
      o[k + c] = Math.round(Math.max(0.15, Math.min(1, m[k + c] / Math.max(8, b[k + c]))) * 255);
    }
    o[k + 3] = Math.round(a * 255);
  }
  return out;
}

async function run() {
  setStatus("사진을 읽고 얼굴 점을 찾는 중…");
  const pair = PAIRS[$("pair").value] ?? PAIRS.ffhq1;
  if (pair.single) return runSingle(pair);
  const bare = await loadImage(pair.bare);
  const make = await loadImage(pair.makeup);
  show("cBare", bare); show("cMake", make);

  const bLm = state.lmk.detect(bare).faceLandmarks?.[0];
  const mLm = state.lmk.detect(make).faceLandmarks?.[0];
  if (!bLm || !mLm) { setStatus("두 사진 중 하나에서 얼굴을 못 찾았어요"); return; }

  const w = bare.width, h = bare.height;
  let lit;
  if (pair.clean) {
    // 인페인팅 결과는 원본에서 마스크 안만 고친 것이라 이미 완벽히 겹쳐 있다.
    // 여기에 정렬이나 조명 보정을 걸면 오히려 사진 전체가 어긋나 전부 "화장"으로 잡힌다.
    lit = make;
    show("cAlign", make);
  } else {
    setStatus("화장 사진을 맨얼굴에 맞춰 정렬하는 중…");
    const aligned = alignTo(make, mLm, bLm, w, h);
    show("cAlign", aligned);
    setStatus("조명을 맞추는 중…");
    lit = matchLighting(aligned, bare, bLm, w, h).canvas;
    show("cAlign", lit);
  }

  setStatus("화장 층을 뽑는 중…");
  const bc = bare.getContext("2d", { willReadFrequently: true });
  const ac = lit.getContext("2d", { willReadFrequently: true });
  let layer;
  state.cleanPair = !!pair.clean;
  if (pair.clean) {
    layer = extractClean(ac.getImageData(0, 0, w, h), bc.getImageData(0, 0, w, h), w, h);
  } else {
    const mask = await makeupMaskOf(bare, bLm, w, h);
    if (!mask) { setStatus("부위 분할 모델을 못 불러왔습니다 (data/face_parser.onnx)"); return; }
    layer = extractLayer(ac.getImageData(0, 0, w, h), bc.getImageData(0, 0, w, h), w, h, mask, foreheadMaskOf(bLm, w, h));
  }

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

/**
 * 피부톤 맞추기.
 *
 * 화장은 입술·눈두덩만 얹히는데, 참고 사진의 피부톤 자체가 다르면 여전히 딴 사람 같다.
 * 그래서 얼굴 전체를 참고 사진의 피부톤 쪽으로 살짝 끌어당긴다. 파운데이션에 해당한다.
 *
 * 얼굴 가장자리에서 뚝 끊기면 얼굴 모양 판때기가 되므로, 판을 미리 흐려 두어
 * 턱·이마 쪽으로 갈수록 서서히 사라지게 만든다.
 */
function toneUVPlate() {
  if (state.toneUV) return state.toneUV;
  const uv = document.createElement("canvas");
  uv.width = uv.height = UV;
  const c = uv.getContext("2d");
  c.fillStyle = "#fff";
  for (let t = 0; t < state.tris.length; t += 3) {
    c.beginPath();
    for (let j = 0; j < 3; j++) {
      const i = state.tris[t + j];
      const x = state.faceUV[i][0] * UV, y = state.faceUV[i][1] * UV;
      j ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath(); c.fill();
  }
  const soft = document.createElement("canvas");
  soft.width = soft.height = UV;
  const sc = soft.getContext("2d");
  sc.filter = `blur(${UV * 0.05}px)`;   // 가장자리로 갈수록 옅어지게
  sc.drawImage(uv, 0, 0);
  sc.filter = "none";
  state.toneUV = soft;
  return soft;
}

/** 얼굴에서 피부색을 몇 군데 찍어 가운데값을 낸다 (도형이 아니라 점 몇 개다) */
const SKIN_PROBES = [10, 151, 9, 108, 337, 50, 280, 205, 425, 152, 175, 195];
function skinColorOf(src, lm, w, h) {
  const c = src.getContext ? src.getContext("2d", { willReadFrequently: true }) : null;
  let tmp = null;
  let ctx = c;
  if (!ctx) {  // 비디오처럼 캔버스가 아닌 것은 한 번 옮겨 담는다
    tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    ctx = tmp.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
  }
  const rs = [], gs = [], bs = [];
  for (const i of SKIN_PROBES) {
    const x = Math.round(lm[i].x * w), y = Math.round(lm[i].y * h);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    const d = ctx.getImageData(x - 1, y - 1, 3, 3).data;
    for (let k = 0; k < 9; k++) { rs.push(d[k * 4]); gs.push(d[k * 4 + 1]); bs.push(d[k * 4 + 2]); }
  }
  if (!rs.length) return null;
  const mid = (a) => { a.sort((x, y2) => x - y2); return a[Math.floor(a.length / 2)]; };
  return [mid(rs), mid(gs), mid(bs)];
}

/** 참고 사진 피부톤으로 끌어당기는 층을 만든다 */
function toneLayer(src, lm, w, h) {
  if (!state.tone) return null;
  const mine = skinColorOf(src, lm, w, h);
  if (!mine) return null;
  // 너무 세게 바꾸면 딴사람이 된다. 최대 12% 만 끌어당긴다.
  const ratio = state.tone.map((t, i) => Math.max(0.88, Math.min(1.12, t / Math.max(8, mine[i]))));

  const plate = toneUVPlate();
  const tinted = document.createElement("canvas");
  tinted.width = tinted.height = UV;
  const tc = tinted.getContext("2d");
  tc.drawImage(plate, 0, 0);
  tc.globalCompositeOperation = "source-in";   // 판의 모양(투명도)은 두고 색만 채운다
  tc.fillStyle = `rgb(${ratio.map((v) => Math.round(Math.min(1, v) * 255)).join(",")})`;
  tc.fillRect(0, 0, UV, UV);
  tc.globalCompositeOperation = "source-over";

  return unbakeUV(tinted, lm, w, h);
}


/* ────────────────────────────────────────────────────────────────
   부위 대 부위로 얹기 (A 방법)

   예전에는 화장을 "표준 얼굴 판(탈)"에 구워 두고 얼굴 점에 맞춰 늘려 씌웠다.
   점은 맞춰지지만 눈두덩 넓이 같은 면적은 사람마다 달라서, 섀도가 눈두덩을 벗어났다.

   그래서 얹을 때도 분할 모델을 돌린다.
   내 얼굴에서 입술·눈을 픽셀로 찾아, 그 자리에 맞춰 넣고 그 밖으로는 못 나가게 막는다.
   ──────────────────────────────────────────────────────────────── */

const PW = 256, PH = 128;   // 부위 조각을 담아 두는 고정 크기

/* 눈 화장 세기 (0 = 끔).
   지금 눈두덩은 "눈 모양을 위아래로 민 띠" 라는 편법으로 만든다. 분할 모델이 눈두덩을
   부위로 배우지 않았기 때문이다. 그 띠는 실제로 속눈썹 라인에 걸쳐서, 색을 얹으면
   화장이 아니라 눈가에 그은 줄처럼 보인다. 게다가 눈 화장은 신호가 약해 몇 배로 키워야
   보이는데, 그러면 잡티와 주름도 같이 커진다.
   → 분할 모델에 눈두덩 부위를 학습시키기 전까지는 꺼 둔다. */
const EYE_STRENGTH = 0;

/*
   부위마다 "기준 두 점"을 둔다.

   예전에는 부위를 네모로 잘라 그 네모에 맞춰 늘렸다. 그러면 눈이 기울어진 사람에게
   섀도가 비뚤게 앉는다. 네모는 항상 가로세로가 반듯하기 때문이다.

   대신 눈꼬리·눈머리처럼 부위의 축이 되는 점 두 개를 잡고, 그 두 점이 겹치도록
   돌리고 키워서 얹는다. 눈이 올라간 사람은 섀도도 같이 올라간다.
   테크닉 브랜치의 개인화(face-measure·personalize)가 "분류하지 말고 재라"고 한 것과 같은 생각이다.
*/
const PART_ANCHORS = {
  lip:   [61, 291],    // 입꼬리 양쪽
  eyeR:  [33, 133],    // 오른눈 눈머리·눈꼬리 (화면 기준 왼쪽)
  eyeL:  [362, 263],   // 왼눈
  browR: [70, 107],
  browL: [336, 300],
};
// 조각 안에서 기준 두 점이 놓이는 자리
const A_IN = [PW * 0.2, PH * 0.55], B_IN = [PW * 0.8, PH * 0.55];

/** 두 점 쌍을 겹치는 변환(이동·회전·확대) */
function similarity(p0, p1, q0, q1) {
  const px = p1[0] - p0[0], py = p1[1] - p0[1];
  const qx = q1[0] - q0[0], qy = q1[1] - q0[1];
  const pl = px * px + py * py || 1;
  const a = (px * qx + py * qy) / pl;      // 확대·회전의 실수부
  const b = (px * qy - py * qx) / pl;      // 허수부
  return { a, b, c: -b, d: a, e: q0[0] - (a * p0[0] - b * p0[1]), f: q0[1] - (b * p0[0] + a * p0[1]) };
}

const ptOf = (lm, i, w, h) => [lm[i].x * w, lm[i].y * h];

/** 눈 위·아래 띠를 만든다 — 모델이 찾은 눈 모양을 밀어서 쓴다 */
function eyeBandsOf(parsed, w, h) {
  const eyeCv = maskToCanvas(parsed, LABEL.EYE, w, h);
  const lift = Math.max(4, Math.min(w, h) * 0.035);
  const band = (dy) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.drawImage(eyeCv, 0, dy);
    c.globalCompositeOperation = "destination-out";
    c.drawImage(eyeCv, 0, 0);
    c.globalCompositeOperation = "source-over";
    return cv;
  };
  const both = document.createElement("canvas");
  both.width = w; both.height = h;
  const bc = both.getContext("2d");
  bc.drawImage(band(-lift), 0, 0);
  bc.drawImage(band(lift * 0.85), 0, 0);
  const soft = document.createElement("canvas");
  soft.width = w; soft.height = h;
  const sc = soft.getContext("2d", { willReadFrequently: true });
  sc.filter = `blur(${Math.max(2, Math.min(w, h) * 0.012)}px)`;
  sc.drawImage(both, 0, 0);
  sc.filter = "none";
  return soft;
}

/** 좌우로 가른다 — 눈·눈썹은 한 덩어리로 잡히므로 따로 다뤄야 축을 맞출 수 있다 */
function halfOf(maskCv, lm, w, h, right) {
  const midX = lm[168].x * w;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  c.drawImage(maskCv, 0, 0);
  c.globalCompositeOperation = "destination-out";
  c.fillRect(right ? midX : 0, 0, right ? w - midX : midX, h);
  return cv;
}

/** 얼굴에서 부위별 마스크를 만든다 (참고 사진·내 얼굴 양쪽에 같은 방식으로 쓴다) */
function partMasks(parsed, lm, w, h) {
  const eye = eyeBandsOf(parsed, w, h);
  const brow = maskToCanvas(parsed, LABEL.BROW, w, h);
  return {
    lip: maskToCanvas(parsed, LABEL.LIP, w, h),
    eyeR: halfOf(eye, lm, w, h, true),
    eyeL: halfOf(eye, lm, w, h, false),
    browR: halfOf(brow, lm, w, h, true),
    browL: halfOf(brow, lm, w, h, false),
  };
}

/** 참고 사진에서 부위별 조각을 만든다 — 기준 두 점이 조각 안 정해진 자리에 오게 */
function buildParts(layerCv, parsed, lm, w, h) {
  const masks = partMasks(parsed, lm, w, h);
  const parts = {};
  for (const [name, mask] of Object.entries(masks)) {
    const [ia, ib] = PART_ANCHORS[name];
    const m = similarity(ptOf(lm, ia, w, h), ptOf(lm, ib, w, h), A_IN, B_IN);

    const only = document.createElement("canvas");
    only.width = w; only.height = h;
    const oc = only.getContext("2d");
    oc.drawImage(layerCv, 0, 0);
    oc.globalCompositeOperation = "destination-in";
    oc.drawImage(mask, 0, 0);
    oc.globalCompositeOperation = "source-over";

    const patch = document.createElement("canvas");
    patch.width = PW; patch.height = PH;
    const pc = patch.getContext("2d");
    pc.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    pc.drawImage(only, 0, 0);
    parts[name] = patch;
  }
  return parts;
}

/** 내 얼굴에 부위별로, 내 눈매 축에 맞춰 얹는다 */
async function makeupForFace(source, lm, w, h) {
  if (!state.parts) return null;
  const parsed = await parseFace(source, lm, w, h);
  if (!parsed) return null;

  // 원본 크기로 마스크를 여러 장 다루면 화면이 버벅인다. 작게 만들고 마지막에 키운다.
  const sc = Math.min(1, 384 / Math.max(w, h));
  const sw = Math.max(64, Math.round(w * sc)), sh = Math.max(64, Math.round(h * sc));
  const masks = partMasks(parsed, lm, sw, sh);

  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  const oc = out.getContext("2d");   // 바탕은 투명 — 흰색으로 채우면 화면 색이 빠진다

  for (const [name, mask] of Object.entries(masks)) {
    const patch = state.parts[name];
    if (!patch) continue;
    const [ia, ib] = PART_ANCHORS[name];
    // 조각 안의 기준 자리를 내 얼굴의 기준 두 점으로 보낸다 (돌리고 키운다)
    const m = similarity(A_IN, B_IN, ptOf(lm, ia, sw, sh), ptOf(lm, ib, sw, sh));

    const one = document.createElement("canvas");
    one.width = sw; one.height = sh;
    const c = one.getContext("2d");
    c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    c.drawImage(patch, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "destination-in";   // 내 부위 밖으로는 못 나간다
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = "source-over";
    oc.drawImage(one, 0, 0);
  }

  if (sc === 1) return out;
  const big = document.createElement("canvas");
  big.width = w; big.height = h;
  big.getContext("2d").drawImage(out, 0, 0, w, h);
  return big;
}

async function applyToMine() {
  if (!state.tpl || !state.mineLm) { setStatus("내 얼굴 사진을 못 읽었어요"); return; }
  const w = state.mine.width, h = state.mine.height;
  show("cMine", state.mine);
  const warped = (await makeupForFace(state.mine, state.mineLm, w, h))
    ?? unbakeUV(state.tpl, state.mineLm, w, h);
  const out = $("cOut");
  out.width = w; out.height = h;
  const c = out.getContext("2d");
  c.drawImage(state.mine, 0, 0);
  // 실시간과 같은 방식으로 얹는다 — 덮어 칠하면 스티커가 된다
  c.globalCompositeOperation = "multiply";
  c.drawImage(warped, 0, 0);
  if (!state.cleanPair) {
    c.globalCompositeOperation = "color";
    c.globalAlpha = 0.7;
    c.drawImage(warped, 0, 0);
  }
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

  setStatus("부위 분할 모델을 불러오는 중…");
  state.parser = await loadParser();

  // 씌울 얼굴. AI 생성 얼굴에 붙여 보려고 기본을 바꿨다 (원래는 내 사진)
  state.mine = await loadImage("./data/my_face.png");
  state.mineLm = state.lmk.detect(state.mine).faceLandmarks?.[0];

  $("pair").innerHTML = Object.entries(PAIRS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  $("pair").value = "ip";   // 생성 쌍을 기본으로 — 같은 얼굴·같은 조명이라 화장만 깨끗이 남는다
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
      // 내 부위에 맞춘 탈을 한 번만 굽는다.
      //
      // 분할 모델은 무거워서 매 프레임 돌리면 얼굴 추적이 느려진다.
      // 그런데 내 입술 모양과 눈두덩 넓이는 프레임마다 달라지지 않는다. 사람이 같으니까.
      // 그래서 카메라를 켜고 첫 프레임에서 한 번만 분할을 돌려 "내 전용 탈"을 굽고,
      // 그 뒤로는 얼굴 점만 따라가며 그 탈을 씌운다. 고개를 돌리는 것은 점이 처리한다.
      if (!live.fitted && !live.busy) {
        live.busy = true;
        // 피부톤 층은 여기에 섞지 않는다.
        // 실시간 합성은 이 템플릿을 "곱하기" 다음에 "색" 으로 한 번 더 쓰는데,
        // 피부톤 층은 색이 거의 없는 회색이라 그 단계에서 얼굴 색을 통째로 빼 버린다.
        // 얼굴만 하얗게 뜨고 이마에 층의 경계가 가로줄로 보였다.
        makeupForFace(video, lm, w, h).then((cv) => {
          if (!cv) return;
          state.tpl = bakeUV(cv, lm, w, h);
          live.fitted = true;
        }).finally(() => { live.busy = false; });
      }
      const warped = warpTemplate(lm, w, h);
      // 곱하기로 얹는다 — 피부 결·그늘·광이 그대로 비친다 (덮어 칠하면 스티커가 된다)
      c.globalCompositeOperation = "multiply";
      c.drawImage(warped, 0, 0);
      // 색 층은 "색을 진하게" 하려고 넣은 것인데, 우리 층은 회색에 가까운 값이 많아
      // 오히려 그 자리 색을 빼앗아 얼굴이 퍼렇게 뜬다. 깨끗한 쌍에서는 쓰지 않는다.
      if (!state.cleanPair) {
        c.globalCompositeOperation = "color";
        c.globalAlpha = 0.7;
        c.drawImage(warped, 0, 0);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
    }
    if (++lFrames >= 20) {
      const now = performance.now();
      setStatus(`${lm ? (live.fitted ? "얼굴 추적 중" : "내 얼굴에 맞추는 중…") : "얼굴 미검출"}${live.bare ? " · 화장 끔" : ""} · 초당 ${(lFrames / ((now - lLast) / 1000)).toFixed(0)}장`);
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
  live.fitted = false;   // 카메라를 켤 때 한 번 다시 맞춘다
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
