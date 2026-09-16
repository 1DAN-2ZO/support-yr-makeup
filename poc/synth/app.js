// 합성 학습 데이터 생성기 — 브라우저 UI.
// 계산은 전부 core.js(순수 함수). 여기서는 랜드마크 검출과 캔버스 렌더링만 한다.

import { buildSample, randomParams, sampleStats, PART_LABEL, faceWidth } from './core.js';

const SAMPLE_DIR = '../../danghaeung_phone_portraits_20_v2';
const SAMPLES = Array.from({ length: 5 }, (_, i) => `person_${i + 1}_front_open.jpg`);

// 마스크 라벨 색. 사람이 눈으로 구분하기 위한 것이고, 학습 시에는 PART_LABEL 정수를 쓴다.
const LABEL_COLOR = {
  brow: '#e6194b', liner: '#3cb44b', shadow: '#ffe119', lip: '#4363d8', cheek: '#f58231',
};
const PART_NAME = {
  brow: '눈썹', liner: '아이라이너', shadow: '섀도우', lip: '입술', cheek: '볼터치',
};

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const setStatus = (t, cls = '') => { statusEl.textContent = t; statusEl.className = `status ${cls}`; };

let landmarker = null;
let current = null;   // { bitmap, lm, w, h }

// ---------------- 랜드마크 ----------------

async function initLandmarker() {
  const { FaceLandmarker, FilesetResolver } =
    await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numFaces: 1,
  });
}

/** 정규화 좌표(0~1)를 픽셀 좌표로. core.js는 픽셀 기준으로 계산한다. */
function toPixels(norm, w, h) {
  return norm.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z }));
}

async function loadFace(src) {
  setStatus('얼굴 찾는 중…');
  const bitmap = await createImageBitmap(await (await fetch(src)).blob());
  return detect(bitmap);
}

async function detect(bitmap) {
  const cv = new OffscreenCanvas(bitmap.width, bitmap.height);
  cv.getContext('2d').drawImage(bitmap, 0, 0);
  const res = landmarker.detect(cv);
  if (!res.faceLandmarks?.length) {
    setStatus('얼굴을 찾지 못했습니다. 다른 사진을 넣어 보세요.', 'bad');
    return null;
  }
  const lm = toPixels(res.faceLandmarks[0], bitmap.width, bitmap.height);
  current = { bitmap, lm, w: bitmap.width, h: bitmap.height };
  checkQuality();
  setStatus(`얼굴 인식 완료 · ${bitmap.width}×${bitmap.height}`, 'ok');
  return current;
}

/** 우리 스펙(홍채 지름 ≥ 25px)에 맞는 해상도인지 알려준다. */
function checkQuality() {
  const { lm } = current;
  const box = $('quality');
  // 478점 모델은 468~477이 홍채. 가로 지름으로 잰다.
  const iris = lm.length >= 478 ? Math.hypot(lm[471].x - lm[469].x, lm[471].y - lm[469].y) : 0;
  const fw = faceWidth(lm);
  if (iris && iris < 25) {
    box.hidden = false;
    box.className = 'note warn';
    box.innerHTML = `⚠️ 홍채 지름이 <b>${iris.toFixed(1)}px</b>입니다. 기능 정의서 기준은 <b>25px 이상</b>이라
      이 사진은 데모용으로는 되지만 <b>실제 학습 데이터로는 해상도가 부족</b>합니다
      (얼굴 너비 ${fw.toFixed(0)}px). 학습용 맨얼굴은 더 크게 찍어야 합니다.`;
  } else {
    box.hidden = false;
    box.className = 'note ok';
    box.innerHTML = `홍채 지름 <b>${iris.toFixed(1)}px</b> · 얼굴 너비 ${fw.toFixed(0)}px — 기준(25px) 충족.`;
  }
}

// ---------------- 렌더링 ----------------

function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

