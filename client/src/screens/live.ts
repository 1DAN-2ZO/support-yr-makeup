/**
 * 화면 4 — 실시간 테두리 (F-05·F-07, 정의서 3-6b·3-7·3-8). 모듈 ②.
 *
 * 라이브 프리뷰 위에 부위 테두리(선만)를 겹치고, 게이트 한 줄 + "확인받기" 버튼 하나.
 * 게이트를 통과하면(또는 각도·안정에 3초 넘게 막히면, #235) 버튼이 켜지고, 누르면 다음 프레임부터 3~5장을 모아 세션에 두고 화면 5 로 간다.
 * 진행 판단은 core/live-run.ts (카메라 없이 테스트). 이 파일은 카메라·측정·그리기만.
 *
 * 카메라 여는 방식은 화면 1(capture.ts)과 같다: 1080p · 잠금 안 함(켤 때·끌 때 남은 잠금 풀기, #267) · 초광각 확대 · 화면 꺼짐 방지 · 홈 다녀오면 다시 켬.
 * 프레임 루프는 공용 camera-loop (#245, 결정 A3 — 새 프레임에만 추론, 없으면 rAF).
 *
 * 떨림 1차(#23): 영상 전체가 아니라 **부위 확대 창**(crop.cropSpec)만 캔버스에 그린다 (정의서 3-3).
 *  - 창은 core/crop-follow — 얼굴 폭 3% 데드존 + 0.2~0.3초 미끄러짐, 크기는 거리가 20% 넘게 변할 때만
 *  - 테두리 선은 live-run 의 One-Euro(④ smoothing.ts). 채점 묶음에는 원래 점
 *  - 개발용: 주소에 `?jitter` 를 붙이면 화면 구석에 화면 흔들림·선 떨림(프레임당 px)이 뜬다(탭하면 0부터).
 *    `?jitter&stab=0` 이면 데드존·One-Euro 를 끈 채로 잰다 → 적용 전후 비교
 *  - 개발용 `?gate`: 게이트가 본 값을 숫자로 — 선명 값/기준 · 최근 3초 최소·중앙 · 막힌 조건 · 안정 수 · 밝기·각도·표정 (core/gate-readout)
 *  - 개발용 `?pose` (#28): 입을 벌릴 때 기준 각도 차가 흔들리는 원인 가르기 — screens/pose-probe.ts
 *
 * 이벤트(#24): gate_fail · landmark_lost 는 core/live-events (화면 1 과 같은 규칙). screen_enter/leave 는 껍데기가 찍는다.
 *
 * 표정 게이트(#27): 지금 블렌드셰이프를 맨얼굴 때 값(getBaseExpr)과 비교. 맨얼굴 값이 오기 전(① #177)엔 건너뛴다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { BundleOf } from "@core/capture-bundle";
import { ROLL_MAX, cropSpec, faceRoll, type Rect } from "@core/crop";
import { clampRect, createCropFollow, jitterMeter } from "@core/crop-follow";
import { lookGuide } from "@core/guides";
import { LM } from "@core/landmarks";
import { createLiveEvents } from "@core/live-events";
import { LIVE_LIMITS } from "@core/gate";
import { gateReadout, recentStats } from "@core/gate-readout";
import { createLiveRun, type LiveFrame } from "@core/live-run";
import { LIVE_SMOOTH } from "@core/smooth-params";
import type { Logger } from "@core/log";
import type { LookPart, LookPartId } from "@core/looks";
import type { GuideSource } from "@core/score-part";
import type { Outline } from "@core/overlay";
import { wantedOrientation, type ScreenId } from "@core/screens";
import type { Baseline, CaptureBundle, PartId, Pt } from "@core/types";
import { faceCropOf } from "@core/capture-measure";
import { DEFAULT_LOCKS, applyCameraLocks, applyUltraWideZoom, bindVisibility, releaseCameraLocks, requestWakeLock, type WakeLockSentinelLike } from "./camera-locks";
import { bareDepth } from "./bare-depth";
import { startFrameLoop } from "./camera-loop";
import { smoothTuner } from "./smooth-tune";
import { foreheadLabOf, grabFrame, sharpnessOf } from "./frame-measure";
import { createLandmarker } from "./landmarker";
import { strokeOutline } from "./outline-draw";
import { createPoseProbe } from "./pose-probe";
import type { Screen, ScreenContext } from "./shell";

export interface LiveDeps {
  getPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  /** 촬영 때 잰 기준 이마 a*·b* (화면 1 정면 장). 복원 뒤에는 없다 → 색 조건 생략 */
  getBaseAb: () => { a: number; b: number } | null;
  /** 고른 룩의 parts — getGuide 가 없을 때 기본 가이드(lookGuide)용 */
  getLookParts: () => Partial<Record<LookPartId, LookPart>>;
  /** 맨얼굴 정면 때 표정 (① Baseline.expression, #177). 없으면 표정 조건을 건너뛴다 */
  getBaseExpr?: () => Readonly<Record<string, number>> | null;
  /** 테두리 모양 — 채점(화면 5)과 같은 것을 넘긴다. 없으면 lookGuide(getLookParts()). ⑥ 개인화 계획이 여기 꽂힌다 (#167 리뷰) */
  getGuide?: () => GuideSource;
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** 창(영상 px) → 캔버스 px. 창이 영상 끝에 걸려 비율이 깨졌으면 여백을 둔다(contain) */
interface ViewMap { s: number; ox: number; oy: number; crop: Rect }

