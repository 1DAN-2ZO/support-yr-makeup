/**
 * 화면 5 시도사진 — 장 순서 (2026-10-06 새 흐름, 모듈 ⑥). 순수 함수.
 *
 * 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 두 장을 찍는다. 찍는 규칙은 화면 1 과 같다 —
 * ① 의 capture-run(장 순서 · 카메라 자리 잡기 · 안정)과 flow.shotGate(정면 · 눈 · 크기 · 선명 · 밝기)를 그대로 쓴다.
 * 화면 1 도 정면 두 장이 되어(2026-10-07, 옆얼굴 45° 뺌) 장 순서가 같다.
 */

import { startRun, type RunState } from "./capture-run";
import { SHOTS, shotGate, type ShotId, type ShotMeasure } from "./flow";

export type AttemptShotId = ShotId;

/** 찍는 차례 — 화면 1 과 같다 */
export const ATTEMPT_SHOTS: readonly AttemptShotId[] = SHOTS.map((s) => s.id);

/** 이미 찍은 장을 넘기면 다음 장부터. 다 찍었으면 shot 이 null */
export function startAttemptRun(taken: Partial<Record<AttemptShotId, unknown>>, now: number): RunState {
  return startRun(taken, now);
}

/**
 * 한 번 찍을 때 모으는 장 수 (2026-10-07, #328). 눈 뜬 장은 다섯 장 묶음 — 피드백(③)이 값마다 가운데 값을 써서 한 장의 흔들림을 줄인다.
 * 감은 장은 한 장 (눈을 감고 기다리는 시간을 늘리지 않는다).
 * minGapMs: 묶음 안 장면 사이 간격 — 0.2초. 흔들림이 줄어드는 것을 확인한 조건이 0.2초 간격 · 1초 동안의 다섯 장이다 (#333, 80ms 는 시험한 적이 없고 장면이 서로 너무 비슷해질 수 있다) · maxMs: 셔터 뒤 이만큼 지나면 모은 만큼으로 끝 (눈을 감거나 움직여도 멈추지 않게)
 */
export const ATTEMPT_BURST = { count: { front_open: 5, front_closed: 1 } as Record<AttemptShotId, number>, minGapMs: 200, maxMs: 1500 } as const;

export interface AttemptBurst {
  shot: AttemptShotId;
  /** 셔터 시각 — 그 장이 묶음의 첫 장 */
  startedAt: number;
  /** 마지막으로 넣은 장면의 시각 */
  lastAt: number;
  /** 지금까지 모은 장 수 (셔터 장 포함) */
  got: number;
  done: boolean;
}

/** 셔터가 눌린 순간 — 그 장이 첫 장. 한 장만 모으는 장이면 바로 끝 */
export function startAttemptBurst(shot: AttemptShotId, now: number): AttemptBurst {
  return { shot, startedAt: now, lastAt: now, got: 1, done: ATTEMPT_BURST.count[shot] <= 1 };
}

/** 셔터 뒤 장면마다. 조건(안정 빼고)을 통과하고 앞 장과 간격이 있으면 take. 다 모았거나 시간이 지나면 done */
export function attemptBurstStep(b: AttemptBurst, m: ShotMeasure, now: number, opt = ATTEMPT_BURST): { state: AttemptBurst; take: boolean } {
  if (b.done) return { state: b, take: false };
  if (now - b.startedAt >= opt.maxMs) return { state: { ...b, done: true }, take: false };
  const ok = now - b.lastAt >= opt.minGapMs && shotGate(b.shot, { ...m, stableCount: Number.MAX_SAFE_INTEGER }).ok;
  if (!ok) return { state: b, take: false };
  const got = b.got + 1;
  return { state: { ...b, lastAt: now, got, done: got >= opt.count[b.shot] }, take: true };
}
