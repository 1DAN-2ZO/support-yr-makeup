// 화장 매핑 품질 확인 — 같은 사람의 맨얼굴에 그 사람 화장을 다시 붙여 본다.
//
// demo.js(실시간)는 남의 화장을 내 얼굴에 붙이는 거라 "얼굴이 안 맞는 문제"와 "매핑 품질"이 섞인다.
// 여기서는 같은 사람으로만 해서 매핑 품질(떼어내기 → 굽기 → 붙이기)만 본다.
// ④ 의 lib(extractLayer·bakeLayer)와 얼굴 UV·삼각형을 그대로 쓴다.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import * as THREE from "../../poc/look-tryon/client/vendor/three.module.min.js";
import { extractLayer } from "../../poc/look-tryon/client/lib/extractLayer.js";
import { bakeLayer } from "../../poc/look-tryon/client/lib/bakeLayer.js";
import { rasterizePolygon } from "../../poc/look-tryon/client/lib/rasterize.js";

const $ = (id) => document.getElementById(id);
const DISTANCE = 480;
const EYES = { R: [133, 173, 157, 158, 159, 160, 161, 246, 33], L: [362, 398, 384, 385, 386, 387, 388, 466, 263] };
const BROW = { R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] };
const CHEEK = { R: [116, 117, 118, 101, 36, 205, 187, 123], L: [345, 346, 347, 330, 266, 425, 411, 352] };
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const FOREHEAD = [10, 109, 108, 151, 337, 338];
const EYESHADOW_REACH = 0.45;

const setStatus = (s) => ($("status").textContent = s);
let landmarker, faceUV, faceTriangles;

function buildMasks(lm, w, h) {
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const shadow = (eye, brow) => {
    const lid = eye.map(P);
    const up = brow.map(P);
    const top = lid.map((p, i) => {
      const q = up[Math.min(up.length - 1, Math.round((i / (lid.length - 1)) * (up.length - 1)))];
      return [p[0] + (q[0] - p[0]) * EYESHADOW_REACH, p[1] + (q[1] - p[1]) * EYESHADOW_REACH];
    });
    return [...lid, ...top.reverse()];
  };
  const R = (pts) => rasterizePolygon(pts, w, h);
  return {
    browR: R(BROW.R.map(P)), browL: R(BROW.L.map(P)),
    eyeR: R(shadow(EYES.R, BROW.R)), eyeL: R(shadow(EYES.L, BROW.L)),
    lips: R(LIPS.map(P)),
    cheekR: R(CHEEK.R.map(P)), cheekL: R(CHEEK.L.map(P)),
    forehead: R(FOREHEAD.map(P)),
  };  // fmt: skip
}

// 맨얼굴 사진이 없는 템플릿용: 턱 주변 피부색으로 채운 평평한 '가짜 맨얼굴'
const CHIN_PATCH = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323];
function fakeBare(makeData, lm, w, h) {
  const px = [];
  for (const i of CHIN_PATCH) {
    const x = Math.round(lm[i].x * w), y = Math.round(lm[i].y * h - h * 0.02);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const o = ((y + dy) * w + (x + dx)) * 4;
        if (o >= 0 && o + 2 < makeData.data.length) px.push([makeData.data[o], makeData.data[o + 1], makeData.data[o + 2]]);
      }
    }
  }
  const med = (k) => {
    const v = px.map((q) => q[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] || 200;
  };
  const skin = [med(0), med(1), med(2)];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = skin[0]; data[i * 4 + 1] = skin[1]; data[i * 4 + 2] = skin[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

async function load(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return { img, cv, data: cv.getContext("2d").getImageData(0, 0, cv.width, cv.height) };
}

/** 맨얼굴 사진 위에 구운 화장 층을 얼굴 점 기준으로 붙여 한 장 그린다 */
function render(bareCv, bareLm, uvCanvas) {
  const w = bareCv.width, h = bareCv.height;
  const canvas = $("gl");
  canvas.width = w; canvas.height = h;
  // preserveDrawingBuffer: 그린 결과를 캔버스에서 다시 읽어 비교 이미지로 쓸 수 있게 남겨 둔다
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  const fov = 2 * Math.atan(h / 2 / DISTANCE) * (180 / Math.PI);
  const camera = new THREE.PerspectiveCamera(fov, w / h, 1, DISTANCE * 4);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  const bareTex = new THREE.CanvasTexture(bareCv);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: bareTex, depthTest: false, depthWrite: false }),
  );
  plane.position.set(0, 0, -DISTANCE);
  scene.add(plane);

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(468 * 3);
  for (let i = 0; i < 468; i++) {
    const s = 1 - bareLm[i].z;
    pos[i * 3] = (bareLm[i].x - 0.5) * w * s;
    pos[i * 3 + 1] = -(bareLm[i].y - 0.5) * h * s;
    pos[i * 3 + 2] = -DISTANCE * (1 + bareLm[i].z);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const uvArr = new Float32Array(468 * 2);
  faceUV.forEach(([u, v], i) => { uvArr[i * 2] = u; uvArr[i * 2 + 1] = v; });
  geo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(faceTriangles), 1));
  const tex = new THREE.Texture(uvCanvas);
  tex.flipY = false;
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 1;
  scene.add(mesh);
  renderer.render(scene, camera);
}

async function show(pair) {
  setStatus("화장 층 분리 → 굽기 → 얼굴에 붙이는 중…");
  const make = await load(pair.makeup);
  const target = await load(pair.renderOn || pair.bare);  // 화장을 올릴 얼굴
  $("imgBare").src = target.img.src;
  $("imgMake").src = make.img.src;
  const mkLm = landmarker.detect(make.cv).faceLandmarks?.[0];
  const brLm = landmarker.detect(target.cv).faceLandmarks?.[0];
  if (!mkLm || !brLm) { setStatus("얼굴을 못 찾았어요"); return; }
  const masks = buildMasks(mkLm, make.cv.width, make.cv.height);
  let baseData;
  if (pair.bare) {
    baseData = (await load(pair.bare)).data;
  } else {
    baseData = fakeBare(make.data, mkLm, make.cv.width, make.cv.height);
    delete masks.forehead;  // 앞머리에 가릴 수 있어 편향 기준으로 쓰지 않는다
  }
  const layer = extractLayer(baseData, make.data, masks);
  const uv = bakeLayer(layer, mkLm, faceUV, faceTriangles, 1024);
  render(target.cv, brLm, uv);
  setStatus("②와 ③을 비교해 보세요. 눈썹·섀도우·입술·볼터치가 같은 자리에 같은 진하기로 올라갔는지 봅니다.");
}

(async () => {
  const [uv, tri, pairs] = await Promise.all([
    fetch("../../poc/look-tryon/client/assets/face-uv.json").then((r) => r.json()),
    fetch("../../poc/look-tryon/client/assets/face-triangles.json").then((r) => r.json()),
    fetch("./data/pairs.json").then((r) => r.json()),
  ]);
  faceUV = uv; faceTriangles = tri;
  const list = pairs.filter((p) => p.bare || p.renderOn);
  $("pair").innerHTML = list.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    numFaces: 1, runningMode: "IMAGE",
  });
  $("pair").onchange = (e) => show(list[+e.target.value]);
  await show(list[0]);
})();
