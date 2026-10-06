// 화장 '칠하기' 방식 확인 — SNOW 같은 상용 필터가 쓰는 방식을 그대로 해 본다.
//
// 지금까지의 방식(demo.js/static.js)은 남의 화장 사진에서 화장을 '떼어내' 붙이는 것이었다.
// 그 방식은 화장뿐 아니라 그 사람의 조명·피부톤까지 딸려와 얼굴에 뿌연 막이 씌워졌다.
// 여기서는 화장을 사진이 아니라 숫자(색·진하기·번짐)로 정의하고, 얼굴 점으로 찾은
// 부위(입술·눈두덩·볼·눈썹)에 직접 칠한다. 룩 정의는 looks.json 에 있다.
//
// 칠하는 자리는 채점(③)이 쓰는 가이드 선과 같은 규칙을 쓴다(eval/golden/render_sheets.py 참고).
// 그래야 "가이드대로 칠한 얼굴"과 "채점 기준"이 어긋나지 않는다.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { LABEL, loadParser, maskToCanvas, parseFace } from "./parser.js";
import { maskFromPolys, renderMakeupLive } from "./render2.js";

const $ = (id) => document.getElementById(id);

// ── 얼굴 점 번호 (MediaPipe 468점) ──────────────────────────────────────────
const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const EYES = { R: [33, 246, 161, 160, 159, 158, 157, 173, 133], L: [263, 466, 388, 387, 386, 385, 384, 398, 362] };
const BROW = { R: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], L: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] };
const BROW_LOWER = { R: [46, 53, 52, 65, 55], L: [276, 283, 282, 295, 285] };
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
// 볼터치 자리: (광대 점, 얼굴 옆 점, 기울기 부호) — render_sheets.py 의 SIDES 와 같다
const CHEEK_SIDES = [[50, 234, -1], [280, 454, 1]];
// 피부색 기준으로 쓸 턱 주변 — 화장이 잘 닿지 않는 자리
const CHIN_PATCH = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323];

const PARTS = ["lip", "shadow", "cheek", "brow"];
const PART_KO = { lip: "입술", shadow: "눈두덩", cheek: "볼터치", brow: "눈썹" };

// ── 부위 모양 만들기 ────────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 눈두덩: 쌍꺼풀 선에서 눈썹 아래쪽으로 reach 만큼 올라간 띠 */
function shadowShape(P, side, reach) {
  const lid = EYES[side].map(P);
  const low = BROW_LOWER[side].map(P);
  const top = lid.map((p, i) => {
    const q = low[Math.min(low.length - 1, Math.round((i / (lid.length - 1)) * (low.length - 1)))];
    return [p[0] + (q[0] - p[0]) * reach, p[1] + (q[1] - p[1]) * reach];
  });
  return [...lid, ...top.reverse()];
}

/** 볼터치: 광대에서 얼굴 옆으로 조금 나간 자리에 기울어진 타원 */
function cheekShape(P, faceW, cheekIdx, faceIdx, sign) {
  const c0 = P(cheekIdx), f0 = P(faceIdx);
  const cx = c0[0] + (f0[0] - c0[0]) * 0.25, cy = c0[1] + (f0[1] - c0[1]) * 0.25;
  const rx = faceW * 0.11, ry = faceW * 0.07, t = (sign * -25 * Math.PI) / 180;
  const pts = [];
  for (let k = 0; k < 40; k++) {
    const q = (k / 40) * 2 * Math.PI;
    const x = rx * Math.cos(q), y = ry * Math.sin(q);
    pts.push([cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)]);
  }
  return pts;
}

/** 룩 한 벌이 칠할 모양들을 모두 만든다. {부위: [폴리곤, ...]} */
export function buildShapes(lm, w, h, look) {
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const faceW = dist(P(234), P(454));
  const reach = look.items.shadow?.reach ?? 0.5;
  return {
    lip: [LIPS_OUTER.map(P)],
    lipHole: [LIPS_INNER.map(P)],
    shadow: [shadowShape(P, "R", reach), shadowShape(P, "L", reach)],
    cheek: CHEEK_SIDES.map(([c, f, s]) => cheekShape(P, faceW, c, f, s)),
    brow: [BROW.R.map(P), BROW.L.map(P)],
    oval: [FACE_OVAL.map(P)],
    faceW,
  };
}

