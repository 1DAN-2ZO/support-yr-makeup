/**
 * 화면 3 완성본에 쓸 그림과 그 그림 위의 얼굴 점 고르기 (#182). 순수 함수.
 *
 * 서버 완성본(Stable-Makeup)이 빠져서(#179) 완성본 = **2-b AR 장면**("화장하러 가기" 를 누른 순간, ⑥ ar-frame-store).
 * 사용자가 2-b 에서 본 그 얼굴 그대로라 "본 것 = 완성본 = 테두리 = 채점" 이 된다.
 *  - AR 장면은 카메라 앞 다른 순간이라 맨얼굴과 구도가 다르다 → **장면과 함께 저장된 점**을 쓴다
 *  - 장면이 없으면(AR 이 안 켜짐 · 다른 화장 · 앱을 다시 켬) 쌩얼 + 맨얼굴 점 — 흐름은 안 막는다
 * 사진·점은 둘 다 안 뒤집힌 카메라 좌표다. 거울은 화면이 그릴 때 한 번만.
 */

import type { ArFrame } from "./ar-frame-store";
import type { Baseline, Pt } from "./types";

export type CompletedSource =
  | { from: "ar"; image: Blob; lm: Pt[]; w: number; h: number }
  | { from: "bare"; image: NonNullable<Baseline["bareImage"]>; lm: Pt[]; w: number; h: number };

const LANDMARKS = 478;

export function completedSource(ar: ArFrame | null, baseline: Baseline | null): CompletedSource | null {
  if (ar && ar.lm.length >= LANDMARKS) return { from: "ar", image: ar.image, lm: ar.lm, w: ar.w, h: ar.h };
  if (baseline?.bareImage && baseline.lm.length) return { from: "bare", image: baseline.bareImage, lm: baseline.lm, w: baseline.w, h: baseline.h };
  return null;
}
