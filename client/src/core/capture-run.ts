/**
 * 화면 1 촬영 진행 (프레임마다 부른다): 지금 몇 번째 장인지, 조건 한 줄, 안정 프레임 수, 찍을 때인지.
 * 카메라·DOM 없이 돌아가서 테스트할 수 있다. 화면(screens/capture.ts)은 측정값만 넣는다.
 *
 * 정의서 1-6 상태: step0 → step1 → step2 → step3, "15초 넘으면 손·머리카락 확인 힌트".
 */

import { nextShot, shotGate, type ShotId, type ShotMeasure } from "./flow";
import type { GateResult } from "./types";

/** 단계 안내 (정의서 1-1 표 1-3) */
export const STEP_TEXT: Record<ShotId, string> = {
  front_open: "정면을 보고 눈을 떠 주세요",
  // 눈을 감으면 화면이 안 보인다 → 찍히면 진동·소리로 알린다 (2026-09-28 Android 실기기: "눈감고 찍는게 힘들었어")
  front_closed: "눈을 감고 기다리세요. 진동이 오면 떠도 돼요",
  left_45: "고개를 왼쪽으로 45° 돌려 주세요",
  right_45: "고개를 오른쪽으로 45° 돌려 주세요",
};

/** 한 장을 이만큼 못 찍으면 힌트 한 줄 (정의서 1-6) */
export const SLOW_HINT_MS = 15000;
export const SLOW_HINT = "머리카락이나 손이 얼굴을 가리지 않았는지 확인해 주세요";

export interface RunState {
  shot: ShotId | null;
  /** 조건을 연속으로 통과한 프레임 수 */
  stable: number;
  /** 이 장을 찍기 시작한 시각 */
  since: number;
}

export function startRun(shots: Partial<Record<ShotId, unknown>>, now: number): RunState {
  return { shot: nextShot(shots), stable: 0, since: now };
}

export interface RunStep {
  state: RunState;
  gate: GateResult | null;
  /** 지금 이 프레임을 찍는다 */
  take: boolean;
  hint: string | null;
}

/** 측정 한 프레임. stableCount 는 여기서 채운다 */
export function runStep(st: RunState, m: ShotMeasure, now: number): RunStep {
  if (!st.shot) return { state: st, gate: null, take: false, hint: null };
  // 안정 빼고 다 맞는지 먼저 본다 → 맞으면 안정 +1, 아니면 0
  const pre = shotGate(st.shot, { ...m, stableCount: Number.MAX_SAFE_INTEGER });
  const stable = pre.ok ? st.stable + 1 : 0;
  const gate = shotGate(st.shot, { ...m, stableCount: stable });
  const hint = !gate.ok && now - st.since >= SLOW_HINT_MS ? SLOW_HINT : null;
  return { state: { ...st, stable }, gate, take: gate.ok, hint };
}
