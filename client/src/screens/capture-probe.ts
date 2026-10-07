/**
 * [1-2·1-3 실측용 측정 도구] 폰에서 자동 촬영(정면 2장)을 돌려 시간·재촬영을 잰다.
 * 1-1 의 shotGate(flow.ts) 를 실제 카메라 프레임에 연결한 최소 화면.
 *  - 동의 화면(F-01) → 프레임마다 ShotMeasure: yaw(랜드마크 · 행렬 두 식), 눈 감음(블렌드셰이프 · EAR), 얼굴 비율, 잘림 여백, 선명도, 이마 L*
 *  - 5프레임 연속 통과 → 자동 촬영 → 찍힌 사진을 크게 보여 주고 "다음 / 다시 찍기" (한 장씩 확인)
 *  - 끝내기 → 기록 JSON 을 dev 서버(/__probe) 로 보내 PC 의 client/.probe/ 에 저장 (사진·좌표는 안 보냄)
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { CAPTURE_GUIDE, CAPTURE_LIMITS, SHOTS, SHOT_TEXT, burstShot, burstStep, nextShot, shotGate, startBurst } from "@core/flow";
import type { BurstState } from "@core/flow";
import type { ShotId, ShotMeasure } from "@core/flow";
import { FACE_L, FACE_R, labDrift } from "@core/color";
import { LO_A, LO_B, UP_A, UP_B, ear, eyeWidthPxOf, faceInsetOf, irisPxOf, yawFromLandmarks, yawFromMatrix } from "@core/capture-measure";
import { foreheadLabOf, sharpnessOf } from "@screens/frame-measure";
import { createLandmarker } from "@screens/landmarker";
import type { GateFail, Pt } from "@core/types";
import { createLogger, memorySink } from "@core/log";
import { createCaptureEvents } from "@core/capture-events";
import { foreheadStep, startForeheadTrack } from "@core/occlusion";
import { settleStep, startSettle, type Settle } from "@core/capture-run";
import { ALL_LOCKS, applyCameraLocks, applyUltraWideZoom, camSnapshot, lockReportRow, releaseCameraLocks, requestWakeLock } from "@screens/camera-locks";
import { startFrameLoop } from "@screens/camera-loop";

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
interface ShotAt { yawLm: number; yawMatRow: number; yawMatCol: number; pitchLm: number; blinkA: number; blinkB: number; earA: number; earB: number; faceRatio: number; faceInset: number; sharpness: number; foreheadL: number; foreheadA: number; foreheadB: number; irisPx: number; eyeWidthPx: number; foreheadJump: number; foreheadJumpMax2s: number; foreheadOccluded: boolean }
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
  /** 시작 → 마지막 장 확정 (확인 화면 시간 포함) */
  captureSeconds: number;
  consent: boolean;
  shots: ShotRecord[];
  lockRow: string;
  /**
   * 카메라 잠금 진단 (2026-09-30 S26 Ultra 가 잠금 뒤 밝아짐, S8+ 는 괜찮음).
   * 주소에 ?lock=off(기본, 앱과 같음) | wb | wbfocus | all 로 잠금을 골라 비교한다. 잠금 전후 카메라 값과 이마 밝기 흐름(0.1초 간격)
   */
  camDiag: { mode: string; before: Record<string, unknown>; after: Record<string, unknown>; after2s: Record<string, unknown>; errors: Record<string, string> | null; trace: { t: number; L: number | null }[] } | null;
  /** 전면 카메라 zoom 지원 범위 (없으면 null). iPhone 초광각 대응 (b) 검토용 */
  zoom: { min: number; max: number; step: number } | null;
  /** 실제로 걸어 둔 확대 배율 (안 걸었으면 null). iPhone 초광각 대응 검토: 켠 것 / 끈 것 비교 */
  zoomApplied: number | null;
  /** 흔들기 측정: 가만히 3초 · 흔들기 3초 동안 프레임별 선명도 (1-2 문제 12) */
  shake: ShakeResult | null;
  /** 얼굴형 판단용 정면 프레임: 모은 장수, 셔터 뒤 더 기다린 초(0 이면 셔터 전에 다 참), 장별 값 (사진은 안 보냄) */
  /** 가림 측정: 상태 이름 → 3초 동안 이마 급변 ΔE 분포 (임계 FOREHEAD_JUMP.jumpDE 확정용) */
  occlusionCalib: Record<string, ProbeResult["foreheadJump"]>;
  /** 1-4: 확정된 장들의 이마 L*a*b* 변동 폭(정면 눈 뜸 기준 최대 ΔE). 두 장 미만이면 null */
  labDrift: { rangeL: number; rangeA: number; rangeB: number; maxDeltaE: number } | null;
  /** 이마 급변(가림, #144): 창(300ms) 안 이마 ΔE 의 분포와 가림으로 본 프레임 수. 임계 FOREHEAD_JUMP 확정용 */
  foreheadJump: { n: number; p50: number; p90: number; p99: number; max: number; occludedFrames: number };
  /** 장별로 화면에 뜬 막힘 문구 횟수와 그동안 본 yaw·pitch 범위 — 안 찍힌 장도 남는다 (2026-09-23 iPad 45° 가 왜 막혔는지) */
  gateLog: Partial<Record<ShotId, { texts: Record<string, number>; yaw: [number, number]; pitch: [number, number]; eyeWidthPx: [number, number]; faceRatio: [number, number] }>>;
  faceShapeBurst: { count: number; seconds: number; frames: { yawLm: number; eyeWidthPx: number; sharpness: number; faceRatio: number }[] } | null;
  events: string[];
}
interface ShakeStats { n: number; min: number; p10: number; median: number; max: number }
interface ShakeResult { still: ShakeStats; shaky: ShakeStats; frontOpenSharpness: number | null; irisPx: ShakeStats }

