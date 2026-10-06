/**
 * 화면 5 시도사진 (2026-10-06 새 흐름, 모듈 ⑥) — 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장을 자동으로 찍는다.
 *
 * 화면 1 촬영(①, screens/capture.ts)과 따로 만들었다. 판정은 ① 의 core 를 그대로 쓴다 (core/attempt.ts — capture-run · shotGate).
 * 카메라는 화면 6 정면 1장(review-shot.ts)과 같은 방식: 공용 카메라 루프(새 장면에만 얼굴 찾기, #245) · 켤 때·끌 때 잠금 풀기(#267).
 * 맨얼굴 대비 밝기 · 색은 막지 않는다 — 조명이 달라졌으면 피드백(③)이 판단할 일이다.
 * 두 장을 다 찍으면 카메라를 끄고 사진 · 얼굴 점을 넘긴 뒤 다음 화면(6 피드백)으로.
 */

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { ATTEMPT_SHOTS, startAttemptRun, type AttemptShotId } from "@core/attempt";
import { runStep, STEP_TEXT, type RunState } from "@core/capture-run";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "@core/capture-measure";
import type { ShotMeasure } from "@core/flow";
import type { ScreenId } from "@core/screens";
import type { Pt } from "@core/types";
import { releaseCameraLocks } from "./camera-locks";
import { startFrameLoop } from "./camera-loop";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { encodeForStore } from "./image-encode";
import { createLandmarker } from "./landmarker";
import type { Screen, ScreenContext } from "./shell";

/** 한 장 — 사진(JPEG) · 얼굴 점(사진 px) · 사진 크기. 피드백(③)이 맨얼굴 · 정답사진과 맞춰 비교한다 */
export interface AttemptShot {
  blob: Blob;
  lm: Pt[];
  w: number;
  h: number;
}
export type AttemptShots = Record<AttemptShotId, AttemptShot>;

export interface AttemptDeps {
  /** 두 장을 다 찍으면 부른다 (세션 · 폰 저장은 부르는 쪽) */
  setAttempt: (shots: AttemptShots) => void | Promise<void>;
  /** 다 찍은 뒤 갈 화면 */
  next: ScreenId;
}

export const ATTEMPT_TEXT = {
  title: "화장을 다 했으면 사진을 찍어요",
  intro: "처음에 맨얼굴을 찍을 때처럼 정면에서 눈을 떴다가 감아 주세요. 두 장이 자동으로 찍혀요",
  start: "찍기 시작",
  loading: "카메라를 켜고 있어요…",
  saving: "사진을 정리하고 있어요…",
  cameraFail: "카메라를 열 수 없어요. 카메라 권한을 확인해 주세요",
  retry: "다시 시도",
} as const;

/**
 * 찍혔다는 신호: 짧은 소리 + 진동. 눈 감는 장은 높은 "삑" — 눈을 감고 있어 화면을 못 본다 (화면 1 과 같은 소리).
 * iOS 는 탭할 때 소리를 열어 둬야 나중에 난다 → "찍기 시작" 에서 연다
 */
