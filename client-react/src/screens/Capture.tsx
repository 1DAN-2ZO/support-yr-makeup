/**
 * 화면 — 맨얼굴 자동 촬영. 본 앱 `client/src/screens/capture.ts` (452줄) 를 React 로 옮긴 것이다.
 *
 * 흐름: 카메라 → 단계 안내 + 조건 한 줄 → 조건이 안정되면 **저절로** 찍힘 → 확인(썸네일·다시 찍기) → 넘기기.
 * 지금 찍는 장은 **정면 눈 뜸 한 장**이다 — 눈 감은 장은 본 앱이 2026-10-09 에 뺐다 (#386).
 * 몇 장을 찍는지는 코드에 안 박고 `core/flow` 의 `SHOTS` 를 보고 따라간다.
 *
 * 판정은 하나도 새로 짜지 않았다. `core/capture-run` · `core/capture-measure` · `core/flow` ·
 * `core/occlusion` 을 그대로 부른다 — 그쪽에 시험이 붙어 있고, 여기서 규칙을 다시 쓰면 둘이 갈라진다.
 *
 * **찍는 중 안내는 영상 위 스티커 말풍선 하나로 한다** (2026-10-14).
 * 처음에는 본 앱이 숨겨 둔 단계 안내(.cam-step)와 조건 한 줄(.cam-gate)을 되살려 띄웠는데
 * (#344 의 2번), 폰에서 보니 스티커가 말해 주는 아래에 같은 자리 글이 또 나와 겹쳐 읽혔다.
 * 그래서 둘 다 **눈에는 안 보이게** 하고 화면 읽어 주는 기능에만 남겼다 —
 * 지우지는 않는다. 찍는 장이 늘면 단계 안내가 다시 필요하다.
 *
 * React 로 옮기며 조심한 곳:
 *  - 매 프레임 바뀌는 것(run · 이마 추적 · 연속 사진)은 **ref** 에 둔다. 상태로 두면 그릴 때마다
 *    프레임 콜백이 새로 만들어져 루프가 처음부터 다시 돈다.
 *  - 화면에 보이는 글(조건 한 줄 · 힌트)만 상태로 둔다. 같은 값을 다시 넣으면 React 가 그냥 넘기니
 *    프레임마다 불러도 다시 그리지 않는다.
 *  - 찍은 장은 **ref 가 진짜고 상태는 사본**이다. 찍은 바로 다음 프레임이 "다 찍었나" 를 물어보는데,
 *    상태는 늦게 들어와서 같은 장을 두 번 찍게 된다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { cameraFailKind, cameraFailText } from "../core/camera-fail";
import { createCaptureEvents, type CaptureEvents } from "../core/capture-events";
import { STEP_TEXT, runStep, startRun, type RunState } from "../core/capture-run";
import { buildBaseline, retakeFront } from "../core/baseline";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "../core/capture-measure";
import { SHOTS, burstShot, burstStep, nextShot, shotGate, startBurst, type BurstState, type ShotId, type ShotMeasure } from "../core/flow";
import { foreheadStep, startForeheadTrack, type ForeheadTrack } from "../core/occlusion";
import { createLogger, type Logger } from "../core/log";
import type { Lab } from "../core/color";
import type { Baseline, FaceShape, Pt } from "../core/types";
import { bindVisibility } from "../lib/camera-locks";
import { foreheadLabOf, grabFrame, sharpnessOf } from "../lib/frame-measure";
import { BARE_MAX_SIDE, encodeForStore } from "../lib/image-encode";
import { smoothSkinCanvas } from "../lib/skin-canvas";
import { shutterCue } from "../lib/shutter-cue";
import { useCamera, lockModeFromSearch } from "../hooks/useCamera";
import { useFrameLoop } from "../hooks/useFrameLoop";
import { useLandmarker } from "../hooks/useLandmarker";
import "../camera.css";

/** 세션에 두는 한 장. 사진·랜드마크는 메모리에만 */
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

/** ⑤ 얼굴형 분류가 오기 전 자리값 — 쉐딩·하이라이트 멘트는 confidence 0 이면 안 쓴다 */
export const PENDING_FACE_SHAPE: FaceShape = { label: "oval", confidence: 0, method: "rule", version: "faceshape-pending" };

