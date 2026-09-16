// 화면 5·5-b 부위 결과 POC — 점수 + 내 화장 위 가이드 테두리 + 한 줄 평, 다음/건너뛰기
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import {
  PART_IDS, PART_NAME, PART_ORIENT, PARAMS, compareLinerEye, linerResult, compareRegion, browResult, compareLip, intensityIndex, intensityResult,
  lightCorr, decide, oneLiner, applyNext, applySkip, nextPartId, createSession, dE, alignToBaseline, makeupBiasPx,
} from './core.js';
import { cropSpec, LM } from './landmarks.js';
import { buildGuide } from './guides.js';
import { prepare, sampleAll } from './sampling.js';
import { synthesize, DEFAULTS, PRESETS } from './synth.js';

const $ = (id) => document.getElementById(id);
const SAMPLE_DIR = '../../danghaeung_poc_3x4_20/';
const SAMPLES = [1, 2, 3, 4, 5].flatMap((n) => ['front_open', 'front_closed'].map((s) => `person_${n}_${s}.jpg`));
const hash = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, v == null ? true : decodeURIComponent(v)]; }));

const S = {
  part: PART_IDS.includes(hash.part) ? hash.part : 'liner', face: null,
  bare: null, makeup: null,                 // { img|canvas, lmNorm, im }
  mode: 'synth', params: Object.fromEntries(PART_IDS.map((id) => [id, { ...DEFAULTS[id] }])), preset: {}, makeupFile: null,
  session: createSession(), result: null, dbg: !!hash.dbg,
};
if (hash.preset) applyPreset(S.part, hash.preset);
let toastT; const toast = (m) => { const el = $('toast'); el.textContent = m; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 1600); };

