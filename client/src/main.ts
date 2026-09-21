/**
 * 진입점 — 껍데기를 세우고 각 모듈의 화면을 등록한다.
 *
 * 지금은 등록된 화면이 없어서 전부 자리표시가 뜬다. 각 모듈이 자기 화면을 올리면
 * 여기 `registerAll()` 에 한 줄씩 추가된다. 그 외에는 이 파일을 고칠 일이 없다.
 */

import { createLogger } from "./core/log";
import { createLogStore } from "./core/log-store";
import {
  createSession,
  setCurrentPart,
  setScreen,
  type ScreenId,
  type Session,
} from "./core/flow";
import { createSessionStore, indexedDbBackend, memoryBackend } from "./core/session-store";
import { getVersions } from "./core/versions";
import { createShell } from "./screens/shell";

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
  void sessionStore;

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

  registerAll(shell);

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
function registerAll(_shell: ReturnType<typeof createShell<Session>>): void {
  // 아직 없음 — 등록 안 된 화면은 담당 모듈을 알려주는 자리표시가 뜬다
}

void boot();
