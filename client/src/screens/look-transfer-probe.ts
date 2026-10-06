/**
 * [dev 전용] 룩 옮기기 실험 (look-transfer-probe.html) — 배우고 싶은 화장 사진을 내 맨얼굴에 옮긴다.
 *
 * 1단계 포개기: 두 사진에서 얼굴 점을 찾고 화장 사진의 얼굴을 내 얼굴 모양으로 휜다 (core/look-transfer.ts).
 * 2단계 떼기 · 3단계 입히기: 포갠 사진에서 맨살 대비 색 차이만 떼어 내 얼굴에 더한다 (core/look-extract.ts).
 * 중간 그림(포갠 것 · 떼어 낸 화장)을 같이 보여 준다 — 결과가 이상할 때 어느 단계에서 틀렸는지 보려고.
 *
 * 생성 모델로 입히기: 두 사진의 얼굴 둘레를 잘라 같은 PC 의 생성 모델 서버(/__gen → poc/look-transfer-gen/server.py,
 * FLUX.2 klein 4B)로 보내 "화장한 내 얼굴"을 받는다. 받은 그림에서 얼굴 안쪽(또는 화장 부위)만 내 사진에 붙인다 —
 * 머리카락·배경·얼굴 윤곽은 내 사진 그대로 남는다. 이 버튼을 누를 때만 사진이 브라우저 밖(그 서버)으로 나간다.
 * 색 옮기기(이전 방식)는 브라우저 안에서만 돈다. 어느 쪽도 사진을 저장하지 않는다.
 *
 * 개발 확인용 주소 인자: ?bare=<사진 주소>&ref=<사진 주소> 로 파일을 고르지 않고 바로 돌린다.
 * &truth=<내 얼굴에 그 화장을 실제로 한 사진 주소> 를 더하면 정답과의 색 차이를 잰다 (같은 사람·같은 구도일 때만 의미 있음).
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { pointInPoly, rgbToLab, type Lab } from "@core/color";
import { FACE_TRIANGLES } from "@core/face-mesh";
import { LM } from "@core/landmarks";
import { TRANSFER_PARTS, applyMakeup, extractMakeup, makeupPreview, matchLook, partChange, pasteRegions, type LookMatch, type MakeupLayer, type OcclusionMap, type PartStrength, type TransferPart } from "@core/look-extract";
import { GUIDE_PARTS, buildGuide, type GuidePartId, type LookGuide } from "@core/look-guide";
import { checkPhoto, landmarkShift, warpMask, warpToFace, type FaceShift, type PhotoCheck, type WarpedFace } from "@core/look-transfer";
import type { HairMask } from "@core/sampling";
import type { Pt } from "@core/types";
import { createHairMasker } from "./hair-segmenter";
import { createLandmarker } from "./landmarker";
import { PART_STYLE, drawGuideParts, partBounds, renderBoard } from "./look-guide-draw";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};
const ctxOf = (cv: HTMLCanvasElement): CanvasRenderingContext2D => {
  const g = cv.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("캔버스 2D 를 쓸 수 없음");
  return g;
};

const statusEl = $("status");
const rowsEl = $("rows");
const mixEl = $<HTMLInputElement>("mix"), mixVal = $("mixVal");
const strengthEl = $<HTMLInputElement>("strength"), strengthVal = $("strengthVal");
const meshEl = $<HTMLInputElement>("mesh");
const hairEl = $<HTMLInputElement>("hair");
const dropWeakEl = $<HTMLInputElement>("dropWeak");
const weakMode = (): "drop" | "keep" => (dropWeakEl.checked ? "drop" : "keep");
const genBtn = $<HTMLButtonElement>("gen"), genStatus = $("genStatus");
const genArea = $<HTMLSelectElement>("genArea"), methodEl = $<HTMLSelectElement>("method"), seedEl = $<HTMLInputElement>("seed");
const genPrompt = $<HTMLSelectElement>("genPrompt"), refMask = $<HTMLSelectElement>("refMask");
const genCount = $<HTMLSelectElement>("genCount"), candPick = $<HTMLSelectElement>("candPick");
const guidePart = $<HTMLSelectElement>("guidePart"), guideBase = $<HTMLSelectElement>("guideBase");
const cvGuide = $<HTMLCanvasElement>("cvGuide"), guideNotes = $("guideNotes"), guideBoard = $("guideBoard");
const holdBtn = $<HTMLButtonElement>("hold");
const partEls = [...document.querySelectorAll<HTMLInputElement>("input.part")];
const cvBare = $<HTMLCanvasElement>("cvBare"), cvRef = $<HTMLCanvasElement>("cvRef"), cvOut = $<HTMLCanvasElement>("cvOut");
const cvLayer = $<HTMLCanvasElement>("cvLayer"), cvResult = $<HTMLCanvasElement>("cvResult");

/** 긴 변을 이만큼으로 줄여 쓴다 — 폰 사진 원본(4000px)은 계산이 느리고 화면에서 차이도 안 난다 */
const MAX_SIDE = 1600;
/** 정의서 1-2 촬영 조건: 눈 폭 80px 이상. 좌우 눈 폭 비 0.85 는 measure-probe 와 같은 눈대중값 */
const MIN_EYE_PX = 80, MIN_EYE_RATIO = 0.85;
/** 맨살 표본이 이보다 적으면 피부색 기준을 못 믿는다 (눈대중값) */
const MIN_SKIN_SAMPLES = 2000;
/** 부위가 이 비율보다 많이 가려지면 경고 (눈대중값) */
const MAX_HIDDEN = 0.3;
/** 생성 그림의 얼굴 점 어긋남 경고선 (눈 폭 대비) · 화장이 보인다고 칠 색 차이 — 둘 다 눈대중값, 팀 기준 미정 */
const MAX_SHIFT = 0.03, MIN_CHANGE = 2;
const PART_NAME: Record<TransferPart, string> = { lip: "입술", eye: "눈", brow: "눈썹", cheek: "볼" };

