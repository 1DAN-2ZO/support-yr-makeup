/**
 * [1-2·1-3 실측용 측정 도구] 폰에서 4장 자동 촬영을 돌려 시간·재촬영·45° 각도를 잰다.
 * 1-1 의 shotGate(flow.ts) 를 실제 카메라 프레임에 연결한 최소 화면.
 *  - 동의 화면(F-01) → 프레임마다 ShotMeasure: yaw(랜드마크 · 행렬 두 식), 눈 감음(블렌드셰이프 · EAR), 얼굴 비율, 잘림 여백, 선명도, 이마 L*
 *  - 5프레임 연속 통과 → 자동 촬영 → 찍힌 사진을 크게 보여 주고 "다음 / 다시 찍기" (한 장씩 확인)
 *  - 끝내기 → 기록 JSON 을 dev 서버(/__probe) 로 보내 PC 의 client/.probe/ 에 저장 (사진·좌표는 안 보냄)
 */
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { CAPTURE_LIMITS, SHOTS, nextShot, shotGate } from "@core/flow";
import type { ShotId, ShotMeasure } from "@core/flow";
import { FACE_L, FACE_R, foreheadLab } from "@core/color";
import type { GateFail, Pt } from "@core/types";
import { createLogger, memorySink } from "@core/log";
import { createCaptureEvents } from "@core/capture-events";
import { applyCameraLocks, lockReportRow, requestWakeLock } from "@screens/camera-locks";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};
const video = $<HTMLVideoElement>("v");
const gateEl = $("gate");
const liveEl = $("live");
const outEl = $("out");
const flashEl = $("flash");
const thumbsEl = $("thumbs");
const consentEl = $("consent");
const confirmEl = $("confirm");
const confirmCv = $<HTMLCanvasElement>("confirmCv");

// ---------- 기록 ----------
interface ShotAt { yawLm: number; yawMatRow: number; yawMatCol: number; pitchLm: number; blinkA: number; blinkB: number; earA: number; earB: number; faceRatio: number; faceInset: number; sharpness: number; foreheadL: number }
interface ShotRecord {
  shot: ShotId;
  /** 이 장을 찍기 시작한 뒤 자동 촬영까지 초 */
  seconds: number;
  /** 사진 확인 화면에 머문 초 */
  confirmSeconds: number;
  /** 막힌 조건별 프레임 수 */
  blocked: Partial<Record<GateFail, number>>;
  at: ShotAt;
  retakes: number;
  /** 확인 화면에서 "다시 찍기" 로 버린 횟수 (이 장이 최종 확정될 때까지) */
  rejected: number;
}
interface ProbeResult {
  ua: string;
  startedAt: string;
  frameW: number;
  frameH: number;
  modelMs: number;
  frameMsAvg: number;
  /** 시작 → 끝 버튼 */
  totalSeconds: number;
  /** 시작 → 4장째 확정 (확인 화면 시간 포함) */
  captureSeconds: number;
  consent: boolean;
  shots: ShotRecord[];
  lockRow: string;
  events: string[];
}

const NAME: Record<ShotId, string> = { front_open: "정면·눈뜸", front_closed: "정면·눈감음", left_45: "왼쪽 45°", right_45: "오른쪽 45°" };
const state = {
  lm: null as FaceLandmarker | null,
  stream: null as MediaStream | null,
  shots: {} as Partial<Record<ShotId, { cv: HTMLCanvasElement; rec: ShotRecord }>>,
  order: [] as ShotId[],
  pending: null as { shot: ShotId; cv: HTMLCanvasElement; rec: ShotRecord; shownAt: number } | null,
  rejected: { front_open: 0, front_closed: 0, left_45: 0, right_45: 0 } as Record<ShotId, number>,
  stable: 0,
  shotStart: 0,
  runStart: 0,
  lastShotAt: 0,
  lostSince: null as number | null,
  blocked: {} as Partial<Record<GateFail, number>>,
  retakes: { front_open: 0, front_closed: 0, left_45: 0, right_45: 0 } as Record<ShotId, number>,
  baselineL: undefined as number | undefined,
  frameMs: [] as number[],
  modelMs: 0,
  lockRow: "",
  loop: false,
  paused: false,
  consent: false,
};
const mem = memorySink();
const logger = createLogger({ sid: `probe-${Date.now()}`, screen: "consent", part: null, ver: { app: "probe", score: "-", look: "-", faceshape: "-", transfer: "-" } }, mem.sink);
const events = createCaptureEvents(logger);

