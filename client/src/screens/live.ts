/**
 * 화면 4 — 실시간 테두리 (F-05·F-07, 정의서 3-6b·3-7·3-8). 모듈 ②.
 *
 * 라이브 프리뷰 위에 부위 테두리(선만)를 겹치고, 게이트 한 줄 + "확인받기" 버튼 하나.
 * 게이트를 통과하면 버튼이 켜지고, 누르면 다음 프레임부터 3~5장을 모아 세션에 두고 화면 5 로 간다.
 * 진행 판단은 core/live-run.ts (카메라 없이 테스트). 이 파일은 카메라·측정·그리기만.
 *
 * 카메라 여는 방식은 화면 1(capture.ts)과 같다: 1080p · 노출 고정 · 초광각 확대 · 화면 꺼짐 방지 · 홈 다녀오면 다시 켬.
 * 프레임 루프는 requestVideoFrameCallback (결정 A3 — 새 프레임에만 추론, 없으면 rAF).
 *
 * 아직 없는 것: 부위 확대·데드존·One-Euro(#23), 이벤트(#24), 표정 게이트(#27).
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { createLiveRun, type LiveFrame } from "@core/live-run";
import type { LookPart, LookPartId } from "@core/looks";
import type { Outline } from "@core/overlay";
import type { ScreenId } from "@core/screens";
import type { Baseline, CaptureBundle, PartId, Pt } from "@core/types";
import { faceCropOf } from "@core/capture-measure";
import { applyCameraLocks, applyUltraWideZoom, bindVisibility, requestWakeLock, type WakeLockSentinelLike } from "./camera-locks";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { createLandmarker } from "./landmarker";
import type { Screen, ScreenContext } from "./shell";

export interface LiveDeps {
  getPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  /** 촬영 때 잰 기준 이마 a*·b* (화면 1 정면 장). 복원 뒤에는 없다 → 색 조건 생략 */
  getBaseAb: () => { a: number; b: number } | null;
  /** 고른 룩의 parts — 라이너 두께 */
  getLookParts: () => Partial<Record<LookPartId, LookPart>>;
  /** 확인받기 묶음을 그 부위에 둔다 (화면 5 가 getCapture 로 읽는다) */
  setCapture: (part: PartId, bundle: CaptureBundle) => void;
  next: ScreenId;
}

export const LIVE_TEXT = {
  loading: "카메라를 준비하고 있어요…",
  cameraFail: "카메라를 열 수 없어요. 브라우저 설정에서 카메라를 허용해 주세요",
  noPart: "부위가 정해지지 않았어요",
  noBaseline: "맨얼굴 사진이 없어요. 처음 촬영부터 다시 해 주세요",
  toCapture: "촬영하러 가기",
  button: "확인받기",
  capturing: "찍고 있어요. 그대로 있어 주세요",
  failed: "움직여서 못 찍었어요. 다시 눌러 주세요",
} as const;

const GUIDE_COLOR = "#3FD1C4";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 테두리만 (면 채우기 없음, F-07). 좌표는 비디오 프레임 px — 캔버스를 비디오와 같은 크기·같은 거울로 겹친다 */
function drawOutline(cv: HTMLCanvasElement, o: Outline | null, w: number, h: number): void {
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, w, h);
  if (!o) return;
  g.strokeStyle = GUIDE_COLOR;
  g.lineWidth = Math.max(2, w / 400);
  g.setLineDash([g.lineWidth * 3, g.lineWidth * 2]);
  const path = (pts: readonly Pt[], close: boolean): void => {
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    if (close) g.closePath();
    g.stroke();
  };
  for (const p of o.polys) path(p, true);
  for (const l of o.lines) path(l, false);
}