interface Photo {
  img: ImageData;
  lm: Pt[];
  check: PhotoCheck;
  /** 머리카락 마스크. 모델을 못 불러오면 null — 가림을 못 뺀다 */
  hair: HairMask | null;
}

/** 머리카락 분할 모델(Apache-2.0)은 처음 한 번만 불러온다. 실패하면 가림 없이 간다 */
const hairMasker = createHairMasker(undefined, (e) => console.warn("[look-transfer] 머리카락 분할 실패", e));

let landmarker: Promise<FaceLandmarker> | null = null;
let bare: Photo | null = null, ref: Photo | null = null;
let warped: WarpedFace | null = null;
let layer: MakeupLayer | null = null;
/** 생성 모델 결과 (정답사진 후보) */
interface Generated {
  /** 모델이 만든 그림 — 내 사진과 같은 크기. 보낸 얼굴 둘레 밖은 내 사진 그대로 */
  raw: ImageData;
  /** 생성 그림에서 찾은 얼굴 점. 못 찾으면 null — 그러면 맞추지 못하고 그대로 쓴다 */
  lm: Pt[] | null;
  /** 생성 그림의 얼굴을 내 맨얼굴 점에 맞춰 편 것 (얼굴 그물 밖은 내 사진) */
  aligned: ImageData;
  /** 생성 그림에서 내 맨얼굴 대비 바뀐 색만 떠낸 것 — 이걸 맨얼굴에 다시 입히면 얼굴 모양은 원본 그대로 (정의서 §7) */
  layer: MakeupLayer;
  /** 생성 그림의 얼굴 점이 내 맨얼굴에서 얼마나 어긋났나 */
  shift: FaceShift | null;
  /** 화장 사진의 화장(내 얼굴 자리로 옮긴 것)과 얼마나 닮았나. 견줄 것이 없으면 null */
  match: LookMatch | null;
  /** 이 그림을 만든 번호 */
  seed: number;
}
/** 지금 보고 있는 생성 결과 (후보 중 하나) */
let gen: Generated | null = null;
/** 이번에 만든 후보 전부 — 닮음 점수로 하나를 고른다 */
let candidates: Generated[] = [];
let showBare = false;

/** 사진을 줄여 캔버스에 그리고 얼굴 점을 찾는다. 얼굴이 없으면 null */
async function loadPhoto(src: Blob, cv: HTMLCanvasElement): Promise<Photo | null> {
  const bmp = await createImageBitmap(src);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  const g = ctxOf(cv);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  landmarker ??= createLandmarker("IMAGE", { blendshapes: false });
  const raw = (await landmarker).detect(cv).faceLandmarks[0];
  if (!raw) return null;
  const lm = raw.map((p) => ({ x: p.x * cv.width, y: p.y * cv.height, z: p.z }));
  const img = g.getImageData(0, 0, cv.width, cv.height);
  return { img, lm, check: checkPhoto(lm), hair: await hairMasker({ data: img.data, w: img.width, h: img.height }) };
}

function drawMesh(g: CanvasRenderingContext2D, lm: readonly Pt[]): void {
  g.save();
  g.strokeStyle = "#3FD1C488";
  g.lineWidth = 1;
  g.beginPath();
  for (const [a, b, c] of FACE_TRIANGLES) {
    const p = lm[a]!, q = lm[b]!, r = lm[c]!;
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.lineTo(r.x, r.y);
    g.closePath();
  }
  g.stroke();
  g.restore();
}

/** 사진 한 장을 다시 그린다 (그물 보기를 껐다 켤 때) */
function drawPhoto(cv: HTMLCanvasElement, p: Photo | null): void {
  if (!p) return;
  const g = ctxOf(cv);
  g.putImageData(p.img, 0, 0);
  if (meshEl.checked) drawMesh(g, p.lm);
}

/** 1단계 그림: 내 얼굴 위에 포갠 화장 사진을 섞기 값만큼 얹는다 */
function drawOut(): void {
  if (!bare || !warped) return;
  cvOut.width = bare.img.width;
  cvOut.height = bare.img.height;
  const g = ctxOf(cvOut);
  const out = new ImageData(new Uint8ClampedArray(bare.img.data), bare.img.width, bare.img.height);
  const t = Number(mixEl.value) / 100;
  for (let i = 0; i < out.data.length; i += 4) {
    const a = ((warped.data[i + 3] ?? 0) / 255) * t;
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = (out.data[i + c] ?? 0) * (1 - a) + (warped.data[i + c] ?? 0) * a;
  }
  g.putImageData(out, 0, 0);
  if (meshEl.checked) drawMesh(g, bare.lm);
}

/** 부위별 세기: 체크한 부위만, 전체 세기 막대 값으로 */
function strengths(): PartStrength {
  const k = Number(strengthEl.value) / 100;
  const out: PartStrength = {};
  for (const p of TRANSFER_PARTS) out[p] = partEls.some((el) => el.value === p && el.checked) ? k : 0;
  return out;
}

