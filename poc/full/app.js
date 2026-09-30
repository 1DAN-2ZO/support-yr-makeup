// 당화응 전체 POC — 화면 1(동의·촬영) → 2(룩) → 2-b → [3 완성본 → 4 실시간 테두리 → 5 결과] × 6부위 → 6 전체 리뷰
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { SCREENS, SCREEN_NAME, PART_ORDER, SHOTS, SERVER_SHOTS, shotGate, nextShot, createSession, setCurrentPart, applyResult, applySkip, nextPart, allDone, toReviewParts, stripImages } from './lib/flow.js';
import { LOOKS, lookById, estimateFaceShape, CONTOUR_PRODUCTS, LOOK_PART_ORDER } from './lib/looks.js';
import { PART_NAME, PART_ORIENT, STATUS_LABEL, chipText, orientationHint, evaluateGate, GATE_LIMITS, StabilityCounter, PresenceTracker, Smoother, partVisible, anglesFromLandmarks, laplacianVar, rgbToL } from './lib/gate.js';
import { LM, cropSpec } from './lib/landmarks.js';
import { buildGuide, eyeClosed } from './lib/guides.js';
import { prepare, sampleAll } from './lib/sampling.js';
import { synthesize, synthesizeLook, DEFAULTS, PRESETS } from './lib/synth.js';
import { PARAMS as SP, compareLinerEye, linerResult, compareRegion, browResult, compareLip, intensityIndex, intensityResult, lightCorr, decide, oneLiner, alignToBaseline, makeupBiasPx, dE } from './lib/score.js';
import { computeSummary, oneLiner as reviewLine } from './lib/review.js';
import { contourOutline as s3Outline, cropSpec as s3Crop } from './lib/screen3-core.js';     // 브랜치 poc/screen3 (soyoon)
import { CONTOUR_RULES, FACE_SHAPE_NAME } from './lib/screen3-rules.js';
import { buildRegions, drawTryOn, generateViaGradio } from './lib/tryon.js';                  // 브랜치 poc/screen2 (firefox1234123)
import { meanLabPoly } from './lib/sampling.js';

const $ = (id) => document.getElementById(id);
const KEY = 'dhe_full_session';
// 샘플 폴더: 한 벌로 합침 (#88) — 업스케일본 1080×1440 이 poc/samples/phone-portraits-20/ 에 있다
let SAMPLE_DIR = '../samples/phone-portraits-20/';
async function resolveSampleDir() {
  return SAMPLE_DIR;
}
const hash = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, v == null ? true : decodeURIComponent(v)]; }));

// ---------- 상태 ----------
const S = {
  session: createSession(), orientation: hash.orient === 'landscape' ? 'landscape' : 'portrait', device: !!hash.device,
  src: null,                       // { kind:'cam'|'sample', el(video)|null, stream, sample:n }
  faceImg: null, faceVid: null,
  baseline: null,                  // { canvas, lm(px), im, foreheadL, mm, w, h }
  look: null, fullRender: null, thumbs: {}, contourRender: null,
  captured: null, lastFrame: null, result: null,
  synthOn: true, synthPreset: 'good',
  live: { smoother: new Smoother(0.5), stab: new StabilityCounter(), presence: new PresenceTracker(3000), last: {}, loopOn: false, cache: null, hold: null },
  perf: {}, auto: false,
};
function save() { try { localStorage.setItem(KEY, JSON.stringify(stripImages(S.session))); } catch {} }
function clearSaved() { try { localStorage.removeItem(KEY); } catch {} }
let toastT; const toast = (m) => { const el = $('toast'); el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 1700); };
const flash = () => { const f = $('flash'); f.hidden = false; setTimeout(() => (f.hidden = true), 350); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timed = (k, fn) => { const t0 = performance.now(); const v = fn(); S.perf[k] = performance.now() - t0; return v; };

// ---------- 폰 방향 ----------
function applyOrientation() {
  const ph = $('phone'); ph.classList.toggle('portrait', S.orientation === 'portrait'); ph.classList.toggle('landscape', S.orientation === 'landscape');
  $('orientPortrait').classList.toggle('on', S.orientation === 'portrait'); $('orientLandscape').classList.toggle('on', S.orientation === 'landscape');
  render();
}
if (S.device) { document.body.classList.add('device'); const mq = matchMedia('(orientation: landscape)'); const sync = () => { S.orientation = mq.matches ? 'landscape' : 'portrait'; applyOrientation(); }; mq.addEventListener('change', sync); S.orientation = mq.matches ? 'landscape' : 'portrait'; }
$('orientPortrait').onclick = () => { S.orientation = 'portrait'; applyOrientation(); };
$('orientLandscape').onclick = () => { S.orientation = 'landscape'; applyOrientation(); };
$('orientHint').onclick = () => { if (!S.device) { S.orientation = S.orientation === 'portrait' ? 'landscape' : 'portrait'; applyOrientation(); } };

// ---------- 모델 ----------
async function loadModels() {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (mode, delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate }, runningMode: mode, numFaces: 1 });
  const mk = (mode) => FaceLandmarker.createFromOptions(files, opts(mode, 'GPU')).catch(() => FaceLandmarker.createFromOptions(files, opts(mode, 'CPU')));
  [S.faceImg, S.faceVid] = await Promise.all([mk('IMAGE'), mk('VIDEO')]);
}
function detectImage(source, w, h) { const r = S.faceImg.detect(source); const lm = r.faceLandmarks[0]; return lm ? lm.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z })) : null; }

// ---------- 소스 ----------
async function useCamera() {
  stopSource();
  S.synthOn = false; $('synthOn').checked = false;   // 카메라 = 실제 화장 채점. 새로고침하면 기본값(켜짐)으로 돌아가므로 여기서 매번 끈다
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const v = document.createElement('video'); v.srcObject = stream; v.playsInline = true; v.muted = true; await v.play();
  S.src = { kind: 'cam', el: v, stream, mirror: true }; $('srcCam').classList.add('on'); $('srcSample').value = ''; resetTrack(); render();
}
function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('이미지 로드 실패')); im.src = url; }); }
function toCanvas(img, maxW = 1080) { const w = Math.min(maxW, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); return cv; }
async function useSample(n) {
  stopSource(); S.src = { kind: 'sample', sample: n, mirror: false, el: null }; $('srcSample').value = String(n);
  S.synthOn = true; $('synthOn').checked = true;   // 샘플은 맨얼굴이라 가상 화장이 있어야 채점이 된다
  const shots = {}; for (const s of SHOTS) shots[s.id] = { canvas: toCanvas(await loadImage(`${SAMPLE_DIR}person_${n}_${s.id}.jpg`)) };
  S.src.shots = shots; S.src.el = shots.front_open.canvas; resetTrack(); render();
}
function stopSource() { if (S.src?.stream) S.src.stream.getTracks().forEach((t) => t.stop()); S.src = null; $('srcCam').classList.remove('on'); }
function resetTrack() { S.live.smoother.reset(); S.live.stab.reset(); S.live.cache = null; S.live.hold = null; }
for (let n = 1; n <= 5; n++) { const o = document.createElement('option'); o.value = n; o.textContent = `person_${n} (4장)`; $('srcSample').appendChild(o); }
$('srcCam').onclick = () => useCamera().catch((e) => toast('카메라 열기 실패: ' + e.message));
$('srcSample').onchange = (e) => e.target.value && useSample(Number(e.target.value));

