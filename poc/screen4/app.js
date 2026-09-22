// 화면 4 POC — 실시간 테두리 + fps 측정 하네스
//
// 재려는 것 세 가지
//   1. 얼굴만 vs 얼굴+손 을 한 루프에 올렸을 때 30fps가 버티는지
//   2. requestVideoFrameCallback으로 바꾸면 중복 추론이 실제로 사라지는지
//   3. 각 단계(얼굴·손·품질·그리기)가 33ms 예산에서 몇 ms를 먹는지
//
// 카메라는 localhost 또는 https에서만 열린다.

import {
  IDX, DEFAULT_GUIDE, eyeGuide, matrixToEuler, resolveGate, Stability,
  LandmarkSmoother, toGray, laplacianVariance, srgbToLab, FrameStats, clamp,
  bboxOf, boxesOverlap, toPx,
  anglesFromLandmarks, earOf, EAR_CLOSED, blendScore, DiffStats, AgreeStats, PeakStats,
} from './core.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), octx = overlay.getContext('2d');

// 버전·해상도·델리게이트를 URL로 바꿔 가며 잰다.
//   ?v=1.0.1            런타임 버전
//   ?w=320&h=240        카메라 해상도 요청 (기본 640×480)
//   ?delegate=cpu       GPU 대신 CPU(WASM)로 강제
const Q = new URLSearchParams(location.search);
const MP_VERSION = Q.get('v') || '0.10.14';
const REQ = { w: parseInt(Q.get('w') || '640', 10), h: parseInt(Q.get('h') || '480', 10) };
const FORCE_DELEGATE = (Q.get('delegate') || '').toUpperCase();
// 얼굴 랜드마커의 후처리를 끄고 재기 위한 스위치.  ?bs=0  ?mat=0
// 이 둘은 랜드마크 뒤에 붙는 별도 계산이라 GPU→CPU 읽기를 유발할 수 있다.
const WANT_BS = Q.get('bs') !== '0';
const WANT_MAT = Q.get('mat') !== '0';
// 선명도·밝기를 몇 프레임마다 잴지.  ?gate=10
// 모바일에서 getImageData는 GPU→CPU 읽기라 가끔 크게 튄다.
const GATE_EVERY = Math.max(1, parseInt(Q.get('gate') || '5', 10));
const MODEL = {
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  hand: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};
const SAMPLE_W = 256;          // 선명도·밝기용 축소 캔버스 폭

const state = {
  face: null, hand: null,
  faceDelegate: '—', handDelegate: '—',
  loopMode: 'rvfc',            // rvfc | raf
  handMode: 'every',           // off | every | skip
  handSkip: 3,
  smoothing: false,   // MediaPipe 내장 필터로 충분한지 실측 중이라 기본은 끔
  running: false,
  // 측정
  total: new FrameStats(), faceMs: new FrameStats(), handMs: new FrameStats(),
  gateMs: new FrameStats(), drawMs: new FrameStats(),
  ticks: 0, inferences: 0, dupes: 0, newFrames: 0, wallStart: 0, lastVideoTime: -1,
  // 상태
  frameNo: 0, lastHand: null, baseline: null, camSettings: null,
  gateText: '준비 중', stable: new Stability(5), lastGate: null,
  // beta는 정규화 좌표 기준이라 1~20 규모다. 0이면 속도 적응이 꺼져 느리게 따라온다.
  smoother: new LandmarkSmoother({ minCutoff: 1.0, beta: 5.0 }),
  sample: null, sctx: null,
  sharp: null, brightL: null, euler: null,
  // A1 측정: 같은 프레임에서 두 경로를 계산해 차이를 쌓는다
  dYaw: new DiffStats(), dPitch: new DiffStats(), blinkAgree: new AgreeStats(), smilePeak: new PeakStats(),
  eulerMat: null, eulerLm: null, ear: null, blink: null, smile: null,
};

// ---------------- 초기화 ----------------

