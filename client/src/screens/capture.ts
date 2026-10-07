/**
 * 화면 1 — 맨얼굴 4장 자동 촬영 (F-01, 정의서 화면 1). 모듈 ①.
 *
 * 흐름: 촬영 안내(이마·귀·안경) → 카메라 → 장마다 조건 한 줄 → 조건이 안정되면 자동으로 찍음 → 4장 → 완료(썸네일·장별 다시 찍기) → 서버 처리.
 * 측정·조건은 프로브(capture-probe, 폰 실측 1-2)와 같은 코드다: core/capture-measure · screens/frame-measure · core/capture-run.
 *
 *  - 정면 눈 뜸을 찍으면 기준(Baseline)을 만들고 쌩얼 사진을 IndexedDB 에 저장한다 (1-7 "bare").
 *    정면을 다시 찍으면 기준을 다시 만들고 나머지 장의 랜드마크를 새 기준에 맞춘다 (1-11, baseline.retakeFront).
 *  - 홈으로 나갔다 오면(카메라가 꺼짐) 화면을 다시 그려 남은 장부터 이어서 찍는다.
 *  - 정면 눈 뜸을 찍을 때 앞뒤 정면 프레임 5장을 조용히 같이 모은다 (F-02 얼굴형 입력, FACE_SHAPE_BURST, #159). 모자라면 셔터 뒤 1.5초 더
 *  - 얼굴형 분류(⑤)는 아직 없다 → faceShape 는 자리값(confidence 0). ⑤ 가 오면 buildBaseline 입력만 바뀐다.
 */

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Lab } from "@core/color";
import type { CaptureEvents } from "@core/capture-events";
import { STEP_TEXT, runStep, startRun, type RunState } from "@core/capture-run";
import { buildBaseline, retakeFront } from "@core/baseline";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "@core/capture-measure";
import { SHOTS, burstShot, burstStep, nextShot, shotGate, startBurst, type BurstState, type ShotId, type ShotMeasure } from "@core/flow";
import { foreheadStep, startForeheadTrack } from "@core/occlusion";
import type { Baseline, FaceShape, Pt } from "@core/types";
import type { ScreenId } from "@core/screens";
import { ALL_LOCKS, applyCameraLocks, applyUltraWideZoom, bindVisibility, releaseCameraLocks, requestWakeLock, type WakeLockSentinelLike } from "./camera-locks";
import { startFrameLoop } from "./camera-loop";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { BARE_MAX_SIDE, encodeForStore } from "./image-encode";
import { createLandmarker } from "./landmarker";
import type { Screen, ScreenContext } from "./shell";

/** 세션에 두는 한 장. 사진·랜드마크는 메모리에만 (draft 에는 true/false 만) */
export interface ShotData {
  cv: HTMLCanvasElement;
  lm: Pt[];
  w: number;
  h: number;
  /** 찍을 때 이마 L*a*b* — 정면 눈 뜸 값이 나머지 장의 밝기·색 조건 기준 */
  forehead: Lab | null;
  /** 찍을 때 표정 점수 (블렌드셰이프) — 정면 눈 뜸 값이 Baseline.expression (#177) */
  expr: Record<string, number> | null;
}

export interface CaptureDeps {
  getShots: () => Partial<Record<ShotId, unknown>>;
  setShot: (id: ShotId, data: ShotData | null) => void;
  getBaseline: () => Baseline | null;
  setBaseline: (b: Baseline | null) => void;
  /** 쌩얼 사진 저장 (session-store "bare"). 인코딩이 끝나기 전에 넘긴다 — 끝내기가 저장까지 기다릴 수 있게 */
  saveBare: (blob: Promise<Blob>) => Promise<void>;
  /** 얼굴형 판단용 정면 프레임 (F-02). 메모리에만 */
  setFaceShapeFrames: (frames: HTMLCanvasElement[]) => void;
  events: CaptureEvents;
  /** 4장 뒤 "화장 고르러 가기" 가 가는 곳 */
  next: ScreenId;
}

