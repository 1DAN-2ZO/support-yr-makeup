// 당화응 POC — 랜드마크 기반 아이라이너 가이드 + 전후 채점
// 모드 2개: 사진(기준·확인 2장 업로드) / 카메라(5프레임 평균 캡처). 3D 메시 없음.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const zoom = $("zoom"), zctx = zoom.getContext("2d");
const video = $("video"), overlay = $("overlay"), octx = overlay.getContext("2d");
const cvBase = $("cvBase"), cvCheck = $("cvCheck");

// ---------- 랜드마크 정의 ----------
// 피험자 기준 오른쪽 눈(R) = 원본 영상의 왼쪽.
const EYES = {
  R: { upper: [133, 173, 157, 158, 159, 160, 161, 246, 33], inner: 133, outer: 33, irisC: 468, iris: [469, 470, 471, 472] },
  L: { upper: [362, 398, 384, 385, 386, 387, 388, 466, 263], inner: 362, outer: 263, irisC: 473, iris: [474, 475, 476, 477] },
};
const CHEEK = {
  R: [116, 117, 118, 101, 36, 205, 187, 123],
  L: [345, 346, 347, 330, 266, 425, 411, 352],
};
const FOREHEAD = [10, 109, 108, 151, 337, 338];
const IRIS_MM = 11.7;
const MAX_W = 1280;

// ---------- 상태 ----------
const state = {
  mode: "photo",
  landmarker: null, imageLandmarker: null,
  eye: "R",
  angle: 15, wing: 0.25, thick: 1.2, thresh: 12,
  stripCfg: null,
  // 사진 모드
  photos: { base: null, check: null }, // im 객체
  // 카메라 모드
  cam: { lm: null, mmpx: null, w: 0, h: 0, baseline: null, check: null, capturing: null, frame: null, fctx: null, started: false },
  result: null,
};

// im 객체: { w, h, lm, mmpx, img(ImageData), src(CanvasImageSource) }

// ---------- 유틸 ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const px = (im, i) => [im.lm[i].x * im.w, im.lm[i].y * im.h];

