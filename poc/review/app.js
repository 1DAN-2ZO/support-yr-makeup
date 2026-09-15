import {
  PART_IDS, PART_NAME, DIAG_TEXT, DEFAULT_TEMPLATE,
  computeSummary, upsertPart, topMisses, lightingDiffers, trendSeries, HistoryStore, makeRecord,
} from './core.js';

// ---------------- 상태 ----------------
const CODES_BY_PART = {
  brow: ['BROW_TAIL_SHORT', 'BROW_LR_DIFF'],
  liner: ['LINER_WING_HIGH_R', 'LINER_WING_LOW_L', 'LINER_THICK'],
  shadow: ['SHADOW_DIR'],
  lip: ['LIP_OUT_LOWER'],
  cheek: ['CHEEK_LR_DIFF', 'CONTOUR_TOO_DARK'],
};
const DIAG_SENTENCE = {
  brow: '좌우 대칭 양호', liner: '오른쪽 꼬리 2mm 위', shadow: '방향 일치', lip: '아래 경계 1mm 밖', cheek: '오른쪽 진함',
};

let parts = presetSmoky();
let template = { ...DEFAULT_TEMPLATE };
const lsAdapter = {
  load: () => { try { return JSON.parse(localStorage.getItem('mc_history') || '[]'); } catch { return []; } },
  save: (arr) => localStorage.setItem('mc_history', JSON.stringify(arr)),
};
let store = new HistoryStore(lsAdapter, 100);
let images = { preview: null, actual: null }; // {img, landmarks}

function P(partId, status, score, extra = {}) {
  return { partId, status, score, diagnosis: DIAG_SENTENCE[partId], metrics: {}, lrIndex: null, diagnosisCodes: [], attempts: 1, updatedAt: Date.now(), ...extra };
}
function presetSmoky() {
  return [
    P('brow', 'passed', 88, { metrics: { lrDiffMm: 0.6 }, diagnosisCodes: [] }),
    P('liner', 'passed', 82, { metrics: { lrDiffMm: 1.5 }, diagnosisCodes: ['LINER_WING_HIGH_R'] }),
    P('shadow', 'check_only', null, { diagnosisCodes: [] }),
    P('lip', 'passed', 79, { metrics: { colorAb: { a: 28, b: 12 } }, diagnosisCodes: ['LIP_OUT_LOWER'] }),
    P('cheek', 'passed', 71, { metrics: { colorAb: { a: 24, b: 14 } }, lrIndex: { left: 41, right: 58 }, diagnosisCodes: ['CHEEK_LR_DIFF'] }),
  ];
}
function presetCheckOne() {
  const p = presetSmoky(); p[2] = P('shadow', 'passed', 75, { diagnosisCodes: ['SHADOW_DIR'] }); p[1].status = 'check_only'; p[1].score = null; return p;
}
function presetAllCheck() { return PART_IDS.map((id) => P(id, 'check_only', null)); }

// ---------------- 탭 ----------------
const views = { review: viewReview, history: viewHistory, verify: viewVerify };
for (const [k, el] of Object.entries({ review: tabReview, history: tabHistory, verify: tabVerify })) {
  el.onclick = () => { for (const t of [tabReview, tabHistory, tabVerify]) t.classList.remove('active'); el.classList.add('active');
    for (const v of Object.values(views)) v.hidden = true; views[k].hidden = false; if (k === 'history') renderHistory(); };
}

