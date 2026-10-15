/**
 * 화면 — 실시간 가이드(live). 본 앱 `client/src/screens/live.ts` (467줄) 를 React 로 옮긴 것이다.
 *
 * **흐름의 한 칸이 아니다.** 본 앱 `core/screens.ts` 의 `SIDE_OF = { live: "partguide" }` 그대로 —
 * 부위 가이드에서 「실시간 가이드로 보기」로 들어와 「이전」으로 **부위 가이드로 돌아오는 곁 화면**이다.
 * 채점하지 않고 **보기만** 한다 (#334 · #413): 카메라 속 내 얼굴 위에 그 부위 테두리를 얼굴을 따라가며 그린다.
 *
 * 옮기면서 뺀 것은 없다. 본 앱이 하는 일을 그대로 —
 *  1. **영상은 숨기고 부위 확대 창만** 캔버스에 거울로 그린다 (#23, 정의서 3-3). 창은 `core/crop-follow` 가
 *     얼굴 폭 3% 데드존 + 미끄러짐으로 따라가고, 얼굴이 누웠거나(자동 회전 꺼짐 #204) 부위에 맞지 않는 방향으로
 *     들고 있으면 확대하지 않고 영상 전체를 보여 준다 (`core/orientation-lock`).
 *  2. **테두리는 맨얼굴(기준) 얼굴에 한 번 그려 얼굴 그물에 붙이고** 매 장면 지금 얼굴로 옮긴다 (`core/live-run`).
 *     떨림은 One-Euro(`core/smoothing`, 값은 `core/smooth-params` LIVE_SMOOTH), 튄 점은 이웃으로 바로잡기,
 *     고개를 많이 돌리면 먼 쪽 눈은 눈 모양 틀로 + 흐리게.
 *  3. **그리는 것은 `lib/outline-draw` 의 `partColor` · `strokeOutline`** 만 쓴다 — 새로 긋지 않는다.
 *  4. 개발용 주소 꼬리표 전부: `?stab=0` · `?jitter` · `?gate` · `?pose` · `?dots` · `?fade` · `?g=` · `?jump` ·
 *     `?perf` · `?tune` · `?norotate`. 본 앱과 **같은 이름 · 같은 뜻**이라야 두 앱의 숫자를 견줄 수 있다.
 *  5. 옛 흐름(「확인받기」 → 3~5장 묶음 → 채점)도 그대로 둔다 — `onBack` 대신 `onDone` 을 주면 그 길로 돈다.
 *     이 버전은 늘 `onBack` 을 주니 실제로는 보기만 하지만, 본 앱에서 **지우지 않은 길**이라 여기서도 지우지 않았다.
 *
 * 이 버전에는 **정답사진이 없다.** 본 앱은 정답사진에서 뽑은 그 부위 테두리(`getOutline`)를 그리는데, 여기서는
 * 줄 사람이 없어 옛 표준 틀(`core/guides` lookGuide)을 「예시」 딱지와 함께 그린다 — 본 앱이 정답사진을
 * 아직 못 만들었을 때 하는 것과 **같은 자리 · 같은 딱지**다. 정답사진이 붙으면 `outline` props 로 넘기면 된다.
 * 기준 이마 a*·b*(`baseAb`) 도 `Baseline` 에 없어 안 넘긴다 → 색 조건을 건너뛴다 (본 앱도 복원 뒤에는 없다).
 *
 * **매 프레임 캔버스에 그리는 화면이라 루프가 두 겹이 되면 바로 느려진다.** `hooks/useCamera` 가 푼 방식을
 * 그대로 따른다 (StrictMode 두 번 실행 → 회차 깃발 + 정리 함수에서 트랙 · 루프 · 모델 놓기, 의존성에는 원시값만):
 *  - 매 프레임 바뀌는 것(창 · 놓침 시각 · 지난 테두리 · 묶음)은 전부 **ref**. 상태로 두면 프레임마다 다시 그린다
 *  - `createLiveRun` 은 **효과에서 한 번** 만들어 ref 에 둔다. 의존성은 원시값과 **바뀌지 않는 객체**만 —
 *    그릴 때마다 새로 만들어지는 `lookParts` 같은 것은 ref 로 읽는다 (넣으면 매 렌더 테두리가 처음으로 돌아간다)
 *  - 개발용 숫자 표시는 **DOM 에 직접** 쓴다 (`readoutRef`). 프레임마다 상태로 넣으면 초당 30번 다시 그린다
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { BundleOf } from "@core/capture-bundle";
import { faceCropOf } from "@core/capture-measure";
import { ROLL_MAX, cropSpec, faceRoll, type Rect } from "@core/crop";
import { clampRect, createCropFollow, jitterMeter } from "@core/crop-follow";
import { LIVE_LIMITS } from "@core/gate";
import { gateReadout, recentStats } from "@core/gate-readout";
import { lookGuide } from "@core/guides";
import { createJumpProbe } from "@core/landmark-jump";
import { LM } from "@core/landmarks";
import { FAR_FADE, createLiveRun, type LiveFrame } from "@core/live-run";
import { createLiveEvents } from "@core/live-events";
import { createLogger, type Logger } from "@core/log";
import type { LookPart, LookPartId } from "@core/looks";
import { mustRotate, nowOrientation } from "@core/orientation-lock";
import type { Outline } from "@core/overlay";
import { createPerfMeter } from "@core/perf-meter";
import { LIVE_SMOOTH } from "@core/smooth-params";
import type { LandmarkSmoother } from "@core/smoothing";
import type { Baseline, CaptureBundle, PartId, Pt } from "@core/types";
import { bindVisibility } from "../lib/camera-locks";
import { foreheadLabOf, grabFrame, sharpnessOf } from "../lib/frame-measure";
import { partColor, strokeOutline } from "../lib/outline-draw";
import { createPoseProbe } from "../lib/pose-probe";
import SmoothTune from "../lib/smooth-tune";
import { useCamera } from "../hooks/useCamera";
import { useFrameLoop } from "../hooks/useFrameLoop";
import { useLandmarker } from "../hooks/useLandmarker";
import "../camera.css";
import "../live.css";

export const LIVE_TEXT = {
  loading: "카메라를 준비하고 있어요…",
  cameraFail: "카메라를 열 수 없어요. 브라우저 설정에서 카메라를 허용해 주세요",
  noPart: "부위가 정해지지 않았어요",
  noBaseline: "맨얼굴 사진이 없어요. 처음 촬영부터 다시 해 주세요",
  toCapture: "촬영하러 가기",
  button: "확인받기",
  back: "이전",
  capturing: "찍고 있어요. 그대로 있어 주세요",
  failed: "움직여서 못 찍었어요. 다시 눌러 주세요",
  /** 카메라 칸 꼬리표 — 어느 화면에 들어와 있는지 늘 보이게 (촬영 · 완성사진과 같은 자리) */
  title: "실시간 가이드",
  /** 「예시」 딱지 — 지금 보이는 모양은 정답사진의 화장이 아니라 견본이다 (#334) */
  sample: "예시",
} as const;