function rgb2lab(r, g, b) {
  const f = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function sampleLab(img, x, y) {
  const xi = clamp(Math.round(x), 0, img.width - 1), yi = clamp(Math.round(y), 0, img.height - 1);
  const o = (yi * img.width + xi) * 4;
  return rgb2lab(img.data[o], img.data[o + 1], img.data[o + 2]);
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function setStatus(t, cls = "") { statusEl.textContent = t; statusEl.className = "status " + cls; }

// ---------- 기하 ----------
function irisScale(im) {
  const r = EYES.R, l = EYES.L;
  const dR = Math.max(dist(px(im, r.iris[0]), px(im, r.iris[2])), dist(px(im, r.iris[1]), px(im, r.iris[3])));
  const dL = Math.max(dist(px(im, l.iris[0]), px(im, l.iris[2])), dist(px(im, l.iris[1]), px(im, l.iris[3])));
  const d = (dR + dL) / 2;
  return d > 2 ? IRIS_MM / d : null;
}
function guideFor(im, eyeKey) {
  const e = EYES[eyeKey];
  const pts = e.upper.map((i) => px(im, i));
  const inner = px(im, e.inner), outer = px(im, e.outer), irisC = px(im, e.irisC);
  const eyeW = dist(inner, outer);
  const dx = outer[0] - inner[0], dy = outer[1] - inner[1];
  const a = Math.atan2(dy, dx), sign = Math.sign(dx) || 1;
  const a2 = a - sign * (state.angle * Math.PI / 180);
  const wingLen = eyeW * state.wing;
  const wingEnd = [outer[0] + Math.cos(a2) * wingLen, outer[1] + Math.sin(a2) * wingLen];
  const poly = [...pts, wingEnd];
  const N = 80, cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + dist(poly[i - 1], poly[i]));
  const total = cum[cum.length - 1], lidLen = cum[pts.length - 1];
  const samples = [];
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * total;
    let i = 1; while (i < cum.length - 1 && cum[i] < t) i++;
    const s0 = cum[i - 1], s1 = cum[i], u = s1 > s0 ? (t - s0) / (s1 - s0) : 0;
    const p = [poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * u, poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * u];
    let tx = poly[i][0] - poly[i - 1][0], ty = poly[i][1] - poly[i - 1][1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx;
    if ((p[0] - irisC[0]) * nx + (p[1] - irisC[1]) * ny < 0) { nx = -nx; ny = -ny; }
    samples.push({ p, n: [nx, ny], t, isWing: t > lidLen, tFromCorner: t - lidLen });
  }
  return { samples, total, lidLen, wingLen, eyeW, outer, inner, irisC };
}
// 오프셋 격자: 기준의 척도로 고정(mm 단위로 정의하고 이미지별 mmpx로 px 환산)
const OFF_RANGE_MM = 3.0, OFF_STEP_MM = 0.25;
function offsetsMm() {
  const offs = [];
  for (let d = -OFF_RANGE_MM; d <= OFF_RANGE_MM + 1e-6; d += OFF_STEP_MM) offs.push(+d.toFixed(3));
  return offs;
}
const OFFS = offsetsMm();

function sampleStrip(im, eyeKey) {
  const g = guideFor(im, eyeKey);
  const mmpx = im.mmpx || 0.1;
  const centerShift = (state.thick / 2) / mmpx;
  const lab = [];
  for (const s of g.samples) {
    const row = [];
    for (const dmm of OFFS) {
      const d = dmm / mmpx;
      row.push(sampleLab(im.img, s.p[0] + s.n[0] * (d + centerShift), s.p[1] + s.n[1] * (d + centerShift)));
    }
    lab.push(row);
  }
  return { lab, meta: { isWing: g.samples.map((s) => s.isWing), tFromCornerMm: g.samples.map((s) => s.tFromCorner * mmpx), wingLenMm: g.wingLen * mmpx, eyeW: g.eyeW } };
}
function samplePoly(im, idxs) {
  const poly = idxs.map((i) => px(im, i));
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  let L = 0, A = 0, B = 0, n = 0;
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    if (!pointInPoly(x, y, poly)) continue;
    const l = sampleLab(im.img, x, y); L += l[0]; A += l[1]; B += l[2]; n++;
  }
  return n ? [L / n, A / n, B / n] : [0, 0, 0];
}
function snapshot(im) {
  return {
    strips: { R: sampleStrip(im, "R"), L: sampleStrip(im, "L") },
    cheek: { R: samplePoly(im, CHEEK.R), L: samplePoly(im, CHEEK.L) },
    fore: samplePoly(im, FOREHEAD),
    mmpx: im.mmpx, frames: 1,
  };
}

// ---------- 채점 ----------
function score(base, cur) {
  const lightRatio = base.fore[0] / Math.max(1, cur.fore[0]);
  const corr = (lab) => [lab[0] * lightRatio, lab[1], lab[2]];
  const halfBand = state.thick / 2;
  const perEye = {};
  for (const k of ["R", "L"]) {
    const b = base.strips[k].lab, c = cur.strips[k].lab, meta = cur.strips[k].meta;
    const N = Math.min(b.length, c.length), M = OFFS.length;
    const de = [];
    let bandSum = 0, bandN = 0, bandHit = 0, outHit = 0, outN = 0, wingDrawn = 0;
    const thick = [];
    for (let i = 0; i < N; i++) {
      const row = []; let drawnW = 0;
      for (let j = 0; j < M; j++) {
        const d = dE(b[i][j], corr(c[i][j])); row.push(d);
        const inBand = Math.abs(OFFS[j]) <= halfBand, hit = d >= state.thresh;
        if (inBand) { bandSum += d; bandN++; if (hit) bandHit++; }
        else if (Math.abs(OFFS[j]) > halfBand + 0.3) { outN++; if (hit) outHit++; }
        if (hit) drawnW += OFF_STEP_MM;
      }
      de.push(row);
      if (drawnW > 0) thick.push(drawnW);
      if (meta.isWing[i] && drawnW >= 0.4) wingDrawn = Math.max(wingDrawn, meta.tFromCornerMm[i]);
    }
    thick.sort((a, b) => a - b);
    perEye[k] = {
      de, coverage: bandN ? bandHit / bandN : 0, overflow: outN ? outHit / outN : 0,
      thicknessMm: thick.length ? thick[Math.floor(thick.length / 2)] : 0,
      wingGuideMm: meta.wingLenMm, wingDrawnMm: wingDrawn,
      index: clamp((bandN ? bandSum / bandN : 0) / 30 * 100, 0, 100),
    };
  }
  const e = perEye[state.eye];
  const wingDelta = e.wingDrawnMm - e.wingGuideMm;
  let s = 100;
  s -= (1 - e.coverage) * 50;
  s -= clamp(e.overflow * 60, 0, 30);
  s -= clamp(Math.abs(wingDelta) * 8, 0, 20);
  s -= clamp(Math.abs(e.thicknessMm - state.thick) * 5, 0, 10);
  const cheek = {};
  for (const k of ["R", "L"]) {
    const d = dE(base.cheek[k], corr(cur.cheek[k]));
    const toneCur = (cur.cheek[k][0] - cur.fore[0]) * lightRatio, toneBase = base.cheek[k][0] - base.fore[0];
    cheek[k] = { index: clamp(d / 20 * 100, 0, 100), dL: toneCur - toneBase };
  }
  const eyeWRatio = cur.strips.R.meta.eyeW / Math.max(1, base.strips.R.meta.eyeW);
  return { perEye, cheek, score: Math.round(clamp(s, 0, 100)), wingDelta, lightShift: cur.fore[0] - base.fore[0], mmpxBase: base.mmpx, mmpxCur: cur.mmpx, frames: cur.frames, eyeWRatio };
}