// ---------------- 화면 7: 편집기 ----------------
function renderEditor() {
  let h = '<table class="parts"><tr><th>부위</th><th>상태</th><th>점수</th><th>좌우</th><th>색 a/b</th><th>진단 코드</th></tr>';
  for (const p of parts) {
    const lr = p.metrics && typeof p.metrics.lrDiffMm === 'number' ? `<input data-f="lrDiffMm" data-id="${p.partId}" type="number" step="0.1" value="${p.metrics.lrDiffMm}" title="좌우 차 mm">mm`
      : p.lrIndex ? `<input data-f="left" data-id="${p.partId}" type="number" value="${p.lrIndex.left}" title="좌 지수"> / <input data-f="right" data-id="${p.partId}" type="number" value="${p.lrIndex.right}" title="우 지수">` : '—';
    const ab = p.metrics && p.metrics.colorAb ? `<input data-f="a" data-id="${p.partId}" type="number" value="${p.metrics.colorAb.a}"> / <input data-f="b" data-id="${p.partId}" type="number" value="${p.metrics.colorAb.b}">` : '—';
    const codes = CODES_BY_PART[p.partId].map((c) => `<label><input type="checkbox" data-code="${c}" data-id="${p.partId}" ${p.diagnosisCodes.includes(c) ? 'checked' : ''}> ${DIAG_TEXT[c]}</label>`).join('');
    h += `<tr><td><b>${PART_NAME[p.partId]}</b></td>
      <td><select data-f="status" data-id="${p.partId}">${['passed', 'check_only', 'skipped', 'not_started'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><input data-f="score" data-id="${p.partId}" type="number" min="0" max="100" value="${p.score ?? ''}" ${p.status !== 'passed' ? 'disabled' : ''}></td>
      <td>${lr}</td><td>${ab}</td><td class="codes">${codes}</td></tr>`;
  }
  partEditor.innerHTML = h + '</table>';
  partEditor.querySelectorAll('[data-f]').forEach((el) => el.onchange = onEdit);
  partEditor.querySelectorAll('[data-code]').forEach((el) => el.onchange = onEdit);
}
function onEdit(e) {
  const el = e.target, id = el.dataset.id, p = parts.find((x) => x.partId === id);
  if (el.dataset.code) { const set = new Set(p.diagnosisCodes); el.checked ? set.add(el.dataset.code) : set.delete(el.dataset.code); p.diagnosisCodes = [...set]; }
  else {
    const f = el.dataset.f, v = el.value;
    if (f === 'status') { p.status = v; if (v !== 'passed') p.score = null; else if (p.score == null) p.score = 70; }
    else if (f === 'score') p.score = v === '' ? null : Number(v);
    else if (f === 'lrDiffMm') p.metrics.lrDiffMm = Number(v);
    else if (f === 'left' || f === 'right') p.lrIndex[f] = Number(v);
    else if (f === 'a' || f === 'b') p.metrics.colorAb[f] = Number(v);
  }
  p.updatedAt = Date.now();
  renderEditor(); renderReview();
}
harmMax.onchange = harmOff.onchange = wCheek.onchange = () => {
  template = { ...DEFAULT_TEMPLATE, weights: { ...DEFAULT_TEMPLATE.weights, cheek: Number(wCheek.value) }, harmonyRange: harmOff.checked ? null : { maxDeltaAb: Number(harmMax.value) } };
  renderReview();
};
btnPreset1.onclick = () => { parts = presetSmoky(); renderEditor(); renderReview(); };
btnPreset2.onclick = () => { parts = presetCheckOne(); renderEditor(); renderReview(); };
btnPreset3.onclick = () => { parts = presetAllCheck(); renderEditor(); renderReview(); };
btnRecheck.onclick = () => {
  const b = parts.find((p) => p.partId === 'brow');
  parts = upsertPart(parts, { ...b, status: 'passed', score: Math.min(100, (b.score ?? 60) + 10), diagnosisCodes: [] });
  renderEditor(); renderReview(); toast('눈썹 재확인 → 최신 점수로 합산 재계산');
};