async function init() {
  setStatus(`MediaPipe ${MP_VERSION} 불러오는 중…`);
  const { FaceLandmarker, HandLandmarker, FilesetResolver } =
    await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);

  const make = async (Task, path, extra) => {
    // GPU가 안 잡히면 CPU로 떨어진다. 어느 쪽으로 돌았는지 기록해 둔다.
    for (const delegate of (FORCE_DELEGATE ? [FORCE_DELEGATE] : ['GPU', 'CPU'])) {
      try {
        const t = await Task.createFromOptions(files, {
          baseOptions: { modelAssetPath: path, delegate },
          runningMode: 'VIDEO', ...extra,
        });
        return { task: t, delegate };
      } catch (e) { if (delegate === 'CPU') throw e; }
    }
  };

  const f = await make(FaceLandmarker, MODEL.face, {
    numFaces: 1,                                  // 1일 때만 내장 스무딩이 걸린다
    outputFaceBlendshapes: WANT_BS,               // 눈 감음 판정용
    outputFacialTransformationMatrixes: WANT_MAT, // 고개 각도(정면성 게이트)용
  });
  state.face = f.task; state.faceDelegate = f.delegate;

  const h = await make(HandLandmarker, MODEL.hand, { numHands: 1 });
  state.hand = h.task; state.handDelegate = h.delegate;

  state.sample = document.createElement('canvas');
  state.sctx = state.sample.getContext('2d', { willReadFrequently: true });

  $('btnStart').disabled = false;
  setStatus('준비 완료. "카메라 시작"을 누르세요');
  $('mpVersion').textContent = MP_VERSION;
  $('delegate').textContent = `얼굴 ${state.faceDelegate} · 손 ${state.handDelegate}`;
  // 교차 출처 격리가 켜져야 WASM이 여러 스레드를 쓴다. 안 켜지면 CPU 경로가 단일 스레드로 돈다.
  $('isolated').textContent = `${self.crossOriginIsolated ? '가능' : '불가'} · 코어 ${navigator.hardwareConcurrency || '?'}`;
}

async function startCamera() {
  const tries = [
    { video: { facingMode: 'user', width: { ideal: REQ.w }, height: { ideal: REQ.h } }, audio: false },
    { video: true, audio: false },
  ];
  let stream = null, err = null;
  for (const c of tries) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { err = e; }
  }
  if (!stream) { setStatus(`카메라를 열 수 없습니다 [${err?.name}] ${err?.message || ''}`, true); return; }

  video.srcObject = stream;
  if (!video.videoWidth) await new Promise((r) => (video.onloadedmetadata = r));
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  // 카메라가 실제로 몇 fps를 주기로 했는지. 우리 처리 속도와 별개인 천장이다.
  // 어두우면 노출 시간이 길어져 웹캠이 스스로 30 → 20fps로 떨어뜨리는 일이 흔하다.
  const track = video.srcObject.getVideoTracks()[0];
  state.camSettings = track.getSettings ? track.getSettings() : {};
  const fr = state.camSettings.frameRate;
  $('res').textContent = `${video.videoWidth}×${video.videoHeight}${fr ? ` @${Math.round(fr)}fps` : ''}`;

  state.running = true;
  $('btnStart').disabled = true;
  $('btnBaseline').disabled = false;
  setStatus('측정 중');
  loop();
}

// ---------------- 루프 ----------------

let lastTs = 0;
const nextTs = () => (lastTs = Math.max(lastTs + 1, Math.round(performance.now())));

function loop() {
  if (!state.running) return;
  const t0 = performance.now();
  state.ticks++;

  // 새 프레임인지 확인. rAF 모드에서 이 값이 안 바뀌면 중복 추론이다.
  if (!state.wallStart) state.wallStart = t0;
  const isNew = video.currentTime !== state.lastVideoTime;
  if (isNew) state.newFrames++; else state.dupes++;
  state.lastVideoTime = video.currentTime;

  // rVFC는 새 프레임마다만 호출되므로 항상 추론한다.
  // rAF는 중복 여부를 재기 위해 일부러 그냥 추론한다(교체 전 상태 재현).
  step(t0);

  state.total.push(performance.now() - t0);
  if (state.ticks % 15 === 0) renderHud();

  if (state.loopMode === 'rvfc' && video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(() => loop());
  } else {
    requestAnimationFrame(loop);
  }
}

