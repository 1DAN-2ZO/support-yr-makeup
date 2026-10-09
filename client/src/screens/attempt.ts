/**
 * 화면 5 시도사진 (2026-10-06 새 흐름, 모듈 ⑥) — 화장을 다 한 뒤 정면 눈 뜬 장을 자동으로 찍는다 (눈 감은 장은 2026-10-09 뺌, #386).
 *
 * 화면 1 촬영(①, screens/capture.ts)과 따로 만들었다. 판정은 ① 의 core 를 그대로 쓴다 (core/attempt.ts — capture-run · shotGate).
 * 카메라는 화면 6 정면 1장(review-shot.ts)과 같은 방식: 공용 카메라 루프(새 장면에만 얼굴 찾기, #245) · 켤 때·끌 때 잠금 풀기(#267).
 * 맨얼굴 대비 밝기 · 색은 막지 않는다 — 조명이 달라졌으면 피드백(③)이 판단할 일이다.
 * 눈 뜬 장은 다섯 장 묶음(#328 — 피드백이 값마다 가운데 값을 쓴다). 사진은 줄이지 않는다 — 맨얼굴과 같은 원본 크기.
 * 다 찍으면 카메라를 끄고 미리보기 — "다시 찍기" 또는 "이대로 피드백 받기"(사진 · 얼굴 점을 넘기고 6 피드백으로).
 */

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { ATTEMPT_SHOTS, attemptBurstStep, startAttemptBurst, startAttemptRun, type AttemptBurst, type AttemptShotId } from "@core/attempt";
import { runStep, STEP_TEXT, type RunState } from "@core/capture-run";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "@core/capture-measure";
import type { ShotMeasure } from "@core/flow";
import type { ScreenId } from "@core/screens";
import type { Pt } from "@core/types";
import { releaseCameraLocks } from "./camera-locks";
import { startFrameLoop } from "./camera-loop";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { BARE_MAX_SIDE, encodeForStore } from "./image-encode";
import { createLandmarker } from "./landmarker";
import type { Screen, ScreenContext } from "./shell";

/** 한 장 — 사진(원본 크기) · 얼굴 점(사진 px) · 사진 크기. 피드백(③)이 맨얼굴 · 정답사진과 맞춰 비교한다 */
export interface AttemptShot {
  blob: Blob;
  lm: Pt[];
  w: number;
  h: number;
}
/** 종류마다 장 묶음 — [0] 이 셔터 장. 눈 뜬 장 다섯 장까지 (core/attempt ATTEMPT_BURST). 눈 감은 장은 뺐다 (#386) */
export type AttemptShots = Record<AttemptShotId, AttemptShot[]>;

export interface AttemptDeps {
  /** 다 찍으면 부른다 (세션 · 폰 저장은 부르는 쪽) */
  setAttempt: (shots: AttemptShots) => void | Promise<void>;
  /** 다 찍은 뒤 갈 화면 */
  next: ScreenId;
}

