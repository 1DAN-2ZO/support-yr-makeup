/**
 * 화면 — 완성사진(attempt) 자동 촬영. 본 앱 `client/src/screens/attempt.ts` (360줄) 를 React 로 옮긴 것이다.
 *
 * 흐름: 안내("찍기 시작") → 카메라 → 조건이 안정되면 **저절로** 찍힘 → 찍은 사진 확인 → 다시 찍기 / 다음.
 * 화장을 **다 한 뒤** 찍는 장이라 맨얼굴 촬영(`Capture.tsx`)과 찍는 조건이 조금 다르다. 본 앱에서 읽은 대로 —
 *  1. **맨얼굴 대비 밝기 · 색은 막지 않는다.** `baselineL` · `baselineAb` 를 넣지 않으니 shotGate 가 그 조건을
 *     건너뛴다. 화장을 하는 동안 조명이 바뀌었으면 그것은 피드백(③)이 판단할 일이고, 여기서 막으면
 *     화장을 다 한 사람이 사진을 못 찍는다.
 *  2. **이마 가림(급변) · 이마 숨음도 보지 않는다.** `core/occlusion` 의 이마 추적을 쓰지 않는다 — 이마에
 *     베이스를 바른 뒤라 급변이 화장인지 손인지 가를 수 없다. 이마 L* 의 절대 범위(너무 어둡다/밝다)만 본다.
 *  3. **셔터 뒤에 다섯 장을 모은다** (`core/attempt` ATTEMPT_BURST — 0.2초 간격 · 1.5초 안). 맨얼굴의 묶음은
 *     얼굴형 분류용이라 셔터 **앞뒤**로 모아 1024px 로 줄이지만, 여기 묶음은 피드백이 값마다 **가운데 값**을
 *     쓰려고 모으는 것이라 셔터 **뒤**로만 모으고 크기도 줄이지 않는다 (#328).
 *  4. **찍혔다는 소리는 묶음을 다 모은 뒤에** 낸다 (본 앱과 같은 자리). 맨얼굴은 셔터 순간에 낸다.
 *  5. 기준(Baseline)을 만들지 않는다 — 맨얼굴만 기준이 된다. 여기서는 사진 · 얼굴 점만 넘긴다.
 *
 * 사진은 **원본 크기**로 넘긴다 (#330 · #240) — 얼굴 점이 촬영 크기 기준이고, 줄이면 라이너 꼬리가 사라진다.
 * 그 때문에 본 앱 미리보기가 화면을 넘쳤다 (#344 ③). 여기서는 미리보기 칸 크기를 `attempt.css` 에서
 * 잡아 **375px 폭에서도 사진과 버튼이 한눈에** 들어오게 한다.
 *
 * 카메라 두 겹 돌기는 `hooks/useCamera` · `useFrameLoop` · `useLandmarker` 가 이미 푼 방식을 그대로 따른다
 * (StrictMode 두 번 실행 → 회차 깃발 + 정리 함수에서 트랙 · 루프 · 모델 놓기, 의존성에는 원시값만).
 * 매 프레임 바뀌는 것(run · 묶음 · 모은 장면)은 **ref** 에 둔다 — 상태로 두면 프레임 콜백이 새로 만들어진다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { ATTEMPT_SHOTS, attemptBurstStep, startAttemptBurst, startAttemptRun, type AttemptBurst, type AttemptShotId } from "@core/attempt";
import { cameraFailKind, type CameraFailKind } from "@core/camera-fail";
import { STEP_TEXT, runStep, type RunState } from "@core/capture-run";
import { eyeWidthPxOf, eyesClosed, faceCropOf, faceInsetOf, faceRatioOf, yawFromLandmarks } from "@core/capture-measure";
import type { ShotMeasure } from "@core/flow";
import { createLogger, type Logger } from "@core/log";
import type { Pt } from "@core/types";
import { foreheadLabOf, grabFrame, sharpnessOf } from "../lib/frame-measure";
import { BARE_MAX_SIDE, encodeForStore } from "../lib/image-encode";
import { shutterCue, unlockShutterCue } from "../lib/shutter-cue";
import { smoothSkinCanvas } from "../lib/skin-canvas";
import { useCamera } from "../hooks/useCamera";
import { useFrameLoop } from "../hooks/useFrameLoop";
import { useLandmarker } from "../hooks/useLandmarker";
import "../camera.css";
import "../attempt.css";
import { useLang } from "../i18n/useLang";
import { shotText } from "../lib/core-text";
import type { Key } from "../i18n";

/** 한 장 — 사진(원본 크기) · 얼굴 점(사진 px) · 사진 크기. 피드백(③)이 맨얼굴 · 정답사진과 맞춰 비교한다 */
export interface AttemptShot {
  blob: Blob;
  lm: Pt[];
  w: number;
  h: number;
}