function step(t0) {
  state.frameNo++;
  const ts = nextTs();

  // 1) 얼굴
  let face = null;
  const fa = performance.now();
  try { face = state.face.detectForVideo(video, ts); } catch { /* 프레임 스킵 */ }
  state.faceMs.push(performance.now() - fa);
  state.inferences++;

  let lm = face?.faceLandmarks?.[0] || null;
  if (!lm) { state.smoother.reset(); state.stable.reset(); }   // 얼굴이 사라지면 필터를 반드시 초기화
  if (lm && state.smoothing) lm = state.smoother.apply(lm, t0 / 1000);
  if (lm) comparePaths(face, lm);

  // 2) 손 — 모드에 따라 건너뛴다
  const wantHand = state.handMode === 'every'
    || (state.handMode === 'skip' && state.frameNo % state.handSkip === 0);
  if (wantHand) {
    const ha = performance.now();
    try { state.lastHand = state.hand.detectForVideo(video, ts + 1); } catch { /* 무시 */ }
    state.handMs.push(performance.now() - ha);
  } else if (state.handMode === 'off') {
    state.lastHand = null;
  }

  // 3) 품질 게이트
  const ga = performance.now();
  const gate = evaluateGate(lm, face);
  state.gateMs.push(performance.now() - ga);

  // 4) 그리기
  const da = performance.now();
  draw(lm, gate);
  state.drawMs.push(performance.now() - da);
}

// ---------------- 품질 게이트 ----------------

function evaluateGate(lm, face) {
  if (!lm) {
    state.lastGate = { ok: false, firstFail: 'face', message: '얼굴이 보이지 않아요' };
    state.stable.push(false);
    return state.lastGate;
  }
  const W = overlay.width, H = overlay.height;

  // 정면성 — 변환행렬에서 yaw·pitch
  const mat = face?.facialTransformationMatrixes?.[0];
  state.euler = mat ? matrixToEuler(mat.data) : null;
  const front = state.euler ? (Math.abs(state.euler.yaw) <= 15 && Math.abs(state.euler.pitch) <= 10) : true;

  // 양쪽 눈이 화면 안에 있는지
  const eyeIdx = [...IDX.lashL, ...IDX.lashR];
  const eyes = eyeIdx.every((i) => lm[i] && lm[i].x > 0.02 && lm[i].x < 0.98 && lm[i].y > 0.02 && lm[i].y < 0.98);

  // 손이 얼굴 박스를 침범했는지
  const faceBox = bboxOf(IDX.faceOval.map((i) => toPx(lm, i, W, H)));
  let hand = true;
  const hlm = state.lastHand?.landmarks?.[0];
  if (hlm) {
    const hb = bboxOf(hlm.map((p) => ({ x: p.x * W, y: p.y * H })));
    hand = !boxesOverlap(faceBox, hb);
  }

  // 선명도·밝기 — 비싸므로 몇 프레임에 한 번만
  if (state.frameNo % GATE_EVERY === 0) measureImage(faceBox, lm);
  const b = state.baseline;
  const sharp = b && state.sharp != null ? state.sharp >= b.sharp * 0.6 : true;
  const bright = b && state.brightL != null ? Math.abs(state.brightL - b.brightL) <= 12 : true;

  const gate = resolveGate({ front, eyes, hand, sharp, bright });
  state.stable.push(gate.ok);
  state.lastGate = gate;
  return gate;
}

/** 축소 캔버스에 얼굴만 그려 라플라시안 분산과 이마 L*를 잰다. */
function measureImage(faceBox, lm) {
  const W = overlay.width, H = overlay.height;
  const x0 = clamp(Math.floor(faceBox.x0), 0, W - 2), y0 = clamp(Math.floor(faceBox.y0), 0, H - 2);
  const bw = clamp(Math.ceil(faceBox.w), 2, W - x0), bh = clamp(Math.ceil(faceBox.h), 2, H - y0);
  const sw = Math.min(SAMPLE_W, bw), sh = Math.max(2, Math.round((bh / bw) * sw));
  state.sample.width = sw; state.sample.height = sh;
  try { state.sctx.drawImage(video, x0, y0, bw, bh, 0, 0, sw, sh); } catch { return; }
  const img = state.sctx.getImageData(0, 0, sw, sh);
  state.sharp = laplacianVariance(toGray(img.data, sw, sh), sw, sh);

  // 이마 평균 L* — 얼굴 박스 기준 상대 좌표로 샘플
  let sum = 0, n = 0;
  for (const i of IDX.forehead) {
    const p = toPx(lm, i, W, H);
    const sx = Math.round(((p.x - x0) / bw) * sw), sy = Math.round(((p.y - y0) / bh) * sh);
    if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
    const o = (sy * sw + sx) * 4;
    sum += srgbToLab(img.data[o], img.data[o + 1], img.data[o + 2])[0];
    n++;
  }
  if (n) state.brightL = sum / n;
}