/** ⑤ 얼굴형 분류가 오기 전 자리값 — 쉐딩·하이라이트 멘트는 confidence 0 이면 안 쓴다 */
export const PENDING_FACE_SHAPE: FaceShape = { label: "oval", confidence: 0, method: "rule", version: "faceshape-pending" };

export const CAPTURE_TEXT = {
  loading: "카메라를 준비하고 있어요…",
  cameraFail: "카메라를 열 수 없어요. 브라우저 설정에서 카메라를 허용해 주세요",
  doneTitle: "사진 확인",
  doneSub: "찍힌 사진을 확인해 주세요",
  doneCoach: "이상한 사진이 있으면 그 사진만 다시 찍을 수 있어요",
  retake: "다시 찍기",
  go: "화장 고르러 가기",
} as const;

function isShotData(v: unknown): v is ShotData {
  return typeof v === "object" && v !== null && "cv" in v && "lm" in v;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function thumb(cv: HTMLCanvasElement | null, w = 160): HTMLCanvasElement {
  const c = el("canvas", "shot-thumb");
  if (!cv) { c.width = w; c.height = Math.round(w * 4 / 3); return c; }
  c.width = w; c.height = Math.round((w * cv.height) / cv.width);
  const g = c.getContext("2d");
  if (g) { g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0, c.width, c.height); }
  return c;
}

/**
 * 찍혔다는 신호: 짧은 소리 + 진동. 눈 감는 장은 높은 "삑", 나머지는 낮은 "톡".
 * 눈을 감고 있으면 번쩍임을 못 봐서 언제 떠야 할지 모른다 (2026-09-28 Android 실기기).
 * 진동은 기기 진동 세기 설정을 따라 안 느껴지기도 해서(같은 날 Android: 소리만 들림) 소리를 모든 장에 낸다. iOS 는 진동이 없다.
 */
let audio: AudioContext | null = null;
function shutterCue(eyesClosed: boolean): void {
  try { navigator.vibrate?.(200); } catch { /* 지원 안 함 */ }
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = eyesClosed ? 880 : 520;
    g.gain.value = 0.15;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (eyesClosed ? 0.15 : 0.08));
  } catch { /* 소리 못 냄 — 진동·번쩍임만 */ }
}

