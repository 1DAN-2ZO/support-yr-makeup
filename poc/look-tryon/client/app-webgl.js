// 당화응 POC — C4: canonical UV 메시 + WebGL2(three.js) 실시간 렌더러.
// app.js(v2, 부위별 Canvas2D 아핀 워핑)를 대체하는 정식 경로. 파이프라인:
//   촬영 → 참조 업로드 → 서버 생성(fp16 diffusion) → C1(extractLayer, 색 분리)
//   → C4-2(bakeLayer, canonical UV로 굽기) → C4-3(WebGL 매 프레임 정점 갱신, 텍스처는 1회 업로드)
//
// 좌표계 규약(전부 이 파일에서 한 번씩만 결정):
//   - flipY: assets/face-uv.json 추출 단계(tools/extract-face-uv.js)에서 이미 처리됨. 여기서 또 뒤집지 않는다.
//   - 미러링: 모든 랜드마크·정점 계산은 원본(반전 전) 좌표로 하고, 좌우 반전은 <canvas>에 CSS
//     transform:scaleX(-1)만 걸어서 표시 단계에서만 적용한다(app.js #liveCanvas와 동일 패턴).
//   - 원근 보정: MediaPipe z(음수=카메라에 가까움)를 그대로 써서 정점을 "같은 카메라 광선" 위에서
//     이동시킨다 — X,Y에 (1-z) 스케일을 곱하고, Z는 -distance*(1+z)에 놓는다. 부호는 실측 검증함
//     (코 z=-0.08→스케일 1.08배 바깥으로, 귀 z=+0.16→0.84배 안으로 — 가까운 게 커 보이는 방향이 맞음).

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { Client } from "https://esm.sh/@gradio/client@2.6.0";
import * as THREE from "./vendor/three.module.min.js";
import { LandmarkSmoother } from "./lib/smoothing.js";
import { extractLayer } from "./lib/extractLayer.js";
import { bakeLayer } from "./lib/bakeLayer.js";
import { rasterizePolygon } from "./lib/rasterize.js";

const GRADIO_URL = "http://127.0.0.1:7860";

// 랜드마크 인덱스 (app.js와 동일 — 마스크 정의용)
const EYES = {
  R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33] },
  L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263] },
};
const BROW = {
  R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
};
const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
};
const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const FOREHEAD = [10, 109, 108, 151, 337, 338]; // poc/app.js와 동일 — 비화장 기준 영역(C1 전역 편향 추정용)
const EYESHADOW_REACH = 0.45;

// C3 페더링 반경(px, UV 캔버스 1024 기준). 립·눈썹은 경계가 또렷해야 하고(작게), 섀도우·볼은
// 부드럽게 번져야 자연스럽다(크게). 라이너는 아직 별도 부위로 안 나눠서 섀도우 밴드에 포함.
// 컨투어·하이라이터는 아직 범위 밖(별도 부위 정의 필요).
const FEATHER = { browR: 2, browL: 2, lips: 2, eyeR: 8, eyeL: 8, cheekR: 8, cheekL: 8 };

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t, cls = "") => { statusEl.textContent = t; statusEl.className = "status " + cls; };

const state = {
  imageLandmarker: null, videoLandmarker: null,
  stream: null,
  sourcePhoto: null,   // { canvas, landmarks }
  refFile: null,
  lookResult: null,    // { uvCanvas }
  liveOn: false,
  faceUV: null,        // 468개 [u,v]
  faceTriangles: null, // N*3 인덱스(눈 구멍 제거됨)
};

async function initLandmarkers() {
  setStatus("얼굴 인식 모델 로딩 중…");
  const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = (mode, delegate) => ({
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
    runningMode: mode, numFaces: 1,
  });
  try { state.imageLandmarker = await FaceLandmarker.createFromOptions(files, opts("IMAGE", "GPU")); }
  catch { state.imageLandmarker = await FaceLandmarker.createFromOptions(files, opts("IMAGE", "CPU")); }
  try { state.videoLandmarker = await FaceLandmarker.createFromOptions(files, opts("VIDEO", "GPU")); }
  catch { state.videoLandmarker = await FaceLandmarker.createFromOptions(files, opts("VIDEO", "CPU")); }
}