function render() {
  const r = state.result; if (!r) { $("results").hidden = true; return; }
  const e = r.perEye[state.eye];
  $("results").hidden = false;
  $("score").textContent = r.score;
  const v = $("verdict");
  v.className = "pill " + (r.score >= 85 ? "ok" : r.score >= 60 ? "warn" : "bad");
  v.textContent = r.score >= 85 ? "통과" : r.score >= 60 ? "재시도 권장" : "재시도";
  $("coverage").textContent = `${Math.round(e.coverage * 100)}%`;
  $("thickness").textContent = `${e.thicknessMm.toFixed(1)}mm (가이드 ${state.thick.toFixed(1)})`;
  const wd = r.wingDelta;
  $("wingDelta").textContent = `${wd >= 0 ? "+" : ""}${wd.toFixed(1)}mm (그림 ${e.wingDrawnMm.toFixed(1)} / 가이드 ${e.wingGuideMm.toFixed(1)})`;
  $("overflow").textContent = `${Math.round(e.overflow * 100)}%`;
  $("lrIndex").textContent = `오른쪽 ${Math.round(r.perEye.R.index)} / 왼쪽 ${Math.round(r.perEye.L.index)}`;
  const msgs = [];
  if (e.coverage < 0.6) msgs.push("가이드 밴드가 절반 이상 비어 있어요. 눈꺼풀 라인을 따라 끊기지 않게 그리세요.");
  if (e.overflow > 0.25) msgs.push("밴드 바깥으로 번진 부분이 있어요. 경계를 정리하세요.");
  if (Math.abs(wd) >= 1) msgs.push(wd > 0 ? `꼬리가 가이드보다 약 ${wd.toFixed(1)}mm 길어요.` : `꼬리가 가이드보다 약 ${(-wd).toFixed(1)}mm 짧아요.`);
  if (Math.abs(e.thicknessMm - state.thick) >= 0.6) msgs.push(e.thicknessMm > state.thick ? "선이 가이드보다 두꺼워요." : "선이 가이드보다 얇아요.");
  if (!msgs.length) msgs.push("가이드와 잘 맞아요.");
  if (Math.abs(r.lightShift) > 8) msgs.push("이마 밝기가 기준 대비 크게 바뀌었어요. 수치 신뢰도가 낮습니다.");
  if (Math.abs(r.eyeWRatio - 1) > 0.15) msgs.push("두 사진의 얼굴 크기·각도 차이가 커서 샘플링이 어긋났을 수 있어요.");
  $("diag").textContent = msgs.join(" ");
  const cR = r.cheek.R, cL = r.cheek.L;
  $("cheekIdx").textContent = `왼쪽 ${Math.round(cL.index)} / 오른쪽 ${Math.round(cR.index)}`;
  $("cheekTone").textContent = `왼쪽 ${cL.dL.toFixed(1)} / 오른쪽 ${cR.dL.toFixed(1)}`;
  const tv = (c) => {
    if (c.index < 15) return "발림 미확인";
    const tone = -c.dL / 4;
    if (tone >= 1 && tone <= 2) return `적당 (약 ${tone.toFixed(1)}톤 어두움)`;
    if (tone > 2) return `너무 어두움 (약 ${tone.toFixed(1)}톤)`;
    if (tone > 0) return `더 진하게 (약 ${tone.toFixed(1)}톤)`;
    return "밝아짐 (블러셔·하이라이트 성격)";
  };
  $("cheekVerdict").textContent = `왼쪽: ${tv(cL)} · 오른쪽: ${tv(cR)}`;
  $("lightShift").textContent = `ΔL* ${r.lightShift >= 0 ? "+" : ""}${r.lightShift.toFixed(1)} ${Math.abs(r.lightShift) > 8 ? "(경고)" : "(안정)"}`;
  $("mmpx").textContent = `${r.mmpxBase ? r.mmpxBase.toFixed(3) : "—"} / ${r.mmpxCur ? r.mmpxCur.toFixed(3) : "—"}`;
  $("poseDiff").textContent = r.eyeWRatio.toFixed(2);
}

