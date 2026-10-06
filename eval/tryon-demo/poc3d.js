// 화장 템플릿 3D 매핑 POC — 조사로 확인된 업계 방식을 그대로 넣은 판.
//
// 무엇을 확인했고 무엇을 넣었나
// ------------------------------
// SenseTime(소다가 쓰는 엔진)의 공식 제작 매뉴얼과 SDK 헤더에서 확인한 것들이다.
//
//  1. 화장은 "표준 얼굴 한 장(750×1334px)"에 그려 둔다 — 이 판이 모든 얼굴에 공통으로 쓰인다.
//  2. 부위마다 합성 방식이 정해져 있다.
//       눈썹·아이라인·속눈썹·아이섀도·블러셔 → 곱하기(multiply)
//       쉐이딩                              → 소프트라이트(softLight)   ← 곱하기로 하면 탁해진다
//       컬러렌즈·마스크                      → 일반(normal)
//  3. 립스틱만은 그림이 아니다. 내부 타입명이 아예 `mask_lut` —
//       입술 모양 마스크 한 장 + 색·강도·명암·하이라이트·질감(6종) 파라미터.
//       그래서 색이 100가지여도 마스크는 한 장이면 된다.
//  4. 깊이(z)를 살려 얼굴 모양 면에 입힌다 — 고개를 돌리면 앞면이 뒷면을 가린다.
//     (SenseAR 은 아직 메이크업에 3D 메시를 쓰지 않지만, 2D 방식이 "눈·인중에서 당겨진다"고
//      공식 FAQ 에서 인정하고 3D 로 가겠다고 했다. 여기서는 그 앞을 먼저 본다.)

import { FaceLandmarker, FilesetResolver, ImageSegmenter } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import * as THREE from "vendor/three.module.min.js";

const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
const TPL_W = 2000, TPL_H = 4400;   // 늘린 이마가 판 밖(UV y<0)으로 나가 위쪽에 여백을 뒀다 (2026-10-05) // 표준 얼굴 캔버스 — SenseTime 규격(750×1334)의 2배. 아이라인이 13px 밖에 안 돼 깨져서 올림 (2026-10-02)

const state = { faceUV: null, tris: null, lmk: null, live: false, depth: true, wire: false, look: null, on: true };
let renderer, scene, camera, mesh, posAttr, videoTex, material, bgMesh;

// ── 부위별 얼굴 점 ─────────────────────────────────────────────────────────
const LIP_OUT = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LIP_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LID_R = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LID_L = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const BROW_LOW_R = [46, 53, 52, 65, 55];
const BROW_LOW_L = [276, 283, 282, 295, 285];
const CHEEK_R = [116, 117, 118, 101, 36, 205, 187, 123];
const CHEEK_L = [345, 346, 347, 330, 266, 425, 411, 352];
// 쉐이딩(얼굴 옆선) — 소프트라이트로 얹는다
const SHADE_R = [234, 227, 137, 177, 215, 138, 135, 169, 170, 140, 171, 175];
const SHADE_L = [454, 447, 366, 401, 435, 367, 364, 394, 395, 369, 396, 400];


/**
 * 눈 구멍 메우기 — MediaPipe 그물은 눈알 자리가 뚫려 있다.
 * 아이라인은 속눈썹 선(= 구멍의 경계)에 붙는 화장이라, 비워 두면 선이 끊긴다.
 * 눈 테두리 점만으로 메우면 구멍보다 작아 모서리에 틈이 남는다 — 그래서 삼각형 목록에서
 * "한 번만 쓰인 모서리"로 실제 구멍 경계를 찾아 그대로 메웠다.
 * 2026-10-02 측정 — 메우기 전 84.6, 눈 테두리만 92.2, 실제 구멍 100 (덮개율 퍼센트).
 */
const EYE_FILL_TRIS = [157, 173, 190, 157, 190, 133, 157, 133, 112, 157, 112, 26, 157, 26, 22, 157, 22, 23, 157, 23, 24, 157, 24, 110, 157, 110, 25, 157, 25, 130, 157, 130, 247, 157, 247, 161, 157, 161, 160, 157, 160, 159, 157, 159, 158, 387, 388, 466, 387, 466, 467, 387, 467, 359, 387, 359, 255, 387, 255, 339, 387, 339, 254, 387, 254, 253, 387, 253, 252, 387, 252, 256, 387, 256, 341, 387, 341, 362, 387, 362, 414, 387, 414, 398, 387, 398, 384, 387, 384, 385, 387, 385, 386];


/**
 * 이마 늘리기 — MediaPipe 그물은 눈썹 조금 위에서 끝난다. 그대로 두면 이마에 화장이 안 올라가고
 * 그물 끝에 선이 보인다. 이마 위 테두리 점들을 얼굴 중심 반대쪽으로 밀어 새 점을 만들고,
 * 그 사이를 삼각형으로 메워 그물을 머리카락 쪽까지 넓힌다. (2026-10-05)
 */
/** 머리선 점 — 분할 모델로 찾은 '얼굴 피부가 끝나는 선'을 얼굴 폭·길이 비율로 적어둔 것 */
const HAIRLINE_REL = [[0.0997, -0.0002], [0.161, -0.0002], [0.2234, -0.0002], [0.2848, -0.0701], [0.3462, -0.1084], [0.4076, -0.1323], [0.469, -0.1408], [0.5304, -0.151], [0.5928, -0.174], [0.6542, -0.1561], [0.7155, -0.1093], [0.7769, -0.0607], [0.8383, -0.0002], [0.8997, -0.0002]];
const BROW_ARC = [127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356];
const FOREHEAD_BASE = 468;                 // 새 점 번호는 468 부터
/** ARC 각 점에서 머리선까지의 거리 — 얼굴 길이(10번↔턱) 대비 비율.
 *  분할 모델로 찾은 실제 머리선이라 사람이 달라도 비율이 비슷하다 (2026-10-05) */
const FOREHEAD_PUSH = 1.05;   // 눈 가로의 몇 배까지 이마를 덮을지 (머리카락은 셰이더가 깎는다)

/** 이마 점의 화면 좌표 — 테두리 점을 턱 반대 방향으로 민다 */
function foreheadPoint(lm, k, w, h) {
  const b = lm[BROW_ARC[k]], chin = lm[152];
  const dx = (b.x - chin.x), dy = (b.y - chin.y);
  const len = Math.hypot(dx * w, dy * h) || 1;
  const eye = Math.hypot((lm[33].x - lm[133].x) * w, (lm[33].y - lm[133].y) * h);
  const s = (eye * FOREHEAD_PUSH) / len;
  return { x: b.x + dx * s, y: b.y + dy * s, z: b.z };
}

/** 이마 점의 UV — 같은 방식으로 UV 판 위에서도 민다 */
function foreheadUV(uv) {
  const chin = uv[152];
  return BROW_ARC.map((i, k) => {
    const b = uv[i];
    const dx = b[0] - chin[0], dy = b[1] - chin[1];
    const len = Math.hypot(dx, dy) || 1;
    const eye = Math.hypot(uv[33][0] - uv[133][0], uv[33][1] - uv[133][1]);
    const s = (eye * FOREHEAD_PUSH) / len;
    return [b[0] + dx * s, b[1] + dy * s];
  });
}

