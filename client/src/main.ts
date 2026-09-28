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
import { planRestore, rebuildBaseline, toCapture } from "./core/restore";
import { createLogStore } from "./core/log-store";
import { emptyJobSource, type LookJobSource } from "./core/look-jobs";
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
} from "./core/flow";
import { pocGuide } from "./core/guide-poc";
import type { CaptureBundle } from "./core/types";
import { checkSecureContext, readEnv, type SecureCheck } from "./core/secure-context";
import { createSessionStore, indexedDbBackend, memoryBackend, type SessionStore } from "./core/session-store";
import { getVersions } from "./core/versions";
import { lookById, SUMMARY_TEMPLATE } from "./core/looks";
import { captureScreen, type CaptureDeps } from "./screens/capture";
import { consentScreen, deniedScreen, type ConsentDeps } from "./screens/consent";
import { doneScreen, type DoneDeps } from "./screens/done";
import { landmarksFromImage } from "./screens/landmarker";
import { fullRenderScreen } from "./screens/fullrender";
import { looksScreen } from "./screens/looks";
import { processingScreen, type ProcessingDeps } from "./screens/processing";
import { resultScreen, type ResultDeps } from "./screens/result";
import { reviewScreen, type ReviewDeps } from "./screens/review";
import { createShell } from "./screens/shell";

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

async function boot(): Promise<void> {
  let session: Session = createSession();

  // 로그는 세션과 같은 IndexedDB 를 쓴다 — DB 를 두 벌 만들지 않는다.
  // 끝내기(sessionStore.clearAll)가 키를 전부 지우므로 로그도 같이 지워진다 (F-11).
  const sessionStore = await createSessionStore();
  const backend = (await indexedDbBackend()) ?? memoryBackend();
  const logStore = await createLogStore({ backend });
  const sid = crypto.randomUUID();

  const log = createLogger(
    { sid, screen: session.screen, part: session.currentPart, ver: getVersions() },
    logStore.sink,
  );
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

  // 복원 중에는 모델을 받느라 몇 초 걸린다 — 빈 화면 대신 한 줄 (shell.render 가 지운다)
  el("screen").textContent = "준비하고 있어요…";
  session = await restore(sessionStore, events, session);

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
    orientation: () =>
      window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait",
  });

  // 카메라가 열릴 수 있는 곳인지 먼저 알려 준다. 안 그러면 "왜 안 되지"로 한참 헤맨다
  const secure = checkSecureContext(readEnv());
  if (!secure.ok) {
    showWarning(secure);
    log.log({ name: "error", where: "boot", msg: `secure_context:${secure.reason}` });
  }

  // ④ 의 서버가 붙으면 여기만 진짜 공급자로 바뀐다. 그때까지는 전부 "로딩 중"
  const lookJobs: LookJobSource = emptyJobSource();

  // 끝내기가 지우고 남은 키 수. 0 이어야 한다 (F-11)
  let clearRemaining = 0;

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
      setBaseline: (b) => set({ ...session, baseline: b, faceShape: b?.faceShape ?? null }),
      // 쌩얼 저장도 draft 와 같은 줄에 세운다 — 끝내기(clearAll)가 인코딩·저장이 끝날 때까지 기다린다 (#162 리뷰)
      saveBare: (blob) => {
        const done = saving.then(() => blob).then((b) => sessionStore.saveImage("bare", b));
        saving = done.catch(() => {});
        return done;
      },
      setFaceShapeFrames: (frames) => set({ ...session, faceShapeFrames: frames }),
      events,
      next: "processing",
    },
    {
      jobs: lookJobs,
      getLookId: () => session.lookId,
      setLookId: (lookId: string) => {
        set({ ...session, lookId });
      },
    },
    {
      getParts: () => toReviewParts(session),
      getLookName: () => lookById(session.lookId).name,
      // 조명 차 안내: 화면은 받을 준비가 됐지만 **아직 줄 값이 없다.**
      // 맨얼굴 기준(baseline.foreheadL)과 견줄 "확인받기 시점 이마 L*" 을 세션에 남기는 건
      // ② 의 게이트 출력이다(#79). 그 값이 생기면 여기서 lightingDiffers 로 바꾼다.
      lightingNote: () => null,
      store: {
        loadImage: (k) => sessionStore.loadImage(k),
        async clearAll() {
          await saving;   // 저장 중인 draft·쌩얼이 지운 뒤에 써지지 않게
          // 로그 저장소를 먼저 닫는다 — 안 닫으면 버퍼·시간 저장이 지운 뒤에 events 키를 다시 만든다
          await logStore.clear();
          const r = await sessionStore.clearAll();
          clearRemaining = r.remaining;
          return r;
        },
      },
      // 합산 설정은 전 룩 공통이다 (결정 2026-09-22). 값은 rules/looks.json
      template: SUMMARY_TEMPLATE,
    },
    {
      getPart: () => session.currentPart,
      getBaseline: () => session.baseline,
      // 화면 4(②) 가 확인받기 순간의 프레임 묶음을 parts[].captured 에 둔다 (CaptureBundle)
      getCapture: (part) => (session.parts.find((p) => p.partId === part)?.captured as CaptureBundle | null) ?? null,
      // 고른 룩의 치수(라이너 두께)로 채점한다. ② guides.ts 가 오면 여기만 바뀐다
      guide: () => pocGuide(lookById(session.lookId).parts),
      getStatus: (part) => session.parts.find((p) => p.partId === part)?.status ?? "in_progress",
      apply: (part, outcome) => {
        set(applyResult(session, part, outcome));
      },
      skip: (part) => {
        set(applySkip(session, part));
      },
      nextPart: (after) => nextPart(session, after),
    },
    { jobs: lookJobs },
    {
      remaining: () => clearRemaining,
      // 세션을 통째로 새로 만든다 — 앞 세션 값이 하나도 안 남게
      restart: () => {
        logStore.reopen();
        set(createSession());
        clearRemaining = 0;
        shell.render();
      },
    },
  );

  // 방향이 바뀌면 안내만 다시 그린다
  window.addEventListener("orientationchange", () => shell.render());
  window.matchMedia("(orientation: landscape)").addEventListener("change", () => shell.render());

  // 탭을 닫기 전에 버퍼에 남은 로그를 저장
  window.addEventListener("pagehide", () => void logStore.flush());

  shell.render();
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
interface LookDeps {
  jobs: LookJobSource;
  getLookId: () => string | null;
  setLookId: (lookId: string) => void;
}

function registerAll(
  shell: ReturnType<typeof createShell<Session>>,
  consent: ConsentDeps,
  capture: CaptureDeps,
  look: LookDeps,
  review: ReviewDeps,
  result: ResultDeps,
  processing: ProcessingDeps,
  done: DoneDeps,
): void {
  shell.register("consent", consentScreen<Session>(consent));
  shell.register("denied", deniedScreen<Session>());
  shell.register("capture", captureScreen<Session>(capture));
  shell.register("processing", processingScreen<Session>(processing));
  shell.register("looks", looksScreen<Session>(look));
  shell.register("fullrender", fullRenderScreen<Session>(look));
  shell.register("result", resultScreen<Session>(result));
  shell.register("review", reviewScreen<Session>(review));
  shell.register("done", doneScreen<Session>(done));
  // 남은 것: ② guide·live
  // 등록 안 된 화면은 담당 모듈을 알려주는 자리표시가 뜬다
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

void boot();