export const CAPTURE_TEXT = {
  loading: "카메라를 준비하고 있어요…",
  /** 카메라를 못 열었을 때 누르는 버튼 — 안내 문장은 까닭마다 다르다 (core/camera-fail) */
  cameraRetry: "다시 시도",
  title: "사진 촬영",
  doneTitle: "사진 확인",
  doneSub: "찍힌 사진을 확인해 주세요",
  doneCoach: "이상한 사진이 있으면 그 사진만 다시 찍을 수 있어요",
  retake: "다시 찍기",
  go: "화장 고르러 가기",
  /** 얼굴을 못 찾았을 때 말풍선에 남겨 두는 말 — 빈 칸이면 왜 안 찍히는지 알 수 없다 */
  aim: "얼굴을 맞춰 주세요",
} as const;

export interface CaptureProps {
  /**
   * 다 찍고 "화장 고르러 가기" 를 눌렀을 때. 기준(Baseline)과 얼굴형 판단용 정면 연속 사진을 넘긴다.
   * `baseline.bareImage` 는 저장(인코딩)이 끝난 뒤에 채워진다 — 누르는 순간엔 아직 null 일 수 있다.
   */
  onDone: (baseline: Baseline, faceShapeFrames: HTMLCanvasElement[]) => void;
  /** 한 칸 뒤로(동의 화면). 안 주면 버튼을 안 그린다 */
  onBack?: () => void;
  /** 공통 로그(core/log). 안 주면 콘솔로 나가는 것을 혼자 만든다 */
  logger?: Logger;
  /** 촬영 이벤트(core/capture-events). 안 주면 logger 로 혼자 만든다 */
  events?: CaptureEvents;
  /**
   * 쌩얼 사진 저장 (본 앱 session-store "bare"). **인코딩이 끝나기 전에 약속(Promise)으로 넘긴다** —
   * 끝내기가 저장까지 기다릴 수 있게. 안 주면 폰에 저장하지 않고 메모리에만 둔다
   */
  saveBare?: (blob: Promise<Blob>) => Promise<void>;
}

function thumb(cv: HTMLCanvasElement | null, w = 160): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "shot-thumb";
  if (!cv) { c.width = w; c.height = Math.round((w * 4) / 3); return c; }
  c.width = w;
  c.height = Math.round((w * cv.height) / cv.width);
  const g = c.getContext("2d");
  // 미리보기가 거울이라 썸네일도 좌우를 뒤집어 보여 준다 — 안 뒤집으면 방금 본 얼굴과 반대로 보인다
  if (g) { g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(cv, 0, 0, c.width, c.height); }
  return c;
}

/** 캔버스는 React 가 만드는 물건이 아니다 — 만든 것을 자리에 넣어 준다 */
function Thumb({ cv }: { cv: HTMLCanvasElement | null }) {
  const slot = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const host = slot.current;
    if (!host) return;
    const c = thumb(cv);
    host.append(c);
    return () => c.remove();
  }, [cv]);
  return <span className="shot-thumb-slot" ref={slot} />;
}