/** 테두리 점과 새 이마 점 사이를 삼각형으로 메운다 */
function foreheadTriangles() {
  const out = [];
  for (let k = 0; k < BROW_ARC.length - 1; k++) {
    const a = BROW_ARC[k], b = BROW_ARC[k + 1];
    const a2 = FOREHEAD_BASE + k, b2 = FOREHEAD_BASE + k + 1;
    out.push(a, b, b2, a, b2, a2);
  }
  return out;
}
const BUILD = "10-05 18:40";   // 화면에 찍어 최신 코드인지 바로 확인
const VERTS = FOREHEAD_BASE + BROW_ARC.length;


/**
 * 내 머리선 찾기 — 카메라를 켤 때 한 장만 분할 모델에 넣는다 (매 프레임 아님).
 * 얼굴 점 10번(이마 중간)에서 위로 올라가며 "얼굴 피부"가 끝나는 곳이 머리선이다.
 * 팀 eval/faceshape/hairline.py 와 같은 방식. 실패하면 HAIRLINE_D 기본값을 그대로 쓴다.
 */
const FACE_SKIN = 3;   // selfie_multiclass: 0 배경 1 머리카락 2 몸피부 3 얼굴피부 4 옷 5 기타
async function measureHairline(video, lm) {
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const seg = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "models/selfie_multiclass_256x256.tflite" },
      outputCategoryMask: true, runningMode: "IMAGE",
    });
    const w = video.videoWidth, h = video.videoHeight;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(video, 0, 0, w, h);
    const res = seg.segment(cv);
    const mask = res.categoryMask;
    const mw = mask.width, mh = mask.height, data = mask.getAsUint8Array();
    const at = (x, y) => data[Math.min(Math.max(Math.round(y * mh / h), 0), mh - 1) * mw
                            + Math.min(Math.max(Math.round(x * mw / w), 0), mw - 1)];
    const chin = { x: lm[152].x * w, y: lm[152].y * h };
    const top = { x: lm[10].x * w, y: lm[10].y * h };
    const faceH = Math.hypot(top.x - chin.x, top.y - chin.y) || 1;
    const out = BROW_ARC.map((i) => {
      const bx = lm[i].x * w, by = lm[i].y * h;
      let dx = bx - chin.x, dy = by - chin.y;
      const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      let d = 0;
      while (d < faceH * 0.45 && at(bx + dx * (d + 2), by + dy * (d + 2)) === FACE_SKIN) d += 2;
      return Math.max(0, d) / faceH;
    });
    mask.close(); seg.close();
    if (out.some((v) => v > 0.02)) { HAIRLINE_D.splice(0, HAIRLINE_D.length, ...out); return true; }
  } catch (e) { console.warn("머리선 찾기 실패 — 기본값으로 간다", e); }
  return false;
}

