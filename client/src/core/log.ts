/**
 * 공통 로그 — 모든 모듈은 이 `log()` 하나만 부른다 (work-split-modules-v6.md §2 로그 규칙).
 * 세션 ID·시각·화면·부위·버전은 자동으로 붙는다. 한 줄 JSON.
 * 사진·랜드마크 좌표·얼굴 데이터는 절대 넣지 않는다 — 타입이 막지만, 문자열 필드에도 넣지 말 것.
 * 저장은 sink 로 갈아 끼운다: 개발은 콘솔, 기기에서는 IndexedDB, 사용자 실험 때만 동의받아 내보낸다.
 */

import type { Event, EventFields, PartId, Versions } from "./types";

export interface LogContext {
  sid: string;
  screen: string;
  part: PartId | null;
  ver: Versions;
  now?: () => number;
}

export type LogSink = (line: string, ev: Event) => void;

const FORBIDDEN_KEYS = new Set(["lm", "pts", "frames", "image", "bareImage", "photo", "path", "filename"]);

export function createLogger(ctx: LogContext, sink: LogSink = consoleSink) {
  const state: LogContext = { ...ctx };
  return {
    /** 화면·부위가 바뀔 때 갱신. 세션 번호는 다시 시작할 때만 바꾼다 (core/session-id) */
    setContext(patch: Partial<Pick<LogContext, "screen" | "part" | "sid">>): void {
      Object.assign(state, patch);
    },
    log(fields: EventFields): Event {
      for (const k of Object.keys(fields)) {
        if (FORBIDDEN_KEYS.has(k)) throw new Error(`log: forbidden field "${k}" (얼굴 데이터는 로그에 넣지 않는다)`);
      }
      const ev: Event = {
        sid: state.sid,
        t: (state.now ?? Date.now)(),
        screen: state.screen,
        part: state.part,
        ver: state.ver,
        ...fields,
      };
      sink(JSON.stringify(ev), ev);
      return ev;
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;

export function consoleSink(line: string): void {
  console.log(line);
}

/** 메모리에 모으는 sink (테스트·내보내기용) */
export function memorySink(): { sink: LogSink; lines: string[]; events: Event[] } {
  const lines: string[] = [];
  const events: Event[] = [];
  return {
    sink: (line, ev) => {
      lines.push(line);
      events.push(ev);
    },
    lines,
    events,
  };
}
