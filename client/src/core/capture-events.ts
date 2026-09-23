/**
 * 촬영 모듈의 이벤트 찍기 (1-5): consent · capture{shot, ok, retry, reason} · restore · landmark_lost.
 * 전부 공통 log() 로만 나간다 (사진·좌표 금지). 장별 재촬영 횟수는 여기서 센다 → 1-2 표의 "장별 재촬영 횟수".
 *
 * capture ok=false 를 언제 찍나 (2026-09-21 폰 실측 뒤 정한 규칙):
 *   자동 촬영이라 "시도" 라는 순간이 없다. 프레임마다 찍으면 초당 17줄이 나오고, N프레임마다 찍으면 기기 속도에 따라 달라진다.
 *   → 같은 조건(firstFail)에 stuckMs(기본 3초) 이상 막혀 있을 때 그 조건으로 한 번만 찍는다. 조건이 바뀌면 다시 3초부터.
 *   이러면 ⑥ 퍼널의 "어느 조건에서 사용자가 막히나" 가 프레임 수가 아니라 사람이 느끼는 시간 기준으로 나온다.
 *   보완 (2026-09-22 iPhone 실측): 조건이 3초 안에 계속 바뀌면(각도→크기→얼굴…) 위 규칙으로는 한 줄도 안 남는다.
 *   → 같은 장을 slowMs(기본 5초) 동안 통과 못 했고 그동안 한 줄도 안 찍었으면, 가장 오래 막힌 조건으로 한 번 찍는다.
 */

import type { Logger } from "./log";
import type { GateFail } from "./types";
import type { ShotId } from "./flow";

export interface CaptureEvents {
  /** 동의 화면 결과 */
  consent(ok: boolean): void;
  /** 촬영 결과 하나. ok=false 면 reason 에 처음 걸린 조건. 같은 장을 다시 찍을 때마다 retry 가 오른다 */
  shot(shot: ShotId, ok: boolean, reason: GateFail | null): void;
  /**
   * 프레임마다 부른다: 지금 장이 어떤 조건에 막혀 있나 (통과 중이면 null).
   * 같은 조건이 stuckMs 이상 이어지면 capture{ok:false, reason} 를 한 번 찍고 true 를 돌려준다.
   */
  blocked(shot: ShotId, firstFail: GateFail | null, now: number): boolean;
  /** 얼굴을 놓쳤다가 다시 찾았을 때, 놓친 시간(ms). 1초 미만은 안 찍는다 (눈 깜빡임 수준) */
  faceLost(ms: number): void;
  /** 틀린 장을 지우고 다시 찍기로 함 — 다음 shot 이벤트의 retry 에 반영 */
  retake(shot: ShotId): void;
  /** 앱이 돌아왔을 때 복원 결과 */
  restore(ok: boolean, hadImages: boolean): void;
  /** 장별 재촬영 횟수 (측정용 읽기) */
  retries(): Readonly<Record<ShotId, number>>;
}

export interface CaptureEventsOptions {
  /** 같은 조건에 이만큼 막히면 capture ok=false 한 번 (기본 3000ms) */
  stuckMs?: number;
  /** 얼굴 놓침을 찍는 최소 시간 (기본 1000ms) */
  lostMinMs?: number;
  /** 조건이 바뀌어도, 같은 장을 이만큼 통과 못 하면 가장 오래 막힌 조건으로 한 번 (기본 5000ms) */
  slowMs?: number;
}

const ZERO: Record<ShotId, number> = { front_open: 0, front_closed: 0, left_45: 0, right_45: 0 };

export function createCaptureEvents(logger: Logger, opts: CaptureEventsOptions = {}): CaptureEvents {
  const stuckMs = opts.stuckMs ?? 3000;
  const lostMinMs = opts.lostMinMs ?? 1000;
  const slowMs = opts.slowMs ?? 5000;
  const retries: Record<ShotId, number> = { ...ZERO };
  // 지금 막혀 있는 (장, 조건) 과 그 시작 시각, 이미 찍었는지
  let cur: { shot: ShotId; reason: GateFail; since: number; logged: boolean } | null = null;
  // 지금 장을 통과 못 하고 있는 구간: 시작 시각, 조건별 누적 ms, 이 구간에 ok=false 를 찍었는지
  let ep: { shot: ShotId; start: number; last: number; prev: GateFail; acc: Partial<Record<GateFail, number>>; logged: boolean } | null = null;
  const resetBlocked = (): void => { cur = null; ep = null; };
  const logFail = (shot: ShotId, reason: GateFail): void => {
    logger.log({ name: "capture", shot, ok: false, retry: retries[shot], reason });
  };
  return {
    consent(ok) {
      logger.log({ name: "consent", ok });
    },
    shot(shot, ok, reason) {
      logger.log({ name: "capture", shot, ok, retry: retries[shot], reason });
      if (ok) resetBlocked();
    },
    blocked(shot, firstFail, now) {
      if (firstFail === null) { resetBlocked(); return false; }
      if (!ep || ep.shot !== shot) ep = { shot, start: now, last: now, prev: firstFail, acc: {}, logged: false };
      ep.acc[ep.prev] = (ep.acc[ep.prev] ?? 0) + (now - ep.last);
      ep.last = now; ep.prev = firstFail;
      if (!cur || cur.shot !== shot || cur.reason !== firstFail) {
        cur = { shot, reason: firstFail, since: now, logged: false };
      } else if (!cur.logged && now - cur.since >= stuckMs) {
        cur.logged = true; ep.logged = true;
        logFail(shot, firstFail);
        return true;
      }
      if (!ep.logged && now - ep.start >= slowMs) {
        ep.logged = true;
        let worst: GateFail = firstFail, most = -1;
        for (const [k, v] of Object.entries(ep.acc) as [GateFail, number][]) if (v > most) { most = v; worst = k; }
        logFail(shot, worst);
        return true;
      }
      return false;
    },
    faceLost(ms) {
      if (ms >= lostMinMs) logger.log({ name: "landmark_lost", ms: Math.round(ms) });
    },
    retake(shot) {
      retries[shot] += 1;
      resetBlocked();
    },
    restore(ok, hadImages) {
      logger.log({ name: "restore", ok, had_images: hadImages });
    },
    retries() {
      return retries;
    },
  };
}
