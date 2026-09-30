/**
 * 촬영 게이트용 픽셀 측정 (비디오 프레임에서). 프로브(capture-probe)와 화면 1(capture)이 같이 쓴다.
 *  - sharpnessOf: 얼굴 크롭 96px 폭 라플라시안 분산
 *  - foreheadLabOf: 320px 폭으로 줄여 이마 L*a*b* — skin(앞머리 뺀 피부, 밝기·색 조건) · raw(전체 평균, 가림 판정)
 *  - grabFrame: 지금 프레임을 캔버스로 (자동 촬영)
 */

import { foreheadLab, foreheadRawLab, type Lab } from "@core/color";
import type { Pt } from "@core/types";

type Src = HTMLVideoElement;

const tiny = document.createElement("canvas");
const tctx = tiny.getContext("2d", { willReadFrequently: true });

export function sharpnessOf(src: Src, crop: { x: number; y: number; w: number; h: number }): number {
  if (!tctx || crop.w <= 0 || crop.h <= 0) return 0;
  const w = 96, h = Math.max(8, Math.round((96 * crop.h) / crop.w));
  tiny.width = w; tiny.height = h;
  tctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const px = tctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * (px[i * 4] ?? 0) + 0.587 * (px[i * 4 + 1] ?? 0) + 0.114 * (px[i * 4 + 2] ?? 0);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * (g[i] ?? 0) - (g[i - 1] ?? 0) - (g[i + 1] ?? 0) - (g[i - w] ?? 0) - (g[i + w] ?? 0);
    sum += v; sum2 += v * v; n++;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

const small = document.createElement("canvas");
const sctx = small.getContext("2d", { willReadFrequently: true });

/** 이마 두 값: skin = 밝기·색 조건(앞머리 뺌, 대부분 가려지면 없음) · raw = 가림(급변) 판정(손도 그대로 보이게) — #212 리뷰 */
export interface ForeheadRefs { skin?: Lab; raw?: Lab }

export function foreheadLabOf(src: Src, lm: readonly Pt[], sw: number, sh: number): ForeheadRefs | undefined {
  if (!sctx) return undefined;
  const w = 320, h = Math.round((sh * w) / sw), k = w / sw;
  small.width = w; small.height = h;
  sctx.drawImage(src, 0, 0, w, h);
  const im = sctx.getImageData(0, 0, w, h);
  const img = { data: im.data, w, h }, pts = lm.map((p) => ({ x: p.x * k, y: p.y * k }));
  const skin = foreheadLab(img, pts), raw = foreheadRawLab(img, pts);
  return { ...(skin ? { skin } : {}), ...(raw ? { raw } : {}) };
}

/** 지금 프레임을 캔버스로. maxSide 를 주면 긴 변을 그만큼으로 줄인다 (얼굴형 프레임 5장 — 메모리) */
export function grabFrame(src: Src, maxSide = Infinity): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(src.videoWidth, src.videoHeight));
  const cv = document.createElement("canvas");
  cv.width = Math.round(src.videoWidth * k); cv.height = Math.round(src.videoHeight * k);
  cv.getContext("2d")?.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}
