/**
 * 화면 4 이벤트 찍기 (2-4, #24): gate_fail{first_fail} · landmark_lost{ms}.
 * screen_enter/leave 는 껍데기(shell.ts)가 모든 화면에 찍는다. 부위(part)는 로거 문맥이 붙인다.
 *
 * 찍는 규칙은 화면 1(capture-events.ts)과 같다 — ⑥ 퍼널이 두 화면을 같은 기준으로 본다:
 *   프레임마다 찍지 않는다(초당 수십 줄). 같은 조건에 stuckMs(3초) 막히면 그 조건으로 한 번.
 *   조건이 3초 안에 계속 바뀌면 slowMs(5초) 동안 못 넘긴 뒤 가장 오래 막힌 조건으로 한 번.
 *   통과하면 처음부터.
 * 얼굴 없음("face")은 gate_fail 로 안 센다 — landmark_lost 가 맡는다. 다만 막힌 시간을 지우지도 않는다:
 * 고개를 많이 돌리면 얼굴이 한두 프레임씩 끊기는데, 그때마다 지우면 3초·5초에 영영 못 닿는다 (#170 리뷰). 그 프레임만 건너뛴다.
 * 단 lostMinMs(1초) 넘게 얼굴이 없으면 자리를 비운 것 — 비운 시간이 막힌 시간으로 세어지지 않게 처음부터 (#170 리뷰 후속).
 */

import type { Logger } from "./log";
import type { GateFail } from "./types";

export interface LiveEventsOptions {
  stuckMs?: number;
  slowMs?: number;
  /** 얼굴 놓침을 찍는 최소 시간 (눈 깜빡임 수준 제외) */
  lostMinMs?: number;
}

export interface LiveEvents {
  /** 프레임마다: 게이트 첫 실패(통과면 null) */
  gate(firstFail: GateFail | null, now: number): void;
  /** 프레임마다: 얼굴을 찾았나. 놓친 동안의 길이를 재서 다시 찾았을 때 landmark_lost 로 */
  face(found: boolean, now: number): void;
  /** 놓친 시간을 직접 줄 때 */
  faceLost(ms: number): void;
}

export function createLiveEvents(logger: Logger, opts: LiveEventsOptions = {}): LiveEvents {
  const stuckMs = opts.stuckMs ?? 3000;
  const slowMs = opts.slowMs ?? 5000;
  const lostMinMs = opts.lostMinMs ?? 1000;
  let cur: { reason: GateFail; since: number; logged: boolean } | null = null;
  let ep: { start: number; last: number; prev: GateFail; acc: Partial<Record<GateFail, number>>; logged: boolean } | null = null;
  let lostSince: number | null = null;
  /** gate 쪽에서 본 얼굴 없음 시작 시각 (face() 의 lostSince 와 따로 — 호출 순서에 기대지 않게) */
  let goneSince: number | null = null;
  const reset = (): void => { cur = null; ep = null; };
  const fail = (reason: GateFail): void => { logger.log({ name: "gate_fail", first_fail: reason }); };

  const faceLost = (ms: number): void => {
    if (ms >= lostMinMs) logger.log({ name: "landmark_lost", ms: Math.round(ms) });
  };

  return {
    gate(firstFail, now) {
      if (firstFail === "face") {
        goneSince ??= now;
        if (now - goneSince > lostMinMs) reset();
        return;
      }
      goneSince = null;
      if (firstFail === null) { reset(); return; }
      if (!ep) ep = { start: now, last: now, prev: firstFail, acc: {}, logged: false };
      ep.acc[ep.prev] = (ep.acc[ep.prev] ?? 0) + (now - ep.last);
      ep.last = now; ep.prev = firstFail;
      if (!cur || cur.reason !== firstFail) {
        cur = { reason: firstFail, since: now, logged: false };
      } else if (!cur.logged && now - cur.since >= stuckMs) {
        // 한 번 찍은 뒤에도 조건이 바뀌어 또 3초 막히면 그것도 찍는다 — 화면 1 capture-events blocked() 와 같게 (#170 리뷰)
        cur.logged = true; ep.logged = true;
        fail(firstFail);
        return;
      }
      if (!ep.logged && now - ep.start >= slowMs) {
        ep.logged = true;
        let worst: GateFail = firstFail, most = -1;
        for (const [k, v] of Object.entries(ep.acc) as [GateFail, number][]) if (v > most) { most = v; worst = k; }
        fail(worst);
      }
    },
    face(found, now) {
      if (!found) { lostSince ??= now; return; }
      if (lostSince !== null) { faceLost(now - lostSince); lostSince = null; }
    },
    faceLost,
  };
}
