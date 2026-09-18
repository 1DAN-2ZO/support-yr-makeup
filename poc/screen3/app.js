import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { partLandmarks, cropSpec, contourOutline, rationale, products } from './core.js';
import { PART_IDS, PART_NAME, ORIENTATION, FACE_SHAPES, FACE_SHAPE_NAME, STATUS_LABEL } from './rules.js';
import { run } from './tests-browser.js';

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

const ROTATE_MSG = {
  landscape: '눈 단계는 양쪽 눈을 같이 봐요.\n폰을 가로로 돌리세요',
  portrait: '이제 폰을 세로로 돌리세요',
};
let rotateTimer = null;

function drawCrop(canvas, shot, partId) {
  const ctx = canvas.getContext('2d');
  const c = cropSpec(shot.landmarks, shot.size, partId);
  canvas.width = Math.round(c.w); canvas.height = Math.round(c.h);
  ctx.drawImage(shot.img, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
  return c;
}

/** 원본 픽셀 폴리곤을 크롭 박스 좌표로 옮겨 점선 테두리만 그린다. 면 채우기 없음. */
function drawContour(canvas, shot, crop, faceShape) {
  const ctx = canvas.getContext('2d');
  const o = contourOutline(shot.landmarks, shot.size, faceShape);
  const sx = canvas.width / crop.w, sy = canvas.height / crop.h;
  const toLocal = (p) => [(p[0] - crop.x) * sx, (p[1] - crop.y) * sy];

  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  for (const [polys, color] of [[o.shading, '#2A8C85'], [o.highlight, '#7FC3BD']]) {
    ctx.strokeStyle = color;
    for (const poly of polys) {
      ctx.beginPath();
      poly.map(toLocal).forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
  for (const l of o.labels) {
    const [x, y] = toLocal(l.anchor);
    const w = ctx.measureText(l.text).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(x - w / 2, y - 9, w, 18);
    ctx.fillStyle = '#2B2B2B';
    ctx.fillText(l.text, x, y + 4);
  }
}

function chipHtml() {
  return PART_IDS.map((id) => {
    const st = state.statuses[id] || 'not_started';
    const cur = id === state.partId ? ' current' : '';
    const label = id === state.partId ? PART_NAME[id] : `${PART_NAME[id]} · ${STATUS_LABEL[st]}`;
    return `<div class="chip ${st}${cur}" data-part="${id}">${label}</div>`;
  }).join('');
}

function render() {
  const phone = $('phone');
  const shot = state.current;
  const orientation = ORIENTATION[state.partId];
  phone.className = `phone ${orientation}`;
  phone.innerHTML = `
    <div class="stage">
      <div class="chips">${chipHtml()}</div>
      <div class="body">
        <div class="shot"><canvas id="cvShot"></canvas><div class="tag">완성본</div></div>
        <div class="card">
          <div class="why" id="why"></div>
          <div class="need" id="need"></div>
          <button class="primary" id="btnGo">그리러 가기</button>
        </div>
      </div>
    </div>
    <div class="rotate" id="rotate" hidden></div>
    <div class="toast" id="toast" hidden></div>`;

  phone.querySelectorAll('.chip').forEach((el) => { el.onclick = () => setPart(el.dataset.part); });
  $('why').textContent = rationale(state.partId, state.faceShape);
  $('need').textContent = products(state.partId);
  $('btnGo').onclick = () => toast('화면 4(실시간 테두리)는 별도 POC입니다');

  if (shot && shot.landmarks) {
    const crop = drawCrop($('cvShot'), shot, state.partId);
    if (state.partId === 'contour') drawContour($('cvShot'), shot, crop, state.faceShape);
  }

  // 칩 6개가 좁은 폰 화면에 다 안 들어갈 수 있으므로, 현재 부위 칩을 가로 스크롤 안으로 들여온다.
  // block:'nearest' 는 .chips(overflow-x:auto) 안에서만 스크롤시키고 페이지 전체는 움직이지 않는다.
  phone.querySelector('.chip.current')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function toast(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 1800);
}

function setPart(partId) {
  const before = ORIENTATION[state.partId];
  state.partId = partId;
  const after = ORIENTATION[partId];
  render();
  if (before !== after) {
    const r = $('rotate');
    r.textContent = ROTATE_MSG[after];
    r.hidden = false;
    clearTimeout(rotateTimer);
    rotateTimer = setTimeout(() => { r.hidden = true; }, 1600);
  }
}

function buildPartButtons() {
  $('partButtons').innerHTML = PART_IDS.map((id) => `<button data-part="${id}">${PART_NAME[id]}</button>`).join('');
  $('partButtons').querySelectorAll('button').forEach((b) => { b.onclick = () => setPart(b.dataset.part); });
  $('statusEditor').innerHTML = PART_IDS.map((id) => `
    <label>${PART_NAME[id]}
      <select data-status="${id}">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </label>`).join('');
  $('statusEditor').querySelectorAll('select').forEach((s) => {
    s.value = state.statuses[s.dataset.status] || 'not_started';
    s.onchange = () => { state.statuses[s.dataset.status] = s.value; render(); };
  });
}

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
  $('btnRunTests').onclick = () => { $('testOut').textContent = run(); };
  $('btnBatch').onclick = runBatch;
  buildPartButtons();
}

async function runBatch() {
  const rows = [];
  const skipped = [];
  for (const f of SAMPLE_FILES) {
    const shot = await loadImage(SAMPLES + f, f);
    if (!shot.landmarks) { skipped.push(f); continue; }
    for (const id of PART_IDS) rows.push({ f, id, c: cropSpec(shot.landmarks, shot.size, id) });
  }
  const cov = rows.filter((r) => r.c.covered).length, cla = rows.filter((r) => r.c.clamped).length;
  // 검출 실패로 건너뛴 사진은 분모(20장)에서 조용히 빠지므로, 몇 장이 빠졌는지 반드시 찍는다.
  const skipNote = skipped.length
    ? `<div class="muted" style="color:#B8432F">얼굴 검출 실패로 건너뜀 ${skipped.length}장: ${skipped.join(', ')}</div>`
    : `<div class="muted">얼굴 검출 실패로 건너뜀 0장 (샘플 ${SAMPLE_FILES.length}장 전부 사용)</div>`;
  $('batchTable').innerHTML =
    `<table class="batch"><tr><th>사진</th><th>부위</th><th>확대율</th><th>박스</th><th>covered</th><th>clamped</th></tr>` +
    rows.map((r) => `<tr><td>${r.f}</td><td>${PART_NAME[r.id]}</td><td>${r.c.zoomRatio.toFixed(2)}</td>` +
      `<td>${Math.round(r.c.w)}×${Math.round(r.c.h)}</td>` +
      `<td class="${r.c.covered ? '' : 'bad'}">${r.c.covered}</td>` +
      `<td class="${r.c.clamped ? 'bad' : ''}">${r.c.clamped}${r.c.clampedSides.length ? ' (' + r.c.clampedSides.join(',') + ')' : ''}</td></tr>`).join('') +
    `</table><div class="muted">covered ${cov}/${rows.length} · clamped ${cla}/${rows.length}</div>${skipNote}`;
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

initLandmarker().then(() => { initUI(); selectShot(SAMPLE_FILES[0]); }).catch((e) => {
  $('photoInfo').textContent = `랜드마커 로딩 실패: ${e?.message || e}. CDN 연결(인터넷)을 확인하세요.`;
});