const NAME: Record<ShotId, string> = { front_open: "정면·눈뜸", front_closed: "정면·눈감음" };
const state = {
  lm: null as FaceLandmarker | null,
  stream: null as MediaStream | null,
  shots: {} as Partial<Record<ShotId, { cv: HTMLCanvasElement; rec: ShotRecord }>>,
  order: [] as ShotId[],
  pending: null as { shot: ShotId; cv: HTMLCanvasElement; rec: ShotRecord; shownAt: number } | null,
  rejected: { front_open: 0, front_closed: 0 } as Record<ShotId, number>,
  stable: 0,
  shotStart: 0,
  runStart: 0,
  lastShotAt: 0,
  lostSince: null as number | null,
  blocked: {} as Partial<Record<GateFail, number>>,
  retakes: { front_open: 0, front_closed: 0 } as Record<ShotId, number>,
  baselineL: undefined as number | undefined,
  frameMs: [] as number[],
  modelMs: 0,
  lockRow: "",
  camDiag: null as ProbeResult["camDiag"],
  loop: false,
  paused: false,
  consent: false,
  frameW: 0,
  frameH: 0,
  startedAt: "",
  zoom: null as { min: number; max: number; step: number } | null,
  burst: null as BurstState | null,
  zoomApplied: null as number | null,
  calib: null as { label: string; t0: number; jumps: number[]; occluded: number } | null,
  calibDone: {} as Record<string, ProbeResult["foreheadJump"]>,
  burstFrames: [] as { cv: HTMLCanvasElement; at: ShotAt }[],
  burstResult: null as ProbeResult["faceShapeBurst"],
  /** 첫 장 셔터 뒤 얼굴형 프레임을 마저 모으는 중 (확인 화면은 그 뒤) */
  burstWait: null as { shotId: ShotId; at: ShotAt; cv: HTMLCanvasElement; shotAt: number } | null,
  gateLog: {} as ProbeResult["gateLog"],
  fj: startForeheadTrack(),
  /** 기준 장(정면 눈 뜸) 자리 잡기 — 앱(capture-run BASE_SETTLE)과 같은 규칙. null 이면 그 장 차례가 되면 시작 */
  settle: null as Settle | null,
  fjAll: [] as number[],
  fjRecent: [] as { t: number; v: number }[],
  fjOccluded: 0,
  shake: { phase: "idle" as "idle" | "still" | "shaky" | "done", t0: 0, still: [] as number[], shaky: [] as number[], iris: [] as number[] },
};
const mem = memorySink();
const logger = createLogger({ sid: `probe-${Date.now()}`, screen: "consent", part: null, ver: { app: "probe", score: "-", look: "-", faceshape: "-", transfer: "-" } }, mem.sink);
const events = createCaptureEvents(logger);