// ---------- 화면 전환 ----------
function go(screen) { S.session.screen = screen; S.live.loopOn = false; S.tryOn = false; save(); render(); renderPanel(); }
function currentPart() { return S.session.currentPart; }
function chipsHtml() {
  return `<div class="chips">${S.session.parts.map((p) => `<span class="chip ${p.partId === currentPart() ? 'current' : ''} ${p.status === 'passed' ? 'done' : ''}" data-id="${p.partId}">${chipText(p)}</span>`).join('')}</div>`;
}
function wireChips(root) { root.querySelectorAll('.chip').forEach((el) => (el.onclick = () => { S.session = setCurrentPart(S.session, el.dataset.id); go('guide'); toast(`${PART_NAME[el.dataset.id]} 단계 (완성본부터)`); })); }
function orientationCheck(part) {
  const hint = part ? orientationHint(part, S.orientation) : null; const el = $('orientHint'); el.hidden = !hint; el.textContent = hint ? hint + (S.device ? '' : ' (탭하면 돌아감)') : ''; return !hint;
}

function render() {
  const root = $('screen'); root.className = 'screen'; $('orientHint').hidden = true; S.live.loopOn = false;
  const sc = S.session.screen;
  ({ consent: rConsent, denied: rDenied, capture: rCapture, processing: rProcessing, looks: rLooks, fullrender: rFullRender, guide: rGuide, live: rLive, result: rResult, review: rReview, done: rDone })[sc](root);
  renderState();
}

// ---------- 1. 동의 ----------
function rConsent(root) {
  root.innerHTML = `<div class="pad"><div class="spacer"></div><div class="title">당화응</div>
    <div class="sub">한 부위씩 그리고, 확인받고, 다음으로. 시작하려면 맨얼굴 사진 4장을 찍어요.</div>
    <div class="card"><b>서버 처리 동의</b><div class="sub" style="margin-top:6px">정면·왼쪽·오른쪽 사진 3장을 서버로 보내 얼굴 표면(법선)과 화장 미리보기를 만듭니다. 눈 감은 사진은 폰에만 둡니다. 모든 사진은 이 세션이 끝나면 지워집니다.</div></div>
    <div class="btns"><button class="primary" id="agree">동의하고 시작</button><button class="ghost" id="deny">동의하지 않음</button></div><div class="spacer"></div></div>`;
  $('agree').onclick = () => { S.session.consent = true; go('capture'); };
  $('deny').onclick = () => go('denied');
}
function rDenied(root) {
  root.innerHTML = `<div class="pad"><div class="spacer"></div><div class="title">이용할 수 없어요</div><div class="sub">서버 처리에 동의하지 않으면 당화응을 쓸 수 없어요. 폰에서만 처리하는 방식은 아직 없어요.</div><div class="btns"><button id="back">돌아가기</button></div><div class="spacer"></div></div>`;
  $('back').onclick = () => go('consent');
}

// ---------- 1. 촬영 4장 ----------
function rCapture(root) {
  root.classList.add('dark');
  const shots = S.session.shots;
  if (S.src?.kind === 'sample') {
    for (const s of SHOTS) if (!shots[s.id]) shots[s.id] = S.src.shots[s.id];
  }
  root.innerHTML = `<div class="live"><canvas id="view"></canvas><div class="gate" id="gate"></div><div class="shots" id="shotsBar"></div><button id="btnServer" class="check" hidden>보내기</button></div>`;
  renderShots();
  if (S.src?.kind === 'cam') startLoop('capture'); else drawStill(S.src?.el, null);
  if (!S.src) $('gate').textContent = '소스를 고르세요 (패널: 카메라 또는 샘플)';
}
function renderShots() {
  const shots = S.session.shots, cur = nextShot(shots);
  $('shotsBar').innerHTML = SHOTS.map((s) => `<div class="shot ${s.id === cur ? 'cur' : ''}" data-id="${s.id}">${shots[s.id] ? `<img src="${thumbUrl(shots[s.id].canvas)}" alt=""><button class="redo" data-id="${s.id}">다시</button>` : ''}<span>${s.name}</span></div>`).join('');
  $('shotsBar').querySelectorAll('.redo').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); delete S.session.shots[b.dataset.id]; S.live.stab.reset(); renderShots(); }));
  const done = !cur; $('btnServer').hidden = !done;
  if (done) { $('gate').textContent = '4장 완료'; $('gate').classList.add('ready'); $('btnServer').onclick = () => go('processing'); }
}
const thumbCache = new WeakMap();
function thumbUrl(cv) { if (!thumbCache.has(cv)) { const t = document.createElement('canvas'); t.width = 90; t.height = 120; t.getContext('2d').drawImage(cv, 0, 0, 90, 120); thumbCache.set(cv, t.toDataURL('image/jpeg', 0.7)); } return thumbCache.get(cv); }

// ---------- 서버 처리(시뮬레이션) ----------
async function rProcessing(root) {
  root.innerHTML = `<div class="pad"><div class="spacer"></div><div class="title">서버에서 처리 중</div><div class="sub" id="procMsg">정면·왼쪽·오른쪽 3장을 보내 얼굴 표면을 정밀화하고 있어요…</div><div class="spacer"></div></div>`;
  await sleep(50);
  const bare = S.session.shots.front_open.canvas, w = bare.width, h = bare.height;
  const lm = timed('baseline_landmarks', () => detectImage(bare, w, h));
  if (!lm) { $('procMsg').textContent = '정면 사진에서 얼굴을 찾지 못했어요. 정면 사진만 다시 찍어 주세요'; delete S.session.shots.front_open; await sleep(1200); go('capture'); return; }
  const im = prepare(bare, lm.map((p) => ({ x: p.x / w, y: p.y / h, z: p.z })), w, h);
  S.baseline = { canvas: bare, lm: im.lm, im, unit: im.unit, w, h, foreheadL: foreheadLOfCanvas(bare, im.lm), pose: anglesFromLandmarks(im.lm) };   // pose: 확인받기 게이트의 각도 차 기준
  S.session.baseline = { foreheadL: S.baseline.foreheadL, unit: S.baseline.unit }; S.session.faceShape = estimateFaceShape(im.lm).label;
  S.thumbs = {}; S.fullRender = null;
  await sleep(S.auto ? 50 : 900);
  go('looks'); buildThumbs();
}
function foreheadLOfCanvas(cv, lm) {
  const p = lm[LM.forehead], r = Math.max(4, Math.hypot(lm[LM.faceR].x - lm[LM.faceL].x, 0) * 0.04); const t = document.createElement('canvas'); t.width = 8; t.height = 8;
  const c = t.getContext('2d', { willReadFrequently: true }); c.drawImage(cv, p.x - r, p.y - r, 2 * r, 2 * r, 0, 0, 8, 8); const d = c.getImageData(0, 0, 8, 8).data; let R = 0, G = 0, B = 0;
  for (let i = 0; i < 64; i++) { R += d[i * 4]; G += d[i * 4 + 1]; B += d[i * 4 + 2]; } return rgbToL(R / 64, G / 64, B / 64);
}
async function buildThumbs() {
  const b = S.baseline; if (!b) return;
  const tw = 270, th = Math.round(b.h * tw / b.w); const small = document.createElement('canvas'); small.width = tw; small.height = th; small.getContext('2d').drawImage(b.canvas, 0, 0, tw, th);
  const lmS = b.lm.map((p) => ({ x: p.x * tw / b.w, y: p.y * th / b.w * (b.w / b.h) * (b.h / b.w), z: p.z }));   // 비율 동일
  const t0 = performance.now();
  for (const look of LOOKS) {
    if (S.thumbs[look.id]) continue;
    S.thumbs[look.id] = synthesizeLook(small, b.lm.map((p) => ({ x: p.x * tw / b.w, y: p.y * tw / b.w, z: p.z })), look.parts, tw, th, false);
    if (S.session.screen === 'looks') renderLookGrid();
    await sleep(S.auto ? 0 : 120);   // "로딩 중" → 하나씩 채워지는 느낌
  }
  S.perf.thumbs10 = performance.now() - t0;
}