// ---------- 그리기 ----------
function drawPoly(ctx, pts, close, style) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
  if (style.fillStyle) { ctx.fillStyle = style.fillStyle; ctx.fill(); }
  ctx.strokeStyle = style.strokeStyle; ctx.lineWidth = style.lineWidth; ctx.stroke();
}
function drawGuide(ctx, im, g, scale = 1) {
  const mmpx = im.mmpx || 0.1, half = (state.thick / 2) / mmpx, shift = half;
  const at = (s, d) => [s.p[0] + s.n[0] * d, s.p[1] + s.n[1] * d];
  const up = g.samples.map((s) => at(s, shift + half)), dn = g.samples.map((s) => at(s, shift - half));
  ctx.beginPath();
  up.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  for (let i = dn.length - 1; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
  ctx.closePath(); ctx.fillStyle = "rgba(42,140,133,0.18)"; ctx.fill();
  ctx.setLineDash([6 / scale, 5 / scale]);
  drawPoly(ctx, g.samples.map((s) => at(s, shift)), false, { strokeStyle: "#2A8C85", lineWidth: 2.5 / scale });
  ctx.setLineDash([]);
}
function drawAnnotations(ctx, im, scale = 1, heat = null) {
  drawPoly(ctx, FOREHEAD.map((i) => px(im, i)), true, { strokeStyle: "rgba(122,116,108,0.7)", lineWidth: 1 / scale, fillStyle: "rgba(255,255,255,0.08)" });
  for (const k of ["R", "L"]) drawPoly(ctx, CHEEK[k].map((i) => px(im, i)), true, { strokeStyle: "rgba(194,115,31,0.8)", lineWidth: 1 / scale, fillStyle: "rgba(194,115,31,0.10)" });
  for (const k of ["R", "L"]) {
    ctx.globalAlpha = k === state.eye ? 1 : 0.45;
    drawGuide(ctx, im, guideFor(im, k), scale);
    ctx.globalAlpha = 1;
  }
  if (heat) drawHeat(ctx, im, scale, heat);
}
function drawHeat(ctx, im, scale, perEye) {
  const mmpx = im.mmpx || 0.1, shift = (state.thick / 2) / mmpx, half = state.thick / 2;
  for (const k of ["R", "L"]) {
    const e = perEye[k]; if (!e) continue;
    const g = guideFor(im, k);
    for (let i = 0; i < g.samples.length; i += 1) {
      const s = g.samples[i];
      for (let j = 0; j < OFFS.length; j += 1) {
        const d = e.de[i]?.[j]; if (d == null || d < state.thresh) continue;
        const dp = OFFS[j] / mmpx;
        ctx.beginPath(); ctx.arc(s.p[0] + s.n[0] * (dp + shift), s.p[1] + s.n[1] * (dp + shift), 1.4 / scale, 0, Math.PI * 2);
        ctx.fillStyle = Math.abs(OFFS[j]) <= half ? "rgba(43,38,34,0.9)" : "rgba(184,67,47,0.9)";
        ctx.fill();
      }
    }
  }
}
function drawZoom(im, mirrored, heat) {
  const zw = zoom.width, zh = zoom.height;
  zctx.setTransform(1, 0, 0, 1, 0, 0);
  zctx.fillStyle = "#E8DED3"; zctx.fillRect(0, 0, zw, zh);
  if (!im || !im.lm) return;
  const g = guideFor(im, state.eye);
  const cx = (g.inner[0] + g.outer[0]) / 2 + (g.outer[0] - g.inner[0]) * 0.15;
  const cy = (g.inner[1] + g.outer[1]) / 2 - g.eyeW * 0.1;
  const sw = g.eyeW * 2.2, sh = sw * (zh / zw), sx = cx - sw / 2, sy = cy - sh / 2, scale = zw / sw;
  zctx.save();
  if (mirrored) { zctx.translate(zw, 0); zctx.scale(-1, 1); }
  zctx.drawImage(im.src, sx, sy, sw, sh, 0, 0, zw, zh);
  zctx.scale(scale, scale); zctx.translate(-sx, -sy);
  drawGuide(zctx, im, g, scale);
  if (heat) drawHeat(zctx, im, scale, heat);
  zctx.restore();
  $("scaleLabel").textContent = im.mmpx ? `척도 ${im.mmpx.toFixed(3)} mm/px` : "척도: 홍채 미검출";
}

// ---------- 사진 모드 ----------
async function loadPhoto(file, which) {
  const url = URL.createObjectURL(file);
  const imgEl = new Image();
  await new Promise((res, rej) => { imgEl.onload = res; imgEl.onerror = rej; imgEl.src = url; });
  const scale = Math.min(1, MAX_W / imgEl.naturalWidth);
  const w = Math.round(imgEl.naturalWidth * scale), h = Math.round(imgEl.naturalHeight * scale);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(imgEl, 0, 0, w, h);
  URL.revokeObjectURL(url);
  const res = state.imageLandmarker.detect(cv);
  const lm = res.faceLandmarks && res.faceLandmarks[0];
  const im = { w, h, lm: lm || null, src: cv, img: cx.getImageData(0, 0, w, h), mmpx: null };
  if (lm) im.mmpx = irisScale(im);
  state.photos[which] = im;
  $(which === "base" ? "infoBase" : "infoCheck").textContent = lm ? `${w}×${h} · 얼굴 검출 · 척도 ${im.mmpx ? im.mmpx.toFixed(3) + " mm/px" : "미검출"}` : `${w}×${h} · 얼굴을 찾지 못함`;
  rescorePhotos();
}
function drawPhotoPanel(cv, im, heat) {
  const ctx = cv.getContext("2d");
  if (!im) { cv.width = 640; cv.height = 480; ctx.fillStyle = "#E8DED3"; ctx.fillRect(0, 0, 640, 480); return; }
  cv.width = im.w; cv.height = im.h;
  ctx.drawImage(im.src, 0, 0);
  if (im.lm) drawAnnotations(ctx, im, 1, heat);
}
function rescorePhotos() {
  const b = state.photos.base, c = state.photos.check;
  state.result = null;
  if (b?.lm && c?.lm) {
    state.result = score(snapshot(b), snapshot(c));
    setStatus("채점 완료 (슬라이더를 바꾸면 즉시 재채점)", "ok");
  } else if (b || c) {
    setStatus(b?.lm === null || c?.lm === null ? "얼굴을 찾지 못한 사진이 있습니다. 정면·밝은 사진으로 바꿔 주세요" : "두 장을 모두 올리면 채점합니다");
  }
  drawPhotoPanel(cvBase, b, null);
  drawPhotoPanel(cvCheck, c, state.result ? state.result.perEye : null);
  drawZoom(c || b, false, state.result ? state.result.perEye : null);
  render();
}

// ---------- 카메라 모드 ----------
async function startCamera() {
  const cam = state.cam;
  if (cam.started) return;
  if (!navigator.mediaDevices?.getUserMedia) { setStatus("이 주소에서는 카메라 API를 쓸 수 없습니다. http://localhost:8000 으로 여세요", "err"); return; }
  const attempts = [
    { video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }, audio: false },
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ];
  let stream = null, lastErr = null;
  for (const c of attempts) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { lastErr = e; } }
  if (!stream) {
    const name = lastErr?.name || "";
    const hint = name === "NotAllowedError" ? "브라우저 권한 차단. 주소창 자물쇠 → 카메라 허용 후 새로고침. 윈도우 설정 → 개인정보 → 카메라 → 데스크톱 앱 접근도 확인." :
      name === "NotFoundError" ? "카메라 장치 없음." :
      name === "NotReadableError" ? "다른 프로그램이 카메라 사용 중. 닫고 새로고침." : "";
    setStatus(`카메라를 열 수 없습니다 [${name}] ${lastErr?.message || ""} ${hint}`, "err"); return;
  }
  video.srcObject = stream;
  if (!video.videoWidth) await new Promise((r) => (video.onloadedmetadata = r));
  await video.play();
  cam.w = overlay.width = video.videoWidth; cam.h = overlay.height = video.videoHeight;
  cam.frame = document.createElement("canvas"); cam.frame.width = cam.w; cam.frame.height = cam.h;
  cam.fctx = cam.frame.getContext("2d", { willReadFrequently: true });
  cam.started = true;
  $("camInfo").textContent = `${cam.w}×${cam.h}`;
  setStatus("카메라 준비 완료. 정면을 보고 기준을 저장하세요", "ok");
}
let lastT = -1;
function camLoop() {
  const cam = state.cam;
  if (state.mode !== "cam") { cam.loopRunning = false; return; }
  cam.loopRunning = true;
  if (state.landmarker && video.readyState >= 2) {
    const now = performance.now();
    if (now !== lastT) {
      lastT = now;
      const res = state.landmarker.detectForVideo(video, now);
      cam.lm = res.faceLandmarks && res.faceLandmarks[0] ? res.faceLandmarks[0] : null;
    }
    const im = { w: cam.w, h: cam.h, lm: cam.lm, src: video, img: null, mmpx: null };
    if (cam.lm) im.mmpx = irisScale(im);
    octx.clearRect(0, 0, cam.w, cam.h);
    if (cam.lm) drawAnnotations(octx, im, 1, null);
    drawZoom(cam.lm ? im : null, true, state.result ? state.result.perEye : null);
    if (cam.capturing && cam.lm) {
      cam.fctx.drawImage(video, 0, 0, cam.w, cam.h);
      im.img = cam.fctx.getImageData(0, 0, cam.w, cam.h);
      accumulate(snapshot(im));
    }
  }
  requestAnimationFrame(camLoop);
}
function accumulate(snap) {
  const cap = state.cam.capturing;
  if (!cap.acc) cap.acc = snap;
  else {
    for (const k of ["R", "L"]) {
      const a = cap.acc.strips[k].lab, b = snap.strips[k].lab;
      for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) for (let c = 0; c < 3; c++) a[i][j][c] += b[i][j][c];
      for (let c = 0; c < 3; c++) cap.acc.cheek[k][c] += snap.cheek[k][c];
    }
    for (let c = 0; c < 3; c++) cap.acc.fore[c] += snap.fore[c];
  }
  cap.n++;
  if (cap.n >= cap.target) {
    const n = cap.n;
    for (const k of ["R", "L"]) {
      const a = cap.acc.strips[k].lab;
      for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) for (let c = 0; c < 3; c++) a[i][j][c] /= n;
      for (let c = 0; c < 3; c++) cap.acc.cheek[k][c] /= n;
    }
    for (let c = 0; c < 3; c++) cap.acc.fore[c] /= n;
    cap.acc.frames = n;
    if (cap.kind === "base") { state.cam.baseline = cap.acc; state.cam.check = null; state.result = null; $("btnCheck").disabled = false; setStatus("기준 저장 완료. 화장 후 '확인'을 누르세요", "ok"); render(); }
    else { state.cam.check = cap.acc; state.result = score(state.cam.baseline, cap.acc); render(); setStatus("확인 완료", "ok"); }
    state.cam.capturing = null;
  }
}
function startCapture(kind) {
  if (!state.cam.lm) { setStatus("얼굴이 감지되지 않습니다", "err"); return; }
  state.cam.capturing = { kind, n: 0, target: 5, acc: null };
  setStatus(`${kind === "base" ? "기준" : "확인"} 촬영 중… 정면을 유지하세요`);
}