export interface LiveProps {
  /** 어느 부위의 가이드를 볼까. 부위 가이드에서 보고 있던 그 부위 */
  part: PartId;
  /** 맨얼굴 기준 — 촬영(Capture)이 내놓은 것. 없으면 「촬영하러 가기」만 띄운다 */
  baseline: Baseline | null;
  /** 촬영 때 잰 기준 이마 a*·b*. 없으면 색 조건을 건너뛴다 (본 앱도 복원 뒤에는 없다) */
  baseAb?: { a: number; b: number } | null;
  /**
   * 정답사진에서 뽑은 그 부위 테두리 (본 앱 `LiveDeps.getOutline` 자리). 주면 그것을 얼굴에 붙여 그리고
   * 「예시」 딱지를 떼고, 없으면 옛 표준 틀(lookGuide)을 딱지와 함께 그린다.
   * **그릴 때마다 새로 만들지 마라** — 효과 의존성에 들어가 테두리가 처음으로 돌아간다
   */
  outline?: Outline | null;
  /** 고른 룩의 parts — `outline` 이 없을 때의 기본 가이드(lookGuide)용 */
  lookParts?: Partial<Record<LookPartId, LookPart>>;
  /** 「이전」 — 부위 가이드로 돌아간다. 주면 이 화면은 **보기만** 한다 (곁 화면, #334) */
  onBack?: () => void;
  /** 맨얼굴이 없을 때 「촬영하러 가기」 */
  onToCapture?: () => void;
  /**
   * 옛 흐름 — `onBack` 을 안 주면 버튼이 「확인받기」가 되고, 게이트를 통과한 뒤 누르면 3~5장을 모아 여기로 넘긴다.
   * 이 버전은 묶음을 받을 화면이 없어 쓰지 않지만, 본 앱에 남아 있는 길이라 여기서도 지우지 않았다
   */
  onDone?: (part: PartId, bundle: CaptureBundle) => void;
  /** 공통 로그(core/log). 안 주면 콘솔로 나가는 것을 혼자 만든다 */
  logger?: Logger;
}

