// 화면 4 실시간 테두리 POC — 라이브 프리뷰 전체 + 진행 칩 + 게이트 한 줄 + 구석 "확인받기"
import { FaceLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import {
  PART_IDS, PART_NAME, PART_ORIENT, chipText, orientationHint, evaluateGate, GATE_LIMITS, StabilityCounter, PresenceTracker, Smoother,
  cropSpec, partVisible, rectsOverlap, anglesFromMatrix, anglesFromLandmarks, createSession, setCurrent, markCaptured, nextPart, laplacianVar, rgbToL, LM,
} from './core.js';
import { buildGuide } from './guides.js';

const $ = (id) => document.getElementById(id);
const KEY = 'dhe_screen4_session';
const SAMPLE_DIR = '../../danghaeung_poc_3x4_20/';
const SAMPLES = [1, 2, 3, 4, 5].flatMap((n) => ['front_open', 'front_closed', 'left_45', 'right_45'].map((s) => `person_${n}_${s}.jpg`));

// ---------- 상태 ----------
const hash = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, v == null ? true : decodeURIComponent(v)]; }));
const S = {
  session: load() || createSession(),
  orientation: hash.orient === 'landscape' ? 'landscape' : 'portrait',
  device: !!hash.device,
  src: null,                 // { kind:'cam'|'image'|'video', el, w, h, mirror }
  face: null, hand: null, mode: null,
  smoother: new Smoother(0.5), stab: new StabilityCounter(), presence: new PresenceTracker(3000),
  limits: { ...GATE_LIMITS }, handOn: true,
  cache: { landmarks: null, matrix: null, hands: null, srcKey: null },
  last: {}, gateLog: [], frameMs: 0, fps: 0, _t: performance.now(), _n: 0,
};
if (hash.part && PART_IDS.includes(hash.part)) S.session = setCurrent(S.session, hash.part);
function save() { try { localStorage.setItem(KEY, JSON.stringify(S.session)); } catch {} }
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
let toastT; const toast = (m) => { const el = $('toast'); el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 1600); };

// ---------- 폰 방향 ----------
function applyOrientation() {
  const ph = $('phone'); ph.classList.toggle('portrait', S.orientation === 'portrait'); ph.classList.toggle('landscape', S.orientation === 'landscape');
  $('orientPortrait').classList.toggle('on', S.orientation === 'portrait'); $('orientLandscape').classList.toggle('on', S.orientation === 'landscape');
  sizeCanvas();
}
function sizeCanvas() {
  const cv = $('view'), r = $('phone').getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round((r.width - 20) * dpr); cv.height = Math.round((r.height - 20) * dpr);
  if (S.device) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
}
if (S.device) {
  document.body.classList.add('device');
  const mq = matchMedia('(orientation: landscape)'); const sync = () => { S.orientation = mq.matches ? 'landscape' : 'portrait'; applyOrientation(); };
  mq.addEventListener('change', sync); sync();
} else applyOrientation();
window.addEventListener('resize', sizeCanvas);
$('orientPortrait').onclick = () => { S.orientation = 'portrait'; applyOrientation(); };
$('orientLandscape').onclick = () => { S.orientation = 'landscape'; applyOrientation(); };

// ---------- 모델 ----------
async function loadModels() {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const face = (delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate }, runningMode: 'IMAGE', numFaces: 1, outputFacialTransformationMatrixes: true });
  const hand = (delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate }, runningMode: 'IMAGE', numHands: 2 });
  const faceP = FaceLandmarker.createFromOptions(files, face('GPU')).catch(() => FaceLandmarker.createFromOptions(files, face('CPU')));
  const handP = hash.nohand ? Promise.resolve(null) : HandLandmarker.createFromOptions(files, hand('GPU')).catch(() => HandLandmarker.createFromOptions(files, hand('CPU'))).catch(() => null);
  [S.face, S.hand] = await Promise.all([faceP, handP]);   // 얼굴·손 모델 병렬 로딩
  if (!S.hand) { S.handOn = false; $('handOn').checked = false; }
  S.mode = 'IMAGE';
}
async function setMode(mode) {
  if (S.mode === mode) return;
  await S.face.setOptions({ runningMode: mode }); if (S.hand) await S.hand.setOptions({ runningMode: mode }); S.mode = mode;
}