// ---------- 측정 도우미 (core/capture-measure · screens/frame-measure) ----------
const pt = (lm: readonly Pt[], i: number): Pt => {
  const p = lm[i];
  if (!p) throw new Error(`랜드마크 ${i} 없음`);
  return p;
};

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
  showGuide();
};
// 동의 → 촬영 안내(이마·귀) → 카메라 (F-01)
function showGuide(): void {
  const g = $("guide");
  $("guideTitle").textContent = CAPTURE_GUIDE.title;
  $("guideLines").replaceChildren(...CAPTURE_GUIDE.lines.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
  const ok = $<HTMLButtonElement>("guideOk");
  ok.textContent = CAPTURE_GUIDE.button;
  ok.onclick = () => {
    ok.disabled = true;
    g.hidden = true;
    start().catch((e) => { outEl.textContent = `시작 실패: ${String(e)}`; });
  };
  g.hidden = false;
}
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
  state.lm = await createLandmarker("VIDEO");
  state.modelMs = Math.round(performance.now() - t0);
  // 1080p 요청: 720p 에서는 얼굴이 작아(iPhone 초광각 얼굴비 0.30~0.44) 눈 폭 80px 조건을 못 채울 것으로 보여 올렸다 (2026-09-22 확인 측정)
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  // 프레임 크기는 여기서 적어 둔다 — 끝낼 때는 트랙을 먼저 멈춰서 iOS 가 videoWidth 를 0 으로 돌려준다 (2026-09-22 iPhone 실측)
  state.frameW = video.videoWidth; state.frameH = video.videoHeight; state.startedAt = new Date().toISOString();
  const track = stream.getVideoTracks()[0];
  if (track) {
    // 잠금 진단: 켠 뒤 1.5초 동안 + 잠근 뒤 2초 동안 이마 밝기를 0.1초마다 적고, 잠금 전후 카메라 값을 남긴다
    const t0 = performance.now(), trace: { t: number; L: number | null }[] = [];
    const sample = (): void => {
      if (!state.lm || video.readyState < 2) return;
      const r = state.lm.detectForVideo(video, performance.now()).faceLandmarks[0];
      const L = r ? foreheadLabOf(video, r.map((p) => ({ x: p.x * video.videoWidth, y: p.y * video.videoHeight })), video.videoWidth, video.videoHeight)?.raw?.L ?? null : null;
      trace.push({ t: Math.round(performance.now() - t0), L: L === null ? null : r1(L) });
    };
    const traceFor = async (ms: number): Promise<void> => { const end = performance.now() + ms; while (performance.now() < end) { sample(); await new Promise((r) => setTimeout(r, 100)); } };
    const mode = new URLSearchParams(location.search).get("lock") ?? "off";   // 기본 = 앱과 같이 안 잠금 (DEFAULT_LOCKS, #267)
    const only = mode === "all" ? ALL_LOCKS : mode === "wb" ? ["whiteBalanceMode" as const] : mode === "wbfocus" ? ["whiteBalanceMode" as const, "focusMode" as const] : [];
    const tl = track as unknown as Parameters<typeof applyCameraLocks>[0];
    await releaseCameraLocks(tl);   // 앞 세션이 남긴 잠금부터 푼다 (#267)
    await traceFor(1500);
    const before = camSnapshot(tl);
    const rep = await applyCameraLocks(tl, only);
    const after = camSnapshot(tl);
    await traceFor(2000);
    state.camDiag = { mode, before, after, after2s: camSnapshot(tl), errors: rep.errors ?? null, trace };
    state.lockRow = lockReportRow(navigator.userAgent, rep);
    const caps = (track.getCapabilities?.() ?? {}) as { zoom?: { min?: number; max?: number; step?: number } };
    state.zoom = caps.zoom && typeof caps.zoom.max === "number" ? { min: caps.zoom.min ?? 1, max: caps.zoom.max, step: caps.zoom.step ?? 0 } : null;
    // iPhone·iPad 초광각이면 카메라 앱 1배처럼 확대 (2026-09-23)
    state.zoomApplied = await applyUltraWideZoom(track as unknown as Parameters<typeof applyUltraWideZoom>[0]);
    $<HTMLButtonElement>("zoom").textContent = state.zoomApplied ? "확대 끄기" : "확대 1.5배";
  }
  await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
  state.runStart = performance.now();
  state.shotStart = state.runStart;
  state.lostSince = null;
  const cd = state.camDiag;
  const Ls = (cd?.trace ?? []).filter((x) => x.L !== null);
  const avg = (a: typeof Ls): string => (a.length ? String(r1(a.reduce((sum, x) => sum + (x.L ?? 0), 0) / a.length)) : "-");
  outEl.textContent = `모델 ${state.modelMs}ms · 프레임 ${video.videoWidth}×${video.videoHeight}\n${state.lockRow}` +
    (cd ? `\n잠금 ${cd.mode} · 이마 L* 잠금 전 ${avg(Ls.filter((x) => x.t < 1500))} → 뒤 ${avg(Ls.filter((x) => x.t >= 2500))}` +
      `\n전 ${JSON.stringify(cd.before)}\n후 ${JSON.stringify(cd.after2s)}${cd.errors ? `\n오류 ${JSON.stringify(cd.errors)}` : ""}` : "");
  $<HTMLButtonElement>("retake").disabled = false;
  $<HTMLButtonElement>("finish").disabled = false;
  renderThumbs();
  state.loop = true;
  // 앱 촬영 화면과 같은 루프 — 카메라 새 장면에만 (#245). 처리 시간(ms)은 그대로 이 프레임 안에서 잰다
  stopLoop = startFrameLoop(video, frame);
}