// ---------------- 그리기 ----------------

function draw(lm, gate) {
  const W = overlay.width, H = overlay.height;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, W, H);
  if (!lm) return;

  octx.save();
  octx.translate(W, 0); octx.scale(-1, 1);   // 거울 모드. 영상도 CSS로 뒤집혀 있다

  const active = state.stable.ok;
  for (const side of ['L', 'R']) {
    const g = eyeGuide({
      lash: IDX[`lash${side}`].map((i) => toPx(lm, i, W, H)),
      inner: toPx(lm, IDX[`inner${side}`], W, H),
      outer: toPx(lm, IDX[`outer${side}`], W, H),
      irisC: toPx(lm, IDX[`irisC${side}`], W, H),
    }, DEFAULT_GUIDE);

    // v6 규칙: 선만. 면 채우기 없음
    octx.strokeStyle = active ? '#2A8C85' : 'rgba(42,140,133,0.45)';
    octx.lineWidth = Math.max(1.5, W / 640);
    octx.setLineDash([]);
    stroke(g.upper); stroke(g.lower);
    octx.setLineDash([6, 5]);
    octx.lineWidth = Math.max(1, W / 900);
    stroke(g.center);
    octx.setLineDash([]);
  }

  // 손이 잡히면 옅은 점으로만 (디버그용)
  const hlm = state.lastHand?.landmarks?.[0];
  if (hlm) {
    octx.fillStyle = 'rgba(194,115,31,0.85)';
    for (const p of hlm) { octx.beginPath(); octx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2); octx.fill(); }
  }
  octx.restore();

  state.gateText = state.stable.ok ? '확인받을 준비 됨' : gate.message;
}

function stroke(pts) {
  octx.beginPath();
  pts.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
  octx.stroke();
}

// ---------------- HUD ----------------

const fmt = (s) => `${s.avg.toFixed(1)} / ${s.p95.toFixed(1)}`;

/**
 * 실제로 처리한 새 카메라 프레임 수 / 초.
 * 루프가 몇 번 돌았는지가 아니다. rAF 모드에서는 같은 프레임을 다시 추론하므로
 * 루프 속도만 보면 빨라 보이지만 실제로 화면에 반영된 프레임은 훨씬 적다.
 */
function realFpsNow() {
  const e = state.wallStart ? (performance.now() - state.wallStart) / 1000 : 0;
  return e > 0.2 ? state.newFrames / e : 0;
}

/**
 * A1 측정 — 같은 프레임에서 두 경로를 계산해 차이를 쌓는다.
 * 어느 쪽이 옳은지는 판단하지 않는다. 행렬·블렌드셰이프가 켜져 있을 때만 비교가 쌓인다.
 */
function comparePaths(face, lm) {
  const W = overlay.width, H = overlay.height;
  const px = lm.map((p) => ({ x: p.x * W, y: p.y * H }));

  // 자세: 변환행렬(옵션) ↔ 랜드마크 근사(공짜)
  state.eulerLm = anglesFromLandmarks(px);
  const mat = face?.facialTransformationMatrixes?.[0];
  state.eulerMat = mat ? matrixToEuler(mat.data) : null;
  if (state.eulerMat) {
    state.dYaw.push(state.eulerMat.yaw, state.eulerLm.yaw);
    state.dPitch.push(state.eulerMat.pitch, state.eulerLm.pitch);
  }

  // 표정: 블렌드셰이프(옵션) ↔ EAR(공짜)
  state.ear = { R: earOf(px, 'R'), L: earOf(px, 'L') };
  const cats = face?.faceBlendshapes?.[0]?.categories || null;
  const bR = blendScore(cats, 'eyeBlinkRight'), bL = blendScore(cats, 'eyeBlinkLeft');
  state.blink = bR == null ? null : { R: bR, L: bL };
  if (bR != null) {
    state.blinkAgree.push(state.ear.R < EAR_CLOSED, bR > 0.5);
    state.blinkAgree.push(state.ear.L < EAR_CLOSED, bL > 0.5);
  }
  // 웃음은 EAR·MAR로 못 잡는 항목이라, 블렌드셰이프가 실제로 반응하는지만 본다
  if (cats) {
    state.smile = Math.max(blendScore(cats, 'mouthSmileLeft') ?? 0, blendScore(cats, 'mouthSmileRight') ?? 0);
    state.smilePeak.push(state.smile);
  } else state.smile = null;
}