// ---------- 모델·소스 ----------
async function loadModel() {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate }, runningMode: 'IMAGE', numFaces: 1 });
  try { S.face = await FaceLandmarker.createFromOptions(files, opts('GPU')); } catch { S.face = await FaceLandmarker.createFromOptions(files, opts('CPU')); }
}
function detectOn(source, w, h) {
  const r = S.face.detect(source); const lm = r.faceLandmarks[0]; if (!lm) return null;
  return { lmNorm: lm, im: prepare(source, lm, w, h) };
}
function loadImage(url) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('이미지 로드 실패')); im.src = url; }); }
async function setBare(url) {
  const img = await loadImage(url); const w = Math.min(1080, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
  const d = detectOn(img, w, h); S.bare = d ? { img, w, h, ...d } : { img, w, h, lmNorm: null, im: null };
}
function buildMakeup() {
  const b = S.bare; if (!b || !b.im) return null;
  let src = b.img;
  if (S.mode === 'synth') src = synthesize(b.img, b.im.lm, S.part, S.params[S.part], b.w, b.h);
  else if (S.makeupFile) src = S.makeupFile;
  const d = detectOn(src, b.w, b.h);     // 화장 위에서 랜드마크 재검출 → 안정 점으로 기준 랜드마크를 정렬해 사용
  if (!d) return { src, lmNorm: null, im: null };
  const { lm, fit } = alignToBaseline(b.im.lm, d.im.lm);
  const bias = makeupBiasPx(lm, d.im.lm, [...LM.lipsOuter, ...LM.browA.upper, ...LM.browB.upper, ...LM.eyeA.upper, ...LM.eyeB.upper]);
  d.im.lmRaw = d.im.lm; d.im.lm = lm; d.im.mm = b.im.mm * fit.s;
  return { src, ...d, fit, bias };
}

// ---------- 채점 파이프라인 ----------
export function scorePart(part, bareIm, mkIm) {
  const base = sampleAll(bareIm, part), cur = sampleAll(mkIm, part), corr = lightCorr(base.fore, cur.fore), lightShift = cur.fore[0] - base.fore[0];
  let res;
  if (part === 'liner') res = linerResult({ R: compareLinerEye(base.R, cur.R, corr), L: compareLinerEye(base.L, cur.L, corr) });
  else if (part === 'brow') res = browResult(compareRegion(base.grid, cur.grid, corr, PARAMS.dEThresh.brow));
  else if (part === 'lip') res = compareLip(base.strip, cur.strip, corr);
  else {
    const side = (k) => intensityIndex(base[k].part, cur[k].part, base[k].ring, cur[k].ring, corr);
    const L = side('L'), R = side('R'); const present = Math.max(L.delta, R.delta) > PARAMS.tPresent[part];
    let directionOk = true;
    if (part === 'shadow') { const o = (k) => dE(base[k].outer, corr(cur[k].outer)) - dE(base[k].inner, corr(cur[k].inner)); directionOk = (o('L') + o('R')) / 2 > 0; }
    res = intensityResult(part, { L, R, present, directionOk });
    res.metrics.deltas = { L: L.delta, R: R.delta };
  }
  const decision = decide(part, res, { lightShift, noFace: false });
  return { ...res, decision, oneLiner: oneLiner(part, decision, res.codes), lightShift, samples: { base, cur } };
}
function run() {
  if (!S.bare) return;
  if (!S.bare.im) { S.result = { decision: { status: 'check_only', reason: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요' }, codes: [], oneLiner: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요', score: null }; S.makeup = null; render(); return; }
  S.makeup = buildMakeup();
  if (!S.makeup.im) { S.result = { decision: { status: 'check_only', reason: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요' }, codes: [], oneLiner: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요', score: null }; render(); return; }
  const t0 = performance.now(); S.result = scorePart(S.part, S.bare.im, S.makeup.im); S.result.ms = performance.now() - t0;
  render();
}

// ---------- 화면 ----------
const COLOR = { line: '#3FD1C4', hi: '#FFE27A', ref: 'rgba(255,255,255,.55)' };
function render() {
  const part = S.part, orient = PART_ORIENT[part];
  $('phone').classList.toggle('landscape', orient === 'landscape'); $('phone').classList.toggle('portrait', orient === 'portrait');
  const cv = $('view'), box = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr); const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  const mk = S.makeup;
  if (mk && mk.im) {
    const pts = mk.im.lm; let crop = cropSpec(part, pts, W / H);
    const asp = crop.w / crop.h, ccx = crop.x + crop.w / 2, ccy = crop.y + crop.h / 2;
    if (crop.h > mk.im.h) { crop.h = mk.im.h; crop.w = crop.h * asp; } if (crop.w > mk.im.w) { crop.w = mk.im.w; crop.h = crop.w / asp; }
    crop.x = Math.min(Math.max(0, ccx - crop.w / 2), mk.im.w - crop.w); crop.y = Math.min(Math.max(0, ccy - crop.h / 2), mk.im.h - crop.h);
    const s = W / crop.w; ctx.drawImage(mk.im.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    const M = (p) => [(p.x - crop.x) * s, (p.y - crop.y) * s];
    const g = buildGuide(part, pts); ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of g.regions) { ctx.strokeStyle = r.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.closePath(); ctx.stroke(); }
    for (const l of g.polylines) {
      if (l.style === 'arrow' || l.style === 'dot') continue;                       // 화면 5: 이탈 표시·화살표 없음, 테두리만
      ctx.strokeStyle = l.style === 'ref' ? COLOR.ref : l.kind === 'highlight' ? COLOR.hi : COLOR.line; ctx.setLineDash(l.style === 'solid' ? [] : [6 * dpr, 5 * dpr]); ctx.lineWidth = (l.style === 'ref' ? 1 : 2) * dpr;
      ctx.beginPath(); l.pts.forEach((p, i) => (i ? ctx.lineTo(...M(p)) : ctx.moveTo(...M(p)))); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (part === 'contour') { ctx.font = `${12 * dpr}px Malgun Gothic, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)'; for (const l of g.labels) ctx.fillText(l.text, ...M(l.anchor)); }
    if (S.dbg && S.result?.samples) drawDbg(ctx, M, dpr);
  }
  // 카드
  const r = S.result, d = r?.decision;
  const scored = d && d.status === 'scored';
  $('scorebox').hidden = !scored; $('checkchip').hidden = !!scored;
  $('score').textContent = scored ? r.score : '—';
  $('line').textContent = r ? r.oneLiner : '—';
  renderChips(); renderMetrics();
}
function drawDbg(ctx, M, dpr) {
  const { base, cur } = S.result.samples, corr = lightCorr(base.fore, cur.fore), part = S.part;
  const dot = (p, hit) => { const [x, y] = M(p); ctx.fillStyle = hit ? 'rgba(255,60,60,.8)' : 'rgba(255,255,255,.25)'; ctx.fillRect(x - dpr, y - dpr, 2 * dpr, 2 * dpr); };
  const th = PARAMS.dEThresh[part];
  if (part === 'liner') for (const k of ['R', 'L']) cur[k].pos.forEach((row, i) => row.forEach((p, j) => dot(p, dE(base[k].lab[i][j], corr(cur[k].lab[i][j])) >= th)));
  else if (part === 'lip') cur.strip.pos.forEach((row, i) => row.forEach((p, j) => dot(p, dE(base.strip.lab[i][j], corr(cur.strip.lab[i][j])) >= th)));
  else if (part === 'brow') cur.grid.pos.forEach((p, i) => dot(p, dE(base.grid.lab[i], corr(cur.grid.lab[i])) >= th));
}
function renderChips() {
  const st = { not_started: '미시작', in_progress: '진행 중', passed: '완료', check_only: '확인만', skipped: '건너뜀' };
  $('chips').innerHTML = S.session.parts.map((p) => `<span class="chip ${p.partId === S.part ? 'current' : ''}">${PART_NAME[p.partId]} · ${p.partId === S.part && p.status === 'not_started' ? '진행 중' : st[p.status]}${p.score != null ? ' ' + p.score : ''}</span>`).join('');
}
function renderMetrics() {
  const r = S.result; if (!r) { $('metricsOut').textContent = '—'; return; }
  const f = (v) => typeof v === 'number' ? +v.toFixed(2) : v;
  const m = JSON.parse(JSON.stringify(r.metrics || {}, (k, v) => (typeof v === 'number' ? f(v) : v)));
  $('metricsOut').textContent = [
    `부위 ${PART_NAME[S.part]} · 상태 ${r.decision.status}${r.decision.reason ? ' (' + r.decision.reason + ')' : ''} · 점수 ${r.score ?? 'null'} · 처리 ${f(r.ms)}ms`,
    `진단 코드: ${r.codes?.length ? r.codes.join(', ') : '(없음)'}`, `한 줄 평: ${r.oneLiner}`,
    `조명 변화(이마 L*): ${f(r.lightShift)} (허용 ±${PARAMS.lightTol}) · px/mm 기준 ${f(S.bare?.im?.mm)} / 화장 ${f(S.makeup?.im?.mm)}`,
    `정렬(기준→현재): 크기 ${f(S.makeup?.fit?.s)} · 회전 ${f(S.makeup?.fit?.deg)}° · 안정 점 잔차 ${f(S.makeup?.fit?.residual)}px · 화장 부위 랜드마크 편향(재검출 vs 정렬) ${f(S.makeup?.bias)}px`,
    `가상 화장 파라미터: ${S.mode === 'synth' ? JSON.stringify(S.params[S.part]) : '(사진 파일)'}`,
    '', '내부 지표 (화면 비표시):', JSON.stringify(m, null, 1),
  ].join('\n');
}

// ---------- 버튼: 다음 / 건너뛰기 ----------
$('btnNext').onclick = () => {
  const r = S.result; if (!r) return;
  S.session = applyNext(S.session, S.part, { status: r.decision.status, score: r.score, codes: r.codes, oneLiner: r.oneLiner, reason: r.decision.reason });
  const nx = nextPartId(S.session, S.part);
  toast(nx ? `${r.decision.status === 'check_only' ? '확인만' : '이 점수로 확정'} → 다음: ${PART_NAME[nx]}` : '모든 부위 끝 → 화면 6 전체 리뷰');
  if (nx) { setPart(nx); }
  else renderChips();
};
$('btnSkip').onclick = () => {
  S.session = applySkip(S.session, S.part); const nx = nextPartId(S.session, S.part);
  toast(nx ? `건너뜀 (합산 제외) → 다음: ${PART_NAME[nx]}` : '모든 부위 끝 → 화면 6 전체 리뷰');
  if (nx) setPart(nx); else renderChips();
};

// ---------- 패널 ----------
function applyPreset(part, key) { const pr = PRESETS[part]?.[key]; if (!pr) return; S.params[part] = { ...DEFAULTS[part], ...pr.p }; S.preset[part] = key; }
function setPart(id) { S.part = id; if (!S.preset[id]) applyPreset(id, 'good'); renderPanel(); run(); }
const RANGES = { shift: [-3, 3, 0.1], angle: [-40, 40, 1], len: [-4, 4, 0.1], thick: [0.4, 3, 0.1], gap: [0, 0.8, 0.05], alpha: [0, 1, 0.05], tail: [0, 1, 0.05], over: [0, 3, 0.1], offset: [-2, 3, 0.1], hi: [0, 1, 0.05] };
function renderPanel() {
  $('partBtns').innerHTML = PART_IDS.map((id) => `<button data-id="${id}" class="${id === S.part ? 'on' : ''}">${PART_NAME[id]}</button>`).join(' ');
  $('partBtns').querySelectorAll('button').forEach((b) => (b.onclick = () => setPart(b.dataset.id)));
  const pr = PRESETS[S.part];
  $('presets').innerHTML = Object.entries(pr).map(([k, v]) => `<button data-k="${k}" class="${S.preset[S.part] === k ? 'on' : ''}">${v.label}</button>`).join(' ');
  $('presets').querySelectorAll('button').forEach((b) => (b.onclick = () => { applyPreset(S.part, b.dataset.k); renderPanel(); run(); }));
  const p = S.params[S.part];
  $('paramRow').innerHTML = '<b>편차</b>' + Object.entries(p).map(([k, v]) => {
    if (k === 'on') return `<label class="param"><input type="checkbox" data-k="on" ${v ? 'checked' : ''}> 화장 함</label>`;
    if (k === 'dir') return `<label class="param">방향 <select data-k="dir"><option value="outer" ${v === 'outer' ? 'selected' : ''}>눈꼬리 쪽</option><option value="inner" ${v === 'inner' ? 'selected' : ''}>안쪽</option></select></label>`;
    const base = Object.keys(RANGES).find((r) => k.startsWith(r)) || 'alpha', [lo, hi, st] = RANGES[base];
    return `<label class="param">${k} <input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${v}"><output>${v}</output></label>`;
  }).join('');
  $('paramRow').querySelectorAll('[data-k]').forEach((el) => (el.oninput = () => {
    const k = el.dataset.k; S.params[S.part][k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
    if (el.nextElementSibling) el.nextElementSibling.textContent = el.value; S.preset[S.part] = null; $('presets').querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  }));
  $('paramRow').querySelectorAll('input[type=range]').forEach((el) => (el.onchange = run));
  $('paramRow').querySelectorAll('input[type=checkbox],select').forEach((el) => (el.onchange = () => { el.oninput(); run(); }));
}
for (const s of SAMPLES) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('srcSample').appendChild(o); }
$('srcSample').onchange = async (e) => { await setBare(SAMPLE_DIR + e.target.value); run(); };
$('fileBare').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; await setBare(URL.createObjectURL(f)); run(); };
$('fileMakeup').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; S.makeupFile = await loadImage(URL.createObjectURL(f)); document.querySelector('input[name=mk][value=file]').checked = true; S.mode = 'file'; run(); };
document.querySelectorAll('input[name=mk]').forEach((r) => (r.onchange = () => { S.mode = r.value; $('presetRow').hidden = $('paramRow').hidden = S.mode !== 'synth'; run(); }));
$('dbgToggle').onchange = (e) => { S.dbg = e.target.checked; render(); };
$('btnRun').onclick = run;
$('btnReset').onclick = () => { S.session = createSession(); renderChips(); toast('세션 초기화'); };
document.querySelectorAll('nav .tab').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('nav .tab').forEach((x) => x.classList.remove('active')); b.classList.add('active');
  for (const t of ['input', 'metrics', 'verify']) $('tab' + t[0].toUpperCase() + t.slice(1)).hidden = t !== b.dataset.tab;
}));

