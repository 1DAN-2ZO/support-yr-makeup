// 화장 필터 실시간 확인 — ④ 의 얹어보기(C4) 파이프라인을 GPU 없이 눈으로 보기 위한 확인용 페이지.
//
// ④ 의 POC(poc/look-tryon/client/app-webgl.js)는 "촬영 → 서버(Stable-Makeup)로 화장 사진 생성 →
// 화장 층 분리 → 얼굴 UV 로 굽기 → 실시간 렌더" 순서인데, 가운데 '생성'만 GPU 서버가 필요하다.
// 여기서는 그 단계를 건너뛰고 이미 있는 맨얼굴·화장 쌍(FFHQ-Makeup)을 넣어 뒤쪽만 본다.
// 분리·굽기·렌더 코드는 ④ 의 lib 를 그대로 가져다 쓴다(고치지 않는다).
//
// 한계: 화장이 다른 사람 얼굴에서 나온 것이라 "내 얼굴에 어울리는가"는 볼 수 없다.
// 볼 수 있는 것은 추적 품질 — 고개를 돌리거나 표정을 지을 때 화장이 붙어 있는지, 경계가 뜨는지.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import * as THREE from "../../poc/look-tryon/client/vendor/three.module.min.js";
import { extractLayer } from "../../poc/look-tryon/client/lib/extractLayer.js";
import { bakeLayer } from "../../poc/look-tryon/client/lib/bakeLayer.js";
import { rasterizePolygon } from "../../poc/look-tryon/client/lib/rasterize.js";
import { LandmarkSmoother } from "../../poc/look-tryon/client/lib/smoothing.js";

const $ = (id) => document.getElementById(id);
const DISTANCE = 480;
// 마스크용 랜드마크 — app-webgl.js 와 같은 값
const EYES = { R: [133, 173, 157, 158, 159, 160, 161, 246, 33], L: [362, 398, 384, 385, 386, 387, 388, 466, 263] };
const BROW = { R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] };
const CHEEK = { R: [116, 117, 118, 101, 36, 205, 187, 123], L: [345, 346, 347, 330, 266, 425, 411, 352] };
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const FOREHEAD = [10, 109, 108, 151, 337, 338];
const EYESHADOW_REACH = 0.45;

const state = { pairs: [], faceUV: null, faceTriangles: null, imageLandmarker: null, videoLandmarker: null, live: false, baked: false };
let renderer, scene, camera, faceMesh, bakedTexture, positionAttr, faceMat, videoW = 0, videoH = 0;
const smoother = new LandmarkSmoother(Array.from({ length: 468 }, (_, i) => i), { smoothZ: true });

const setStatus = (s) => ($("status").textContent = s);

function buildMasks(lm, w, h) {
  const P = (i) => [lm[i].x * w, lm[i].y * h];  // rasterizePolygon 은 [x, y] 를 받는다
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

// 맨얼굴 사진이 없을 때: 턱 주변 피부색(중앙값)으로 채운 평평한 '가짜 맨얼굴'을 만든다.
// 이마는 앞머리에 가릴 수 있어 쓰지 않는다. 눈썹·입술의 원래 색까지 화장으로 딸려오는 한계가 있다.
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
    const v = px.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] || 200;
  };
  const skin = [med(0), med(1), med(2)];
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = skin[0]; data[i * 4 + 1] = skin[1]; data[i * 4 + 2] = skin[2]; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

async function loadImageData(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return { cv, data: cv.getContext("2d").getImageData(0, 0, cv.width, cv.height), src };
}

/** 맨얼굴·화장 쌍 → 화장 층을 얼굴 UV 로 구워 텍스처에 올린다 (④ 의 C1 + C4-2 그대로) */
async function bakePair(pair) {
  setStatus("화장 층을 분리해서 굽는 중…");
  const make = await loadImageData(pair.makeup);
  const det = state.imageLandmarker.detect(make.cv);
  const lm = det.faceLandmarks && det.faceLandmarks[0];
  if (!lm) { setStatus("화장 사진에서 얼굴을 못 찾았어요"); return; }
  const w = make.cv.width, h = make.cv.height;
  const masks = buildMasks(lm, w, h);
  let baseData;
  if (pair.bare) {
    const bare = await loadImageData(pair.bare);
    baseData = bare.data;
    $("imgBare").src = bare.src;
  } else {
    baseData = fakeBare(make.data, lm, w, h);  // 피부색 기준
    delete masks.forehead;                     // 앞머리에 가릴 수 있어 편향 기준으로 안 쓴다
    $("imgBare").src = "";
  }
  $("imgMake").src = make.src;
  const layer = extractLayer(baseData, make.data, masks);
  const uv = bakeLayer(layer, lm, state.faceUV, state.faceTriangles, 1024);
  $("pairNote").textContent = pair.bare ? "맨얼굴과 비교해 화장만 떼어냈어요" : "맨얼굴 사진이 없어 피부색을 기준으로 떼어냈어요 — 눈썹·입술의 원래 색도 같이 딸려올 수 있어요";
  state.bakedCanvas = uv;
  if (bakedTexture) { bakedTexture.image = uv; bakedTexture.needsUpdate = true; }
  $("imgBaked").src = uv.toDataURL("image/png");
  state.baked = true;
  setStatus("준비됐어요. 카메라를 켜고 고개를 돌리거나 표정을 지어 보세요.");
}