function renderHud() {
  const t = state.total.summary();
  const real = realFpsNow();
  $('fps').textContent = real.toFixed(1);
  $('fpsBar').style.width = `${clamp((real / 60) * 100, 0, 100)}%`;
  $('fpsBar').className = 'bar ' + (real >= 30 ? 'good' : real >= 22 ? 'warn' : 'bad');
  $('capacity').textContent = `${t.fps.toFixed(1)} fps`;
  $('tTotal').textContent = fmt(t);
  $('tFace').textContent = fmt(state.faceMs.summary());
  $('tHand').textContent = state.handMs.summary().n ? fmt(state.handMs.summary()) : '—';
  $('tGate').textContent = fmt(state.gateMs.summary());
  $('tDraw').textContent = fmt(state.drawMs.summary());
  const dupPct = state.ticks ? (state.dupes / state.ticks) * 100 : 0;
  $('dupes').textContent = `${state.dupes} / ${state.ticks} (${dupPct.toFixed(1)}%)`;
  const el = state.wallStart ? (performance.now() - state.wallStart) / 1000 : 0;
  $('tickRate').textContent = el > 0.2 ? `${(state.ticks / el).toFixed(1)} /초` : '—';
  const dy = state.dYaw.summary(), dp = state.dPitch.summary();
  const deg = (s) => s.n ? `평균 ${s.mean.toFixed(1)}° p95 ${s.p95.toFixed(1)}° 최대 ${s.max.toFixed(1)}°` : '— (행렬 꺼짐)';
  $('dYaw').textContent = deg(dy);
  $('dPitch').textContent = deg(dp);
  const ba = state.blinkAgree.summary();
  $('blinkAgree').textContent = ba.n
    ? `${(ba.rate * 100).toFixed(1)}% (EAR만 감음 ${ba.aOnly} · BS만 감음 ${ba.bOnly})` : '— (BS 꺼짐)';
  const sp = state.smilePeak.summary();
  $('smileMax').textContent = sp.n ? `${sp.max.toFixed(2)} (평균 ${sp.mean.toFixed(2)})` : '— (BS 꺼짐)';
  $('gate').textContent = state.gateText;
  $('gate').className = 'gate ' + (state.stable.ok ? 'good' : 'warn');
  $('pose').textContent = state.euler
    ? `yaw ${state.euler.yaw.toFixed(1)}° · pitch ${state.euler.pitch.toFixed(1)}°` : '—';
  $('sharp').textContent = state.sharp == null ? '—'
    : state.baseline ? `${state.sharp.toFixed(0)} (기준 대비 ${(state.sharp / state.baseline.sharp * 100).toFixed(0)}%)`
      : state.sharp.toFixed(0);
  $('bright').textContent = state.brightL == null ? '—'
    : state.baseline ? `L* ${state.brightL.toFixed(1)} (기준차 ${(state.brightL - state.baseline.brightL).toFixed(1)})`
      : `L* ${state.brightL.toFixed(1)}`;
}