// ---------- 소스 ----------
async function useCamera() {
  stopSource();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const v = document.createElement('video'); v.srcObject = stream; v.playsInline = true; v.muted = true; await v.play();
  S.src = { kind: 'cam', el: v, w: v.videoWidth, h: v.videoHeight, mirror: true, stream }; await setMode('VIDEO'); resetTrack(); $('srcCam').classList.add('on');
}
async function useFile(file) {
  stopSource(); const url = URL.createObjectURL(file);
  if (file.type.startsWith('video')) { const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.playsInline = true; await v.play(); S.src = { kind: 'video', el: v, w: v.videoWidth, h: v.videoHeight, mirror: false }; await setMode('VIDEO'); }
  else await useImageUrl(url);
}
async function useImageUrl(url) {
  stopSource(); const im = new Image(); im.crossOrigin = 'anonymous'; im.src = url; await im.decode();
  S.src = { kind: 'image', el: im, w: im.naturalWidth, h: im.naturalHeight, mirror: false }; await setMode('IMAGE'); resetTrack();
}
function stopSource() { if (S.src?.stream) S.src.stream.getTracks().forEach((t) => t.stop()); S.src = null; $('srcCam').classList.remove('on'); resetTrack(); }
function resetTrack() { S.smoother.reset(); S.stab.reset(); S.cache = { landmarks: null, matrix: null, hands: null, srcKey: null }; }
$('srcCam').onclick = () => useCamera().catch((e) => toast('카메라 열기 실패: ' + e.message));
$('srcFile').onchange = (e) => e.target.files[0] && useFile(e.target.files[0]);
for (const s of SAMPLES) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('srcSample').appendChild(o); }
$('srcSample').onchange = (e) => e.target.value && useImageUrl(SAMPLE_DIR + e.target.value);

