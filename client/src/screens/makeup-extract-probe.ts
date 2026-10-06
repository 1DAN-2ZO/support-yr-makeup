/**
 * [dev 전용] 화장 떼기 POC (makeup-extract-probe.html, 2026-10-06).
 * 맨얼굴 사진 + AI 가 입힌 화장 사진 → 얼굴 점으로 겹치기(튀는 점 무시한 아핀) → core/makeup-extract 로 떼기 →
 * 맨얼굴 위에 가이드(테두리 + 퍼지는 방향), AI 사진 위에도 같은 선. 사진은 브라우저 안에서만 쓴다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { deltaE, foreheadLab, labAt, type RgbaImage } from "@core/color";
import { applyAffine, robustAffine, type Affine } from "@core/eye-fit";
import { extractCheek, type ExtractedBlob } from "@core/makeup-extract";
import type { Outline } from "@core/overlay";
import { spreadMarks } from "@core/spread-marks";
import type { Pt } from "@core/types";
import { createLandmarker } from "./landmarker";
import { strokeOutline } from "./outline-draw";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const bareIn = $<HTMLInputElement>("bare"), madeIn = $<HTMLInputElement>("made"), heat = $<HTMLInputElement>("heat");
const cvBare = $<HTMLCanvasElement>("cvBare"), cvMade = $<HTMLCanvasElement>("cvMade"), statusEl = $("status");

let landmarker: Promise<FaceLandmarker> | null = null;
let bareImg: ImageBitmap | null = null, madeImg: ImageBitmap | null = null;
let last: { bare: RgbaImage; made: RgbaImage; lm: Pt[]; outline: Outline; R: ExtractedBlob | null; L: ExtractedBlob | null } | null = null;

const setStatus = (text: string, warn = false): void => { statusEl.innerHTML = warn ? `<span class="warn">${text}</span>` : text; };

async function lmOf(img: ImageBitmap): Promise<Pt[] | null> {
  landmarker ??= createLandmarker("IMAGE", { blendshapes: false });
  const face = (await landmarker).detect(img).faceLandmarks[0];
  return face && face.length >= 478 ? face.map((p) => ({ x: p.x * img.width, y: p.y * img.height })) : null;
}

function rgbaOf(c: HTMLCanvasElement): RgbaImage {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: d.width, h: d.height };
}

/** AI 사진을 맨얼굴 크기 · 자리로 (made 점 → bare 점 아핀) */
function aligned(made: ImageBitmap, t: Affine, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.setTransform(t[0], t[3], t[1], t[4], t[2], t[5]);
  g.drawImage(made, 0, 0);
  return c;
}

function draw(cv: HTMLCanvasElement, im: RgbaImage, o: Outline | null, heatOf?: { bare: RgbaImage; lm: Pt[] }): void {
  cv.width = im.w; cv.height = im.h;
  const g = cv.getContext("2d")!;
  const id = new ImageData(new Uint8ClampedArray(im.data), im.w, im.h);
  if (heatOf) {
    // 색 차(이마로 톤을 뺀 ΔE)를 밝기로 — 0 검정 · 15 이상 흰색
    const a = foreheadLab(heatOf.bare, heatOf.lm), b = foreheadLab(im, heatOf.lm);
    const s = a && b ? { L: b.L - a.L, a: b.a - a.a, b: b.b - a.b } : { L: 0, a: 0, b: 0 };
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const m = labAt(im, x, y), v = Math.min(255, (deltaE(labAt(heatOf.bare, x, y), { L: m.L - s.L, a: m.a - s.a, b: m.b - s.b }) / 15) * 255), i = (y * im.w + x) * 4;
      id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v;
    }
  }
  g.putImageData(id, 0, 0);
  if (o) strokeOutline(g, o, Math.max(2, im.w / 400));
}

function render(): void {
  if (!last) return;
  draw(cvBare, last.bare, last.outline);
  draw(cvMade, last.made, last.outline, heat.checked ? { bare: last.bare, lm: last.lm } : undefined);
}

const fmt = (s: string, e: ExtractedBlob | null): string =>
  e ? `${s}: 가운데 (${e.center.x.toFixed(0)}, ${e.center.y.toFixed(0)}) · 크기 ${e.rx.toFixed(0)}×${e.ry.toFixed(0)}px · 기울기 ${e.angleDeg.toFixed(0)}° · 가장 진한 곳 색 차 ${e.peakDeltaE.toFixed(1)}` : `${s}: 블러셔 없음`;

async function run(): Promise<void> {
  if (!bareImg || !madeImg) return;
  setStatus("얼굴 점을 찾는 중…");
  const [bl, ml] = await Promise.all([lmOf(bareImg), lmOf(madeImg)]);
  if (!bl || !ml) { setStatus(!bl ? "맨얼굴 사진에서 얼굴을 못 찾았어요" : "AI 화장 사진에서 얼굴을 못 찾았어요", true); return; }
  // 두 사진 겹치기: 얼굴 점 468개로 아핀 — 튀는 점은 무시 (AI 가 윤곽을 조금 바꿔도)
  const ids = Array.from({ length: 468 }, (_, i) => i);
  const t = robustAffine(ids.map((i) => ml[i]!), ids.map((i) => bl[i]!), 1);
  if (!t) { setStatus("두 사진을 겹치지 못했어요", true); return; }
  const resid = ids.reduce((s, i) => s + Math.hypot(applyAffine(t, ml[i]!).x - bl[i]!.x, applyAffine(t, ml[i]!).y - bl[i]!.y), 0) / ids.length;
  const bc = document.createElement("canvas");
  bc.width = bareImg.width; bc.height = bareImg.height;
  bc.getContext("2d", { willReadFrequently: true })!.drawImage(bareImg, 0, 0);
  const bare = rgbaOf(bc), made = rgbaOf(aligned(madeImg, t, bc.width, bc.height));
  setStatus("떼는 중…");
  await new Promise((r) => setTimeout(r, 0));
  const t0 = performance.now(), got = extractCheek(bare, made, bl), ms = Math.round(performance.now() - t0);
  const polys = [got.R?.outline, got.L?.outline].filter((p): p is Pt[] => !!p);
  const marks = spreadMarks("cheek", polys);
  last = { bare, made, lm: bl, outline: { polys, lines: [], dots: marks.dots, arrows: marks.arrows }, R: got.R, L: got.L };
  render();
  const eyeW = Math.hypot(bl[33]!.x - bl[133]!.x, bl[33]!.y - bl[133]!.y);
  setStatus([
    `겹치기 오차 평균 ${resid.toFixed(1)}px (눈 폭의 ${((resid / eyeW) * 100).toFixed(1)}%) · 떼기 ${ms}ms`,
    fmt("사진 왼쪽 볼", got.R), fmt("사진 오른쪽 볼", got.L),
  ].join("\n"));
}

async function load(input: HTMLInputElement): Promise<ImageBitmap | null> {
  const f = input.files?.[0];
  return f ? createImageBitmap(f) : null;
}
bareIn.addEventListener("change", async () => { bareImg = await load(bareIn); void run(); });
madeIn.addEventListener("change", async () => { madeImg = await load(madeIn); void run(); });
heat.addEventListener("change", render);
