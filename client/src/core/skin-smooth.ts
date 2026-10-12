/**
 * 피부 정돈 (2026-10-12, ②) — 맨얼굴 · 시도사진을 저장하기 전에 피부의 잔결(모공 · 잡티 · 붉은 점)만 부드럽게 한다.
 *
 * 얼굴 윤곽 안에서 눈 · 눈썹 · 입술(조금 넓혀서)을 뺀 피부에만, 가장자리를 살리는 부드럽게 하기(가이드 필터)를 섞는다.
 * 맨얼굴을 정돈하면 그 사진으로 만드는 정답사진 · 옮긴 그림도 정돈된 피부로 나온다 (모델이 맨얼굴의 피부결을 따라 그린다).
 *
 * 실사진 시험 (2026-10-12, 맨얼굴 3명 × 참고 3종 · 팀원 맨얼굴 + 실제 화장 사진):
 *   - 부위 가이드는 거의 그대로 — 원본과 정돈본 가이드 겹침 입술 1.00 · 섀도 0.96 ~ 0.99 · 눈썹 0.94 ~ 0.99
 *   - 피드백 문장은 16 경우 모두 그대로, 섀도 "칠한 양" 은 ±0.03 안
 *   - 그래서 채점을 돕는 장치가 아니라 보여 주는 사진(정답사진 · 시도사진)을 정돈해 보이게 하는 것이다
 */

import type { RgbaImage } from "./color";
import { pointInPoly } from "./color";
import { LM } from "./landmarks";
import { FACE_OVAL } from "./makeup-extract";
import type { Pt } from "./types";

/**
 * on: 끄면 아무것도 안 한다 · strength: 정돈한 것을 섞는 비율 (0 ~ 1) · radius: 부드럽게 하는 반경 · eps: 이보다 고르지 않은 곳(점 · 진한 선)은 살린다
 * (밝기 0 ~ 255 의 제곱) · hole: 눈 · 눈썹 · 입술을 빼는 자리를 넓히는 폭 · feather: 피부 자리 가장자리를 부드럽게 하는 폭 (길이는 눈 폭 비율)
 */
export const SKIN_SMOOTH = { on: true, strength: 0.7, radius: 0.06, eps: 18 * 18, hole: 0.12, feather: 0.08 };

/** 가로 · 세로 상자 평균 (반경 r) */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/** 점들의 가운데에서 바깥으로 d 만큼 넓힌 다각형 */
function grow(poly: readonly Pt[], d: number): Pt[] {
  const c = { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length };
  return poly.map((p) => { const l = Math.hypot(p.x - c.x, p.y - c.y) || 1; return { x: p.x + ((p.x - c.x) / l) * d, y: p.y + ((p.y - c.y) / l) * d }; });
}

/** 피부 정돈 — im 을 제자리에서 바꾼다. lm 은 im px 좌표 (478 점). 얼굴 점이 모자라거나 끄면 그대로 */
export function smoothSkin(im: RgbaImage, lm: readonly Pt[], o = SKIN_SMOOTH): void {
  if (!o.on || lm.length < 468) return;
  const P = (ids: readonly number[]) => ids.map((i) => lm[i]!);
  const ew = Math.hypot(lm[LM.eyeA.outer]!.x - lm[LM.eyeA.inner]!.x, lm[LM.eyeA.outer]!.y - lm[LM.eyeA.inner]!.y);
  if (!(ew > 0)) return;
  const oval = P(FACE_OVAL);
  const holes = [
    ...[LM.eyeA, LM.eyeB].map((e) => [...P(e.upper), ...P([...e.lower].reverse())]),
    ...[LM.browA, LM.browB].map((b) => [...P(b.upper), ...P([...b.lower].reverse())]),
    P(LM.lipsOuter),
  ].map((p) => grow(p, o.hole * ew));
  const x0 = Math.max(0, Math.floor(Math.min(...oval.map((p) => p.x)))), x1 = Math.min(im.w - 1, Math.ceil(Math.max(...oval.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...oval.map((p) => p.y)))), y1 = Math.min(im.h - 1, Math.ceil(Math.max(...oval.map((p) => p.y))));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w < 8 || h < 8) return;

  // 피부 자리 — 4 배 줄인 칸에 칠하고 흐려서 가장자리를 부드럽게. 구멍(눈 · 눈썹 · 입술) 안은 0 으로 되돌려 한 픽셀도 안 바꾼다
  const s = 4, mw = Math.ceil(w / s), mh = Math.ceil(h / s);
  let m = new Float32Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = x0 + i * s + s / 2, y = y0 + j * s + s / 2;
    m[j * mw + i] = pointInPoly(x, y, oval) && !holes.some((p) => pointInPoly(x, y, p)) ? 1 : 0;
  }
  const fr = Math.max(1, Math.round((o.feather * ew) / s));
  m = boxMean(boxMean(m, mw, mh, fr), mw, mh, fr);
  const weight = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    const k = m[Math.min(mh - 1, (y / s) | 0) * mw + Math.min(mw - 1, (x / s) | 0)]!;
    weight[y * w + x] = k > 0 && pointInPoly(X, Y, oval) && !holes.some((p) => pointInPoly(X, Y, p)) ? o.strength * k : 0;
  }

  // 가이드 필터 — 채널마다 자기 자신을 길잡이로: 고른 곳은 평균으로, 고르지 않은 곳(eps 보다 큰 변화)은 그대로
  const r = Math.max(2, Math.round(o.radius * ew)), n = w * h;
  for (let c = 0; c < 3; c++) {
    const I = new Float32Array(n), II = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = im.data[((y0 + y) * im.w + x0 + x) * 4 + c]!; I[y * w + x] = v; II[y * w + x] = v * v; }
    const mI = boxMean(I, w, h, r), mII = boxMean(II, w, h, r), A = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = mII[i]! - mI[i]! * mI[i]!, a = v / (v + o.eps); A[i] = a; B[i] = mI[i]! - a * mI[i]!; }
    const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r);
    for (let i = 0; i < n; i++) {
      const k = weight[i]!;
      if (k <= 0) continue;
      const x = i % w, y = (i / w) | 0;
      im.data[((y0 + y) * im.w + x0 + x) * 4 + c] = I[i]! * (1 - k) + (mA[i]! * I[i]! + mB[i]!) * k;
    }
  }
}