// ---------- 2. 룩 ----------
function rLooks(root) {
  const sel = S.session.lookId || null;
  root.innerHTML = `<div class="pad"><div class="title">어떤 룩으로 할까요</div><div class="lookgrid" id="lookGrid"></div><div id="lookDetail"></div></div>`;
  renderLookGrid(); renderLookDetail();
  if (!Object.keys(S.thumbs).length) buildThumbs();
}
function allLooks() { return S.serverLook ? [...LOOKS, S.serverLook] : LOOKS; }
function renderLookGrid() {
  const g = $('lookGrid'); if (!g) return; const sel = S.session.lookId;
  g.innerHTML = allLooks().map((l) => `<div class="look ${l.id === sel ? 'sel' : ''}" data-id="${l.id}">${S.thumbs[l.id] ? `<img src="${S.thumbs[l.id].toDataURL('image/jpeg', 0.75)}" alt="">` : '<div class="ld">로딩 중</div>'}<div class="nm">${l.name}</div></div>`).join('');
  g.querySelectorAll('.look').forEach((el) => (el.onclick = () => { if (!S.thumbs[el.dataset.id]) return; S.session.lookId = el.dataset.id; save(); renderLookGrid(); renderLookDetail(); }));
}
function renderLookDetail() {
  const d = $('lookDetail'); if (!d) return; const look = S.session.lookId ? (S.session.lookId === 'server' ? S.serverLook : lookById(S.session.lookId)) : null;
  if (!look) { d.innerHTML = `<div class="sub">룩을 누르면 미리보기와 쓰이는 제품이 보여요</div>`; return; }
  d.innerHTML = `<div class="preview">${S.src?.kind === 'cam' ? '<canvas id="tryon"></canvas>' : S.thumbs[look.id] ? `<img src="${S.thumbs[look.id].toDataURL('image/jpeg', 0.8)}" alt="">` : '<div class="ld">로딩 중</div>'}</div>
    <div class="card"><b>이 룩에 쓰인 것</b><ul class="products">${look.products.map((p) => `<li>${p}</li>`).join('')}</ul></div>
    <div class="btns"><button class="primary" id="startLook">이 룩으로 시작</button></div>`;
  if (S.src?.kind === 'cam') startTryOn(look);
  $('startLook').onclick = () => {
    S.tryOn = false; S.look = look; const b = S.baseline;
    S.fullRender = look.id === 'server' ? look.render : timed('fullRender', () => synthesizeLook(b.canvas, b.lm, look.parts, b.w, b.h, false));
    S.contourRender = null; go('fullrender');
  };
}
/** 화면 2 실시간 미리보기(카메라일 때): 룩 렌더의 부위를 라이브 얼굴에 워핑 (poc/screen2 방식) */
function startTryOn(look) {
  const b = S.baseline; const render = look.id === 'server' ? look.render : synthesizeLook(b.canvas, b.lm, look.parts, b.w, b.h, false);
  const lookImg = { img: render, regions: buildRegions(toNorm(look.id === 'server' ? look.lm : b.lm, render.width, render.height), render.width, render.height) };
  S.tryOn = true; const video = S.src.el;
  const loop = () => {
    if (!S.tryOn || S.session.screen !== 'looks') return; requestAnimationFrame(loop);
    const cv = $('tryon'); if (!cv || video.readyState < 2) return;
    if (cv.width !== video.videoWidth) { cv.width = video.videoWidth; cv.height = video.videoHeight; }
    const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(video, 0, 0);
    const r = S.faceVid.detectForVideo(video, performance.now()); const lm = r.faceLandmarks[0]; if (lm) drawTryOn(ctx, lookImg, lm, cv.width, cv.height, 0.85);
  };
  requestAnimationFrame(loop);
}
/** 서버 화장 전이(Stable-Makeup Gradio). 참조 사진 1장으로 "서버 생성 룩"을 만들어 룩 목록에 추가 */
async function generateServerLook() {
  const b = S.baseline, ref = $('refFile').files[0], st = $('serverStatus'); if (!b || !ref) { st.textContent = '촬영(기준)과 참조 사진이 필요해요'; return; }
  st.textContent = '서버에서 생성 중… (fp16 10 step, 약 3초)';
  try {
    const { img, info, ms } = await generateViaGradio(b.canvas, ref, { url: $('gradioUrl').value || undefined });
    const render = document.createElement('canvas'); render.width = b.w; render.height = b.h; render.getContext('2d').drawImage(img, 0, 0, b.w, b.h);
    const lm = detectImage(render, b.w, b.h); if (!lm) throw new Error('생성 이미지에서 얼굴을 찾지 못함');
    S.perf.server_look = ms;
    S.serverLook = { id: 'server', name: '서버 생성 룩', render, lm, parts: LOOKS[0].parts, products: ['참조 사진에서 서버가 만든 룩 (제품 목록 없음)'], rationale: LOOKS[0].rationale };
    S.thumbs.server = render; S.session.lookId = 'server'; save(); st.textContent = `생성 완료 ${(ms / 1000).toFixed(1)}초 ${info || ''}`;
    if (S.session.screen === 'looks') { renderLookGrid(); renderLookDetail(); }
  } catch (e) { st.textContent = '생성 실패: ' + e.message + ' (Gradio 서버 확인)'; }
}
function rFullRender(root) {
  root.innerHTML = `<div class="pad"><div class="title">전체 완성 예상</div><div class="preview" id="fr"></div><div class="btns"><button class="primary" id="start">시작</button></div></div>`;
  const img = document.createElement('img'); img.src = S.fullRender.toDataURL('image/jpeg', 0.85); $('fr').appendChild(img);
  $('start').onclick = () => { S.session = setCurrentPart(S.session, 'brow'); go('guide'); };
}