let stopLoop = (): void => {};

function frame(): void {
  if (!state.loop || !state.lm) return;
  if (state.paused || video.readyState < 2) return;
  const t0 = performance.now();
  const sw = video.videoWidth, sh = video.videoHeight;
  const res: FaceLandmarkerResult = state.lm.detectForVideo(video, t0);
  const raw = res.faceLandmarks[0];
  if (!raw) { if (state.lostSince === null) state.lostSince = t0; }
  else if (state.lostSince !== null) { events.faceLost(t0 - state.lostSince); state.lostSince = null; }
  const shotId = nextShot(state.shots);
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
    const fr = foreheadLabOf(video, lm, sw, sh);
    const flab = fr?.skin;   // 밝기·색 조건 (앞머리 뺀 피부)
    const foreheadL = flab?.L;
    let fj = { jump: 0, occluded: false };
    if (fr?.raw) {   // 가림(급변)은 전체 평균 — 앱과 같은 규칙 (#212 리뷰)
      const r = foreheadStep(state.fj, t0, fr.raw, { yaw, pitch: ang.pitch });
      state.fj = r.track; fj = r;
      state.fjAll.push(r.jump);
      if (r.occluded) state.fjOccluded += 1;
      state.fjRecent = [...state.fjRecent.filter((x) => t0 - x.t <= 2000), { t: t0, v: r.jump }];
      m.foreheadOccluded = r.occluded;
    }
    if (!flab) m.foreheadHidden = true;   // 앱과 같은 규칙 — 이마 대부분이 머리카락
    const inset = faceInsetOf(lm, sw, sh);
    Object.assign(m, {
      yaw, pitch: ang.pitch,
      closedA: hasBs ? blinkA > 0.5 : earA < 0.12, closedB: hasBs ? blinkB > 0.5 : earB < 0.12,
      faceRatio: faceW / Math.min(sw, sh), faceInset: inset, eyeWidthPx: eyeWidthPxOf(lm), sharpness: sharpnessOf(video, crop),
    });
    if (foreheadL !== undefined) m.foreheadL = foreheadL;
    if (state.baselineL !== undefined) m.baselineL = state.baselineL;
    at = { yawLm: r1(yaw), yawMatRow: r1(-my.row), yawMatCol: r1(-my.col), pitchLm: r1(ang.pitch), blinkA: r2(blinkA), blinkB: r2(blinkB), earA: r2(earA), earB: r2(earB), faceRatio: r2(faceW / Math.min(sw, sh)), faceInset: r2(inset), sharpness: r1(m.sharpness ?? 0), foreheadL: r1(foreheadL ?? 0), foreheadA: r1(flab?.a ?? 0), foreheadB: r1(flab?.b ?? 0), irisPx: r1(irisPxOf(lm)), eyeWidthPx: r1(eyeWidthPxOf(lm)), foreheadJump: r1(fj.jump), foreheadJumpMax2s: r1(Math.max(0, ...state.fjRecent.map((x) => x.v))), foreheadOccluded: fj.occluded };
  }
  if (state.calib) { calibFrame(t0, at); return; }
  if (!shotId) { shakeFrame(t0, at); return; }
  if (state.burstWait) { burstFrame(t0, m, at); return; }
  if (shotId === "front_open" && !state.burst) state.burst = startBurst();
  if (shotId === "front_open") burstFrame(t0, m, at);
  const pre = raw ? shotGate(shotId, { ...m, stableCount: 99 }) : null;
  state.stable = pre?.ok ? state.stable + 1 : 0;
  m.stableCount = state.stable;
  let gate = shotGate(shotId, m);
  if (shotId === "front_open") {
    const sr = settleStep(state.settle ?? startSettle(), t0, m.foreheadL, m.faceDetected);
    state.settle = sr.state;
    if (gate.ok && !sr.ready) gate = { ok: false, firstFail: "stable", text: SHOT_TEXT.stable, stableCount: gate.stableCount };
  }
  if (!gate.ok && gate.firstFail) state.blocked[gate.firstFail] = (state.blocked[gate.firstFail] ?? 0) + 1;
  if (at) logGate(shotId, gate.ok ? "통과" : gate.text, at);
  gateEl.textContent = `${NAME[shotId]} — ${gate.text}`;
  gateEl.classList.toggle("ready", gate.ok);
  const ms = performance.now() - t0;
  state.frameMs.push(ms);
  liveEl.textContent = at
    ? `yaw 랜드마크 ${at.yawLm} · 행렬 col ${at.yawMatCol} · pitch ${at.pitchLm} · 여백 ${at.faceInset}\n눈 blink ${at.blinkA}/${at.blinkB} · 얼굴비 ${at.faceRatio} · 눈폭 ${at.eyeWidthPx}px · 선명 ${at.sharpness} · L* ${at.foreheadL}${state.baselineL !== undefined ? ` (기준 ${r1(state.baselineL)})` : ""} · 이마 급변 ${at.foreheadJump}${at.foreheadOccluded ? " (가림)" : ""} · 안정 ${state.stable}/${CAPTURE_LIMITS.stableFrames} · ${ms.toFixed(0)}ms`
    : `얼굴 없음 · ${ms.toFixed(0)}ms`;
  if (gate.ok && at) takeShot(shotId, at);
  else events.blocked(shotId, gate.firstFail ?? null, t0);
}

