// 지금 방식(paint.js) 과 새 방식(render2.js) 을 같은 얼굴·같은 룩으로 나란히 그린다.
// 사진 한 장으로만 비교한다 — 렌더링 품질만 보려고 추적·떨림 변수를 뺐다.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { buildShapes, paintMakeup } from "./paint.js";
import { maskFromPolys, renderMakeup } from "./render2.js";
import { LABEL, loadParser, maskToCanvas, parseFace } from "./parser.js";

const $ = (id) => document.getElementById(id);
const setStatus = (s) => ($("status").textContent = s);
const state = { photo: null, lm: null, look: null, looks: [], seg: null, zoom: null };

async function loadImage(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return cv;
}

/** 새 방식이 쓸 부위별 재료 — 분할 모델이 있으면 그 마스크를, 없으면 얼굴 점 모양을 쓴다 */
function buildParts(shapes, look, w, h, master) {
  const feather = +$("feather").value;
  const gloss = +$("gloss").value / 100;
  const mask = (key, polys, holes) =>
    state.seg?.[key] ?? maskFromPolys(polys, holes, w, h);
  const item = (name, m, extra = {}) => {
    const it = look.items[name];
    if (!it) return null;
    return { mask: m, color: it.color, alpha: Math.min(1, it.alpha * master), feather, ...extra };
  };
  return {
    lip: item("lip", mask("lip", shapes.lip, shapes.lipHole), { gloss }),
    shadow: item("shadow", maskFromPolys(shapes.shadow, null, w, h), { feather: feather * 1.4 }),
    cheek: item("cheek", maskFromPolys(shapes.cheek, null, w, h), { feather: feather * 2.2 }),
    brow: item("brow", mask("brow", shapes.brow, null), { feather: feather * 0.5 }),
  };
}

function draw() {
  if (!state.photo || !state.lm) return;
  const w = state.photo.width, h = state.photo.height;
  const master = +$("master").value / 100;
  const shapes = buildShapes(state.lm, w, h, state.look);

  const z = state.zoom;
  const setup = (id) => {
    const cv = $(id);
    if (z) { cv.width = z.w; cv.height = z.h; } else { cv.width = w; cv.height = h; }
    return cv.getContext("2d");
  };
  // 세 칸 모두 원본 크기로 그린 뒤, 마지막에 확대 영역만 잘라 보여 준다
  const full = (fn) => {
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    fn(tmp.getContext("2d", { willReadFrequently: true }), tmp);
    return tmp;
  };

  const a = full((c) => c.drawImage(state.photo, 0, 0));
  const b = full((c) => {
    c.drawImage(state.photo, 0, 0);
    paintMakeup(c, shapes, state.look, master, state.seg);
  });
  const cImg = full((c, tmp) => {
    c.drawImage(state.photo, 0, 0);
    const parts = buildParts(shapes, state.look, w, h, master);
    renderMakeup(c, state.photo, parts, { detail: +$("detail").value / 100, lumKeep: +$("keep").value / 100 });
    void tmp;
  });

  for (const [id, srcCv] of [["c0", a], ["c1", b], ["c2", cImg]]) {
    const ctx = setup(id);
    if (z) ctx.drawImage(srcCv, z.x, z.y, z.w, z.h, 0, 0, z.w, z.h);
    else ctx.drawImage(srcCv, 0, 0);
  }
}

/** 얼굴 점으로 확대할 자리를 잡는다 */
function zoomTo(kind) {
  if (!state.lm) return;
  const w = state.photo.width, h = state.photo.height;
  if (kind === "full") { state.zoom = null; draw(); return; }
  const idx = kind === "lip" ? [61, 291, 0, 17] : [33, 263, 70, 300, 159, 386];
  const xs = idx.map((i) => state.lm[i].x * w), ys = idx.map((i) => state.lm[i].y * h);
  const pad = (Math.max(...xs) - Math.min(...xs)) * 0.45;
  const x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad);
  const x1 = Math.min(w, Math.max(...xs) + pad), y1 = Math.min(h, Math.max(...ys) + pad);
  state.zoom = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  draw();
}

(async () => {
  const cfg = await fetch("./looks.json", { cache: "no-cache" }).then((r) => r.json());
  state.looks = cfg.looks;
  state.look = JSON.parse(JSON.stringify(cfg.looks[0]));
  $("look").innerHTML = cfg.looks.map((l, i) => `<option value="${i}">${l.name}</option>`).join("");

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const lmk = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    numFaces: 1, runningMode: "IMAGE",
  });

  state.photo = await loadImage("./data/my_face.png");
  state.lm = lmk.detect(state.photo).faceLandmarks?.[0];
  if (!state.lm) { setStatus("사진에서 얼굴을 못 찾았어요"); return; }

  // 분할 모델이 있으면 입술·눈썹 경계를 그것으로 쓴다
  if (await loadParser()) {
    const parsed = await parseFace(state.photo, state.lm, state.photo.width, state.photo.height);
    if (parsed) {
      state.seg = {
        lip: maskToCanvas(parsed, LABEL.LIP, state.photo.width, state.photo.height),
        brow: maskToCanvas(parsed, LABEL.BROW, state.photo.width, state.photo.height),
        skin: maskToCanvas(parsed, LABEL.SKIN, state.photo.width, state.photo.height),
      };
    }
  }
  setStatus(state.seg ? "분할 모델로 경계를 잡았습니다. ②와 ③을 비교해 보세요." : "얼굴 점으로 경계를 잡았습니다.");

  $("look").onchange = (e) => { state.look = JSON.parse(JSON.stringify(state.looks[+e.target.value])); draw(); };
  for (const [id, fmt] of [["keep", (v) => (v / 100).toFixed(2)], ["detail", (v) => (v / 100).toFixed(2)], ["feather", (v) => v], ["gloss", (v) => (v / 100).toFixed(2)], ["master", (v) => v + "%"]]) {
    $(id).oninput = () => { $(id + "V").textContent = fmt(+$(id).value); draw(); };
  }
  $("zoomLip").onclick = () => zoomTo("lip");
  $("zoomEye").onclick = () => zoomTo("eye");
  $("zoomFull").onclick = () => zoomTo("full");
  draw();
})();