const imageOf = (p: Photo) => ({ data: p.img.data, w: p.img.width, h: p.img.height });

/** 두 사진 중 어느 쪽에서든 머리카락이 덮은 곳 — 내 얼굴 사진 구도로. 화장 사진의 마스크는 얼굴과 같이 휘어 온다 */
function occlusion(b: Photo, r: Photo | null): OcclusionMap | null {
  if (!b.hair && !r?.hair) return null;
  const w = b.img.width, h = b.img.height;
  const data = r?.hair ? warpMask(r.hair, r.img.width, r.img.height, r.lm, b.lm, w, h) : new Float32Array(w * h);
  const m = b.hair;
  if (m) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = m.data[Math.min(m.h - 1, Math.floor((y * m.h) / h)) * m.w + Math.min(m.w - 1, Math.floor((x * m.w) / w))] ?? 0;
      if (v > data[y * w + x]!) data[y * w + x] = v;
    }
  }
  return { w, h, data };
}
/** 계산 결과(RGBA)를 캔버스에 올릴 수 있는 그림으로 */
function toImageData(d: Uint8ClampedArray, w: number, h: number): ImageData {
  const im = new ImageData(w, h);
  im.data.set(d);
  return im;
}

/** 입힌 결과: 생성 모델 그림이 있고 그걸 보기로 했으면 그 그림에서 고른 범위만 붙인 것, 아니면 색 옮기기 */
function resultPixels(b: Photo, l: MakeupLayer, s: PartStrength): Uint8ClampedArray {
  if (methodEl.value !== "gen" || !gen) return applyMakeup(imageOf(b), l, s, weakMode());
  const other = { data: gen.aligned.data, w: gen.aligned.width, h: gen.aligned.height };
  switch (genArea.value) {
    case "raw": return gen.raw.data;
    case "face": return pasteRegions(imageOf(b), other, gen.layer, "face", { all: Number(strengthEl.value) / 100 });
    case "parts": return pasteRegions(imageOf(b), other, gen.layer, "parts", s, weakMode());
    default: return applyMakeup(imageOf(b), gen.layer, s, weakMode());
  }
}

/** 생성 그림을 내 맨얼굴 점에 맞춰 펴고, 바뀐 색을 떠낸다 */
function makeGenerated(b: Photo, raw: ImageData, lm: Pt[] | null, seed: number): Generated {
  const w = b.img.width, h = b.img.height;
  // 얼굴 점을 못 찾았으면 맞추지 못한다 — 그대로 쓴다 (전부 얼굴 안쪽으로 본다)
  const face: WarpedFace = lm ? warpToFace({ data: raw.data, w, h }, lm, b.lm, w, h) : { data: raw.data, w, h };
  const aligned = new ImageData(w, h);
  aligned.data.set(b.img.data);
  for (let i = 0; i < face.data.length; i += 4) {
    if (!face.data[i + 3]) continue;
    aligned.data[i] = face.data[i]!;
    aligned.data[i + 1] = face.data[i + 1]!;
    aligned.data[i + 2] = face.data[i + 2]!;
  }
  const made = extractMakeup(imageOf(b), face, b.lm, hairEl.checked ? occlusion(b, null) : null);
  return { raw, lm, aligned, layer: made, shift: lm ? landmarkShift(b.lm, lm) : null, match: layer ? matchLook(layer, made) : null, seed };
}

/** 2단계 그림(떼어 낸 화장)과 3단계 그림(입힌 결과) */
function drawMakeup(): void {
  if (!bare || !layer) return;
  const s = strengths();
  cvResult.width = bare.img.width;
  cvResult.height = bare.img.height;
  ctxOf(cvResult).putImageData(showBare ? bare.img : toImageData(resultPixels(bare, layer, s), bare.img.width, bare.img.height), 0, 0);

  // 떼어 낸 화장은 부위 밖이 투명하다 — 밝은 색도 어두운 색도 보이게 회색 바탕 위에 올린다.
  // 생성 모델 결과를 보는 중이면 생성 그림에서 떠낸 것을 보여 준다
  const shown = methodEl.value === "gen" && gen ? gen.layer : layer;
  const tmp = document.createElement("canvas");
  tmp.width = cvLayer.width = shown.w;
  tmp.height = cvLayer.height = shown.h;
  ctxOf(tmp).putImageData(toImageData(makeupPreview(shown, s, weakMode()), shown.w, shown.h), 0, 0);
  const g = ctxOf(cvLayer);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, shown.w, shown.h);
  g.drawImage(tmp, 0, 0);
  drawGuide(shown);
}

/** 같은 layer 로 가이드를 다시 계산하지 않게 — 세기 막대만 움직일 때는 그리기만 한다 */
let guideOfLayer: { layer: MakeupLayer; guide: LookGuide } | null = null;