async function loadMeshAssets() {
  state.faceUV = await (await fetch("./assets/face-uv.json")).json();
  state.faceTriangles = await (await fetch("./assets/face-triangles.json")).json();
  if (state.faceUV.length !== 468) throw new Error(`face-uv.json 길이 이상: ${state.faceUV.length}`);
}

// ---------- 카메라 ----------
async function startCamera() {
  const video = $("video");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }, audio: false });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  $("btnCapture").disabled = false;
  return { width: video.videoWidth, height: video.videoHeight };
}

function captureFrame() {
  const video = $("video");
  const cv = document.createElement("canvas");
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  cv.getContext("2d").drawImage(video, 0, 0);
  const res = state.imageLandmarker.detect(cv);
  const lm = res.faceLandmarks && res.faceLandmarks[0];
  if (!lm) { setStatus("얼굴을 찾지 못했습니다. 정면을 보고 다시 찍어주세요", "err"); return; }
  state.sourcePhoto = { canvas: cv, landmarks: lm };
  $("sourcePreview").src = cv.toDataURL("image/jpeg", 0.9);
  $("step2").hidden = false;
  setStatus("촬영 완료. 룩 참조 사진을 올려주세요", "ok");
}

function onRefChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.refFile = file;
  $("refPreview").src = URL.createObjectURL(file);
  $("btnGenerate").disabled = false;
}

// ---------- 부위 마스크 (C1 extractLayer 입력) ----------
function centroid(pts) { return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function landmarkPx(lm, idx, w, h) { const p = lm[idx]; return [p.x * w, p.y * h]; }

function buildMasks(lm, w, h) {
  const P = (i) => landmarkPx(lm, i, w, h);
  const browR = BROW.R.map(P), browL = BROW.L.map(P);
  const browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  const eyeR = [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()];
  const eyeL = [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()];
  return {
    browR: rasterizePolygon(browR, w, h),
    browL: rasterizePolygon(browL, w, h),
    eyeR: rasterizePolygon(eyeR, w, h),
    eyeL: rasterizePolygon(eyeL, w, h),
    lips: rasterizePolygon(LIPS.map(P), w, h),
    cheekR: rasterizePolygon(CHEEK.R.map(P), w, h),
    cheekL: rasterizePolygon(CHEEK.L.map(P), w, h),
    forehead: rasterizePolygon(FOREHEAD.map(P), w, h),
  };
}

function canvasToBlob(cv) { return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.95)); }

// ---------- 서버 생성 → C1 → C4-2(굽기) ----------
async function generateLook() {
  if (!state.sourcePhoto || !state.refFile) return;
  $("btnGenerate").disabled = true;
  setStatus("서버에서 룩 생성 중… (fp16, 10 step, 약 3초)", "");
  const t0 = performance.now();
  try {
    const sourceBlob = await canvasToBlob(state.sourcePhoto.canvas);
    const client = await Client.connect(GRADIO_URL);
    const result = await client.predict("/predict", [sourceBlob, state.refFile, 10, 1.6]);
    const [imgData] = result.data;
    const url = imgData.url || (imgData.path ? `${GRADIO_URL}/file=${imgData.path}` : null);
    if (!url) throw new Error("서버 응답에서 이미지 URL을 찾지 못함");

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

    const genCv = document.createElement("canvas");
    genCv.width = img.naturalWidth; genCv.height = img.naturalHeight;
    genCv.getContext("2d").drawImage(img, 0, 0);
    const genDet = state.imageLandmarker.detect(genCv);
    const genLm = genDet.faceLandmarks && genDet.faceLandmarks[0];
    if (!genLm) throw new Error("생성된 이미지에서 얼굴을 찾지 못함");

    // base를 gen과 같은 해상도로 리사이즈해야 픽셀 정렬이 맞는다(C1 extractLayer 전제조건)
    const baseCv = document.createElement("canvas");
    baseCv.width = genCv.width; baseCv.height = genCv.height;
    baseCv.getContext("2d").drawImage(state.sourcePhoto.canvas, 0, 0, baseCv.width, baseCv.height);

    const masks = buildMasks(genLm, genCv.width, genCv.height);
    const baseImg = baseCv.getContext("2d").getImageData(0, 0, baseCv.width, baseCv.height);
    const genImg = genCv.getContext("2d").getImageData(0, 0, genCv.width, genCv.height);

    // C1을 부위별로 따로 호출(각 호출은 forehead 기준 마스크 + 그 부위 마스크 하나만) → 부위별로
    // 구워서 자기 반경으로 페더링한 뒤 합성. 부위마다 통째로 한 레이어에 섞어서 구우면 전부 같은
    // 반경으로 블러되는데, 입술처럼 경계가 또렷해야 하는 부위와 볼터치처럼 부드러워야 하는 부위가
    // 섞여 있어서 부위별로 나눠야 한다(C3 반경표, 1024 기준).
    const uvCanvas = document.createElement("canvas");
    uvCanvas.width = 1024; uvCanvas.height = 1024;
    const uvCtx = uvCanvas.getContext("2d");
    for (const [partId, featherPx] of Object.entries(FEATHER)) {
      const partLayer = extractLayer(baseImg, genImg, { forehead: masks.forehead, [partId]: masks[partId] });
      const partUV = bakeLayer(partLayer, genLm, state.faceUV, state.faceTriangles, 1024, featherPx);
      uvCtx.drawImage(partUV, 0, 0);
    }

    state.lookResult = { uvCanvas };
    bakedTexture.image = uvCanvas;
    bakedTexture.needsUpdate = true;

    $("bakedPreview").src = uvCanvas.toDataURL("image/png");
    $("step3").hidden = false;
    setStatus(`룩 생성+굽기 완료 (${((performance.now() - t0) / 1000).toFixed(1)}초). '실시간으로 보기'를 누르세요`, "ok");
  } catch (e) {
    console.error(e);
    setStatus("생성 실패: " + e.message + " (Gradio 서버가 http://127.0.0.1:7860 에 떠 있는지 확인하세요)", "err");
    $("btnGenerate").disabled = false;
  }
}