// ---------------- 화면 7: 리뷰 ----------------
function renderReview() {
  const t0 = performance.now();
  const s = computeSummary(parts, template);
  const dt = performance.now() - t0;
  total.textContent = s.total == null ? '—' : s.total;
  basis.textContent = s.total == null ? '측정된 부위가 없어요. 부위를 눌러 다시 확인받을 수 있어요' : `${s.partCount}개 중 ${s.measuredCount}개 부위 기준 · 가중 평균 ${s.base}`;
  penalty.textContent = `대칭 ${s.symmetryPenalty} · 조화 ${s.harmonyApplied ? s.harmonyPenalty : '—'}`;
  calcTime.textContent = `계산 ${dt.toFixed(2)} ms`;
  bars.innerHTML = parts.map((p) => `
    <div class="bar" data-id="${p.partId}">
      <div>${PART_NAME[p.partId]}<span class="st ${p.status}">${stLabel(p.status)}</span></div>
      <div class="track"><div class="fill" style="width:${p.score ?? 0}%"></div></div>
      <div><b>${p.score ?? '—'}</b></div>
      <div class="diag">${p.status === 'passed' || p.status === 'check_only' ? diagLine(p) : ''}</div>
    </div>`).join('');
  bars.querySelectorAll('.bar').forEach((el) => el.onclick = () => toast(`${PART_NAME[el.dataset.id]} 단계로 이동 (가이드 다시 표시, 확인받기 가능)`));
}
function stLabel(s) { return { passed: '통과', check_only: '확인만', skipped: '건너뜀', not_started: '미시작' }[s]; }
function diagLine(p) { const codes = p.diagnosisCodes.map((c) => DIAG_TEXT[c]).join(', '); return codes || p.diagnosis || ''; }
let toastT; function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 1800); }

// ---------------- 화면 7: 비교 이미지 (MediaPipe 정렬) ----------------
let landmarker = null;
async function getLandmarker() {
  if (landmarker) return landmarker;
  const { FaceLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'GPU' }, runningMode: 'IMAGE', numFaces: 1 };
  try { landmarker = await FaceLandmarker.createFromOptions(files, opts); }
  catch { opts.baseOptions.delegate = 'CPU'; landmarker = await FaceLandmarker.createFromOptions(files, opts); }
  return landmarker;
}
async function loadImage(file) { const url = URL.createObjectURL(file); const img = new Image(); await new Promise((r) => { img.onload = r; img.src = url; }); return img; }
// 크롭: 눈썹 위 15% ~ 턱 아래 10% (얼굴 높이 기준), 좌우는 얼굴 폭 + 10%
function cropBox(lm, w, h) {
  const xs = lm.map((p) => p.x * w), ys = lm.map((p) => p.y * h);
  const browTop = Math.min(ys[70], ys[63], ys[105], ys[66], ys[107], ys[300], ys[293], ys[334], ys[296], ys[336]);
  const chin = ys[152];
  const faceH = chin - browTop;
  const top = browTop - faceH * 0.15, bottom = chin + faceH * 0.10;
  const left = Math.min(...xs), right = Math.max(...xs);
  const faceW = right - left;
  return { x: left - faceW * 0.05, y: top, w: faceW * 1.1, h: bottom - top };
}
function eyeCenter(lm) { const l = lm[468], r = lm[473]; return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 }; }
async function onImage(which, file) {
  if (!file) return;
  alignInfo.textContent = '랜드마크 검출 중…';
  const img = await loadImage(file);
  const lmk = await getLandmarker();
  const res = lmk.detect(img);
  if (!res.faceLandmarks.length) { alignInfo.textContent = '얼굴을 찾지 못했습니다'; return; }
  images[which] = { img, lm: res.faceLandmarks[0] };
  drawCompare();
}
function drawCompare() {
  const info = [];
  for (const [which, cv] of [['preview', cvPreview], ['actual', cvActual]]) {
    const it = images[which]; if (!it) continue;
    const box = cropBox(it.lm, it.img.width, it.img.height);
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(it.img, box.x, box.y, box.w, box.h, 0, 0, cv.width, cv.height);
    const ec = eyeCenter(it.lm);
    const px = ((ec.x * it.img.width - box.x) / box.w), py = ((ec.y * it.img.height - box.y) / box.h);
    it.eyeRel = { x: px, y: py };
    ctx.strokeStyle = '#2A8C85'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px * cv.width, py * cv.height, 6, 0, Math.PI * 2); ctx.stroke();
  }
  if (images.preview && images.actual) {
    const dx = Math.abs(images.preview.eyeRel.x - images.actual.eyeRel.x) * 100, dy = Math.abs(images.preview.eyeRel.y - images.actual.eyeRel.y) * 100;
    const ok = dx <= 3 && dy <= 3;
    info.push(`눈 중심 정렬 오차: 가로 ${dx.toFixed(1)}% · 세로 ${dy.toFixed(1)}% → ${ok ? '통과 (3% 이내)' : '초과'}`);
    const lD = images.preview.lm, lA = images.actual.lm;
    info.push(`조명 참고: 두 사진의 이마 밝기 비교는 색 기준 이미지가 필요해 이 POC에선 생략`);
  }
  alignInfo.textContent = info.join(' · ') || '—';
}
imgPreview.onchange = (e) => onImage('preview', e.target.files[0]);
imgActual.onchange = (e) => onImage('actual', e.target.files[0]);