/** 부위 가이드: 바탕 그림(입힌 결과 또는 맨얼굴)을 그 부위로 잘라 키우고, 그 위에 점 · 선을 그린다 */
function drawGuide(shown: MakeupLayer): void {
  if (!bare) return;
  // 생성 그림에서 뗀 것을 보는 중이면, 화장 사진을 직접 포개서 뗀 것도 같이 넘긴다 — 정답사진에 안 그려진 아이라이너를 거기서 찾는다
  const direct = shown !== layer ? layer : null;
  if (guideOfLayer?.layer !== shown) guideOfLayer = { layer: shown, guide: buildGuide(shown, bare.lm, direct) };
  const guide = guideOfLayer.guide;
  // 실험 화면 전용: 개발자 도구에서 떼어 낸 화장과 가이드를 들여다볼 수 있게 (기준값을 맞출 때 쓴다)
  (window as unknown as { __lt?: unknown }).__lt = { layer: shown, guide, lm: bare.lm };
  const parts: readonly GuidePartId[] = guidePart.value === "all" ? GUIDE_PARTS : [guidePart.value as GuidePartId];
  const bareCv = document.createElement("canvas");
  bareCv.width = bare.img.width;
  bareCv.height = bare.img.height;
  ctxOf(bareCv).putImageData(bare.img, 0, 0);

  // ① 한눈에 보는 판: 얼굴 전체 + 부위마다 카드 (확대 그림 두 장 · 따라 하는 순서 · 잰 값)
  const eyeBox = (ids: readonly number[]): { xa: number; ya: number; xb: number; yb: number } => {
    const pts = ids.map((i) => bare!.lm[i]!);
    return { xa: Math.min(...pts.map((q) => q.x)), ya: Math.min(...pts.map((q) => q.y)), xb: Math.max(...pts.map((q) => q.x)), yb: Math.max(...pts.map((q) => q.y)) };
  };
  const eyes = [eyeBox([...LM.eyeA.upper, ...LM.eyeA.lower]), eyeBox([...LM.eyeB.upper, ...LM.eyeB.lower])];
  renderBoard(guideBoard, { guide, u: shown.u, face: { x: shown.x0, y: shown.y0, w: shown.w, h: shown.h }, eyes, result: cvResult, bare: bareCv });

  // ② 크게 보기: 고른 부위가 다 들어오게 자른다. 전체거나 그릴 것이 없으면 얼굴 칸 전체
  let bx = shown.x0, by = shown.y0, bw = shown.w, bh = shown.h;
  const bounds = guidePart.value === "all" ? null : partBounds(guide[parts[0]!]);
  if (bounds) {
    const pad = shown.u * 0.6;
    bx = Math.max(0, bounds.xa - pad);
    by = Math.max(0, bounds.ya - pad);
    bw = Math.min(bare.img.width, bounds.xb + pad) - bx;
    bh = Math.min(bare.img.height, bounds.yb + pad) - by;
  }
  const k = 1100 / bw;
  cvGuide.width = 1100;
  cvGuide.height = Math.max(1, Math.round(bh * k));
  const g = ctxOf(cvGuide);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingQuality = "high";
  g.drawImage(guideBase.value === "bare" ? bareCv : cvResult, bx, by, bw, bh, 0, 0, cvGuide.width, cvGuide.height);
  const numbered = drawGuideParts(g, guide, parts.filter((p) => guide[p].found), {
    at: (q) => ({ x: (q.x - bx) * k, y: (q.y - by) * k }),
    tint: guideBase.value === "bare",
    labels: true,
    midX: (shown.x0 + shown.w / 2 - bx) * k,
  });

  // 옆에 말로: 따라 하는 순서 → 번호 점 → 잰 값
  guideNotes.replaceChildren();
  const list = (tag: "ol" | "ul", items: readonly string[], cls = ""): HTMLElement => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      el.append(li);
    }
    return el;
  };
  for (const p of parts) {
    const h4 = document.createElement("h4");
    h4.textContent = PART_STYLE[p].name;
    h4.style.setProperty("--c", PART_STYLE[p].line);
    const part = guide[p];
    if (part.color) {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = `rgb(${part.color.map((v) => Math.round(v)).join(",")})`;
      sw.title = `이 자리의 색 rgb(${part.color.map((v) => Math.round(v)).join(", ")})`;
      h4.append(sw);
    }
    guideNotes.append(h4);
    if (!part.found) {
      const none = document.createElement("div");
      none.className = "none";
      none.textContent = "이 부위에는 화장이 안 보여요";
      guideNotes.append(none);
    }
    if (part.steps.length) guideNotes.append(list("ol", part.steps, "steps"));
    const mine = numbered.filter((q) => q.part === p);
    if (mine.length) guideNotes.append(list("ul", mine.map((q) => `${q.n}번 점 — ${q.label}`), "points"));
    // 잰 값. 화장이 없다고 봤을 때는 왜 그렇게 봤는지가 들어 있다 (기준을 맞출 때 본다)
    if (part.notes.length) guideNotes.append(list("ul", part.notes.map((n) => `${n.label}: ${n.value}`), "measured"));
  }
}

interface Row {
  label: string;
  ref: string;
  /** [내 맨얼굴 값, 화장 사진 값] — 없으면 null */
  get: () => [number | null, number | null];
  digits: number;
  unit: string;
  bad: (v: number) => boolean;
}
const perPhoto = (f: (c: PhotoCheck) => number) => (): [number | null, number | null] => [bare ? f(bare.check) : null, ref ? f(ref.check) : null];