// ---------- 가림 측정 (이마 급변, #144) ----------
const CALIB_MS = 3000;
const CALIB_LABEL: Record<string, string> = { clean: "가만히 (가린 것 없이)", light: "불 끄고 켜기", hand: "손으로 이마 가렸다 치우기", brush: "브러시·퍼프로 이마 쓸기", hair: "앞머리 내렸다 넘기기" };
function startCalib(label: string): void {
  state.calib = { label, t0: performance.now(), jumps: [], occluded: 0 };
}
function calibFrame(t0: number, at: ShotAt | null): void {
  const c = state.calib;
  if (!c) return;
  gateEl.classList.remove("ready");
  gateEl.textContent = `가림 측정 — ${CALIB_LABEL[c.label] ?? c.label} 3초 (${c.jumps.length})`;
  if (at) { c.jumps.push(at.foreheadJump); if (at.foreheadOccluded) c.occluded += 1; }
  if (t0 - c.t0 < CALIB_MS) return;
  state.calibDone[c.label] = jumpStats(c.jumps, c.occluded);
  state.calib = null;
  outEl.textContent = `가림 측정 끝: ${c.label} ${JSON.stringify(state.calibDone[c.label])}`;
}

// ---------- 흔들기 측정 (다 찍은 뒤, 1-2 문제 12: 선명도 임계를 정하려고) ----------
const SHAKE_MS = 3000;
function startShake(): void {
  state.shake = { phase: "still", t0: performance.now(), still: [], shaky: [], iris: [] };
  $<HTMLButtonElement>("shake").disabled = true;
}
function shakeFrame(t0: number, at: ShotAt | null): void {
  const sk = state.shake;
  if (sk.phase === "idle" || sk.phase === "done") {
    gateEl.textContent = sk.phase === "done" ? "흔들기 측정 끝 — 끝을 누르세요" : "촬영 완료 — 흔들기 측정 또는 끝";
    gateEl.classList.add("ready");
    return;
  }
  const el = t0 - sk.t0;
  if (sk.phase === "still" && el >= SHAKE_MS) { sk.phase = "shaky"; sk.t0 = t0; }
  else if (sk.phase === "shaky" && el >= SHAKE_MS) { sk.phase = "done"; return; }
  gateEl.classList.remove("ready");
  gateEl.textContent = sk.phase === "still" ? "가만히 계세요 (3초)" : "폰을 좌우로 흔드세요 (3초)";
  if (!at) return;
  (sk.phase === "still" ? sk.still : sk.shaky).push(at.sharpness);
  sk.iris.push(at.irisPx);
}
function stats(v: readonly number[]): ShakeStats {
  const s = [...v].sort((a, b) => a - b);
  const q = (k: number): number => (s.length ? (s[Math.min(s.length - 1, Math.floor(k * (s.length - 1)))] ?? 0) : 0);
  return { n: s.length, min: r1(q(0)), p10: r1(q(0.1)), median: r1(q(0.5)), max: r1(q(1)) };
}

