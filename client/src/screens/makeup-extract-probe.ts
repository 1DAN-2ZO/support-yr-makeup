/**
 * [dev 전용] 화장 떼기 POC (makeup-extract-probe.html, 2026-10-06).
 * 맨얼굴 사진 + AI 가 입힌 화장 사진 → 얼굴 점으로 겹치기(튀는 점 무시한 아핀) → core/makeup-extract extractAll 로 부위마다 떼기 →
 *  - 뗀 화장만: 회색 바탕 위에 뗀 픽셀만 AI 색 그대로 (사람 얼굴 위에서는 잘 안 보여서 — 사용자)
 *  - 맨얼굴 · AI 사진 위에 부위별 색 테두리
 * 부위마다 켜고 끈다. 얼굴 둘레만 잘라 크게 보여 준다. 사진은 브라우저 안에서만 쓴다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { deltaE, foreheadLab, labAt, type RgbaImage } from "@core/color";
import { applyAffine, robustAffine, type Affine } from "@core/eye-fit";
import { EXTRACT, extractAll, type ExtractPart, type PartMask } from "@core/makeup-extract";
import type { Pt } from "@core/types";
import { createLandmarker } from "./landmarker";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const bareIn = $<HTMLInputElement>("bare"), madeIn = $<HTMLInputElement>("made"), heat = $<HTMLInputElement>("heat");
const optBlur = $<HTMLInputElement>("optBlur"), optMap = $<HTMLInputElement>("optMap"), optChroma = $<HTMLInputElement>("optChroma");
const cvOnly = $<HTMLCanvasElement>("cvOnly"), cvBare = $<HTMLCanvasElement>("cvBare"), cvMade = $<HTMLCanvasElement>("cvMade");
const statusEl = $("status"), partsEl = $("parts");

const PARTS: { id: ExtractPart; name: string; color: [number, number, number] }[] = [
  { id: "lip", name: "입술", color: [255, 59, 92] },
  { id: "brow", name: "눈썹", color: [255, 159, 28] },
  { id: "liner", name: "아이라이너", color: [0, 209, 255] },
  { id: "shadow", name: "아이섀도", color: [177, 75, 255] },
  { id: "underShadow", name: "아래 섀도", color: [224, 123, 255] },
  { id: "cheek", name: "블러셔", color: [255, 126, 182] },
  { id: "contour", name: "쉐딩 (참고)", color: [160, 82, 45] },
  { id: "highlight", name: "하이라이트 (참고)", color: [255, 225, 77] },
];
const on = new Set<ExtractPart>(PARTS.map((p) => p.id));

let landmarker: Promise<FaceLandmarker> | null = null;
let bareImg: ImageBitmap | null = null, madeImg: ImageBitmap | null = null;
let last: { bare: RgbaImage; made: RgbaImage; lm: Pt[]; parts: PartMask[]; crop: { x: number; y: number; w: number; h: number }; info: string } | null = null;

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

/** 켠 부위의 픽셀 → 그 부위 번호(+1), 없으면 0 */
function labelMap(parts: readonly PartMask[], n: number): Uint8Array {
  const lab = new Uint8Array(n);
  for (const p of parts) {
    if (!on.has(p.part)) continue;
    const k = PARTS.findIndex((q) => q.id === p.part) + 1;
    for (let i = 0; i < n; i++) if (p.mask[i]) lab[i] = k;
  }
  return lab;
}

/** 자른 자리(crop)만 새 캔버스로. 배경 그리기 → 부위 테두리(두께 lw) */
function compose(cv: HTMLCanvasElement, w: number, crop: NonNullable<typeof last>["crop"], lab: Uint8Array, pixel: (i: number) => [number, number, number] | null) {
  cv.width = crop.w; cv.height = crop.h;
  const g = cv.getContext("2d")!, id = g.createImageData(crop.w, crop.h), lw = Math.max(1, Math.round(crop.w / 450));
  for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
    const i = (crop.y + y) * w + (crop.x + x), o = (y * crop.w + x) * 4, k = lab[i]!;
    let c = pixel(i);
    if (k) {
      // 테두리: 둘레 lw 안에 다른 부위(또는 없음)가 있으면
      let edge = false;
      for (let d = 1; d <= lw && !edge; d++) {
        if (lab[i - d] !== k || lab[i + d] !== k || lab[i - d * w] !== k || lab[i + d * w] !== k) edge = true;
      }
      if (edge) c = PARTS[k - 1]!.color;
    }
    if (!c) continue;
    id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);
}

