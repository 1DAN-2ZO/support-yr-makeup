/**
 * 운영 연결 한 벌 — 본 앱 `main.ts` 의 `boot()` 앞부분을 리액트에 맞게 옮긴 것 (#454 A2 · A3 · A4 · A6).
 *
 * 세션 번호 · 사용 기록 보내기 · 사진 보관 · 기록기를 **앱을 켤 때 한 번** 만들고 모든 화면이 같이 쓴다.
 * 전에는 촬영 · 완성사진 · 실시간 가이드가 각자 `createLogger({ sid: "capture-react", ver: "dev" })` 를 만들어
 * 콘솔에만 찍었다 — 세션 번호가 화면마다 달랐고 서버로는 아무것도 안 갔다.
 *
 * 부품은 전부 본 앱 `core/` 것을 **그대로** 쓴다 (`@core` — vite.config.ts 의 alias, #454 D4).
 * 리액트 쪽 코드가 아니라서 그대로 되고, 서버 규격(POST /events 64KB 묶음 · POST /keep 종류 이름)이 한 벌로 남는다.
 *
 * 게으르게 만든다(`ops()`): 테스트 기간이 끝난 뒤에는 앱을 켜지 않으므로(App.tsx `Closed`) 그때는 아무것도 만들지 않는다 —
 * 본 앱 `boot()` 이 닫힘 확인을 맨 앞에 두는 것과 같다
 */
import { createCaptureEvents, type CaptureEvents } from "@core/capture-events";
import { createEventSender, type EventSender } from "@core/event-sender";
import { createKeeper, keepAttempt, type Keeper } from "@core/keep-client";
import { createLogger, type Logger } from "@core/log";
import { createSidHolder, type SidHolder } from "@core/session-id";
import { readUtm } from "@core/utm";
import { getVersions } from "./versions";

/**
 * 세션 번호를 폰에 붙들어 두는 시간 — 본 앱 `session-store` 의 `DRAFT_TTL_MS`(2시간)와 같은 값.
 * 이 버전에는 폰 저장소(session-store)가 없어 값만 맞춘다. 본 앱이 바꾸면 여기도 바꾼다
 */