// ---------- 검출 ----------
const tiny = document.createElement('canvas'); const tctx = tiny.getContext('2d', { willReadFrequently: true });
function detect() {
  const src = S.src; if (!src) return null;
  const now = performance.now();
  if (src.kind === 'image') {
    if (S.cache.srcKey !== src.el.src) {
      const r = S.face.detect(src.el); const h = S.handOn && S.hand ? S.hand.detect(src.el) : null;
      S.cache = { srcKey: src.el.src, landmarks: r.faceLandmarks[0] || null, matrix: r.facialTransformationMatrixes?.[0]?.data || null, hands: h?.landmarks || [] };
    }
    return S.cache;
  }
  const r = S.face.detectForVideo(src.el, now); const h = S.handOn && S.hand ? S.hand.detectForVideo(src.el, now) : null;
  return { landmarks: r.faceLandmarks[0] || null, matrix: r.facialTransformationMatrixes?.[0]?.data || null, hands: h?.landmarks || [] };
}
function sharpnessOf(src, crop) {
  const w = 96, h = Math.max(8, Math.round(96 * crop.h / crop.w)); tiny.width = w; tiny.height = h;
  tctx.drawImage(src.el, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const d = tctx.getImageData(0, 0, w, h).data; const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return laplacianVar(g, w, h);
}
function foreheadLOf(src, pts) {
  const p = pts[LM.forehead], r = Math.max(4, Math.hypot(pts[LM.faceR].x - pts[LM.faceL].x, 0) * 0.04);
  tiny.width = 8; tiny.height = 8; tctx.drawImage(src.el, p.x - r, p.y - r, 2 * r, 2 * r, 0, 0, 8, 8);
  const d = tctx.getImageData(0, 0, 8, 8).data; let R = 0, G = 0, B = 0;
  for (let i = 0; i < 64; i++) { R += d[i * 4]; G += d[i * 4 + 1]; B += d[i * 4 + 2]; }
  return rgbToL(R / 64, G / 64, B / 64);
}

// ---------- 그리기 ----------
const COLOR = { line: '#3FD1C4', hi: '#FFE27A', ref: 'rgba(255,255,255,.55)' };
function drawGuide(ctx, g, s, crop) {
  const M = (p) => [(p.x - crop.x) * s, (p.y - crop.y) * s];
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of g.regions) { ctx.strokeStyle = r.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash([6, 5]); ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.closePath(); ctx.stroke(); }
  for (const l of g.polylines) {
    ctx.strokeStyle = l.style === 'ref' ? COLOR.ref : l.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash(l.style === 'dash' || l.style === 'ref' ? [6, 5] : []);
    if (l.style === 'dot') { const [x, y] = M(l.pts[0]); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke(); continue; }
    ctx.lineWidth = l.style === 'ref' ? 1 : 2; ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.stroke();
    if (l.style === 'arrow') { const [ax, ay] = M(l.pts[l.pts.length - 2]), [bx, by] = M(l.pts[l.pts.length - 1]); const a = Math.atan2(by - ay, bx - ax); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * Math.cos(a - 0.5), by - 9 * Math.sin(a - 0.5)); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * Math.cos(a + 0.5), by - 9 * Math.sin(a + 0.5)); ctx.stroke(); }
    ctx.lineWidth = 2;
  }
  ctx.setLineDash([]);
}
function drawLabels(ctx, g, s, crop, W, mirror) {
  ctx.font = `${Math.round(12 * (ctx.canvas.width / 390))}px Malgun Gothic, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (const l of g.labels) { let x = (l.anchor.x - crop.x) * s; if (mirror) x = W - x; ctx.fillText(l.text, x, (l.anchor.y - crop.y) * s); }
}

// ---------- 메인 루프 ----------
function frame() {
  requestAnimationFrame(frame);
  const cv = $('view'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, src = S.src, part = S.session.currentPart;
  const t0 = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  if (!src || !S.face || (src.kind !== 'image' && src.el.readyState < 2)) { updateUi(null, null); return; }
  if (src.kind !== 'image') { src.w = src.el.videoWidth; src.h = src.el.videoHeight; }
  const det = detect(); const raw = det?.landmarks;
  const presence = S.presence.update(!!raw, t0);
  let m = { faceDetected: !!raw, partId: part }, crop, pts;
  if (raw) {
    pts = S.smoother.smooth(raw.map((p) => ({ x: p.x * src.w, y: p.y * src.h, z: p.z })));
    crop = cropSpec(part, pts, W / H);
    // 크롭이 소스 밖으로 나가면 안쪽으로 밀어 넣기 (검은 띠 방지)
    const asp = crop.w / crop.h, ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
    if (crop.h > src.h) { crop.h = src.h; crop.w = crop.h * asp; } if (crop.w > src.w) { crop.w = src.w; crop.h = crop.w / asp; }
    crop.x = Math.min(Math.max(0, ccx - crop.w / 2), src.w - crop.w); crop.y = Math.min(Math.max(0, ccy - crop.h / 2), src.h - crop.h);
    const ang = det.matrix ? anglesFromMatrix(det.matrix) : anglesFromLandmarks(pts);
    const hands = (det.hands || []).map((h) => { const xs = h.map((p) => p.x * src.w), ys = h.map((p) => p.y * src.h); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; });
    Object.assign(m, { yaw: ang.yaw, pitch: ang.pitch, roll: ang.roll, visible: partVisible(part, pts, src.w, src.h), handOverlap: hands.some((hb) => rectsOverlap(hb, crop)), sharpness: sharpnessOf(src, crop), foreheadL: foreheadLOf(src, pts), baselineL: S.session.baselineL, hands: hands.length });
    if (S.session.baselineL == null && Math.abs(m.yaw) < 10) { S.session.baselineL = m.foreheadL; save(); }
    const preOk = evaluateGate({ ...m, stableCount: 99 }, S.limits).ok; m.stableCount = S.stab.push(preOk);
  } else { S.smoother.reset(); S.stab.reset(); crop = { x: 0, y: 0, w: src.w, h: src.h }; }
  // 크롭을 프레임에 가득 채우고(cover), 거울 모드
  const s = Math.max(W / crop.w, H / crop.h); const ox = (W - crop.w * s) / 2, oy = (H - crop.h * s) / 2;
  ctx.save(); if (src.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  ctx.translate(ox, oy); ctx.drawImage(src.el, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w * s, crop.h * s);
  let g = null;
  if (raw) { g = buildGuide(part, pts); drawGuide(ctx, g, s, crop); }
  ctx.restore();
  if (g) { ctx.save(); ctx.translate(ox, oy); drawLabels(ctx, g, s, crop, crop.w * s, src.mirror); ctx.restore(); }
  const gate = evaluateGate(m, S.limits);
  S.frameMs = performance.now() - t0; S._n++; if (t0 - S._t > 1000) { S.fps = S._n * 1000 / (t0 - S._t); S._n = 0; S._t = t0; }
  S.last = { ...m, presence, gate, crop, closed: g?.closed, srcW: src.w, srcH: src.h };
  S.gateLog.push(gate.firstFail || 'ready'); if (S.gateLog.length > 100) S.gateLog.shift();
  updateUi(gate, m);
}

// ---------- UI ----------
let uiT = 0;
function updateUi(gate, m) {
  const part = S.session.currentPart;
  const gEl = $('gate'); gEl.textContent = gate ? gate.text : ''; gEl.classList.toggle('ready', !!gate?.ok);
  $('btnCheck').disabled = !gate?.ok;
  const hint = orientationHint(part, S.orientation); $('orientHint').hidden = !hint; $('orientHint').textContent = hint || '';
  $('zoomLow').hidden = !(PART_ORIENT[part] === 'landscape' && S.orientation === 'portrait');
  if (performance.now() - uiT > 200) { uiT = performance.now(); renderChips(); renderState(); }
}
function renderChips() {
  const cur = S.session.currentPart;
  $('chips').innerHTML = S.session.parts.map((p) => `<span class="chip ${p.partId === cur ? 'current' : ''} ${p.status === 'passed' ? 'passed' : ''}" data-id="${p.partId}">${chipText(p)}</span>`).join('');
  $('chips').querySelectorAll('.chip').forEach((el) => (el.onclick = () => goPart(el.dataset.id)));
  $('partBtns').innerHTML = PART_IDS.map((id) => `<button data-id="${id}" class="${id === cur ? 'on' : ''}">${PART_NAME[id]}</button>`).join(' ');
  $('partBtns').querySelectorAll('button').forEach((el) => (el.onclick = () => goPart(el.dataset.id)));
}
function goPart(id) { S.session = setCurrent(S.session, id); S.stab.reset(); save(); renderChips(); toast(`${PART_NAME[id]} 단계 (화면 3 완성본 → 4)`); }
function renderState() {
  const l = S.last, f = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');
  $('stateOut').textContent = [
    `소스: ${S.src ? `${S.src.kind} ${S.src.w}×${S.src.h}${S.src.mirror ? ' 거울' : ''}` : '없음'} · 폰 ${S.orientation} · 부위 ${PART_NAME[S.session.currentPart]}(${PART_ORIENT[S.session.currentPart]})`,
    `얼굴: ${l.faceDetected ? '검출' : '없음'} · 자리: ${l.presence || '—'} · 프레임 ${f(S.frameMs)}ms · ${f(S.fps, 0)}fps`,
    `정면: yaw ${f(l.yaw)}° pitch ${f(l.pitch)}° roll ${f(l.roll)}° (한계 ±${S.limits.yaw}/±${S.limits.pitch})`,
    `부위 가시: ${l.visible == null ? '—' : l.visible} · 손: ${l.hands ?? '—'}개 겹침 ${l.handOverlap ?? '—'} · 눈 감음 A/B: ${l.closed ? `${l.closed.A}/${l.closed.B}` : '—'}`,
    `선명(라플라시안 분산): ${f(l.sharpness)} (≥${S.limits.sharpMin}) · 이마 L*: ${f(l.foreheadL)} 기준 ${f(S.session.baselineL)} (±${S.limits.brightTol})`,
    `안정 프레임: ${l.stableCount ?? 0}/${S.limits.stableFrames} · 게이트: ${l.gate ? (l.gate.ok ? 'READY' : l.gate.firstFail) : '—'} "${l.gate?.text ?? ''}"`,
    `크롭: ${l.crop ? `${f(l.crop.x, 0)},${f(l.crop.y, 0)} ${f(l.crop.w, 0)}×${f(l.crop.h, 0)} (확대 ${f(l.srcW && l.crop ? $('view').width / l.crop.w : null, 2)}×)` : '—'}`,
    `세션: ${S.session.parts.map((p) => `${PART_NAME[p.partId]}=${p.status}`).join(', ')}`,
  ].join('\n');
}

// ---------- 확인받기: 즉시 촬영 ----------
$('btnCheck').onclick = () => {
  if (!S.src || !S.last.crop) return;
  const fl = $('flash'); fl.hidden = false; setTimeout(() => (fl.hidden = true), 350);
  const c = S.last.crop, cv = document.createElement('canvas'); cv.width = Math.round(c.w); cv.height = Math.round(c.h); const cx = cv.getContext('2d');
  if (S.src.mirror) { cx.translate(cv.width, 0); cx.scale(-1, 1); }
  cx.drawImage(S.src.el, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  const uri = cv.toDataURL('image/jpeg', 0.85); const id = S.session.currentPart;
  S.session = markCaptured(S.session, id, uri); save(); renderCaptures();
  const nx = nextPart(S.session);
  toast(`촬영됨 → 화면 5 결과${nx ? ` → 다음: ${PART_NAME[nx]}` : ''}`);
  if (nx) setTimeout(() => goPart(nx), 1200);
  renderChips();
};
function renderCaptures() {
  $('captures').innerHTML = S.session.parts.filter((p) => p.captured).map((p) => `<figure><img src="${p.captured}" alt=""><figcaption>${PART_NAME[p.partId]} · ${p.status}</figcaption></figure>`).join('') || '<span class="muted">아직 없음</span>';
}

// ---------- 패널 ----------
$('sharpMin').onchange = (e) => (S.limits.sharpMin = Number(e.target.value));
$('brightTol').onchange = (e) => (S.limits.brightTol = Number(e.target.value));
$('handOn').onchange = (e) => { S.handOn = e.target.checked; S.cache.srcKey = null; };
$('btnBaseline').onclick = () => { if (typeof S.last.foreheadL === 'number') { S.session.baselineL = S.last.foreheadL; save(); toast('밝기 기준 저장'); } };
$('btnReset').onclick = () => { S.session = createSession(); save(); renderChips(); renderCaptures(); toast('세션 초기화'); };
document.querySelectorAll('nav .tab').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('nav .tab').forEach((x) => x.classList.remove('active')); b.classList.add('active');
  for (const t of ['input', 'state', 'verify']) $('tab' + t[0].toUpperCase() + t.slice(1)).hidden = t !== b.dataset.tab;
}));
$('btnRunTests').onclick = async () => { $('testOut').textContent = '실행 중…'; const m = await import('./tests-browser.js'); $('testOut').textContent = m.run(); };
$('btnPerf').onclick = () => ($('testOut').textContent = `한 프레임(검출+게이트+그리기): ${S.frameMs.toFixed(1)} ms · ${S.fps.toFixed(0)} fps\n손 감지 ${S.handOn ? '켬' : '끔'} · 소스 ${S.src?.kind ?? '없음'}`);
$('btnGateLog').onclick = () => { const c = {}; S.gateLog.forEach((k) => (c[k] = (c[k] || 0) + 1)); $('testOut').textContent = '최근 100프레임 게이트 첫 실패 조건:\n' + Object.entries(c).map(([k, v]) => `${k.padEnd(8)} ${v}`).join('\n') + '\n\n순서: ' + S.gateLog.slice(-30).join(' ') ; };

// ---------- 시작 ----------
(async () => {
  renderChips(); renderCaptures();
  try { await loadModels(); } catch (e) { $('loading').textContent = '모델 로딩 실패: ' + e.message; return; }
  $('loading').hidden = true;
  if (hash.src) await useImageUrl(hash.src).catch((e) => toast('사진 로드 실패'));
  else if (S.device || hash.cam) useCamera().catch(() => toast('카메라를 열 수 없어요'));
  else { $('srcSample').value = SAMPLES[1]; await useImageUrl(SAMPLE_DIR + SAMPLES[1]).catch(() => {}); }
  if (hash.verify) { document.querySelector('[data-tab=verify]').click(); $('btnRunTests').click(); }
  requestAnimationFrame(frame);
})();