/** 종류마다 장 묶음 — [0] 이 셔터 장. 눈 뜬 장 다섯 장까지 (core/attempt ATTEMPT_BURST) */
export type AttemptShots = Record<AttemptShotId, AttemptShot[]>;

/** 아직 인코딩하기 전의 한 장면 — 캔버스 그대로 들고 있다가 다 찍은 뒤에 한꺼번에 줄인다 */
interface Taken {
  cv: HTMLCanvasElement;
  lm: Pt[];
  w: number;
  h: number;
}

/*
 * 화면 글은 `i18n/ko.ts` · `en.ts` 로 옮겼다 (2026-10-16) — 열쇠는 `att.*` 다.
 * `att.aim` 은 코어가 주는 안내(`r.hint` · `r.gate?.text`)가 없을 때만 쓰는 뒷받침이다.
 */

export interface AttemptProps {
  /**
   * 다 찍고 "이대로 피드백 받기" 를 눌렀을 때. 사진 묶음을 넘긴다 (세션 · 폰 저장은 받는 쪽 몫 —
   * 본 앱 `AttemptDeps.setAttempt` 와 같다). 약속(Promise)을 돌려주면 저장이 끝날 때까지 기다린다
   */
  onDone: (shots: AttemptShots) => void | Promise<void>;
  /** 한 칸 뒤로(부위 가이드). 안 주면 버튼을 안 그린다 */
  onBack?: () => void;
  /** 공통 로그(core/log). 안 주면 콘솔로 나가는 것을 혼자 만든다 */
  logger?: Logger;
}

/** 지금 어느 칸에 있나. saving 은 카메라를 끈 뒤 사진을 줄이는 동안 (그 사이 카메라가 켜져 있으면 안 된다) */
type Phase = "intro" | "camera" | "saving" | "preview";

/**
 * 카메라를 못 열었을 때의 글 — **코어를 고치지 않고** 까닭만 받아 와 우리 말로 바꾼다.
 * `@core/camera-fail` 은 본 앱(`client/`)과 함께 쓰는 파일이라 건드리지 않는다.
 */
const CAMERA_FAIL_KEY: Record<CameraFailKind, Key> = {
  denied: "cam.fail.denied",
  busy: "cam.fail.busy",
  none: "cam.fail.none",
  other: "cam.fail.other",
};

