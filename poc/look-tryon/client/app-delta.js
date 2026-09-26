// 당화응 POC — "진짜 설계 경로" 품질 확인용: server/app/layer.py와 동일한 ΔLab 델타 레이어를
// 클라이언트에서 재현하고(deltaLayer.js), 라이브 프레임 자기 색 위에 그 변화량만 더해 합성한다
// (decodeDeltaLayer.js). app.js(v2, 생성 사진 전체를 오려 붙이는 폴백 경로)와 달리 이게 정식 설계의
// "정상 경로"다 — 2026-09-23 웹캠 확인에서 app.js가 "스티커 같다"는 지적을 받고 만든 비교 데모.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { Client } from "https://esm.sh/@gradio/client@2.6.0";
import { EmaSmoother } from "./lib/smoothing.js";
import { REGION_KEYS, TRACKED_IDX, buildRegions, buildForehead } from "./lib/regions.js";
import { rasterizePolygon } from "./lib/rasterize.js";
import { extractDeltaLayer } from "./lib/deltaLayer.js";
import { applyDeltaLayer } from "./lib/decodeDeltaLayer.js";
import { warpPolygon } from "./lib/warp.js";

const GRADIO_URL = "http://127.0.0.1:7860";
// 모델 서버(app_demo.py/model_server.py)가 id_image·결과를 둘 다 이 크기로 고정한다 — server/app/layer.py
// ALIGNED_SIZE와 동일. 우리가 임의로 정한 값이 아니라 모델이 실제로 처리하는 크기를 맞추는 것.
const ALIGNED_SIZE = 512;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const setStatus = (t, cls = "") => { statusEl.textContent = t; statusEl.className = "status " + cls; };

const state = {
  imageLandmarker: null, videoLandmarker: null,
  stream: null,
  sourcePhoto: null,   // { canvas, landmarks }
  refFile: null,
  lookResult: null,    // { deltaLayerCanvas, srcRegions } — deltaLayerCanvas는 ALIGNED_SIZE 정사각, ΔLab 인코딩
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
  // 정사각형으로 가운데 크롭해서 찍는다 — 모델(app_demo.py)도 결과도 어차피 512x512 정사각형으로
  // 처리되는데, 비정사각형(예: 1280x960) 그대로 넣으면 정사각형으로 눌려 찌그러진 채 생성·비교된다.
  // 처음부터 정사각형으로 찍어야 1번(촬영) 미리보기와 3번(완성 예상) 미리보기 비율이 같아서
  // 화장이 실제로 어떻게 입혀지는지 왜곡 없이 비교할 수 있다.
  const side = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - side) / 2, sy = (video.videoHeight - side) / 2;
  const cv = document.createElement("canvas");
  cv.width = side; cv.height = side;
  cv.getContext("2d").drawImage(video, sx, sy, side, side, 0, 0, side, side);
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

function canvasToBlob(cv) {
  return new Promise((res) => cv.toBlob(res, "image/jpeg", 0.95));
}

function resizeToCanvas(imgOrCanvas, size) {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  cv.getContext("2d").drawImage(imgOrCanvas, 0, 0, size, size);
  return cv;
}

function maskFromRegion(lm, size) {
  const masks = {};
  const regions = buildRegions(lm, size, size);
  for (const key of REGION_KEYS) masks[key] = rasterizePolygon(regions[key], size, size);
  return masks;
}

