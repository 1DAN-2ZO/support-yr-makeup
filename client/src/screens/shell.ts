/**
 * 껍데기 — 화면을 갈아 끼우는 틀. 모듈 ⑥ 이 만들고 각 모듈이 자기 화면을 등록한다.
 *
 * 각 모듈이 할 일:
 *   shell.register("capture", { mount(ctx) { ...; return () => {  정리  } } })
 *
 * 껍데기가 하는 것: 화면 전환, 이전 화면 정리(unmount), 진행 칩, 방향 안내, 이벤트 로그.
 * 껍데기가 하지 않는 것: 세션 상태 계산(①의 flow.ts), 채점(③), 가이드(②).
 */

import type { Logger } from "../core/log";
import {
  chipLabel,
  chips,
  isPartScreen,
  orientationHint,
  SCREEN_NAME,
  SCREEN_OWNER,
  type ChipInput,
  type Orientation,
  type ScreenId,
} from "../core/screens";
import type { PartId } from "../core/types";

/** 화면이 그려질 때 받는 것. 세션은 모듈이 각자 자기 타입으로 좁혀 쓴다 */
export interface ScreenContext<S = unknown> {
  root: HTMLElement;
  session: S;
  /** 다른 화면으로. 껍데기가 정리·로그를 맡는다 */
  go: (to: ScreenId) => void;
  /** 부위를 바꾸고 그 부위 완성본으로 (진행 칩 탭) */
  goPart: (part: PartId) => void;
  log: Logger;
}

export interface Screen<S = unknown> {
  /** 그린다. 정리할 게 있으면 정리 함수를 돌려준다 (타이머·카메라 루프 등) */
  mount: (ctx: ScreenContext<S>) => void | (() => void);
}

export interface ShellOptions<S> {
  root: HTMLElement;
  /** 진행 칩이 그려질 자리. 없으면 칩을 안 그린다 */
  chipsRoot?: HTMLElement;
  /** 방향 안내가 그려질 자리 */
  hintRoot?: HTMLElement;
  log: Logger;
  /** 지금 세션 (매 렌더 시점에 불린다) */
  getSession: () => S;
  /** 세션에서 껍데기가 알아야 하는 것만 뽑는다 */
  read: (s: S) => { screen: ScreenId; currentPart: PartId | null; parts: readonly ChipInput[] };
  /** 화면 전환 요청. 세션을 실제로 바꾸는 건 호출측(①의 flow) */
  setScreen: (to: ScreenId) => void;
  setPart: (p: PartId) => void;
  /** 모르면(null — 옛 브라우저 · 주소 ?norotate) 방향 안내를 안 띄운다 */
  orientation?: () => Orientation | null;
}

export function createShell<S>(opts: ShellOptions<S>) {
  const registry = new Map<ScreenId, Screen<S>>();
  let cleanup: (() => void) | null = null;
  let shown: ScreenId | null = null;

  function register(id: ScreenId, screen: Screen<S>): void {
    if (registry.has(id)) throw new Error(`화면이 이미 등록돼 있습니다: ${id}`);
    registry.set(id, screen);
  }

  function registered(): ScreenId[] {
    return [...registry.keys()];
  }

  function go(to: ScreenId): void {
    opts.setScreen(to);
    render();
  }

  function goPart(part: PartId): void {
    opts.setPart(part);
    opts.setScreen("guide"); // 진행 칩은 언제나 완성본부터 (F-04)
    render();
  }

  function render(): void {
    const session = opts.getSession();
    const { screen, currentPart, parts } = opts.read(session);

    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    if (shown && shown !== screen) opts.log.log({ name: "screen_leave", screen: shown });
    if (shown !== screen) {
      opts.log.setContext({ screen, part: currentPart });
      opts.log.log({ name: "screen_enter", screen });
    } else {
      opts.log.setContext({ screen, part: currentPart });
    }
    shown = screen;

    opts.root.textContent = "";
    renderChips(parts, currentPart, screen);
    // 방향 안내는 부위 화면(3·4·5)에서만 — 리뷰에 마지막 부위 기준 "세로로" 가 떴다 (#169 3번)
    renderHint(isPartScreen(screen) ? currentPart : null);

    const s = registry.get(screen);
    if (!s) {
      opts.root.append(placeholder(screen));
      return;
    }
    const ctx: ScreenContext<S> = { root: opts.root, session, go, goPart, log: opts.log };
    const ret = s.mount(ctx);
    cleanup = typeof ret === "function" ? ret : null;
  }

  function renderChips(parts: readonly ChipInput[], current: PartId | null, screen: ScreenId): void {
    const host = opts.chipsRoot;
    if (!host) return;
    host.textContent = "";
    host.hidden = !isPartScreen(screen);
    if (host.hidden) return;
    for (const c of chips(parts, current)) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "chip" + (c.current ? " current" : "") + ` st-${c.status}`;
      el.textContent = `${c.name} ${chipLabel(c)}`;
      el.addEventListener("click", () => {
        opts.log.log({ name: "button", button: `chip:${c.partId}` });
        goPart(c.partId);
      });
      host.append(el);
    }
  }

  function renderHint(part: PartId | null): void {
    const host = opts.hintRoot;
    if (!host) return;
    const now = opts.orientation ? opts.orientation() : "portrait";
    const hint = now ? orientationHint(part, now) : null;
    host.hidden = hint === null;
    host.textContent = hint ?? "";
  }

  /** 아직 그 모듈이 화면을 안 올렸을 때. 통합 전에도 흐름이 끊기지 않게 */
  function placeholder(screen: ScreenId): HTMLElement {
    const el = document.createElement("div");
    el.className = "placeholder";
    const owner = SCREEN_OWNER[screen];
    el.innerHTML =
      `<p><b>${SCREEN_NAME[screen]}</b> 화면이 아직 없습니다.</p>` +
      `<p class="muted">담당 모듈 <code>${owner}</code> 가 <code>shell.register("${screen}", …)</code> 로 올립니다.</p>`;
    return el;
  }

  return { register, registered, render, go, goPart };
}

export type Shell<S> = ReturnType<typeof createShell<S>>;