/** UV 좌표(0~1)를 표준 판 픽셀로 */
const P = (i) => [state.faceUV[i][0] * TPL_W, state.faceUV[i][1] * TPL_H];
const path = (c, idx) => { idx.forEach((i, k) => { const [x, y] = P(i); k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };

/** 눈두덩 — 쌍꺼풀 선에서 눈썹 쪽으로 넓힌 띠 */
function lidBand(c, lid, brow, reach) {
  const top = lid.map((li, k) => {
    const b = P(brow[Math.min(brow.length - 1, Math.round((k / (lid.length - 1)) * (brow.length - 1)))]);
    const l = P(li);
    return [l[0] + (b[0] - l[0]) * reach, l[1] + (b[1] - l[1]) * reach];
  });
  const pts = [...lid.map(P), ...top.reverse()];
  pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

/** 표준 판 한 장을 만든다 */
function makeCanvas() {
  const cv = document.createElement("canvas");
  cv.width = TPL_W; cv.height = TPL_H;
  return cv;
}

/**
 * 템플릿 세 장을 만든다 — 합성 방식이 다르면 판도 나눈다.
 *   mul  : 곱하기로 얹을 것 (눈썹·섀도·블러셔)
 *   soft : 소프트라이트로 얹을 것 (쉐이딩)
 *   lip  : 입술 마스크 (모양만, 색은 파라미터)
 */
/**
 * 디자이너가 그린 판을 읽어 둔다 — SenseTime 규격 그대로 PNG 3장.
 *   mul  : 곱하기로 얹을 판 (눈썹·라이너·속눈썹·섀도·블러셔)
 *   soft : 소프트라이트로 얹을 판 (쉐이딩)
 *   lip  : 입술 모양 마스크 (흰색 모양만 — 색은 파라미터)
 * 파일이 없으면 null 로 두고, 그 부위만 아래 코드 그림으로 되돌아간다.
 */
async function loadDrawn(look) {
  if (!look.files || look.drawn) return;
  const one = (src) => new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.onload = () => { const cv = makeCanvas(); cv.getContext("2d").drawImage(img, 0, 0, TPL_W, TPL_H); res(cv); };
    img.onerror = () => res(null);
    img.src = src;
  });
  const [mul, soft, lip] = await Promise.all([one(look.files.mul), one(look.files.soft), one(look.files.lip)]);
  look.drawn = { mul, soft, lip };
}

function buildTemplates(look) {
  const d = look.drawn || {};
  const mul = d.mul || makeCanvas(), soft = d.soft || makeCanvas(), lip = d.lip || makeCanvas();
  // 그린 판을 쓰는 룩이면 그린 것만 올린다 — 안 그린 부위는 비워 둔다.
  // 코드 그림으로 메우면 "내가 안 그린 화장"이 얼굴에 올라가 무엇을 그렸는지 알 수 없다.
  if (look.files) return { mul, soft, lip };
  const mc = mul.getContext("2d"), sc = soft.getContext("2d"), lc = lip.getContext("2d");

  const draw = (c, fn, color, alpha, blur) => {
    c.save(); c.globalAlpha = alpha; c.filter = `blur(${blur}px)`; c.fillStyle = color;
    c.beginPath(); fn(c); c.fill("evenodd"); c.restore();
  };

  // 곱하기 판 — 눈두덩, 볼터치, 눈썹
  if (!d.mul) {
  draw(mc, (c) => {
    lidBand(c, LID_R, BROW_LOW_R, look.shadowReach);
    lidBand(c, LID_L, BROW_LOW_L, look.shadowReach);
  }, look.shadow, look.shadowA, 22);
  draw(mc, (c) => { path(c, CHEEK_R); path(c, CHEEK_L); }, look.cheek, look.cheekA, 40);
  draw(mc, (c) => { path(c, BROW_R); path(c, BROW_L); }, look.brow, look.browA, 6);

  }
  // 소프트라이트 판 — 쉐이딩
  if (!d.soft)
  draw(sc, (c) => { path(c, SHADE_R); path(c, SHADE_L); }, look.shade, look.shadeA, 34);

  // 입술 마스크 — 흰색 모양만. 색은 셰이더가 파라미터로 받는다
  if (!d.lip)
  draw(lc, (c) => { path(c, LIP_OUT); path(c, LIP_IN); }, "#fff", 1, 4);

  return { mul, soft, lip };
}

// ── 룩 — 색과 수치만. 그림이 아니다 ─────────────────────────────────────────
// 립은 SenseAR TryOn 과 같은 형태: 색 · 강도 · 명암 · 하이라이트 · 질감
const FINISH = { matte: 0, creamy: 1, lustre: 2, glossy: 3 };
const LOOKS = {
  kr_la: {
    lip0: true,
    name: "a 가는 캣아이 · 속눈썹 분리",
    files: { mul: "drawn/kr-v3aN-mul.png", soft: "drawn/kr-soft.png", lip: "drawn/lip-over1.png" },
    lash: "v3a",
    eyeM: "drawn/eye-under.png", eyeL: "drawn/eye-lid.png", eyeS: "drawn/eye-soft.png",
    glow: "drawn/glow-soft.png", blush: "drawn/blush-mul.png",
    lip: "#aa6970", lipA: 0.62, lipMid: 0.52, lipHi: 0.55, finish: "glossy",
    shadow: "#d98d92", shadowA: 0, shadowReach: 0.6,
    cheek: "#e79c9c", cheekA: 0, brow: "#6b4f3f", browA: 0,
    shade: "#b08a72", shadeA: 0,
  },
  kr_lb: {
    lip0: true,
    name: "b 굵은 윙 볼륨 · 속눈썹 분리",
    files: { mul: "drawn/kr-v3bN-mul.png", soft: "drawn/kr-soft.png", lip: "drawn/lip-over1.png" },
    lash: "v3b",
    eyeM: "drawn/eye-under.png", eyeL: "drawn/eye-lid.png", eyeS: "drawn/eye-soft.png",
    glow: "drawn/glow-soft.png", blush: "drawn/blush-mul.png",
    lip: "#aa6970", lipA: 0.62, lipMid: 0.52, lipHi: 0.55, finish: "glossy",
    shadow: "#d98d92", shadowA: 0, shadowReach: 0.6,
    cheek: "#e79c9c", cheekA: 0, brow: "#6b4f3f", browA: 0,
    shade: "#b08a72", shadeA: 0,
  },
  kr_lc: {
    lip0: true,
    name: "c 둥근 돌리 · 속눈썹 분리",
    files: { mul: "drawn/kr-v3cN-mul.png", soft: "drawn/kr-soft.png", lip: "drawn/lip-over1.png" },
    lash: "v3c",
    eyeM: "drawn/eye-under.png", eyeL: "drawn/eye-lid.png", eyeS: "drawn/eye-soft.png",
    glow: "drawn/glow-soft.png", blush: "drawn/blush-mul.png",
    lip: "#aa6970", lipA: 0.62, lipMid: 0.52, lipHi: 0.55, finish: "glossy",
    shadow: "#d98d92", shadowA: 0, shadowReach: 0.6,
    cheek: "#e79c9c", cheekA: 0, brow: "#6b4f3f", browA: 0,
    shade: "#b08a72", shadeA: 0,
  },
};

// ── 셰이더 — 부위별 합성 방식을 여기서 나눈다 ───────────────────────────────
const VERT = `
attribute float aFade;        // 그물 테두리 0 → 안쪽 1
varying vec2 vUv;
varying vec4 vClip;
varying float vFade;
void main() {
  vUv = uv;
  vFade = aFade;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = p;
  gl_Position = p;
}`;

// ── 얼굴형 줄이기 (워핑) ───────────────────────────────────────────────────
// 그물만 안쪽으로 당기면 원래 턱이 뒤에 그대로 남는다. 그래서 '영상을 읽어 오는
// 자리'를 바깥으로 밀어 둔다 — 화면의 이 점에는 원래 더 바깥에 있던 살이 와서
// 찍히고, 결과적으로 얼굴이 좁아진다. 제어점에서 멀어지면 영향이 0 으로 사라져
// 배경과 머리카락은 그대로 남는다.
const WARP_SRC = `
#define WARP_MAX 48
uniform vec2  uWC[WARP_MAX];   // 윤곽 제어점 (화면 좌표 0~1)
uniform vec2  uWD[WARP_MAX];   // 각 점이 밀어낼 방향·거리
uniform int   uWN;
uniform float uWSig;           // 이웃 점끼리 섞이는 폭
uniform float uAspect;

// 점마다 따로 당기면(가중치를 더하면) 겹치는 자리가 두 배로 밀려 윤곽이 울퉁불퉁해진다.
// 그래서 가중치로 '평균'을 내어 방향을 하나로 모으고, 세기만 윤곽 가까이에서 1 이 되게 한다.
// 그러면 턱선 전체가 한 덩어리로 들어간다 (소다가 보이는 모습).
vec2 warp(vec2 p) {
  vec2 sum = vec2(0.0);
  float wsum = 0.0;
  for (int i = 0; i < WARP_MAX; i++) {
    if (i >= uWN) break;
    vec2 d = p - uWC[i];
    d.x *= uAspect;
    float w = exp(-dot(d, d) / (2.0 * uWSig * uWSig));
    sum += uWD[i] * w;
    wsum += w;
  }
  if (wsum < 1e-5) return p;
  vec2 dir = sum / wsum;                 // 이웃 점들의 평균 방향 — 매끄럽게 이어진다
  float gate = 1.0 - exp(-wsum * 1.6);   // 윤곽에서 멀어지면 0 으로 사라진다
  vec2 o = dir * gate;
  o.x /= uAspect;
  return p + o;
}
`;

const FRAG = `
precision highp float;
${WARP_SRC}
uniform sampler2D uVideo, uMul, uSoft, uLip, uHair, uEyeM, uEyeL, uEyeS, uGlow, uBrow, uBlush;   // uHair: 화면 좌표 머리카락 확률
uniform vec3 uLipColor;
uniform float uLipA, uLipMid, uLipHi, uFinish, uOn;
uniform float uMulAmt, uSoftAmt;   // 화면에서 바로 조절하는 세기
uniform float uEyeMAmt, uEyeLAmt, uEyeSAmt;  // 눈 아래 / 눈두덩 / 애교살 — 따로 쥔다
uniform float uGlowAmt, uLipDim;             // 물광 / 입술 입체감
uniform float uBrowAmt, uBrowStep;           // 눈썹 다듬기 세기 / 피부를 가져올 거리
uniform float uBlushAmt;                     // 볼터치 — 눈 바로 아래
varying vec2 vUv;
varying vec4 vClip;
varying float vFade;

// 소프트라이트 — 밑의 명암을 살리면서 밝기를 조절한다 (쉐이딩용)
vec3 softLight(vec3 b, vec3 s) {
  return mix(
    b - (1.0 - 2.0 * s) * b * (1.0 - b),
    b + (2.0 * s - 1.0) * (mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25))) - b),
    step(vec3(0.5), s));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  // 화면 좌표로 영상을 읽는다 — 이 픽셀 아래 피부색
  vec2 sUv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec2 wUv = warp(sUv);
  vec3 base = texture2D(uVideo, wUv).rgb;
  vec3 col = base;
  // 머리카락이면 화장을 지운다 — 머리선 위치를 맞히지 않아도 되는 이유
  float skin = (1.0 - clamp(texture2D(uHair, wUv).r * 1.25, 0.0, 1.0)) * vFade;

  if (uOn > 0.5) {
    // ⓪ 눈썹 다듬기 — 눈썹을 밀면 이마·눈두덩 피부까지 끌려오므로 위치는 건드리지 않는다.
    //    대신 위/아래 가장자리를 '주변 피부'로 덮어 모양만 바꾼다.
    vec4 bw = texture2D(uBrow, vUv);
    if (bw.a > 0.001) {
      float dir = (0.5 - bw.r) * 2.0;                  // + 면 위쪽 피부를 가져온다
      vec3 sk = texture2D(uVideo, warp(sUv + vec2(0.0, dir * uBrowStep))).rgb;
      col = mix(col, sk, bw.a * uBrowAmt * skin);
    }

    // ① 곱하기 — 눈썹·섀도·블러셔
    vec4 m = texture2D(uMul, vUv);
    col = mix(col, col * m.rgb, m.a * uMulAmt * skin);

    // ①-a2 볼터치 — 눈 바로 아래. 라이너와 같은 판에 두면 따로 조절할 수 없어 떼어 냈다.
    vec4 bl = texture2D(uBlush, vUv);
    col = mix(col, col * bl.rgb, bl.a * uBlushAmt * skin);

    // ①-b 눈 아래 — 분홍 기 · 애교살 아래 그림자 선
    vec4 em = texture2D(uEyeM, vUv);
    col = mix(col, col * em.rgb, em.a * uEyeMAmt * skin);

    // ①-c 눈두덩 — 쌍꺼풀 라인 섀도 (눈꼬리로 갈수록 진해지고 밖으로 번진다)
    vec4 el = texture2D(uEyeL, vUv);
    col = mix(col, col * el.rgb, el.a * uEyeLAmt * skin);

    // ② 소프트라이트 — 쉐이딩
    vec4 s = texture2D(uSoft, vUv);
    col = mix(col, softLight(col, s.rgb), s.a * uSoftAmt * skin);

    // ②-b 애교살 밝힘
    vec4 es = texture2D(uEyeS, vUv);
    col = mix(col, softLight(col, es.rgb), es.a * uEyeSAmt * skin);

    // ②-c 물광 — 광대·콧대·코끝·윗입술 산·턱. 고르게 밝히지 않고 '밝힐 데만' 밝힌다.
    vec4 gl = texture2D(uGlow, vUv);
    float gA = gl.a * uGlowAmt * skin;
    col = mix(col, softLight(col, gl.rgb), gA * 0.65);
    col += gl.rgb * (gA * gA * 0.22);          // 젖은 듯한 반짝임 — 겹쳐 더한다

    // ③ 립스틱 — 마스크 + 색 파라미터. 그림이 아니다.
    //    밝기(명암)는 원본 것을 살리고 색만 옮긴다. 질감은 광택으로 표현.
    vec4 lp = texture2D(uLip, vUv);
    float lipM = lp.a * uLipA * skin;
    if (lipM > 0.001) {
      float l = luma(col);
      // 판에 그려 둔 입술 명암 지도 (0.5 기준). 카메라 조명과 무관하게 입체감을 만든다.
      float shape = lp.r;
      // 명암(midtone): 0.5 면 그대로, 낮으면 어둡게 높으면 밝게
      float lAdj = l + (uLipMid - 0.5) * 0.6 + (shape - 0.5) * uLipDim;
      vec3 tinted = uLipColor * (lAdj / max(luma(uLipColor), 0.001));
      // 색은 옮기되 밝기 변화는 눌러서 입술 주름·광택이 살아남게 한다
      vec3 lipCol = mix(vec3(lAdj), tinted, 0.85);
      lipCol = mix(col, lipCol, 0.92);
      // 질감 — 원래 밝던 곳만 더 밝힌다
      float glossAmt = uFinish * 0.12;          // matte 0 → glossy 0.36
      float hi = smoothstep(0.55, 0.95, l);
      float band = smoothstep(0.62, 0.95, shape);   // 판에 그린 광 띠
      float gloss = max(hi * hi, band);
      lipCol += gloss * (glossAmt + uLipHi * 0.18) * 1.6;
      col = mix(col, lipCol, lipM);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;





// ── 얼굴형 줄이기 — 제어점 ────────────────────────────────────────────────
// 턱선·광대 점에서 '영상을 읽는 자리'를 얼굴 바깥으로 민다. 밀수록 그 자리에
// 더 바깥의 살이 와서 찍혀 얼굴이 좁아진다. 쉐딩과 달리 모양 자체가 바뀐다.
const WARP_MAX = 48;
// 얼굴 아래쪽 윤곽을 관자놀이 → 턱 끝 순서로 늘어놓는다 (양쪽).
// 부위를 따로 만들지 않고 한 줄로 두어야 턱선이 한 덩어리로 들어간다.
const OVAL_R = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148];
const OVAL_L = [356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377];
const CHIN   = 152;
// 각 점의 세기 — 관자놀이는 거의 0, 광대 중간, 턱선이 가장 세다
const OVAL_W = [0.10, 0.30, 0.62, 0.85, 1.00, 1.00, 1.00, 0.95, 0.88, 0.78, 0.66];
let JAW_K = 0.18, CHEEK_K = 0.10;     // 눈 가로폭 대비 — 슬라이더로 조절
const warpC = Array.from({ length: WARP_MAX }, () => new THREE.Vector2());
const warpD = Array.from({ length: WARP_MAX }, () => new THREE.Vector2());
let bgMat = null;

// ── 진단 ──────────────────────────────────────────────────────────────────
// 얼굴 옆 선이 어느 층에서 오는지 가리려고 하나씩 끈다. 상태줄에 지금 모드가 찍힌다.
const DIAG_LABEL = ["전부 켬", "화장 끔(얼굴형만)", "얼굴형 끔(화장만)", "둘 다 끔"];
let DIAG = 0;

function updateWarp(lm, w, h) {
  // 얼굴 중심 — 이마 꼭대기와 턱 끝의 가운데. 여기서 바깥으로 밀면 턱이 V 로 들어온다.
  const cx = (lm[10].x + lm[152].x) / 2, cy = (lm[10].y + lm[152].y) / 2;
  const asp = w / h;
  const eyeU = Math.hypot(lm[33].x - lm[133].x, (lm[33].y - lm[133].y) / asp);
  let n = 0;
  const put = (i, wt) => {
    if (n >= WARP_MAX) return;
    const p = lm[i];
    // 광대 쪽은 CHEEK_K, 턱 쪽은 JAW_K 를 쓰되 가중치로 부드럽게 섞는다
    const k = CHEEK_K + (JAW_K - CHEEK_K) * wt;
    let dx = (p.x - cx) * asp, dy = -(p.y - cy);
    const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    warpC[n].set(p.x, 1 - p.y);
    warpD[n].set(dx * eyeU * k * wt, dy * eyeU * k * wt);
    n++;
  };
  const slimOn = DIAG === 0 || DIAG === 1;
  if (slimOn && (JAW_K > 0.0001 || CHEEK_K > 0.0001)) {
    for (let j = 0; j < OVAL_R.length; j++) put(OVAL_R[j], OVAL_W[j]);
    for (let j = 0; j < OVAL_L.length; j++) put(OVAL_L[j], OVAL_W[j]);
    put(CHIN, 0.55);
  }
  if (material) material.uniforms.uBrowStep.value = eyeU * 0.14;   // 눈썹 두께에 맞춘 거리
  const sig = Math.max(eyeU * 0.42, 0.01);   // 이웃 점끼리 겹치게 — 작으면 다시 울퉁불퉁해진다
  for (const m of [material, bgMat]) {
    if (!m || !m.uniforms.uWN) continue;
    m.uniforms.uWN.value = n;
    m.uniforms.uWSig.value = sig;
  }
}


// ── 그물 가장자리 흐리기 ───────────────────────────────────────────────────
// 판은 얼굴 윤곽에서 알파가 0 이 아닌데(톤업은 17%) 그물이 거기서 끝나므로
// 화장이 뚝 끊겨 얼굴 옆에 선이 보였다. 테두리 꼭짓점부터 안쪽으로 서서히 살린다.
// 입 구멍도 그물의 '구멍'이라 테두리로 잡힌다. 거기서 흐리면 립스틱이 가장자리에서 꺼진다.
// 얼굴 바깥 테두리에서만 흐려야 하므로 입술 안쪽 고리는 뺀다.
const MOUTH_RING = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

function edgeFade(tris, nVerts, rings = 3) {
  const skip = new Set(MOUTH_RING);
  const seen = new Map();                       // 모서리가 몇 번 쓰였나
  const key = (a, b) => (a < b ? a + "," + b : b + "," + a);
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    for (const [x, y] of [[a, b], [b, c], [c, a]]) seen.set(key(x, y), (seen.get(key(x, y)) || 0) + 1);
  }
  const nb = Array.from({ length: nVerts }, () => []);
  const dist = new Int32Array(nVerts).fill(-1);
  const q = [];
  for (const [k, n] of seen) {
    const [a, b] = k.split(",").map(Number);
    nb[a].push(b); nb[b].push(a);
    if (n === 1 && !skip.has(a) && !skip.has(b)) {   // 한 번만 쓰인 모서리 = 바깥 테두리
      for (const v of [a, b]) if (dist[v] !== 0) { dist[v] = 0; q.push(v); }
    }
  }
  for (let i = 0; i < q.length; i++) {
    const v = q[i];
    for (const w of nb[v]) if (dist[w] === -1) { dist[w] = dist[v] + 1; q.push(w); }
  }
  const f = new Float32Array(nVerts);
  for (let i = 0; i < nVerts; i++) {
    const d = dist[i] < 0 ? rings : dist[i];
    const t = Math.min(d / rings, 1);
    f[i] = t * t * (3 - 2 * t);                 // 부드럽게
  }
  return f;
}

// ── 속눈썹 층 ──────────────────────────────────────────────────────────────
// 속눈썹은 피부가 아니라 눈 구멍 위로 튀어나온 털이다. 표준 얼굴 판(피부 펼침도)에는
// 자리가 없어서, 판에 그리면 눈꺼풀에 달라붙는다. 그래서 판에서 떼어내
// 눈 윤곽 점을 따라 그 자리에서 뻗어 나가는 별도의 띠로 올린다 (소다/센스타임 방식).
const LASH_UP_R = [133, 173, 157, 158, 159, 160, 161, 246, 33];   // 눈머리 → 눈꼬리
const LASH_UP_L = [362, 398, 384, 385, 386, 387, 388, 466, 263];
const LASH_LO_R = [133, 155, 154, 153, 145, 144, 163, 7, 33];
const LASH_LO_L = [362, 382, 381, 380, 374, 373, 390, 249, 263];
const LASH_N = 56;                 // 띠를 따라 쪼갤 칸 수
let LASH_UP_K = 0.30;              // 윗속눈썹 길이 (눈 가로폭 대비) — 슬라이더로 조절
let LASH_LN_A = 0.65;               // 아랫라이너 세기
let LASH_LO_OFS = 0.0;              // 아랫속눈썹·아랫라이너 위치 (− 위 / + 아래)
let LASH_LO_K = 0.14;              // 아랫속눈썹 길이
let lashRibbons = [];              // {mesh, posAttr, ids, kind, mirror}

/** 윤곽 9점을 호 길이로 균등 재배치하고 각 점의 바깥 방향을 함께 낸다 */
function lashFrame(lm, ids, w, h, centerIds) {
  const P = ids.map((i) => [(lm[i].x - 0.5) * w, -(lm[i].y - 0.5) * h]);
  const d = [0];
  for (let i = 1; i < P.length; i++) {
    d.push(d[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  }
  const total = d[d.length - 1] || 1;
  const C = [];
  for (let k = 0; k < LASH_N; k++) {
    const t = (k / (LASH_N - 1)) * total;
    let j = 1; while (j < d.length - 1 && d[j] < t) j++;
    const f = (t - d[j - 1]) / Math.max(d[j] - d[j - 1], 1e-6);
    C.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * f,
            P[j - 1][1] + (P[j][1] - P[j - 1][1]) * f]);
  }
  // 눈 중심 — 양 끝과 위아래 꼭지점의 평균
  let cx = 0, cy = 0;
  for (const i of centerIds) { cx += (lm[i].x - 0.5) * w; cy += -(lm[i].y - 0.5) * h; }
  cx /= centerIds.length; cy /= centerIds.length;
  const raw = C.map((q, k) => {
    const a = C[Math.max(k - 1, 0)], b = C[Math.min(k + 1, LASH_N - 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len];
  });
  // 부호는 띠 한가운데에서 한 번만 정하고 전체에 같게 쓴다 (점마다 정하면 양 끝에서 뒤집힌다)
  const m = raw[LASH_N >> 1], q = C[LASH_N >> 1];
  const sign = ((q[0] - cx) * m[0] + (q[1] - cy) * m[1]) < 0 ? -1 : 1;
  const N = raw.map(([nx, ny]) => [nx * sign, ny * sign]);
  return { C, N };
}

function makeRibbon(tex) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(LASH_N * 2 * 3), 3);
  geo.setAttribute("position", pos);
  const uv = new Float32Array(LASH_N * 2 * 2);
  for (let k = 0; k < LASH_N; k++) {
    const u = k / (LASH_N - 1);
    uv[k * 4] = u;     uv[k * 4 + 1] = 0;    // 뿌리
    uv[k * 4 + 2] = u; uv[k * 4 + 3] = 1;    // 끝
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let k = 0; k < LASH_N - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 3;            // 얼굴 판 위에 올린다
  mesh.frustumCulled = false;
  return { mesh, pos };
}

/** 눈 화장 판 — 없는 룩이면 아무것도 하지 않는 빈 판을 준다 */
function eyeTex(src) {
  if (!src) {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1);
    t.needsUpdate = true; return t;
  }
  const t = new THREE.TextureLoader().load(src);
  t.colorSpace = THREE.NoColorSpace;      // 판은 색이 아니라 곱할 숫자
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function lashTex(src) {
  const t = new THREE.TextureLoader().load(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;                 // 띠 그림은 맨 윗줄이 뿌리다 (뒤집어 읽으면 끝이 눈에 붙는다)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

/** 룩이 lash 를 가지면 띠 4개(양눈 × 위아래)를 만든다. 없으면 모두 치운다. */
function buildLashes(look) {
  for (const r of lashRibbons) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.map?.dispose(); r.mesh.material.dispose(); }
  lashRibbons = [];
  if (!look.lash || !scene) return;
  const up = lashTex(`lash/${look.lash}-up.png`), lo = lashTex(`lash/${look.lash}-low.png`);
  const CEN_R = [33, 133, 159, 145], CEN_L = [263, 362, 386, 374];   // 눈 중심을 낼 점
  // 아랫라이너는 가닥 뒤에 추가해 위에 그려지게 한다 — 묻히면 선으로 안 보인다
  const ln = lashTex(`lash/${look.lash}-lowliner.png`);
  for (const [ids, tex, kind, mirror, cen] of [
    [LASH_UP_R, up, "up", false, CEN_R], [LASH_UP_L, up, "up", true, CEN_L],
    [LASH_LO_R, lo, "low", false, CEN_R], [LASH_LO_L, lo, "low", true, CEN_L],
    [LASH_LO_R, ln, "liner", false, CEN_R], [LASH_LO_L, ln, "liner", true, CEN_L],
  ]) {
    const r = makeRibbon(tex);
    if (kind === "liner") r.mesh.renderOrder = 4;      // 가닥보다 위
    scene.add(r.mesh);
    lashRibbons.push({ ...r, ids, kind, mirror, cen });
  }
}

function updateLashes(lm, w, h) {
  if (!lashRibbons.length) return;
  const D = 1000;
  const eyeW = (a, b) => Math.hypot((lm[a].x - lm[b].x) * w, (lm[a].y - lm[b].y) * h);
  const wR = eyeW(33, 133), wL = eyeW(263, 362);
  for (const r of lashRibbons) {
    const { C, N } = lashFrame(lm, r.ids, w, h, r.cen);
    const ew = r.mirror ? wL : wR;
    const L = ew * (r.kind === "up" ? LASH_UP_K : LASH_LO_K);
    // 아랫쪽은 통째로 위아래로 밀 수 있게 — 눈에 안 붙으면 여기서 맞춘다
    const ofs = r.kind === "up" ? 0 : ew * LASH_LO_OFS;
    if (r.kind === "liner") { r.mesh.material.opacity = LASH_LN_A; r.mesh.material.transparent = true; }
    const a = r.pos.array;
    for (let k = 0; k < LASH_N; k++) {
      const i = k * 6;
      a[i]     = C[k][0] + N[k][0] * ofs;       a[i + 1] = C[k][1] + N[k][1] * ofs;       a[i + 2] = -D + 2;
      a[i + 3] = C[k][0] + N[k][0] * (ofs + L); a[i + 4] = C[k][1] + N[k][1] * (ofs + L); a[i + 5] = -D + 2;
    }
    r.pos.needsUpdate = true;
    r.mesh.visible = state.on && DIAG !== 1 && DIAG !== 3;
  }
}

// ── 3D 장면 ────────────────────────────────────────────────────────────────
function initScene(video) {
  const w = video.videoWidth, h = video.videoHeight;
  const canvas = $("gl");
  canvas.width = w; canvas.height = h;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h, false);
  scene = new THREE.Scene();

  const D = 1000;
  camera = new THREE.PerspectiveCamera(2 * Math.atan(h / 2 / D) * (180 / Math.PI), w / h, 1, D * 4);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  bgMat = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "precision highp float;\nuniform sampler2D uVideo;\nvarying vec2 vU;\n" + WARP_SRC +
      "\nvoid main(){ gl_FragColor = vec4(texture2D(uVideo, warp(vU)).rgb, 1.0); }",
    uniforms: {
      uVideo: { value: videoTex },
      uWC: { value: warpC }, uWD: { value: warpD },
      uWN: { value: 0 }, uWSig: { value: 0.1 }, uAspect: { value: w / h },
    },
    depthWrite: false, depthTest: false,
  });
  bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bgMat);
  bgMesh.position.set(0, 0, -D * 2.2);
  bgMesh.scale.set(2.2, 2.2, 1);
  bgMesh.renderOrder = 0;
  scene.add(bgMesh);

  const geo = new THREE.BufferGeometry();
  posAttr = new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3);
  geo.setAttribute("position", posAttr);
  const uvArr = new Float32Array(VERTS * 2);
  const UV_SHIFT = 0.20, UV_SCALE = 0.80;   // 위 20% 를 이마 여백으로 비워 둔다
  const mapV = (v) => UV_SHIFT + v * UV_SCALE;
  state.faceUV.forEach(([u, v], i) => { uvArr[i * 2] = u; uvArr[i * 2 + 1] = 1 - mapV(v); });
  foreheadUV(state.faceUV).forEach(([u, v], k) => {
    const i = FOREHEAD_BASE + k; uvArr[i * 2] = u; uvArr[i * 2 + 1] = 1 - mapV(v);
  });
  geo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  geo.setAttribute("aFade", new THREE.BufferAttribute(edgeFade(state.tris, VERTS, 3), 1));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(state.tris), 1));

  const t = buildTemplates(state.look);
  // 비스듬히 보이는 면에서 무늬가 뭉개지지 않게 — 이방성 필터를 최대로 (고개를 돌릴 때 특히 차이)
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  // 판은 색이 아니라 '곱할 숫자'다. sRGB 로 읽으면 0.45 가 0.17 로 깎여 회색이 검정처럼 곱해진다.
  const tex = (cv) => {
    const x = new THREE.CanvasTexture(cv);
    x.colorSpace = THREE.NoColorSpace;
    x.anisotropy = maxAniso;
    x.minFilter = THREE.LinearMipmapLinearFilter;
    x.magFilter = THREE.LinearFilter;
    x.generateMipmaps = true;
    return x;
  };
  material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: false, side: THREE.DoubleSide,
    uniforms: {
      uVideo: { value: videoTex },
      uMul: { value: tex(t.mul) }, uSoft: { value: tex(t.soft) }, uLip: { value: tex(t.lip) },
      uMulAmt: { value: 1 }, uSoftAmt: { value: 1.25 },
      uEyeM: { value: eyeTex(state.look.eyeM) }, uEyeL: { value: eyeTex(state.look.eyeL) },
      uEyeS: { value: eyeTex(state.look.eyeS) },
      uGlow: { value: eyeTex(state.look.glow) },
      uBlush: { value: eyeTex(state.look.blush) },
      uBlushAmt: { value: 1 },
      uBrow: { value: eyeTex(null) },
      uBrowAmt: { value: 1.10 }, uBrowStep: { value: 0.03 },
      uGlowAmt: { value: 1.10 }, uLipDim: { value: 0.80 },
      uEyeMAmt: { value: 0.70 }, uEyeLAmt: { value: 0.80 }, uEyeSAmt: { value: 0.60 },
      uHair: { value: (() => {
        const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        t.needsUpdate = true; return t;
      })() },
      uLipColor: { value: new THREE.Color(state.look.lip) },
      uLipA: { value: state.look.lipA }, uLipMid: { value: state.look.lipMid },
      uLipHi: { value: state.look.lipHi }, uFinish: { value: FINISH[state.look.finish] },
      uWC: { value: warpC }, uWD: { value: warpD },
      uWN: { value: 0 }, uWSig: { value: 0.1 }, uAspect: { value: w / h },
      uOn: { value: 1 },
    },
  });
  mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  scene.add(mesh);
  buildLashes(state.look);
  showTemplates(t);
}

function showTemplates(t) {
  for (const [id, cv] of [["tplMul", t.mul], ["tplSoft", t.soft], ["tplLip", t.lip]]) {
    const el = $(id);
    el.width = 150; el.height = Math.round(150 * TPL_H / TPL_W);
    const c = el.getContext("2d");
    c.clearRect(0, 0, el.width, el.height);
    c.fillStyle = "#c9c2bb"; c.fillRect(0, 0, el.width, el.height);   // 검은 라이너가 보이게 밝은 바탕
    c.drawImage(cv, 0, 0, el.width, el.height);
  }
}

// 오버립 — 입술 범위를 바깥으로 민 판 3장. 슬라이더로 바로 갈아 끼운다.
// 눈썹 모양 — 0 그대로 / 1 일자 / 2 아치형 / 3 올린
const BROW_SRC = [null, "drawn/brow-straight.png", "drawn/brow-arch.png", "drawn/brow-raised.png"];
function setBrow(step) {
  if (!material) return;
  material.uniforms.uBrow.value.dispose();
  material.uniforms.uBrow.value = eyeTex(BROW_SRC[Math.max(0, Math.min(3, Math.round(step)))]);
}

const OVERLIP_SRC = ["drawn/lip-over0.png", "drawn/lip-over1.png", "drawn/lip-over2.png"];
function setOverlip(step) {
  if (!material || !state.look.lip0) return;
  material.uniforms.uLip.value.dispose();
  const t = new THREE.TextureLoader().load(OVERLIP_SRC[Math.max(0, Math.min(2, Math.round(step)))]);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  material.uniforms.uLip.value = t;
}

async function applyLook(look) {
  state.look = look;
  await loadDrawn(look);
  const t = buildTemplates(look);
  showTemplates(t);                 // 카메라를 켜기 전에도 판은 보여 준다
  if (!material) return;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const set = (key, cv) => {
    material.uniforms[key].value.dispose();
    const x = new THREE.CanvasTexture(cv);
    x.colorSpace = THREE.NoColorSpace;
    x.anisotropy = maxAniso;
    x.minFilter = THREE.LinearMipmapLinearFilter;
    x.magFilter = THREE.LinearFilter;
    x.generateMipmaps = true;
    material.uniforms[key].value = x;
  };
  set("uMul", t.mul); set("uSoft", t.soft); set("uLip", t.lip);
  for (const [key, src] of [["uEyeM", look.eyeM], ["uEyeL", look.eyeL], ["uEyeS", look.eyeS],
                            ["uGlow", look.glow], ["uBlush", look.blush]]) {
    material.uniforms[key].value.dispose();
    material.uniforms[key].value = eyeTex(src);
  }
  buildLashes(look);
  material.uniforms.uLipColor.value.set(look.lip);
  material.uniforms.uLipA.value = look.lipA;
  material.uniforms.uLipMid.value = look.lipMid;
  material.uniforms.uLipHi.value = look.lipHi;
  material.uniforms.uFinish.value = FINISH[look.finish];
}

/** 머리선을 새로 잰 뒤 이마 쪽 UV 만 다시 계산한다 (장면은 그대로) */
function refreshForeheadUV() {
  if (!mesh) return;
  const uvAttr = mesh.geometry.getAttribute("uv");
  const a = uvAttr.array;
  foreheadUV(state.faceUV).forEach(([u, v], k) => {
    const i = FOREHEAD_BASE + k;
    a[i * 2] = u; a[i * 2 + 1] = 1 - (0.20 + v * 0.80);
  });
  uvAttr.needsUpdate = true;
}


/**
 * 머리카락 마스크 — 화면 좌표 그대로 셰이더에 넘긴다. 머리카락인 픽셀은 화장을 0 으로 깎는다.
 * 이마 판은 머리 속까지 넉넉히 덮어 두고 여기서 깎아내므로, 머리선 위치를 맞힐 필요가 없다.
 * 매 프레임은 비싸서 HAIR_EVERY 프레임마다 한 번만 (팀 makeup-gl.ts uHair 와 같은 생각).
 */
let HAIR_EVERY = 9;            // 몇 프레임마다 머리카락을 다시 볼지 (슬라이더로 조절)
let HAIR_SMOOTH = 0.5;          // 이전 마스크와 섞는 비율 — 클수록 부드럽지만 늦게 따라온다
let hairSeg = null, hairBusy = false, hairTick = 0, hairCv = null;
let hairAcc = null, hairW = 0, hairH = 0, hairTex = null;

async function initHair() {
  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    hairSeg = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "models/selfie_multiclass_256x256.tflite" },
      outputCategoryMask: true, runningMode: "IMAGE",
    });
  } catch (e) { console.warn("머리카락 모델 실패 — 깎기 없이 간다", e); }
}

/** 가로·세로로 한 칸씩 번져 최댓값을 남긴다 — 마스크가 한 박자 늦어도 화장이 머리에 비치지 않게 */
function grow(a, w, h) {
  const o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      const v = a[yy * w + xx]; if (v > m) m = v;
    }
    o[y * w + x] = m;
  }
  return o;
}

/** 가로·세로로 한 번씩 평균을 내어 마스크 경계를 풀어 준다 (분리형 상자 흐림) */
function soften(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
    t[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } }
    o[y * w + x] = s / n;
  }
  return o;
}

function updateHair(video) {
  if (!hairSeg || hairBusy || !material) return;
  if (++hairTick % HAIR_EVERY !== 0) return;
  hairBusy = true;
  try {
    const W = 256, H = Math.round(256 * video.videoHeight / video.videoWidth);
    if (!hairCv) hairCv = document.createElement("canvas");
    hairCv.width = W; hairCv.height = H;
    hairCv.getContext("2d").drawImage(video, 0, 0, W, H);
    const res = hairSeg.segment(hairCv);
    const m = res.categoryMask, d = m.getAsUint8Array();
    if (hairW !== m.width || hairH !== m.height) {
      hairW = m.width; hairH = m.height; hairAcc = new Float32Array(hairW * hairH); hairTex = null;
    }
    let cur = new Float32Array(hairW * hairH);
    for (let i = 0; i < d.length; i++) cur[i] = d[i] === 1 ? 1 : 0;   // 1 = 머리카락
    cur = grow(cur, hairW, hairH);
    cur = soften(cur, hairW, hairH, 2);     // 경계가 날카로우면 화장이 뚝 끊겨 선으로 보인다
    const k = HAIR_SMOOTH;
    for (let i = 0; i < hairAcc.length; i++) hairAcc[i] = hairAcc[i] * k + cur[i] * (1 - k);
    const px = new Uint8Array(hairW * hairH * 4);
    for (let i = 0; i < hairAcc.length; i++) px[i * 4] = Math.round(Math.min(1, hairAcc[i]) * 255);
    if (!hairTex) {
      hairTex = new THREE.DataTexture(px, hairW, hairH);
      hairTex.flipY = true; hairTex.minFilter = THREE.LinearFilter; hairTex.magFilter = THREE.LinearFilter;
      material.uniforms.uHair.value = hairTex;
    } else hairTex.image.data.set(px);
    hairTex.needsUpdate = true;
    m.close();
  } catch (e) { /* 한 번 실패해도 다음에 다시 */ }
  hairBusy = false;
}

function updateMesh(lm, w, h) {
  const a = posAttr.array, D = 1000;
  for (let i = 0; i < 468; i++) {
    const p = lm[i];
    a[i * 3] = (p.x - 0.5) * w;
    a[i * 3 + 1] = -(p.y - 0.5) * h;
    a[i * 3 + 2] = -D - (state.depth ? p.z * w * 1.2 : 0);
  }
  for (let k = 0; k < BROW_ARC.length; k++) {           // 늘린 이마 점
    const p = foreheadPoint(lm, k, w, h), i = FOREHEAD_BASE + k;
    a[i * 3] = (p.x - 0.5) * w;
    a[i * 3 + 1] = -(p.y - 0.5) * h;
    a[i * 3 + 2] = -D - (state.depth ? p.z * w * 1.2 : 0);
  }
  posAttr.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

let frames = 0, last = performance.now();
function loop() {
  if (!state.live) return;
  const video = $("video");
  if (video.readyState >= 2) {
    const lm = state.lmk.detectForVideo(video, performance.now()).faceLandmarks?.[0];
    if (lm) {
      state.lastLm = lm;
      updateMesh(lm, video.videoWidth, video.videoHeight);
      updateWarp(lm, video.videoWidth, video.videoHeight);
      updateLashes(lm, video.videoWidth, video.videoHeight);
      updateHair(video);
      mesh.visible = true;
      material.depthTest = state.depth;
      material.depthWrite = state.depth;
      material.wireframe = state.wire;
      material.uniforms.uOn.value = (state.on && DIAG !== 1 && DIAG !== 3) ? 1 : 0;
    } else { mesh.visible = false; for (const r of lashRibbons) r.mesh.visible = false; }
    renderer.render(scene, camera);
    if (++frames >= 20) {
      const now = performance.now();
      setStatus(`[${BUILD}] ${DIAG_LABEL[DIAG]} · ${lm ? "얼굴 추적 중" : "얼굴 미검출"} · 깊이 ${state.depth ? "켬" : "끔"} · 초당 ${(frames / ((now - last) / 1000)).toFixed(0)}장 · 머리선 ${state.hairline ?? "기본값"}`);
      frames = 0; last = now;
    }
  }
  video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
}

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  initScene(video);
  for (const f of state.applySliders || []) f();   // 재질이 생긴 뒤 슬라이더 값을 실제로 넣는다
  state.live = true;
  void initHair();
  loop();
}

(async () => {
  const [uv, tri] = await Promise.all([
    fetch("assets/face-uv.json").then((r) => r.json()),
    fetch("assets/face-triangles.json").then((r) => r.json()),
  ]);
  state.faceUV = uv; state.tris = [...tri, ...EYE_FILL_TRIS, ...foreheadTriangles()];   // 눈 구멍 + 이마 (머리카락은 셰이더가 깎음)
  state.look = LOOKS.kr_lb;
  await loadDrawn(state.look);
  showTemplates(buildTemplates(state.look));

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  state.lmk = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    numFaces: 1, runningMode: "VIDEO",
  });
  setStatus(`[${BUILD}] 카메라를 켜면 템플릿이 얼굴에 입혀집니다.`);

  $("btnCam").onclick = () => start().catch((e) => setStatus("카메라 실패: " + e.message));
  $("btnDepth").onclick = (e) => {
    state.depth = !state.depth;
    e.target.textContent = state.depth ? "깊이 끄기 (2D로)" : "깊이 켜기 (3D로)";
    e.target.classList.toggle("on", !state.depth);
  };
  $("btnMesh").onclick = (e) => { state.wire = !state.wire; e.target.textContent = state.wire ? "그물 숨기기" : "그물 보기"; };
  $("btnBare").onclick = (e) => {
    state.on = !state.on;
    e.target.textContent = state.on ? "화장 끄기" : "화장 켜기";
    e.target.classList.toggle("on", !state.on);
  };
  $("btnDiag").onclick = (e) => {
    DIAG = (DIAG + 1) % 4;
    e.target.textContent = "진단: " + DIAG_LABEL[DIAG];
  };
  $("look").onchange = (e) => applyLook(LOOKS[e.target.value]);

  // 슬라이더 — 숫자를 고쳐 다시 만들지 않고 화면에서 바로 조절한다
  const SLIDERS = [
    ["sMul",  "uMulAmt",  (v) => v],                                  // 곱하기 판 (섀도·블러셔·윤곽)
    ["sSoft", "uSoftAmt", (v) => v],                                  // 소프트라이트 판 (톤업·밝힘)
    ["sLip",  "uLipA",    (v) => v],                                  // 입술
    ["sHair", null,       (v) => { HAIR_EVERY = Math.max(1, Math.round(v)); }],   // 머리카락 갱신 주기
    ["sSm",   null,       (v) => { HAIR_SMOOTH = v; }],
    ["sEyeM", "uEyeMAmt", (v) => v],                                   // 눈 아래 (분홍·그림자선)
    ["sEyeL", "uEyeLAmt", (v) => v],                                   // 눈두덩 섀도
    ["sEyeS", "uEyeSAmt", (v) => v],                                   // 애교살 밝힘
    ["sSlimJ", null,      (v) => { JAW_K = v; }],                      // 턱 깎기 (얼굴형)
    ["sSlimC", null,      (v) => { CHEEK_K = v; }],                    // 광대 좁히기
    ["sGlow", "uGlowAmt", (v) => v],                                   // 물광
    ["sBlush", "uBlushAmt", (v) => v],                                 // 볼터치
    ["sLipD", "uLipDim",  (v) => v],                                   // 입술 입체감
    ["sOver", null,       (v) => { setOverlip(v); }],                  // 오버립 단계
    ["sBrow", null,       (v) => { setBrow(v); }],                     // 눈썹 모양
    ["sBrowA", "uBrowAmt", (v) => v],                                  // 눈썹 다듬기 세기
    ["sLashU", null,      (v) => { LASH_UP_K = v; }],                  // 윗속눈썹 길이
    ["sLashL", null,      (v) => { LASH_LO_K = v; }],                  // 아랫속눈썹 길이
    ["sLashLN", null,     (v) => { LASH_LN_A = v; }],                  // 아랫라이너 세기
    ["sLashOfs", null,    (v) => { LASH_LO_OFS = v; }],                // 아랫쪽 위치                            // 마스크 섞기
  ];
  for (const [id, key, conv] of SLIDERS) {
    const el = $(id); if (!el) continue;
    const show = () => { const o = $(id + "V"); if (o) o.textContent = (+el.value).toFixed(2); };
    // 화면 숫자만 맞추고 값을 넘기지 않으면, 셰이더는 처음 만들 때 값을 그대로 쓴다.
    // (턱·코 쉐딩을 0 으로 써 두었는데 1 로 켜져 얼굴 옆에 선이 보이던 원인)
    const apply = () => {
      if (key) { if (material) material.uniforms[key].value = conv(+el.value); }
      else conv(+el.value);
      show();
    };
    el.oninput = apply;
    apply();
    state.applySliders = state.applySliders || [];
    state.applySliders.push(apply);
  }
})();
