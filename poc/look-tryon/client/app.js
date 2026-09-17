// 당화응 POC — 얼굴 촬영 → 룩 생성(서버) → 실시간 얼굴 매핑
// v2: 얼굴 전체 통째 아핀 1번(v1)이 배경·피부톤까지 섞여 "화장이 진하게 뜸" 문제가 있어서,
// 눈썹/눈(섀도우 밴드)/입술/볼 부위별로 따로 워핑하도록 변경. 각 부위는 팬 삼각분할로 여러 개의
// 3점 아핀 워핑(solveAffine, v1과 동일 수식)을 이어붙여 처리 — 부위 밖은 전혀 합성하지 않는다.
// v3: 실사용 테스트에서 실시간 워핑이 흔들린다는 피드백 — 원인은 각도 추적 실패가 아니라 프레임 간
// 랜드마크 노이즈. One Euro Filter로 라이브 랜드마크를 스무딩해서 완화(liveLoop 쪽 참고).

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { Client } from "https://esm.sh/@gradio/client@2.6.0";
import { solveAffine } from "./lib/affine.js";
import { LandmarkSmoother } from "./lib/smoothing.js";

const GRADIO_URL = "http://127.0.0.1:7860";

// 랜드마크 인덱스 (poc/app.js와 동일 관례 재사용: EYES.upper, CHEEK)
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
const EYESHADOW_REACH = 0.45; // 눈꺼풀 선 -> 눈썹 쪽으로 이 비율만큼 올려서 섀도우 밴드 상단 경계

// 라이브 워핑에 실제 쓰는 랜드마크 인덱스만 스무딩 대상으로 삼는다 (478개 전부는 불필요)
const TRACKED_IDX = [...new Set([...BROW.R, ...BROW.L, ...EYES.R.upper, ...EYES.L.upper, ...LIPS, ...CHEEK.R, ...CHEEK.L])];

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t, cls = "") => { statusEl.textContent = t; statusEl.className = "status " + cls; };

const state = {
  imageLandmarker: null, videoLandmarker: null,
  stream: null,
  sourcePhoto: null,      // { canvas, landmarks }
  refFile: null,
  lookResult: null,       // { img, regions }
  liveOn: false,
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
  setStatus("준비 완료. 카메라를 시작하세요", "ok");
}

// ---------- 카메라 ----------
async function startCamera() {
  const video = $("video");
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }, audio: false });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  $("liveCanvas").width = video.videoWidth;
  $("liveCanvas").height = video.videoHeight;
  setStatus("카메라 준비 완료. '얼굴 촬영'을 누르세요", "ok");
  $("btnCapture").disabled = false;
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

// ---------- 룩 참조 업로드 ----------
function onRefChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.refFile = file;
  $("refPreview").src = URL.createObjectURL(file);
  $("btnGenerate").disabled = false;
}

// ---------- 기하 유틸 ----------
function canvasToBlob(cv) {
  return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.95));
}
function landmarkPx(landmarks, idx, w, h) {
  const p = landmarks[idx];
  return [p.x * w, p.y * h];
}
function centroid(pts) {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// 부위별 폴리곤: 눈썹은 랜드마크 그대로, 눈은 눈꺼풀 선~눈썹 쪽으로 올린 밴드, 입술·볼은 랜드마크 그대로
function buildRegions(lm, w, h) {
  const P = (i) => landmarkPx(lm, i, w, h);
  const browR = BROW.R.map(P), browL = BROW.L.map(P);
  const browRC = centroid(browR), browLC = centroid(browL);
  const lidR = EYES.R.upper.map(P), lidL = EYES.L.upper.map(P);
  const eyeR = [...lidR, ...lidR.map((p) => lerp(p, browRC, EYESHADOW_REACH)).reverse()];
  const eyeL = [...lidL, ...lidL.map((p) => lerp(p, browLC, EYESHADOW_REACH)).reverse()];
  return {
    browR, browL, eyeR, eyeL,
    lips: LIPS.map(P),
    cheekR: CHEEK.R.map(P), cheekL: CHEEK.L.map(P),
  };
}

// ---------- 서버 생성 ----------
async function generateLook() {
  if (!state.sourcePhoto || !state.refFile) return;
  $("btnGenerate").disabled = true;
  setStatus("서버에서 룩 생성 중… (fp16, 10 step, 약 3초)", "");
  const t0 = performance.now();
  try {
    const sourceBlob = await canvasToBlob(state.sourcePhoto.canvas);
    const client = await Client.connect(GRADIO_URL);
    const result = await client.predict("/predict", [sourceBlob, state.refFile, 10, 1.6]);
    const [imgData, info] = result.data;
    const url = imgData.url || (imgData.path ? `${GRADIO_URL}/file=${imgData.path}` : null);
    if (!url) throw new Error("서버 응답에서 이미지 URL을 찾지 못함");

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    const det = state.imageLandmarker.detect(cv);
    const lm = det.faceLandmarks && det.faceLandmarks[0];
    if (!lm) throw new Error("생성된 이미지에서 얼굴을 찾지 못함");

    state.lookResult = { img, regions: buildRegions(lm, cv.width, cv.height) };
    $("resultPreview").src = cv.toDataURL("image/jpeg", 0.9);
    $("step3").hidden = false;
    setStatus(`룩 생성 완료 (${((performance.now() - t0) / 1000).toFixed(1)}초). ${info || ""} '실시간으로 보기'를 누르세요`, "ok");
  } catch (e) {
    console.error(e);
    setStatus("생성 실패: " + e.message + " (Gradio 서버가 http://127.0.0.1:7860 에 떠 있는지 확인하세요)", "err");
    $("btnGenerate").disabled = false;
  }
}

// ---------- 아핀 변형 ----------
// 폴리곤(가운데점 팬 삼각분할) 단위로 src 영역을 dst 영역에 워핑해서 그린다.
function warpPolygon(ctx, srcPts, dstPts, srcImg, alpha) {
  const srcC = centroid(srcPts), dstC = centroid(dstPts);
  const n = srcPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const m = solveAffine([srcC, srcPts[i], srcPts[j]], [dstC, dstPts[i], dstPts[j]]);
    if (!m) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstC[0], dstC[1]);
    ctx.lineTo(dstPts[i][0], dstPts[i][1]);
    ctx.lineTo(dstPts[j][0], dstPts[j][1]);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(srcImg, 0, 0);
    ctx.restore();
  }
}