function render(): void {
  if (!last) return;
  const { bare, made, lm, parts, crop } = last, w = bare.w, lab = labelMap(parts, w * bare.h);
  const rgb = (im: RgbaImage, i: number): [number, number, number] => [im.data[i * 4]!, im.data[i * 4 + 1]!, im.data[i * 4 + 2]!];
  // 뗀 화장만: 회색 바탕 + 뗀 픽셀은 AI 색
  compose(cvOnly, w, crop, lab, (i) => (lab[i] ? rgb(made, i) : [233, 233, 233]));
  compose(cvBare, w, crop, lab, (i) => rgb(bare, i));
  if (heat.checked) {
    const a = foreheadLab(bare, lm), b = foreheadLab(made, lm), s = a && b ? { L: b.L - a.L, a: b.a - a.a, b: b.b - a.b } : { L: 0, a: 0, b: 0 };
    compose(cvMade, w, crop, lab, (i) => {
      const x = i % w, y = Math.floor(i / w), m = labAt(made, x, y);
      const v = Math.min(255, (deltaE(labAt(bare, x, y), { L: m.L - s.L, a: m.a - s.a, b: m.b - s.b }) / 15) * 255);
      return [v, v, v];
    });
  } else compose(cvMade, w, crop, lab, (i) => rgb(made, i));
}

function drawPartList(parts: readonly PartMask[]): void {
  partsEl.replaceChildren(...PARTS.map((p) => {
    const mine = parts.filter((q) => q.part === p.id), n = mine.reduce((s, q) => s + q.count, 0);
    const label = document.createElement("label");
    if (!n) label.className = "none";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = on.has(p.id);
    cb.addEventListener("change", () => { if (cb.checked) on.add(p.id); else on.delete(p.id); render(); });
    const sw = document.createElement("i");
    sw.style.background = `rgb(${p.color.join(",")})`;
    const peak = mine.length ? Math.max(...mine.map((q) => q.peakDeltaE)) : 0;
    label.append(cb, sw, `${p.name} ${n ? `${n.toLocaleString()}px · 진하기 ${peak.toFixed(0)}` : "없음"}`);
    return label;
  }));
}

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
  // 얼굴 둘레만 크게 — 얼굴 점 상자 + 여백 12%
  const xs = bl.map((p) => p.x), ys = bl.map((p) => p.y), mx = (Math.max(...xs) - Math.min(...xs)) * 0.12, my = (Math.max(...ys) - Math.min(...ys)) * 0.12;
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - mx)), y0 = Math.max(0, Math.floor(Math.min(...ys) - my));
  const crop = { x: x0, y: y0, w: Math.min(bare.w, Math.ceil(Math.max(...xs) + mx)) - x0, h: Math.min(bare.h, Math.ceil(Math.max(...ys) + my)) - y0 };
  const eyeW = Math.hypot(bl[33]!.x - bl[133]!.x, bl[33]!.y - bl[133]!.y);
  last = { bare, made, lm: bl, parts: [], crop, info: `겹치기 오차 평균 ${resid.toFixed(1)}px (눈 폭의 ${((resid / eyeW) * 100).toFixed(1)}%)` };
  await extract();
}

/** 지금 스위치로 다시 떼기 — 사진 · 겹치기는 그대로 */
async function extract(): Promise<void> {
  if (!last) return;
  setStatus("떼는 중…");
  await new Promise((r) => setTimeout(r, 0));
  const opts = { ...EXTRACT, blur: optBlur.checked, skinMap: optMap.checked, chroma: optChroma.checked };
  const t0 = performance.now(), res = extractAll(last.bare, last.made, last.lm, opts), ms = Math.round(performance.now() - t0);
  last.parts = res.parts;
  drawPartList(res.parts);
  render();
  const sw = [optBlur.checked && "①", optMap.checked && "②", optChroma.checked && "③"].filter(Boolean).join(" ") || "없음";
  setStatus(`${last.info} · 떼기 ${ms}ms · 켠 거르기: ${sw} · 부위를 눌러 켜고 끄기`);
}

async function load(input: HTMLInputElement): Promise<ImageBitmap | null> {
  const f = input.files?.[0];
  return f ? createImageBitmap(f) : null;
}
bareIn.addEventListener("change", async () => { bareImg = await load(bareIn); void run(); });
madeIn.addEventListener("change", async () => { madeImg = await load(madeIn); void run(); });
heat.addEventListener("change", render);
for (const o of [optBlur, optMap, optChroma]) o.addEventListener("change", () => void extract());
