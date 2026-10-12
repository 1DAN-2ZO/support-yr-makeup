/**
 * 사용 기록 보내기 — `POST /events` (2026-10-07, PR #317 규격).
 *
 * 왜 화면에 **들어올 때마다** 보내는가: 서버는 이탈 위치를 "세션의 마지막 `screen_enter`" 로
 * 본다. "나갔다" 신호(`pagehide`)는 폰에서 안 올 때가 많아서, 세션 끝에 몰아 보내면 정작
 * 이탈한 사람의 기록이 통째로 날아간다. 들어올 때마다 보내면 마지막으로 닿은 화면이 남는다.
 *
 * 서버 규격 (PR #317)
 *   몸통   { events: [...] }  — core/log.ts 의 Event 그대로
 *   답     204 받음 · 413 너무 큼 · 422 모양 틀림(한 줄만 틀려도 묶음 전체 거절) · 503 쌓을 곳 없음
 *   한도   한 번에 64KB · 200줄
 *
 * 못 보낸 줄은 버리지 않고 **다음에 다시 보낸다**. 다만 422(모양 틀림)는 다시 보내도 같은
 * 답이라 그 묶음은 버린다 — 안 그러면 영원히 막혀 뒤 기록까지 못 보낸다.
 *
 * 사진·얼굴 점은 애초에 `log()` 가 막아서 Event 안에 들어오지 않는다. 여기서 또 거르지 않는다.
 */

import type { Event } from "./types";

/** 한 번에 보낼 수 있는 줄 수 (서버 한도) */
export const MAX_LINES = 200;
/** 한 번에 보낼 수 있는 몸통 크기 (서버 한도 64KB, 조금 여유를 둔다) */
export const MAX_BYTES = 60 * 1024;
/** 못 보낸 줄을 들고 있을 최대치. 넘으면 오래된 것부터 버린다 */
export const MAX_OUTBOX = 1000;

export type SendOutcome =
  | "sent"        // 204
  | "kept"        // 못 보냄 — 다음에 다시
  | "dropped"     // 422: 모양이 틀려 다시 보내도 소용없다
  | "off";        // 끌 것 (503 등) — 이 세션에서는 더 안 보낸다

export interface EventSenderOptions {
  /** 서버 주소. 끝의 / 는 있어도 없어도 된다 */
  base: string;
  /** 보낼지 말지. 동의 전이면 false — 그동안 쌓이기만 한다 */
  enabled: () => boolean;
  fetchFn?: typeof fetch;
  /** 화면이 가려질 때 쓰는 길. 없으면 fetch 로 */
  beacon?: (url: string, body: string) => boolean;
  /** 보내다 난 문제를 남긴다 (로그로). 여기서 또 log() 를 부르면 서로를 부른다 */
  onTrouble?: (why: string) => void;
}

export interface EventSender {
  /** 찍힌 이벤트를 줄 세운다 */
  add: (ev: Event) => void;
  /** 지금 보낸다. 화면에 들어올 때마다 부른다 */
  send: () => Promise<SendOutcome>;
  /** 화면이 가려질 때 — 답을 기다리지 않는다 */
  flushBeacon: () => void;
  /** 아직 못 보낸 줄 수 */
  waiting: () => number;
  /** 이 세션에서 더 안 보낸다 */
  stop: () => void;
  /** 새 세션 — 다시 쌓고 보낸다. 앞 세션에서 못 보낸 줄은 버린다 (끝내기 뒤 "다시 하기") */
  restart: () => void;
}

/**
 * 크기는 **바이트**로 잰다. 글자 수로 재면 한글이 한 글자에 3바이트라 세 배까지
 * 모자라게 세고, 서버 한도(64KB)를 넘겨 413 을 맞는다. 문구가 한글이라 늘 걸린다
 */
const byteLen = (s: string): number => new TextEncoder().encode(s).length;

/** 서버 한도 안에 드는 만큼만 앞에서 떼어 낸다 */
export function takeBatch(outbox: readonly Event[]): Event[] {
  const batch: Event[] = [];
  let bytes = byteLen("{\"events\":[]}");
  for (const ev of outbox) {
    if (batch.length >= MAX_LINES) break;
    const size = byteLen(JSON.stringify(ev)) + 1;
    if (batch.length > 0 && bytes + size > MAX_BYTES) break;
    batch.push(ev);
    bytes += size;
  }
  // 한 줄이 혼자서도 한도를 넘으면 그 줄만 보낸다 — 서버가 413 으로 답하면 그때 버린다
  return batch;
}

export function createEventSender(opts: EventSenderOptions): EventSender {
  const url = `${opts.base.replace(/\/$/, "")}/events`;
  const doFetch = opts.fetchFn ?? ((u: RequestInfo | URL, i?: RequestInit) => fetch(u, i));
  const beacon = opts.beacon ?? ((u: string, body: string) => navigator.sendBeacon(u, body));
  let outbox: Event[] = [];
  let sending = false;
  let off = false;

  function add(ev: Event): void {
    if (off) return;
    outbox.push(ev);
    if (outbox.length > MAX_OUTBOX) outbox = outbox.slice(outbox.length - MAX_OUTBOX);
  }

  async function send(): Promise<SendOutcome> {
    if (off || sending || !opts.enabled() || outbox.length === 0) return off ? "off" : "kept";
    sending = true;
    const batch = takeBatch(outbox);
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (res.status === 204 || (res.ok && res.status < 300)) {
        outbox = outbox.slice(batch.length);
        return "sent";
      }
      if (res.status === 422 || res.status === 413) {
        // 다시 보내도 같은 답이다. 그 묶음만 버리고 뒤는 계속 보낸다
        outbox = outbox.slice(batch.length);
        opts.onTrouble?.(`events ${res.status}`);
        return "dropped";
      }
      if (res.status === 503) {
        off = true;
        opts.onTrouble?.("events 503");
        return "off";
      }
      opts.onTrouble?.(`events ${res.status}`);
      return "kept";
    } catch {
      // 네트워크가 끊겼거나 서버가 없다 — 들고 있다가 다음에 다시
      return "kept";
    } finally {
      sending = false;
    }
  }

  return {
    add,
    send,
    flushBeacon() {
      if (off || !opts.enabled() || outbox.length === 0) return;
      const batch = takeBatch(outbox);
      // 답을 못 보므로 보낸 것으로 친다 — 못 갔으면 그 줄은 잃는다(화면이 사라지는 중이라 어쩔 수 없다)
      if (beacon(url, JSON.stringify({ events: batch }))) outbox = outbox.slice(batch.length);
    },
    waiting() {
      return outbox.length;
    },
    stop() {
      off = true;
      outbox = [];
    },
    restart() {
      off = false;
      outbox = [];
    },
  };
}