const REGION_KEYS = ["browR", "browL", "eyeR", "eyeL", "lips", "cheekR", "cheekL"];

// ---------- 스무딩 (One Euro Filter, lib/smoothing.js) ----------
const smoother = new LandmarkSmoother(TRACKED_IDX);
function updateSmoothingParams() {
  const minCutoff = parseFloat($("minCutoff").value);
  const beta = parseFloat($("beta").value);
  smoother.setParams(minCutoff, beta);
  $("minCutoffVal").textContent = minCutoff.toFixed(1);
  $("betaVal").textContent = beta.toFixed(2);
}

// ---------- 실시간 루프 ----------
let lastT = -1;
function liveLoop() {
  if (!state.liveOn) return;
  const video = $("video"), cv = $("liveCanvas"), ctx = cv.getContext("2d");
  if (video.readyState >= 2) {
    const now = performance.now();
    if (now !== lastT) {
      lastT = now;
      const res = state.videoLandmarker.detectForVideo(video, now);
      const lm = smoother.smooth(res.faceLandmarks && res.faceLandmarks[0], now);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      if (lm && state.lookResult) {
        const liveRegions = buildRegions(lm, cv.width, cv.height);
        const alpha = parseFloat($("alpha").value);
        for (const key of REGION_KEYS) {
          warpPolygon(ctx, state.lookResult.regions[key], liveRegions[key], state.lookResult.img, alpha);
        }
        $("liveStatus").textContent = "얼굴 추적 중";
      } else {
        $("liveStatus").textContent = lm ? "룩 없음" : "얼굴 미검출";
      }
    }
  }
  requestAnimationFrame(liveLoop);
}

function goLive() {
  $("step1").hidden = true; $("step2").hidden = true; $("step3").hidden = true;
  $("liveStage").hidden = false;
  state.liveOn = true;
  requestAnimationFrame(liveLoop);
}

function reset() {
  state.liveOn = false;
  state.sourcePhoto = null; state.refFile = null; state.lookResult = null;
  $("step1").hidden = false; $("step2").hidden = true; $("step3").hidden = true; $("liveStage").hidden = true;
  $("btnGenerate").disabled = true;
  setStatus("초기화됨. '얼굴 촬영'을 누르세요", "ok");
}

// ---------- 초기화 ----------
$("btnCapture").onclick = captureFrame;
$("minCutoff").oninput = updateSmoothingParams;
$("beta").oninput = updateSmoothingParams;
updateSmoothingParams();
$("refFile").onchange = onRefChange;
$("btnGenerate").onclick = generateLook;
$("btnLive").onclick = goLive;
$("btnReset").onclick = reset;

window.__poc = { buildRegions, solveAffine, warpPolygon, state, smoother }; // 브라우저 콘솔/자동화 테스트용

(async () => {
  try {
    await initLandmarkers();
    await startCamera();
  } catch (e) {
    setStatus("초기화 실패: " + e.message, "err");
  }
})();