function initThree(w, h) {
  videoW = w; videoH = h;
  const canvas = $("gl");
  canvas.width = w; canvas.height = h;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(w, h, false);
  scene = new THREE.Scene();
  const fov = 2 * Math.atan(h / 2 / DISTANCE) * (180 / Math.PI);
  camera = new THREE.PerspectiveCamera(fov, w / h, 1, DISTANCE * 4);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  const videoTex = new THREE.VideoTexture($("video"));
  const videoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: videoTex, depthTest: false, depthWrite: false }),
  );
  videoMesh.position.set(0, 0, -DISTANCE);
  scene.add(videoMesh);

  const geo = new THREE.BufferGeometry();
  positionAttr = new THREE.BufferAttribute(new Float32Array(468 * 3), 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", positionAttr);
  const uvArr = new Float32Array(468 * 2);
  state.faceUV.forEach(([u, v], i) => { uvArr[i * 2] = u; uvArr[i * 2 + 1] = v; });
  geo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(state.faceTriangles), 1));

  bakedTexture = new THREE.Texture(state.bakedCanvas || undefined);
  bakedTexture.needsUpdate = !!state.bakedCanvas;
  bakedTexture.flipY = false; // face-uv.json 에서 이미 뒤집었다 (④ 주석 참고)
  faceMat = new THREE.MeshBasicMaterial({ map: bakedTexture, transparent: true, depthTest: false, depthWrite: false });
  faceMesh = new THREE.Mesh(geo, faceMat);
  faceMesh.renderOrder = 1;
  faceMesh.visible = false;
  scene.add(faceMesh);
}

function updatePositions(lm) {
  const a = positionAttr.array;
  for (let i = 0; i < 468; i++) {
    const s = 1 - lm[i].z;
    a[i * 3] = (lm[i].x - 0.5) * videoW * s;
    a[i * 3 + 1] = -(lm[i].y - 0.5) * videoH * s;
    a[i * 3 + 2] = -DISTANCE * (1 + lm[i].z);
  }
  positionAttr.needsUpdate = true;
}

let frames = 0, lastFps = performance.now();
function loop() {
  if (!state.live) return;
  const video = $("video");
  if (video.readyState >= 2) {
    const res = state.videoLandmarker.detectForVideo(video, performance.now());
    const lm = smoother.smooth(res.faceLandmarks && res.faceLandmarks[0], performance.now());
    if (lm) { updatePositions(lm); faceMesh.visible = state.baked && $("btnToggle").dataset.on !== "0"; }
    else faceMesh.visible = false;
    renderer.render(scene, camera);
    if (++frames >= 30) {
      const now = performance.now();
      setStatus(`${lm ? "얼굴 추적 중" : "얼굴 미검출"} · 초당 ${(frames / ((now - lastFps) / 1000)).toFixed(0)}장`);
      frames = 0; lastFps = now;
    }
  }
  video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
}

async function start() {
  $("btnCam").disabled = true;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  initThree(video.videoWidth, video.videoHeight);
  state.live = true;
  $("btnToggle").disabled = false;
  loop();
}

(async () => {
  const [uv, tri, pairs] = await Promise.all([
    fetch("../../poc/look-tryon/client/assets/face-uv.json").then((r) => r.json()),
    fetch("../../poc/look-tryon/client/assets/face-triangles.json").then((r) => r.json()),
    fetch("./data/pairs.json").then((r) => r.json()),
  ]);
  state.faceUV = uv; state.faceTriangles = tri; state.pairs = pairs;
  $("pair").innerHTML = pairs.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" }, numFaces: 1 };
  state.imageLandmarker = await FaceLandmarker.createFromOptions(vision, { ...opts, runningMode: "IMAGE" });
  state.videoLandmarker = await FaceLandmarker.createFromOptions(vision, { ...opts, runningMode: "VIDEO" });

  await bakePair(pairs[0]);
  $("pair").onchange = (e) => bakePair(pairs[+e.target.value]);
  $("btnCam").onclick = () => start().catch((err) => setStatus("카메라 실패: " + err.message));
  $("btnToggle").onclick = (e) => {
    const on = e.target.dataset.on !== "0";
    e.target.dataset.on = on ? "0" : "1";
    e.target.textContent = on ? "화장 켜기" : "화장 끄기";
  };
  $("alpha").oninput = (e) => {
    faceMat.opacity = e.target.value / 100;
    $("alphaVal").textContent = e.target.value + "%";
  };
})();