export function captureScreen<S>(deps: CaptureDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = el("div", "capture");
      ctx.root.append(wrap);
      let alive = true;
      let stopCamera: () => void = () => {};
      // 카메라를 다시 켤 때마다 올린다 — 앞 카메라의 늦게 끝난 시작(모델·스트림)이 새 화면을 건드리지 않게
      let camId = 0;
      // 모델은 화면이 떠 있는 동안 한 번만 불러온다 (다시 찍기마다 2~3초 기다리지 않게)
      let model: Promise<FaceLandmarker> | null = null;
      const getModel = (): Promise<FaceLandmarker> => (model ??= createLandmarker("VIDEO"));

      const shots = (): Partial<Record<ShotId, unknown>> => deps.getShots();

      // ---------- 완료 (4장) ----------
      function showDone(): void {
        stopCamera();
        wrap.textContent = "";
        wrap.classList.add("capture-done-screen");
        const header = el("div", "capture-done-header");
        header.innerHTML = `
          <div class="nudy-logo capture-done-logo" aria-label="nudy">
            <span>nudy</span>
            <i aria-hidden="true"></i>
          </div>
          <h1>${CAPTURE_TEXT.doneTitle}</h1>
          <p>${CAPTURE_TEXT.doneSub}</p>
        `;
        const coach = el("div", "capture-done-coach");
        coach.innerHTML = `
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <div><span>${CAPTURE_TEXT.doneCoach}</span><i aria-hidden="true"></i></div>
        `;
        const grid = el("ul", "shot-grid");
        for (const s of SHOTS) {
          const v = shots()[s.id];
          const li = el("li", "shot-cell");
          li.append(thumb(isShotData(v) ? v.cv : null), el("span", "shot-name", s.name));
          const b = el("button", "shot-retake", CAPTURE_TEXT.retake);
          b.type = "button";
          b.addEventListener("click", () => {
            ctx.log.log({ name: "button", button: `retake:${s.id}` });
            deps.events.retake(s.id);
            deps.setShot(s.id, null);
            if (s.id === "front_open") deps.setFaceShapeFrames([]);
            showCamera();
          });
          li.append(b);
          grid.append(li);
        }
        const row = el("div", "row");
        const go = el("button", "primary", CAPTURE_TEXT.go);
        go.type = "button";
        go.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "capture_done" });
          ctx.go(deps.next);
        });
        row.append(go);
        wrap.append(header, coach, grid, row);
      }

      function showCamera(): void {
        stopCamera();
        wrap.classList.remove("capture-done-screen");
        const my = ++camId;
        const live = (): boolean => alive && my === camId;
        wrap.textContent = "";
        const logo = el("div", "nudy-logo capture-camera-logo");
        logo.setAttribute("aria-label", "nudy");
        logo.innerHTML = `<span>nudy</span><i aria-hidden="true"></i>`;
        const title = el("p", "capture-camera-title", "사진 촬영");
        const stage = el("div", "cam");
        const video = el("video", "cam-video");
        video.playsInline = true; video.muted = true; video.autoplay = true;
        const oval = el("div", "cam-oval");
        const flash = el("div", "cam-flash");
        flash.hidden = true;
        const coach = el("div", "cam-coach");
        coach.innerHTML = `
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <div><span>${CAPTURE_TEXT.loading}</span><i aria-hidden="true"></i></div>
        `;
        const coachText = coach.querySelector<HTMLSpanElement>("span");
        stage.append(video, oval, flash, coach);
        const step = el("p", "cam-step");
        const line = el("p", "cam-gate", CAPTURE_TEXT.loading);
        const hint = el("p", "cam-hint");
        hint.hidden = true;
        const progress = el("ol", "cam-progress");
        const drawProgress = (): void => {
          progress.textContent = "";
          for (const s of SHOTS) progress.append(el("li", shots()[s.id] ? "on" : ""));
        };
        drawProgress();
        wrap.append(logo, title, step, stage, line, hint, progress);

        let lmk: FaceLandmarker | null = null;
        let stream: MediaStream | null = null;
        let wake: WakeLockSentinelLike | null = null;
        let stopLoop = (): void => {};
        let run: RunState = startRun(shots(), performance.now());
        let fj = startForeheadTrack();
        let lostSince: number | null = null;
        let busy = false;
        // 얼굴형 프레임: 정면 눈 뜸을 아직 안 찍었을 때만 모은다. burstWait 이면 셔터 뒤 마저 모으는 중 (다음 장으로 안 넘어감)
        let burst: BurstState | null = shots().front_open ? null : startBurst();
        let burstFrames: HTMLCanvasElement[] = [];
        let burstWait = false;

        stopCamera = () => {
          stopLoop();
          // 잠금을 풀고 끈다 — PC 웹캠은 잠금을 기기에 저장해서 다음에 열 때 남는다 (#267)
          for (const t of stream?.getTracks() ?? []) void releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0]).finally(() => t.stop());
          stream = null;
          void wake?.release().catch(() => {});
          wake = null;
          lmk = null;
        };

        const setStep = (): void => {
          step.textContent = run.shot ? `${SHOTS.findIndex((s) => s.id === run.shot) + 1}/4 · ${STEP_TEXT[run.shot]}` : "";
        };
        const setCoach = (text: string): void => {
          if (coachText) coachText.textContent = text || "얼굴을 맞춰 주세요";
          line.textContent = text;
        };

        async function start(): Promise<void> {
          const m = await getModel();
          if (!live()) return;
          lmk = m;
          // 1080p: 720p 에서는 iPhone 초광각 얼굴이 작아 눈 폭 80px 을 못 채운다 (1-2 실측)
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          if (!live()) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play();
          const track = stream.getVideoTracks()[0];
          if (track) {
            const tl = track as unknown as Parameters<typeof applyCameraLocks>[0];
            // 앞 세션·다른 화면이 남긴 잠금부터 푼다 (#267: PC 웹캠이 하얗게·파랗게 고정된 채 남음)
            await releaseCameraLocks(tl);
            // 기본은 아무것도 안 잠근다 (DEFAULT_LOCKS, #267). 비교용 주소 ?lock=all · wb · wbfocus
            const lockMode = new URLSearchParams(location.search).get("lock");
            const only = lockMode === "all" ? ALL_LOCKS : lockMode === "wb" ? (["whiteBalanceMode"] as const) : lockMode === "wbfocus" ? (["whiteBalanceMode", "focusMode"] as const) : undefined;
            if (only) {
              await new Promise((r) => setTimeout(r, 1500));   // 자동이 자리 잡은 뒤 잠근다
              await applyCameraLocks(tl, only);
            }
            await applyUltraWideZoom(track as unknown as Parameters<typeof applyUltraWideZoom>[0]);
          }
          wake = await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
          // 기다리는 사이 떠나거나 숨었으면(stopCamera) 루프를 켜지 않는다
          if (!live() || !stream) { void wake?.release().catch(() => {}); return; }
          run = startRun(shots(), performance.now());
          setStep();
          // 카메라 새 장면에만 얼굴을 찾는다 (#245 — 전에는 화면 그리기마다라 같은 장면을 두세 번)
          stopLoop = startFrameLoop(video, frame);
        }

        function frame(now: number): void {
          if (!live() || !lmk || !stream) return;
          const shot = run.shot;
          if (busy || video.readyState < 2 || (!shot && !burstWait)) return;
          const sw = video.videoWidth, sh = video.videoHeight;
          const res: FaceLandmarkerResult = lmk.detectForVideo(video, now);
          const raw = res.faceLandmarks[0];
          const m: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
          let lm: Pt[] = [];
          let lab: Lab | undefined;
          let expr: Record<string, number> | null = null;
          if (raw) {
            if (lostSince !== null) { deps.events.faceLost(now - lostSince); lostSince = null; }
            lm = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
            const ang = yawFromLandmarks(lm);
            const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
            if (bs.size) expr = Object.fromEntries(bs);
            const yaw = -ang.yaw;   // 화면(거울) 기준
            const fr = foreheadLabOf(video, lm, sw, sh);
            lab = fr?.skin;
            // 가림(급변)은 전체 평균으로 — 피부만 남기면 그림자 진 손도 빠져 가림을 못 잡는다 (#212 리뷰)
            if (fr?.raw) {
              const r = foreheadStep(fj, now, fr.raw, { yaw, pitch: ang.pitch });
              fj = r.track;
              m.foreheadOccluded = r.occluded;
            }
            if (lab) {
              m.foreheadL = lab.L;
              m.foreheadAb = { a: lab.a, b: lab.b };
            } else {
              m.foreheadHidden = true;   // 이마 대부분이 머리카락 — 조명 기준을 못 잰다 (color.foreheadLab)
            }
            Object.assign(m, {
              yaw, pitch: ang.pitch, ...eyesClosed(lm, bs),
              faceRatio: faceRatioOf(lm, sw, sh), faceInset: faceInsetOf(lm, sw, sh), eyeWidthPx: eyeWidthPxOf(lm),
              sharpness: sharpnessOf(video, faceCropOf(lm, sw, sh)),
            });
            const front = shots().front_open;
            if (shot !== "front_open" && isShotData(front) && front.forehead) {
              m.baselineL = front.forehead.L;
              m.baselineAb = { a: front.forehead.a, b: front.forehead.b };
            }
          } else if (lostSince === null) {
            lostSince = now;
          }
          if (burst && !burst.done && (shot === "front_open" || burstWait)) {
            const b = burstStep(burst, now, shotGate("front_open", { ...m, stableCount: Number.MAX_SAFE_INTEGER }).ok);
            burst = b.state;
            if (b.dropOldest) burstFrames.shift();
            if (b.take) burstFrames.push(grabFrame(video, 1024));
            if (burstWait && burst.done) finishBurst();
          }
          if (burstWait || !shot) return;   // 셔터 뒤 얼굴형 프레임을 마저 모으는 동안은 "찍을게요" 그대로
          const r = runStep(run, m, now);
          run = r.state;
          if (r.gate) deps.events.blocked(shot, r.gate.ok ? null : r.gate.firstFail, now);
          setCoach(r.gate?.text ?? "");
          line.classList.toggle("ready", !!r.gate?.ok);
          oval.classList.toggle("ready", !!r.gate?.ok);
          hint.hidden = r.hint === null;
          hint.textContent = r.hint ?? "";
          if (r.take) take(shot, video, lm, sw, sh, lab ?? null, expr);
        }

        function take(id: ShotId, video: HTMLVideoElement, lm: Pt[], w: number, h: number, forehead: Lab | null, expr: Record<string, number> | null): void {
          busy = true;
          const cv = grabFrame(video);
          flash.hidden = false;
          setTimeout(() => (flash.hidden = true), 250);
          shutterCue(id === "front_closed");
          const data: ShotData = { cv, lm, w, h, forehead, expr };
          if (id === "front_open") setFront(data);
          deps.setShot(id, data);
          deps.events.shot(id, true, null);
          drawProgress();
          busy = false;
          if (id === "front_open" && burst) {
            burst = burstShot(burst, performance.now());
            if (!burst.done) { burstWait = true; return; }
            finishBurst();
            return;
          }
          nextStep();
        }

        function finishBurst(): void {
          deps.setFaceShapeFrames(burstFrames);
          burst = null; burstFrames = []; burstWait = false;
          nextStep();
        }

        function nextStep(): void {
          run = startRun(shots(), performance.now());
          fj = startForeheadTrack();
          setStep();
          if (!run.shot) showDone();
        }

        start().catch((e: unknown) => {
          setCoach(CAPTURE_TEXT.cameraFail);
          ctx.log.log({ name: "error", where: "capture", msg: `camera:${String(e).slice(0, 120)}` });
        });
      }

      /** 정면 눈 뜸: 기준 만들기(다시 찍었으면 나머지 장 재정렬) + 쌩얼 저장 */
      function setFront(d: ShotData): void {
        const g = d.cv.getContext("2d");
        const image = g ? g.getImageData(0, 0, d.cv.width, d.cv.height) : undefined;
        const input = { lm: d.lm, w: d.w, h: d.h, faceShape: PENDING_FACE_SHAPE, expression: d.expr, ...(image ? { image: { data: image.data, w: image.width, h: image.height } } : {}) };
        const prev = deps.getBaseline();
        if (prev && prev.lm.length) {
          const others: Record<string, Pt[]> = {};
          for (const s of SHOTS) {
            const v = shots()[s.id];
            if (s.id !== "front_open" && isShotData(v)) others[s.id] = v.lm;
          }
          const r = retakeFront(prev, input, others);
          for (const [k, lm] of Object.entries(r.others)) {
            const v = shots()[k as ShotId];
            if (isShotData(v)) deps.setShot(k as ShotId, { ...v, lm });
          }
          deps.setBaseline(r.baseline);
        } else {
          deps.setBaseline(buildBaseline(input));
        }
        const blob = encodeForStore(d.cv, BARE_MAX_SIDE).then((e) => e.blob);   // 원본 크기 (#240)
        deps.saveBare(blob)
          .then(async () => {
            const bare = await blob;
            const b = deps.getBaseline();
            if (b) deps.setBaseline({ ...b, bareImage: bare });
          })
          .catch((e: unknown) => ctx.log.log({ name: "error", where: "capture", msg: `save_bare:${String(e).slice(0, 120)}` }));
      }

      // 홈으로 나갔다 오면 카메라가 꺼져 있다 → 다시 그려서 남은 장부터
      const unbind = bindVisibility(document, {
        onHidden: () => stopCamera(),
        onVisible: () => { if (alive && nextShot(shots())) ctx.go("capture"); },
      });

      if (!nextShot(shots())) showDone();
      else showCamera();

      return () => {
        alive = false;
        unbind();
        stopCamera();
        void model?.then((m) => m.close()).catch(() => {});
      };
    },
  };
}