/** 합성 사진: 원본 위에 부위를 반투명으로 얹는다. feather는 번짐 정도. */
function renderPhoto(cv, face, sample) {
  cv.width = face.w; cv.height = face.h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(face.bitmap, 0, 0);

  const scale = faceWidth(face.lm) / 100;   // 번짐을 얼굴 크기에 비례시킨다
  for (const part of sample.parts) {
    const layer = document.createElement('canvas');
    layer.width = face.w; layer.height = face.h;
    const lc = layer.getContext('2d');
    lc.fillStyle = part.color;
    for (const poly of part.polys) { tracePoly(lc, poly); lc.fill(); }

    const blur = part.feather * 6 * scale;
    ctx.save();
    ctx.globalAlpha = part.alpha;
    // 어두운 색은 곱하기가 자연스럽고, 볼터치처럼 연한 색은 그냥 얹는다
    ctx.globalCompositeOperation = part.id === 'cheek' || part.id === 'shadow' ? 'source-over' : 'multiply';
    if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

/** 정답 마스크: 부위별 라벨 색으로 꽉 채운다. 번짐 없음, 경계가 정답이다. */
function renderMask(cv, face, sample) {
  cv.width = face.w; cv.height = face.h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, face.w, face.h);
  for (const part of sample.parts) {
    ctx.fillStyle = LABEL_COLOR[part.id];
    for (const poly of part.polys) { tracePoly(ctx, poly); ctx.fill(); }
  }
}

function renderStats(sample) {
  const stats = sampleStats(sample);
  const p = sample.params;
  const rows = sample.parts.map((part) => `
    <tr>
      <td><span class="sw" style="background:${LABEL_COLOR[part.id]}"></span>${PART_NAME[part.id]}</td>
      <td>${PART_LABEL[part.id]}</td>
      <td>${stats[part.id].toFixed(0)} px²</td>
      <td><span class="sw" style="background:${part.color}"></span>${part.color}</td>
      <td>${part.alpha.toFixed(2)}</td>
    </tr>`).join('');
  $('stats').innerHTML = `
    <tr><th>부위</th><th>라벨</th><th>면적</th><th>색</th><th>불투명도</th></tr>${rows}
    <tr class="foot"><td colspan="5">시드 ${p.seed} · 좌우 비대칭 ${(p.asym * 100).toFixed(1)}%
      · 라이너 두께 ${(p.liner.thickness * 100).toFixed(1)}% · 꼬리 ${(p.liner.wingLen * 100).toFixed(0)}%
      · 눈썹 키움 ${p.brow.fill.toFixed(2)}배 · 오버립 ${(p.lip.overline * 100).toFixed(1)}%</td></tr>`;
}

function renderLegend() {
  $('legend').innerHTML = Object.entries(LABEL_COLOR).map(([id, c]) =>
    `<span class="chip"><span class="sw" style="background:${c}"></span>${PART_NAME[id]} = ${PART_LABEL[id]}</span>`).join('');
}

function drawOne() {
  if (!current) return;
  const seed = Number($('seed').value) || 0;
  const sample = buildSample(current.lm, randomParams(seed));
  renderPhoto($('outCv'), current, sample);
  renderMask($('maskCv'), current, sample);
  renderStats(sample);
}

// ---------------- 배치 ----------------

let sheet = null;   // { photo: canvas, mask: canvas }

function runBatch() {
  if (!current) return;
  const n = Math.max(1, Math.min(60, Number($('batchN').value) || 12));
  const start = Number($('batchSeed').value) || 0;
  const cols = Math.min(6, n);
  const rows = Math.ceil(n / cols);
  const { w, h } = current;

  const mk = () => {
    const c = document.createElement('canvas');
    c.width = cols * w; c.height = rows * h;
    return c;
  };
  const photoSheet = mk(), maskSheet = mk();
  const pctx = photoSheet.getContext('2d'), mctx = maskSheet.getContext('2d');
  const grid = $('batchGrid');
  grid.innerHTML = '';

  const one = document.createElement('canvas');
  const oneMask = document.createElement('canvas');

  for (let i = 0; i < n; i++) {
    const sample = buildSample(current.lm, randomParams(start + i));
    renderPhoto(one, current, sample);
    renderMask(oneMask, current, sample);
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    pctx.drawImage(one, x, y);
    mctx.drawImage(oneMask, x, y);

    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = new Image();
    img.src = one.toDataURL();
    cell.appendChild(img);
    const cap = document.createElement('span');
    cap.textContent = `시드 ${start + i}`;
    cell.appendChild(cap);
    grid.appendChild(cell);
  }
  sheet = { photo: photoSheet, mask: maskSheet };
  $('dlSheet').disabled = false;
  setStatus(`${n}장 생성 완료 · 시드 ${start}~${start + n - 1}`, 'ok');
}

function download(canvas, name) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

// ---------------- 시작 ----------------

async function main() {
  renderLegend();
  const sel = $('sampleSel');
  sel.innerHTML = SAMPLES.map((f, i) => `<option value="${f}">${i + 1}번 (정면 눈 뜸)</option>`).join('');

  try {
    await initLandmarker();
  } catch (e) {
    setStatus(`모델을 불러오지 못했습니다: ${e.message}`, 'bad');
    return;
  }

  const load = async (src) => { if (await loadFace(src)) drawOne(); };
  await load(`${SAMPLE_DIR}/${SAMPLES[0]}`);

  sel.onchange = () => load(`${SAMPLE_DIR}/${sel.value}`);
  $('fileIn').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('얼굴 찾는 중…');
    if (await detect(await createImageBitmap(file))) drawOne();
  };
  $('reroll').onclick = () => { $('seed').value = Math.floor(Math.random() * 100000); drawOne(); };
  $('seed').oninput = drawOne;
  $('dlPair').onclick = () => {
    const s = $('seed').value;
    download($('outCv'), `synth_${s}_photo.png`);
    download($('maskCv'), `synth_${s}_mask.png`);
  };
  $('batchRun').onclick = runBatch;
  // ?batch=12 로 열면 바로 생성한다 (스크린샷·시연용)
  const auto = new URLSearchParams(location.search).get('batch');
  if (auto) { $('batchN').value = auto; runBatch(); }
  $('dlSheet').onclick = () => {
    if (!sheet) return;
    download(sheet.photo, `synth_sheet_photo.png`);
    download(sheet.mask, `synth_sheet_mask.png`);
  };
}

main();