// ---------------- 저장 ----------------
btnSave.onclick = () => {
  const id = 'r' + Date.now();
  const rec = makeRecord({ id, date: new Date().toISOString(), lookId: lookName.value.trim() || '룩', lookName: lookName.value.trim() || '룩', parts: JSON.parse(JSON.stringify(parts)), template,
    previewImagePath: cvPreview.toDataURL('image/jpeg', 0.6), finalImagePath: cvActual.toDataURL('image/jpeg', 0.6), lightingRef: { foreheadL: Number(foreheadL.value) } });
  store = new HistoryStore(lsAdapter, Number(cap.value) || 100);
  const { removed } = store.save(rec);
  toast(`기록에 저장됨 (합산 ${rec.summary.total ?? '—'})${removed.length ? ` · 오래된 ${removed.length}회 삭제` : ''}`);
  tabHistory.click();
};

// ---------------- 화면 8 ----------------
function renderHistory() {
  store = new HistoryStore(lsAdapter, Number(cap.value) || 100);
  const recs = store.list();
  const looks = [...new Set(recs.map((r) => r.lookId))];
  const cur = lookFilter.value;
  lookFilter.innerHTML = '<option value="">전체</option>' + looks.map((l) => `<option value="${l}" ${l === cur ? 'selected' : ''}>${l}</option>`).join('');
  drawTrend(trendSeries(recs, lookFilter.value || null));
  const tm = topMisses(recs, 5);
  misses.innerHTML = tm.length ? tm.map((m) => `<div class="miss"><b>${m.part}</b> · ${m.text} · <b>${m.n}회 중 ${m.count}회</b></div>`).join('') : '<p class="hint">기록이 없습니다.</p>';
  const shown = recs.filter((r) => !lookFilter.value || r.lookId === lookFilter.value).slice().reverse();
  records.innerHTML = shown.map((r, i) => {
    const prev = shown[i + 1];
    const badge = prev && lightingDiffers(r.lightingRef, prev.lightingRef) ? '<span class="badge">조명 다름</span>' : '';
    const mini = PART_IDS.map((id) => { const p = r.parts.find((x) => x.partId === id); return `<span class="${p ? p.status : ''}" title="${PART_NAME[id]}"></span>`; }).join('');
    return `<div class="rec" data-id="${r.id}"><div>${r.date.slice(5, 10)}</div><div>${r.lookName} ${badge}</div><div><b>${r.summary.total ?? '—'}</b></div><div class="mini">${mini} <button data-del="${r.id}" title="삭제">✕</button></div></div>`;
  }).join('') || '<p class="hint">기록이 없습니다.</p>';
  records.querySelectorAll('.rec').forEach((el) => el.onclick = (e) => { if (e.target.dataset.del) return; renderDetail(el.dataset.id); });
  records.querySelectorAll('[data-del]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); if (confirm('이 회차를 삭제할까요?')) { store.delete(el.dataset.del); renderHistory(); detail.innerHTML = '<p class="hint">삭제됨</p>'; } });
}
function drawTrend(series) {
  const ctx = trend.getContext('2d'); const W = trend.width, H = trend.height; ctx.clearRect(0, 0, W, H);
  const padL = 34, padR = 12, padT = 12, padB = 24;
  ctx.strokeStyle = '#ddd'; ctx.fillStyle = '#6B6B6B'; ctx.font = '11px sans-serif';
  for (const y of [0, 50, 100]) { const yy = padT + (H - padT - padB) * (1 - y / 100); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.fillText(String(y), 6, yy + 4); }
  const n = series.length; if (!n) { ctx.fillText('기록 없음', W / 2 - 20, H / 2); return; }
  const xAt = (i) => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1));
  const yAt = (v) => padT + (H - padT - padB) * (1 - v / 100);
  ctx.strokeStyle = '#2A8C85'; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
  series.forEach((p, i) => { if (p.y == null) { started = false; return; } const x = xAt(i), y = yAt(p.y); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
  ctx.stroke();
  series.forEach((p, i) => { const x = xAt(i); if (p.y == null) { ctx.fillStyle = '#bbb'; ctx.fillText('—', x - 3, yAt(50)); } else { ctx.fillStyle = '#2A8C85'; ctx.beginPath(); ctx.arc(x, yAt(p.y), 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2B2B2B'; ctx.fillText(String(p.y), x - 8, yAt(p.y) - 8); }
    ctx.fillStyle = '#6B6B6B'; ctx.fillText(p.date.slice(5, 10), x - 16, H - 8); });
}
function renderDetail(id) {
  const r = store.get(id); if (!r) return;
  const s = r.summary;
  detail.innerHTML = `
    <div class="scorecard"><div class="big">${s.total ?? '—'}<small>/ 100</small></div><div class="sub">${s.partCount}개 중 ${s.measuredCount}개 부위 기준 · ${r.lookName} · ${r.date.slice(0, 16).replace('T', ' ')}</div><div class="sub">대칭 ${s.symmetryPenalty} · 조화 ${s.harmonyApplied ? s.harmonyPenalty : '—'}</div></div>
    ${r.parts.map((p) => `<div class="bar" data-id="${p.partId}"><div>${PART_NAME[p.partId]}<span class="st ${p.status}">${stLabel(p.status)}</span></div><div class="track"><div class="fill" style="width:${p.score ?? 0}%"></div></div><div><b>${p.score ?? '—'}</b></div><div class="diag">${diagLine(p)}${p.lrIndex ? ` · 좌 ${p.lrIndex.left} / 우 ${p.lrIndex.right}` : ''}</div></div>`).join('')}
    <div class="compare" style="margin-top:10px"><div><img src="${r.previewImagePath}" style="width:100%;border-radius:8px"><div class="cap">얹어보기</div></div><div><img src="${r.finalImagePath}" style="width:100%;border-radius:8px"><div class="cap">실제</div></div></div>
    <p class="hint">회차 상세는 화면 7 컴포넌트를 그대로 재사용. 부위 막대를 누르면 그 단계로 돌아가는 동작은 앱에서 구현.</p>`;
  detail.querySelectorAll('.bar').forEach((el) => el.onclick = () => toast(`${PART_NAME[el.dataset.id]} 단계로 이동`));
}
lookFilter.onchange = renderHistory;
cap.onchange = renderHistory;
btnClear.onclick = () => { if (confirm('모든 기록을 삭제할까요?')) { store.clear(); renderHistory(); detail.innerHTML = '<p class="hint">삭제됨</p>'; } };
btnSample.onclick = () => {
  const looks = ['스모키', '데일리 정돈'];
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.now() - (10 - i) * 86400000);
    const ps = presetSmoky().map((p) => ({ ...p, score: p.score == null ? null : Math.max(40, Math.min(100, p.score - 25 + i * 3 + Math.round(Math.random() * 6))) }));
    if (i === 4) ps.forEach((p) => { p.status = 'check_only'; p.score = null; }); // null 회차
    if (i % 3 === 0) ps[1].diagnosisCodes = ['LINER_WING_HIGH_R']; else ps[1].diagnosisCodes = i % 2 ? ['LINER_THICK'] : ['LINER_WING_HIGH_R'];
    const rec = makeRecord({ id: 'sample' + i + '_' + Date.now(), date: d.toISOString(), lookId: looks[i % 2], lookName: looks[i % 2], parts: ps, template, lightingRef: { foreheadL: 55 + (i % 4) * 5 } });
    store.save(rec);
  }
  renderHistory(); toast('예시 기록 10회 생성');
};

// ---------------- 검증 탭 ----------------
btnRunTests.onclick = async () => {
  testOut.textContent = '실행 중…';
  // tests.mjs 는 node 전용(process.exit) 이므로 브라우저용 러너로 같은 케이스를 import 해서 실행
  const mod = await import('./tests-browser.js');
  testOut.textContent = mod.run();
};
btnPersist.onclick = () => {
  const before = store.list().length;
  const rec = makeRecord({ id: 'persist_' + Date.now(), date: new Date().toISOString(), lookId: '검사', lookName: '검사', parts: presetSmoky(), template, lightingRef: { foreheadL: 60 } });
  store.save(rec);
  const again = new HistoryStore(lsAdapter, 100).get(rec.id);
  const same = again && JSON.stringify(again.summary) === JSON.stringify(rec.summary) && JSON.stringify(again.parts) === JSON.stringify(rec.parts);
  const bytes = new Blob([localStorage.getItem('mc_history') || '']).size;
  store.delete(rec.id);
  testOut.textContent = `저장→새 인스턴스로 복원: ${same ? 'PASS (요약·부위 동일)' : 'FAIL'}\n저장 전 ${before}회 → 저장 후 다시 ${store.list().length}회\nlocalStorage 사용량: ${(bytes / 1024).toFixed(1)} KB (회차당 이미지 포함 시 약 ${(bytes / 1024 / Math.max(1, before)).toFixed(1)} KB)\n페이지를 새로고침한 뒤 기록 탭을 열어 목록이 그대로인지도 확인하세요.`;
};
btnCapTest.onclick = () => {
  const s = new HistoryStore({ load: () => JSON.parse(sessionStorage.getItem('captest') || '[]'), save: (a) => sessionStorage.setItem('captest', JSON.stringify(a)) }, 100);
  s.clear(); let removedTotal = 0;
  for (let i = 1; i <= 101; i++) removedTotal += s.save(makeRecord({ id: 'c' + i, date: `2026-01-01T00:${String(i).padStart(2, '0')}:00`, lookId: 'x', lookName: 'x', parts: presetSmoky(), template })).removed.length;
  const list = s.list();
  testOut.textContent = `101회 저장 → 보관 ${list.length}회, 제거 ${removedTotal}회, 가장 오래된 남은 id = ${list[0].id} (기대 c2) → ${list.length === 100 && removedTotal === 1 && list[0].id === 'c2' ? 'PASS' : 'FAIL'}`;
  s.clear();
};
btnPerf.onclick = () => {
  const ps = presetSmoky(); const t0 = performance.now();
  for (let i = 0; i < 1000; i++) computeSummary(ps, template);
  const dt = performance.now() - t0;
  testOut.textContent = `computeSummary 1,000회: ${dt.toFixed(1)} ms (회당 ${(dt / 1000).toFixed(3)} ms) → 리뷰 화면 2초 기준 대비 여유 충분`;
};

// ---------------- 초기화 ----------------
renderEditor(); renderReview();
// #history-sample → 예시 10회 생성 후 기록 탭, #verify-run → 검증 탭에서 테스트 실행 (스크린샷·자동 확인용)
if (location.hash === '#history-sample') { btnSample.click(); tabHistory.click(); }
else if (location.hash === '#history') tabHistory.click();
else if (location.hash === '#verify-run') { tabVerify.click(); btnRunTests.click(); }