// ── 칠하기 ─────────────────────────────────────────────────────────────────
const SCALE = 0.5; // 화장 층은 절반 해상도로 그린다 (번짐 처리가 무거워서)
let lay = null;

function polyPath(c, pts) {
  c.moveTo(pts[0][0] * SCALE, pts[0][1] * SCALE);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] * SCALE, pts[i][1] * SCALE);
  c.closePath();
}

/**
 * 얼굴 사진/영상이 이미 그려진 ctx 위에 화장을 칠한다.
 * @param {CanvasRenderingContext2D} ctx 대상
 * @param {object} shapes buildShapes 결과
 * @param {object} look   looks.json 의 룩 한 벌
 * @param {number} master 전체 진하기 배수 (0~1)
 * @param {object|null} seg 분할 모델이 준 자리 {lip, brow, skin} — 없으면 얼굴 점 모양으로 칠한다
 */
export function paintMakeup(ctx, shapes, look, master = 1, seg = null) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  if (!lay || lay.width !== Math.round(w * SCALE)) {
    lay = document.createElement("canvas");
    lay.width = Math.round(w * SCALE); lay.height = Math.round(h * SCALE);
  }
  const lc = lay.getContext("2d");

  ctx.save();
  // 얼굴 바깥(머리카락·배경)으로 색이 번지지 않게 얼굴 윤곽 안쪽만 칠한다
  ctx.beginPath();
  shapes.oval[0].forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.clip();

  for (const part of PARTS) {
    const it = look.items[part];
    if (!it || it.alpha <= 0) continue;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, lay.width, lay.height);
    lc.globalCompositeOperation = "source-over";
    if (seg && seg[part]) {
      // 분할 모델이 알려준 자리 — 실제 입술·눈썹 모양을 그대로 따라간다
      lc.drawImage(seg[part], 0, 0, lay.width, lay.height);
      lc.globalCompositeOperation = "source-in";
      lc.fillStyle = it.color;
      lc.fillRect(0, 0, lay.width, lay.height);
      lc.globalCompositeOperation = "source-over";
    } else {
      // 모델이 없거나 모델이 모르는 자리(눈두덩·볼터치)는 얼굴 점으로 만든 모양을 쓴다
      lc.fillStyle = it.color;
      lc.beginPath();
      for (const poly of shapes[part]) polyPath(lc, poly);
      if (part === "lip") for (const poly of shapes.lipHole) polyPath(lc, poly); // 입 안쪽은 비운다
      lc.fill("evenodd");
      // 눈두덩·볼터치는 피부 위에만 — 모델이 준 피부 자리로 잘라내 머리카락·눈에 묻지 않게 한다
      if (seg && seg.skin && (part === "shadow" || part === "cheek")) {
        lc.globalCompositeOperation = "destination-in";
        lc.drawImage(seg.skin, 0, 0, lay.width, lay.height);
        lc.globalCompositeOperation = "source-over";
      }
    }

    ctx.globalAlpha = Math.min(1, it.alpha * master);
    // "color" 는 원본의 밝기(주름·광택·그림자)를 그대로 두고 색만 바꾼다. 상용 필터가 쓰는 방식이고,
    // "multiply"(곱하기)처럼 물감을 덧발라 평평해지지 않는다. 눈썹처럼 실제로 어두워져야 하는 곳만 곱하기.
    ctx.globalCompositeOperation = it.blend || "color";
    // blur 는 얼굴 너비 대비 비율로 적어 두었다 — 화면 크기가 달라져도 같은 느낌이 나게
    ctx.filter = `blur(${Math.max(1, it.blur * shapes.faceW * SCALE)}px)`;
    ctx.drawImage(lay, 0, 0, w, h);

    // 윤기: 아랫입술 가운데에 옅은 하이라이트를 얹는다 (립글로스가 빛을 받는 자리)
    if (part === "lip" && it.gloss > 0) {
      const pts = shapes.lip[0];
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.72;
      const rx = (Math.max(...xs) - Math.min(...xs)) * 0.18;
      const ry = (Math.max(...ys) - Math.min(...ys)) * 0.1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = it.gloss * master;
      ctx.globalCompositeOperation = "soft-light";
      ctx.filter = "none";
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-cx, -cy);
      ctx.fillStyle = g;
      ctx.fillRect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
      ctx.restore();
    }
  }
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

