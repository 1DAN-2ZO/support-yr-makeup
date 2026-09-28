/**
 * 화면 1 촬영 진행 (프레임마다 부른다): 지금 몇 번째 장인지, 조건 한 줄, 안정 프레임 수, 찍을 때인지.
 * 카메라·DOM 없이 돌아가서 테스트할 수 있다. 화면(screens/capture.ts)은 측정값만 넣는다.
 *
 * 정의서 1-6 상태: step0 → step1 → step2 → step3, "15초 넘으면 손·머리카락 확인 힌트".
 */

import { SHOT_TEXT, nextShot, shotGate, type ShotId, type ShotMeasure } from "./flow";
import type { GateResult } from "./types";

/** 단계 안내 (정의서 1-1 표 1-3) */
export const STEP_TEXT: Record<ShotId, string> = {
  front_open: "정면을 보고 눈을 떠 주세요",
  // 눈을 감으면 화면이 안 보인다 → 찍히면 소리(+진동)로 알린다 (2026-09-28 Android 실기기: "눈감고 찍는게 힘들었어")
  front_closed: "눈을 감고 기다리세요. 삑 소리가 나면 떠도 돼요",
  left_45: "고개를 왼쪽으로 45° 돌려 주세요",
  right_45: "고개를 오른쪽으로 45° 돌려 주세요",
};

/** 한 장을 이만큼 못 찍으면 힌트 한 줄 (정의서 1-6) */
export const SLOW_HINT_MS = 15000;
export const SLOW_HINT = "머리카락이나 손이 얼굴을 가리지 않았는지 확인해 주세요";

/**
 * 기준 장(정면 눈 뜸)은 카메라가 자리 잡은 뒤에 찍는다 (2026-09-28 Android 실내등 실측).
 * 켜자마자 0.8~2초 만에 찍히면 노출·화이트밸런스가 아직 움직이는 중이라 이마가 L 83.7·a 4.8·b 3.5 처럼 하얗게 날아간다.
 * 그 장이 기준이 되면 다음 장이 "밝기" 로 53초 막혔다. 사용자도 "켜지자마자 찍힌다" 고 했다.
 *  - minMs: 그 장 차례가 된 뒤 최소 이만큼은 기다린다 (준비할 틈)
 *  - settleMs 동안 이마 L* 의 폭이 settleL 이하여야 한다 (카메라가 멈췄다)
 */
export const BASE_SETTLE = { minMs: 1500, settleMs: 500, settleL: 2 } as const;

export interface Settle {
  notBefore: number;
  hist: readonly { t: number; L: number }[];
}

export function startSettle(now: number, opt = BASE_SETTLE): Settle {
  return { notBefore: now + opt.minMs, hist: [] };
}

/** 프레임마다. L 이 없으면(이마 못 잼) 기록을 비운다 */
export function settleStep(st: Settle, now: number, L: number | undefined, opt = BASE_SETTLE): { state: Settle; ready: boolean } {
  if (L === undefined || !Number.isFinite(L)) return { state: { ...st, hist: [] }, ready: false };
  const hist = [...st.hist.filter((h) => now - h.t <= opt.settleMs), { t: now, L }];
  const Ls = hist.map((h) => h.L);
  const spanOk = now - (hist[0]?.t ?? now) >= opt.settleMs * 0.8;
  const ready = now >= st.notBefore && spanOk && Math.max(...Ls) - Math.min(...Ls) <= opt.settleL;
  return { state: { ...st, hist }, ready };
}

export interface RunState {
  shot: ShotId | null;
  /** 조건을 연속으로 통과한 프레임 수 */
  stable: number;
  /** 이 장을 찍기 시작한 시각 */
  since: number;
  /** 기준 장(정면 눈 뜸)일 때만: 카메라가 자리 잡았나 */
  settle: Settle | null;
}

export function startRun(shots: Partial<Record<ShotId, unknown>>, now: number): RunState {
  const shot = nextShot(shots);
  return { shot, stable: 0, since: now, settle: shot === "front_open" ? startSettle(now) : null };
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
  let gate = shotGate(st.shot, { ...m, stableCount: stable });
  let settle = st.settle;
  if (settle) {
    const r = settleStep(settle, now, m.foreheadL);
    settle = r.state;
    // 다른 조건은 다 맞는데 카메라가 아직 자리 잡는 중 → "잠시만 그대로"
    if (gate.ok && !r.ready) gate = { ok: false, firstFail: "stable", text: SHOT_TEXT.stable, stableCount: stable };
  }
  const hint = !gate.ok && now - st.since >= SLOW_HINT_MS ? SLOW_HINT : null;
  return { state: { ...st, stable, settle }, gate, take: gate.ok, hint };
}