// ---------- 서버 생성 + ΔLab 레이어 추출 ----------
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

    // id_image·결과 둘 다 모델이 ALIGNED_SIZE로 처리하므로, 우리도 같은 크기로 리사이즈해야
    // 두 이미지가 픽셀 단위로 정렬된다(server/app/layer.py와 동일 전제).
    const sourceAligned = resizeToCanvas(state.sourcePhoto.canvas, ALIGNED_SIZE);
    const resultAligned = resizeToCanvas(img, ALIGNED_SIZE);
    const sourceImgData = sourceAligned.getContext("2d").getImageData(0, 0, ALIGNED_SIZE, ALIGNED_SIZE);
    const resultImgData = resultAligned.getContext("2d").getImageData(0, 0, ALIGNED_SIZE, ALIGNED_SIZE);

    const masks = maskFromRegion(state.sourcePhoto.landmarks, ALIGNED_SIZE);
    const forehead = rasterizePolygon(buildForehead(state.sourcePhoto.landmarks, ALIGNED_SIZE, ALIGNED_SIZE), ALIGNED_SIZE, ALIGNED_SIZE);

    const deltaLayerData = extractDeltaLayer(sourceImgData, resultImgData, masks, forehead, 6);
    if (!deltaLayerData) throw new Error("이마가 프레임 밖이라 레이어를 추출하지 못함(server와 같은 조건)");

    const deltaLayerCanvas = document.createElement("canvas");
    deltaLayerCanvas.width = ALIGNED_SIZE; deltaLayerCanvas.height = ALIGNED_SIZE;
    deltaLayerCanvas.getContext("2d").putImageData(new ImageData(deltaLayerData.data, deltaLayerData.width, deltaLayerData.height), 0, 0);

    state.lookResult = { deltaLayerCanvas, srcRegions: buildRegions(state.sourcePhoto.landmarks, ALIGNED_SIZE, ALIGNED_SIZE) };

    // 디버그 미리보기: 추출한 델타를 원본 자신에게 되돌려 적용 — 결과 이미지와 비슷하게 나오면
    // 인코딩·디코딩이 왕복 검증된 것(alphaScale=1로 정확히 재현 시도).
    const checkImgData = sourceAligned.getContext("2d").getImageData(0, 0, ALIGNED_SIZE, ALIGNED_SIZE);
    applyDeltaLayer(checkImgData, deltaLayerData, 1.0);
    const checkCv = document.createElement("canvas");
    checkCv.width = ALIGNED_SIZE; checkCv.height = ALIGNED_SIZE;
    checkCv.getContext("2d").putImageData(checkImgData, 0, 0);
    $("layerPreview").src = checkCv.toDataURL("image/png");

    $("resultPreview").src = resultAligned.toDataURL("image/jpeg", 0.9);
    $("step3").hidden = false;
    setStatus(`룩 생성 완료 (${((performance.now() - t0) / 1000).toFixed(1)}초). ${info || ""} '실시간으로 보기'를 누르세요`, "ok");
  } catch (e) {
    console.error(e);
    setStatus("생성 실패: " + e.message + " (Gradio 서버가 http://127.0.0.1:7860 에 떠 있는지 확인하세요)", "err");
    $("btnGenerate").disabled = false;
  }
}

// ---------- 스무딩 ----------
// One Euro Filter 대신 guide 브랜치(poc/full/lib/gate.js Smoother)와 같은 단순 EMA로 — 계산이 가볍고
// 위상 지연도 덜하다(2026-09-25 확인: One Euro는 beta·minCutoff를 최댓값으로 올려도 체감 개선이 미미했음).
const smoother = new EmaSmoother(TRACKED_IDX, { smoothZ: true });
function updateSmoothingParams() {
  const alpha = parseFloat($("alpha_smooth").value);
  smoother.setAlpha(alpha);
  $("alphaSmoothVal").textContent = alpha.toFixed(2);
}

// ---------- 실시간 루프 ----------
let offCanvas = null; // 델타 레이어를 라이브 좌표로 기하 워핑만 해두는 오프스크린 캔버스(인코딩 픽셀 그대로 유지)
let lastT = -1;

function unionBBox(regionsObj, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of REGION_KEYS) {
    for (const [x, y] of regionsObj[key]) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function liveLoop() {
  if (!state.liveOn) return;
  const video = $("video"), cv = $("liveCanvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
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
        const alphaScale = parseFloat($("alpha").value);

        if (!offCanvas) { offCanvas = document.createElement("canvas"); offCanvas.width = cv.width; offCanvas.height = cv.height; }
        const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
        offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
        for (const key of REGION_KEYS) {
          warpPolygon(offCtx, state.lookResult.srcRegions[key], liveRegions[key], state.lookResult.deltaLayerCanvas, 1.0);
        }

        const bb = unionBBox(liveRegions, 8);
        const x0 = Math.max(0, Math.floor(bb.x0)), y0 = Math.max(0, Math.floor(bb.y0));
        const x1 = Math.min(cv.width, Math.ceil(bb.x1)), y1 = Math.min(cv.height, Math.ceil(bb.y1));
        const w = x1 - x0, h = y1 - y0;
        if (w > 0 && h > 0) {
          const liveImgData = ctx.getImageData(x0, y0, w, h);
          const encImgData = offCtx.getImageData(x0, y0, w, h);
          applyDeltaLayer(liveImgData, encImgData, alphaScale);
          ctx.putImageData(liveImgData, x0, y0);
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

$("btnCapture").onclick = captureFrame;
$("alpha_smooth").oninput = updateSmoothingParams;
updateSmoothingParams();
$("refFile").onchange = onRefChange;
$("btnGenerate").onclick = generateLook;
$("btnLive").onclick = goLive;
$("btnReset").onclick = reset;

window.__pocdelta = { state, smoother }; // 브라우저 콘솔/자동화 테스트용

(async () => {
  try {
    await initLandmarkers();
    await startCamera();
  } catch (e) {
    setStatus("초기화 실패: " + e.message, "err");
  }
})();