// ── 룩 사진에서 숫자 뽑기 ───────────────────────────────────────────────────
// 곱하기 합성은 (피부색 × 칠할색/255) 이므로, 원하는 화장색 M 과 피부색 S 에서
// 칠할 색 = M / S × 255 로 되짚으면 그 사진의 화장을 숫자로 옮길 수 있다.
function medianColor(data, w, h, polys, holes) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  c.fillStyle = "#fff";
  c.beginPath();
  for (const poly of polys) { c.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]); c.closePath(); }
  if (holes) for (const poly of holes) { c.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]); c.closePath(); }
  c.fill("evenodd");
  const mask = c.getImageData(0, 0, w, h).data;
  const ch = [[], [], []];
  for (let i = 0; i < w * h; i++) {
    if (mask[i * 4] < 128) continue;
    for (let k = 0; k < 3; k++) ch[k].push(data.data[i * 4 + k]);
  }
  if (!ch[0].length) return null;
  return ch.map((v) => { v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
}

const hex = (v) => "#" + v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

/** 화장한 얼굴 사진 한 장에서 부위별 '칠할 색'을 되짚어 룩 숫자를 만든다 */
export function extractLook(imgData, lm, w, h, base) {
  const shapes = buildShapes(lm, w, h, base);
  const P = (i) => [lm[i].x * w, lm[i].y * h];
  const skinPoly = [CHIN_PATCH.map((i) => { const p = P(i); return [p[0], p[1] - h * 0.02]; })];
  const skin = medianColor(imgData, w, h, skinPoly) || [200, 170, 160];
  const items = {};
  for (const part of PARTS) {
    const got = medianColor(imgData, w, h, shapes[part], part === "lip" ? shapes.lipHole : null);
    const src = base.items[part];
    if (!got) { items[part] = { ...src }; continue; }
    if ((src.blend || "color") === "color") {
      // "색만 바꾸기"로 칠할 자리는 사진의 색을 그대로 쓰면 된다.
      // 밝기는 어차피 쓰지 않으므로 보정이 센 사진이어도 색조·채도는 살아 있다.
      items[part] = { ...src, color: hex(got) };
    } else {
      // 곱하기로 칠할 자리(눈썹)는 (피부색 × 칠할색/255) 이므로 되짚어 계산한다
      const r = got.map((m, k) => m / Math.max(1, skin[k]));
      const mean = (r[0] + r[1] + r[2]) / 3 || 1;
      const mul = r.map((v) => 255 * (1 + (v / mean - 1) * 1.5));
      items[part] = { ...src, color: hex(mul) };
    }
  }
  return { ...base, id: base.id + "_extracted", name: base.name + " (사진에서 뽑음)", items };
}

// ── 화면 ───────────────────────────────────────────────────────────────────
const state = { looks: [], look: null, mode: "photo", live: false, photo: null, photoLm: null, on: true, seg: null, useSeg: true, busy: false };
let imgLandmarker, videoLandmarker, hasParser = false;
const setStatus = (s) => ($("status").textContent = s);

/**
 * 새 렌더링(render2.js)이 쓸 부위별 재료를 만든다.
 * 얼굴 점 모양을 마스크로 굽고, 색·진하기·번짐을 룩에서 가져온다.
 */
function partsFor(lm, w, h, look, master) {
  const shapes = buildShapes(lm, w, h, look);
  const f = shapes.faceW;
  const it = (name, polys, holes, featherRatio, extra = {}) => {
    const p = look.items[name];
    if (!p || p.alpha <= 0) return null;
    return {
      mask: maskFromPolys(polys, holes, w, h),
      color: p.color,
      alpha: Math.min(1, p.alpha * master),
      feather: Math.max(1, f * featherRatio),
      ...extra,
    };
  };
  return {
    lip: it("lip", shapes.lip, shapes.lipHole, 0.012, { gloss: look.items.lip?.gloss ?? 0 }),
    shadow: it("shadow", shapes.shadow, null, 0.05),
    cheek: it("cheek", shapes.cheek, null, 0.09),
    brow: it("brow", shapes.brow, null, 0.006),
  };
}

/** 분할 모델 결과를 부위별 '칠할 자리' 그림으로 바꾼다 */
async function makeSeg(source, lm, w, h) {
  if (!hasParser || !state.useSeg) return null;
  const parsed = await parseFace(source, lm, w, h);
  if (!parsed) return null;
  return {
    lip: maskToCanvas(parsed, LABEL.LIP, w, h),
    brow: maskToCanvas(parsed, LABEL.BROW, w, h),
    skin: maskToCanvas(parsed, LABEL.SKIN, w, h),
  };
}

async function loadImage(src) {
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = src; });
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext("2d").drawImage(img, 0, 0);
  return cv;
}