// ---------- 모드 ----------
function setMode(m) {
  state.mode = m; state.result = null;
  $("modePhoto").classList.toggle("active", m === "photo");
  $("modeCam").classList.toggle("active", m === "cam");
  $("photoStage").hidden = m !== "photo";
  $("camStage").hidden = m !== "cam";
  $("zoomLabel").textContent = `확대: ${state.eye === "R" ? "오른쪽" : "왼쪽"} 눈 · ${m === "photo" ? "화장 후 사진" : "카메라(거울)"}`;
  if (m === "photo") rescorePhotos();
  else { render(); startCamera().then(() => { if (state.cam.started && !state.cam.loopRunning) requestAnimationFrame(camLoop); }); }
}
function setEye(k) {
  state.eye = k;
  $("eyeR").classList.toggle("active", k === "R"); $("eyeL").classList.toggle("active", k === "L");
  $("zoomLabel").textContent = `확대: ${k === "R" ? "오른쪽" : "왼쪽"} 눈 · ${state.mode === "photo" ? "화장 후 사진" : "카메라(거울)"}`;
  onParamChange();
}
function onParamChange() {
  if (state.mode === "photo") rescorePhotos();
  else if (state.cam.baseline && state.cam.check) { state.result = score(state.cam.baseline, state.cam.check); render(); }
}