// ---------- WebGL 씬 ----------
let renderer, scene, camera, videoMesh, faceMesh, bakedTexture, positionAttr;
let videoW = 0, videoH = 0;
const DISTANCE = 480; // 카메라~비디오 평면 가상 거리(픽셀 단위 스케일, 임의값 — fov 계산과 정점 Z 배치에 공용)

function initThree(w, h) {
  videoW = w; videoH = h;
  const canvas = $("glCanvas");
  canvas.width = w; canvas.height = h;

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(w, h, false);

  scene = new THREE.Scene();

  const fov = 2 * Math.atan(h / 2 / DISTANCE) * (180 / Math.PI);
  camera = new THREE.PerspectiveCamera(fov, w / h, 1, DISTANCE * 4);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  const video = $("video");
  const videoTex = new THREE.VideoTexture(video);
  // C6에서 textureLod로 저주파(흐린) 버전을 뽑아 쓰려면 밉맵이 있어야 한다. VideoTexture는 기본
  // NearestFilter라 밉맵이 꺼져 있어서 명시적으로 켠다(WebGL2라 NPOT 밉맵 제약 없음).
  videoTex.generateMipmaps = true;
  videoTex.minFilter = THREE.LinearMipmapLinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  const videoGeo = new THREE.PlaneGeometry(w, h);
  const videoMat = new THREE.MeshBasicMaterial({ map: videoTex, depthTest: false, depthWrite: false });
  videoMesh = new THREE.Mesh(videoGeo, videoMat);
  videoMesh.position.set(0, 0, -DISTANCE);
  videoMesh.renderOrder = 0;
  scene.add(videoMesh);

  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(468 * 3);
  positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", positionAttr);

  const uvArr = new Float32Array(468 * 2);
  state.faceUV.forEach(([u, v], i) => { uvArr[i * 2] = u; uvArr[i * 2 + 1] = v; });
  geo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(state.faceTriangles), 1));

  bakedTexture = new THREE.Texture();
  // flipY 규약 위반 주의: face-uv.json 추출 때 이미 (1-v)로 한 번 뒤집었다(파일 상단 주석 참고).
  // three.js Texture는 기본 flipY=true라 캔버스를 텍스처로 올릴 때 또 한 번 뒤집는다 — 그대로 두면
  // 뒤집기가 두 곳에서 일어나 눈썹이 헤어라인 쪽으로 밀리는 식으로 어긋난다(실측으로 발견함).
  // 여기서 명시적으로 꺼서 뒤집기를 extract-face-uv.js 한 곳으로만 고정한다.
  bakedTexture.flipY = false;

  // C2 최종: 명도 보존 합성 셰이더. globalAlpha 선형보간(피부 결이 지워짐) 대신, 화장색을
  // 자기 명도로 나눠 색조만 남기고 원본에 곱한다 — 원본의 명암 구조(모공·주름)가 그대로 보존된다.
  // uVideoTex는 화면 좌표(vScreenPos, 정점 셰이더에서 클립 좌표로 계산)로 다시 샘플링한다 —
  // faceMesh의 uv는 캐노니컬 UV(구운 텍스처용)라 비디오 샘플링엔 못 쓴다, 별도 좌표가 필요하다.
  // GLSL3(glslVersion:GLSL3)로 쓰는 이유: C6이 textureLod로 비디오의 저주파(흐린) 버전을 뽑아야
  // 하는데, textureLod는 GLSL ES 3.00 내장 함수라 기본 GLSL ES 1.00(texture2D)로는 못 쓴다.
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uMakeupTex: { value: bakedTexture },
      uVideoTex: { value: videoTex },
      uSpecThreshold: { value: 0.6 }, // C5: 이 명도 이상만 하이라이트
      uSpecPower: { value: 8.0 },
      uGloss: { value: 0.5 }, // 0=매트, 1=고광택. 부위별 값은 룩 템플릿에 아직 없어서 전역 하나로 근사
      uTextureStrength: { value: 0.8 }, // C6: 고주파(모공·주름) 복원 강도
    },
    vertexShader: `
      out vec2 vUv;
      out vec4 vScreenPos;
      void main() {
        vUv = uv;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vScreenPos = clip;
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D uMakeupTex;
      uniform sampler2D uVideoTex;
      uniform float uSpecThreshold, uSpecPower, uGloss, uTextureStrength;
      in vec2 vUv;
      in vec4 vScreenPos;
      out vec4 fragColor;
      float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;
        vec4 makeup = texture(uMakeupTex, vUv);
        vec3 orig = texture(uVideoTex, screenUV).rgb;

        // C2(개정): makeup.rgb는 "절대 색"이 아니라 lib/extractLayer.js가 저장한 "base 대비 배율"
        // (인코딩: stored = ratio/2.0, 디코드: ratio = stored*2.0, 1.0=무변화). 처음엔 촬영 사진의
        // 절대 색을 그대로 합성했는데, 촬영 당시 조명과 지금 라이브 조명이 다르면 색이 안 맞아서
        // "사진을 오려 붙인 캐릭터 필터" 느낌이 났다(실사용 피드백) — 절대색 대신 "지금 이 픽셀의
        // 실제 피부색"에 그 배율을 곱해서, 조명이 달라도 이 사람 지금 피부톤 기준으로 화장이 얹힌다.
        vec3 ratio = makeup.rgb * 2.0;
        vec3 tinted = orig * ratio;
        vec3 result = mix(orig, tinted, makeup.a);

        // C5: 스페큘러 — 조명 방향을 몰라도, 원래 밝은 곳이 더 밝아지는 것만으로 광택으로 읽힌다.
        float l = luma(orig);
        float spec = pow(max(0.0, l - uSpecThreshold), uSpecPower) * uGloss * makeup.a;
        result += spec;

        // C6: 고주파(모공·주름) 복원 — 밉맵으로 비디오의 저주파(흐린) 버전을 뽑아 빼면 고주파만
        // 남는다. 이걸 합성 후 다시 더해서, 화장 위에도 피부 결이 얹혀 보이게 한다.
        vec3 lowFreq = textureLod(uVideoTex, screenUV, 2.0).rgb;
        vec3 highFreq = orig - lowFreq;
        result += highFreq * uTextureStrength * makeup.a;

        fragColor = vec4(result, 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  faceMesh = new THREE.Mesh(geo, mat);
  faceMesh.renderOrder = 1;
  faceMesh.visible = false;
  scene.add(faceMesh);

  updateMeshPositionsFlat(); // 초기값(원점 근처) — 첫 검출 전 화면이 비어보이지 않게
}

// 첫 프레임 전 임시로 UV 위치를 그대로 평면에 깔아준다(디버그/초기 표시용)
function updateMeshPositionsFlat() {
  const arr = positionAttr.array;
  for (let i = 0; i < 468; i++) {
    arr[i * 3] = 0; arr[i * 3 + 1] = 0; arr[i * 3 + 2] = -DISTANCE;
  }
  positionAttr.needsUpdate = true;
}

// 랜드마크(정규화 0..1, MediaPipe z) -> 월드 정점. 원근 보정: 같은 카메라 광선 위에서 z만큼 밀고,
// 그만큼 화면에 맺히는 위치가 안 변하도록 X,Y에 (1-z) 스케일을 곱한다(파일 상단 주석 참고).
function updateMeshPositions(lm) {
  const arr = positionAttr.array;
  for (let i = 0; i < 468; i++) {
    const ndcX = (lm[i].x - 0.5) * videoW;
    const ndcY = -(lm[i].y - 0.5) * videoH;
    const z = lm[i].z;
    const scale = 1 - z;
    arr[i * 3] = ndcX * scale;
    arr[i * 3 + 1] = ndcY * scale;
    arr[i * 3 + 2] = -DISTANCE * (1 + z);
  }
  positionAttr.needsUpdate = true;
}

// ---------- 실시간 루프 ----------
const TRACKED_IDX = Array.from({ length: 468 }, (_, i) => i); // 전체 메시라 전부 스무딩 대상
const smoother = new LandmarkSmoother(TRACKED_IDX, { smoothZ: true, minCutoff: 3.5, beta: 0.15 });
function updateSmoothingParams() {
  const minCutoff = parseFloat($("minCutoff").value);
  const beta = parseFloat($("beta").value);
  smoother.setParams(minCutoff, beta);
  $("minCutoffVal").textContent = minCutoff.toFixed(1);
  $("betaVal").textContent = beta.toFixed(2);
}

function liveLoop() {
  if (!state.liveOn) return;
  const video = $("video");
  if (video.readyState >= 2) {
    const now = performance.now();
    const res = state.videoLandmarker.detectForVideo(video, now);
    const lm = smoother.smooth(res.faceLandmarks && res.faceLandmarks[0], now);
    if (lm) {
      updateMeshPositions(lm);
      faceMesh.visible = !!state.lookResult;
      $("liveStatus").textContent = "얼굴 추적 중";
    } else {
      faceMesh.visible = false;
      $("liveStatus").textContent = "얼굴 미검출";
    }
    renderer.render(scene, camera);
  }
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(liveLoop);
  else requestAnimationFrame(liveLoop); // iOS Safari < 15.4 등 폴백
}

function goLive() {
  $("step1").hidden = true; $("step2").hidden = true; $("step3").hidden = true;
  $("liveStage").hidden = false;
  state.liveOn = true;
  const video = $("video");
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(liveLoop);
  else requestAnimationFrame(liveLoop);
}

function reset() {
  state.liveOn = false;
  state.sourcePhoto = null; state.refFile = null; state.lookResult = null;
  $("step1").hidden = false; $("step2").hidden = true; $("step3").hidden = true; $("liveStage").hidden = true;
  $("btnGenerate").disabled = true;
  if (faceMesh) faceMesh.visible = false;
  setStatus("초기화됨. '얼굴 촬영'을 누르세요", "ok");
}

// ---------- 초기화 ----------
$("btnCapture").onclick = captureFrame;
$("refFile").onchange = onRefChange;
$("btnGenerate").onclick = generateLook;
$("btnLive").onclick = goLive;
$("btnReset").onclick = reset;
$("wireframe").onchange = (e) => { if (faceMesh) faceMesh.material.wireframe = e.target.checked; };
$("minCutoff").oninput = updateSmoothingParams;
$("beta").oninput = updateSmoothingParams;
updateSmoothingParams();

window.__pocgl = {
  state, THREE, updateMeshPositions, smoother,
  generateLook, captureFrame, goLive,
  getScene: () => ({ renderer, scene, camera, videoMesh, faceMesh, bakedTexture }),
}; // 브라우저 콘솔/자동화 테스트용

(async () => {
  try {
    await loadMeshAssets();
    setStatus("얼굴 인식 모델 로딩 중…");
    await initLandmarkers();
    setStatus("카메라 시작 중…");
    const { width, height } = await startCamera();
    initThree(width, height);
    setStatus("준비 완료. '얼굴 촬영'을 누르세요", "ok");
  } catch (e) {
    console.error(e);
    setStatus("초기화 실패: " + e.message, "err");
  }
})();
