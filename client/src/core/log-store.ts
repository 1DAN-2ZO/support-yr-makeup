/**
 * 로그 저장 — `log()` 가 뱉은 이벤트를 기기 안에 쌓고, 필요할 때 JSONL 로 내보낸다.
 *
 * 규칙 (work-split-modules-v6.md §2 로그 규칙):
 * - **사진·랜드마크 좌표·얼굴 데이터는 들어오지 않는다.** `log()` 가 이미 막는다
 * - 기기 안에 먼저 쌓고, **사용자 실험 때만 동의받아** 내보낸다
 * - 끝내기 때 세션 데이터와 같이 지운다
 *
 * 저장소는 ① 의 `KvBackend`(session-store.ts)를 그대로 쓴다 — DB 를 두 벌 만들지 않는다.
 * 이벤트마다 쓰지 않고 버퍼에 모았다가 한 번에 쓴다(읽기-수정-쓰기 비용).
 */

import type { KvBackend } from "./session-store";
import type { Event } from "./types";

export const EVENTS_KEY = "events";
/** 한 세션에 남길 최대 줄 수. 넘으면 오래된 것부터 버린다 */
export const MAX_EVENTS = 5000;

export interface LogStoreOptions {
  backend: KvBackend;
  /** 이만큼 쌓이면 저장한다 (기본 20) */
  flushEvery?: number;
  /** 이 시간이 지나면 저장한다, ms (기본 3000). 0 이면 시간 저장 안 함 */
  flushAfterMs?: number;
  max?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface LogStore {
  /** `createLogger` 의 sink 로 넘긴다 */
  sink: (line: string, ev: Event) => void;
  flush: () => Promise<void>;
  /** 쌓인 것 전부 (저장된 것 + 아직 버퍼에 있는 것) */
  all: () => Promise<Event[]>;
  /** 한 줄에 하나씩 JSON — 사용자 실험 내보내기 형식 */
  exportJsonl: () => Promise<string>;
  /** 끝내기 때. 버퍼와 저장분을 모두 지운다 */
  clear: () => Promise<void>;
  pending: () => number;
}

export async function createLogStore(opts: LogStoreOptions): Promise<LogStore> {
  const {
    backend,
    flushEvery = 20,
    flushAfterMs = 3000,
    max = MAX_EVENTS,
    setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer = (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  } = opts;

  let buffer: Event[] = [];
  let timer: unknown = null;
  let writing: Promise<void> = Promise.resolve();

  async function stored(): Promise<Event[]> {
    const raw = await backend.get(EVENTS_KEY);
    return Array.isArray(raw) ? (raw as Event[]) : [];
  }

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  async function flush(): Promise<void> {
    cancelTimer();
    if (buffer.length === 0) return writing;
    const batch = buffer;
    buffer = [];
    // 쓰기는 순서대로 — 겹치면 읽기-수정-쓰기가 서로를 덮는다
    writing = writing.then(async () => {
      const prev = await stored();
      const next = [...prev, ...batch];
      await backend.set(EVENTS_KEY, next.length > max ? next.slice(next.length - max) : next);
    });
    return writing;
  }

  function sink(_line: string, ev: Event): void {
    buffer.push(ev);
    if (buffer.length >= flushEvery) {
      void flush();
      return;
    }
    if (flushAfterMs > 0 && timer === null) {
      timer = setTimer(() => {
        timer = null;
        void flush();
      }, flushAfterMs);
    }
  }

  async function all(): Promise<Event[]> {
    await flush();
    return stored();
  }

  return {
    sink,
    flush,
    all,
    async exportJsonl() {
      const list = await all();
      return list.map((e) => JSON.stringify(e)).join("\n");
    },
    async clear() {
      cancelTimer();
      buffer = [];
      writing = writing.then(() => backend.delete(EVENTS_KEY));
      await writing;
    },
    pending() {
      return buffer.length;
    },
  };
}

/** 내보내기 파일 이름. 세션·날짜만 들어간다 (개인 정보 없음) */
export function exportFileName(sid: string, at: Date = new Date()): string {
  const d = at.toISOString().slice(0, 10);
  return `danghwaeung-events-${d}-${sid.slice(0, 8)}.jsonl`;
}
