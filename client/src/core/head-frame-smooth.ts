/**
 * I안 — 머리 움직임은 바로, 얼굴 모양 변화만 천천히 따라가기 (화면 4 테두리, 2026-10-02).
 *
 * 펜 끝을 눈꺼풀에 대면 MediaPipe 눈 점이 눈 폭 1.5% 쯤 떨린다(PC ?jump). 라이너 굵기는 눈 폭 2~6% 라 따라 그리기에 방해된다.
 * 그렇다고 점 전체에 떨림 필터를 세게 걸면 고개를 움직일 때 테두리가 늦게 따라온다(그래서 화면 4 필터는 거의 끈 10 · 1 · 5).
 * 그래서 둘을 나눈다:
 *  1) 잘 안 가려지는 점(이마 · 콧대·코 · 이마 옆 · 광대)으로 첫 장면 → 지금 머리 움직임(아핀, 튀는 점 무시)을 구하고
 *  2) 모든 점을 첫 장면 머리 기준 좌표로 되돌려 '모양 변화' 만 남긴 뒤 거기에만 떨림 필터(EYE_SMOOTH)를 걸고
 *  3) 다시 지금 머리 위치로 옮긴다.
 * 머리 움직임은 장면마다 그대로라 늦지 않고, 펜 때문에 순간적으로 떨리는 눈꺼풀은 걸러진다. 눈을 반쯤 감은 채 있는 건 0.3 초쯤 뒤 따라간다.
 * 테두리 그리기에만 쓴다 — 게이트 · 채점 묶음은 원래 점
 */

import { applyAffine, robustAffine, type Affine } from "./eye-fit";
import { HEAD_STABLE_IDS } from "./landmark-jump";
import { LandmarkSmoother } from "./smoothing";
import type { Pt } from "./types";

/** 모양 변화 떨림 필터 (One-Euro). 가정값 — 화면 4 ?eyesm=기준-반응성 으로 맞춘다 */
export const EYE_SMOOTH = { minCutoff: 1.5, beta: 0.05, dCutoff: 1 };

export function invertAffine(t: Affine): Affine | null {
  const [a, b, c, d, e, f] = t, det = a * e - b * d;
  if (Math.abs(det) < 1e-12) return null;
  return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det];
}

export function createHeadFrameSmoother(params: { minCutoff: number; beta: number; dCutoff: number } = EYE_SMOOTH): {
  step(lm: readonly Pt[] | null, t: number): Pt[] | null;
} {
  let ref: Pt[] | null = null;
  let sm: LandmarkSmoother | null = null;
  return {
    step(lm, t) {
      if (!lm) {
        sm?.smooth(null, t);
        ref = null;
        return null;
      }
      if (!ref || ref.length !== lm.length) {
        ref = lm.map((p) => ({ x: p.x, y: p.y }));
        sm = new LandmarkSmoother(Array.from({ length: lm.length }, (_, i) => i), params);
      }
      const ids = HEAD_STABLE_IDS.filter((i) => ref![i] && lm[i]);
      const h = robustAffine(ids.map((i) => ref![i]!), ids.map((i) => lm[i]!), 0.5);
      const inv = h ? invertAffine(h) : null;
      if (!h || !inv) return lm.map((p) => ({ x: p.x, y: p.y }));
      const local = lm.map((p) => applyAffine(inv, p));
      const smoothed = sm!.smooth(local, t) ?? local;
      return smoothed.map((p) => applyAffine(h, p));
    },
  };
}
