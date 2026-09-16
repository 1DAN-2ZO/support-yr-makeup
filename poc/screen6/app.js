// 화면 6 전체 리뷰 POC (v6). 폰 목업 + 시연 패널.
import { PART_IDS, LOOK_PART_IDS, CONTOUR_ID, PART_NAME, STATUS_LABEL, DIAG_TEXT, DEFAULT_TEMPLATE, computeSummary, upsertPart, oneLiner } from './core.js';

// ---------------- 세션 (F-07 복원용 임시 저장) ----------------
const KEY = 'dhe_session_v6';
const CODES_BY_PART = {
  brow: ['BROW_TAIL_SHORT', 'BROW_LR_DIFF'], liner: ['LINER_WING_HIGH_R', 'LINER_WING_LOW_L', 'LINER_THICK'],
  shadow: ['SHADOW_DIR'], lip: ['LIP_OUT_LOWER'], cheek: ['CHEEK_LR_DIFF'], contour: [],
};
const DIAG_SENTENCE = {
  brow: '좌우가 잘 맞아요', liner: '오른쪽 꼬리가 조금 위로 갔어요. 왼쪽에 맞춰 살짝 내려 그리세요',
  shadow: '방향이 잘 맞아요', lip: '아래 경계가 살짝 밖으로 나갔어요', cheek: '오른쪽이 조금 진해요', contour: '',
};
const P = (partId, status, score, extra = {}) => ({ partId, status, score, diagnosis: DIAG_SENTENCE[partId], metrics: {}, lrIndex: null, diagnosisCodes: [], attempts: 1, updatedAt: Date.now(), ...extra });

function presetSmoky() {
  return [
    P('brow', 'passed', 88, { metrics: { lrDiffMm: 0.6 } }),
    P('liner', 'passed', 82, { metrics: { lrDiffMm: 1.5 }, diagnosisCodes: ['LINER_WING_HIGH_R'] }),
    P('shadow', 'check_only', null, { diagnosis: '', checkReason: '색이 옅어서 재지 못했어요. 직접 보고 넘어가세요' }),
    P('lip', 'passed', 79, { metrics: { colorAb: { a: 28, b: 12 } }, diagnosisCodes: ['LIP_OUT_LOWER'] }),
    P('cheek', 'passed', 71, { metrics: { colorAb: { a: 24, b: 14 } }, lrIndex: { left: 41, right: 58 }, diagnosisCodes: ['CHEEK_LR_DIFF'] }),
    P(CONTOUR_ID, 'check_only', null, { diagnosis: '', lrIndex: { left: 40, right: 55 } }),
  ];
}
function presetTwoCheck() { const p = presetSmoky(); p[1] = P('liner', 'check_only', null, { diagnosis: '', checkReason: '조명이 달라져서 재지 못했어요' }); return p; }
function presetNone() { return PART_IDS.map((id) => P(id, id === CONTOUR_ID ? 'check_only' : 'skipped', null, { diagnosis: '' })); }

let session = load() || { parts: presetSmoky(), images: { bare: null, mine: null }, template: DEFAULT_TEMPLATE };
function save() { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {} }
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function clearSession() { try { localStorage.removeItem(KEY); } catch {} }

// ---------------- 폰 화면 ----------------
const $ = (id) => document.getElementById(id);
let toastT; function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 1800); }

function renderPhone() {
  const s = computeSummary(session.parts, session.template);
  $('total').textContent = s.total == null ? '—' : s.total;
  $('bars').innerHTML = PART_IDS.map((id) => {
    const p = session.parts.find((x) => x.partId === id) || P(id, 'not_started', null, { diagnosis: '' });
    const scored = p.status === 'passed' && typeof p.score === 'number';
    const right = scored ? `<div class="score">${p.score}</div>` : `<div class="score"><span class="chip">${p.status === 'passed' ? '확인만' : STATUS_LABEL[p.status]}</span></div>`;
    const line = oneLiner(p);
    return `<div class="bar" data-id="${id}"><div class="name">${PART_NAME[id]}</div><div class="track"><div class="fill" style="width:${scored ? p.score : 0}%"></div></div>${right}${line ? `<div class="line">${line}</div>` : ''}</div>`;
  }).join('');
  $('bars').querySelectorAll('.bar').forEach((el) => (el.onclick = () => toast(`${PART_NAME[el.dataset.id]} 단계로 이동 (완성본부터)`)));
  for (const [k, id] of [['bare', 'imgBare'], ['mine', 'imgMine']]) {
    const box = $(id); const src = session.images[k];
    box.innerHTML = src ? `<img src="${src}" alt="">` : `<span class="ph">${k === 'bare' ? '쌩얼' : '내 화장'} 사진 없음</span>`;
  }
  // 내부값 (화면엔 안 보임, 패널에만)
  $('internal').textContent = `내부 계산: 가중 평균 ${s.base ?? '—'} · 대칭 보정 ${s.symmetryPenalty} · 조화 보정 ${s.harmonyApplied ? s.harmonyPenalty : '미적용'} · 측정 부위 ${s.measuredCount}/${s.partCount} — 화면에는 합산 숫자만 표시`;
}