function drawPhoto() {
  if (!state.photo || !state.photoLm) return;
  const cv = $("out"), w = state.photo.width, h = state.photo.height;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.drawImage(state.photo, 0, 0);
  const seg = state.useSeg ? state.seg : null;
  const master = +$("master").value / 100;
  if (!state.on) return;
  if (state.v2) renderMakeupLive(ctx, state.photo, (mw, mh) => partsFor(state.photoLm, mw, mh, state.look, master), { scale: 1, detail: 1 });
  else paintMakeup(ctx, buildShapes(state.photoLm, w, h, state.look), state.look, master, seg);
}

let frames = 0, lastFps = performance.now();
function loop() {
  if (!state.live) return;
  const video = $("video"), cv = $("out");
  if (video.readyState >= 2) {
    if (cv.width !== video.videoWidth) { cv.width = video.videoWidth; cv.height = video.videoHeight; }
    const ctx = cv.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const res = videoLandmarker.detectForVideo(video, performance.now());
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    // 분할 모델은 매 프레임 기다리지 않는다. 뒤에서 갱신하고 가장 최근 결과를 쓴다(한 프레임 정도 늦어도 눈에 안 띈다)
    if (lm && hasParser && state.useSeg && !state.busy) {
      state.busy = true;
      makeSeg(video, lm, cv.width, cv.height)
        .then((s) => { state.seg = s; })
        .finally(() => { state.busy = false; });
    }
    const seg = state.useSeg ? state.seg : null;
    if (lm && state.on) {
      const master = +$("master").value / 100;
      if (state.v2) {
        // 새 방식 — 절반 크기로 칠하고 키워 붙인다 (원본 크기로는 초당 15장뿐)
        renderMakeupLive(ctx, video, (w, h) => partsFor(lm, w, h, state.look, master), { scale: 0.5, detail: 1 });
      } else {
        paintMakeup(ctx, buildShapes(lm, cv.width, cv.height, state.look), state.look, master, seg);
      }
    }
    if (++frames >= 30) {
      const now = performance.now();
      const how = state.v2 ? "새 방식" : hasParser && state.useSeg ? "분할 모델" : "얼굴 점";
      setStatus(`${lm ? "얼굴 추적 중" : "얼굴 미검출"} · ${how} · 초당 ${(frames / ((now - lastFps) / 1000)).toFixed(0)}장`);
      frames = 0; lastFps = now;
    }
  }
  video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
}

function renderControls() {
  $("controls").innerHTML = PARTS.map((part) => {
    const it = state.look.items[part] || { color: "#ffffff", alpha: 0, blur: 0.01 };
    return `<div class="ctl" data-part="${part}">
      <h3>${PART_KO[part]}</h3>
      <label>색 <input type="color" data-k="color" value="${it.color}"></label>
      <label>진하기 <input type="range" data-k="alpha" min="0" max="100" value="${Math.round(it.alpha * 100)}"><b>${Math.round(it.alpha * 100)}</b></label>
      <label>번짐 <input type="range" data-k="blur" min="0" max="150" value="${Math.round(it.blur * 1000)}"><b>${Math.round(it.blur * 1000)}</b></label>
    </div>`;
  }).join("");
  $("controls").oninput = (e) => {
    const part = e.target.closest(".ctl").dataset.part, k = e.target.dataset.k;
    const it = (state.look.items[part] ||= { color: "#ffffff", alpha: 0, blur: 0.01, blend: "multiply" });
    it[k] = k === "color" ? e.target.value : k === "alpha" ? e.target.value / 100 : e.target.value / 1000;
    const b = e.target.parentElement.querySelector("b");
    if (b) b.textContent = e.target.value;
    showJson();
    if (state.mode === "photo") drawPhoto();
  };
  showJson();
}