export function liveScreen<S>(deps: LiveDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = el("div", "live");
      ctx.root.append(wrap);
      const part = deps.getPart();
      if (!part) {
        wrap.append(el("p", "muted", LIVE_TEXT.noPart));
        return;
      }
      const baseline = deps.getBaseline();
      if (!baseline || baseline.lm.length === 0) {
        wrap.append(el("p", "", LIVE_TEXT.noBaseline));
        const b = el("button", "primary", LIVE_TEXT.toCapture);
        b.type = "button";
        b.addEventListener("click", () => ctx.go("capture"));
        const row = el("div", "row");
        row.append(b);
        wrap.append(row);
        return;
      }

      const stage = el("div", "cam live-cam");
      const video = el("video", "cam-video");
      video.playsInline = true; video.muted = true; video.autoplay = true;
      const overlay = el("canvas", "cam-video live-overlay");
      stage.append(video, overlay);
      const line = el("p", "cam-gate", LIVE_TEXT.loading);
      const btn = el("button", "primary live-btn", LIVE_TEXT.button);
      btn.type = "button";
      btn.disabled = true;
      const row = el("div", "row");
      row.append(btn);
      wrap.append(stage, line, row);

      const baseAb = deps.getBaseAb();
      const run = createLiveRun<HTMLCanvasElement>({
        partId: part,
        baseline: { lm: baseline.lm, foreheadL: baseline.foreheadL },
        ...(baseAb ? { baseAb } : {}),
        lookParts: deps.getLookParts(),
      });

      let alive = true;
      let lmk: FaceLandmarker | null = null;
      let stream: MediaStream | null = null;
      let wake: WakeLockSentinelLike | null = null;
      let raf = 0;
      let vfc = 0;
      let collecting = false;
      let lastT = -1;

      btn.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "live_check" });
        if (!run.press()) return;
        collecting = true;
        btn.disabled = true;
        line.textContent = LIVE_TEXT.capturing;
      });

      const stopCamera = (): void => {
        cancelAnimationFrame(raf);
        raf = 0;
        if (vfc && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(vfc);
        vfc = 0;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        void wake?.release().catch(() => {});
        wake = null;
      };

      const schedule = (): void => {
        if (!alive) return;
        if ("requestVideoFrameCallback" in video) vfc = video.requestVideoFrameCallback(() => frame());
        else raf = requestAnimationFrame(() => frame());
      };

      function frame(): void {
        if (!alive || !lmk || !stream) return;
        schedule();
        if (video.readyState < 2) return;
        // detectForVideo 는 시각이 늘어나야 한다
        const now = Math.max(performance.now(), lastT + 1);
        lastT = now;
        const sw = video.videoWidth, sh = video.videoHeight;
        const raw = lmk.detectForVideo(video, now).faceLandmarks[0];
        const lm = raw ? raw.map((p) => ({ x: p.x * sw, y: p.y * sh })) : null;
        const f: LiveFrame<HTMLCanvasElement> = { t: now, lm, w: sw, h: sh, image: () => grabFrame(video) };
        if (lm) {
          f.sharpness = sharpnessOf(video, faceCropOf(lm, sw, sh));
          const lab = foreheadLabOf(video, lm, sw, sh);
          if (lab) f.lab = lab;
        }
        const r = run.step(f);
        drawOutline(overlay, r.outline, sw, sh);

        if (r.bundle?.status === "done") {
          const b = r.bundle.bundle;
          alive = false;
          stopCamera();
          void Promise.all(b.frames.map((cv) => createImageBitmap(cv)))
            .then((frames) => {
              deps.setCapture(part!, { ...b, frames });
              ctx.go(deps.next);
            })
            .catch((e: unknown) => {
              ctx.log.log({ name: "error", where: "live", msg: `bitmap:${String(e).slice(0, 120)}` });
              line.textContent = LIVE_TEXT.failed;
            });
          return;
        }
        if (r.bundle?.status === "failed") {
          collecting = false;
          line.textContent = LIVE_TEXT.failed;
          line.classList.remove("ready");
          btn.disabled = true;
          return;
        }
        if (collecting) return;
        // 실패 문구는 다시 통과할 때까지 그대로 둔다 — 게이트 문구가 바로 덮으면 왜 안 찍혔는지 못 본다
        if (line.textContent === LIVE_TEXT.failed && !r.gate.ok) return;
        line.textContent = r.gate.text;
        line.classList.toggle("ready", r.gate.ok);
        btn.disabled = !r.gate.ok;
      }

      async function start(): Promise<void> {
        const m = await createLandmarker("VIDEO");
        if (!alive) { m.close(); return; }
        lmk = m;
        // 1080p: 720p 에서는 iPhone 초광각 얼굴이 작다 (화면 1 과 같은 이유, 1-2 실측)
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        if (track) {
          // 자동 노출이 자리 잡은 뒤 잠근다 (1-3·1-8)
          await new Promise((r) => setTimeout(r, 1500));
          await applyCameraLocks(track as unknown as Parameters<typeof applyCameraLocks>[0]);
          await applyUltraWideZoom(track as unknown as Parameters<typeof applyUltraWideZoom>[0]);
        }
        wake = await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
        if (!alive) { void wake?.release().catch(() => {}); return; }
        schedule();
      }

      start().catch((e: unknown) => {
        line.textContent = LIVE_TEXT.cameraFail;
        ctx.log.log({ name: "error", where: "live", msg: `camera:${String(e).slice(0, 120)}` });
      });

      // 홈으로 나갔다 오면 카메라가 꺼져 있다 → 화면을 다시 그려 새로 켠다 (게이트는 처음부터)
      const unbind = bindVisibility(document, {
        onHidden: () => stopCamera(),
        onVisible: () => { if (alive) ctx.go("live"); },
      });

      return () => {
        alive = false;
        unbind();
        stopCamera();
        lmk?.close();
        lmk = null;
      };
    },
  };
}