// ---------- 초기화 ----------
async function init() {
  try {
    setStatus("모델 로딩 중…");
    const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const opts = (mode, delegate) => ({
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
      runningMode: mode, numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
    try { state.imageLandmarker = await FaceLandmarker.createFromOptions(files, opts("IMAGE", "GPU")); }
    catch { state.imageLandmarker = await FaceLandmarker.createFromOptions(files, opts("IMAGE", "CPU")); }
    try { state.landmarker = await FaceLandmarker.createFromOptions(files, opts("VIDEO", "GPU")); }
    catch { state.landmarker = await FaceLandmarker.createFromOptions(files, opts("VIDEO", "CPU")); }
    setStatus("준비 완료. 맨얼굴 사진과 화장 후 사진을 올리세요", "ok");
  } catch (e) {
    setStatus("모델 로딩 실패: " + e.message, "err"); return;
  }
  setMode("photo");
}

// ---------- UI ----------
$("modePhoto").onclick = () => setMode("photo");
$("modeCam").onclick = () => setMode("cam");
$("fileBase").onchange = (e) => e.target.files[0] && loadPhoto(e.target.files[0], "base");
$("fileCheck").onchange = (e) => e.target.files[0] && loadPhoto(e.target.files[0], "check");
$("eyeR").onclick = () => setEye("R");
$("eyeL").onclick = () => setEye("L");
const bind = (id, key, fmt, conv = (v) => v) => { const el = $(id); el.oninput = () => { state[key] = conv(parseFloat(el.value)); $(id + "Val").textContent = fmt(parseFloat(el.value)); onParamChange(); }; };
bind("angle", "angle", (v) => v.toFixed(0));
bind("wing", "wing", (v) => v.toFixed(0), (v) => v / 100);
bind("thick", "thick", (v) => v.toFixed(1));
bind("thresh", "thresh", (v) => v.toFixed(0));
$("btnBase").onclick = () => startCapture("base");
$("btnCheck").onclick = () => state.cam.baseline && startCapture("check");
$("btnReset").onclick = () => {
  state.photos = { base: null, check: null }; state.cam.baseline = null; state.cam.check = null; state.result = null;
  $("fileBase").value = ""; $("fileCheck").value = ""; $("infoBase").textContent = "—"; $("infoCheck").textContent = "—";
  $("btnCheck").disabled = true; setMode(state.mode); setStatus("초기화됨");
};

init();