// ---------- 공통: 사진 크롭 + 테두리 ----------
const toNorm = (pts, w, h) => pts.map((p) => ({ x: p.x / w, y: p.y / h, z: p.z || 0 }));
const polyObj = (poly) => poly.map(([x, y]) => ({ x, y }));
/** 부위 가이드. 쉐딩·하이라이트는 화면 3 POC의 얼굴형 규칙 5종(contourOutline)으로, 나머지는 guides.js */
function guideFor(part, pts, w, h) {
  if (part !== 'contour') return buildGuide(part, pts);
  const o = s3Outline(toNorm(pts, w, h), { w, h }, S.session.faceShape || 'oval');
  return { partId: 'contour', polylines: [], labels: o.labels.map((l) => ({ text: l.text, anchor: { x: l.anchor[0], y: l.anchor[1] } })),
    regions: [...o.shading.map((poly) => ({ pts: polyObj(poly), style: 'outline-only' })), ...o.highlight.map((poly) => ({ pts: polyObj(poly), style: 'outline-only', kind: 'highlight' }))] };
}
/** 쉐딩·하이라이트 강도 샘플: 규칙 폴리곤을 좌·우로 묶어 평균 Lab + 링 참조(1.8배 확대 폴리곤 근사) */
function sampleContourS3(im) {
  const g = guideFor('contour', im.lm, im.w, im.h), cx = (im.lm[LM.faceL].x + im.lm[LM.faceR].x) / 2;
  const fore = meanLabPoly(im, [10, 103, 67, 109, 338, 297, 332].map((i) => im.lm[i]));
  const out = { fore, R: { n: 0, part: [0, 0, 0], ring: [0, 0, 0] }, L: { n: 0, part: [0, 0, 0], ring: [0, 0, 0] } };
  const scale = (poly, k) => { const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 }); return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })); };
  for (const r of g.regions) {
    if (r.kind === 'highlight' || r.pts.length < 3) continue;
    const c = r.pts.reduce((a, p) => a + p.x, 0) / r.pts.length, side = c < cx ? 'R' : 'L', part = meanLabPoly(im, r.pts), ring = meanLabPoly(im, scale(r.pts, 1.8));
    const o = out[side]; o.n++; for (let i = 0; i < 3; i++) { o.part[i] += part[i]; o.ring[i] += ring[i]; }
  }
  for (const k of ['R', 'L']) { const o = out[k]; if (o.n) { o.part = o.part.map((v) => v / o.n); o.ring = o.ring.map((v) => v / o.n); } else { o.part = fore; o.ring = fore; } }
  return out;
}
const COLOR = { line: '#3FD1C4', hi: '#FFE27A', ref: 'rgba(255,255,255,.55)' };
function clampCrop(crop, srcW, srcH) {
  // 소스를 넘는 축만 자른다. 비율은 깨질 수 있고, 그리기는 contain 이라 여백(검은 띠)으로 흡수된다.
  // (웹캠은 가로 16:9 라 세로 부위 박스가 높이에 먼저 걸린다 — 폭까지 같이 줄이면 볼·쉐딩이 잘린다. 폰 세로 카메라에선 비율이 맞아 띠가 없다)
  const ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
  crop.clamped = crop.h > srcH || crop.w > srcW;   // 잘렸으면 비율이 깨진다 → 그리기에서 contain
  if (crop.h > srcH) crop.h = srcH; if (crop.w > srcW) crop.w = srcW;
  crop.x = Math.min(Math.max(0, ccx - crop.w / 2), srcW - crop.w); crop.y = Math.min(Math.max(0, ccy - crop.h / 2), srcH - crop.h); return crop;
}
function fitCrop(part, pts, W, H, srcW, srcH) { return clampCrop(cropSpec(part, pts, W / H), srcW, srcH); }

