import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { IDX, partLandmarks, cropSpec, contourOutline, rationale, products } from './core.js';
import { PART_IDS, PART_NAME, ORIENTATION, FACE_SHAPES, FACE_SHAPE_NAME, STATUS_LABEL } from './rules.js';

const $ = (id) => document.getElementById(id);
const SAMPLES = '../../danghaeung_poc_3x4_20/';
const PERSONS = [1, 2, 3, 4, 5];
const SHOTS = ['front_open', 'front_closed', 'left_45', 'right_45'];
export const SAMPLE_FILES = PERSONS.flatMap((p) => SHOTS.map((s) => `person_${p}_${s}.jpg`));

const state = { landmarker: null, current: null, partId: 'liner', faceShape: 'round', statuses: {} };

async function initLandmarker() {
  const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate },
    runningMode: "IMAGE", numFaces: 1,
  });
  try { state.landmarker = await FaceLandmarker.createFromOptions(files, opts("GPU")); }
  catch { state.landmarker = await FaceLandmarker.createFromOptions(files, opts("CPU")); }
}

async function loadImage(src, name) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  cv.getContext('2d').drawImage(img, 0, 0);
  const det = state.landmarker.detect(cv);
  return { name, img: cv, size: { w: cv.width, h: cv.height }, landmarks: det.faceLandmarks?.[0] || null };
}

const IDX_COLORS = { brow: '#C2731F', liner: '#2A8C85', shadow: '#7A6CC2', lip: '#B8432F', cheek: '#2F7FB8', contour: '#2B2B2B' };

function drawIndexCheck(shot) {
  const cv = $('cvIndex'), ctx = cv.getContext('2d');
  const k = Math.min(cv.width / shot.size.w, cv.height / shot.size.h);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(shot.img, 0, 0, shot.size.w * k, shot.size.h * k);
  if (!shot.landmarks) return;
  for (const id of PART_IDS) {
    ctx.fillStyle = IDX_COLORS[id];
    for (const [x, y] of partLandmarks(shot.landmarks, shot.size, id)) {
      ctx.beginPath(); ctx.arc(x * k, y * k, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

async function selectShot(name) {
  $('photoInfo').textContent = '검출 중…';
  const shot = await loadImage(SAMPLES + name, name);
  state.current = shot;
  $('photoInfo').textContent = shot.landmarks
    ? `${name} · ${shot.size.w}×${shot.size.h} · 얼굴 검출됨`
    : `${name} · 얼굴을 찾지 못함`;
  drawIndexCheck(shot);
  render();
}

function render() { /* Task 5 에서 채운다 */ }

function initUI() {
  const sel = $('sampleList');
  sel.innerHTML = SAMPLE_FILES.map((f) => `<option value="${f}">${f}</option>`).join('');
  sel.onchange = () => selectShot(sel.value);
  $('fileUp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    const shot = await loadImage(url, f.name);
    URL.revokeObjectURL(url);
    state.current = shot;
    $('photoInfo').textContent = shot.landmarks ? `${f.name} · 얼굴 검출됨` : `${f.name} · 얼굴을 찾지 못함`;
    drawIndexCheck(shot); render();
  };
  const fs = $('faceShape');
  fs.innerHTML = FACE_SHAPES.map((f) => `<option value="${f}">${FACE_SHAPE_NAME[f]}</option>`).join('');
  fs.value = state.faceShape;
  fs.onchange = () => { state.faceShape = fs.value; render(); };
  document.querySelectorAll('nav .tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('nav .tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const map = { photo: 'tabPhoto', part: 'tabPart', verify: 'tabVerify' };
      for (const [k, elId] of Object.entries(map)) $(elId).hidden = (k !== t.dataset.tab);
    };
  });
  $('btnFixtures').onclick = buildFixtures;
}

async function buildFixtures() {
  const out = {};
  for (const f of SAMPLE_FILES) {
    const shot = await loadImage(SAMPLES + f, f);
    if (!shot.landmarks) { $('testOut').textContent += `\n${f}: 얼굴 검출 실패`; continue; }
    out[f] = { size: shot.size, landmarks: shot.landmarks.map((p) => ({ x: +p.x.toFixed(6), y: +p.y.toFixed(6) })) };
    $('testOut').textContent = `fixtures 생성 중… ${Object.keys(out).length}/${SAMPLE_FILES.length}`;
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'fixtures.json'; a.click();
  $('testOut').textContent = `fixtures.json 생성 완료 (${Object.keys(out).length}장). poc/screen3/ 에 저장하세요.`;
}

initLandmarker().then(() => { initUI(); selectShot(SAMPLE_FILES[0]); });
