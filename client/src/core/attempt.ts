/**
 * 화면 5 시도사진 — 장 순서 (2026-10-06 새 흐름, 모듈 ⑥). 순수 함수.
 *
 * 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 두 장을 찍는다. 찍는 규칙은 화면 1 과 같다 —
 * ① 의 capture-run(장 순서 · 카메라 자리 잡기 · 안정)과 flow.shotGate(정면 · 눈 · 크기 · 선명 · 밝기)를 그대로 쓴다.
 * 화면 1 도 정면 두 장이 되어(2026-10-07, 옆얼굴 45° 뺌) 장 순서가 같다.
 */

import { startRun, type RunState } from "./capture-run";
import { SHOTS, type ShotId } from "./flow";

export type AttemptShotId = ShotId;

/** 찍는 차례 — 화면 1 과 같다 */
export const ATTEMPT_SHOTS: readonly AttemptShotId[] = SHOTS.map((s) => s.id);

/** 이미 찍은 장을 넘기면 다음 장부터. 다 찍었으면 shot 이 null */
export function startAttemptRun(taken: Partial<Record<AttemptShotId, unknown>>, now: number): RunState {
  return startRun(taken, now);
}