// 라이브 크롭 안정화 (문서 3-5 "확대 화면이 흔들림" 대응 — 가이드 기하는 한 번 만들고 프레임마다 강체 변환만).
// 크기: 부위에 들어온 첫 프레임에 잠근다. 폰은 거울 앞에 놓여 있어 세션 중 거리가 거의 안 변한다. 눈 사이 거리가 목표값에서
//       CROP_RESCALE 이상 벗어날 때(실제로 다가가거나 멀어짐)만 새 목표로 잡고 미끄러지며 갱신한다. 밴드가 목표를 따라 움직이므로
//       래칫이 없고, 게이트 한계(±15°)의 원근 축소 3.4% 나 깜빡임·입·웃음의 변화는 밴드 안이라 확대율에 닿지 않는다.
// 위치: 부위별 강체 점을 EMA 로 따라간다. 부위와 같이 움직이는 점이어야 고개를 돌려도 부위가 화면 가운데에 남는다.
//       입술 = 입꼬리 중점(입을 벌려도 거의 안 움직임), 볼 = 광대 중점, 쉐딩 = 미간·광대·입꼬리 평균(턱 제외), 눈 단계 = cropSpec 중심(눈 끝).
const CROP_POS_EMA = 0.25, CROP_RESCALE = 0.20, CROP_SLIDE = 0.15;
const ALIGN_RESIDUAL_MAX = 0.05;   // 기준 얼굴 정합 잔차 허용치: 눈 사이 거리의 5% (실기기에서 정할 가정값)
function partAnchor(part, pts, raw) {
  const mean = (ids) => ({ x: ids.reduce((a, i) => a + pts[i].x, 0) / ids.length, y: ids.reduce((a, i) => a + pts[i].y, 0) / ids.length });
  if (part === 'lip') return mean([61, 291]);
  if (part === 'cheek') return mean([LM.cheekA, LM.cheekB]);
  if (part === 'contour') return mean([LM.glabella, LM.cheekA, LM.cheekB, 61, 291]);
  return { x: raw.x + raw.w / 2, y: raw.y + raw.h / 2 };
}
function stabilizeCrop(part, raw, pts) {
  const A = pts[LM.eyeA.outer], B = pts[LM.eyeB.outer], eyeD = Math.hypot(B.x - A.x, B.y - A.y);
  const an = partAnchor(part, pts, raw), cx = raw.x + raw.w / 2, cy = raw.y + raw.h / 2, aspect = raw.w / raw.h, h = S.live.hold;
  if (!h || h.part !== part || Math.abs(aspect - h.aspect) > 0.01) {
    S.live.hold = { part, aspect, w0: raw.w, eyeD0: eyeD, targetEyeD: eyeD, curEyeD: eyeD, offX: cx - an.x, offY: cy - an.y, ax: an.x, ay: an.y };
    return { ...raw };
  }
  if (Math.abs(eyeD / h.targetEyeD - 1) > CROP_RESCALE) h.targetEyeD = eyeD;             // 밴드 밖 → 새 목표 (밴드도 같이 이동)
  h.curEyeD += (h.targetEyeD - h.curEyeD) * CROP_SLIDE;                                    // 목표까지 완전히 수렴 → 잔여 없음
  h.ax += (an.x - h.ax) * CROP_POS_EMA; h.ay += (an.y - h.ay) * CROP_POS_EMA;
  const k = h.curEyeD / h.eyeD0, w = h.w0 * k, hh = w / h.aspect;
  return { x: h.ax + h.offX * k - w / 2, y: h.ay + h.offY * k - hh / 2, w, h: hh };
}
function drawGuideOn(ctx, g, M, dpr, { arrows = true, labels = true, mirrorW = null } = {}) {
  ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of g.regions) { ctx.strokeStyle = r.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.closePath(); ctx.stroke(); }
  for (const l of g.polylines) {
    if (!arrows && (l.style === 'arrow' || l.style === 'dot')) continue;
    ctx.strokeStyle = l.style === 'ref' ? COLOR.ref : l.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash(l.style === 'dash' || l.style === 'ref' ? [6 * dpr, 5 * dpr] : []); ctx.lineWidth = (l.style === 'ref' ? 1 : 2) * dpr;
    if (l.style === 'dot') { const [x, y] = M(l.pts[0]); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(x, y, 3.5 * dpr, 0, Math.PI * 2); ctx.stroke(); continue; }
    ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.stroke();
    if (l.style === 'arrow') { const [ax, ay] = M(l.pts[l.pts.length - 2]), [bx, by] = M(l.pts[l.pts.length - 1]); const a = Math.atan2(by - ay, bx - ax); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * dpr * Math.cos(a - 0.5), by - 9 * dpr * Math.sin(a - 0.5)); ctx.moveTo(bx, by); ctx.lineTo(bx - 9 * dpr * Math.cos(a + 0.5), by - 9 * dpr * Math.sin(a + 0.5)); ctx.stroke(); }
  }
  ctx.setLineDash([]);
  if (labels) { ctx.font = `${12 * dpr}px Malgun Gothic, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)'; for (const l of g.labels) { let [x, y] = M(l.anchor); if (mirrorW != null) x = mirrorW - x; ctx.fillText(l.text, x, y); } }
}
/** 정지 사진(완성본·결과)을 부위로 줌해서 그리고 테두리를 얹는다 */
function drawStillPart(cv, source, pts, part, { arrows, labels }) {
  const box = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  const crop = fitCrop(part, pts, W, H, source.width, source.height);
  const s = crop.clamped ? Math.min(W / crop.w, H / crop.h) : Math.max(W / crop.w, H / crop.h), ox = (W - crop.w * s) / 2, oy = (H - crop.h * s) / 2;
  // 카메라 소스면 라이브와 같은 거울 방향으로 그린다 (사진·테두리는 뒤집고, 라벨 글자는 바로 읽히게 따로)
  const mirror = !!S.src?.mirror, g = guideFor(part, pts, source.width, source.height), M = (p) => [(p.x - crop.x) * s, (p.y - crop.y) * s];
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); ctx.save(); if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); } ctx.translate(ox, oy);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w * s, crop.h * s);
  drawGuideOn(ctx, g, M, dpr, { arrows, labels: false });
  ctx.restore();
  if (labels && g.labels.length) { ctx.save(); ctx.translate(ox, oy); drawGuideOn(ctx, { regions: [], polylines: [], labels: g.labels }, M, dpr, { mirrorW: mirror ? crop.w * s : null }); ctx.restore(); }
}
function drawStill(source, part) {
  const cv = $('view'); if (!cv || !source) return; const box = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); const ctx = cv.getContext('2d');
  const s = Math.max(cv.width / source.width, cv.height / source.height); ctx.drawImage(source, (cv.width - source.width * s) / 2, (cv.height - source.height * s) / 2, source.width * s, source.height * s);
}

// ---------- 3. 완성본 ----------
function rGuide(root) {
  const part = currentPart(), look = S.look, b = S.baseline, landscape = PART_ORIENT[part] === 'landscape';
  root.classList.toggle('split', landscape);
  const rationale = part === 'contour' ? (CONTOUR_RULES[S.session.faceShape] || CONTOUR_RULES.oval).rationale : look.rationale[part];
  try { S.lastCrop = s3Crop(toNorm(b.lm, b.w, b.h), { w: b.w, h: b.h }, part); } catch { S.lastCrop = null; }   // 화면 3 POC 크롭 진단(covered·clamped·zoom)
  const products = part === 'contour' ? CONTOUR_PRODUCTS : [look.products[LOOK_PART_ORDER.indexOf(part)]];
  root.innerHTML = `<div class="photo"><canvas id="view"></canvas>${chipsHtml()}</div>
    <div class="pad"><span class="tag">완성본</span><div class="title">${PART_NAME[part]}</div><div class="line">${rationale}</div>
    <div class="sub">지금 필요한 것: ${products.join(' + ')}</div><div class="spacer"></div><div class="btns"><button class="primary" id="draw">그리러 가기</button></div></div>`;
  wireChips(root);
  drawStillPart($('view'), S.fullRender, b.lm, part, { arrows: true, labels: part === 'contour' });   // 쉐딩은 렌더링에 없음 → 렌더링 위에 규칙 테두리만
  orientationCheck(part);
  $('draw').onclick = () => go('live');
}

// ---------- 4. 실시간 테두리 ----------
function rLive(root) {
  root.classList.add('dark'); const part = currentPart();
  root.innerHTML = `<div class="live"><canvas id="view"></canvas>${chipsHtml()}<div class="gate" id="gate"></div><div class="zoomlow" id="zoomLow" hidden>확대 낮음</div><div class="zoomlow" id="synthBadge" style="top:40px;background:rgba(194,115,31,.85)" hidden>가상 화장 켜짐 — 실제 화장이 아닌 합성을 채점합니다</div><button id="btnCheck" class="check" disabled>확인받기</button></div>`;
  wireChips(root); orientationCheck(part);
  $('btnCheck').onclick = captureForResult;
  startLoop('live');
}
const tiny = document.createElement('canvas'); const tctx = tiny.getContext('2d', { willReadFrequently: true });
function sharpnessOf(src, crop) {
  const w = 96, h = Math.max(8, Math.round(96 * crop.h / crop.w)); tiny.width = w; tiny.height = h; tctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const d = tctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return laplacianVar(g, w, h);
}
function srcDims() { const el = S.src.el; return S.src.kind === 'cam' ? [el.videoWidth, el.videoHeight] : [el.width, el.height]; }
function detectLive() {
  const el = S.src.el;
  if (S.src.kind === 'cam') { const r = S.faceVid.detectForVideo(el, performance.now()); return r.faceLandmarks[0] || null; }
  if (!S.live.cache) { const r = S.faceImg.detect(el); S.live.cache = { lm: r.faceLandmarks[0] || null }; }
  return S.live.cache.lm;
}
function startLoop(mode) {
  S.live.loopOn = true; S.live.stab.reset(); const screen = S.session.screen;
  const frame = () => {
    if (!S.live.loopOn || S.session.screen !== screen) return; requestAnimationFrame(frame);
    const cv = $('view'); if (!cv || !S.src || !S.faceVid) return;
    if (S.src.kind === 'cam' && S.src.el.readyState < 2) return;
    const t0 = performance.now(); const box = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(box.width * dpr)) { cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); }
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), [sw, sh] = srcDims();
    const raw = detectLive(); const presence = S.live.presence.update(!!raw, t0);
    let pts = null, m = { faceDetected: !!raw }, crop = { x: 0, y: 0, w: sw, h: sh }, g = null;
    if (raw) {
      pts = S.live.smoother.smooth(raw.map((p) => ({ x: p.x * sw, y: p.y * sh, z: p.z })));
      const ang = anglesFromLandmarks(pts); const faceW = Math.hypot(pts[LM.faceR].x - pts[LM.faceL].x, pts[LM.faceR].y - pts[LM.faceL].y);
      Object.assign(m, { yaw: ang.yaw * (S.src.mirror ? -1 : 1), pitch: ang.pitch, closedA: eyeClosed(pts, 'A'), closedB: eyeClosed(pts, 'B'), faceRatio: faceW / sw, foreheadL: foreheadLOfCanvas(S.src.el, pts) });
      if (S.baseline?.pose) Object.assign(m, { baseYaw: S.baseline.pose.yaw * (S.src.mirror ? -1 : 1), basePitch: S.baseline.pose.pitch });   // 같은 소스·같은 좌표계라 부호를 맞춰 비교
      if (mode === 'live') {
        const part = currentPart(); crop = clampCrop(stabilizeCrop(part, cropSpec(part, pts, W / H), pts), sw, sh);
        Object.assign(m, { partId: part, visible: partVisible(part, pts, sw, sh), handOverlap: false, sharpness: sharpnessOf(S.src.el, crop), baselineL: S.baseline?.foreheadL ?? null });
        g = guideFor(part, pts, sw, sh);
      } else {
        const faceCrop = { x: pts[LM.faceL].x - faceW * 0.2, y: pts[LM.forehead].y - faceW * 0.2, w: faceW * 1.4, h: faceW * 1.8 };
        m.sharpness = sharpnessOf(S.src.el, { x: Math.max(0, faceCrop.x), y: Math.max(0, faceCrop.y), w: Math.min(sw, faceCrop.w), h: Math.min(sh, faceCrop.h) });
        m.baselineL = S.session.shots.front_open ? S.baseline?.foreheadL ?? S.live.firstL ?? null : null;
      }
    } else { S.live.smoother.reset(); S.live.stab.reset(); }
    // 그리기 (cover + 거울)
    const s = crop.clamped ? Math.min(W / crop.w, H / crop.h) : Math.max(W / crop.w, H / crop.h), ox = (W - crop.w * s) / 2, oy = (H - crop.h * s) / 2;   // 잘린 박스만 contain(띠), 그 외 cover
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); ctx.save(); if (S.src.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); } ctx.translate(ox, oy);
    ctx.drawImage(S.src.el, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w * s, crop.h * s);
    if (g) drawGuideOn(ctx, g, (p) => [(p.x - crop.x) * s, (p.y - crop.y) * s], dpr, { arrows: true, labels: false });
    ctx.restore();
    if (g && g.labels.length) { ctx.save(); ctx.translate(ox, oy); drawGuideOn(ctx, { regions: [], polylines: [], labels: g.labels }, (p) => [(p.x - crop.x) * s, (p.y - crop.y) * s], dpr, { mirrorW: S.src.mirror ? crop.w * s : null }); ctx.restore(); }
    // 게이트
    let gate;
    if (mode === 'live') { const preOk = raw && evaluateGate({ ...m, stableCount: 99 }, GATE_LIMITS).ok; m.stableCount = S.live.stab.push(!!preOk); gate = evaluateGate(m, GATE_LIMITS); }
    else {
      const shotId = nextShot(S.session.shots);
      if (!shotId) gate = { ok: false, text: '4장 완료' };
      else { const preOk = raw && shotGate(shotId, { ...m, stableCount: 99 }).ok; m.stableCount = S.live.stab.push(!!preOk); gate = shotGate(shotId, m); if (gate.ok) takeShot(shotId); }
    }
    S.live.last = { ...m, presence, gate, crop, frameMs: performance.now() - t0 };
    const gEl = $('gate'); if (gEl && !(mode === 'capture' && !nextShot(S.session.shots))) { gEl.textContent = gate.text; gEl.classList.toggle('ready', !!gate.ok); }
    if (mode === 'live') { $('btnCheck').disabled = !gate.ok; $('zoomLow').hidden = !(PART_ORIENT[currentPart()] === 'landscape' && S.orientation === 'portrait'); $('synthBadge').hidden = !(S.synthOn && S.src.kind === 'cam'); }
  };
  requestAnimationFrame(frame);
}
function grabFrame() { const [w, h] = srcDims(); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(S.src.el, 0, 0, w, h); return cv; }
function takeShot(shotId) {
  const cv = grabFrame(); S.session.shots[shotId] = { canvas: cv }; S.live.stab.reset(); flash();
  if (shotId === 'front_open' && S.live.last.foreheadL != null) S.live.firstL = S.live.last.foreheadL;
  renderShots();
}
/** 확인받기: 즉시 촬영. 가상 화장이 켜져 있으면 이 프레임의 랜드마크로 룩 파라미터 + 편차를 얹는다 */
function captureForResult() {
  const part = currentPart(); let frame = grabFrame(); flash();
  if (S.synthOn) {
    const [w, h] = srcDims(); const lm = S.src.kind === 'cam' ? detectImage(frame, w, h) : S.baseline.lm;
    if (lm) {
      const base = S.look.parts[part] || {}; const pr = presetParams(part); frame = synthesize(frame, lm, part, { ...base, ...pr }, w, h);
      if (S.src.kind === 'sample') { for (const p of S.session.parts) if (p.captured && p.partId !== part) frame = synthesize(frame, lm, p.partId, { ...(S.look.parts[p.partId] || {}), ...p.synthParams }, w, h); }   // 앞서 그린 부위도 얹힌 상태
    }
  }
  S.captured = frame; S.lastFrame = frame; S.live.loopOn = false;
  const p = S.session.parts.find((x) => x.partId === part); p.captured = frame; p.synthParams = presetParams(part);
  go('result');
}
function presetParams(part) {
  const set = PRESETS[part] || {}; const keys = Object.keys(set);
  if (S.synthPreset === 'good') return {};
  if (S.synthPreset === 'none') return { on: false };
  const dev = keys.find((k) => k !== 'good' && k !== 'none'); return dev ? set[dev].p : {};
}

// ---------- 5. 결과 ----------
function scorePart(part, bareIm, mkIm) {
  const samp = part === 'contour' ? sampleContourS3 : (im) => sampleAll(im, part);
  const base = samp(bareIm), cur = samp(mkIm), corr = lightCorr(base.fore, cur.fore), lightShift = cur.fore[0] - base.fore[0];
  let res;
  if (part === 'liner') res = linerResult({ R: compareLinerEye(base.R, cur.R, corr), L: compareLinerEye(base.L, cur.L, corr) });
  else if (part === 'brow') res = browResult(compareRegion(base.grid, cur.grid, corr, SP.dEThresh.brow));
  else if (part === 'lip') res = compareLip(base.strip, cur.strip, corr);
  else {
    const side = (k) => intensityIndex(base[k].part, cur[k].part, base[k].ring, cur[k].ring, corr); const L = side('L'), R = side('R');
    const present = Math.max(L.delta, R.delta) > SP.tPresent[part]; let directionOk = true;
    if (part === 'shadow') { const o = (k) => dE(base[k].outer, corr(cur[k].outer)) - dE(base[k].inner, corr(cur[k].inner)); directionOk = (o('L') + o('R')) / 2 > 0; }
    res = intensityResult(part, { L, R, present, directionOk }); res.metrics.deltas = { L: L.delta, R: R.delta };
  }
  const decision = decide(part, res, { lightShift, noFace: false });
  return { ...res, decision, oneLiner: oneLiner(part, decision, res.codes), lightShift };
}
function rResult(root) {
  const part = currentPart(), b = S.baseline, landscape = PART_ORIENT[part] === 'landscape'; root.classList.toggle('split', landscape);
  const cap = S.session.parts.find((p) => p.partId === part).captured;
  let r = S.result?.part === part && S.result?.captured === cap ? S.result : null;
  if (!r) {
    const w = cap.width, h = cap.height; const raw = timed('result_landmarks', () => detectImage(cap, w, h));
    if (!raw) r = { part, captured: cap, decision: { status: 'check_only', reason: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요' }, codes: [], oneLiner: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요', score: null, metrics: {}, pts: b.lm };
    else {
      const { lm, fit } = alignToBaseline(b.lm, raw);
      const eyeW = Math.hypot(lm[LM.eyeB.outer].x - lm[LM.eyeA.outer].x, lm[LM.eyeB.outer].y - lm[LM.eyeA.outer].y);
      if (fit.residual > eyeW * ALIGN_RESIDUAL_MAX) {   // 유사변환이 기준 얼굴을 이 프레임에 못 맞춤(자세·표정 차) → 거짓 점수 금지, 확인만
        const reason = '처음 찍을 때와 자세가 달라 재지 못했어요. 직접 보고 넘어가세요';
        r = { part, captured: cap, decision: { status: 'check_only', reason }, codes: [], oneLiner: reason, score: null, metrics: {}, pts: lm, fit };
      } else {
        const mkIm = prepare(cap, lm.map((p) => ({ x: p.x / w, y: p.y / h, z: p.z })), w, h); mkIm.lm = lm;   // 기준 길이는 정렬된 랜드마크에서 다시 계산
        r = { part, captured: cap, pts: lm, fit, bias: makeupBiasPx(lm, raw, [...LM.lipsOuter, ...LM.eyeA.upper, ...LM.eyeB.upper]), ...timed('score_' + part, () => scorePart(part, b.im, mkIm)) };
      }
    }
    S.result = r;
  }
  const scored = r.decision.status === 'scored' && part !== 'contour';
  const last = !nextPart(S.session, part);
  root.innerHTML = `<div class="photo"><canvas id="view"></canvas>${chipsHtml()}</div>
    <div class="pad">${scored ? `<div class="scorebox"><span class="big">${r.score}</span><small>/ 100</small></div>` : `<span class="checkchip">확인만</span>`}
    <div class="line">${part === 'contour' ? oneLiner('contour', r.decision, r.codes) : r.oneLiner}</div><div class="spacer"></div>
    <div class="btns"><button class="primary" id="next">${last ? '결과 보러 가기' : '다음'}</button><button class="secondary" id="retry">다시 확인받기</button><button class="ghost" id="skip">건너뛰기</button></div></div>`;
  wireChips(root); drawStillPart($('view'), cap, r.pts, part, { arrows: false, labels: part === 'contour' }); orientationCheck(part);
  $('next').onclick = () => { S.session = applyResult(S.session, part, r); advance(part, last); };
  $('retry').onclick = () => { go('live'); toast('화면 4로 돌아가 다시 촬영'); };
  $('skip').onclick = () => { S.session = applySkip(S.session, part); advance(part, last); };
}
function advance(part, last) {
  const nx = nextPart(S.session, part);
  if (!nx || allDone(S.session)) { go('review'); return; }
  S.session = setCurrentPart(S.session, nx); go('guide'); toast(`다음: ${PART_NAME[nx]}`);
}

// ---------- 6. 전체 리뷰 ----------
function rReview(root) {
  root.classList.add('review');
  const parts = toReviewParts(S.session), sum = computeSummary(parts);
  const bareCrop = faceCropUrl(S.baseline?.canvas, S.baseline?.lm), mineCrop = S.lastFrame ? faceCropUrl(S.lastFrame, S.result?.pts || S.baseline?.lm) : null;
  root.innerHTML = `<div class="pad"><div class="title">전체 리뷰</div><div class="scorecard"><span class="big">${sum.total ?? '—'}</span><small>/ 100</small></div>
    <div>${parts.map((p) => { const scored = p.status === 'passed' && typeof p.score === 'number'; const line = reviewLine(p); return `<div class="bar" data-id="${p.partId}"><div class="name">${PART_NAME[p.partId]}</div><div class="track"><div class="fill" style="width:${scored ? p.score : 0}%"></div></div><div class="score">${scored ? p.score : `<span class="chip2">${p.status === 'passed' ? '확인만' : STATUS_LABEL[p.status]}</span>`}</div>${line ? `<div class="l">${line}</div>` : ''}</div>`; }).join('')}</div>
    <div class="compare"><div class="cmp"><div class="img">${bareCrop ? `<img src="${bareCrop}" alt="">` : '<span class="muted">사진 없음</span>'}</div><div class="cap">쌩얼</div></div><div class="cmp"><div class="img">${mineCrop ? `<img src="${mineCrop}" alt="">` : '<span class="muted">사진 없음</span>'}</div><div class="cap">내 화장</div></div></div>
    <div class="btns"><button class="primary" id="saveImg">결과 저장</button><button class="ghost" id="finish">끝내기</button></div></div>`;
  root.querySelectorAll('.bar').forEach((el) => (el.onclick = () => { S.session = setCurrentPart(S.session, el.dataset.id); go('guide'); toast(`${PART_NAME[el.dataset.id]} 단계로 (완성본부터)`); }));
  $('saveImg').onclick = () => saveResultImage(sum, parts, bareCrop, mineCrop);
  $('finish').onclick = () => { clearSaved(); S.session = createSession(); S.baseline = null; S.fullRender = null; S.thumbs = {}; S.captured = null; S.lastFrame = null; S.result = null; S.session.screen = 'done'; render(); renderPanel(); };
}
function faceCropUrl(cv, lm) {
  if (!cv || !lm) return null; const ys = [70, 63, 105, 66, 107, 300, 293, 334, 296, 336].map((i) => lm[i].y), browTop = Math.min(...ys), chin = lm[152].y, fh = chin - browTop;
  const top = browTop - fh * 0.15, bottom = chin + fh * 0.1, xs = lm.map((p) => p.x), left = Math.min(...xs), right = Math.max(...xs), fw = right - left;
  const box = { x: left - fw * 0.05, y: top, w: fw * 1.1, h: bottom - top }; const t = document.createElement('canvas'); t.width = 360; t.height = 440; t.getContext('2d').drawImage(cv, box.x, box.y, box.w, box.h, 0, 0, 360, 440); return t.toDataURL('image/jpeg', 0.8);
}
async function saveResultImage(sum, parts, bareUrl, mineUrl) {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  c.fillStyle = '#F7F5F1'; c.fillRect(0, 0, W, H); c.fillStyle = '#2B2B2B'; c.font = 'bold 44px sans-serif'; c.fillText('당화응 · 오늘의 화장', 60, 100);
  c.fillStyle = '#E6F1F0'; rr(60, 140, W - 120, 200, 28); c.fill(); c.fillStyle = '#2B2B2B'; c.font = 'bold 140px sans-serif'; c.textAlign = 'center'; c.fillText(sum.total == null ? '—' : String(sum.total), W / 2 - 30, 290); c.font = '40px sans-serif'; c.fillStyle = '#6B6B6B'; c.fillText('/ 100', W / 2 + 130, 290); c.textAlign = 'left';
  let y = 400;
  for (const p of parts) { const scored = p.status === 'passed' && typeof p.score === 'number'; c.fillStyle = '#2B2B2B'; c.font = 'bold 32px sans-serif'; c.fillText(PART_NAME[p.partId], 60, y); c.fillStyle = '#e6e2da'; rr(330, y - 24, 520, 16, 8); c.fill(); if (scored) { c.fillStyle = '#2A8C85'; rr(330, y - 24, 520 * p.score / 100, 16, 8); c.fill(); } c.fillStyle = '#2B2B2B'; c.textAlign = 'right'; c.fillText(scored ? String(p.score) : (p.status === 'skipped' ? '건너뜀' : '확인만'), W - 60, y); c.textAlign = 'left'; const line = reviewLine(p); if (line) { c.fillStyle = '#6B6B6B'; c.font = '24px sans-serif'; c.fillText(line.slice(0, 40), 60, y + 34); } y += 84; }
  const imgY = y + 10, imgW = (W - 140) / 2, imgH = imgW * 11 / 9;
  for (const [i, url] of [[0, bareUrl], [1, mineUrl]]) { const x = 60 + i * (imgW + 20); c.fillStyle = '#e9e5de'; rr(x, imgY, imgW, imgH, 20); c.fill(); if (url) { const im = await loadImage(url); c.save(); rr(x, imgY, imgW, imgH, 20); c.clip(); c.drawImage(im, x, imgY, imgW, imgH); c.restore(); } c.fillStyle = '#6B6B6B'; c.font = '26px sans-serif'; c.textAlign = 'center'; c.fillText(i ? '내 화장' : '쌩얼', x + imgW / 2, imgY + imgH + 36); c.textAlign = 'left'; }
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9)); const file = new File([blob], `danghwaeung-${Date.now()}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: '당화응 결과' }); toast('갤러리·공유로 저장'); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast('이미지 한 장으로 내려받음');
}
function rDone(root) {
  root.innerHTML = `<div class="pad"><div class="spacer"></div><div class="title">세션이 끝났어요</div><div class="sub">사진과 결과는 이 기기에서 지웠어요. 결과 저장을 눌렀다면 갤러리에 한 장 남아 있어요.</div><div class="btns"><button class="primary" id="again">다시 시작</button></div><div class="spacer"></div></div>`;
  $('again').onclick = () => { S.session = createSession(); go('consent'); };
}

