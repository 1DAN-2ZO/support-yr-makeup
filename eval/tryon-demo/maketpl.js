// 맨얼굴·화장 한 쌍에서 화장 템플릿을 만들고, 내 얼굴에 씌워 본다.
// 목적은 하나 — 뽑아낸 화장 층이 "진짜 화장 모양"인지 눈으로 확인하는 것.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { applyFromUV, bakeToUV, extractLayers } from "./template.js";
import { LABEL, loadParser, maskToCanvas, parseFace } from "./parser.js";
import { buildShapes } from "./paint.js";
import { maskFromPolys } from "./render2.js";

const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
const UV_SIZE = 512;
const state = { faceUV: null, tris: null, lmk: null, mine: null, mineLm: null, tpl: null };

async function loadImage(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return cv;
}

const show = (id, srcCanvas) => {
  const cv = $(id);
  cv.width = srcCanvas.width; cv.height = srcCanvas.height;
  cv.getContext("2d").drawImage(srcCanvas, 0, 0);
};

/** 칠할 자리 — 분할 모델이 아는 곳은 모델을, 모르는 곳(눈두덩·볼)은 얼굴 점을 쓴다 */
async function masksFor(canvas, lm, w, h, look) {
  const shapes = buildShapes(lm, w, h, look);
  const out = {
    shadow: maskFromPolys(shapes.shadow, null, w, h),
    cheek: maskFromPolys(shapes.cheek, null, w, h),
    lip: maskFromPolys(shapes.lip, shapes.lipHole, w, h),
    brow: maskFromPolys(shapes.brow, null, w, h),
  };
  const parsed = await parseFace(canvas, lm, w, h);
  if (parsed) {
    out.lip = maskToCanvas(parsed, LABEL.LIP, w, h);
    out.brow = maskToCanvas(parsed, LABEL.BROW, w, h);
  }
  return out;
}

/** 부위별 층을 한 장(색+투명도)으로 합친다 — 이게 '화장 층' 그림이다 */
function layersToCanvas(layers, w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  const img = c.createImageData(w, h);
  for (const { color, alpha } of Object.values(layers)) {
    for (let i = 0; i < w * h; i++) {
      const a = alpha[i];
      if (a <= 0.004) continue;
      const k = i * 4, prev = img.data[k + 3] / 255;
      const na = a + prev * (1 - a);
      // 겹치는 곳은 위에 오는 색이 이긴다 (알파 합성)
      img.data[k] = Math.round((color[0] * a + img.data[k] * prev * (1 - a)) / (na || 1));
      img.data[k + 1] = Math.round((color[1] * a + img.data[k + 1] * prev * (1 - a)) / (na || 1));
      img.data[k + 2] = Math.round((color[2] * a + img.data[k + 2] * prev * (1 - a)) / (na || 1));
      img.data[k + 3] = Math.round(na * 255);
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

async function build(pair) {
  setStatus("화장 층을 뽑는 중…");
  const bare = await loadImage(pair.bare);
  const make = await loadImage(pair.makeup);
  const w = bare.width, h = bare.height;
  show("cBare", bare); show("cMake", make);

  const lm = state.lmk.detect(make).faceLandmarks?.[0];
  if (!lm) { setStatus("화장 사진에서 얼굴을 못 찾았어요"); return; }
  const look = { items: { shadow: { reach: 0.6 } } };
  const masks = await masksFor(make, lm, w, h, look);

  const mkData = make.getContext("2d").getImageData(0, 0, w, h);
  const brData = bare.getContext("2d").getImageData(0, 0, w, h);
  const layers = extractLayers(mkData, brData, masks, w, h);

  // ③ 뽑아낸 층 — 검은 배경에 얹어 모양이 보이게
  const layerCv = layersToCanvas(layers, w, h);
  const view = document.createElement("canvas");
  view.width = w; view.height = h;
  const vc = view.getContext("2d");
  vc.fillStyle = "#111"; vc.fillRect(0, 0, w, h);
  vc.drawImage(layerCv, 0, 0);
  show("cLayer", view);

  // ④ 표준 얼굴 틀로 펴기 — 부위를 하나씩 구워 겹친다
  const uv = document.createElement("canvas");
  uv.width = uv.height = UV_SIZE;
  const uc = uv.getContext("2d");
  for (const { color, alpha } of Object.values(layers)) {
    uc.drawImage(bakeToUV(alpha, color, lm, state.faceUV, state.tris, w, h, UV_SIZE), 0, 0);
  }
  const uvView = document.createElement("canvas");
  uvView.width = uvView.height = UV_SIZE;
  const uvc = uvView.getContext("2d");
  uvc.fillStyle = "#111"; uvc.fillRect(0, 0, UV_SIZE, UV_SIZE);
  uvc.drawImage(uv, 0, 0);
  show("cUV", uvView);
  state.tpl = uv;

  $("colors").innerHTML = Object.entries(layers)
    .map(([n, l]) => `<span class="chip"><i style="background:rgb(${l.color.join(",")})"></i>${n} rgb(${l.color.join(", ")})</span>`)
    .join("");
  setStatus("③에 화장 모양이 보이면 제대로 뽑힌 것입니다. '내 얼굴에 씌워 보기'를 눌러 보세요.");
}

function applyToMine() {
  if (!state.tpl || !state.mineLm) return;
  const w = state.mine.width, h = state.mine.height;
  show("cMine", state.mine);
  const warped = applyFromUV(state.tpl, state.mineLm, state.faceUV, state.tris, w, h, UV_SIZE);
  const out = $("cOut");
  out.width = w; out.height = h;
  const c = out.getContext("2d");
  c.drawImage(state.mine, 0, 0);
  c.drawImage(warped, 0, 0);
  setStatus("⑥ 이 템플릿을 내 얼굴 점에 맞춰 씌운 결과입니다.");
}

(async () => {
  const [uvJson, triJson, pairs] = await Promise.all([
    fetch("../../poc/look-tryon/client/assets/face-uv.json").then((r) => r.json()),
    fetch("../../poc/look-tryon/client/assets/face-triangles.json").then((r) => r.json()),
    fetch("./data/pairs.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  state.faceUV = uvJson; state.tris = triJson;

  const usable = pairs.filter((p) => p.bare && p.makeup);
  $("pair").innerHTML = usable.map((p, i) => `<option value="${i}">${p.name}</option>`).join("");

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  state.lmk = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    numFaces: 1, runningMode: "IMAGE",
  });
  await loadParser();

  state.mine = await loadImage("./data/my_face.png");
  state.mineLm = state.lmk.detect(state.mine).faceLandmarks?.[0];

  $("pair").onchange = (e) => build(usable[+e.target.value]);
  $("apply").onclick = applyToMine;
  await build(usable[0]);
})();
