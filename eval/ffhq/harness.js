// FFHQ-Makeup 쌍(맨얼굴 + 화장 5종)을 팀 채점기(poc/full/lib/score.js)에 그대로 넣어 보는 실험 페이지.
// app.js 의 rProcessing(기준 생성) + rResult(정합) + scorePart(채점) 흐름을 같은 함수로 따라 한다.
// 비교군: 맨얼굴 vs 맨얼굴(자기 자신) — 화장이 없으니 "화장 없음"이 나와야 정상.
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { prepare, sampleAll } from '../../poc/full/lib/sampling.js';
import { PARAMS as SP, compareLinerEye, linerResult, compareRegion, browResult, compareLip, intensityIndex, intensityResult, lightCorr, decide, alignToBaseline, dE } from '../../poc/full/lib/score.js';
import { LM } from '../../poc/full/lib/landmarks.js';

// 저장소 샘플 중 맨얼굴·화장 5종이 모두 있는 10명. 나머지 10명은 파일 이름 형식이 달라(쌍이 아님) 뺀다
const IDS = ['002386', '002395', '002690', '003125', '003206', '003228', '003393', '003417', '003419', '003611'];
const STYLES = ['bare', 'makeup_01', 'makeup_02', 'makeup_03', 'makeup_04', 'makeup_05'];
const PARTS = ['brow', 'liner', 'shadow', 'lip', 'cheek'];
const ALIGN_RESIDUAL_MAX = 0.05;   // app.js 와 같은 값
const log = (s) => { document.getElementById('log').textContent += s + '\n'; };

async function loadImg(src) {
  const im = new Image(); im.src = src; await im.decode();
  const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0); return cv;
}

// app.js scorePart 와 같은 분기
function scorePart(part, bareIm, mkIm) {
  const base = sampleAll(bareIm, part), cur = sampleAll(mkIm, part), corr = lightCorr(base.fore, cur.fore), lightShift = cur.fore[0] - base.fore[0];
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
  return { ...res, decision, lightShift };
}

async function main() {
  log('모델 불러오는 중…');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate }, runningMode: 'IMAGE', numFaces: 1 });
  const delegate = new URLSearchParams(location.search).get('delegate') || 'GPU';   // 헤드리스 실행은 ?delegate=CPU
  const face = await FaceLandmarker.createFromOptions(files, opts(delegate)).catch(() => FaceLandmarker.createFromOptions(files, opts('CPU')));
  const detect = (cv) => { const r = face.detect(cv); const lm = r.faceLandmarks[0]; return lm ? lm.map((p) => ({ x: p.x * cv.width, y: p.y * cv.height, z: p.z })) : null; };

  const rows = [];
  for (const id of IDS) {
    const bare = await loadImg(`data/${id}_bare.jpg`), w = bare.width, h = bare.height;
    const bLm = detect(bare);
    if (!bLm) { log(`${id} 맨얼굴 얼굴 못 찾음`); continue; }
    const bIm = prepare(bare, bLm.map((p) => ({ x: p.x / w, y: p.y / h, z: p.z })), w, h);
    for (const style of STYLES) {
      let cap; try { cap = style === 'bare' ? bare : await loadImg(`data/${id}_${style}.jpg`); } catch { continue; }   // 샘플에 없는 스타일은 건너뜀
      const raw = detect(cap);
      if (!raw) { for (const part of PARTS) rows.push({ id, style, part, status: 'no_face' }); continue; }
      const { lm, fit } = alignToBaseline(bIm.lm, raw);
      const eyeW = Math.hypot(lm[LM.eyeB.outer].x - lm[LM.eyeA.outer].x, lm[LM.eyeB.outer].y - lm[LM.eyeA.outer].y);
      const residual = fit.residual / eyeW;
      if (residual > ALIGN_RESIDUAL_MAX) { for (const part of PARTS) rows.push({ id, style, part, status: 'check_only', reason: 'align', residual }); continue; }
      const mkIm = prepare(cap, lm.map((p) => ({ x: p.x / w, y: p.y / h, z: p.z })), w, h); mkIm.lm = lm;
      for (const part of PARTS) {
        try {
          const r = scorePart(part, bIm, mkIm);
          rows.push({ id, style, part, status: r.decision.status, reason: r.decision.reason || '', present: r.present ?? null, score: r.score ?? null,
            codes: (r.codes || []).join('|'), lightShift: +r.lightShift.toFixed(2), residual: +residual.toFixed(4),
            metrics: JSON.stringify(r.metrics, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)).slice(0, 400) });
        } catch (e) { rows.push({ id, style, part, status: 'error', reason: String(e).slice(0, 80) }); }
      }
    }
    log(`${id} 완료`);
  }
  window.RESULTS = rows;
  const out = document.createElement('pre'); out.id = 'out'; out.textContent = JSON.stringify(rows); document.body.appendChild(out);
  log(`끝: ${rows.length}행`);
}
main().catch((e) => { log('오류: ' + e); window.RESULTS_ERROR = String(e); });