const SID_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 이 버전의 화면 이름 → 사용 기록에 적는 화면 이름 (본 앱 `core/screens.ts` 의 이름, #454 D2).
 *
 * 본 앱은 참고 사진 · 템플릿 · 정답사진 · 팔레트를 `answer` 한 화면에서 하는데 이 버전은 펼쳐 놓았다.
 * 기록에는 **본 앱 이름으로** 적어야 "어느 화면에서 나갔나" 집계가 두 판 사이에 이어진다 — 그래서 upload · answer ·
 * palette 는 셋 다 `answer` 로 적고, 같은 이름이 이어지면 `screen_enter` 를 한 번만 찍는다 (본 앱 shell.ts 와 같다).
 * 템플릿 고르기(`templates`)와 실시간 가이드(`live`)는 본 앱에도 곁 화면으로 있는 이름이다.
 * 스플래시는 본 앱에서 화면이 아니라 켜는 동안의 덮개라 기록하지 않는다 (null)
 */
const SCREEN_OF: Readonly<Record<string, string | null>> = {
  splash: null,
  consent: "consent",
  denied: "denied",
  capture: "capture",
  upload: "answer",
  templates: "templates",
  answer: "answer",
  palette: "answer",
  partguide: "partguide",
  live: "live",
  attempt: "attempt",
  feedback: "feedback",
  save: "save",
  done: "done",
};

export interface Ops {
  sid: SidHolder;
  sender: EventSender;
  keeper: Keeper;
  log: Logger;
  /** 촬영 모듈의 이벤트 찍기 (동의 · 촬영) — 본 앱과 같이 기록기 하나에 붙인다 */
  events: CaptureEvents;
  /** 화면에 들어왔다 — 이름이 바뀔 때만 `screen_leave` · `screen_enter` 를 찍고, 세션 번호의 시간을 새로 적는다 */
  enter(stage: string): void;
  /** 동의했다 / 거절했다 — 이때부터(동의) 사용 기록과 사진이 서버로 간다 */
  consent(ok: boolean): void;
  /** 시도사진 묶음(눈 뜬 장 다섯까지)을 보관하러 보낸다 */
  keepAttempt(open: readonly Blob[]): void;
  /** 「끝내기」 — 세션이 끝났다고 적는다 (본 앱 `session_end`). 이 줄이 찍히면 남은 기록을 보낸다 */
  end(lastScreen: string): void;
  /**
   * 「다시 하기」 — 본 앱 `clearAll` + `restartSession` 중 이 버전에 있는 것:
   * 앞 세션의 보내기를 멈추고 세션 번호를 폰에서 지운 뒤, 새 번호로 바꿔 다시 쌓는다
   */
  restart(): void;
}

let made: Ops | null = null;

function build(): Ops {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    /* 비공개 창 등 — 붙들지 않는다 (본 앱과 같다) */
  }
  // 세션 번호 — 폰에 적어 두고 다시 켜도 같은 번호를 쓴다 (#385). 이 번호가 후기 설문과 서버 보관 사진을 잇는 열쇠다 (#431)
  const sid = createSidHolder({ storage, ttlMs: SID_TTL_MS });
  let agreed = false;

  // 사용 기록 보내기 (PR #317) — 같은 주소의 /events 로. 프론트 nginx 가 백엔드로 넘긴다 (client-react/nginx.conf).
  // 동의하기 전에는 보내지 않는다 — 그동안은 메모리에 쌓였다가 동의한 뒤 첫 화면에 들어올 때 간다
  const sender = createEventSender({
    base: (import.meta.env.VITE_EVENTS_BASE as string | undefined) ?? "",
    enabled: () => agreed,
  });
  // 테스트 기간 사진 보관 (server/app/keep.py) — 서버가 켜져 있을 때만(GET /keep 200), 동의한 뒤에만 보낸다
  const keeper = createKeeper({
    sid: sid.sid,
    enabled: () => agreed,
    base: (import.meta.env.VITE_KEEP_BASE as string | undefined) ?? "",
  });
  const log = createLogger({ sid: sid.sid(), screen: "consent", part: null, ver: getVersions() }, (_line, ev) => {
    sender.add(ev);
    // 화면에 들어왔을 때 · 세션이 끝날 때만 실제로 보낸다 (매 줄 보내면 요청이 너무 잦다) — 본 앱 main.ts 와 같다
    if (ev.name === "screen_enter" || ev.name === "session_end") void sender.send();
  });
  const events = createCaptureEvents(log);

  let shown: string | null = null;
  const landing = (): void => {
    log.log({ name: "landing", ...readUtm(location.search) });
  };
  // 어느 링크로 들어왔는지 — 켤 때 한 번 (#408). 동의 전이라 쌓여 있다가 동의하면 같이 간다
  landing();
  // 화면이 가려질 때(앱 전환 · 탭 닫기) 남은 줄을 보낸다 — 답을 기다리지 않는다
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sender.flushBeacon();
  });

  return {
    sid,
    sender,
    keeper,
    log,
    events,
    enter(stage) {
      const screen = SCREEN_OF[stage] ?? null;
      if (!screen) return;
      sid.touch();
      if (shown === screen) return;
      if (shown) log.log({ name: "screen_leave", screen: shown });
      shown = screen;
      log.setContext({ screen, part: null });
      log.log({ name: "screen_enter", screen });
    },
    consent(ok) {
      agreed = ok;
      events.consent(ok);
    },
    keepAttempt(open) {
      keepAttempt(keeper, open);
    },
    end(lastScreen) {
      log.log({ name: "session_end", reason: "finish", last_screen: lastScreen });
    },
    restart() {
      sender.stop();
      sid.drop();
      agreed = false;
      shown = null;
      log.setContext({ sid: sid.renew(), screen: "consent", part: null });
      sender.restart();
      landing();
    },
  };
}

/** 운영 연결 — 처음 부를 때 만들고 그 뒤로는 같은 것 */
export function ops(): Ops {
  made ??= build();
  return made;
}
