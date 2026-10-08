/**
 * ④ 가 점 찍기 도구(makeup-probe)로 직접 찍은 영역 — 랜드마크 번호 배열.
 * 가이드 테두리(overlay)·칠하기(makeup-paint)·채점 영역(personal-guide planGuide)이 같은 배열을 읽는다.
 * R = 이미지 왼쪽(eyeA) = 피험자 오른쪽. 닫힌 영역은 마지막 점을 첫 점과 겹쳐 찍었으므로 여기서 뺀다.
 * 입술은 기존 LM.lipsOuter 와 같은 20점이라 따로 두지 않는다 (landmarks.ts).
 */

import { at } from "./landmarks";
import type { Side } from "./score";
import type { Pt } from "./types";

const closed = (a: readonly number[]): readonly number[] => (a.length > 1 && a[0] === a[a.length - 1] ? a.slice(0, -1) : a);

export const PICKED = {
  brow: {
    R: closed([107, 55, 65, 52, 53, 70, 63, 105, 66, 107]),
    L: closed([285, 336, 296, 334, 293, 300, 283, 282, 295, 285]),
  },
  cheek: {
    R: closed([117, 118, 101, 36, 205, 123, 116, 117]),
    L: closed([346, 347, 330, 266, 425, 352, 345, 346]),
  },
  /** 속눈썹 선: 안쪽 → 바깥, 끝은 눈꼬리 바깥 점(130·359) */
  liner: {
    R: [133, 173, 157, 158, 159, 160, 161, 246, 33, 130],
    L: [362, 398, 384, 385, 386, 387, 388, 466, 263, 359],
  },
  /** 섀도우 두 경계. lo = 속눈썹 쪽, hi = 눈썹 쪽. 둘 다 안쪽 → 바깥, 시작·끝 점이 같다 */
  shadow: {
    R: {
      lo: [243, 133, 173, 157, 158, 159, 160, 161, 246, 33, 130],
      hi: [243, 190, 221, 222, 223, 224, 225, 124, 226, 130],
    },
    L: {
      lo: [463, 362, 398, 384, 385, 386, 387, 388, 466, 263, 359],
      hi: [463, 414, 441, 442, 443, 444, 445, 353, 446, 359],
    },
  },
} as const;

export const pickedPts = (lm: readonly Pt[], idx: readonly number[]): Pt[] => idx.map((i) => at(lm, i));

/**
 * 섀도 영역 다각형. 순서는 기존과 같다 — 속눈썹 선(바깥 → 안쪽) → 눈썹 쪽 경계(안쪽 → 바깥).
 * 첫 점이 바깥 끝이라 shadowTail(꼬리 연장)이 그대로 이어 붙는다.
 */
export function pickedShadowRegion(lm: readonly Pt[], side: Side): Pt[] {
  const { lo, hi } = PICKED.shadow[side];
  const idx: number[] = [...lo].reverse();
  idx.push(...hi.slice(1, -1));
  return pickedPts(lm, idx);
}
