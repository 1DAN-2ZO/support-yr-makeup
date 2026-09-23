/**
 * 확인받기 프레임 묶음 (2-2, #22). 버튼을 누른 직후 연속 프레임을 모아 CaptureBundle 로 만든다.
 *
 * ② 가 하는 일: 장마다 랜드마크·손 여부·이마 L* 를 붙여 넘긴다.
 * ③ 이 하는 일(#34): 각 장을 정렬해 평균, 손 걸린 장 제외, 전부 손이면 check_only(reason='hand').
 * 그래서 여기서는 **데이터를 못 만드는 장만** 뺀다 — 얼굴 없음·깨진 랜드마크·이마 L* 못 잼.
 * 손 걸린 장은 빼지 않고 handOverlap 으로 표시만 한다 (손 검출 전에는 null = 안 쟀음).
 *
 * 브라우저 객체 없이 도는 순수 로직. 이미지 타입은 제네릭 — 앱에서는 ImageBitmap, 검증에서는 아무 값.
 */

import type { CaptureBundle, GateFail, Pt } from "./types";

export interface BundleLimits {
  /** 이만큼 모이면 바로 끝낸다 */
  want: number;
  /** 시간이 다 됐을 때 최소 이만큼은 있어야 한다 */
  min: number;
  /** 첫 프레임부터 이 시간(ms)이 지나면 있는 만큼으로 끝내거나 실패한다 */
  maxMs: number;
}

/** 정의서 F-07 "3~5프레임". rVFC 한 장 약 31ms(S23) → 5장 약 150ms. 깜빡임·흔들림으로 빠지는 장을 감안해 0.5초까지 본다 */
export const BUNDLE_LIMITS: BundleLimits = { want: 5, min: 3, maxMs: 500 };

export interface BundleFrame<I> {
  image: I;
  /** 478점 px. 얼굴을 못 찾았으면 null */
  lm: readonly Pt[] | null;
  /** 손이 부위에 걸렸나. 손 검출을 안 돌렸으면 null */
  handOverlap: boolean | null;
  /** 이마 L*. 못 쟀으면 null */
  foreheadL: number | null;
  /** 프레임 시각(ms) */
  t: number;
}

export type BundleOf<I> = Omit<CaptureBundle, "frames"> & { frames: I[] };

export type BundleState<I> =
  | { status: "collecting"; n: number }
  | { status: "done"; bundle: BundleOf<I> }
  | { status: "failed"; reason: GateFail };

const LANDMARKS = 478;

/** 쓸 수 있는 장인가. NaN 은 모든 비교를 통과해 버리므로 먼저 거른다 (① flow.ts measureFinite 와 같은 이유) */
function usable<I>(f: BundleFrame<I>): f is BundleFrame<I> & { lm: readonly Pt[]; foreheadL: number } {
  if (!f.lm || f.lm.length !== LANDMARKS) return false;
  if (f.foreheadL === null || !Number.isFinite(f.foreheadL)) return false;
  return f.lm.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function createBundleCollector<I = ImageBitmap>(limits: BundleLimits = BUNDLE_LIMITS): { push(f: BundleFrame<I>): BundleState<I> } {
  const kept: (BundleFrame<I> & { lm: readonly Pt[]; foreheadL: number })[] = [];
  let start: number | null = null;
  let end: BundleState<I> | null = null;

  const finish = (): BundleState<I> => ({
    status: "done",
    bundle: {
      frames: kept.map((f) => f.image),
      pts: kept.map((f) => f.lm.map((p) => ({ x: p.x, y: p.y }))),
      handOverlap: kept.map((f) => f.handOverlap),
      foreheadL: kept.map((f) => f.foreheadL),
    },
  });

  return {
    push(f) {
      if (end) return end;
      if (start === null) start = f.t;
      if (usable(f)) kept.push(f);
      if (kept.length >= limits.want) return (end = finish());
      if (f.t - start > limits.maxMs) {
        return (end = kept.length >= limits.min ? finish() : { status: "failed", reason: "face" });
      }
      return { status: "collecting", n: kept.length };
    },
  };
}
