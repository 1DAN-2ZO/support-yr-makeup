// 실시간 화장 — 소다 같은 뷰티 앱과 같은 순서로 처리한다.
//   ① 피부 보정 → ② 화장(색만 옮기고 밝기는 한도만큼) → ③ 톤 통일
// 카메라가 없으면 내 얼굴 사진으로도 같은 파이프라인을 돌려 볼 수 있다.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { renderFrame } from "./render3.js";
import { buildShapes } from "./paint.js";
import { maskFromPolys } from "./render2.js";
import { LABEL, loadParser, maskToCanvas, parseFace } from "./parser.js";

const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
const state = { look: null, looks: [], mode: "idle", live: false, photo: null, photoLm: null, bare: false, seg: null, busy: false, hasParser: false };
let videoLmk, imgLmk;

async function loadImage(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return cv;
}
const val = (id) => +$(id).value;

/**
 * 부위별 재료를 만든다. 분할 모델이 아는 곳(입술·눈썹)은 모델 마스크를,
 * 모르는 곳(눈두덩·볼)은 얼굴 점 모양을 쓴다.
 */
function partsFor(lm, w, h, seg) {
  const look = state.look;
  const shapes = buildShapes(lm, w, h, look);
  const fw = shapes.faceW;
  const master = val("master") / 100;
  const fBase = (val("feather") / 100) * fw;
  const pick = (key, polys, holes) => {
    if (seg?.[key]) {
      // 모델 마스크는 원본 크기라 이 크기로 줄여 쓴다
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(seg[key], 0, 0, w, h);
      return cv;
    }
    return maskFromPolys(polys, holes, w, h);
  };
  const it = (name, mask, featherMul, extra = {}) => {
    const p = look.items[name];
    if (!p || p.alpha <= 0) return null;
    return { mask, color: p.color, alpha: Math.min(1, p.alpha * master), feather: Math.max(1, fBase * featherMul), ...extra };
  };
  return {
    lip: it("lip", pick("lip", shapes.lip, shapes.lipHole), 0.25, { gloss: val("gloss") / 100, pull: 0.35 }),
    shadow: it("shadow", maskFromPolys(shapes.shadow, null, w, h), 1.0),
    cheek: it("cheek", maskFromPolys(shapes.cheek, null, w, h), 1.8, { mode: "soft" }),
    brow: it("brow", pick("brow", shapes.brow, null), 0.15),
  };
}

const opts = () => ({ scale: 0.5, smooth: val("smooth") / 100, tone: val("tone") / 100 });

// ── 정지 사진 ───────────────────────────────────────────────────────────────
function drawPhoto() {
  if (!state.photo || !state.photoLm) return;
  const cv = $("out");
  cv.width = state.photo.width; cv.height = state.photo.height;
  const ctx = cv.getContext("2d");
  const ms = renderFrame(ctx, state.photo, state.bare ? null : (w, h) => partsFor(state.photoLm, w, h, state.seg), { ...opts(), scale: 1 });
  setStatus(`내 얼굴 사진 · ${state.bare ? "화장 끔" : "화장 켬"} · 처리 ${ms.toFixed(0)}ms`);
}

// ── 실시간 ──────────────────────────────────────────────────────────────────
let frames = 0, lastFps = performance.now(), lastMs = 0;
function loop() {
  if (!state.live) return;
  const video = $("video"), cv = $("out");
  if (video.readyState >= 2) {
    if (cv.width !== video.videoWidth) { cv.width = video.videoWidth; cv.height = video.videoHeight; }
    const ctx = cv.getContext("2d");
    const lm = videoLmk.detectForVideo(video, performance.now()).faceLandmarks?.[0];

    // 분할 모델은 매 프레임 기다리지 않는다 — 뒤에서 갱신하고 최신 것을 쓴다
    if (lm && state.hasParser && !state.busy) {
      state.busy = true;
      parseFace(video, lm, cv.width, cv.height)
        .then((p) => { if (p) state.seg = { lip: maskToCanvas(p, LABEL.LIP, cv.width, cv.height), brow: maskToCanvas(p, LABEL.BROW, cv.width, cv.height) }; })
        .finally(() => { state.busy = false; });
    }

    lastMs = renderFrame(ctx, video, lm && !state.bare ? (w, h) => partsFor(lm, w, h, state.seg) : null, opts());
    if (++frames >= 20) {
      const now = performance.now();
      const fps = frames / ((now - lastFps) / 1000);
      setStatus(`${lm ? "얼굴 추적 중" : "얼굴 미검출"} · 초당 ${fps.toFixed(0)}장 · 처리 ${lastMs.toFixed(0)}ms${state.bare ? " · 화장 끔" : ""}`);
      frames = 0; lastFps = now;
    }
  }
  video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
}

async function startCam() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  state.mode = "live"; state.live = true;
  $("out").classList.add("mirror");
  loop();
}

async function showPhoto() {
  state.live = false; state.mode = "photo";
  $("out").classList.remove("mirror");
  if (!state.photo) {
    setStatus("사진을 불러오는 중…");
    state.photo = await loadImage("./data/my_face.png");
    state.photoLm = imgLmk.detect(state.photo).faceLandmarks?.[0];
    if (state.hasParser && state.photoLm) {
      const p = await parseFace(state.photo, state.photoLm, state.photo.width, state.photo.height);
      if (p) state.seg = { lip: maskToCanvas(p, LABEL.LIP, state.photo.width, state.photo.height), brow: maskToCanvas(p, LABEL.BROW, state.photo.width, state.photo.height) };
    }
  }
  drawPhoto();
}

(async () => {
  const cfg = await fetch("./looks.json", { cache: "no-cache" }).then((r) => r.json());
  state.looks = cfg.looks;
  state.look = cfg.looks.find((l) => l.id === "coral_doll") ?? cfg.looks[0];
  $("look").innerHTML = cfg.looks.map((l) => `<option value="${l.id}"${l === state.look ? " selected" : ""}>${l.name}</option>`).join("");

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const base = { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" }, numFaces: 1 };
  videoLmk = await FaceLandmarker.createFromOptions(vision, { ...base, runningMode: "VIDEO" });
  imgLmk = await FaceLandmarker.createFromOptions(vision, { ...base, runningMode: "IMAGE" });
  state.hasParser = !!(await loadParser());

  const redraw = () => { if (state.mode === "photo") drawPhoto(); };
  for (const [id, fmt] of [["smooth", (v) => (v / 100).toFixed(2)], ["tone", (v) => (v / 100).toFixed(2)],
    ["master", (v) => v + "%"], ["feather", (v) => v], ["gloss", (v) => (v / 100).toFixed(2)]]) {
    $(id).oninput = () => { $(id + "V").textContent = fmt(val(id)); redraw(); };
  }
  $("look").onchange = (e) => { state.look = state.looks.find((l) => l.id === e.target.value); redraw(); };
  $("btnCam").onclick = () => startCam().catch((err) => setStatus("카메라 실패: " + err.message));
  $("btnPhoto").onclick = () => showPhoto();
  $("btnBare").onclick = (e) => {
    state.bare = !state.bare;
    e.target.textContent = state.bare ? "화장 켜기" : "화장 끄기";
    e.target.classList.toggle("on", state.bare);
    redraw();
  };

  await showPhoto();
})();