const ROWS: Row[] = [
  { label: "눈 폭", unit: " px", digits: 0, ref: `${MIN_EYE_PX}px 이상 (정의서 1-2). 작으면 화장 모양이 뭉개진다`, get: perPhoto((c) => c.eyeWidthPx), bad: (v) => v < MIN_EYE_PX },
  { label: "좌우 눈 폭 비", unit: "", digits: 2, ref: `1에 가까워야 정면. ${MIN_EYE_RATIO} 미만이면 고개가 옆으로 돌아가 먼 쪽 얼굴이 늘어난다`, get: perPhoto((c) => c.eyeWidthRatio), bad: (v) => v < MIN_EYE_RATIO },
  { label: "고개 기울기", unit: "°", digits: 1, ref: "참고용. 기울어도 포개기는 맞춰진다", get: perPhoto((c) => c.rollDeg), bad: () => false },
  { label: "맨살 표본", unit: " 칸", digits: 0, ref: `피부색 기준으로 쓴 맨살 넓이. ${MIN_SKIN_SAMPLES}칸보다 적으면(머리카락·안경·손이 가림) 색이 틀어진다`, get: () => [layer?.skinSamples.bare ?? null, layer?.skinSamples.ref ?? null], bad: (v) => v < MIN_SKIN_SAMPLES },
  ...TRANSFER_PARTS.map((p): Row => ({
    label: `${PART_NAME[p]} 가림`, unit: "%", digits: 0,
    ref: `두 사진 중 어느 쪽에서든 머리카락이 덮어서 뺀 넓이(두 사진 합쳐 한 값). ${MAX_HIDDEN * 100}%를 넘으면 그 부위 화장은 거의 안 옮겨진다`,
    get: () => [layer ? layer.hidden[p] * 100 : null, null], bad: (v) => v > MAX_HIDDEN * 100,
  })),
  // ── 생성 모델 결과 (정답사진 후보) — 값은 첫 칸에만 ──
  { label: "생성: 얼굴 전체 밀림", unit: "%", digits: 1, ref: `생성 그림의 얼굴이 내 맨얼굴에서 통째로 밀린 정도 (눈 폭 대비). 입힐 때는 얼굴 점으로 맞춰서 없앤다`, get: () => [gen?.shift ? gen.shift.rigid * 100 : null, null], bad: (v) => v > MAX_SHIFT * 100 },
  ...(["brow", "eye", "lip"] as const).map((p): Row => ({
    label: `생성: ${PART_NAME[p]} 어긋남`, unit: "%", digits: 1,
    ref: `전체 밀림을 뺀 뒤 그 부위 점이 어긋난 정도 (눈 폭 대비 평균) — 얼굴 모양이 바뀌었나. 정의서 §7, 기준값은 미정이라 ${MAX_SHIFT * 100}% 는 눈대중`,
    get: () => [gen?.shift ? gen.shift[p].mean * 100 : null, null], bad: (v) => v > MAX_SHIFT * 100,
  })),
  { label: "생성: 화장 사진과 닮음", unit: "점", digits: 0, ref: "지금 보는 후보가 화장 사진의 화장과 얼마나 닮았나 (100 = 모든 부위에서 같은 자리에 같은 색 방향). 진하기는 보지 않는다. 눈 40 · 입술 25 · 눈썹 20 · 볼 15 의 무게 평균 — 무게와 계산법은 눈대중, 팀 기준 아님", get: () => [gen?.match ? gen.match.score * 100 : null, null], bad: (v) => v < 50 },
  ...TRANSFER_PARTS.map((p): Row => ({
    label: `생성: ${PART_NAME[p]} 닮음`, unit: "점", digits: 0,
    ref: "그 부위만 본 닮음. 한쪽에만 화장이 있으면 0 (없던 것을 그렸거나, 있던 것을 안 그렸거나), 둘 다 없으면 100",
    get: () => [gen?.match ? Math.max(0, gen.match.parts[p].sim) * 100 : null, null], bad: (v) => v < 50,
  })),
  { label: "생성: 맨살 잡음", unit: " ΔE", digits: 1, ref: "화장 부위가 아닌 맨살에서 생성 그림과 내 맨얼굴이 다른 정도(눈 둘레와 같은 방법으로 잼). 이것의 2배(최소 2.5)보다 작은 변화는 화장이 아니라고 보고 버린다", get: () => [gen ? gen.layer.present.eye.noise : null, null], bad: () => false },
  ...TRANSFER_PARTS.map((p): Row => ({
    label: `생성: ${PART_NAME[p]} 화장 차이`, unit: " ΔE", digits: 1,
    ref: `생성 그림이 내 맨얼굴에서 그 부위 색을 얼마나 바꿨나. ${MIN_CHANGE} 보다 작으면 화장이 안 보인다 (정의서 §6 "화장이 보이나", 기준 미정 — 눈대중)`,
    get: () => [gen ? partChange(gen.layer)[p] : null, null], bad: (v) => v < MIN_CHANGE,
  })),
];

function renderRows(): void {
  rowsEl.replaceChildren();
  for (const r of ROWS) {
    const tr = document.createElement("tr");
    const cell = (text: string, cls = ""): HTMLTableCellElement => {
      const td = document.createElement("td");
      td.textContent = text;
      td.className = cls;
      return td;
    };
    const val = (v: number | null): HTMLTableCellElement => (v == null ? cell("—", "v") : cell(v.toFixed(r.digits) + r.unit, r.bad(v) ? "v warn" : "v"));
    const [b, f] = r.get();
    tr.append(cell(r.label), val(b), val(f), cell(r.ref, "ref"));
    rowsEl.append(tr);
  }
}

/** 후보 목록을 다시 그린다 — 점수 높은 순, 지금 보는 것이 골라져 있다 */
function renderCandidates(): void {
  candPick.replaceChildren();
  const best = bestCandidate();
  for (const c of [...candidates].sort((p, q) => (q.match?.score ?? 0) - (p.match?.score ?? 0))) {
    const label = `${c.seed}번 — 닮음 ${c.match ? Math.round(c.match.score * 100) : "?"}점${c === best ? " (가장 닮음)" : ""}`;
    candPick.add(new Option(label, String(c.seed), false, c === gen));
  }
}