let audio: AudioContext | null = null;
function shutterCue(eyesShut: boolean): void {
  try { navigator.vibrate?.(200); } catch { /* 지원 안 함 */ }
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = eyesShut ? 880 : 520;
    g.gain.value = 0.15;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (eyesShut ? 0.15 : 0.08));
  } catch { /* 소리 못 냄 */ }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function attemptScreen<S>(deps: AttemptDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = el("div", "attempt");
      ctx.root.append(wrap);
      let stopCamera: (() => void) | null = null;
      let alive = true;

      function intro(): void {
        wrap.textContent = "";
        const btn = el("button", "primary", ATTEMPT_TEXT.start);
        btn.type = "button";
        btn.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "attempt_start" });
          try { audio ??= new AudioContext(); void audio.resume(); } catch { /* */ }
          camera();
        });
        wrap.append(el("h1", "", ATTEMPT_TEXT.title), el("p", "muted", ATTEMPT_TEXT.intro), btn);
      }

      function failed(e: unknown): void {
        ctx.log.log({ name: "error", where: "attempt", msg: e instanceof Error ? e.message : String(e) });
        wrap.textContent = "";
        const btn = el("button", "primary", ATTEMPT_TEXT.retry);
        btn.type = "button";
        btn.addEventListener("click", () => camera());
        wrap.append(el("p", "cam-gate", ATTEMPT_TEXT.cameraFail), btn);
      }

      function camera(): void {
        wrap.textContent = "";
        const cam = el("div", "cam");
        const video = el("video", "cam-video");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        const oval = el("div", "cam-oval");
        cam.append(video, oval);
        const step = el("p", "cam-step", STEP_TEXT.front_open);
        const line = el("p", "cam-gate", ATTEMPT_TEXT.loading);
        wrap.append(step, cam, line);

        let on = true;
        let stopLoop = (): void => {};
        let stream: MediaStream | null = null;
        let lmk: FaceLandmarker | null = null;
        /** 잠금을 풀고 끈다 — PC 웹캠은 잠금을 기기에 저장해서 다음에 열 때 남는다 (#267) */
        const stopTracks = (st: MediaStream | null): void => {
          for (const t of st?.getTracks() ?? []) void releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0]).finally(() => t.stop());
        };
        const stop = (): void => {
          on = false;
          stopLoop();
          stopTracks(stream);
          stream = null;
          lmk?.close();
          lmk = null;
        };
        stopCamera = stop;

        void (async () => {
          try {
            const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
            if (!on) { stopTracks(st); return; }
            stream = st;
            // 앞 화면이 남긴 카메라 잠금부터 푼다 (#267). 여기서는 아무것도 잠그지 않는다
            const track = st.getVideoTracks()[0];
            if (track) await releaseCameraLocks(track as unknown as Parameters<typeof releaseCameraLocks>[0]);
            if (!on) return;
            video.srcObject = st;
            await video.play();
            const m = await createLandmarker("VIDEO");
            if (!on) { m.close(); return; }
            lmk = m;
            const taken: Partial<Record<AttemptShotId, { cv: HTMLCanvasElement; lm: Pt[]; w: number; h: number }>> = {};
            let run: RunState = startAttemptRun(taken, performance.now());
            line.textContent = "";
            // now = 공용 루프가 주는 늘어나기만 하는 시각 — 얼굴 찾기와 촬영 대기 시간이 같이 쓴다
            const frame = (now: number): void => {
              if (!on || !lmk || !run.shot) return;
              if (video.readyState < 2) return;
              const sw = video.videoWidth, sh = video.videoHeight;
              const res: FaceLandmarkerResult = lmk.detectForVideo(video, now);
              const raw = res.faceLandmarks[0];
              const ms: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
              let lm: Pt[] | null = null;
              if (raw) {
                lm = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
                const ang = yawFromLandmarks(lm);
                const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
                const lab = foreheadLabOf(video, lm, sw, sh)?.skin;
                if (lab) ms.foreheadL = lab.L;
                Object.assign(ms, {
                  yaw: -ang.yaw, pitch: ang.pitch, ...eyesClosed(lm, bs),
                  faceRatio: faceRatioOf(lm, sw, sh), faceInset: faceInsetOf(lm, sw, sh), eyeWidthPx: eyeWidthPxOf(lm),
                  sharpness: sharpnessOf(video, faceCropOf(lm, sw, sh)),
                });
              }
              const shot = run.shot as AttemptShotId;   // startAttemptRun 은 정면 두 장만 낸다
              const r = runStep(run, ms, now);
              run = r.state;
              line.textContent = r.hint ?? r.gate?.text ?? "";
              line.classList.toggle("ready", !!r.gate?.ok);
              oval.classList.toggle("ready", !!r.gate?.ok);
              if (!r.take || !lm) return;
              taken[shot] = { cv: grabFrame(video), lm, w: sw, h: sh };
              shutterCue(shot === "front_closed");
              ctx.log.log({ name: "button", button: `attempt_shot:${shot}` });
              run = startAttemptRun(taken, now);
              if (run.shot) { step.textContent = STEP_TEXT[run.shot]; return; }
              // 두 장 다 — 카메라를 끄고 넘긴다
              stop();
              step.textContent = "";
              line.textContent = ATTEMPT_TEXT.saving;
              void Promise.all(ATTEMPT_SHOTS.map(async (id) => {
                const t = taken[id]!;
                const e = await encodeForStore(t.cv);
                return [id, { blob: e.blob, lm: t.lm, w: t.w, h: t.h }] as const;
              })).then(async (pairs) => {
                if (!alive) return;
                await deps.setAttempt(Object.fromEntries(pairs) as AttemptShots);
                if (alive) ctx.go(deps.next);
              }, (e: unknown) => { if (alive) failed(e); });
            };
            // 카메라 새 장면에만 얼굴을 찾는다 (#245). 루프 안 오류는 바깥 try 가 못 잡는다
            stopLoop = startFrameLoop(video, frame, { onError: (e) => { stop(); if (alive) failed(e); } });
          } catch (e) {
            stop();
            if (alive) failed(e);
          }
        })();
      }

      intro();
      return () => {
        alive = false;
        stopCamera?.();
      };
    },
  };
}