function report() {
  const S = (x) => { const s = x.summary(); return `avg ${s.avg.toFixed(2)}ms p95 ${s.p95.toFixed(2)}ms`; };
  return [
    `# 화면 4 fps 측정 — ${new Date().toISOString()}`,
    `기기: ${navigator.userAgent}`,
    `해상도: ${video.videoWidth}×${video.videoHeight} · MediaPipe ${MP_VERSION}`,
    `카메라가 주기로 한 fps: ${state.camSettings?.frameRate ?? '알 수 없음'}`,
    `WASM 멀티스레드: ${self.crossOriginIsolated ? '가능' : '불가'} · 논리 코어 ${navigator.hardwareConcurrency || '?'}`,
    `델리게이트: 얼굴 ${state.faceDelegate} · 손 ${state.handDelegate}`,
    `얼굴 후처리: 블렌드셰이프 ${WANT_BS ? 'on' : 'off'} · 변환행렬 ${WANT_MAT ? 'on' : 'off'}`,
    `루프: ${state.loopMode} · 손 모드: ${state.handMode}${state.handMode === 'skip' ? `(${state.handSkip}프레임마다)` : ''} · 스무딩: ${state.smoothing ? 'on' : 'off'}`,
    ``,
    `실제 처리: ${realFpsNow().toFixed(1)} fps (새 프레임 ${state.newFrames}장)`,
    `루프 여력: ${state.total.summary().fps.toFixed(1)} fps`,
    ``,
    `[A1 두 경로 비교]`,
    `자세 yaw  차이: ${state.dYaw.summary().n ? `평균 ${state.dYaw.summary().mean.toFixed(2)}° p95 ${state.dYaw.summary().p95.toFixed(2)}° 최대 ${state.dYaw.summary().max.toFixed(2)}° (${state.dYaw.summary().n}프레임)` : '— 변환행렬 꺼짐'}`,
    `자세 pitch 차이: ${state.dPitch.summary().n ? `평균 ${state.dPitch.summary().mean.toFixed(2)}° p95 ${state.dPitch.summary().p95.toFixed(2)}° 최대 ${state.dPitch.summary().max.toFixed(2)}°` : '— 변환행렬 꺼짐'}`,
    `눈감음 일치: ${state.blinkAgree.summary().n ? `${(state.blinkAgree.summary().rate * 100).toFixed(1)}% (${state.blinkAgree.summary().n}판정, EAR만 ${state.blinkAgree.summary().aOnly} · BS만 ${state.blinkAgree.summary().bOnly})` : '— 블렌드셰이프 꺼짐'}`,
    `웃음 계수 최대: ${state.smilePeak.summary().n ? `${state.smilePeak.summary().max.toFixed(3)} (평균 ${state.smilePeak.summary().mean.toFixed(3)})` : '— 블렌드셰이프 꺼짐'}`,
    `전체  ${S(state.total)}`,
    `얼굴  ${S(state.faceMs)}`,
    `손    ${state.handMs.summary().n ? S(state.handMs) : '—'}`,
    `게이트 ${S(state.gateMs)}`,
    `그리기 ${S(state.drawMs)}`,
    `중복 프레임: ${state.dupes} / ${state.ticks}`,
  ].join('\n');
}

function resetStats() {
  ['total', 'faceMs', 'handMs', 'gateMs', 'drawMs'].forEach((k) => state[k].reset());
  state.ticks = state.dupes = state.inferences = state.newFrames = 0;
  state.wallStart = 0;
  ['dYaw', 'dPitch', 'blinkAgree', 'smilePeak'].forEach((k) => state[k].reset());
}

function setStatus(t, err = false) {
  $('status').textContent = t;
  $('status').className = 'status' + (err ? ' bad' : '');
}

// ---------------- UI ----------------

$('btnStart').onclick = startCamera;
$('btnBaseline').onclick = () => {
  if (state.sharp == null || state.brightL == null) { setStatus('아직 측정값이 없습니다. 얼굴을 비춰 주세요', true); return; }
  state.baseline = { sharp: state.sharp, brightL: state.brightL };
  setStatus(`기준 저장 — 선명도 ${state.sharp.toFixed(0)} · 이마 L* ${state.brightL.toFixed(1)}`);
};
$('btnReset').onclick = () => { resetStats(); setStatus('측정값 초기화'); };
$('btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(report()); setStatus('측정 결과를 클립보드에 복사했습니다'); }
  catch { $('dump').hidden = false; $('dump').value = report(); }
};
$('loopMode').onchange = (e) => { state.loopMode = e.target.value; resetStats(); };
$('handMode').onchange = (e) => {
  // 손 가림은 초당 몇 번만 봐도 된다. 손이 0.1초 만에 왔다 사라지지는 않는다.
  const v = e.target.value;
  if (v.startsWith('skip:')) { state.handMode = 'skip'; state.handSkip = parseInt(v.slice(5), 10); }
  else state.handMode = v;
  resetStats();
};
$('smoothing').onchange = (e) => { state.smoothing = e.target.checked; state.smoother.reset(); };

// 1€ 필터 파라미터를 돌아가는 중에 맞춘다.
//   minCutoff ↓ → 가만히 있을 때 떨림이 준다 (대신 느려진다)
//   beta      ↑ → 빠르게 움직일 때 지연이 준다
const bindSlider = (id, key, fmt) => {
  const el = $(id);
  const apply = () => {
    const v = parseFloat(el.value);
    $(id + 'Val').textContent = fmt(v);
    state.smoother.setParams({ [key]: v });
  };
  el.oninput = apply;
  apply();
};
bindSlider('minCutoff', 'minCutoff', (v) => v.toFixed(1));
bindSlider('beta', 'beta', (v) => v.toFixed(1));

init().catch((e) => setStatus('초기화 실패: ' + e.message, true));
