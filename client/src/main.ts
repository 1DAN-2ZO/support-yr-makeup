/**
 * 진입점 — 껍데기를 세우고 각 모듈의 화면을 등록한다.
 *
 * 각 모듈이 자기 화면을 올리면 여기 `registerAll()` 에 한 줄씩 추가된다.
 *
 * 세션 draft (①, 1-11 · F-07): 세션이 바뀔 때마다 `set()` 이 IndexedDB 에 저장하고, 켤 때 `restore()` 가 되살린다.
 * 사진·랜드마크는 draft 에 없다 — 기준 랜드마크는 쌩얼 사진에서 다시 찾는다 (core/restore.ts).
 */

import { createLogger } from "./core/log";
import { createCaptureEvents, type CaptureEvents } from "./core/capture-events";
import { createMadePictures, type MadeKey } from "./core/made-pictures";
import { planRestore, rebuildBaseline, toCapture } from "./core/restore";
import { createLogStore } from "./core/log-store";
import { createEventSender } from "./core/event-sender";
import { emptyJobSource } from "./core/look-jobs";
import {
  applyResult,
  applySkip,
  createSession,
  nextPart,
  setCurrentPart,
  setScreen,
  stripImages,
  toReviewParts,
  type ScreenId,
  type Session,
  withBaseline,
} from "./core/flow";
import { planGuide } from "./core/personal-guide";
import { LIGHTING_NOTE, lightingDiffers } from "./core/review";
import { nowOrientation } from "./core/orientation-lock";
import { standardPlan, type PersonalPlan } from "./core/personalize";
import type { CaptureBundle } from "./core/types";
import { checkSecureContext, readEnv, type SecureCheck } from "./core/secure-context";
import { createSessionStore, indexedDbBackend, memoryBackend, type SessionStore } from "./core/session-store";
import { getVersions } from "./core/versions";
import { lookById, SUMMARY_TEMPLATE } from "./core/looks";
import { captureScreen, type CaptureDeps, type ShotData } from "./screens/capture";
import { consentScreen, deniedScreen, type ConsentDeps } from "./screens/consent";
import { doneScreen, type DoneDeps } from "./screens/done";
import { landmarksFromImage } from "./screens/landmarker";
import { createHairMasker, maskOfImage } from "./screens/hair-segmenter";
import { guideScreen, type GuideDeps } from "./screens/guide";
import { liveScreen, type LiveDeps } from "./screens/live";
import { fullRenderScreen, type FullRenderDeps } from "./screens/fullrender";
import { looksScreen, type LooksDeps } from "./screens/looks";
import { processingScreen, type ProcessingDeps } from "./screens/processing";
import { resultScreen, type ResultDeps } from "./screens/result";
import { reviewScreen, type ReviewDeps } from "./screens/review";
import { startReviewShot } from "./screens/review-shot";
import { createShell } from "./screens/shell";
import { attemptScreen, type AttemptShots } from "./screens/attempt";
import { createPictureMaker, type MakeResult } from "./core/picture-maker";
import { requestTransfer } from "./core/transfer-client";
import { within } from "./core/wait-limit";
import { prepareSave, type SaveKit, type SaveSource } from "./screens/feedback-card";
import { loadFeedback, type AnswerPhoto, type FeedbackLoad } from "./screens/feedback-source";
import { createGuideKeeper, liveOutlineOf, loadPartGuide } from "./screens/guide-source";
import { analyzeRefPhoto } from "./screens/ref-analyze";
import { shrinkForUpload } from "./screens/answer-make";
import { noteOfFeedback, noteOfGuide, noteOfMake, noteOfRef, noteOfSave, noteOfShrink } from "./screens/task-notes";
import { timeTask } from "./core/task-timer";
import { createKeeper, keepAttempt } from "./core/keep-client";
import { feedbackSlot, partGuideSlot, saveSlot, slotScreen, type PartGuideSlotDeps, type SaveSlotDeps, type SlotDeps } from "./screens/flow-slots";
import { inNewFlow } from "./core/screens";

/** 후기 설문 (구글 폼). 끝내기를 누르면 모달로 묻고, 끝 화면에도 한 번 더 둔다 */
const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeSt5w2auBc_CW-ScpC5bq9TQs3SO1YsFIlT7REj1hlRmgi6g/viewform";