export default function Capture({ onDone, onBack, logger, events, saveBare }: CaptureProps) {
  // ---------- 찍은 장 · 기준: ref 가 진짜, 상태는 그리기용 사본 ----------
  const shotRef = useRef<ShotData | null>(null);
  const [shotUi, setShotUi] = useState<ShotData | null>(null);
  const baseRef = useRef<Baseline | null>(null);
  const framesRef = useRef<HTMLCanvasElement[]>([]);

  // ---------- 화면에 보이는 글 ----------
  const [step, setStep] = useState("");
  // 글자 하나로 굳지 않게 string 으로 적어 둔다 (CAPTURE_TEXT 가 as const 라서)
  const [gate, setGate] = useState<string>(CAPTURE_TEXT.loading);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  // 탭이 숨으면(홈으로 나감) 카메라를 끄고, 돌아오면 다시 켠다 (본 앱 bindVisibility)
  const [visible, setVisible] = useState(true);
  // 다 찍었으면 확인 화면 — 찍은 장이 SHOTS 를 다 채웠나로 가른다 (장수를 코드에 안 박는다)
  const done = shotUi !== null && nextShot({ front_open: shotUi }) === null;

  const video = useRef<HTMLVideoElement | null>(null);
  // 로그·이벤트는 안 받았으면 한 번만 만든다. 그릴 때마다 새로 만들면 재촬영 횟수가 초기화된다
  const log = useMemo(() => logger ?? createLogger({ sid: "capture-react", screen: "capture", part: null, ver: { app: "dev", score: "dev", look: "dev", faceshape: "dev", transfer: "dev" } }), [logger]);
  const ev = useMemo(() => events ?? createCaptureEvents(log), [events, log]);

  // 잠금은 비교용 주소 꼬리(?lock=all|wb|wbfocus)만 본다 — 기본은 아무것도 잠그지 않는다 (#267)
  const lockMode = useMemo(() => lockModeFromSearch(location.search), []);
  const camera = useCamera({ on: visible && !done, lockMode });
  const model = useLandmarker("VIDEO");

  // 스트림을 미리보기에 붙인다. 떠날 때 떼어 주지 않으면 video 가 끝난 트랙을 들고 있어
  // 마지막 장면이 그대로 얼어붙은 채 남는다 (카메라는 꺼졌는데 화면만 켜진 것처럼 보인다)
  useEffect(() => {
    const el = video.current;
    if (!el || !camera.stream) return;
    el.srcObject = camera.stream;
    // play() 는 자동재생 정책에 걸려 거부될 수 있다 — 거부돼도 스트림은 살아 있으니 흐름을 막지 않는다
    void el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [camera.stream]);

  // ---------- 매 프레임 바뀌는 것 (상태로 두면 루프가 다시 돈다) ----------
  const runRef = useRef<RunState>(startRun({}, 0));
  const fjRef = useRef<ForeheadTrack>(startForeheadTrack());
  const lostRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const burstRef = useRef<BurstState | null>(null);
  const burstFramesRef = useRef<HTMLCanvasElement[]>([]);
  const burstWaitRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loopOn = !!camera.stream && model.ready && !done;

  /** 단계 안내 — 장이 여럿일 때만 "1/2 · " 처럼 번호를 붙인다 (지금은 한 장이라 안내 문장만) */
  const showStep = useCallback((run: RunState): void => {
    if (!run.shot) { setStep(""); return; }
    const order = SHOTS.length > 1 ? `${SHOTS.findIndex((s) => s.id === run.shot) + 1}/${SHOTS.length} · ` : "";
    setStep(`${order}${STEP_TEXT[run.shot]}`);
  }, []);

  // 카메라·모델이 준비되면 그 장을 처음부터 — 본 앱 start() 의 마지막 줄과 같은 자리다
  useEffect(() => {
    if (!loopOn) return;
    runRef.current = startRun(shotRef.current ? { front_open: shotRef.current } : {}, performance.now());
    fjRef.current = startForeheadTrack();
    busyRef.current = false;
    // 얼굴형 프레임은 정면 눈 뜸을 아직 안 찍었을 때만 모은다 (F-02, FACE_SHAPE_BURST)
    burstRef.current = shotRef.current ? null : startBurst();
    burstFramesRef.current = [];
    burstWaitRef.current = false;
    showStep(runRef.current);
    setGate(CAPTURE_TEXT.loading);
    setReady(false);
    setHint(null);
  }, [loopOn, showStep]);

  /** 한 장을 끝낸 뒤 다음 장으로. 다 찍었으면 확인 화면이 뜬다(done 이 참이 되어 카메라가 꺼진다) */
  const nextStep = useCallback((): void => {
    runRef.current = startRun(shotRef.current ? { front_open: shotRef.current } : {}, performance.now());
    fjRef.current = startForeheadTrack();
    showStep(runRef.current);
  }, [showStep]);

  /** 정면 눈 뜸: 기준 만들기(다시 찍었으면 나머지 장 재정렬) + 쌩얼 저장 */
  const setFront = useCallback((d: ShotData): void => {
    // 피부 정돈 — 저장 · 기준 만들기 · 정답사진 모두 정돈된 맨얼굴로 (core/skin-smooth)
    smoothSkinCanvas(d.cv, d.lm, d);
    const g = d.cv.getContext("2d");
    const image = g ? g.getImageData(0, 0, d.cv.width, d.cv.height) : undefined;
    const input = { lm: d.lm, w: d.w, h: d.h, faceShape: PENDING_FACE_SHAPE, expression: d.expr, ...(image ? { image: { data: image.data, w: image.width, h: image.height } } : {}) };
    const prev = baseRef.current;
    // 다시 찍었으면 기준을 다시 만들고 나머지 장의 랜드마크를 새 기준에 맞춘다 (본 앱 1-11).
    // 지금은 장이 하나라 others 가 늘 비는데, 장이 늘면 여기만 채우면 된다
    baseRef.current = prev && prev.lm.length ? retakeFront(prev, input, {}).baseline : buildBaseline(input);

    const blob = encodeForStore(d.cv, BARE_MAX_SIDE).then((e) => e.blob);   // 원본 크기 (#240)
    const store = saveBare ? saveBare(blob) : Promise.resolve();
    store
      .then(async () => {
        const bare = await blob;
        if (baseRef.current) baseRef.current = { ...baseRef.current, bareImage: bare };
      })
      .catch((e: unknown) => log.log({ name: "error", where: "capture", msg: `save_bare:${String(e).slice(0, 120)}` }));
  }, [log, saveBare]);

  const finishBurst = useCallback((): void => {
    framesRef.current = burstFramesRef.current;
    burstRef.current = null;
    burstFramesRef.current = [];
    burstWaitRef.current = false;
    nextStep();
  }, [nextStep]);

  const take = useCallback((id: ShotId, el: HTMLVideoElement, lm: Pt[], w: number, h: number, forehead: Lab | null, expr: Record<string, number> | null): void => {
    busyRef.current = true;
    const cv = grabFrame(el);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 250);
    shutterCue(false);
    const data: ShotData = { cv, lm, w, h, forehead, expr };
    if (id === "front_open") setFront(data);
    shotRef.current = data;
    setShotUi(data);
    ev.shot(id, true, null);
    busyRef.current = false;
    if (id === "front_open" && burstRef.current) {
      burstRef.current = burstShot(burstRef.current, performance.now());
      // 아직 다섯 장을 못 모았으면 셔터 뒤 1.5초 더 모은다 — 그동안 다음 장으로 넘어가지 않는다
      if (!burstRef.current.done) { burstWaitRef.current = true; return; }
      finishBurst();
      return;
    }
    nextStep();
  }, [ev, finishBurst, nextStep, setFront]);

  const frame = useCallback((now: number): void => {
    const el = video.current;
    const lmk = model.ref.current;
    if (!el || !lmk) return;
    const shot = runRef.current.shot;
    if (busyRef.current || el.readyState < 2 || (!shot && !burstWaitRef.current)) return;
    const sw = el.videoWidth, sh = el.videoHeight;
    const res: FaceLandmarkerResult = lmk.detectForVideo(el, now);
    const raw = res.faceLandmarks[0];
    const m: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
    let lm: Pt[] = [];
    let lab: Lab | undefined;
    let expr: Record<string, number> | null = null;
    if (raw) {
      if (lostRef.current !== null) { ev.faceLost(now - lostRef.current); lostRef.current = null; }
      lm = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
      const ang = yawFromLandmarks(lm);
      const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
      if (bs.size) expr = Object.fromEntries(bs);
      const yaw = -ang.yaw;   // 화면(거울) 기준
      const fr = foreheadLabOf(el, lm, sw, sh);
      lab = fr?.skin;
      // 가림(급변)은 전체 평균으로 — 피부만 남기면 그림자 진 손도 빠져 가림을 못 잡는다 (#212 리뷰)
      if (fr?.raw) {
        const r = foreheadStep(fjRef.current, now, fr.raw, { yaw, pitch: ang.pitch });
        fjRef.current = r.track;
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
        sharpness: sharpnessOf(el, faceCropOf(lm, sw, sh)),
      });
      // 장이 여럿이던 때 나머지 장의 밝기·색 기준은 정면 눈 뜸 값이었다. 지금은 장이 하나라 걸릴 일이 없지만
      // 장이 늘면 그대로 돌아야 하니 남겨 둔다 (본 앱과 같은 자리)
      const front = shotRef.current;
      if (shot !== "front_open" && front?.forehead) {
        m.baselineL = front.forehead.L;
        m.baselineAb = { a: front.forehead.a, b: front.forehead.b };
      }
    } else if (lostRef.current === null) {
      lostRef.current = now;
    }
    const burst = burstRef.current;
    if (burst && !burst.done && (shot === "front_open" || burstWaitRef.current)) {
      const b = burstStep(burst, now, shotGate("front_open", { ...m, stableCount: Number.MAX_SAFE_INTEGER }).ok);
      burstRef.current = b.state;
      if (b.dropOldest) burstFramesRef.current.shift();
      if (b.take) burstFramesRef.current.push(grabFrame(el, 1024));
      if (burstWaitRef.current && b.state.done) finishBurst();
    }
    if (burstWaitRef.current || !shot) return;   // 셔터 뒤 얼굴형 프레임을 마저 모으는 동안은 "찍을게요" 그대로
    const r = runStep(runRef.current, m, now);
    runRef.current = r.state;
    if (r.gate) ev.blocked(shot, r.gate.ok ? null : r.gate.firstFail, now);
    // 같은 글자를 다시 넣어도 React 가 알아서 넘긴다 — 프레임마다 불러도 다시 그리지 않는다
    setGate(r.gate?.text || CAPTURE_TEXT.aim);
    setReady(!!r.gate?.ok);
    setHint(r.hint);
    if (r.take) take(shot, el, lm, sw, sh, lab ?? null, expr);
  }, [ev, finishBurst, model.ref, take]);

  useFrameLoop({
    video,
    on: loopOn,
    onFrame: frame,
    // 한 프레임이 터져도 루프는 계속 돈다 — 한 번의 추론 실패로 촬영이 멈추면 아무것도 못 찍는다
    onError: (e) => log.log({ name: "error", where: "capture", msg: `frame:${String(e).slice(0, 120)}` }),
  });

  // 홈으로 나갔다 오면 카메라가 꺼져 있다 → 다시 켜서 남은 장부터
  useEffect(() => bindVisibility(document, {
    onHidden: () => setVisible(false),
    onVisible: () => setVisible(true),
  }), []);

  // 번쩍임 타이머는 화면을 떠날 때 치운다 (떠난 뒤 setState 하면 경고가 뜬다)
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const retake = (id: ShotId): void => {
    log.log({ name: "button", button: `retake:${id}` });
    ev.retake(id);
    shotRef.current = null;
    setShotUi(null);
    framesRef.current = [];
  };

  // ---------- 확인 화면 ----------
  if (done) {
    return (
      <section className="screen capture capture-done">
        <h1 className="title">{CAPTURE_TEXT.doneTitle}</h1>
        <p className="sub">{CAPTURE_TEXT.doneSub}</p>
        {/* 말풍선은 다른 화면과 같은 모양을 쓴다 (app.css `.coach`) — 본 앱 `.capture-done-coach` 자리 */}
        <div className="coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <p>
            {CAPTURE_TEXT.doneCoach}
            <i aria-hidden="true" />
          </p>
        </div>
        <ul className="shot-grid">
          {SHOTS.map((s) => (
            <li className="shot-cell" key={s.id}>
              <Thumb cv={s.id === "front_open" ? shotUi?.cv ?? null : null} />
              <span className="shot-name">{s.name}</span>
              <button type="button" className="shot-retake" onClick={() => retake(s.id)}>
                {CAPTURE_TEXT.retake}
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          {onBack && (
            <button type="button" className="go ghost" onClick={onBack}>
              이전
            </button>
          )}
          <button
            type="button"
            className="go"
            onClick={() => {
              log.log({ name: "button", button: "capture_done" });
              if (baseRef.current) onDone(baseRef.current, framesRef.current);
            }}
          >
            {CAPTURE_TEXT.go}
          </button>
        </div>
      </section>
    );
  }

  // ---------- 카메라 화면 ----------
  // 까닭에 맞는 말 + 다시 시도 (본 앱 #422) — 무슨 오류든 "허용해 주세요" 뿐이던 때는 다시 해 볼 길이 없었다.
  // 흐름을 막지 않는다: 안내와 "다시 시도" 를 띄우고 "이전" 도 그대로 둔다
  const failed = camera.error !== null;
  const line = failed ? cameraFailText(camera.error) : gate;

  return (
    <section className="screen capture">
      {/*
        꼬리표는 **카메라 칸 바로 위에 붙는다** (본 앱 `.capture-camera-title`, 아래 12px).
        전에는 꼬리표와 카메라 사이에 단계 안내가 끼어 있어 꼬리표가 붕 떠 보였다
        (2026-10-14, 폰에서 확인). 단계 안내는 카메라 아래로 내렸다 — 찍는 동안 보는 글이라
        영상 가까이 있으면 되고, 꼬리표는 "여기가 촬영 칸" 이라는 딱지라 칸에 붙어야 한다
      */}
      <p className="capture-title">{CAPTURE_TEXT.title}</p>

      <div className="cam">
        <video className="cam-video" ref={video} playsInline muted autoPlay />
        <div className={ready ? "cam-oval ready" : "cam-oval"} />
        {flash && <div className="cam-flash" />}
        <div className="cam-coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <span>
            {line}
            {/* 말풍선 오른쪽 위의 작은 하트 — 본 앱 `.cam-coach i` */}
            <i aria-hidden="true" />
          </span>
        </div>
      </div>

      {/*
        단계 안내("정면을 보고 눈을 떠 주세요"). **눈에는 안 보인다** —
        영상 위 스티커가 지금 무엇을 해야 하는지 말해 주는데 그 아래에 또 글이 나와
        겹쳐 읽혔다 (2026-10-14, 전지원이 폰에서 확인). 찍는 장이 한 장(front_open)뿐이라
        자세 안내는 없어도 흐름이 막히지 않는다.

        지우지 않고 남기는 까닭: 장이 늘면(눈 감은 장이 돌아오는 등) 다시 필요해지고,
        화면 읽어 주는 기능에는 이 글이 있어야 어떤 자세인지 알 수 있다
      */}
      <p className="cam-step"><span className="sr-only">{step}</span></p>

      {/*
        조건 한 줄. 전에는 말풍선과 **똑같은 글을 두 번** 그렸다 — 스티커가 말해 주는데
        바로 아래에 같은 말이 또 나와 겹말로 읽혔다 (2026-10-14, 폰에서 확인).
        말풍선이 영상 위에 떠서 안 보일까 봐 한 줄 더 둔 것이었는데, 둘 다 잘 보인다.
        그래서 아래 줄은 **화면 읽어 주는 기능에만** 남긴다 — 눈으로는 말풍선 하나만 본다.
        `role="status"` 라 글이 바뀌면 읽어 준다
      */}
      <p className={ready ? "cam-gate ready" : "cam-gate"} role="status" aria-live="polite">
        <span className="sr-only">{line}</span>
      </p>

      {hint !== null && <p className="cam-hint">{hint}</p>}

      {failed && (
        <button
          type="button"
          className="go cam-retry"
          onClick={() => {
            log.log({ name: "button", button: `camera_retry:${cameraFailKind(camera.error)}` });
            camera.retry();
          }}
        >
          {CAPTURE_TEXT.cameraRetry}
        </button>
      )}

      {/* 찍은 장수 — 지금은 한 칸이지만 SHOTS 를 따라가니 장이 늘면 같이 늘어난다 */}
      <ol className="cam-progress">
        {SHOTS.map((s) => (
          <li className={s.id === "front_open" && shotUi ? "on" : ""} key={s.id} />
        ))}
      </ol>

      {onBack && (
        <button type="button" className="go ghost" onClick={onBack}>
          이전
        </button>
      )}
    </section>
  );
}