export const ATTEMPT_TEXT = {
  title: "화장을 다 했으면 사진을 찍어요",
  intro: "처음에 맨얼굴을 찍을 때처럼 정면을 보고 눈을 떠 주세요. 자동으로 찍혀요",
  start: "찍기 시작",
  loading: "카메라를 켜고 있어요…",
  saving: "사진을 정리하고 있어요…",
  cameraFail: "카메라를 열 수 없어요. 카메라 권한을 확인해 주세요",
  retry: "다시 시도",
  coach: "화장이 끝났으면 같은 자리에서 한 번 더 찍어 주세요",
  previewTitle: "이렇게 찍혔어요",
  previewSub: "괜찮으면 피드백으로 넘어가요",
  openLabel: "화장한 사진",
  retake: "다시 찍기",
  confirm: "이대로 피드백 받기",
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

/**
 * 다른 화면(screens/flow-slots.ts)과 **같은 class** 를 쓴다 — 로고 · 코치 말풍선 · 제목.
 * 여기서 새로 꾸미지 않는 이유: 앞 화면(부위 가이드)에서 넘어온 사람이 다른 앱으로 느끼지 않게
 * 한곳(app.css 의 slot-*)만 고치면 둘이 같이 바뀌어야 한다 (#344 ①)
 */
function nudyLogo(): HTMLElement {
  const e = document.createElement("div");
  e.className = "nudy-logo slot-logo";
  e.setAttribute("aria-label", "nudy");
  e.innerHTML = `<span>nudy</span><i aria-hidden="true"></i>`;
  return e;
}

/**
 * 로고 줄 — 왼쪽에 뒤로 가는 화살표 (#369). flow-slots 와 같은 class 를 쓴다.
 * 화살표는 글자가 없으므로 어디로 가는지는 aria-label 에 적는다
 */
function logoRow(label: string, onBack: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "slot-logo-row";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "slot-back";
  b.setAttribute("aria-label", label);
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>`;
  b.addEventListener("click", onBack);
  row.append(b, nudyLogo());
  return row;
}

function coach(text: string): HTMLElement {
  const e = document.createElement("div");
  e.className = "slot-coach";
  e.innerHTML = `
    <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
    <div><span>${text}</span><i aria-hidden="true"></i></div>
  `;
  return e;
}

function head(title: string, sub: string): HTMLElement {
  const e = document.createElement("div");
  e.className = "slot-head";
  e.innerHTML = `<h1>${title.replace(/^(\S+)/, "<em>$1</em>")}</h1><p>${sub}</p>`;
  return e;
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
      /** 미리보기에 쓴 객체 URL — 다시 찍거나 떠날 때 돌려준다 */
      let previewUrls: string[] = [];
      const dropPreview = (): void => {
        for (const u of previewUrls) URL.revokeObjectURL(u);
        previewUrls = [];
      };

      /** 찍은 사진을 보여 주고 고르게 한다 */
      function preview(shots: AttemptShots): void {
        dropPreview();
        wrap.textContent = "";
        const row = el("div", "attempt-preview");
        // 사진은 원본 크기라(#330) 크기를 잡아 주지 않으면 구석만 보이고 버튼이 화면 밖으로 밀린다 (폰 확인 2026-10-08, #344).
        // 꾸밈은 ⑤ 몫 — 여기서는 화면 안에 들어오게만 한다 (class 스타일이 있으면 그쪽이 다듬는다)
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "minmax(0, 260px)", justifyContent: "center", gap: "12px" });
        for (const [id, label] of [["front_open", ATTEMPT_TEXT.openLabel]] as const) {
          const fig = el("figure");
          const img = el("img");
          const url = URL.createObjectURL(shots[id][0]!.blob);   // 종류마다 셔터 장만 보여 준다
          previewUrls.push(url);
          img.src = url;
          img.alt = label;
          fig.style.margin = "0";
          Object.assign(img.style, { width: "100%", height: "auto", display: "block" });
          fig.append(img, el("figcaption", "", label));
          row.append(fig);
        }
        const retake = el("button", "ghost", ATTEMPT_TEXT.retake);
        retake.type = "button";
        retake.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "attempt_retake" });
          dropPreview();
          camera();
        });
        const confirm = el("button", "primary", ATTEMPT_TEXT.confirm);
        confirm.type = "button";
        let sent = false;
        confirm.addEventListener("click", () => {
          if (sent) return;
          sent = true;
          ctx.log.log({ name: "button", button: "attempt_confirm" });
          void Promise.resolve(deps.setAttempt(shots)).then(() => { if (alive) ctx.go(deps.next); });
        });
        wrap.append(logoRow("부위 가이드로 돌아가기", () => {
          ctx.log.log({ name: "button", button: "back:partguide" });
          ctx.go("partguide");
        }), head(ATTEMPT_TEXT.previewTitle, ATTEMPT_TEXT.previewSub), row, retake, confirm);
      }

      function intro(): void {
        wrap.textContent = "";
        const btn = el("button", "primary", ATTEMPT_TEXT.start);
        btn.type = "button";
        btn.addEventListener("click", () => {
          ctx.log.log({ name: "button", button: "attempt_start" });
          try { audio ??= new AudioContext(); void audio.resume(); } catch { /* */ }
          camera();
        });
        wrap.append(logoRow("부위 가이드로 돌아가기", () => {
          ctx.log.log({ name: "button", button: "back:partguide" });
          ctx.go("partguide");
        }), coach(ATTEMPT_TEXT.coach), head(ATTEMPT_TEXT.title, ATTEMPT_TEXT.intro), btn);
      }

      function failed(e: unknown): void {
        ctx.log.log({ name: "error", where: "attempt", msg: e instanceof Error ? e.message : String(e) });
        wrap.textContent = "";
        const btn = el("button", "primary", ATTEMPT_TEXT.retry);
        btn.type = "button";
        btn.addEventListener("click", () => camera());
        wrap.append(logoRow("부위 가이드로 돌아가기", () => {
          ctx.log.log({ name: "button", button: "back:partguide" });
          ctx.go("partguide");
        }), el("p", "cam-gate", ATTEMPT_TEXT.cameraFail), btn);
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
        wrap.append(nudyLogo(), step, cam, line);

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
            const taken: Partial<Record<AttemptShotId, { cv: HTMLCanvasElement; lm: Pt[]; w: number; h: number }[]>> = {};
            let run: RunState = startAttemptRun(taken, performance.now());
            /** 셔터 뒤 묶음을 모으는 중 — 다 모으면 다음 장으로 */
            let burst: AttemptBurst | null = null, frames: { cv: HTMLCanvasElement; lm: Pt[]; w: number; h: number }[] = [];
            const finishShot = (now: number): void => {
              const shot = burst!.shot;
              taken[shot] = frames;
              burst = null; frames = [];
              shutterCue(false);
              ctx.log.log({ name: "button", button: `attempt_shot:${shot}` });
              run = startAttemptRun(taken, now);
              if (run.shot) { step.textContent = STEP_TEXT[run.shot]; return; }
              // 다 찍었다 — 카메라를 끄고 미리보기
              stop();
              step.textContent = "";
              line.textContent = ATTEMPT_TEXT.saving;
              // 줄이지 않는다 — 얼굴 점이 촬영 크기 기준이고, 줄이면 라이너 꼬리가 사라진다 (#328 · #240)
              void Promise.all(ATTEMPT_SHOTS.map(async (id) => {
                const list = await Promise.all(taken[id]!.map(async (t) => ({ blob: (await encodeForStore(t.cv, BARE_MAX_SIDE)).blob, lm: t.lm, w: t.w, h: t.h })));
                return [id, list] as const;
              })).then((pairs) => {
                if (alive) preview(Object.fromEntries(pairs) as AttemptShots);
              }, (e: unknown) => { if (alive) failed(e); });
            };
            line.textContent = "";
            // now = 공용 루프가 주는 늘어나기만 하는 시각 — 얼굴 찾기와 촬영 대기 시간이 같이 쓴다
            const frame = (now: number): void => {
              if (!on || !lmk || (!run.shot && !burst)) return;
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
              if (burst) {
                const b = attemptBurstStep(burst, ms, now);
                burst = b.state;
                if (b.take && lm) frames.push({ cv: grabFrame(video), lm, w: sw, h: sh });
                if (burst.done) finishShot(now);
                return;
              }
              const shot = run.shot;
              if (!shot) return;
              const r = runStep(run, ms, now);
              run = r.state;
              line.textContent = r.hint ?? r.gate?.text ?? "";
              line.classList.toggle("ready", !!r.gate?.ok);
              oval.classList.toggle("ready", !!r.gate?.ok);
              if (!r.take || !lm) return;
              // 셔터 — 이 장이 묶음의 첫 장. 눈 뜬 장은 이어서 몇 장 더 모은다 (찍혔다는 소리는 다 모은 뒤에)
              frames = [{ cv: grabFrame(video), lm, w: sw, h: sh }];
              burst = startAttemptBurst(shot, now);
              if (burst.done) finishShot(now);
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
        dropPreview();
      };
    },
  };
}