const showJson = () => ($("json").textContent = JSON.stringify(state.look.items, null, 1));

function useLook(look) {
  state.look = JSON.parse(JSON.stringify(look));
  renderControls();
  if (state.mode === "photo") drawPhoto();
}

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 720, facingMode: "user" } });
  const video = $("video");
  video.srcObject = stream;
  await video.play();
  state.mode = "live"; state.live = true;
  $("out").classList.add("mirror");
  loop();
}

(async () => {
  const cfg = await fetch("./looks.json", { cache: "no-cache" }).then((r) => r.json());
  state.looks = cfg.looks;
  $("look").innerHTML = cfg.looks.map((l, i) => `<option value="${i}">${l.name}</option>`).join("");

  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" }, numFaces: 1 };
  imgLandmarker = await FaceLandmarker.createFromOptions(vision, { ...opts, runningMode: "IMAGE" });
  videoLandmarker = await FaceLandmarker.createFromOptions(vision, { ...opts, runningMode: "VIDEO" });

  state.photo = await loadImage("./data/my_face.png");
  state.photoLm = imgLandmarker.detect(state.photo).faceLandmarks?.[0];

  // 학습한 분할 모델이 있으면 쓴다. 없으면 얼굴 점 방식으로 그대로 돈다.
  hasParser = !!(await loadParser());
  $("btnSeg").disabled = !hasParser;
  $("btnSeg").textContent = hasParser ? "분할 모델 끄기" : "분할 모델 없음";
  if (hasParser && state.photoLm) {
    state.seg = await makeSeg(state.photo, state.photoLm, state.photo.width, state.photo.height);
  }

  useLook(cfg.looks[0]);
  setStatus(
    !state.photoLm
      ? "사진에서 얼굴을 못 찾았어요"
      : hasParser
        ? "분할 모델로 찾은 자리에 칠했습니다. 켜고 꺼서 얼굴 점 방식과 비교해 보세요."
        : "얼굴 점 방식으로 칠했습니다. (분할 모델을 넣으면 경계가 정확해집니다)",
  );

  $("look").onchange = (e) => useLook(state.looks[+e.target.value]);
  $("btnCam").onclick = () => start().catch((err) => setStatus("카메라 실패: " + err.message));
  $("btnPhoto").onclick = () => {
    state.live = false; state.mode = "photo";
    $("out").classList.remove("mirror");
    drawPhoto();
  };
  $("btnToggle").onclick = (e) => {
    state.on = !state.on;
    e.target.textContent = state.on ? "화장 끄기" : "화장 켜기";
    if (state.mode === "photo") drawPhoto();
  };
  $("master").oninput = () => { $("masterVal").textContent = $("master").value + "%"; if (state.mode === "photo") drawPhoto(); };
  $("btnV2").onclick = (e) => {
    state.v2 = !state.v2;
    e.target.textContent = state.v2 ? "새 방식 끄기" : "새 방식 켜기";
    if (state.mode === "photo") drawPhoto();
  };
  $("btnSeg").onclick = (e) => {
    state.useSeg = !state.useSeg;
    e.target.textContent = state.useSeg ? "분할 모델 끄기" : "분할 모델 켜기";
    if (state.mode === "photo") drawPhoto();
  };
  $("btnExtract").onclick = async () => {
    setStatus("템플릿 사진에서 색을 뽑는 중…");
    const cv = await loadImage("./data/template_pink.png");
    const lm = imgLandmarker.detect(cv).faceLandmarks?.[0];
    if (!lm) { setStatus("템플릿에서 얼굴을 못 찾았어요"); return; }
    const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height);
    useLook(extractLook(data, lm, cv.width, cv.height, state.look));
    setStatus("템플릿 사진의 색을 숫자로 옮겼습니다. 아래 상자의 값이 그 룩입니다.");
  };
})();