// ---------- 패널 ----------
function renderPanel() {
  $('jump').innerHTML = SCREENS.filter((s) => !['denied', 'done', 'processing'].includes(s)).map((s) => `<button data-s="${s}" class="${S.session.screen === s ? 'on' : ''}">${SCREEN_NAME[s]}</button>`).join(' ');
  $('jump').querySelectorAll('button').forEach((b) => (b.onclick = () => autoTo(b.dataset.s)));
  const sel = $('synthPreset'); if (!sel.options.length) for (const [v, t] of [['good', '잘 됨'], ['dev', '부위별 대표 편차'], ['none', '화장 안 함']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
}
function renderState() {
  const l = S.live.last, f = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');
  $('stateOut').textContent = [
    `화면 ${SCREEN_NAME[S.session.screen]} · 소스 ${S.src ? S.src.kind + (S.src.sample ? ' person_' + S.src.sample : '') : '없음'} · 폰 ${S.orientation} · 룩 ${S.session.lookId ?? '—'} · 얼굴형 ${S.session.faceShape ?? '—'} · 부위 ${S.session.currentPart ?? '—'}`,
    `촬영: ${SHOTS.map((s) => `${s.name}=${S.session.shots[s.id] ? 'O' : '-'}`).join(' ')} · 서버 전송 ${SERVER_SHOTS.join(',')}`,
    `기준: 이마 L* ${f(S.baseline?.foreheadL)} · 눈 폭 ${f(S.baseline?.unit?.eye, 0)}px 입술 폭 ${f(S.baseline?.unit?.lip, 0)}px 얼굴 폭 ${f(S.baseline?.unit?.face, 0)}px · ${S.baseline ? S.baseline.w + '×' + S.baseline.h : '—'} · 얼굴형 ${S.session.faceShape ? FACE_SHAPE_NAME[S.session.faceShape] : '—'}`,
    `화면 3 크롭(poc/screen3 cropSpec): ${S.lastCrop ? `${f(S.lastCrop.w, 0)}×${f(S.lastCrop.h, 0)} zoom ${f(S.lastCrop.zoomRatio, 2)} covered ${S.lastCrop.covered} clamped ${S.lastCrop.clamped}${S.lastCrop.clampedSides.length ? ' ' + S.lastCrop.clampedSides.join(',') : ''}` : '—'}`,
    `라이브: 얼굴 ${l.faceDetected ? 'O' : '-'} yaw ${f(l.yaw)} pitch ${f(l.pitch)} 눈감음 ${l.closedA}/${l.closedB} 얼굴비 ${f(l.faceRatio, 2)} 선명 ${f(l.sharpness)} L* ${f(l.foreheadL)} 안정 ${l.stableCount ?? 0} · 게이트 ${l.gate ? (l.gate.ok ? 'READY' : l.gate.firstFail) : '—'} "${l.gate?.text ?? ''}" · ${f(l.frameMs)}ms`,
    `결과: ${S.result ? `${S.result.part} ${S.result.decision.status} ${S.result.score ?? ''} [${(S.result.codes || []).join(',')}] 조명Δ ${f(S.result.lightShift)} 정렬 s ${f(S.result.fit?.s, 3)} 잔차 ${f(S.result.fit?.residual)}px 편향 ${f(S.result.bias)}px` : '—'}`,
    `결과 지표(내부): ${S.result?.metrics ? JSON.stringify(S.result.metrics, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)).slice(0, 600) : '—'}`,
    `세션: ${S.session.parts.map((p) => `${PART_NAME[p.partId]}=${p.status}${p.score != null ? ':' + p.score : ''}`).join(', ')}`,
    `처리 시간(ms): ${Object.entries(S.perf).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ') || '—'}`,
  ].join('\n');
}
setInterval(() => { if (S.live.loopOn) renderState(); }, 300);
$('synthOn').onchange = (e) => (S.synthOn = e.target.checked);
$('synthPreset').onchange = (e) => (S.synthPreset = e.target.value);
$('btnReset').onclick = () => { clearSaved(); S.session = createSession(); S.baseline = null; S.fullRender = null; S.thumbs = {}; S.result = null; S.lastFrame = null; go('consent'); toast('세션 초기화'); };
document.querySelectorAll('nav .tab').forEach((b) => (b.onclick = () => { document.querySelectorAll('nav .tab').forEach((x) => x.classList.remove('active')); b.classList.add('active'); for (const t of ['input', 'state', 'verify']) $('tab' + t[0].toUpperCase() + t.slice(1)).hidden = t !== b.dataset.tab; }));
$('btnRunTests').onclick = async () => { $('testOut').textContent = '실행 중…'; const m = await import('./tests-browser.js'); $('testOut').textContent = m.run(); };
$('btnPerf').onclick = () => ($('testOut').textContent = Object.entries(S.perf).map(([k, v]) => `${k.padEnd(22)} ${v.toFixed(0)} ms`).join('\n') || '아직 없음');
$('btnAuto').onclick = () => autoTo('review');
$('btnServerLook').onclick = generateServerLook;

/** 샘플로 필요한 앞 단계를 자동으로 채워 그 화면까지 간다 (시연·헤드리스 캡처용) */
async function autoTo(target) {
  S.auto = true;
  try {
    if (!S.src) await useSample(Number(hash.sample) || 2);
    const order = SCREENS; const need = (s) => order.indexOf(target) >= order.indexOf(s);
    if (need('capture') && target !== 'consent') { S.session.consent = true; }
    if (target === 'consent' || target === 'capture') { go(target); return; }
    if (!S.baseline) { if (S.src.kind === 'sample') for (const s of SHOTS) S.session.shots[s.id] = S.src.shots[s.id]; S.session.screen = 'processing'; await rProcessing($('screen')); }
    if (target === 'looks') { go('looks'); await buildThumbs(); return; }
    if (!S.session.lookId) S.session.lookId = LOOKS[0].id; if (!S.thumbs[S.session.lookId]) await buildThumbs();
    if (!S.fullRender) { S.look = lookById(S.session.lookId); S.fullRender = timed('fullRender', () => synthesizeLook(S.baseline.canvas, S.baseline.lm, S.look.parts, S.baseline.w, S.baseline.h, false)); }
    if (target === 'fullrender') { go('fullrender'); return; }
    if (!S.session.currentPart) S.session = setCurrentPart(S.session, PART_ORDER[0]);
    if (hash.part && PART_ORDER.includes(hash.part)) S.session = setCurrentPart(S.session, hash.part);
    if (target === 'guide' || target === 'live') { go(target); return; }
    if (target === 'result') { if (!S.session.parts.find((p) => p.partId === S.session.currentPart).captured) { S.session.screen = 'live'; captureForResult(); } else go('result'); return; }
    // review: 남은 부위를 전부 자동으로 확인받기 → 다음
    for (const id of PART_ORDER) {
      const p = S.session.parts.find((x) => x.partId === id); if (['passed', 'check_only', 'skipped'].includes(p.status)) continue;
      S.session = setCurrentPart(S.session, id); S.session.screen = 'live'; captureForResult(); await sleep(0);
      S.session = applyResult(S.session, id, S.result);
    }
    go('review');
  } finally { S.auto = false; }
}

// ---------- 시작 ----------
(async () => {
  applyOrientation(); renderPanel();
  $('screen').innerHTML = '<div class="pad"><div class="spacer"></div><div class="sub" style="text-align:center">모델 로딩 중…</div><div class="spacer"></div></div>';
  try { await loadModels(); } catch (e) { $('screen').innerHTML = `<div class="pad">모델 로딩 실패: ${e.message}</div>`; return; }
  await resolveSampleDir();
  if (hash.sample || hash.screen) { await useSample(Number(hash.sample) || 2); await autoTo(hash.screen || 'consent'); }
  else if (hash.cam) { await useCamera().catch(() => toast('카메라를 열 수 없어요')); render(); }
  else render();
  if (hash.verify) { document.querySelector('[data-tab=verify]').click(); $('btnRunTests').click(); }
})();
