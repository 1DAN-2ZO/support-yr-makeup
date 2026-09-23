/**
 * 촬영 가림 판정 — 이마(비화장 참조)가 갑자기 변하면 뭔가 얼굴을 가린 것 (2026-09-23 #144).
 *
 * 손 검출·셀피 분할 모델은 쓰지 않는다 (첫 로딩: 손 7.46MB, 분할 16.4MB). 손·머리카락·브러시·퍼프·마스크를
 * 가리지 않고 한 조건 "얼굴을 가리지 말아 주세요" 로 잡는다. 순수 함수만.
 * 한계: 이마만 보므로 턱·볼 근처 가림은 놓친다 → 실측에서 보이면 코·턱 참조를 Baseline 에 더한다.
 */

import { deltaE } from "./color";
import type { Lab } from "./color";

/**
 * 새 모델 없이 비화장 참조(이마)만 본다. 화장 부위는 변해야 정상이라 안 본다.
 *  - windowMs 사이 이마 Lab 이 jumpDE 넘게 바뀌면 "가림" (조명은 서서히, 가림은 갑자기)
 *  - 가림 동안: 가리기 전 값(ref)으로 releaseDE 안쪽까지 돌아오면 풀림
 *  - 불이 확 켜진 것처럼 새 값에서 settleMs 동안 가만히 있으면 조명 변화로 보고 풀림 → 그 뒤는 밝기·색 조건이 맡는다
 * 임계는 가정값. 폰 프로브의 이마 급변 기록(jumpMax)으로 확정한다.
 */
export const FOREHEAD_JUMP = { windowMs: 300, jumpDE: 10, releaseDE: 5, settleMs: 3000 } as const;

export interface ForeheadTrack {
  /** 최근 windowMs 안의 이마 값 (오래된 것부터) */
  hist: readonly { t: number; lab: Lab }[];
  /** 가림이면 가리기 전 값, 아니면 null */
  ref: Lab | null;
  /** 가림 중 마지막으로 크게 움직인 시각 */
  movedAt: number;
}

export function startForeheadTrack(): ForeheadTrack {
  return { hist: [], ref: null, movedAt: 0 };
}

/** 프레임마다 부른다. jump = 이번 창 안에서 바뀐 폭 (기록용) */
export function foreheadStep(
  tr: ForeheadTrack, t: number, lab: Lab, opt = FOREHEAD_JUMP,
): { track: ForeheadTrack; occluded: boolean; jump: number } {
  let hist = [...tr.hist.filter((h) => t - h.t <= opt.windowMs), { t, lab }];
  const oldest = hist[0]!.lab;
  const jump = deltaE(lab, oldest);
  let { ref, movedAt } = tr;
  if (ref === null) {
    if (jump > opt.jumpDE) { ref = oldest; movedAt = t; }
  } else if (deltaE(lab, ref) < opt.releaseDE) {
    ref = null;
  } else if (jump > opt.releaseDE) {
    movedAt = t;
  } else if (t - movedAt >= opt.settleMs) {
    ref = null;
  }
  // 풀린 순간 창에 남은 가림 값과 다시 비교해 곧바로 또 걸리지 않게 창을 비운다
  if (tr.ref !== null && ref === null) hist = [{ t, lab }];
  return { track: { hist, ref, movedAt }, occluded: ref !== null, jump };
}