$('btnFinish').onclick = () => {
  clearSession();
  session = { parts: presetNone(), images: { bare: null, mine: null }, template: DEFAULT_TEMPLATE };
  $('screenReview').hidden = true; $('screenDone').hidden = false;
};
$('btnRestart').onclick = () => {
  session = { parts: presetSmoky(), images: { bare: null, mine: null }, template: DEFAULT_TEMPLATE }; save();
  $('screenDone').hidden = true; $('screenReview').hidden = false; renderEditor(); renderPhone();
};

// ---------------- 결과 저장 (비교 + 점수 카드 → 이미지 1장) ----------------
async function buildShareCard() {
  const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#F7F5F1'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#2B2B2B'; c.font = 'bold 44px sans-serif'; c.fillText('당화응 · 오늘의 화장', 60, 100);
  const s = computeSummary(session.parts, session.template);
  c.fillStyle = '#E6F1F0'; roundRect(c, 60, 140, W - 120, 200, 28); c.fill();
  c.fillStyle = '#2B2B2B'; c.font = 'bold 140px sans-serif'; c.textAlign = 'center';
  c.fillText(s.total == null ? '—' : String(s.total), W / 2 - 30, 290);
  c.font = '40px sans-serif'; c.fillStyle = '#6B6B6B'; c.fillText('/ 100', W / 2 + 130, 290); c.textAlign = 'left';
  let y = 400;
  for (const id of PART_IDS) {
    const p = session.parts.find((x) => x.partId === id); if (!p) continue;
    const scored = p.status === 'passed' && typeof p.score === 'number';
    c.fillStyle = '#2B2B2B'; c.font = 'bold 32px sans-serif'; c.fillText(PART_NAME[id], 60, y);
    c.fillStyle = '#e6e2da'; roundRect(c, 330, y - 24, 520, 16, 8); c.fill();
    if (scored) { c.fillStyle = '#2A8C85'; roundRect(c, 330, y - 24, 520 * p.score / 100, 16, 8); c.fill(); }
    c.fillStyle = '#2B2B2B'; c.font = 'bold 32px sans-serif'; c.textAlign = 'right';
    c.fillText(scored ? String(p.score) : (p.status === 'skipped' ? '건너뜀' : '확인만'), W - 60, y); c.textAlign = 'left';
    const line = oneLiner(p); if (line) { c.fillStyle = '#6B6B6B'; c.font = '24px sans-serif'; c.fillText(line.slice(0, 40), 60, y + 34); }
    y += 84;
  }
  const imgY = y + 10, imgW = (W - 140) / 2, imgH = imgW * 11 / 9;
  for (const [i, k] of [['0', 'bare'], ['1', 'mine']]) {
    const x = 60 + Number(i) * (imgW + 20);
    c.fillStyle = '#e9e5de'; roundRect(c, x, imgY, imgW, imgH, 20); c.fill();
    if (session.images[k]) { const im = await loadImg(session.images[k]); c.save(); roundRect(c, x, imgY, imgW, imgH, 20); c.clip(); c.drawImage(im, x, imgY, imgW, imgH); c.restore(); }
    c.fillStyle = '#6B6B6B'; c.font = '26px sans-serif'; c.textAlign = 'center'; c.fillText(k === 'bare' ? '쌩얼' : '내 화장', x + imgW / 2, imgY + imgH + 36); c.textAlign = 'left';
  }
  return cv;
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }

$('btnSave').onclick = async () => {
  const cv = await buildShareCard();
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
  const file = new File([blob], `danghwaeung-${Date.now()}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '당화응 결과' }); toast('갤러리·공유로 저장'); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('이미지 한 장으로 내려받음 (서버 전송 없음)');
};

// ---------------- 시연 패널: 편집 ----------------
function renderEditor() {
  let h = '<table class="parts"><tr><th>부위</th><th>상태</th><th>점수</th><th>좌우</th><th>진단 코드</th></tr>';
  for (const p of session.parts) {
    const isC = p.partId === CONTOUR_ID;
    const lr = p.metrics && typeof p.metrics.lrDiffMm === 'number'
      ? `<input data-f="lrDiffMm" data-id="${p.partId}" type="number" step="0.1" value="${p.metrics.lrDiffMm}">mm`
      : p.lrIndex ? `<input data-f="left" data-id="${p.partId}" type="number" value="${p.lrIndex.left}"> / <input data-f="right" data-id="${p.partId}" type="number" value="${p.lrIndex.right}">` : '—';
    const codes = CODES_BY_PART[p.partId].map((c) => `<label><input type="checkbox" data-code="${c}" data-id="${p.partId}" ${p.diagnosisCodes.includes(c) ? 'checked' : ''}> ${DIAG_TEXT[c]}</label>`).join('') || '<span class="muted">항상 확인만</span>';
    const statuses = isC ? ['check_only', 'in_progress', 'skipped', 'not_started'] : ['passed', 'check_only', 'in_progress', 'skipped', 'not_started'];
    h += `<tr><td><b>${PART_NAME[p.partId]}</b></td>
      <td><select data-f="status" data-id="${p.partId}">${statuses.map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></td>
      <td>${isC ? '—' : `<input data-f="score" data-id="${p.partId}" type="number" min="0" max="100" value="${p.score ?? ''}" ${p.status !== 'passed' ? 'disabled' : ''}>`}</td>
      <td>${lr}</td><td class="codes">${codes}</td></tr>`;
  }
  $('partEditor').innerHTML = h + '</table>';
  $('partEditor').querySelectorAll('[data-f],[data-code]').forEach((el) => (el.onchange = onEdit));
}
function onEdit(e) {
  const el = e.target, id = el.dataset.id, p = session.parts.find((x) => x.partId === id);
  if (el.dataset.code) { const set = new Set(p.diagnosisCodes); el.checked ? set.add(el.dataset.code) : set.delete(el.dataset.code); p.diagnosisCodes = [...set]; p.diagnosis = ''; }
  else {
    const f = el.dataset.f, v = el.value;
    if (f === 'status') { p.status = v; if (v !== 'passed') p.score = null; else if (p.score == null) p.score = 70; }
    else if (f === 'score') p.score = v === '' ? null : Number(v);
    else if (f === 'lrDiffMm') p.metrics.lrDiffMm = Number(v);
    else if (f === 'left' || f === 'right') p.lrIndex[f] = Number(v);
  }
  p.updatedAt = Date.now(); save(); renderEditor(); renderPhone();
}
$('btnPreset1').onclick = () => { session.parts = presetSmoky(); save(); renderEditor(); renderPhone(); };
$('btnPreset2').onclick = () => { session.parts = presetTwoCheck(); save(); renderEditor(); renderPhone(); };
$('btnPreset3').onclick = () => { session.parts = presetNone(); save(); renderEditor(); renderPhone(); };
$('btnRecheck').onclick = () => {
  const b = session.parts.find((p) => p.partId === 'brow');
  session.parts = upsertPart(session.parts, { ...b, status: 'passed', score: Math.min(100, (b.score ?? 60) + 10), diagnosisCodes: [] });
  save(); renderEditor(); renderPhone(); toast('눈썹 다시 확인 → 최신 점수로 합산');
};

// ---------------- 시연 패널: 사진 (MediaPipe 정렬) ----------------
let landmarker = null;
async function getLandmarker() {
  if (landmarker) return landmarker;
  const { FaceLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' }, runningMode: 'IMAGE', numFaces: 1 };
  try { landmarker = await FaceLandmarker.createFromOptions(files, opts); } catch { opts.baseOptions.delegate = 'CPU'; landmarker = await FaceLandmarker.createFromOptions(files, opts); }
  return landmarker;
}
const eyeRel = {};
function cropBox(lm, w, h) {
  const xs = lm.map((p) => p.x * w), ys = lm.map((p) => p.y * h);
  const browTop = Math.min(...[70, 63, 105, 66, 107, 300, 293, 334, 296, 336].map((i) => ys[i]));
  const chin = ys[152], faceH = chin - browTop;
  const top = browTop - faceH * 0.15, bottom = chin + faceH * 0.10;
  const left = Math.min(...xs), right = Math.max(...xs), faceW = right - left;
  return { x: left - faceW * 0.05, y: top, w: faceW * 1.1, h: bottom - top };
}
async function onPhoto(which, file) {
  if (!file) return;
  $('alignInfo').textContent = '랜드마크 검출 중…';
  const url = URL.createObjectURL(file); const img = await loadImg(url);
  const res = (await getLandmarker()).detect(img);
  if (!res.faceLandmarks.length) { $('alignInfo').textContent = '얼굴을 찾지 못했습니다'; return; }
  const lm = res.faceLandmarks[0], box = cropBox(lm, img.width, img.height);
  const cv = $(which === 'bare' ? 'cvBare' : 'cvMine'); const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height); c.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, cv.width, cv.height);
  const ec = { x: (lm[468].x + lm[473].x) / 2 * img.width, y: (lm[468].y + lm[473].y) / 2 * img.height };
  eyeRel[which] = { x: (ec.x - box.x) / box.w, y: (ec.y - box.y) / box.h };
  session.images[which] = cv.toDataURL('image/jpeg', 0.8); save(); renderPhone();
  if (eyeRel.bare && eyeRel.mine) {
    const dx = Math.abs(eyeRel.bare.x - eyeRel.mine.x) * 100, dy = Math.abs(eyeRel.bare.y - eyeRel.mine.y) * 100;
    $('alignInfo').textContent = `눈 중심 정렬 오차: 가로 ${dx.toFixed(1)}% · 세로 ${dy.toFixed(1)}% → ${dx <= 3 && dy <= 3 ? '통과 (3% 이내)' : '초과'}`;
  } else $('alignInfo').textContent = '한 장 더 넣으면 정렬 오차를 계산합니다';
}
$('fileBare').onchange = (e) => onPhoto('bare', e.target.files[0]);
$('fileMine').onchange = (e) => onPhoto('mine', e.target.files[0]);

// ---------------- 시연 패널: 검증 ----------------
$('btnRunTests').onclick = async () => { $('testOut').textContent = '실행 중…'; const m = await import('./tests-browser.js'); $('testOut').textContent = m.run(); };
$('btnPreviewCard').onclick = async () => { const cv = await buildShareCard(); const pv = $('cardPreview'); pv.hidden = false; pv.getContext('2d').drawImage(cv, 0, 0, pv.width, pv.height); $('testOut').textContent = '저장될 이미지(1080×1350) 미리보기. 합산 숫자, 부위 막대·한 줄 평, 쌩얼 vs 내 화장. 숫자 지표·보정 없음.'; };
$('btnPersist').onclick = () => {
  save(); const back = load();
  const same = back && JSON.stringify(back.parts) === JSON.stringify(session.parts);
  const bytes = new Blob([localStorage.getItem(KEY) || '']).size;
  $('testOut').textContent = `세션 임시 저장 → 다시 읽기: ${same ? 'PASS (부위 결과 동일)' : 'FAIL'}\n저장 크기: ${(bytes / 1024).toFixed(1)} KB (사진 포함)\n페이지를 새로고침해도 같은 화면이 나오면 복원 OK. "끝내기"를 누르면 이 저장이 지워집니다.`;
};
$('btnPerf').onclick = () => { const t0 = performance.now(); for (let i = 0; i < 1000; i++) computeSummary(session.parts, session.template); const dt = performance.now() - t0; $('testOut').textContent = `computeSummary 1,000회: ${dt.toFixed(1)} ms (회당 ${(dt / 1000).toFixed(3)} ms) → 리뷰 화면 2초 기준 대비 여유 충분`; };

// ---------------- 탭 ----------------
document.querySelectorAll('nav .tab').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('nav .tab').forEach((x) => x.classList.remove('active')); b.classList.add('active');
  for (const t of ['edit', 'photo', 'verify']) $('tab' + t[0].toUpperCase() + t.slice(1)).hidden = t !== b.dataset.tab;
}));

// ---------------- 초기화 ----------------
renderEditor(); renderPhone();
if (location.hash === '#verify-run') { document.querySelector('[data-tab=verify]').click(); $('btnRunTests').click(); }
if (location.hash === '#done') $('btnFinish').click();
if (location.hash === '#preset2') $('btnPreset2').click();
if (location.hash === '#preset3') $('btnPreset3').click();
