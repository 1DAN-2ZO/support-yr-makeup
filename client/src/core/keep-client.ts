/**
 * 테스트 기간 사진 보관 — 앱이 사진을 서버로 보내는 쪽 (2026-10-09 결정, 모듈 ⑥). 받는 쪽은 server/app/keep.py (`POST /keep`).
 *
 * 테스트 기간에는 참고 사진을 뺀 사용자 사진(맨얼굴 · 정답사진 · 시도사진 · 옮긴 그림)과 피드백 결과를 서버에 2026-10-19 오후 5시까지 보관한다 —
 * 판정 기준값을 맞추고 사람이 눈으로 검증하는 데 쓴다. 평소 원칙("사진은 서버에 저장하지 않는다")의 예외라 조건이 겹겹이다:
 *   - 서버가 켜져 있을 때만 (`GET /keep` 이 200). 꺼져 있으면(503) 사진을 하나도 올리지 않는다
 *   - 동의한 뒤에만 (enabled)
 *   - **참고 사진은 보낼 이름이 없다** — 다른 사람의 얼굴이다. KeepKind 에 넣지 말 것
 * 보관은 덤이다: 실패해도 던지지 않고, 화면을 기다리게 하지 않는다. 한 번에 하나씩 보낸다 (큰 사진이 겹쳐 올라가지 않게).
 */

import type { WholeFeedback } from "./feedback-whole";

/** 보관하는 사진의 종류 — server/app/keep.py PHOTO_KINDS 와 같은 이름. 참고 사진은 없다 */
export type KeepKind = "bare" | "answer" | "moved" | "attempt_open_0" | "attempt_open_1" | "attempt_open_2" | "attempt_open_3" | "attempt_open_4";

/** 시도사진 눈 뜬 장은 다섯 장까지 */
export const KEEP_ATTEMPT_OPEN = 5;

export interface KeeperOptions {
  /** 세션 번호 — 지워 달라는 요청이 오면 이것으로 찾는다 */
  sid: string;
  /** 보낼지 말지. 동의 전이면 false */
  enabled: () => boolean;
  /** 서버 주소. 없으면 같은 주소 */
  base?: string;
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export interface Keeper {
  /** 사진 한 장을 보관하러 보낸다 (기다리지 않는다). 아직 못 보낸 같은 종류가 있으면 바꾼다 */
  keep(kind: KeepKind, picture: Blob): void;
  /** 피드백 결과 — 글만 보낸다 */
  keepFeedback(feedback: WholeFeedback): void;
  /** 보내던 것이 다 끝나면 풀린다 (테스트 · 끝내기용) */
  idle(): Promise<void>;
}

/**
 * 시도사진 묶음을 보관하러 보낸다 — 눈 뜬 장 다섯 장까지 찍힌 순서대로([0] 이 셔터 장). 눈 감은 장은 이제 찍지 않는다 (#386).
 * 다시 찍으면 같은 이름으로 다시 보내 서버의 것이 바뀐다
 */
export function keepAttempt(keeper: Pick<Keeper, "keep">, open: readonly Blob[]): void {
  open.slice(0, KEEP_ATTEMPT_OPEN).forEach((b, i) => keeper.keep(`attempt_open_${i}` as KeepKind, b));
}

export function createKeeper(opt: KeeperOptions): Keeper {
  const doFetch = opt.fetchFn ?? ((u: RequestInfo | URL, i?: RequestInit) => fetch(u, i));
  const url = `${(opt.base ?? "").replace(/\/$/, "")}/keep`;
  /** null 아직 안 물음 · true 켜짐 · false 꺼짐(이 세션에서는 더 안 보낸다) */
  let on: boolean | null = null;
  const waiting: { kind: string; file: Blob }[] = [];
  let running: Promise<void> | null = null;

  async function ask(): Promise<boolean | null> {
    try {
      const r = await doFetch(url, { method: "GET" });
      // 503 = 꺼짐. 그 밖의 실패(서버 오류 · 옛 서버의 404/405)도 "없다" 로 본다 — 사진을 올려 보며 확인하지 않는다
      return r.ok;
    } catch {
      return null;   // 인터넷이 끊김 — 다음에 다시 묻는다
    }
  }

  async function drain(): Promise<void> {
    while (waiting.length) {
      if (on === null) on = await ask();
      if (on !== true) {
        // 꺼져 있거나 물어보지 못했다 — 들고 있던 것은 버린다 (사진을 오래 쥐고 있지 않는다)
        waiting.length = 0;
        return;
      }
      const item = waiting.shift()!;
      const body = new FormData();
      body.append("sid", opt.sid);
      body.append("kind", item.kind);
      body.append("file", item.file, item.kind);
      try {
        const r = await doFetch(url, { method: "POST", body });
        if (r.status === 503) on = false;
      } catch { /* 못 보냄 — 다음 것으로 */ }
    }
  }

  /** 보내는 줄을 돌린다. 끝나는 순간에 새로 들어온 것이 있으면 다시 돈다 */
  function kick(): void {
    running ??= drain().catch(() => {}).finally(() => {
      running = null;
      if (waiting.length) kick();
    });
  }

  function push(kind: string, file: Blob): void {
    try {
      if (on === false || !opt.enabled()) return;
      const i = waiting.findIndex((w) => w.kind === kind);
      if (i >= 0) waiting[i] = { kind, file };
      else waiting.push({ kind, file });
      kick();
    } catch { /* 보관이 화면을 막지 않는다 */ }
  }

  return {
    keep: (kind, picture) => push(kind, picture),
    keepFeedback: (feedback) => push("feedback", new Blob([JSON.stringify(feedback)], { type: "application/json" })),
    idle: async () => { while (running) await running; },
  };
}