/** 카메라를 못 여는 환경이면 맨 위에 띄운다. 흐름은 막지 않는다 */
function showWarning(c: SecureCheck): void {
  const box = document.createElement("div");
  box.className = "warn";
  const p = document.createElement("p");
  p.textContent = c.message;
  const small = document.createElement("p");
  small.className = "warn-hint";
  small.textContent = c.hint;
  box.append(p, small);
  el("app").prepend(box);
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} 가 없습니다`);
  return found;
}

/**
 * 앱이 시작하다 실패했을 때. 그냥 두면 사용자가 **빈 화면**을 본다 —
 * 무엇이 잘못됐는지도, 무엇을 해야 하는지도 모른다.
 */
function showBootError(e: unknown): void {
  console.error(e);
  const root = el("screen");
  root.textContent = "";
  const box = document.createElement("div");
  box.className = "unavailable";
  const h = document.createElement("h1");
  h.textContent = "앱을 다시 열어 주세요";
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = "초기 화면을 불러오지 못했어요. 새로고침하면 다시 시작합니다.";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "primary";
  again.textContent = "새로고침";
  again.addEventListener("click", () => location.reload());
  box.append(h, p, again);
  root.append(box);
}

/** 앱 첫 진입 스플래시를 닫는 함수. 세션 화면이 아니라 부팅 중에만 보인다 (최소 3초) */
let closeBootSplash: (() => Promise<void>) | null = null;

function showSplash(): () => Promise<void> {
  const started = performance.now();
  let closed = false;
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.setAttribute("aria-label", "nudy");
  splash.innerHTML = `
    <div class="splash-frame">
      <img src="/ui/nudy-splash.png" alt="" aria-hidden="true" />
    </div>
  `;
  document.body.append(splash);

  return async () => {
    if (closed) return;
    closed = true;
    const rest = Math.max(0, 3000 - (performance.now() - started));
    await new Promise((resolve) => window.setTimeout(resolve, rest));
    splash.classList.add("leaving");
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    splash.remove();
  };
}

async function boot(): Promise<void> {
  closeBootSplash = showSplash();
  let session: Session = createSession();

  // 로그는 세션과 같은 IndexedDB 를 쓴다 — DB 를 두 벌 만들지 않는다.
  // 끝내기(sessionStore.clearAll)가 키를 전부 지우므로 로그도 같이 지워진다 (F-11).
  const sessionStore = await createSessionStore();
  const backend = (await indexedDbBackend()) ?? memoryBackend();
  const logStore = await createLogStore({ backend });
  const sid = crypto.randomUUID();

  // 사용 기록 보내기 (PR #317). 서버는 같은 주소에 있다 — 주소를 따로 주면 그것을 쓴다.
  // 화면에 들어올 때마다 보낸다: 서버가 이탈 위치를 "마지막 screen_enter" 로 보고,
  // "나갔다" 신호는 폰에서 안 올 때가 많기 때문이다.
  const sender = createEventSender({
    // 같은 주소의 /events 로 보낸다 (PR #317 규격 그대로).
    // 바깥에서 백엔드 포트(8000)는 안 열려 있어서, 프론트 nginx 가 그 경로를
    // 백엔드로 넘겨 준다 (client/nginx.conf)
    base: (import.meta.env.VITE_EVENTS_BASE as string | undefined) ?? "",
    // 동의하기 전에는 보내지 않는다. 그동안은 기기 안에만 쌓인다
    enabled: () => session.consent === true,
  });
  // 테스트 기간 사진 보관 (2026-10-09 결정) — 참고 사진을 뺀 사진과 피드백 결과를 서버에 7일 둔다 (server/app/keep.py).
  // 서버가 켜져 있을 때만(GET /keep 200), 동의한 뒤에만 보낸다. 평소(서버 설정이 없을 때)에는 아무것도 안 올라간다.
  // 세션 번호(sid)가 지워 달라는 요청의 열쇠다
  const keeper = createKeeper({
    sid,
    enabled: () => session.consent === true,
    base: (import.meta.env.VITE_KEEP_BASE as string | undefined) ?? "",
  });
  const log = createLogger(
    { sid, screen: session.screen, part: session.currentPart, ver: getVersions() },
    (line, ev) => {
      logStore.sink(line, ev);
      sender.add(ev);
      // 화면에 들어왔을 때 · 세션이 끝날 때만 실제로 보낸다 (매 줄 보내면 요청이 너무 잦다)
      if (ev.name === "screen_enter" || ev.name === "session_end") void sender.send();
    },
  );
  // [옛 흐름 · 지금 안 씀] 머리카락 분할은 옛 화면(2-b · 3 · 5) 설정에만 넘긴다 — client/OLD-FLOW.md. 모델은 그 화면에 들어갈 때 받으니 지금은 받지 않는다.
  // 속눈썹 그림(screens/lash-assets loadLashes)을 앱을 켤 때 미리 받던 것은 뺐다 (2026-10-11) — 그리는 화면이 옛 흐름뿐이라 쓰이지 않는 내려받기(168KB · 요청 5번)였다.
  // 옛 화면을 되살리면 그 화면에 들어가기 전에 loadLashes() 를 다시 불러야 마스카라가 그려진다 (안 부르면 마스카라만 빠진다)
  // 머리카락 분할 (screens/hair-segmenter) — 화면 5 채점용. 실패는 로그에 한 번 남기고 마스크 없이 간다
  const hairMask = createHairMasker(undefined, (e) => log.log({ name: "error", where: "hair", msg: (e instanceof Error ? e.message : String(e)).slice(0, 120) }));
  const events = createCaptureEvents(log);

  // 세션을 바꾸는 곳은 전부 여기로 — 바뀔 때마다 draft 저장 (앱이 꺼져도 돌아오게, F-07)
  // 동의 전·거부·끝은 저장하지 않는다: 되살릴 게 없고, 끝내기(clearAll) 뒤에 키가 다시 생기면 안 된다 (F-11)
  let saving: Promise<void> = Promise.resolve();
  const set = (next: Session): void => {
    session = next;
    if (NO_DRAFT.includes(session.screen)) return;
    const draft = stripImages(session);
    saving = saving.then(() => sessionStore.saveDraft(draft)).catch(() => {});
  };

  // 복원 중에는 모델을 받느라 몇 초 걸린다 — 스플래시가 부팅이 끝날 때까지 떠서 그 기다림을 가린다 (closeBootSplash)
  session = await restore(sessionStore, events, session);
  // 만든 그림(정답사진 · 옮긴 그림)도 폰 저장소에서 되살린다 — 다시 켤 때마다 15초씩 다시 만들지 않게 (#331).
  // 세션이 만료됐으면 저장소가 사진을 같이 지웠으니 빈 채로 돌아온다
  const made = createMadePictures(sessionStore);
  await made.restore();
  /** 만든 그림을 넣거나 지운다 — draft 저장과 같은 줄에 세워 끝내기(clearAll)가 끝난 뒤에 써지지 않게 */
  const putMade = (key: MadeKey, picture: Blob | null): Promise<void> => {
    const done = saving.then(() => made.set(key, picture));
    saving = done.catch(() => {});
    return done;
  };
  // 새 흐름(2026-10-06)에서 빠진 화면에 멈춘 세션은 가까운 새 화면으로 (화장 선택 · 2-b · 부위 화면 · 리뷰 → screens.inNewFlow)
  if (inNewFlow(session.screen) !== session.screen) session = setScreen(session, inNewFlow(session.screen));

  const shell = createShell<Session>({
    root: el("screen"),
    chipsRoot: el("chips"),
    hintRoot: el("hint"),
    log,
    getSession: () => session,
    read: (s) => ({ screen: s.screen, currentPart: s.currentPart, parts: s.parts }),
    setScreen: (to: ScreenId) => {
      set(setScreen(session, to));
    },
    setPart: (p) => {
      set(setCurrentPart(session, p));
    },
    // 화면 3·4·5 와 같은 것 — 주소 ?norotate(개발용)면 방향 안내도 안 띄운다
    orientation: nowOrientation,
  });

  // 카메라가 열릴 수 있는 곳인지 먼저 알려 준다. 안 그러면 "왜 안 되지"로 한참 헤맨다
  const secure = checkSecureContext(readEnv());
  if (!secure.ok) {
    showWarning(secure);
    log.log({ name: "error", where: "boot", msg: `secure_context:${secure.reason}` });
  }

  // 화장 계획 — 모두에게 같은 표준 계획 (2026-10-05 결정, personalize.standardPlan).
  // 얼굴에 맞추는 일(자리 · 크기)은 얼굴 점이 한다. 얼굴을 재서 모양을 바꾸던 규칙 · VLM 은 앱에서 뗐다 — 코드는 남아 있다
  // (core/vlm-flow · vlm-client · plan-queue · personalize.resolvePlan, 실험 eval/vlm). VLM 서버가 없어도 앱은 돈다
  const planFor = (): PersonalPlan => standardPlan(session.baseline?.faceShape ?? null);

  // 가이드 모양 한 곳 — 화면 3 테두리 · 화면 4 테두리 · 화면 5 채점이 같은 것을 쓴다 ("따라 그린 선 = 채점 기준").
  // 2-b AR 에서 본 모양과 같은 표준 계획
  const guideFor = () => planGuide(lookById(session.lookId).parts, planFor());

  // 끝내기가 지우고 남은 키 수. 0 이어야 한다 (F-11)
  let clearRemaining = 0;

  // 끝내기 — 폰에 남은 사진 · 기록을 다 지운다 (F-11). 새 흐름 7 저장 · 공유와 옛 흐름 리뷰가 같이 쓴다
  const clearAll = async (): Promise<Awaited<ReturnType<SessionStore["clearAll"]>>> => {
    // 만드는 중인 그림은 버린다 — 서버 답이 지운 뒤에 도착해 얼굴 그림이 폰에 다시 써지지 않게 (#352 리뷰)
    maker.cancel();
    await saving;   // 저장 중인 draft·쌩얼이 지운 뒤에 써지지 않게
    // 로그 저장소를 먼저 닫는다 — 안 닫으면 버퍼·시간 저장이 지운 뒤에 events 키를 다시 만든다
    await logStore.clear();
    sender.stop();
    const r = await sessionStore.clearAll();
    clearRemaining = r.remaining;
    return r;
  };

  // 세션을 통째로 새로 만든다 — 앞 세션 값이 하나도 안 남게. clearAll(저장소 지우기) 뒤에 부른다:
  // 끝내기는 "끝" 화면의 "다시 시작" 이, 로고의 "지우고 다시 시작" 은 startOver 가
  const restartSession = (): void => {
    logStore.reopen();
    attempt = null;
    movedJob = null;
    judged = null;
    maker.cancel();
    // 저장소는 이미 지웠다 — 메모리에 들고 있던 것도 버린다
    saving = saving.then(() => made.clear()).catch(() => {});
    set(createSession());
    clearRemaining = 0;
    shell.render();
  };
  // 로고의 "지우고 다시 시작" (#404) — 끝내기와 달리 "끝" 화면을 안 거치므로 지우기와 새 세션을 한 번에 한다.
  // 지우다 실패해도 새 세션으로는 바꾼다 (앞 세션의 얼굴 사진을 메모리에 든 채로 처음 화면에 서지 않게)
  const startOver = async (): Promise<void> => {
    try { await clearAll(); } finally { restartSession(); }
  };

  // 5 시도사진 (⑥) — 화장을 다 한 뒤 정면 눈 뜬 장. 6 피드백(③)이 getAttempt 로 받아 쓴다.
  // 메모리에만 둔다 — 앱을 다시 켜면 다시 찍는다 (저장소 사진 키는 ① 의 session-store 라 아직 안 늘렸다)
  let attempt: AttemptShots | null = null;
  /** 지금 시도사진으로 만드는 중이거나 만든 옮긴 그림 — 시도사진을 다시 찍으면 새로 시작한다 */
  let movedJob: Promise<MakeResult> | null = null;
  const getAttempt = (): AttemptShots | null => attempt;
  shell.register("attempt", attemptScreen<Session>({
    setAttempt: (shots) => {
      attempt = shots;
      judged = null;
      // 테스트 기간 보관 (서버가 켜져 있을 때만 — core/keep-client)
      keepAttempt(keeper, shots.front_open.map((s) => s.blob));
      // 옛 시도사진으로 만든 옮긴 그림은 못 쓴다 — 만드는 중이던 것도 버린다
      maker.cancel("moved");
      void putMade("moved", null);
      // 옮긴 그림을 뒤에서 만들기 시작한다 — 피드백 화면(getFeedback)이 이것을 기다린다. 화면에 보여 주지 않고 라이너 계산에만 쓴다
      movedJob = makeMoved();
      movedJob.catch(() => {});   // 실패는 getMoved 가 받는다 — 피드백 화면에 가기 전에 끝난 실패가 경고로 새지 않게
    },
    next: "feedback",
  }));

  // 3 정답사진 — 화면 3(정답사진 만들기 연결)이 setAnswer 로 넣는다. 맨얼굴과 같은 크기 · 같은 자리여야 한다
  // (docs/feedback-input-contract.md). 폰 세션 저장소에 둔다 (core/made-pictures) — 새로고침해도 남고, 끝내기 · 만료 때 지워진다
  /** 마지막으로 판정한 것 — 화면 7 이 결과 한 장을 만든다. 시도사진을 다시 찍으면 비운다 */
  let judged: SaveSource | null = null;
  const getAnswer = (): AnswerPhoto | null => { const image = made.get("answer"); return image ? { image } : null; };
  const setAnswer = (a: AnswerPhoto | null): Promise<void> => { judged = null; return putMade("answer", a?.image ?? null); };

  // 6 피드백 재료 (⑥ 연결, #332) — 화면(⑤)은 getFeedback 이 준 것(문장 · 사진 두 장)을 그리기만 한다.
  /**
   * 옮긴 그림을 기다리는 한도 — 시도사진을 찍을 때부터 만들고 있으니 보통은 이미 와 있다 (서버가 한 장에 12~20초).
   * 서버가 밀릴 때(한 장에 100초 넘게 걸린 일이 있다)는 이만큼만 기다리고 라이너 없이 보여 준다
   */
  const MOVED_WAIT_MS = 40_000;
  // 옮긴 그림(getMoved)도 넣는다 — 라이너 줄이 이것으로 나온다 (③ 의 라이너 재기 수정 #392 · #394 뒤, #376).
  // 시도사진을 찍을 때 시작해 둔 것(movedJob)을 기다린다. MOVED_WAIT_MS 를 넘기거나 실패하면 던진다 →
  // loadFeedback 이 라이너만 "이번에는 볼 수 없었어요" 로 두고 나머지 부위는 그대로 보여 준다 (docs/feedback-input-contract.md)
  const getMoved = async (): Promise<Blob | null> => {
    if (!movedJob) throw new Error("moved: not started");
    const r = await within(movedJob, MOVED_WAIT_MS, null);
    if (!r?.ok) throw new Error(`moved: ${r ? r.why : "late"}`);
    return r.picture;
  };
  const getFeedback = async (): Promise<FeedbackLoad> => {
    // 걸린 시간을 사용 기록에 남긴다 (task feedback_run — core/task-timer)
    const r = await timeTask(log, "feedback_run", () => loadFeedback({ getBaseline: () => session.baseline, getAttempt, getAnswer, getMoved }), noteOfFeedback);
    judged = r.ok ? { feedback: r.view.feedback, answer: r.view.answer, attempt: r.view.attempt } : null;
    // 테스트 기간 보관 — 판정 결과(글)도 같이 둔다. 사진과 견줘 기준값을 맞추려면 그때 무엇이라고 말했는지가 필요하다
    if (r.ok) keeper.keepFeedback(r.view.feedback);
    return r;
  };

  // 4 부위 가이드 재료 (⑥ 잇기) — 정답사진을 부위로 자를 자리 · 가이드 테두리 (screens/guide-source → core/guide-run, 계산은 ② 것).
  // 화면은 getGuide 가 준 것을 그리기만 한다. 한 번 만든 것은 정답사진이 바뀔 때까지 들고 있는다 — 부위를 넘길 때마다 다시 만들지 않게.
  // 정답사진이 바뀌거나 없어지면(끝내기 · 맨얼굴 다시 찍기 → made 칸이 비워짐) 다음에 부를 때 스스로 놓는다
  // 만드는 데 걸린 시간을 사용 기록에 남긴다 (task guide_build) — 보관해 둔 것을 다시 줄 때는 남지 않는다 (만든 때만)
  const guides = createGuideKeeper({ getBaseline: () => session.baseline, getAnswer }, (d) => timeTask(log, "guide_build", () => loadPartGuide(d), noteOfGuide));
  const getGuide = guides.get;

  // 그림 만들기 (⑥ 백 연결) — 백엔드 POST /transfer → GPU 의 FLUX 서버 (server/app/flux.py). 받은 그림은 폰 저장소 칸에 넣는다.
  //   makeAnswer(참고 사진): 화면 3 이 부른다 → 정답사진.  makeMoved(): 시도사진을 찍은 뒤 → 옮긴 그림 (계산에만 쓴다. 화면에 안 보여 준다)
  // 화면(⑤)은 결과의 ok · why 만 보고 그린다. 서버 주소(DHE_FLUX_URL)를 넣기 전에는 why: "off" 로 돌아온다
  const maker = createPictureMaker({
    getBare: async () => {
      const held = session.baseline?.bareImage;
      if (held instanceof Blob) return held;
      const saved = await sessionStore.loadImage("bare").catch(() => null);
      return saved instanceof Blob ? saved : saved ? new Blob([saved]) : null;
    },
    getAttempt: () => attempt?.front_open[0]?.blob ?? null,
    put: (key, picture) => {
      if (key === "answer") judged = null;
      // 테스트 기간 보관 — 정답사진 · 옮긴 그림. 참고 사진은 보내지 않는다 (보낼 이름이 없다)
      keeper.keep(key, picture);
      return putMade(key, picture);
    },
    request: (bare, ref) => requestTransfer(bare, ref, { base: (import.meta.env.VITE_TRANSFER_BASE as string | undefined) ?? "" }),
  });
  // 누른 뒤 받을 때까지 걸린 시간을 사용 기록에 남긴다 (task answer_make · moved_make) — 서버가 나눠 알려 준 시간(줄 · FLUX)도 같이
  const makeAnswer = (ref: Blob): Promise<MakeResult> => timeTask(log, "answer_make", () => maker.makeAnswer(ref), noteOfMake);
  const makeMoved = (): Promise<MakeResult> => timeTask(log, "moved_make", () => maker.makeMoved(), noteOfMake);

  // 7 저장 · 공유 재료 (⑥ 연결) — 마지막으로 본 피드백으로 결과 한 장을 미리 만들어 둔다. 화면(⑤)은 kit.save() 를 버튼에 걸기만 한다.
  // 저장할 판정이 없으면 null (피드백을 안 거쳤거나 "다시 찍어 주세요" 로 끝났을 때). 폰에만 내보낸다 — 서버로는 안 보낸다
  // 저장할 판정이 있을 때만 만드는 시간을 남긴다 (task save_card) — 없을 때는 만들지 않으니 잴 것이 없다
  const getSave = (): Promise<SaveKit | null> => (judged ? timeTask(log, "save_card", () => prepareSave(judged), noteOfSave) : prepareSave(null));

  // 개발할 때만: 정답사진 만들기가 붙기 전에도 화면 6 을 돌려 볼 수 있게 콘솔에서 넣는 길 (배포 빌드에는 없다)
  //   __nudyDev.setAnswer(blob)  ·  await __nudyDev.getFeedback()  ·  (await __nudyDev.getSave())?.save()
  //   await __nudyDev.makeAnswer(참고사진Blob)  ·  await __nudyDev.makeMoved()
  if (import.meta.env.DEV) (window as unknown as { __nudyDev?: unknown }).__nudyDev = { setAnswer: (image: Blob) => setAnswer({ image }), getFeedback, getSave, makeAnswer, makeMoved };

  // 새 흐름 뼈대 (2026-10-06) — 담당이 진짜 화면을 올리면 여기 등록만 바꾼다 (screens/flow-slots.ts)
  // 후기 설문 주소. 공개 구글 폼이라 숨길 것이 아니어서 기본값을 코드에 둔다 —
  // 그래야 배포 빌드에 따로 값을 넣지 않아도 뜬다. VITE_SURVEY_URL 로 덮어쓸 수 있다.
  // 빈 문자열을 주면(VITE_SURVEY_URL=) 설문을 끌 수 있다
  const surveyUrl = (import.meta.env.VITE_SURVEY_URL as string | undefined) ?? SURVEY_URL;
  // 참고 사진 읽기 · 줄이기 시간 (task ref_analyze · ref_shrink) — 화면 코드는 그대로 두고 넘기는 함수만 감싼다
  const analyzeRef = (file: File) => timeTask(log, "ref_analyze", () => analyzeRefPhoto(file), noteOfRef);
  const shrinkRef = (photo: Blob) => timeTask(log, "ref_shrink", () => shrinkForUpload(photo), noteOfShrink);
  registerFlowSlots(shell, { getPart: () => session.currentPart, getGuide, analyzeRef, shrinkRef, clearAll, startOver, surveyUrl, getAttempt, getAnswer, getFeedback, getSave, makeAnswer, makeMoved, making: maker.busy });

  registerAll(
    shell,
    {
      setConsent: (ok) => set({ ...session, consent: ok }),
      onConsent: (ok) => events.consent(ok),
    },
    {
      getShots: () => session.shots,
      setShot: (id, data) => {
        const shots = { ...session.shots };
        if (data) shots[id] = data;
        else delete shots[id];
        set({ ...session, shots });
      },
      getBaseline: () => session.baseline,
      setBaseline: (b) => {
        // 세션에 남아 있던 옛 계획(#181)은 withBaseline 이 비운다 — 앱은 이제 그 계획을 읽지 않는다
        set(withBaseline(session, b));
        // 맨얼굴이 바뀌면 만든 그림은 못 쓴다 — 옛 맨얼굴에 겹치던 그림이다. 만드는 중이던 것도 버린다
        judged = null;
        maker.cancel();
        saving = saving.then(() => made.clear()).catch(() => {});
      },
      // 쌩얼 저장도 draft 와 같은 줄에 세운다 — 끝내기(clearAll)가 인코딩·저장이 끝날 때까지 기다린다 (#162 리뷰)
      saveBare: (blob) => {
        const done = saving.then(() => blob).then((b) => {
          // 테스트 기간 보관 — 맨얼굴 눈 뜬 장 (서버가 켜져 있고 동의했을 때만)
          keeper.keep("bare", b);
          return sessionStore.saveImage("bare", b);
        });
        saving = done.catch(() => {});
        return done;
      },
      setFaceShapeFrames: (frames) => set({ ...session, faceShapeFrames: frames }),
      events,
      // 새 흐름 (2026-10-06): 맨얼굴 사진 다음은 참고 사진 · 정답사진
      next: "answer",
    },
    // [옛 흐름 · 지금 안 씀] 화면 2 화장 고르기 · 2-b AR (looks · fullrender) 의 설정
    {
      getLookId: () => session.lookId,
      setLookId: (lookId: string) => {
        set({ ...session, lookId });
      },
      getPlan: () => planFor(),
      // 2-b AR 도 앞머리 위엔 보정·화장 안 함 — 화면 3·5 와 같은 분할기 (#173)
      hairMask,
    },
    // [옛 흐름 · 지금 안 씀] 화면 6 전체 리뷰 (review) 의 설정 — 새 흐름의 피드백은 아래 registerFlowSlots 의 feedback
    {
      getParts: () => toReviewParts(session),
      getLookName: () => lookById(session.lookId).name,
      // 조명 차 안내 (#79): 리뷰에 들어오며 찍은 "지금" 사진의 이마 L* 를 맨얼굴 기준과 견준다 (8 이상 차이면 한 줄)
      lightingNote: (nowL) => {
        const b = session.baseline;
        return b && typeof nowL === "number" && lightingDiffers(b, { foreheadL: nowL }) ? LIGHTING_NOTE : null;
      },
      shoot: (host, done) => startReviewShot(host, done, log),
      store: {
        loadImage: (k) => sessionStore.loadImage(k),
        saveImage: (k, b) => sessionStore.saveImage(k, b),
        clearAll,
      },
      // 합산 설정은 전 룩 공통이다 (결정 2026-09-22). 값은 rules/looks.json
      template: SUMMARY_TEMPLATE,
    },
    // [옛 흐름 · 지금 안 씀] 화면 5 부위 결과 (result) 의 설정
    {
      getPart: () => session.currentPart,
      getBaseline: () => session.baseline,
      // 화면 4(②) 가 확인받기 순간의 프레임 묶음을 parts[].captured 에 둔다 (CaptureBundle)
      getCapture: (part) => (session.parts.find((p) => p.partId === part)?.captured as CaptureBundle | null) ?? null,
      // 화면 3·4 테두리와 같은 계획 가이드로 채점한다 (2-b AR 에서 본 모양과 같은 기준)
      guide: guideFor,
      // 화장 색이 피부와 가까우면(뉴트럴 라이너) 확인만(subtle) — 쉐딩은 룩이 아니라 얼굴형에서 와서 색이 없다
      templateColor: (part) => (part === "contour" ? null : lookById(session.lookId).parts[part]?.color ?? null),
      getStatus: (part) => session.parts.find((p) => p.partId === part)?.status ?? "in_progress",
      apply: (part, outcome) => {
        set(applyResult(session, part, outcome));
      },
      skip: (part) => {
        set(applySkip(session, part));
      },
      nextPart: (after) => nextPart(session, after),
      // 앞머리·옆머리 칸을 채점에서 뺀다 (#201). 모델은 화면 5 에 처음 들어갈 때 한 번 — 못 불러오면 전처럼 채점
      hairMask,
      // 개발용: 주소에 ?tune 이면 판정 근거 숫자 (밝기 차 등)
      tune: new URLSearchParams(location.search).has("tune"),
      // ?tune "채점 사진 저장" 에 같이 — PC 에서 같은 가이드로 재현하려고
      tuneInfo: () => ({ lookId: session.lookId, plan: planFor(), ver: getVersions() }),
    },
    // [옛 흐름 · 지금 안 씀] 서버 처리 화면 (processing) 의 설정
    // 서버 처리 화면은 흐름에서 빠졌다 (등록만 남김 — 되살린 세션은 위에서 화장 선택으로 보낸다)
    { jobs: emptyJobSource() },
    // [옛 흐름 · 지금 안 씀] 화면 3 부위 완성본 (guide) 의 설정 — 새 흐름의 부위 가이드는 registerFlowSlots 의 partguide
    {
      getPart: () => session.currentPart,
      firstPart: () => nextPart(session, null),
      getBaseline: () => session.baseline,
      getLook: () => lookById(session.lookId),
      getFaceShape: () => session.faceShape,
      // 화면 3 완성본(#192) = 쌩얼 정면 + 같은 표준 계획 화장. 원본은 메모리에만 있어 앱을 다시 켜면 저장한 쌩얼
      getPlan: () => planFor(),
      getBareSource: () => (session.shots.front_open as ShotData | undefined)?.cv ?? null,
      // 앞머리 위엔 화장·보정을 안 한다 — 화면 5 채점과 같은 분할기 (#173 셰이더, ⑥)
      getHairMask: (d) => maskOfImage(hairMask, d.img, d.w, d.h),
      getGuide: guideFor,
    },
    // 화면 4 실시간 가이드 (live) — 지금 흐름의 화면이다: 부위 가이드의 "실시간 가이드로 보기" 가 연다. 보기만 하고 "이전" 으로 돌아간다 (#334).
    // 그리는 테두리는 부위 가이드(사진)와 같은 것 — 예상 메이크업에서 뽑은 그 부위 모양을 카메라 속 얼굴에 붙인다 (getOutline)
    {
      getPart: () => session.currentPart,
      getBaseline: () => session.baseline,
      // 정면 장의 이마 a*·b* 는 메모리에만 있다 (복원하면 없음 → 색 조건 생략)
      getBaseAb: () => {
        const f = (session.shots.front_open as ShotData | undefined)?.forehead;
        return f ? { a: f.a, b: f.b } : null;
      },
      getLookParts: () => lookById(session.lookId).parts,
      // 맨얼굴 정면 때 표정 — ① 이 촬영·복원 때 Baseline 에 채운다 (#177). 없으면 화면 4 가 표정 조건을 건너뛴다
      getBaseExpr: () => session.baseline?.expression ?? null,
      // 예상 메이크업에서 뽑은 그 부위 테두리 — 부위 가이드가 만들어 둔 것을 꺼내 쓴다 (기다리지 않는다).
      // 아직 못 만들었거나 그 부위의 화장이 없으면 null → 화면이 아래의 옛 표준 틀(getGuide)을 "예시" 로 그린다
      getOutline: (part) => {
        const view = guides.peek(), b = session.baseline;
        return view && b ? liveOutlineOf(view, part, b) : null;
      },
      getGuide: guideFor,
      setCapture: (part, bundle) => {
        set({ ...session, parts: session.parts.map((p) => (p.partId === part ? { ...p, captured: bundle } : p)) });
      },
      // [옛 흐름 · 지금 안 씀] 묶음을 모아 채점(result)으로 넘어가던 길 — 아래 back 이 있는 동안 쓰이지 않는다
      next: "result",
      // 새 흐름(#334): 실시간 가이드는 보기만 한다 — 버튼이 "이전" 이 되어 부위 가이드로 돌아간다
      back: "partguide",
    },
    {
      remaining: () => clearRemaining,
      surveyUrl,
      // 세션을 통째로 새로 만든다 — 앞 세션 값이 하나도 안 남게
      restart: restartSession,
    },
  );

  // 방향이 바뀌면 안내만 다시 그린다
  window.addEventListener("orientationchange", () => shell.render());
  window.matchMedia("(orientation: landscape)").addEventListener("change", () => shell.render());

  // 탭을 닫기 전에 버퍼에 남은 로그를 저장
  window.addEventListener("pagehide", () => void logStore.flush());
  // 화면이 가려질 때(앱 전환·탭 닫기) 남은 줄을 보낸다 — 답을 기다리지 않는다
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sender.flushBeacon();
  });

  shell.render();
  await closeBootSplash();
  closeBootSplash = null;
}

/**
 * 각 모듈이 자기 화면을 여기에 올린다.
 *
 *   ① capture : consent · denied · capture
 *   ② guide   : guide · live
 *   ③ score   : result
 *   ⑥ app     : processing · looks · fullrender · review · done
 *
 * 예) shell.register("looks", looksScreen);
 */
type LookDeps = LooksDeps & FullRenderDeps;

function registerAll(
  shell: ReturnType<typeof createShell<Session>>,
  consent: ConsentDeps,
  capture: CaptureDeps,
  look: LookDeps,
  review: ReviewDeps,
  result: ResultDeps,
  processing: ProcessingDeps,
  guide: GuideDeps,
  live: LiveDeps,
  done: DoneDeps,
): void {
  shell.register("consent", consentScreen<Session>(consent));
  shell.register("denied", deniedScreen<Session>());
  shell.register("capture", captureScreen<Session>(capture));
  shell.register("done", doneScreen<Session>(done));
  // 실시간 가이드 — 지금 흐름의 화면 (부위 가이드의 "실시간 가이드로 보기")
  shell.register("live", liveScreen<Session>(live));
  // [옛 흐름 · 지금 안 씀] 아래 여섯은 2026-10-06 에 흐름이 바뀌면서 가는 길이 없어졌다 — 등록만 남아 있다 (client/OLD-FLOW.md).
  // 이 화면에 멈춘 채 저장된 옛 세션은 앱을 켤 때 가까운 새 화면으로 옮긴다 (core/screens.ts inNewFlow)
  shell.register("processing", processingScreen<Session>(processing));
  shell.register("looks", looksScreen<Session>(look));
  shell.register("fullrender", fullRenderScreen<Session>(look));
  shell.register("guide", guideScreen<Session>(guide));
  shell.register("result", resultScreen<Session>(result));
  shell.register("review", reviewScreen<Session>(review));
  // 등록 안 된 화면은 담당 모듈을 알려주는 자리표시가 뜬다
}

/**
 * 새 흐름(2026-10-06)의 빈 자리 — 순서는 core/screens.ts SCREEN_ORDER.
 * 옛 흐름 화면(looks · fullrender · guide · live · result · review)은 registerAll 에 그대로 등록돼 있지만 흐름이 가지 않는다
 */
function registerFlowSlots(shell: ReturnType<typeof createShell<Session>>, deps: PartGuideSlotDeps & SaveSlotDeps & { getAttempt: () => AttemptShots | null; getAnswer: () => AnswerPhoto | null; getFeedback: () => Promise<FeedbackLoad>; getSave: () => Promise<SaveKit | null>; makeAnswer: (ref: Blob) => Promise<MakeResult>; makeMoved: () => Promise<MakeResult>; making: (key: MadeKey) => boolean; analyzeRef: NonNullable<SlotDeps["analyze"]>; shrinkRef: NonNullable<SlotDeps["shrink"]> }): void {
  shell.register("answer", slotScreen<Session>({
    title: "2 · 3 참고 사진 · 정답사진",
    owner: "① · ② · ④",
    todo: [
      "원하는 화장이 된 정면 사진 업로드 — 못 쓰는 사진이면 이유와 함께 다시 올려 달라고",
      "참고 사진의 화장을 내 맨얼굴에 옮긴 정답사진 생성 (참고 사진은 만든 뒤 바로 지움)",
      "정답사진 보여 주기 → 화장하러 가기",
    ],
    next: "partguide",
  }, { makeAnswer: deps.makeAnswer, analyze: deps.analyzeRef, shrink: deps.shrinkRef }));
  shell.register("partguide", partGuideSlot<Session>(deps));
  // 화면 6 피드백 — 임시 자리를 치우고 진짜 화면으로 (#318 모양 · #332 연결).
  // 재료는 getFeedback() 이 다 모아서 준다 — 화면은 그리기만 한다
  shell.register("feedback", feedbackSlot<Session>({ getFeedback: deps.getFeedback, clearAll: deps.clearAll, ...(deps.startOver ? { startOver: deps.startOver } : {}) }));
  shell.register("save", saveSlot<Session>(deps));
}

const NO_DRAFT: readonly ScreenId[] = ["consent", "denied", "done"];

/**
 * 켤 때 draft 가 있으면 되살린다 (1-11). 규칙은 core/restore.ts.
 * 촬영 뒤 화면이면 쌩얼 사진에서 기준 랜드마크를 다시 찾고, 못 찾으면 촬영부터.
 */
async function restore(store: SessionStore, events: CaptureEvents, fresh: Session): Promise<Session> {
  // restore{ok}: 사용자가 하던 그대로 돌아왔나. 만료는 복원 시도가 아니라 정상 동작이라 찍지 않는다 (#162 리뷰 — "복원 성공률" 지표)
  const loaded = await store.loadDraft();
  if (!loaded.draft) return fresh;
  const plan = planRestore(loaded.draft);
  if (plan.kind === "fresh") return fresh;
  if (plan.kind === "capture") {
    // 촬영 도중: 찍어 둔 장이 있었으면 사진을 잃은 것 → ok=false
    events.restore(plan.lostShots === 0, false);
    return plan.session;
  }
  const bare = await store.loadImage("bare");
  const blob = bare instanceof Blob ? bare : bare ? new Blob([bare]) : null;
  const found = blob ? await landmarksFromImage(blob).catch(() => null) : null;
  if (!blob || !found) {
    events.restore(false, !!blob);
    return toCapture(plan.session);
  }
  events.restore(true, true);
  return { ...plan.session, baseline: rebuildBaseline(plan.baseline, found, blob) };
}

// 시작하다 실패하면 빈 화면 대신 안내를 띄운다 (IndexedDB 가 막힌 브라우저·저장공간 부족 등) — 스플래시는 먼저 닫는다
void boot().catch((e: unknown) => {
  void (async () => {
    if (closeBootSplash) await closeBootSplash().catch(() => {});
    closeBootSplash = null;
    showBootError(e);
  })();
});