/** [개발용 ?dots] MediaPipe 가 준 눈꺼풀 점 그대로 (필터 전) — 테두리가 틀어질 때 점이 틀어졌는지, 옮기기가 틀어졌는지 가른다 */
const EYE_DOTS: readonly number[] = [...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeB.upper, ...LM.eyeB.lower];

/** 확대 창만 거울로 그리고 그 위에 테두리 (선만, F-07) */
function drawView(cv: HTMLCanvasElement, video: HTMLVideoElement, crop: Rect, o: Outline | null, dots: readonly Pt[] | null = null): ViewMap | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(cv.clientWidth * dpr), H = Math.round(cv.clientHeight * dpr);
  if (!W || !H) return null;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext("2d");
  if (!g) return null;
  const s = Math.min(W / crop.w, H / crop.h), ox = (W - crop.w * s) / 2, oy = (H - crop.h * s) / 2;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W, 0);
  g.scale(-1, 1);
  g.translate(ox, oy);
  g.scale(s, s);
  g.translate(-crop.x, -crop.y);
  g.drawImage(video, crop.x, crop.y, crop.w, crop.h, crop.x, crop.y, crop.w, crop.h);
  if (o) strokeOutline(g, o, Math.max(2, W / 400) / s);
  if (dots) {
    g.fillStyle = "#ffb000";
    const r = Math.max(2, W / 350) / s;
    for (const p of dots) { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  return { s, ox, oy, crop };
}

/**
 * 확인받기 묶음 → 비트맵 → 세션 → 화면 5. 카메라 없이 테스트한다 (#167 리뷰).
 *  - 바꾸는 사이 화면을 떠났으면(mounted false) 아무것도 안 한다 — 결과로 끌려가지 않게
 *  - 바꾸다 실패하면(iOS 메모리 등) 화면 4 를 다시 연다 — 카메라·루프가 이미 꺼져 멈춰 있지 않게
 */
export async function deliverBundle<I>(b: BundleOf<I>, o: {
  part: PartId;
  toBitmap: (i: I) => Promise<ImageBitmap>;
  mounted: () => boolean;
  setCapture: LiveDeps["setCapture"];
  go: (to: ScreenId) => void;
  next: ScreenId;
  log: Logger;
}): Promise<"delivered" | "left" | "failed"> {
  let frames: ImageBitmap[];
  try {
    frames = await Promise.all(b.frames.map((f) => o.toBitmap(f)));
  } catch (e) {
    if (!o.mounted()) return "left";
    o.log.log({ name: "error", where: "live", msg: `bitmap:${String(e).slice(0, 120)}` });
    o.go("live");
    return "failed";
  }
  if (!o.mounted()) {
    for (const f of frames) f.close?.();
    return "left";
  }
  o.setCapture(o.part, { ...b, frames });
  o.go(o.next);
  return "delivered";
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
      // 영상은 숨겨 두고(재생은 계속) 확대 창만 캔버스에 그린다
      const video = el("video", "live-src");
      video.playsInline = true; video.muted = true; video.autoplay = true;
      const view = el("canvas", "live-view");
      stage.append(video, view);
      // 개발용 떨림 재기 (#23 "적용 전후 30초 비교")
      const q = new URLSearchParams(window.location.search);
      const stab = q.get("stab") !== "0";
      // 화면 흔들림 = 사진(확대 창) 자체가 튀는 것, 선 떨림 = 테두리가 얼굴 위에서 튀는 것. 둘 다 프레임당 px(캔버스)
      const meter = q.has("jitter") ? { view: jitterMeter(), line: jitterMeter() } : null;
      const readout = el("p", "live-jitter");
      // #28 보정: [옛 각도 차, k=1 강체 각도 차] 짝 (입 다물었을 때) · 입 벌렸을 때 최대
      const poseCal = q.has("pose") ? createPoseProbe() : null;
      // 개발용 ?gate: 게이트가 본 값(선명 · 막힌 조건 · 안정 수 · 각도 · 표정 …) — 폰 시험에서 왜 안 넘어가는지 숫자로 (2026-09-30)
      const gateDbg = q.has("gate") ? recentStats(90) : null;
      const dots = q.has("dots");
      if (meter || poseCal || gateDbg) {
        stage.append(readout);
        readout.addEventListener("click", () => {
          meter?.view.reset(); meter?.line.reset();
          poseCal?.reset();
        });
      }
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
        baseExpr: deps.getBaseExpr?.() ?? null,
        guide: deps.getGuide?.() ?? lookGuide(deps.getLookParts()),
        smooth: stab,
      });
      // 개발용 ?tune: 테두리 떨림 필터 값을 폰에서 맞춘다 — 2-b 와 같은 슬라이더 (#235 · #244)
      if (run.smoother && q.has("tune")) wrap.append(smoothTuner(run.smoother, LIVE_SMOOTH));
      const events = createLiveEvents(ctx.log);
      let follow: ReturnType<typeof createCropFollow> | null = null;
      let followAspect = 0;
      let crop: Rect | null = null;
      let lostSince: number | null = null;
      /** 지난 프레임 테두리 점 — 창을 새로 잡을 때 표준 눈썹 꼬리처럼 얼굴 점 밖으로 나간 선까지 담게 */
      let lastShape: Pt[] = [];

      let alive = true;
      // 정리 함수가 세운다. alive 는 묶음을 넘길 때도 false 가 되므로 "화면을 떠났나" 는 이것으로 본다
      let unmounted = false;
      let lmk: FaceLandmarker | null = null;
      let stream: MediaStream | null = null;
      let wake: WakeLockSentinelLike | null = null;
      let stopLoop = (): void => {};
      let collecting = false;

      btn.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "live_check" });
        if (!run.press()) return;
        collecting = true;
        btn.disabled = true;
        line.textContent = LIVE_TEXT.capturing;
      });

      const stopCamera = (): void => {
        stopLoop();
        // 잠금을 풀고 끈다 — PC 웹캠은 잠금을 기기에 저장해서 다음에 열 때 남는다 (#267)
        for (const t of stream?.getTracks() ?? []) void releaseCameraLocks(t as unknown as Parameters<typeof releaseCameraLocks>[0]).finally(() => t.stop());
        stream = null;
        void wake?.release().catch(() => {});
        wake = null;
      };

      function frame(now: number): void {
        if (!alive || !lmk || !stream) return;
        if (video.readyState < 2) return;
        const sw = video.videoWidth, sh = video.videoHeight;
        const res = lmk.detectForVideo(video, now);
        const raw = res.faceLandmarks[0];
        // 깊이(z)도 같이 — 고개를 많이 돌렸을 때 먼 쪽 눈 테두리를 입체로 옮긴다 (head3d). x 와 같은 눈금(영상 폭)
        const lm = raw ? raw.map((p) => ({ x: p.x * sw, y: p.y * sh, z: p.z * sw })) : null;
        // 확대 창: 칸 비율이 바뀌면(방향 전환) 새로 잡는다. 얼굴을 3초 넘게 잃으면 옛 자리에서 미끄러져 오지 않게 새로 (3-9 자리 비움)
        const aspect = view.clientWidth && view.clientHeight ? view.clientWidth / view.clientHeight : 3 / 4;
        if (!follow || Math.abs(aspect - followAspect) > 0.01) { follow = createCropFollow(part!, aspect); followAspect = aspect; }
        const screen = window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
        if (lm && (faceRoll(lm) > ROLL_MAX || screen !== wantedOrientation(part!))) {
          // 얼굴이 누웠거나(자동 회전 꺼짐, #204) 부위에 맞지 않는 방향으로 들고 있다(눈 부위 가로 · 나머지 세로 — 팀 협의) — 확대하지 않고 전체를 보여 준다.
          // 게이트가 "자동 회전을 켜" / "가로로 돌려" / "세로로 돌려" 로 막는다
          crop = null;
          follow.reset();
        } else if (lm) {
          lostSince = null;
          crop = clampRect(stab ? follow.step(lm, now, lastShape) : cropSpec(part!, lm, aspect, lastShape), sw, sh);
        } else {
          lostSince ??= now;
          if (now - lostSince > 3000) follow.reset();
        }
        const shown = crop ?? { x: 0, y: 0, w: sw, h: sh };
        // 부위 가시성은 사용자에게 보이는 창 안에서 본다
        const f: LiveFrame<HTMLCanvasElement> = { t: now, lm, w: sw, h: sh, screen, image: () => grabFrame(video), view: shown };
        if (lm) {
          const bs = res.faceBlendshapes[0]?.categories;
          if (bs?.length) f.expr = Object.fromEntries(bs.map((c) => [c.categoryName, c.score]));
          f.sharpness = sharpnessOf(video, faceCropOf(lm, sw, sh));
          const fr = foreheadLabOf(video, lm, sw, sh);
          if (fr?.skin) f.lab = fr.skin;
          if (fr?.raw) f.rawLab = fr.raw;
        }
        const r = run.step(f);
        lastShape = r.outline ? [...r.outline.polys.flat(), ...r.outline.lines.flat()] : lastShape;
        if (gateDbg && r.measure) {
          if (typeof r.measure.sharpness === "number") gateDbg.push(r.measure.sharpness);
          readout.style.whiteSpace = "pre";
          readout.textContent = gateReadout(r.measure, r.gate, LIVE_LIMITS, gateDbg.stats());
        }
        if (poseCal && lm) {
          readout.style.whiteSpace = "pre";
          readout.textContent = poseCal.step(lm, res.facialTransformationMatrixes?.[0]?.data ?? null, f.expr?.["jawOpen"] ?? 0);
        }
        const vm = drawView(view, video, shown, r.outline, dots && lm ? EYE_DOTS.map((i) => lm[i]!) : null);
        if (meter && vm && r.outline) {
          // 화면 흔들림: 영상의 고정된 한 점(가운데)이 캔버스에서 어디 찍히나 — 창이 움직이면 사진 전체가 튄다
          meter.view.push([{ x: (sw / 2 - vm.crop.x) * vm.s + vm.ox, y: (sh / 2 - vm.crop.y) * vm.s + vm.oy }]);
          // 선 떨림: 테두리를 창과 상관없이(확대 배율만) — 얼굴 위에서 선이 튀는 것
          meter.line.push([...r.outline.polys.flat(), ...r.outline.lines.flat()].map((p) => ({ x: p.x * vm.s, y: p.y * vm.s })));
          readout.textContent = `화면 흔들림 ${meter.view.perFrame().toFixed(2)}px · 선 떨림 ${meter.line.perFrame().toFixed(2)}px (프레임당) · ${meter.view.count()}프레임 · 보정 ${stab ? "켬" : "끔"}`;
        }

        if (r.bundle?.status === "done") {
          alive = false;
          stopCamera();
          void deliverBundle(r.bundle.bundle, {
            part: part!, toBitmap: (cv) => createImageBitmap(cv), mounted: () => !unmounted,
            setCapture: deps.setCapture, go: ctx.go, next: deps.next, log: ctx.log,
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
        // 묶음을 모으는 동안은 세지 않는다 — 얼굴 놓침도 막힘도 (#170 리뷰)
        events.face(!!lm, now);
        events.gate(r.gate.ok ? null : r.gate.firstFail, now);
        // 실패 문구는 다시 누를 수 있을 때까지 그대로 둔다 — 게이트 문구가 바로 덮으면 왜 안 찍혔는지 못 본다
        if (line.textContent === LIVE_TEXT.failed && !r.pressable) return;
        line.textContent = r.gate.text;
        line.classList.toggle("ready", r.gate.ok);
        // 각도·안정에 3초 넘게 막히면 문구는 안내 그대로 두고 버튼만 켠다 — 판단은 채점에 (#235)
        btn.disabled = !r.pressable;
      }

      async function start(): Promise<void> {
        const m = await createLandmarker("VIDEO");
        if (!alive) { m.close(); return; }
        lmk = m;
        // 1080p: 720p 에서는 iPhone 초광각 얼굴이 작다 (화면 1 과 같은 이유, 1-2 실측)
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!alive) { st.getTracks().forEach((t) => t.stop()); return; }
        stream = st;
        video.srcObject = st;
        await video.play();
        // play 중에 떠나거나 숨으면 stopCamera 가 stream 을 비운다 — 오류가 아니라 그냥 멈춘다 (#167 리뷰)
        if (!alive || stream !== st) return;
        const track = st.getVideoTracks()[0];
        if (track) {
          const tl = track as unknown as Parameters<typeof applyCameraLocks>[0];
          // 앞 세션·다른 화면이 남긴 잠금부터 푼다 (#267: PC 웹캠이 하얗게·파랗게 고정된 채 남음)
          await releaseCameraLocks(tl);
          // 잠금은 촬영과 같은 기본(DEFAULT_LOCKS — 지금은 아무것도 안 잠금, #268). 잠글 게 있을 때만 자동이 자리 잡을 1.5초를 기다린다
          if (DEFAULT_LOCKS.length) {
            await new Promise((r) => setTimeout(r, 1500));
            await applyCameraLocks(tl, DEFAULT_LOCKS);
          }
          await applyUltraWideZoom(track as unknown as Parameters<typeof applyUltraWideZoom>[0]);
        }
        wake = await requestWakeLock(navigator.wakeLock as unknown as Parameters<typeof requestWakeLock>[0]);
        // 기다리는 사이 떠나거나 숨었으면(stopCamera) 루프를 켜지 않는다
        if (!alive || stream !== st) { void wake?.release().catch(() => {}); return; }
        stopLoop = startFrameLoop(video, frame);
        // 눈 부위: 맨얼굴 사진의 깊이를 한 번 재서 넘긴다 — 오기 전까지는 지금처럼 눈꺼풀 점만 (B안 2026-10-02)
        if (wantedOrientation(part!) === "landscape") {
          void bareDepth(baseline!).then((z) => { if (z && alive) run.setBaseDepth(z); }).catch(() => {});
        }
      }

      start().catch((e: unknown) => {
        if (!alive) return;
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
        unmounted = true;
        unbind();
        stopCamera();
        lmk?.close();
        lmk = null;
      };
    },
  };
}