// ---------- 측정 도우미 ----------
const pt = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음`);
  return p;
};
function yawFromLandmarks(lm: readonly Pt[]): { yaw: number; pitch: number } {
  const l = pt(lm, FACE_L), r = pt(lm, FACE_R), n = pt(lm, 1), top = pt(lm, 10), chin = pt(lm, 152);
  return { yaw: ((n.x - l.x) / (r.x - l.x) - 0.5) * 90, pitch: ((n.y - top.y) / (chin.y - top.y) - 0.55) * 90 };
}
/** 행렬 yaw 두 해석. 1-2 Android 실측: column-major 가 랜드마크와 부호가 맞음 */
function yawFromMatrix(data: readonly number[]): { row: number; col: number } {
  const R = (r: number, c: number): number => data[r * 4 + c] ?? 0;
  const C = (r: number, c: number): number => data[c * 4 + r] ?? 0;
  const deg = (v: number): number => (v * 180) / Math.PI;
  return { row: deg(Math.atan2(R(0, 2), R(2, 2))), col: deg(Math.atan2(C(0, 2), C(2, 2))) };
}
function ear(lm: readonly Pt[], up: readonly number[], lo: readonly number[], outer: number, inner: number): number {
  const w = Math.hypot(pt(lm, outer).x - pt(lm, inner).x, pt(lm, outer).y - pt(lm, inner).y) || 1;
  let h = 0;
  for (let i = 0; i < up.length; i++) h += Math.hypot(pt(lm, up[i] ?? 0).x - pt(lm, lo[i] ?? 0).x, pt(lm, up[i] ?? 0).y - pt(lm, lo[i] ?? 0).y);
  return h / up.length / w;
}
const UP_A = [246, 161, 160, 159, 158, 157, 173], LO_A = [7, 163, 144, 145, 153, 154, 155];
const UP_B = [466, 388, 387, 386, 385, 384, 398], LO_B = [249, 390, 373, 374, 380, 381, 382];
/** 랜드마크 전체(468점)가 프레임 가장자리에서 얼마나 떨어져 있나 — 짧은 변 대비 비율. 밖이면 음수 */
function faceInsetOf(lm: readonly Pt[], sw: number, sh: number): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 468; i++) { const p = pt(lm, i); if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  return Math.min(minX, minY, sw - maxX, sh - maxY) / Math.min(sw, sh);
}

const tiny = document.createElement("canvas");
const tctx = tiny.getContext("2d", { willReadFrequently: true });
function sharpnessOf(src: HTMLVideoElement, crop: { x: number; y: number; w: number; h: number }): number {
  if (!tctx) return 0;
  const w = 96, h = Math.max(8, Math.round((96 * crop.h) / crop.w));
  tiny.width = w; tiny.height = h;
  tctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const d = tctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * (d[i * 4] ?? 0) + 0.587 * (d[i * 4 + 1] ?? 0) + 0.114 * (d[i * 4 + 2] ?? 0);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * (g[i] ?? 0) - (g[i - 1] ?? 0) - (g[i + 1] ?? 0) - (g[i - w] ?? 0) - (g[i + w] ?? 0);
    sum += v; sum2 += v * v; n++;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}
const small = document.createElement("canvas");
const sctx = small.getContext("2d", { willReadFrequently: true });
function foreheadLOf(src: HTMLVideoElement, lm: readonly Pt[], sw: number, sh: number): number | undefined {
  if (!sctx) return undefined;
  const w = 320, h = Math.round((sh * w) / sw), k = w / sw;
  small.width = w; small.height = h;
  sctx.drawImage(src, 0, 0, w, h);
  const im = sctx.getImageData(0, 0, w, h);
  const lab = foreheadLab({ data: im.data, w, h }, lm.map((p) => ({ x: p.x * k, y: p.y * k })));
  return lab ? lab.L : undefined;
}

// ---------- 동의 → 카메라 ----------
function showConsent(): void {
  $<HTMLButtonElement>("start").disabled = true;
  consentEl.hidden = false;
}
$<HTMLButtonElement>("agree").onclick = () => {
  consentEl.hidden = true;
  state.consent = true;
  events.consent(true);
  logger.setContext({ screen: "capture" });
  start().catch((e) => { outEl.textContent = `시작 실패: ${String(e)}`; });
};
$<HTMLButtonElement>("deny").onclick = () => {
  state.consent = false;
  events.consent(false);
  logger.setContext({ screen: "denied" });
  consentEl.innerHTML = "<h3>서버 처리에 동의해야 사용할 수 있어요</h3><p>(F-01: 거부하면 여기서 멈춘다)</p>";
  $<HTMLButtonElement>("finish").disabled = false;
};

async function start(): Promise<void> {
  outEl.textContent = "모델 로딩 중…";
  const t0 = performance.now();
  const files = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
  // 모델: 로컬 사본(client/public/models/, 저장소에 안 넣음)이 있으면 그것, 없으면 MediaPipe 공식 CDN
  const LOCAL_MODEL = "/models/face_landmarker.task";
  const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const modelPath = await fetch(LOCAL_MODEL, { method: "HEAD" }).then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? LOCAL_MODEL : CDN_MODEL)).catch(() => CDN_MODEL);
  const opts = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: "VIDEO" as const, numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  state.lm = await FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
  state.modelMs = Math.round(performance.now() - t0);
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  if (track) {
    await new Promise((r) => setTimeout(r, 1500));
    const rep = await applyCameraLocks(track as unknown as Parameters<typeof applyCameraLocks>[0]);
    state.lockRow = lockReportRow(navigator.userAgent, rep);
  }
  await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
  state.runStart = performance.now();
  state.shotStart = state.runStart;
  state.lostSince = null;
  outEl.textContent = `모델 ${state.modelMs}ms · 프레임 ${video.videoWidth}×${video.videoHeight}\n${state.lockRow}`;
  $<HTMLButtonElement>("retake").disabled = false;
  $<HTMLButtonElement>("finish").disabled = false;
  renderThumbs();
  state.loop = true;
  requestAnimationFrame(frame);
}

function frame(): void {
  if (!state.loop || !state.lm) return;
  requestAnimationFrame(frame);
  if (state.paused || video.readyState < 2) return;
  const t0 = performance.now();
  const sw = video.videoWidth, sh = video.videoHeight;
  const res: FaceLandmarkerResult = state.lm.detectForVideo(video, t0);
  const raw = res.faceLandmarks[0];
  if (!raw) { if (state.lostSince === null) state.lostSince = t0; }
  else if (state.lostSince !== null) { events.faceLost(t0 - state.lostSince); state.lostSince = null; }
  const shotId = nextShot(state.shots);
  if (!shotId) { gateEl.textContent = "4장 완료 — 끝을 누르세요"; gateEl.classList.add("ready"); return; }
  const m: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
  let at: ShotAt | null = null;
  if (raw) {
    const lm: Pt[] = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
    const ang = yawFromLandmarks(lm);
    const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
    const blinkA = bs.get("eyeBlinkLeft") ?? 0, blinkB = bs.get("eyeBlinkRight") ?? 0;
    const hasBs = bs.size > 0;
    const earA = ear(lm, UP_A, LO_A, 33, 133), earB = ear(lm, UP_B, LO_B, 263, 362);
    const mat = res.facialTransformationMatrixes[0];
    const my = mat ? yawFromMatrix(mat.data) : { row: 0, col: 0 };
    const faceW = Math.abs(pt(lm, FACE_R).x - pt(lm, FACE_L).x);
    const crop = { x: Math.max(0, pt(lm, FACE_L).x - faceW * 0.2), y: Math.max(0, pt(lm, 10).y - faceW * 0.2), w: Math.min(sw, faceW * 1.4), h: Math.min(sh, faceW * 1.8) };
    const yaw = -ang.yaw;
    const foreheadL = foreheadLOf(video, lm, sw, sh);
    const inset = faceInsetOf(lm, sw, sh);
    Object.assign(m, {
      yaw, pitch: ang.pitch,
      closedA: hasBs ? blinkA > 0.5 : earA < 0.12, closedB: hasBs ? blinkB > 0.5 : earB < 0.12,
      faceRatio: faceW / sw, faceInset: inset, sharpness: sharpnessOf(video, crop),
    });
    if (foreheadL !== undefined) m.foreheadL = foreheadL;
    if (state.baselineL !== undefined) m.baselineL = state.baselineL;
    at = { yawLm: r1(yaw), yawMatRow: r1(-my.row), yawMatCol: r1(-my.col), pitchLm: r1(ang.pitch), blinkA: r2(blinkA), blinkB: r2(blinkB), earA: r2(earA), earB: r2(earB), faceRatio: r2(faceW / sw), faceInset: r2(inset), sharpness: r1(m.sharpness ?? 0), foreheadL: r1(foreheadL ?? 0) };
  }
  const pre = raw ? shotGate(shotId, { ...m, stableCount: 99 }) : null;
  state.stable = pre?.ok ? state.stable + 1 : 0;
  m.stableCount = state.stable;
  const gate = shotGate(shotId, m);
  if (!gate.ok && gate.firstFail) state.blocked[gate.firstFail] = (state.blocked[gate.firstFail] ?? 0) + 1;
  gateEl.textContent = `${NAME[shotId]} — ${gate.text}`;
  gateEl.classList.toggle("ready", gate.ok);
  const ms = performance.now() - t0;
  state.frameMs.push(ms);
  liveEl.textContent = at
    ? `yaw 랜드마크 ${at.yawLm} · 행렬 col ${at.yawMatCol} · pitch ${at.pitchLm} · 여백 ${at.faceInset}\n눈 blink ${at.blinkA}/${at.blinkB} · 얼굴비 ${at.faceRatio} · 선명 ${at.sharpness} · L* ${at.foreheadL}${state.baselineL !== undefined ? ` (기준 ${r1(state.baselineL)})` : ""} · 안정 ${state.stable}/${CAPTURE_LIMITS.stableFrames} · ${ms.toFixed(0)}ms`
    : `얼굴 없음 · ${ms.toFixed(0)}ms`;
  if (gate.ok && at) takeShot(shotId, at);
  else events.blocked(shotId, gate.firstFail ?? null, t0);
}

/** 자동 촬영 → 확인 화면 (루프는 멈춤) */
function takeShot(shotId: ShotId, at: ShotAt): void {
  const cv = document.createElement("canvas");
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  cv.getContext("2d")?.drawImage(video, 0, 0);
  const now = performance.now();
  const rec: ShotRecord = { shot: shotId, seconds: r1((now - state.shotStart) / 1000), confirmSeconds: 0, blocked: state.blocked, at, retakes: state.retakes[shotId], rejected: state.rejected[shotId] };
  state.pending = { shot: shotId, cv, rec, shownAt: now };
  state.paused = true;
  state.blocked = {}; state.stable = 0;
  flashEl.hidden = false; setTimeout(() => (flashEl.hidden = true), 300);
  const k = Math.min(1, 360 / cv.width);
  confirmCv.width = Math.round(cv.width * k); confirmCv.height = Math.round(cv.height * k);
  const c = confirmCv.getContext("2d");
  if (c) { c.translate(confirmCv.width, 0); c.scale(-1, 1); c.drawImage(cv, 0, 0, confirmCv.width, confirmCv.height); }
  $("confirmTitle").textContent = `${NAME[shotId]} — 이 사진으로 할까요?`;
  $("confirmInfo").textContent = `yaw ${at.yawLm} · 여백 ${at.faceInset} · 얼굴비 ${at.faceRatio} · 선명 ${at.sharpness} · L* ${at.foreheadL}`;
  confirmEl.hidden = false;
}
$<HTMLButtonElement>("ok").onclick = () => {
  const p = state.pending; if (!p) return;
  const now = performance.now();
  p.rec.confirmSeconds = r1((now - p.shownAt) / 1000);
  state.shots[p.shot] = { cv: p.cv, rec: p.rec };
  state.order.push(p.shot);
  if (p.shot === "front_open") state.baselineL = p.rec.at.foreheadL;
  events.shot(p.shot, true, null);
  state.lastShotAt = now; state.shotStart = now;
  state.pending = null; confirmEl.hidden = true; state.paused = false;
  renderThumbs();
};
$<HTMLButtonElement>("redo").onclick = () => {
  const p = state.pending; if (!p) return;
  state.rejected[p.shot] += 1;
  events.shot(p.shot, false, null);   // 게이트는 통과했지만 사람이 거부 (reason 없음)
  state.pending = null; confirmEl.hidden = true; state.paused = false;
  state.shotStart = performance.now();
};

function retakeLast(): void {
  const last = state.order.pop();
  if (!last) return;
  delete state.shots[last];
  state.retakes[last] += 1;
  events.retake(last);
  if (last === "front_open") state.baselineL = undefined;
  state.blocked = {}; state.stable = 0; state.shotStart = performance.now();
  gateEl.classList.remove("ready");
  renderThumbs();
}

function renderThumbs(): void {
  thumbsEl.innerHTML = "";
  for (const s of SHOTS) {
    const d = document.createElement("div");
    d.className = "thumb" + (state.shots[s.id] ? " done" : "");
    const c = document.createElement("canvas");
    const src = state.shots[s.id]?.cv;
    c.width = 120; c.height = src ? Math.round((120 * src.height) / src.width) : 68;
    if (src) { const ctx = c.getContext("2d"); if (ctx) { ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, c.width, c.height); } }
    d.appendChild(c);
    const rec = state.shots[s.id]?.rec;
    d.appendChild(document.createTextNode(rec ? `${NAME[s.id]} ${rec.seconds}s yaw ${rec.at.yawLm}` : NAME[s.id]));
    thumbsEl.appendChild(d);
  }
}

async function finish(): Promise<void> {
  state.loop = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  const shots = state.order.map((id) => state.shots[id]?.rec).filter((r): r is ShotRecord => !!r);
  const result: ProbeResult = {
    ua: navigator.userAgent, startedAt: new Date().toISOString(), frameW: video.videoWidth, frameH: video.videoHeight,
    modelMs: state.modelMs, frameMsAvg: r1(state.frameMs.reduce((a, b) => a + b, 0) / Math.max(1, state.frameMs.length)),
    totalSeconds: r1((performance.now() - state.runStart) / 1000), captureSeconds: r1((state.lastShotAt - state.runStart) / 1000),
    consent: state.consent, shots, lockRow: state.lockRow, events: mem.lines,
  };
  const row = `| ${shortUa()} | ${result.startedAt.slice(0, 10)} | ${result.captureSeconds} | ${state.retakes.front_open} | ${state.retakes.front_closed} | ${state.retakes.left_45} | ${state.retakes.right_45} | 좌 ${shots.find((s) => s.shot === "left_45")?.at.yawLm ?? "-"} / 우 ${shots.find((s) => s.shot === "right_45")?.at.yawLm ?? "-"} | 프레임 ${result.frameW}×${result.frameH} · ${result.frameMsAvg}ms/프레임 |`;
  let sent = "";
  try {
    const r = await fetch("/__probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) });
    sent = r.ok ? `PC 저장됨: ${await r.text()}` : `저장 실패 ${r.status}`;
  } catch (e) { sent = `저장 실패: ${String(e)}`; }
  outEl.textContent = `${sent}\n\n1-2 표 한 줄:\n${row}\n\n장별:\n${shots.map((s) => `${NAME[s.shot]}: ${s.seconds}s (+확인 ${s.confirmSeconds}s), 거부 ${s.rejected}, 막힘 ${JSON.stringify(s.blocked)}, yaw lm ${s.at.yawLm} / col ${s.at.yawMatCol}, 여백 ${s.at.faceInset}, 선명 ${s.at.sharpness}, L* ${s.at.foreheadL}`).join("\n")}`;
}
function shortUa(): string {
  const ua = navigator.userAgent;
  const m = /\((iPhone[^)]*)\)/.exec(ua) ?? /\((Linux; Android[^)]*)\)/.exec(ua);
  return (m?.[1] ?? ua).slice(0, 60);
}
const r1 = (v: number): number => Math.round(v * 10) / 10;
const r2 = (v: number): number => Math.round(v * 100) / 100;

$<HTMLButtonElement>("start").onclick = showConsent;
$<HTMLButtonElement>("retake").onclick = retakeLast;
$<HTMLButtonElement>("finish").onclick = () => { $<HTMLButtonElement>("finish").disabled = true; $<HTMLButtonElement>("retake").disabled = true; finish().catch((e) => { outEl.textContent = `끝내기 실패: ${String(e)}`; }); };
outEl.textContent = "시작 → 동의 화면 → 카메라. (https 필요)";