/** 화장 사진과 가장 닮은 후보. 점수를 못 매겼으면 먼저 만든 것 */
function bestCandidate(): Generated | null {
  let best: Generated | null = null;
  for (const c of candidates) if (!best || (c.match?.score ?? -1) > (best.match?.score ?? -1)) best = c;
  return best;
}

function update(): void {
  warped = null;
  layer = null;
  gen = null;
  candidates = [];
  renderCandidates();
  genBtn.disabled = !(bare && ref);
  if (bare && ref) {
    const t0 = performance.now();
    warped = warpToFace(imageOf(ref), ref.lm, bare.lm, bare.img.width, bare.img.height);
    layer = extractMakeup(imageOf(bare), warped, bare.lm, hairEl.checked ? occlusion(bare, ref) : null);
    statusEl.textContent = `사진 준비됨 (${Math.round(performance.now() - t0)}ms). "생성 모델로 입히기"를 누르세요. 지금 보이는 결과는 색 옮기기(이전 방식)입니다.`;
    statusEl.className = "";
  }
  drawPhoto(cvBare, bare);
  drawPhoto(cvRef, ref);
  drawOut();
  drawMakeup();
  renderRows();
}

async function pick(which: "bare" | "ref", src: Blob): Promise<void> {
  const name = which === "bare" ? "내 맨얼굴 사진" : "화장 사진";
  statusEl.textContent = `${name}에서 얼굴을 찾는 중…`;
  statusEl.className = "";
  const p = await loadPhoto(src, which === "bare" ? cvBare : cvRef);
  if (which === "bare") bare = p;
  else ref = p;
  if (!p) {
    statusEl.textContent = `${name}에서 얼굴을 찾지 못했습니다. 얼굴이 크게 나온 정면 사진으로 바꿔 주세요.`;
    statusEl.className = "warn";
  } else if (!(bare && ref)) {
    statusEl.textContent = "나머지 한 장도 골라 주세요.";
  }
  update();
}

for (const which of ["bare", "ref"] as const) {
  $<HTMLInputElement>(which).addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void pick(which, f);
  });
}
mixEl.addEventListener("input", () => {
  mixVal.textContent = `${mixEl.value}%`;
  drawOut();
});
strengthEl.addEventListener("input", () => {
  strengthVal.textContent = `${strengthEl.value}%`;
  drawMakeup();
});
for (const el of partEls) el.addEventListener("change", drawMakeup);
hairEl.addEventListener("change", () => {
  // 가림만 다시 계산한다 — 생성 그림은 다시 만들지 않고 떠내기만 다시
  const kept = candidates, seen = gen?.seed;
  update();
  const b = bare;
  if (b) candidates = kept.map((c) => makeGenerated(b, c.raw, c.lm, c.seed));
  gen = candidates.find((c) => c.seed === seen) ?? bestCandidate();
  renderCandidates();
  drawMakeup();
  renderRows();
});
candPick.addEventListener("change", () => {
  gen = candidates.find((c) => String(c.seed) === candPick.value) ?? gen;
  drawMakeup();
  renderRows();
});
for (const el of [genArea, methodEl, dropWeakEl, guidePart, guideBase]) el.addEventListener("change", drawMakeup);

// ── 생성 모델로 입히기 ─────────────────────────────
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 얼굴 둘레를 넉넉히 자른 네모 (pad = 얼굴 크기의 몇 배). 얼굴이 작게 찍힌 사진도 모델에는 얼굴이 크게 들어간다 */
function faceCrop(p: Photo, pad: number): Rect {
  let xa = Infinity, ya = Infinity, xb = -Infinity, yb = -Infinity;
  for (const q of p.lm.slice(0, 468)) {
    xa = Math.min(xa, q.x);
    ya = Math.min(ya, q.y);
    xb = Math.max(xb, q.x);
    yb = Math.max(yb, q.y);
  }
  const half = (Math.max(xb - xa, yb - ya) * pad) / 2, cx = (xa + xb) / 2, cy = (ya + yb) / 2;
  const x = Math.max(0, Math.round(cx - half)), y = Math.max(0, Math.round(cy - half));
  return { x, y, w: Math.min(p.img.width, Math.round(cx + half)) - x, h: Math.min(p.img.height, Math.round(cy + half)) - y };
}

/** 얼굴 윤곽을 한 바퀴 도는 얼굴 점 (MediaPipe FACE_OVAL 을 이어 놓은 순서) */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_OPEN = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
];

/**
 * 사진의 r 부분을 잘라 보낼 그림으로. keep 이 "face" 면 얼굴 윤곽 밖과 머리카락이 덮은 곳을 회색으로 가린다 —
 * 모델이 옷·머리·배경 색을 화장으로 가져오는 것을 막는다. "faceNoEyes" 는 눈동자까지 가린다 (눈 색이 섀도로 옮겨 오는 걸 막으려고)
 */
