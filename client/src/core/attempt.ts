/**
 * 화면 5 시도사진 — 장 순서 (2026-10-06 새 흐름, 모듈 ⑥). 순수 함수.
 *
 * 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 두 장만 찍는다. 찍는 규칙은 화면 1 과 같다 —
 * ① 의 capture-run(장 순서 · 카메라 자리 잡기 · 안정)과 flow.shotGate(정면 · 눈 · 크기 · 선명 · 밝기)를 그대로 쓴다.
 * ① 의 장 순서(flow.SHOTS)는 옆얼굴 45° 두 장까지 가지만, 그 둘을 이미 찍은 것으로 넘겨 정면 두 장에서 끝나게 한다 —
 * ① 의 코드는 고치지 않는다.
 */

import { startRun, type RunState } from "./capture-run";

export type AttemptShotId = "front_open" | "front_closed";

/** 찍는 차례 */
export const ATTEMPT_SHOTS: readonly AttemptShotId[] = ["front_open", "front_closed"];

/** 이미 찍은 장을 넘기면 다음 장부터. 다 찍었으면 shot 이 null */
export function startAttemptRun(taken: Partial<Record<AttemptShotId, unknown>>, now: number): RunState {
  return startRun({ ...taken, left_45: true, right_45: true }, now);
}