/** 창(영상 px) → 캔버스 px. 창이 영상 끝에 걸려 비율이 깨졌으면 여백을 둔다(contain) */
interface ViewMap {
  s: number;
  ox: number;
  oy: number;
  crop: Rect;
}

/** [개발용 ?dots] MediaPipe 가 준 눈꺼풀 점 그대로 (필터 전) — 테두리가 틀어질 때 점이 틀어졌는지, 옮기기가 틀어졌는지 가른다 */
const EYE_DOTS: readonly number[] = [...LM.eyeA.upper, ...LM.eyeA.lower, ...LM.eyeB.upper, ...LM.eyeB.lower];

/** 확대 창만 거울로 그리고 그 위에 테두리 (선만, F-07). 본 앱 drawView 그대로 */
function drawView(
  cv: HTMLCanvasElement,
  video: HTMLVideoElement,
  crop: Rect,
  o: Outline | null,
  dots: readonly Pt[] | null = null,
  alpha: readonly number[] | null = null,
  color?: string,
): ViewMap | null {
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
  if (o) {
    const lw = Math.max(2, W / 400) / s;
    // 고개를 많이 돌리면 먼 쪽 눈 테두리는 흐리게 (live-run alpha, FAR_FADE)
    strokeOutline(g, alpha ? { ...o, polys: o.polys.filter((_, i) => (alpha[i] ?? 1) >= 1) } : o, lw, color);
    if (alpha) {
      o.polys.forEach((poly, i) => {
        const a = alpha[i] ?? 1;
        if (a >= 1) return;
        g.globalAlpha = a;
        strokeOutline(g, { polys: [poly], lines: [] }, lw, color);
        g.globalAlpha = 1;
      });
    }
  }
  if (dots) {
    g.fillStyle = "#ffb000";
    const r = Math.max(2, W / 350) / s;
    for (const p of dots) { g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  return { s, ox, oy, crop };
}

export default function Live({ part, baseline, baseAb = null, outline = null, lookParts, onBack, onToCapture, onDone, logger }: LiveProps) {
  // 로그는 안 받았으면 한 번만 만든다. 그릴 때마다 새로 만들면 지금까지의 기록이 끊긴다
  const log = useMemo(
    () => logger ?? createLogger({ sid: "live-react", screen: "live", part, ver: { app: "dev", score: "dev", look: "dev", faceshape: "dev", transfer: "dev" } }),
    [logger, part],
  );

  // ---------- 개발용 주소 꼬리표 (본 앱과 같은 이름) ----------
  // 주소는 한 번만 읽는다. 아래 깃발은 전부 **원시값**이라 효과 의존성에 그대로 넣을 수 있다
  const q = useMemo(() => new URLSearchParams(window.location.search), []);
  const stab = q.get("stab") !== "0";
  const wantJitter = q.has("jitter");
  const wantPose = q.has("pose");
  const wantGate = q.has("gate");
  const wantDots = q.has("dots");
  const wantJump = q.has("jump");
  const wantPerf = q.has("perf");
  const wantTune = q.has("tune");
  const fadeQ = q.get("fade");
  const gQ = q.has("g") ? (q.get("g") ?? "") : null;

  /** 곁 화면(보기만) 인가 — 본 앱 `backTo` 자리. 「이전」이 있으면 확인받기 조건으로 막지 않는다 (#413) */
  const viewOnly = !!onBack;
  const ready = !!baseline && baseline.lm.length > 0;

  // ---------- 화면에 보이는 글 ----------
  const [line, setLine] = useState<string>(LIVE_TEXT.loading);
  const [gateOk, setGateOk] = useState(false);
  const [pressable, setPressable] = useState(false);
  const [collecting, setCollecting] = useState(false);
  /** 묶음을 넘긴 뒤 — 카메라를 끈 채로 둔다 (본 앱 alive=false → stopCamera) */
  const [sent, setSent] = useState(false);
  /** 홈 다녀오면 카메라가 꺼져 있다 → 숨은 동안 끄고, 돌아오면 다시 켠다 (본 앱 bindVisibility) */
  const [hidden, setHidden] = useState(false);
  /** 이 숫자가 바뀌면 테두리 · 게이트를 처음부터 다시 — 본 앱이 화면을 다시 그리던 자리 */
  const [gen, setGen] = useState(0);

  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** 개발용 숫자 표시 — 프레임마다 상태로 넣으면 초당 30번 다시 그린다. DOM 에 직접 쓴다 */
  const readoutRef = useRef<HTMLParagraphElement | null>(null);

  // 카메라는 기준이 있고 · 안 숨었고 · 아직 안 넘겼을 때만 켠다.
  // 잠금은 걸지 않는다 (본 앱도 켤 때 · 끌 때 남은 잠금만 푼다, #267) → lockMode 를 주지 않는다
  const camera = useCamera({ on: ready && !hidden && !sent });
  // 표정 분석(블렌드셰이프)은 확인받기 조건용 — 보기만이면 얼굴 점만 받는다 (#343)
  const model = useLandmarker("VIDEO", { blendshapes: !viewOnly });

  // 스트림을 (숨겨 둔) 영상에 붙인다. 떠날 때 떼어 주지 않으면 video 가 끝난 트랙을 들고 있어
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
  const runRef = useRef<ReturnType<typeof createLiveRun<HTMLCanvasElement>> | null>(null);
  const followRef = useRef<ReturnType<typeof createCropFollow> | null>(null);
  const followAspectRef = useRef(0);
  const cropRef = useRef<Rect | null>(null);
  const lostSinceRef = useRef<number | null>(null);
  /** 지난 프레임 테두리 점 — 창을 새로 잡을 때 표준 눈썹 꼬리처럼 얼굴 점 밖으로 나간 선까지 담게 */
  const lastShapeRef = useRef<Pt[]>([]);
  const collectingRef = useRef(false);
  /** 지금 보이는 안내 줄 — 본 앱이 `line.textContent` 를 되읽던 자리 (실패 문구를 바로 덮지 않으려고) */
  const lineRef = useRef<string>(LIVE_TEXT.loading);
  /** 떠난 뒤에 비트맵 바꾸기가 끝나는 일이 있다 — 그때 넘기지 않으려고 둔다 */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // 그릴 때마다 새로 만들어지는 것은 **ref 로 읽는다** — 효과 의존성에 넣으면 매 렌더 처음으로 돌아간다
  const lookPartsRef = useRef(lookParts);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    lookPartsRef.current = lookParts;
    onDoneRef.current = onDone;
  });

  // ---------- 개발용 재기 도구 (한 번만 만든다) ----------
  const meterRef = useRef<{ view: ReturnType<typeof jitterMeter>; line: ReturnType<typeof jitterMeter> } | null>(null);
  const poseRef = useRef<ReturnType<typeof createPoseProbe> | null>(null);
  const gateDbgRef = useRef<ReturnType<typeof recentStats> | null>(null);
  const jumpRef = useRef<ReturnType<typeof createJumpProbe> | null>(null);
  const perfRef = useRef<ReturnType<typeof createPerfMeter> | null>(null);
  useEffect(() => {
    meterRef.current = wantJitter ? { view: jitterMeter(), line: jitterMeter() } : null;
    poseRef.current = wantPose ? createPoseProbe() : null;
    gateDbgRef.current = wantGate ? recentStats(90) : null;
    jumpRef.current = wantJump ? createJumpProbe() : null;
    perfRef.current = wantPerf ? createPerfMeter() : null;
    return () => {
      meterRef.current = null;
      poseRef.current = null;
      gateDbgRef.current = null;
      jumpRef.current = null;
      perfRef.current = null;
    };
  }, [wantJitter, wantPose, wantGate, wantJump, wantPerf, gen]);

  const eventsRef = useRef<ReturnType<typeof createLiveEvents> | null>(null);
  useEffect(() => {
    eventsRef.current = createLiveEvents(log);
    return () => { eventsRef.current = null; };
  }, [log, gen]);

  /**
   * 테두리를 만드는 것(live-run)은 **효과에서 한 번**. ?tune 슬라이더가 잡을 필터는 화면에 그려야 하니
   * 상태로도 둔다 — 여기서 딱 한 번 다시 그리고, 그 뒤로는 프레임마다 ref 로만 쓴다
   */
  const [smoother, setSmoother] = useState<LandmarkSmoother | null>(null);
  useEffect(() => {
    if (!ready || !baseline) return;
    const fadeR = fadeQ?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    const r = createLiveRun<HTMLCanvasElement>({
      partId: part,
      baseline: { lm: baseline.lm, foreheadL: baseline.foreheadL },
      ...(baseAb ? { baseAb } : {}),
      // 맨얼굴 정면 때 표정 (#177). 못 쟀으면 null → 표정 조건을 건너뛴다
      baseExpr: baseline.expression,
      // 정답사진 테두리가 있으면 그것, 없으면 옛 표준 틀 (「예시」 딱지와 함께)
      ...(outline ? { outline } : { guide: lookGuide(lookPartsRef.current) }),
      smooth: stab,
      ...(viewOnly ? { viewOnly: true } : {}),
      // 개발용 ?fade=0 끄기 · ?fade=25-40 구간 바꾸기
      ...(fadeQ === "0" ? { fade: null } : fadeR ? { fade: { ...FAR_FADE, from: Number(fadeR[1]), to: Number(fadeR[2]) } } : {}),
      // 개발용 ?g=: 먼 쪽 눈 틀 맞추기 다듬기를 하나씩 켜서 비교 (1 눈머리 고정 · 2 눈썹 앞쪽 절반 · 3 높이 제한 · h 눈꼬리를 눈썹으로)
      ...(gQ !== null
        ? { farEye: { anchorInner: gQ.includes("1"), browHalf: gQ.includes("2"), capHeight: gQ.includes("3"), outerFromBrow: gQ.includes("h") } }
        : {}),
    });
    runRef.current = r;
    setSmoother(r.smoother);
    // 이 장을 처음부터 — 창 · 놓침 시각 · 지난 테두리도 같이 되돌린다
    followRef.current = null;
    followAspectRef.current = 0;
    cropRef.current = null;
    lostSinceRef.current = null;
    lastShapeRef.current = [];
    collectingRef.current = false;
    setCollecting(false);
    lineRef.current = LIVE_TEXT.loading;
    setLine(LIVE_TEXT.loading);
    setGateOk(false);
    setPressable(false);
    return () => {
      runRef.current = null;
      setSmoother(null);
    };
  }, [ready, baseline, part, baseAb, outline, stab, viewOnly, fadeQ, gQ, gen]);

  const loopOn = ready && !sent && !!camera.stream && model.ready;

  /** 안내 줄을 바꾼다 — 같은 글이면 React 가 알아서 넘기니 프레임마다 불러도 다시 그리지 않는다 */
  const say = useCallback((text: string, ok = false): void => {
    lineRef.current = text;
    setLine(text);
    setGateOk(ok);
  }, []);

  /**
   * 모은 묶음 → 비트맵 → 받는 쪽. 본 앱 `deliverBundle` 과 같다 —
   *  - 바꾸는 사이 화면을 떠났으면 아무것도 안 한다 (결과로 끌려가지 않게)
   *  - 바꾸다 실패하면(iOS 메모리 등) 카메라 · 게이트를 처음부터 다시 켠다 (멈춰 있지 않게)
   */
  const deliver = useCallback(async (b: BundleOf<HTMLCanvasElement>): Promise<void> => {
    let frames: ImageBitmap[];
    try {
      frames = await Promise.all(b.frames.map((cv) => createImageBitmap(cv)));
    } catch (e) {
      if (!aliveRef.current) return;
      log.log({ name: "error", where: "live", msg: `bitmap:${String(e).slice(0, 120)}` });
      setSent(false);
      setGen((n) => n + 1);
      return;
    }
    if (!aliveRef.current) {
      for (const f of frames) f.close?.();
      return;
    }
    onDoneRef.current?.(part, { ...b, frames });
  }, [log, part]);

  const frame = useCallback((now: number): void => {
    const el = video.current, cv = canvas.current, run = runRef.current, lmk = model.ref.current;
    if (!el || !cv || !run || !lmk) return;
    if (el.readyState < 2) return;
    const sw = el.videoWidth, sh = el.videoHeight;
    const perf = perfRef.current;
    let tp = perf ? performance.now() : 0;
    const lap = (name: string): void => { if (!perf) return; const t = performance.now(); perf.stage(name, t - tp); tp = t; };
    const res: FaceLandmarkerResult = lmk.detectForVideo(el, now);
    lap("얼굴 찾기");
    const raw = res.faceLandmarks[0];
    const lm = raw ? raw.map((p) => ({ x: p.x * sw, y: p.y * sh })) : null;
    // 확대 창: 칸 비율이 바뀌면(방향 전환) 새로 잡는다. 얼굴을 3초 넘게 잃으면 옛 자리에서 미끄러져 오지 않게 새로
    const aspect = cv.clientWidth && cv.clientHeight ? cv.clientWidth / cv.clientHeight : 3 / 4;
    if (!followRef.current || Math.abs(aspect - followAspectRef.current) > 0.01) {
      followRef.current = createCropFollow(part, aspect);
      followAspectRef.current = aspect;
    }
    const follow = followRef.current;
    // 방향을 모르면(주소 ?norotate — 개발용) null: 게이트도 확대 창도 방향으로 막지 않는다
    const screen = nowOrientation();
    if (lm && (faceRoll(lm) > ROLL_MAX || mustRotate(part, screen))) {
      // 얼굴이 누웠거나(자동 회전 꺼짐, #204) 부위에 맞지 않는 방향으로 들고 있다 — 확대하지 않고 전체를 보여 준다
      cropRef.current = null;
      follow.reset();
    } else if (lm) {
      lostSinceRef.current = null;
      cropRef.current = clampRect(stab ? follow.step(lm, now, lastShapeRef.current) : cropSpec(part, lm, aspect, lastShapeRef.current), sw, sh);
    } else {
      lostSinceRef.current ??= now;
      if (now - lostSinceRef.current > 3000) follow.reset();
    }
    const shown = cropRef.current ?? { x: 0, y: 0, w: sw, h: sh };
    // 부위 가시성은 사용자에게 보이는 창 안에서 본다
    const f: LiveFrame<HTMLCanvasElement> = { t: now, lm, w: sw, h: sh, ...(screen ? { screen } : {}), image: () => grabFrame(el), view: shown };
    // 촬영 조건(표정 · 선명 · 이마 밝기와 색)은 확인받기 묶음용 — 보기만(viewOnly) 하는 새 흐름에서는 안 잰다.
    // 원본 크기 장면의 픽셀을 장면마다 읽어서 폰에서 무거웠다 (#343). 못 잰 조건은 게이트가 건너뛴다
    if (lm && !viewOnly) {
      const bs = res.faceBlendshapes[0]?.categories;
      if (bs?.length) f.expr = Object.fromEntries(bs.map((c) => [c.categoryName, c.score]));
      f.sharpness = sharpnessOf(el, faceCropOf(lm, sw, sh));
      const fr = foreheadLabOf(el, lm, sw, sh);
      if (fr?.skin) f.lab = fr.skin;
      if (fr?.raw) f.rawLab = fr.raw;
      lap("촬영 조건");
    }
    tp = perf ? performance.now() : 0;
    const r = run.step(f);
    lap("테두리");
    lastShapeRef.current = r.outline ? [...r.outline.polys.flat(), ...r.outline.lines.flat()] : lastShapeRef.current;

    // ---------- 개발용 숫자 (DOM 에 직접 — 프레임마다 다시 그리지 않게) ----------
    const out = readoutRef.current;
    const gateDbg = gateDbgRef.current, poseCal = poseRef.current, jump = jumpRef.current;
    if (out) {
      let text: string | null = null;
      if (gateDbg && r.measure) {
        if (typeof r.measure.sharpness === "number") gateDbg.push(r.measure.sharpness);
        text = gateReadout(r.measure, r.gate, LIVE_LIMITS, gateDbg.stats());
      }
      if (poseCal && lm) text = poseCal.step(lm, res.facialTransformationMatrixes?.[0]?.data ?? null, f.expr?.["jawOpen"] ?? 0);
      // 다른 개발용 표시가 있으면 그 아래 줄로
      if (jump) { const j = jump.step(lm, now); text = text === null ? j : `${text}\n${j}`; }
      if (text !== null) out.textContent = text;
    }

    tp = perf ? performance.now() : 0;
    const vm = drawView(cv, el, shown, r.outline, wantDots && lm ? EYE_DOTS.map((i) => lm[i]!) : null, r.alpha, partColor(part));
    lap("그리기");
    if (perf && out) {
      perf.frame(now);
      const one = `${perf.text()} · 카메라 ${sw}×${sh}`;
      out.textContent = gateDbg || poseCal || jump ? `${out.textContent}\n${one}` : one;
    }
    const meter = meterRef.current;
    if (meter && out && vm && r.outline) {
      // 화면 흔들림: 영상의 고정된 한 점(가운데)이 캔버스에서 어디 찍히나 — 창이 움직이면 사진 전체가 튄다
      meter.view.push([{ x: (sw / 2 - vm.crop.x) * vm.s + vm.ox, y: (sh / 2 - vm.crop.y) * vm.s + vm.oy }]);
      // 선 떨림: 테두리를 창과 상관없이(확대 배율만) — 얼굴 위에서 선이 튀는 것
      meter.line.push([...r.outline.polys.flat(), ...r.outline.lines.flat()].map((p) => ({ x: p.x * vm.s, y: p.y * vm.s })));
      out.textContent = `화면 흔들림 ${meter.view.perFrame().toFixed(2)}px · 선 떨림 ${meter.line.perFrame().toFixed(2)}px (프레임당) · ${meter.view.count()}프레임 · 보정 ${stab ? "켬" : "끔"}`;
    }

    // ---------- 묶음 (옛 흐름) ----------
    if (r.bundle?.status === "done") {
      // 카메라를 먼저 끈다 — 비트맵으로 바꾸는 동안 켜져 있을 이유가 없다
      setSent(true);
      void deliver(r.bundle.bundle);
      return;
    }
    if (r.bundle?.status === "failed") {
      collectingRef.current = false;
      setCollecting(false);
      say(LIVE_TEXT.failed);
      if (!viewOnly) setPressable(false);
      return;
    }
    if (collectingRef.current) return;
    // 묶음을 모으는 동안은 세지 않는다 — 얼굴 놓침도 막힘도 (#170 리뷰)
    eventsRef.current?.face(!!lm, now);
    eventsRef.current?.gate(r.gate.ok ? null : r.gate.firstFail, now);
    // 실패 문구는 다시 누를 수 있을 때까지 그대로 둔다 — 게이트 문구가 바로 덮으면 왜 안 찍혔는지 못 본다
    if (lineRef.current === LIVE_TEXT.failed && !r.pressable) return;
    say(r.gate.text, r.gate.ok);
    // 각도 · 안정에 3초 넘게 막히면 문구는 안내 그대로 두고 버튼만 켠다 — 판단은 채점에 (#235)
    if (!viewOnly) setPressable(r.pressable);
  }, [deliver, model.ref, part, say, stab, viewOnly, wantDots]);

  useFrameLoop({
    video,
    on: loopOn,
    onFrame: frame,
    // 한 프레임이 터져도 루프는 계속 돈다 — 한 번의 추론 실패로 가이드가 멈추면 아무것도 안 보인다
    onError: (e) => log.log({ name: "error", where: "live", msg: `frame:${String(e).slice(0, 120)}` }),
  });

  // 홈으로 나갔다 오면 카메라가 꺼져 있다 → 숨은 동안 끄고(다른 앱이 쓰게) 돌아오면 처음부터 다시 켠다
  useEffect(() => {
    return bindVisibility(document, {
      onHidden: () => setHidden(true),
      onVisible: () => {
        setHidden(false);
        setGen((n) => n + 1);
      },
    });
  }, []);

  // 카메라를 못 열었으면 기록만 남긴다. **보이는 글은 아래에서 그릴 때 고른다** —
  // 효과에서 상태를 바꾸면 한 번 더 그리게 되고, 그 사이 한 프레임 동안 옛 글이 보인다
  useEffect(() => {
    if (camera.error === null) return;
    log.log({ name: "error", where: "live", msg: `camera:${String(camera.error).slice(0, 120)}` });
  }, [camera.error, log]);

  const back = onBack && (
    <button type="button" className="go ghost" onClick={() => {
      log.log({ name: "button", button: "live_back" });
      onBack();
    }}>
      {LIVE_TEXT.back}
    </button>
  );

  // ---------- 기준이 없을 때 (본 앱과 같은 자리) ----------
  if (!ready) {
    return (
      <section className="screen live">
        <p className="sub">{LIVE_TEXT.noBaseline}</p>
        <div className="row">
          {back}
          {onToCapture && (
            <button type="button" className="go" onClick={onToCapture}>
              {LIVE_TEXT.toCapture}
            </button>
          )}
        </div>
      </section>
    );
  }

  const showReadout = wantJitter || wantPose || wantGate || wantJump || wantPerf;
  // 보이는 한 줄 — 카메라를 못 열었으면 그 말이 먼저고, 묶음을 모으는 동안은 "그대로 있어 주세요",
  // 아니면 게이트가 준 안내다 (본 앱과 같은 우선순위)
  const text = camera.error !== null ? LIVE_TEXT.cameraFail : collecting ? LIVE_TEXT.capturing : line;

  return (
    <section className="screen live">
      <p className="capture-title">{LIVE_TEXT.title}</p>

      <div className="cam live-cam">
        {/* 영상은 숨겨 두고(재생은 계속) 확대 창만 캔버스에 그린다 */}
        <video className="live-src" ref={video} playsInline muted autoPlay />
        <canvas className="live-view" ref={canvas} />
        {/* 지금 보이는 모양은 정답사진의 화장이 아니라 견본이다 (#334) */}
        {!outline && <span className="live-sample">{LIVE_TEXT.sample}</span>}
        {showReadout && (
          <p
            className="live-jitter"
            ref={readoutRef}
            onClick={() => {
              meterRef.current?.view.reset();
              meterRef.current?.line.reset();
              poseRef.current?.reset();
              jumpRef.current?.reset();
            }}
          />
        )}
      </div>

      {/* 조건 한 줄 — 본 앱은 이 줄을 숨겼지만(.live .cam-gate) 이 버전은 보여 준다 (#344, camera.css 와 같은 까닭) */}
      <p className={gateOk && camera.error === null ? "cam-gate ready" : "cam-gate"} role="status">
        {text}
      </p>

      {/* 개발용 ?tune: 테두리 떨림 필터 값을 폰에서 맞춘다 — 2-b 와 같은 슬라이더 (#235 · #244) */}
      {wantTune && smoother && <SmoothTune sm={smoother} start={LIVE_SMOOTH} />}

      <div className="row">
        {viewOnly ? (
          back
        ) : (
          <button
            type="button"
            className="go live-btn"
            disabled={!pressable || collecting}
            onClick={() => {
              log.log({ name: "button", button: "live_check" });
              if (!runRef.current?.press()) return;
              collectingRef.current = true;
              setCollecting(true);
              setPressable(false);
            }}
          >
            {LIVE_TEXT.button}
          </button>
        )}
      </div>
    </section>
  );
}
