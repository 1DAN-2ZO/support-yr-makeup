/**
 * 화면 4 표정 게이트 (#27) — 맨얼굴 정면 때 표정과 지금 표정이 얼마나 다른가. 순수 함수.
 *
 * 왜: 채점은 맨얼굴 사진을 지금 사진에 이동·회전·크기로만 겹친다(score.alignToBaseline, 모양은 안 휨).
 *     표정이 다르면(입 내밀기·웃음·찡그림) 비교 자리가 어긋나 잘 바른 화장도 틀렸다고 나온다.
 *     결정 D1(⑥ 합의, PR #125): 찍기 전에 막는다, 웃음 포함.
 *
 * 표정 값은 MediaPipe 블렌드셰이프(이름 → 0~1). 맨얼굴 값은 ① 이 Baseline 에 남긴다 (#177).
 * 부위마다 채점 자리를 흔드는 표정만 본다. 눈 깜빡임은 안 본다 — 라이너는 눈 감은 장도 쓰고, 깜빡임은 안정 조건이 거른다.
 */

import type { PartId } from "./types";

const SMILE = ["mouthSmileLeft", "mouthSmileRight", "cheekSquintLeft", "cheekSquintRight"] as const;
const EYES = ["eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"] as const;
const MOUTH = ["jawOpen", "mouthPucker", "mouthFunnel", "mouthPressLeft", "mouthPressRight", "mouthRollLower", "mouthRollUpper",
  "mouthStretchLeft", "mouthStretchRight", "mouthFrownLeft", "mouthFrownRight", "mouthLeft", "mouthRight"] as const;
const CHEEK = ["cheekPuff", "jawOpen"] as const;

/** 부위마다 보는 블렌드셰이프 */
export const EXPR_KEYS: Record<PartId, readonly string[]> = {
  brow: [...EYES, ...SMILE],
  liner: [...EYES, ...SMILE],
  shadow: [...EYES, ...SMILE],
  lip: [...MOUTH, ...SMILE],
  cheek: [...CHEEK, ...SMILE],
  contour: [...CHEEK, ...SMILE],
};

type Expr = Readonly<Record<string, number>>;

/**
 * 그 부위에서 본 표정 값들 중 가장 크게 달라진 양(0~1). 한쪽이라도 없으면 undefined — 게이트가 조건을 건너뛴다.
 * 한쪽에만 있는 이름은 건너뛴다 (모델·버전에 따라 빠질 수 있다)
 */
export function exprDiff(partId: PartId, base: Expr | null | undefined, cur: Expr | null | undefined): number | undefined {
  if (!base || !cur) return undefined;
  let max = 0;
  for (const k of EXPR_KEYS[partId]) {
    const a = base[k], b = cur[k];
    if (typeof a !== "number" || typeof b !== "number") continue;
    max = Math.max(max, Math.abs(a - b));
  }
  return max;
}
