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
 *  - 고개가 창 안에서 poseDeg 넘게 움직이면 이마에 비치는 빛이 바뀌는 것이라 가림으로 보지 않는다. 가림 중이면 풀고 창을 비운다
 *    (2026-09-23 iPad 실측: 고개 돌 때 이마 ΔE p99 18.6, 가림 없이 프레임 21% 가 가림으로 잡혀 45° 장이 안 찍혔다)
 * jumpDE 20 확정 (2026-09-23 iPad 가림 측정, 3초씩 최대 ΔE): 가만히 3.0 · 불 끄고 켜기 2.8 | 손 63.1 · 브러시 43.8 → 둘 다 잡힘.
 * 앞머리는 천천히 내려와 18.5 라 안 잡힌다 — 낮추면 촬영 중 자연 변동(p99 18)과 겹치므로 찍기 전 안내(CAPTURE_GUIDE)에 맡긴다.
 * 어두울 때 (2026-09-28 Android 어두움 실측): 카메라 잡음으로 손을 안 댔는데 이마 급변이 최대 39.8 (밝을 때 p99 3.5),
 * "가리지 말아 주세요" 가 130프레임 떠 첫 장이 48초 걸렸다 → 창 안 L* 중앙값(가림 중이면 가리기 전 값)이 darkL 미만이면 jumpDE·releaseDE 를 darkScale 배.
 * **가정값** (40 = 어두움 최대 39.8 과 손 63 사이). 촬영 세션(#58)에서 어두울 때 손·브러시 값을 재고 확정한다.
 */
export const FOREHEAD_JUMP = { windowMs: 300, jumpDE: 20, releaseDE: 8, settleMs: 1500, poseDeg: 5, darkL: 50, darkScale: 2 } as const;

export interface ForeheadTrack {
  /** 최근 windowMs 안의 이마 값 (오래된 것부터) */
  hist: readonly { t: number; lab: Lab; yaw: number; pitch: number }[];
  /** 가림이면 가리기 전 값, 아니면 null */
  ref: Lab | null;
  /** 가림 중 마지막으로 크게 움직인 시각 */
  movedAt: number;
}

function medianL(h: readonly { lab: Lab }[]): number {
  const v = h.map((x) => x.lab.L).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] ?? 0;
}

export function startForeheadTrack(): ForeheadTrack {
  return { hist: [], ref: null, movedAt: 0 };
}

/** 프레임마다 부른다. yaw·pitch 는 도(°). jump = 이번 창 안에서 바뀐 폭 (기록용) */
export function foreheadStep(
  tr: ForeheadTrack, t: number, lab: Lab, pose: { yaw: number; pitch: number }, opt = FOREHEAD_JUMP,
): { track: ForeheadTrack; occluded: boolean; jump: number } {
  const now = { t, lab, yaw: pose.yaw, pitch: pose.pitch };
  let hist = [...tr.hist.filter((h) => t - h.t <= opt.windowMs), now];
  const first = hist[0]!;
  if (Math.abs(pose.yaw - first.yaw) > opt.poseDeg || Math.abs(pose.pitch - first.pitch) > opt.poseDeg) {
    return { track: { hist: [now], ref: null, movedAt: t }, occluded: false, jump: 0 };
  }
  const oldest = first.lab;
  const jump = deltaE(lab, oldest);
  let { ref, movedAt } = tr;
  // 어두우면 잡음이 커서 임계를 올린다. 가림 중이면 가리기 전 값(ref), 아니면 창 안 L* 의 중앙값으로 본다
  // — 잡음 한 프레임이 튀어도 창 시작이 "밝음" 으로 안 바뀌고, 밝은 이마를 손이 막 가린 순간은 여전히 밝음(임계 20)이다
  const k = (ref ? ref.L : medianL(hist)) < opt.darkL ? opt.darkScale : 1;
  const jumpDE = opt.jumpDE * k, releaseDE = opt.releaseDE * k;
  if (ref === null) {
    if (jump > jumpDE) { ref = oldest; movedAt = t; }
  } else if (deltaE(lab, ref) < releaseDE) {
    ref = null;
  } else if (jump > releaseDE) {
    movedAt = t;
  } else if (t - movedAt >= opt.settleMs) {
    ref = null;
  }
  // 풀린 순간 창에 남은 가림 값과 다시 비교해 곧바로 또 걸리지 않게 창을 비운다
  if (tr.ref !== null && ref === null) hist = [now];
  return { track: { hist, ref, movedAt }, occluded: ref !== null, jump };
}