// ---------- 검증 ----------
$('btnRunTests').onclick = async () => { $('testOut').textContent = '실행 중…'; const m = await import('./tests-browser.js'); $('testOut').textContent = m.run(); };
export async function sweep(only = null, log = (s) => ($('testOut').textContent = s)) {
  if (!S.bare?.im) return log('쌩얼 얼굴 검출 실패');
  const lines = [`프리셋 스윕 · 샘플 ${$('srcSample').value}`, ''], keepPart = S.part, keepParams = JSON.parse(JSON.stringify(S.params)); let pass = 0, n = 0;
  const parts = typeof only === 'string' && PART_IDS.includes(only) ? [only] : PART_IDS;
  console.log('[sweep] start', parts.join(','));
  for (const part of parts) for (const [key, pr] of Object.entries(PRESETS[part])) {
    S.part = part; S.params[part] = { ...DEFAULTS[part], ...pr.p };
    let mk, ok, got;
    try { mk = buildMakeup(); } catch (e) { mk = null; got = '오류 ' + e.message; }
    if (!mk?.im) { ok = false; got = got || '얼굴 검출 실패'; }
    else try {
      const r = scorePart(part, S.bare.im, mk.im); got = `${r.decision.status}${r.score != null ? ' ' + r.score : ''} [${r.codes.join(',')}]`;
      const f = (v) => (typeof v === 'number' ? v.toFixed(2) : '-'), pe = r.metrics?.perEye;
      if (pe) got += ` cov ${f(pe.R.coverage)}/${f(pe.L.coverage)} ovf ${f(pe.R.overflow)}/${f(pe.L.overflow)} dev ${f(pe.R.wingDevMm)}/${f(pe.L.wingDevMm)} gap ${f(pe.R.gapRatio)}/${f(pe.L.gapRatio)} thk ${f(r.metrics.thicknessMm)}`;
      else if (r.metrics?.lrIndex) got += ` idx ${f(r.metrics.lrIndex.left)}/${f(r.metrics.lrIndex.right)} Δ ${f(r.metrics.deltas?.L)}/${f(r.metrics.deltas?.R)}`;
      else if (r.metrics?.R) got += ` cov ${f(r.metrics.R.coverage)}/${f(r.metrics.L.coverage)} ovf ${f(r.metrics.R.overflow)}/${f(r.metrics.L.overflow)} tail ${f(r.metrics.R.tailCoverage)}/${f(r.metrics.L.tailCoverage)}`;
      else if (r.metrics) got += ` cov ${f(r.metrics.coverage)} ovU ${f(r.metrics.overU)} ovL ${f(r.metrics.overL)}`;
      if (pr.expect === 'check_only') ok = r.decision.status === 'check_only';
      else if (pr.expect.length === 0) ok = part === 'contour' ? r.codes.length === 0 : (r.decision.status === 'scored' && r.score >= 70 && !r.codes.some((c) => /LR_DIFF|OUT|GAP|SHORT|TONE_(OVER|UNDER)|DIR/.test(c)));
      else ok = pr.expect.every((c) => r.codes.includes(c)) && (part === 'contour' || r.decision.status === 'scored');
    } catch (e) { ok = false; got = '오류 ' + e.message; }
    n++; if (ok) pass++; console.log('[sweep]', part, key, ok ? 'PASS' : 'FAIL', got);
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${PART_NAME[part].padEnd(8)} ${pr.label.padEnd(10)} 기대 ${Array.isArray(pr.expect) ? (pr.expect.join(',') || '(코드 없음, 점수≥70)') : pr.expect}  →  ${got}`);
    log(lines.join('\n')); await new Promise((r) => setTimeout(r, 0));
  }
  S.part = keepPart; S.params = keepParams; lines.push('', `${pass}/${n} passed`); log(lines.join('\n')); run();
  return { pass, n };
}
$('btnSweep').onclick = () => sweep(null);
$('btnRepeat').onclick = () => {
  if (!S.bare?.im) return; const scores = [], ms = [];
  for (let i = 0; i < 5; i++) { const mk = buildMakeup(); const t0 = performance.now(); const r = scorePart(S.part, S.bare.im, mk.im); ms.push(performance.now() - t0); scores.push(r.score); }
  $('testOut').textContent = `같은 입력 5회 채점 (가상 화장 생성 + 랜드마크 재검출 포함)\n점수: ${scores.join(', ')} → 편차 ${Math.max(...scores.filter((s) => s != null)) - Math.min(...scores.filter((s) => s != null)) || 0}\n채점 시간: ${ms.map((v) => v.toFixed(0)).join(', ')} ms`;
};

// ---------- 시작 ----------
(async () => {
  renderPanel(); renderChips();
  try { await loadModel(); } catch (e) { $('loading').textContent = '모델 로딩 실패: ' + e.message; return; }
  $('loading').hidden = true;
  $('srcSample').value = SAMPLES.includes(hash.sample) ? hash.sample : SAMPLES[2];
  await setBare(SAMPLE_DIR + $('srcSample').value);
  if (!S.preset[S.part]) applyPreset(S.part, 'good');
  renderPanel(); run();
  if (hash.sweep) { document.querySelector('[data-tab=verify]').click(); await sweep(hash.sweep); }
  if (hash.verify) { document.querySelector('[data-tab=verify]').click(); $('btnRunTests').click(); }
})();
