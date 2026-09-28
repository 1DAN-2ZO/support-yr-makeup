/**
 * 진입점 — 껍데기를 세우고 각 모듈의 화면을 등록한다.
 *
 * 지금은 등록된 화면이 없어서 전부 자리표시가 뜬다. 각 모듈이 자기 화면을 올리면
 * 여기 `registerAll()` 에 한 줄씩 추가된다. 그 외에는 이 파일을 고칠 일이 없다.
 */

import { createLogger } from "./core/log";
import { createLogStore } from "./core/log-store";
import { emptyJobSource, type LookJobSource } from "./core/look-jobs";
import {
  applyResult,
  applySkip,
  createSession,
  nextPart,
  setCurrentPart,
  setScreen,
  toReviewParts,
  type ScreenId,
  type Session,
} from "./core/flow";
import { pocGuide } from "./core/guide-poc";
import type { CaptureBundle } from "./core/types";
import { checkSecureContext, readEnv, type SecureCheck } from "./core/secure-context";
import { createSessionStore, indexedDbBackend, memoryBackend } from "./core/session-store";
import { getVersions } from "./core/versions";
import { lookById, SUMMARY_TEMPLATE } from "./core/looks";
import { doneScreen, type DoneDeps } from "./screens/done";
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

  const shell = createShell<Session>({
    root: el("screen"),
    chipsRoot: el("chips"),
    hintRoot: el("hint"),
    log,
    getSession: () => session,
    read: (s) => ({ screen: s.screen, currentPart: s.currentPart, parts: s.parts }),
    setScreen: (to: ScreenId) => {
      session = setScreen(session, to);
    },
    setPart: (p) => {
      session = setCurrentPart(session, p);
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
      jobs: lookJobs,
      getLookId: () => session.lookId,
      setLookId: (lookId: string) => {
        session = { ...session, lookId };
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
        session = applyResult(session, part, outcome);
      },
      skip: (part) => {
        session = applySkip(session, part);
      },
      nextPart: (after) => nextPart(session, after),
    },
    { jobs: lookJobs },
    {
      remaining: () => clearRemaining,
      // 세션을 통째로 새로 만든다 — 앞 세션 값이 하나도 안 남게
      restart: () => {
        logStore.reopen();
        session = createSession();
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
  look: LookDeps,
  review: ReviewDeps,
  result: ResultDeps,
  processing: ProcessingDeps,
  done: DoneDeps,
): void {
  shell.register("processing", processingScreen<Session>(processing));
  shell.register("looks", looksScreen<Session>(look));
  shell.register("fullrender", fullRenderScreen<Session>(look));
  shell.register("result", resultScreen<Session>(result));
  shell.register("review", reviewScreen<Session>(review));
  shell.register("done", doneScreen<Session>(done));
  // 남은 것: ① consent·denied·capture · ② guide·live
  // 등록 안 된 화면은 담당 모듈을 알려주는 자리표시가 뜬다
}

void boot();
