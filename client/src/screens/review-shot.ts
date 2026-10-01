/**
 * 화면 6 들어올 때 "지금" 얼굴 정면 1장 (#79). 모듈 ⑥.
 *
 * 리뷰의 맨얼굴 ↔ 지금 비교 사진과 결과 카드에 쓰고, 이마 L* 로 조명 차 안내를 판단한다.
 * 찍는 규칙은 화면 1 정면 눈 뜸과 같다(① capture-run · flow.shotGate — 정면·눈 뜸·크기·선명·밝기·안정, 카메라 자리 잡기).
 * **맨얼굴 대비 밝기·색은 막지 않는다** — 조명이 달라졌으면 알려 줄 일이지 못 찍게 할 일이 아니다.
 * 카메라·그리기는 여기, 판정은 ① 의 core 를 그대로 쓴다.
 */

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { runStep, startRun, type RunState } from "@core/capture-run";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "@core/capture-measure";
import type { ShotMeasure } from "@core/flow";
import type { Logger } from "@core/log";
import type { Pt } from "@core/types";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { encodeForStore } from "./image-encode";
import { createLandmarker } from "./landmarker";

export interface ReviewShot {
  blob: Blob;
  foreheadL: number | null;
}

/** host 에 카메라를 띄우고 정면 1장이 찍히면 done. 돌려주는 함수로 끈다 (done 은 안 부른다) */
export function startReviewShot(host: HTMLElement, done: (r: ReviewShot | null) => void, log: Logger): () => void {
  let alive = true;
  let raf = 0;
  let stream: MediaStream | null = null;
  let lmk: FaceLandmarker | null = null;

  const cam = document.createElement("div");
  cam.className = "cam";
  const video = document.createElement("video");
  video.className = "cam-video";
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  const oval = document.createElement("div");
  oval.className = "cam-oval";
  cam.append(video, oval);
  const line = document.createElement("p");
  line.className = "cam-gate";
  line.textContent = "카메라를 켜고 있어요…";
  host.append(cam, line);

  const stop = (): void => {
    alive = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    lmk?.close();
    lmk = null;
  };

  void (async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!alive) { st.getTracks().forEach((t) => t.stop()); return; }
      stream = st;
      video.srcObject = st;
      await video.play();
      const m = await createLandmarker("VIDEO");
      if (!alive) { m.close(); return; }
      lmk = m;
      let run: RunState = startRun({}, performance.now());
      const frame = (): void => {
        if (!alive || !lmk) return;
        raf = requestAnimationFrame(frame);
        if (video.readyState < 2) return;
        const now = performance.now();
        const sw = video.videoWidth, sh = video.videoHeight;
        const res: FaceLandmarkerResult = lmk.detectForVideo(video, now);
        const raw = res.faceLandmarks[0];
        const ms: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
        let L: number | null = null;
        if (raw) {
          const lm: Pt[] = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
          const ang = yawFromLandmarks(lm);
          const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
          const lab = foreheadLabOf(video, lm, sw, sh)?.skin;   // 밝기 = 앞머리 뺀 이마 피부 (#212)
          if (lab) { ms.foreheadL = lab.L; L = lab.L; }
          Object.assign(ms, {
            yaw: -ang.yaw, pitch: ang.pitch, ...eyesClosed(lm, bs),
            faceRatio: faceRatioOf(lm, sw, sh), faceInset: faceInsetOf(lm, sw, sh), eyeWidthPx: eyeWidthPxOf(lm),
            sharpness: sharpnessOf(video, faceCropOf(lm, sw, sh)),
          });
        }
        const r = runStep(run, ms, now);
        run = r.state;
        line.textContent = r.gate?.text ?? "";
        line.classList.toggle("ready", !!r.gate?.ok);
        oval.classList.toggle("ready", !!r.gate?.ok);
        if (!r.take) return;
        const cv = grabFrame(video);
        stop();
        void encodeForStore(cv).then(
          (e) => done({ blob: e.blob, foreheadL: L }),
          () => done(null),
        );
      };
      line.textContent = "";
      raf = requestAnimationFrame(frame);
    } catch (e) {
      if (!alive) return;
      // 카메라 거부 등 — 사진 없이 리뷰를 보여 준다
      log.log({ name: "error", where: "review_shot", msg: e instanceof Error ? e.message : String(e) });
      stop();
      done(null);
    }
  })();

  return stop;
}