/** 얼굴형 판단용 정면 프레임 — 첫 장 셔터 전후로 조용히 모은다 (안내 문구 없음) */
function burstFrame(t0: number, m: ShotMeasure, at: ShotAt | null): void {
  const b = state.burst;
  if (!b || b.done) return;
  const pre = at ? shotGate("front_open", { ...m, stableCount: 99 }) : null;
  const r = burstStep(b, t0, !!pre?.ok && !!at);
  state.burst = r.state;
  if (r.dropOldest) state.burstFrames.shift();
  if (r.take && at) {
    const cv = document.createElement("canvas");
    cv.width = video.videoWidth; cv.height = video.videoHeight;
    cv.getContext("2d")?.drawImage(video, 0, 0);
    state.burstFrames.push({ cv, at });
  }
  if (r.state.done) finishBurst(t0);
}
function finishBurst(now: number): void {
  const b = state.burst;
  state.burstResult = {
    count: state.burstFrames.length, seconds: b?.shotAt != null ? r1((now - b.shotAt) / 1000) : 0,
    frames: state.burstFrames.map((f) => ({ yawLm: f.at.yawLm, eyeWidthPx: f.at.eyeWidthPx, sharpness: f.at.sharpness, faceRatio: f.at.faceRatio })),
  };
  const w = state.burstWait;
  state.burstWait = null;
  if (w) showConfirm(w.shotId, w.cv, w.at, w.shotAt);
}