function cropBlob(p: Photo, r: Rect, keep: "all" | "face" | "faceNoEyes" = "all"): Promise<Blob> {
  const cv = document.createElement("canvas");
  cv.width = r.w;
  cv.height = r.h;
  const g = ctxOf(cv);
  g.putImageData(p.img, -r.x, -r.y);
  if (keep !== "all") {
    const im = g.getImageData(0, 0, r.w, r.h);
    const oval = FACE_OVAL.map((i) => p.lm[i]!);
    const eyes = keep === "faceNoEyes" ? EYE_OPEN.map((ids) => ids.map((i) => p.lm[i]!)) : [];
    const m = p.hair;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const px = x + r.x, py = y + r.y;
      const hair = m ? (m.data[Math.min(m.h - 1, Math.floor((py * m.h) / p.img.height)) * m.w + Math.min(m.w - 1, Math.floor((px * m.w) / p.img.width))] ?? 0) >= 0.5 : false;
      if (!hair && pointInPoly(px, py, oval) && !eyes.some((e) => pointInPoly(px, py, e))) continue;
      im.data.set([128, 128, 128], (y * r.w + x) * 4);
    }
    g.putImageData(im, 0, 0);
  }
  return new Promise((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error("사진을 못 만듦"))), "image/jpeg", 0.95));
}

async function generate(): Promise<void> {
  const b = bare, r = ref;
  if (!b || !r) return;
  genBtn.disabled = true;
  genStatus.className = "";
  genStatus.textContent = "만드는 중… (처음 한 번은 모델을 올리느라 1~2분 걸릴 수 있습니다)";
  const t0 = performance.now();
  try {
    const rect = faceCrop(b, 1.9);
    const keep = refMask.value === "crop" ? "all" : refMask.value === "faceNoEyes" ? "faceNoEyes" : "face";
    const bareBlob = await cropBlob(b, rect), refBlob = await cropBlob(r, faceCrop(r, keep === "all" ? 1.6 : 1.25), keep);
    const first = Math.max(0, Math.floor(Number(seedEl.value) || 0)), count = Number(genCount.value) || 1;
    candidates = [];
    methodEl.value = "gen";
    // 생성 그림의 눈썹은 "내 눈썹에 화장한 것" 이라 켠다 (색 옮기기에서는 남의 눈썹이 딸려 와 꺼 둔다)
    for (const el of partEls) if (el.value === "brow") el.checked = true;
    // 후보를 차례로 만들며 화장 사진과 닮은 정도를 잰다 — 그때그때 가장 닮은 것을 보여 준다
    for (let k = 0; k < count; k++) {
      const seed = first + k;
      const fd = new FormData();
      fd.append("bare", bareBlob, "bare.jpg");
      fd.append("ref", refBlob, "ref.jpg");
      fd.append("seed", String(seed));
      if (genPrompt.value) fd.append("prompt", genPrompt.value);
      const res = await fetch("/__gen/transfer", { method: "POST", body: fd });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: unknown }) => (typeof j.detail === "string" ? j.detail : "")).catch(() => "");
        throw new Error(detail || (res.status >= 500 ? `생성 서버가 꺼져 있거나 응답하지 않습니다 (${res.status})` : `요청 실패 (${res.status})`));
      }
      const bmp = await createImageBitmap(await res.blob());
      if (b !== bare || r !== ref) return;   // 그사이 사진을 바꿨다
      const cv = document.createElement("canvas");
      cv.width = b.img.width;
      cv.height = b.img.height;
      const g = ctxOf(cv);
      g.putImageData(b.img, 0, 0);
      g.drawImage(bmp, rect.x, rect.y, rect.w, rect.h);
      bmp.close();
      // 생성 그림에서 얼굴 점을 다시 찾아 내 맨얼굴에 맞춘다 — 얼굴이 조금 밀리거나 모양이 바뀌어도 화장이 제자리에 온다
      const found = (await (landmarker ??= createLandmarker("IMAGE", { blendshapes: false }))).detect(cv).faceLandmarks[0];
      candidates.push(makeGenerated(b, g.getImageData(0, 0, cv.width, cv.height), found ? found.map((p) => ({ x: p.x * cv.width, y: p.y * cv.height, z: p.z })) : null, seed));
      gen = bestCandidate();
      genStatus.textContent = `후보 ${k + 1}/${count} 만듦…`;
      renderCandidates();
      drawMakeup();
      renderRows();
    }
    const best = gen;
    genStatus.textContent = `후보 ${count}개 중 ${best?.seed ?? "?"}번을 골랐습니다 — 화장 사진과 닮음 ${best?.match ? Math.round(best.match.score * 100) : "?"}점 (${((performance.now() - t0) / 1000).toFixed(1)}초). "후보"에서 다른 것도 볼 수 있습니다.`;
  } catch (e) {
    genStatus.textContent = e instanceof Error ? e.message : String(e);
    genStatus.className = "warn";
  } finally {
    genBtn.disabled = !(bare && ref);
  }
}
genBtn.addEventListener("click", () => void generate());
void fetch("/__gen/health").then(async (res) => {
  if (!res.ok) throw new Error(String(res.status));
  const info = (await res.json()) as { prompts?: string[]; default_prompt?: string };
  for (const name of info.prompts ?? []) genPrompt.add(new Option(name, name, name === info.default_prompt, name === info.default_prompt));
  genStatus.textContent = "생성 서버 연결됨.";
}).catch(() => {
  genStatus.textContent = "생성 서버가 꺼져 있습니다 — 색 옮기기(이전 방식)만 됩니다.";
  genStatus.className = "warn";
});
meshEl.addEventListener("change", () => {
  drawPhoto(cvBare, bare);
  drawPhoto(cvRef, ref);
  drawOut();
});
const hold = (on: boolean) => (): void => {
  showBare = on;
  drawMakeup();
};
holdBtn.addEventListener("pointerdown", hold(true));
for (const ev of ["pointerup", "pointerleave", "pointercancel"] as const) holdBtn.addEventListener(ev, hold(false));
renderRows();