export default function Attempt({ onDone, onBack, logger }: AttemptProps) {
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>("intro");
  /**
   * 찍은 사진과 그 미리보기 주소를 **한 덩어리로** 들고 있다. 주소를 따로 만들면(효과 안에서)
   * StrictMode 가 두 번 그릴 때 주소가 두 개 생겨 한 개는 끝까지 안 돌려주게 된다
   */
  const [done, setDone] = useState<{ shots: AttemptShots; url: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // ---------- 화면에 보이는 글 ----------
  const [step, setStep] = useState("");
  // 글자 하나로 굳지 않게 string 으로 적어 둔다 — 코어가 주는 안내도 여기 들어온다
  const [line, setLine] = useState<string>("");
  const [ready, setReady] = useState(false);

  const video = useRef<HTMLVideoElement | null>(null);
  // 로그는 안 받았으면 한 번만 만든다. 그릴 때마다 새로 만들면 지금까지의 기록이 끊긴다
  const log = useMemo(() => logger ?? createLogger({ sid: "attempt-react", screen: "attempt", part: null, ver: { app: "dev", score: "dev", look: "dev", faceshape: "dev", transfer: "dev" } }), [logger]);

  // 카메라는 "camera" 칸에서만 켠다 — 사진을 줄이는 동안(saving)과 확인 칸(preview)에서는 꺼져 있다.
  // 잠금은 걸지 않는다 (본 앱 attempt 도 풀기만 한다, #267) → lockMode 를 주지 않는다
  const camera = useCamera({ on: phase === "camera" });
  const model = useLandmarker("VIDEO");

  // 스트림을 미리보기에 붙인다. 떠날 때 떼어 주지 않으면 video 가 끝난 트랙을 들고 있어
  // 마지막 장면이 얼어붙은 채 남는다 (카메라는 꺼졌는데 화면만 켜진 것처럼 보인다)
  useEffect(() => {
    const el = video.current;
    if (!el || !camera.stream) return;
    el.srcObject = camera.stream;
    // play() 는 자동재생 정책에 걸려 거부될 수 있다 — 거부돼도 스트림은 살아 있으니 흐름을 막지 않는다
    void el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [camera.stream]);

  // ---------- 매 프레임 바뀌는 것 (상태로 두면 루프가 다시 돈다) ----------
  const runRef = useRef<RunState>(startAttemptRun({}, 0));
  const takenRef = useRef<Partial<Record<AttemptShotId, Taken[]>>>({});
  /** 셔터 뒤 묶음을 모으는 중 — 다 모으면 다음 장으로 */
  const burstRef = useRef<AttemptBurst | null>(null);
  const framesRef = useRef<Taken[]>([]);
  /** 떠난 뒤에 인코딩이 끝나는 일이 있다 — 그때 상태를 건드리지 않으려고 둔다 */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const loopOn = phase === "camera" && !!camera.stream && model.ready;

  // 카메라 · 모델이 준비되면 그 장을 처음부터 — 본 앱 camera() 의 루프 시작 자리와 같다.
  // 의존성은 원시값 하나(loopOn)뿐이다. 함수를 넣으면 그릴 때마다 처음으로 돌아가 영원히 못 찍는다
  useEffect(() => {
    if (!loopOn) return;
    takenRef.current = {};
    framesRef.current = [];
    burstRef.current = null;
    runRef.current = startAttemptRun({}, performance.now());
    setStep(runRef.current.shot ? shotText(t, STEP_TEXT[runRef.current.shot]) : "");
    setLine("");
    setReady(false);
  }, [loopOn]);

  /** 한 장을 다 모은 뒤. 남은 장이 있으면 다음 장, 없으면 카메라를 끄고 사진을 줄인다 */
  const finishShot = useCallback((shot: AttemptShotId, now: number): void => {
    takenRef.current[shot] = framesRef.current;
    burstRef.current = null;
    framesRef.current = [];
    shutterCue(false);
    log.log({ name: "button", button: `attempt_shot:${shot}` });
    runRef.current = startAttemptRun(takenRef.current, now);
    if (runRef.current.shot) {
      setStep(shotText(t, STEP_TEXT[runRef.current.shot]));
      return;
    }
    // 다 찍었다 — 카메라를 끄고(phase 가 바뀌면 useCamera 가 트랙을 놓는다) 사진을 줄인다
    const taken = takenRef.current;
    setPhase("saving");
    setStep("");
    setLine(t("att.saving"));
    // 줄이지 않는다 — 얼굴 점이 촬영 크기 기준이고, 줄이면 라이너 꼬리가 사라진다 (#328 · #240)
    void Promise.all(ATTEMPT_SHOTS.map(async (id) => {
      const list = taken[id] ?? [];
      // 피부 정돈 — 맨얼굴과 같게 (② core/skin-smooth). 끄려면 SKIN_SMOOTH.on
      for (const t of list) smoothSkinCanvas(t.cv, t.lm, t);
      const done = await Promise.all(list.map(async (t) => ({ blob: (await encodeForStore(t.cv, BARE_MAX_SIDE)).blob, lm: t.lm, w: t.w, h: t.h })));
      return [id, done] as const;
    })).then(
      (pairs) => {
        if (!aliveRef.current) return;
        const made = Object.fromEntries(pairs) as AttemptShots;
        const blob = made.front_open[0]?.blob;
        setDone({ shots: made, url: blob ? URL.createObjectURL(blob) : "" });
        setPhase("preview");
      },
      (e: unknown) => {
        log.log({ name: "error", where: "attempt", msg: `encode:${String(e).slice(0, 120)}` });
        if (!aliveRef.current) return;
        // 흐름을 막지 않는다 — 안내와 "다시 찍기" 를 띄우고 "이전" 도 그대로 둔다
        setSaveFailed(true);
        setPhase("preview");
      },
    );
  }, [log]);

  const frame = useCallback((now: number): void => {
    const el = video.current;
    const lmk = model.ref.current;
    if (!el || !lmk) return;
    if (!runRef.current.shot && !burstRef.current) return;
    if (el.readyState < 2) return;
    const sw = el.videoWidth, sh = el.videoHeight;
    const res: FaceLandmarkerResult = lmk.detectForVideo(el, now);
    const raw = res.faceLandmarks[0];
    const ms: ShotMeasure = { faceDetected: !!raw, yaw: 0, pitch: 0, closedA: false, closedB: false };
    let lm: Pt[] | null = null;
    if (raw) {
      lm = raw.map((p) => ({ x: p.x * sw, y: p.y * sh }));
      const ang = yawFromLandmarks(lm);
      const bs = new Map((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
      const lab = foreheadLabOf(el, lm, sw, sh)?.skin;
      // 이마 L* 은 **절대 범위**(너무 어둡다 / 밝다)에만 쓴다. 맨얼굴 대비(baselineL · baselineAb)는
      // 일부러 넣지 않는다 — 화장 뒤 밝기 · 색이 달라진 것은 막을 일이 아니다 (본 앱 attempt 머리글)
      if (lab) ms.foreheadL = lab.L;
      Object.assign(ms, {
        yaw: -ang.yaw, pitch: ang.pitch, ...eyesClosed(lm, bs),
        faceRatio: faceRatioOf(lm, sw, sh), faceInset: faceInsetOf(lm, sw, sh), eyeWidthPx: eyeWidthPxOf(lm),
        sharpness: sharpnessOf(el, faceCropOf(lm, sw, sh)),
      });
    }
    // 셔터 뒤 묶음을 모으는 중 — 조건(안정 빼고)을 통과한 장면만, 0.2초 간격으로
    const burst = burstRef.current;
    if (burst) {
      const b = attemptBurstStep(burst, ms, now);
      burstRef.current = b.state;
      if (b.take && lm) framesRef.current.push({ cv: grabFrame(el), lm, w: sw, h: sh });
      if (b.state.done) finishShot(b.state.shot, now);
      return;
    }
    const shot = runRef.current.shot;
    if (!shot) return;
    const r = runStep(runRef.current, ms, now);
    runRef.current = r.state;
    // 같은 글자를 다시 넣어도 React 가 알아서 넘긴다 — 프레임마다 불러도 다시 그리지 않는다.
    // 15초 넘게 못 찍었을 때의 힌트가 조건 한 줄을 덮는다 (본 앱과 같은 자리)
    setLine(shotText(t, r.hint ?? r.gate?.text ?? "") || t("att.aim"));
    setReady(!!r.gate?.ok);
    if (!r.take || !lm) return;
    // 셔터 — 이 장이 묶음의 첫 장. 찍혔다는 소리는 묶음을 다 모은 뒤에 낸다
    framesRef.current = [{ cv: grabFrame(el), lm, w: sw, h: sh }];
    const started = startAttemptBurst(shot, now);
    burstRef.current = started;
    if (started.done) finishShot(shot, now);
  }, [finishShot, model.ref]);

  useFrameLoop({
    video,
    on: loopOn,
    onFrame: frame,
    // 한 프레임이 터져도 루프는 계속 돈다 — 한 번의 추론 실패로 촬영이 멈추면 아무것도 못 찍는다
    onError: (e) => log.log({ name: "error", where: "attempt", msg: `frame:${String(e).slice(0, 120)}` }),
  });

  // 미리보기 주소는 다시 찍거나 떠날 때 돌려준다 — 안 돌려주면 사진이 메모리에 그대로 남는다
  useEffect(() => {
    const u = done?.url;
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [done]);

  /** 다시 찍기 — 찍은 것을 버리고 카메라부터 (안내 칸으로 돌아가지 않는다, 본 앱과 같다) */
  const retake = (): void => {
    log.log({ name: "button", button: "attempt_retake" });
    setDone(null);
    setSaveFailed(false);
    setPhase("camera");
  };

  /** 두 번 눌러 두 번 넘기지 않게 (본 앱 sent) */
  const sentRef = useRef(false);
  const confirm = (): void => {
    if (sentRef.current || !done) return;
    sentRef.current = true;
    log.log({ name: "button", button: "attempt_confirm" });
    void Promise.resolve(onDone(done.shots));
  };

  const back = onBack && (
    <button type="button" className="go ghost" onClick={() => {
      log.log({ name: "button", button: "back:partguide" });
      onBack();
    }}>
      {t("att.back")}
    </button>
  );

  // ---------- 안내 칸 ----------
  if (phase === "intro") {
    return (
      <section className="screen attempt">
        <div className="attempt-coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <span>{t("att.coach")}</span>
        </div>
        <h1 className="title">{t("att.title")}</h1>
        <p className="sub">{t("att.intro")}</p>
        <div className="row">
          {back}
          <button
            type="button"
            className="go"
            onClick={() => {
              log.log({ name: "button", button: "attempt_start" });
              // iOS 는 탭하는 그 순간에 소리를 열어 둬야 나중에 "톡" 이 난다 (lib/shutter-cue)
              unlockShutterCue();
              setPhase("camera");
            }}
          >
            {t("att.start")}
          </button>
        </div>
      </section>
    );
  }

  // ---------- 찍은 사진 확인 칸 ----------
  if (phase === "preview") {
    return (
      <section className="screen attempt attempt-done">
        <h1 className="title">{t("att.previewTitle")}</h1>
        <p className="sub">{saveFailed ? t("att.saveFail") : t("att.previewSub")}</p>
        {/* 사진은 원본 크기라(#330) 칸 크기를 잡아 주지 않으면 구석만 보이고 버튼이 화면 밖으로 밀린다 (#344 ③) */}
        {done?.url && (
          <figure className="attempt-preview">
            <img src={done.url} alt={t("att.openLabel")} />
            <figcaption>{t("att.openLabel")}</figcaption>
          </figure>
        )}
        <div className="row">
          <button type="button" className="go ghost" onClick={retake}>
            {t("att.retake")}
          </button>
          {!saveFailed && (
            <button type="button" className="go" onClick={confirm}>
              {t("att.confirm")}
            </button>
          )}
        </div>
        {back}
      </section>
    );
  }

  // ---------- 카메라 칸 (saving 도 같은 칸 — 카메라만 꺼져 있다) ----------
  // 까닭에 맞는 말 + 다시 시도 (#422) — 무슨 오류든 "허용해 주세요" 뿐이던 때는 다시 해 볼 길이 없었다.
  // 흐름을 막지 않는다: 안내와 "다시 시도" 를 띄우고 "이전" 도 그대로 둔다
  const failed = camera.error !== null;
  const text = failed ? t(CAMERA_FAIL_KEY[cameraFailKind(camera.error)]) : phase === "saving" ? t("att.saving") : loopOn ? line : t("att.loading");

  return (
    <section className="screen attempt">
      <p className="capture-title">{t("att.cameraTitle")}</p>

      {/* 단계 안내 — 본 앱 app.css 에서는 숨어 있던 줄이다 (#344 ②). 어떤 자세로 찍는지 여기서만 알 수 있다 */}
      <p className="cam-step">{step}</p>

      <div className="cam">
        <video className="cam-video" ref={video} playsInline muted autoPlay />
        <div className={ready ? "cam-oval ready" : "cam-oval"} />
        <div className="cam-coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <span>{text}</span>
        </div>
      </div>

      {/* 조건 한 줄 — 말풍선과 같은 글이지만 말풍선은 영상 위라 밝은 얼굴에 묻힌다. 아래에 한 번 더 */}
      <p className={ready ? "cam-gate ready" : "cam-gate"} role="status">{text}</p>

      {failed && (
        <button
          type="button"
          className="go cam-retry"
          onClick={() => {
            log.log({ name: "button", button: `camera_retry:${cameraFailKind(camera.error)}` });
            camera.retry();
          }}
        >
          {t("att.retry")}
        </button>
      )}

      {back}
    </section>
  );
}