/** 자동 촬영 → (첫 장이면 얼굴형 프레임을 마저 모은 뒤) 확인 화면 */
function takeShot(shotId: ShotId, at: ShotAt): void {
  const cv = document.createElement("canvas");
  cv.width = video.videoWidth; cv.height = video.videoHeight;
  cv.getContext("2d")?.drawImage(video, 0, 0);
  const now = performance.now();
  flashEl.hidden = false; setTimeout(() => (flashEl.hidden = true), 300);
  if (shotId === "front_open" && state.burst) {
    state.burst = burstShot(state.burst, now);
    if (!state.burst.done) { state.burstWait = { shotId, at, cv, shotAt: now }; return; }   // 화면은 "찍을게요" 그대로
    finishBurst(now);
  }
  showConfirm(shotId, cv, at, now);
}
/** 확인 화면 (루프는 멈춤) */
function showConfirm(shotId: ShotId, cv: HTMLCanvasElement, at: ShotAt, now: number): void {
  const rec: ShotRecord = { shot: shotId, seconds: r1((now - state.shotStart) / 1000), confirmSeconds: 0, blocked: state.blocked, at, retakes: state.retakes[shotId], rejected: state.rejected[shotId] };
  state.pending = { shot: shotId, cv, rec, shownAt: now };
  state.paused = true;
  state.blocked = {}; state.stable = 0;
  const k = Math.min(1, 360 / cv.width);
  confirmCv.width = Math.round(cv.width * k); confirmCv.height = Math.round(cv.height * k);
  const c = confirmCv.getContext("2d");
  if (c) { c.translate(confirmCv.width, 0); c.scale(-1, 1); c.drawImage(cv, 0, 0, confirmCv.width, confirmCv.height); }
  $("confirmTitle").textContent = `${NAME[shotId]} — 이 사진으로 할까요?`;
  $("confirmInfo").textContent = `yaw ${at.yawLm} · 여백 ${at.faceInset} · 얼굴비 ${at.faceRatio} · 눈폭 ${at.eyeWidthPx}px · 선명 ${at.sharpness} · L* ${at.foreheadL}`;
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
  $<HTMLButtonElement>("shake").disabled = nextShot(state.shots) !== null;
};
$<HTMLButtonElement>("redo").onclick = () => {
  const p = state.pending; if (!p) return;
  state.rejected[p.shot] += 1;
  if (p.shot === "front_open") { state.burst = null; state.burstFrames = []; state.burstResult = null; state.settle = null; }
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
  if (last === "front_open") { state.baselineL = undefined; state.burst = null; state.burstFrames = []; state.burstResult = null; state.settle = null; }
  state.blocked = {}; state.stable = 0; state.shotStart = performance.now();
  gateEl.classList.remove("ready");
  $<HTMLButtonElement>("shake").disabled = true;
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
  stopLoop();
  for (const t of state.stream?.getTracks() ?? []) await releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0]).finally(() => t.stop());   // 잠금 풀고 끄기 (#267)
  const shots = state.order.map((id) => state.shots[id]?.rec).filter((r): r is ShotRecord => !!r);
  const result: ProbeResult = {
    ua: navigator.userAgent, startedAt: state.startedAt, frameW: state.frameW, frameH: state.frameH,
    modelMs: state.modelMs, frameMsAvg: r1(state.frameMs.reduce((a, b) => a + b, 0) / Math.max(1, state.frameMs.length)),
    totalSeconds: r1((performance.now() - state.runStart) / 1000), captureSeconds: r1((state.lastShotAt - state.runStart) / 1000),
    consent: state.consent, shots, lockRow: state.lockRow, camDiag: state.camDiag, zoom: state.zoom,
    faceShapeBurst: state.burstResult,
    occlusionCalib: state.calibDone,
    gateLog: state.gateLog,
    foreheadJump: jumpStats(state.fjAll, state.fjOccluded),
    zoomApplied: state.zoomApplied,
    labDrift: shotsLabDrift(shots),
    shake: state.shake.phase === "done" ? { still: stats(state.shake.still), shaky: stats(state.shake.shaky), frontOpenSharpness: state.shots.front_open?.rec.at.sharpness ?? null, irisPx: stats(state.shake.iris) } : null,
    events: mem.lines,
  };
  const row = `| ${shortUa()} | ${result.startedAt.slice(0, 10)} | ${result.captureSeconds} | ${state.retakes.front_open} | ${state.retakes.front_closed} | 프레임 ${result.frameW}×${result.frameH} · ${result.frameMsAvg}ms/프레임 |`;
  const d = result.labDrift;
  const row14 = d ? `| (사람) | (조명) | ${r1(d.rangeL)} | ${r1(d.rangeA)} | ${r1(d.rangeB)} | ${r1(d.maxDeltaE)} | ${shortUa()} |` : "(장이 2장 미만이라 못 구함)";
  let sent = "";
  try {
    const r = await fetch("/__probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result) });
    sent = r.ok ? `PC 저장됨: ${await r.text()}` : `저장 실패 ${r.status}`;
  } catch (e) { sent = `저장 실패: ${String(e)}`; }
  outEl.textContent = `${sent}\n\n1-2 표 한 줄:\n${row}\n\n1-4 표 한 줄 (사람·조명 칸은 직접):\n${row14}\n\n장별:\n${shots.map((s) => `${NAME[s.shot]}: 이마 급변(2초 최대) ${s.at.foreheadJumpMax2s}, ${s.seconds}s (+확인 ${s.confirmSeconds}s), 거부 ${s.rejected}, 막힘 ${JSON.stringify(s.blocked)}, yaw lm ${s.at.yawLm} / col ${s.at.yawMatCol}, 여백 ${s.at.faceInset}, 선명 ${s.at.sharpness}, L*a*b* ${s.at.foreheadL}/${s.at.foreheadA}/${s.at.foreheadB}`).join("\n")}`;
}
function logGate(shot: ShotId, text: string, at: ShotAt): void {
  const span = (r: [number, number] | undefined, v: number): [number, number] => (r ? [Math.min(r[0], v), Math.max(r[1], v)] : [v, v]);
  const g = state.gateLog[shot] ?? { texts: {}, yaw: [at.yawLm, at.yawLm], pitch: [at.pitchLm, at.pitchLm], eyeWidthPx: [at.eyeWidthPx, at.eyeWidthPx], faceRatio: [at.faceRatio, at.faceRatio] };
  g.texts[text] = (g.texts[text] ?? 0) + 1;
  g.yaw = span(g.yaw, at.yawLm); g.pitch = span(g.pitch, at.pitchLm); g.eyeWidthPx = span(g.eyeWidthPx, at.eyeWidthPx); g.faceRatio = span(g.faceRatio, at.faceRatio);
  state.gateLog[shot] = g;
}
/** 1-4: 정면 눈 뜸을 첫 장으로 두고(SHOTS 순서) 이마 L*a*b* 폭. 이마를 못 잰 장(L*=0)은 뺀다 */
function shotsLabDrift(shots: readonly ShotRecord[]): ProbeResult["labDrift"] {
  const labs = SHOTS.map((s) => shots.find((r) => r.shot === s.id)?.at)
    .filter((at): at is ShotAt => !!at && at.foreheadL > 0)
    .map((at) => ({ L: at.foreheadL, a: at.foreheadA, b: at.foreheadB }));
  return labDrift(labs);
}
function jumpStats(v: readonly number[], occludedFrames: number): ProbeResult["foreheadJump"] {
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number): number => r1(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
  return { n: s.length, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: r1(s.at(-1) ?? 0), occludedFrames };
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
$<HTMLButtonElement>("shake").onclick = startShake;
// 확대 1.5배 (iPhone 초광각에서 얼굴이 작아 눈 폭 80px 을 못 채우는지 비교용). 지원 안 하면 안내만
$<HTMLButtonElement>("zoom").onclick = async () => {
  const track = state.stream?.getVideoTracks()[0];
  const want = state.zoomApplied ? 1 : 1.5;
  if (!track || !state.zoom) { outEl.textContent = "이 카메라는 확대(zoom)를 지원하지 않아요"; return; }
  try {
    await track.applyConstraints({ advanced: [{ zoom: Math.min(state.zoom.max, Math.max(state.zoom.min, want)) } as MediaTrackConstraintSet] });
    state.zoomApplied = want === 1 ? null : want;
    $<HTMLButtonElement>("zoom").textContent = state.zoomApplied ? "확대 끄기" : "확대 1.5배";
  } catch (e) { outEl.textContent = `확대 실패: ${String(e)}`; }
};
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-calib]"))) b.onclick = () => startCalib(b.dataset.calib ?? "");
$<HTMLButtonElement>("finish").onclick = () => { $<HTMLButtonElement>("finish").disabled = true; $<HTMLButtonElement>("retake").disabled = true; finish().catch((e) => { outEl.textContent = `끝내기 실패: ${String(e)}`; }); };
outEl.textContent = "시작 → 동의 화면 → 카메라. (https 필요)";