// ── 웹캠으로 맨얼굴 찍기 ─────────────────────────────
const cam = $<HTMLVideoElement>("cam");
const camStart = $<HTMLButtonElement>("camStart"), camShot = $<HTMLButtonElement>("camShot"), camStop = $<HTMLButtonElement>("camStop");

function closeCam(): void {
  for (const t of (cam.srcObject as MediaStream | null)?.getTracks() ?? []) t.stop();
  cam.srcObject = null;
  cam.hidden = camShot.hidden = camStop.hidden = true;
  camStart.hidden = false;
}

camStart.addEventListener("click", () => {
  void (async () => {
    try {
      cam.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) {
      statusEl.textContent = `카메라를 열지 못했습니다 (${e instanceof Error ? e.name : String(e)}). 브라우저의 카메라 권한을 확인해 주세요.`;
      statusEl.className = "warn";
      return;
    }
    cam.hidden = camShot.hidden = camStop.hidden = false;
    camStart.hidden = true;
    statusEl.textContent = "안경을 벗고, 얼굴이 화면에 크게·정면으로 오게 맞춘 뒤 찍기를 눌러 주세요.";
    statusEl.className = "";
  })();
});
camStop.addEventListener("click", closeCam);
camShot.addEventListener("click", () => {
  if (!cam.videoWidth) return;
  const shot = document.createElement("canvas");
  shot.width = cam.videoWidth;
  shot.height = cam.videoHeight;
  ctxOf(shot).drawImage(cam, 0, 0);
  closeCam();
  shot.toBlob((b) => {
    if (b) void pick("bare", b);
  }, "image/png");
});

// ── 개발 확인용: 주소로 사진을 받고, 정답 사진이 있으면 색 차이를 잰다 ─────────────
/** 맨살 표본 자리에서 잰 그림의 평균 피부색 */
function skinMean(d: Uint8ClampedArray, l: MakeupLayer, imgW: number): Lab {
  let L = 0, a = 0, b = 0, cnt = 0;
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    if (!l.skinMask[y * l.w + x]) continue;
    const i = ((y + l.y0) * imgW + x + l.x0) * 4;
    const c = rgbToLab(d[i]!, d[i + 1]!, d[i + 2]!);
    L += c.L;
    a += c.a;
    b += c.b;
    cnt++;
  }
  return cnt ? { L: L / cnt, a: a / cnt, b: b / cnt } : { L: 0, a: 0, b: 0 };
}

/**
 * 부위(영역 0.5 이상)에서 두 그림의 평균 색 차이(ΔE76).
 * relative 면 그림마다 자기 피부색을 뺀 뒤 비교한다 — 파운데이션처럼 얼굴 전체 톤이 바뀐 것은 빼고 "맨살 대비 화장"만 본다.
 */
function partDeltaE(a: Uint8ClampedArray, b: Uint8ClampedArray, l: MakeupLayer, imgW: number, part: TransferPart, relative: boolean): number | null {
  const sa = relative ? skinMean(a, l, imgW) : { L: 0, a: 0, b: 0 }, sb = relative ? skinMean(b, l, imgW) : { L: 0, a: 0, b: 0 };
  let sum = 0, cnt = 0;
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    if (l.parts[part].mask[y * l.w + x]! < 0.5) continue;
    const i = ((y + l.y0) * imgW + x + l.x0) * 4;
    const p = rgbToLab(a[i]!, a[i + 1]!, a[i + 2]!), q = rgbToLab(b[i]!, b[i + 1]!, b[i + 2]!);
    sum += Math.hypot(p.L - sa.L - (q.L - sb.L), p.a - sa.a - (q.a - sb.a), p.b - sa.b - (q.b - sb.b));
    cnt++;
  }
  return cnt ? sum / cnt : null;
}

const q = new URLSearchParams(location.search);
void (async () => {
  for (const which of ["bare", "ref"] as const) {
    const url = q.get(which);
    if (url) await pick(which, await (await fetch(url)).blob());
  }
  const truthUrl = q.get("truth");
  // pick 이 채운 값 — 다른 함수에서 바뀐 것은 타입 좁히기가 못 따라와서 다시 읽는다
  const me = bare as Photo | null, made = layer as MakeupLayer | null;
  if (!truthUrl || !me || !made) return;
  const bmp = await createImageBitmap(await (await fetch(truthUrl)).blob());
  const cv = document.createElement("canvas");
  cv.width = me.img.width;
  cv.height = me.img.height;
  ctxOf(cv).drawImage(bmp, 0, 0, cv.width, cv.height);
  const truth = ctxOf(cv).getImageData(0, 0, cv.width, cv.height).data;
  const result = applyMakeup(imageOf(me), made);
  // before = 맨얼굴과 정답의 차이, after = 입힌 결과와 정답의 차이. rel 은 피부색을 뺀 비교
  const r1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);
  const report: Record<string, Record<string, number | null>> = {};
  for (const p of TRANSFER_PARTS) {
    report[p] = {
      before: r1(partDeltaE(me.img.data, truth, made, cv.width, p, false)), after: r1(partDeltaE(result, truth, made, cv.width, p, false)),
      relBefore: r1(partDeltaE(me.img.data, truth, made, cv.width, p, true)), relAfter: r1(partDeltaE(result, truth, made, cv.width, p, true)),
    };
  }
  console.log(`[look-transfer] truth ${JSON.stringify(report)}`);
})();
