/**
 * [dev 전용] 화장 입히고 떼기 POC (makeup-extract-probe.html, 2026-10-06) — 한 페이지에서 다 (사용자):
 *  ① 맨얼굴: 웹캠 3초 뒤 얼굴이 보이는 첫 장을 바로 찍기 (가만히 있는 장을 모으던 것은 웹캠에서 오래 걸려 뺐다, 사용자 2026-10-07) 또는 파일
 *  ② 참고 화장 사진: 파일
 *  ③ AI 가 내 얼굴에 입히기: FLUX.2 klein 4B 서버(127.0.0.1:7861, poc/look-tryon/server-bench/app_klein.py — 눈두덩 · 볼 · 입술만
 *     다시 그려 나머지는 원본 그대로)의 REST API — 사진은 base64 로 보내고 결과 파일을 받아온다 (서버가 localhost 를 CORS 로 허용) · 또는 결과 파일을 직접
 *  ④ 떼기: 얼굴 점으로 두 사진 겹치기(튀는 점 무시한 아핀) → core/makeup-extract extractAll (원래 맨얼굴과 비교) →
 *     뗀 화장만(회색 바탕 + AI 색) · 맨얼굴 · AI 사진 위 부위별 색 테두리 · 부위 켜고 끄기
 *  ⑤ 가이드: 부위별 화장 영역의 바깥 테두리(core/region-outline) — FLUX 는 칠하지 않은 곳이 원본 그대로라 차이가 깨끗해서
 *     템플릿 모양에 숫자를 읽던 방식(Stable-Makeup 용 makeup-fit — 지움, #331)과 AI 맨얼굴 비교 · 피부 변화 거르기는 뺐다 (사용자 2026-10-06)
 *  ⑤ 실시간: 버튼으로 사진 가이드 ↔ 실시간 가이드 — 예전 화면 4 실시간 테두리 엔진(core/live-run createLiveRun)에 이 가이드 모양을
 *     넣어 같은 다듬기(얼굴 그물 붙이기 · 떨림 거르기 LIVE_SMOOTH · 먼 쪽 눈 보정 C+F+G2+G3+H · 크게 돌리면 먼 쪽 흐리게)로 따라간다.
 *     부위를 고르면 화면 4 처럼 그 부위 확대 창(crop-follow)에 청록 점선 · 블러셔는 퍼지는 방향 표시 (사용자 2026-10-07)
 * 사진은 이 컴퓨터 안에서만 쓴다 (저장은 누를 때만, 다운로드 폴더로).
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { deltaE, foreheadLab, labAt, type RgbaImage } from "@core/color";
import { applyAffine, robustAffine, type Affine } from "@core/eye-fit";
import { EXTRACT, FACE_OVAL, extractAll, type ExtractPart, type PartMask } from "@core/makeup-extract";
import { cropSpec, type Rect } from "@core/crop";
import { clampRect, createCropFollow } from "@core/crop-follow";
import { pageOf, type FeedbackPart } from "@core/guide-feedback";
import { createLiveRun } from "@core/live-run";
import type { Outline } from "@core/overlay";
import { partGuides, type PartGuide } from "@core/part-guide";
import { spreadMarks } from "@core/spread-marks";
import type { Pt } from "@core/types";
import { startFrameLoop } from "./camera-loop";
import { createLandmarker } from "./landmarker";
import { strokeMarks, strokeOutline } from "./outline-draw";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

/**
 * AI 서버 (FLUX.2 klein 4B, Gradio REST) — run(얼굴, 참고, steps, 강도, 원본 크기 유지, seed).
 * 강도 = 칠할 영역(눈두덩 · 볼 · 입술)을 얼마나 다시 그릴지 — 그냥 두 장을 넣으면 참고 인물 얼굴로 바뀌어서 영역만 다시 그린다
 */
const AI_SERVER = "http://127.0.0.1:7861";
const AI_STEPS = 4, AI_STRENGTH = 0.85;
const COUNTDOWN_MS = 3000;

const video = $<HTMLVideoElement>("v");
const bareView = $<HTMLCanvasElement>("bareView"), refView = $<HTMLCanvasElement>("refView"), madeView = $<HTMLCanvasElement>("madeView");
const camBtn = $<HTMLButtonElement>("camBtn"), snapBtn = $<HTMLButtonElement>("snapBtn"), bareSave = $<HTMLButtonElement>("bareSave");
const aiBtn = $<HTMLButtonElement>("aiBtn"), madeSave = $<HTMLButtonElement>("madeSave");
const bareFile = $<HTMLInputElement>("bareFile"), refFile = $<HTMLInputElement>("refFile"), madeFile = $<HTMLInputElement>("madeFile");
const bareMsg = $("bareMsg"), refMsg = $("refMsg"), madeMsg = $("madeMsg");
const guide = $<HTMLInputElement>("guide"), guideVal = $("guideVal"), steps = $<HTMLInputElement>("steps"), seedIn = $<HTMLInputElement>("seed");
const heat = $<HTMLInputElement>("heat");
const cvOnly = $<HTMLCanvasElement>("cvOnly"), cvBare = $<HTMLCanvasElement>("cvBare"), cvMade = $<HTMLCanvasElement>("cvMade");
const statusEl = $("status"), partsEl = $("parts");
const cvFitBare = $<HTMLCanvasElement>("cvFitBare"), cvFitMade = $<HTMLCanvasElement>("cvFitMade"), fitInfo = $("fitInfo");
const modePhoto = $<HTMLButtonElement>("modePhoto"), modeLive = $<HTMLButtonElement>("modeLive"), liveMsg = $("liveMsg");
const photoGuide = $("photoGuide"), liveGuide = $("liveGuide"), liveView = $<HTMLCanvasElement>("liveView");

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

/** 원본 크기 그림 (저장 · AI 보내기 · 떼기에 쓴다) */
let bareCv: HTMLCanvasElement | null = null, refCv: HTMLCanvasElement | null = null, madeCv: HTMLCanvasElement | null = null;
let imageLm: Promise<FaceLandmarker> | null = null;
type Crop = { x: number; y: number; w: number; h: number };
/** bare: 원래 맨얼굴 · made: 그 자리에 맞춘 AI 화장 · outlines: ⑤ 가이드 (core/part-guide) */
let last: { bare: RgbaImage; made: RgbaImage; bareCanvas: HTMLCanvasElement; madeCanvas: HTMLCanvasElement; lm: Pt[]; parts: PartMask[]; outlines: PartGuide[]; crop: Crop; info: string } | null = null;

const setStatus = (text: string, warn = false): void => { statusEl.innerHTML = warn ? `<span class="warn">${text}</span>` : text; };
const setMsg = (el: HTMLElement, text: string, warn = false): void => { el.innerHTML = warn ? `<span class="warn">${text}</span>` : text; };

// ---------- 그림 다루기 ----------

function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d", { willReadFrequently: true })!.drawImage(src, 0, 0, w, h);
  return c;
}

/** 카드 미리보기 — 칸에 맞춰 줄여 그린다 */
function preview(view: HTMLCanvasElement, src: HTMLCanvasElement | null): void {
  const W = 480, H = 640;
  view.width = W; view.height = H;
  const g = view.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (!src) return;
  const k = Math.min(W / src.width, H / src.height), w = src.width * k, h = src.height * k;
  g.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
}

async function canvasOfFile(f: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(f);
  const c = toCanvas(bmp, bmp.width, bmp.height);
  bmp.close();
  return c;
}

const stamp = (): string => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
function save(c: HTMLCanvasElement | null, name: string): void {
  c?.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${stamp()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
}

function refreshButtons(): void {
  bareSave.disabled = !bareCv;
  madeSave.disabled = !madeCv;
  aiBtn.disabled = !bareCv || !refCv || aiBusy;
}

// ---------- ① 맨얼굴: 웹캠 ----------

type CamMode = "off" | "live" | "countdown" | "shooting";
let camMode: CamMode = "off", countT0 = 0, stopLoop: (() => void) | null = null;
let videoLm: FaceLandmarker | null = null;

function drawLiveThumb(count?: number): void {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  const W = 480, H = 640;
  bareView.width = W; bareView.height = H;
  const g = bareView.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const k = Math.min(W / w, H / h), dw = w * k, dh = h * k;
  // 거울로 보여 준다 (찍는 그림은 원래 방향)
  g.save();
  g.translate(W, 0);
  g.scale(-1, 1);
  g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  g.restore();
  if (count !== undefined) {
    g.font = "700 160px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(0,0,0,.6)";
    g.fillStyle = "#fff";
    g.strokeText(String(count), W / 2, H / 2);
    g.fillText(String(count), W / 2, H / 2);
  }
}

function camFrame(now: number): void {
  if (camMode === "off" || video.readyState < 2) return;
  if (camMode === "countdown") {
    const left = COUNTDOWN_MS - (now - countT0);
    if (left > 0) { drawLiveThumb(Math.ceil(left / 1000)); return; }
    camMode = "shooting";
  }
  drawLiveThumb();
  if (camMode !== "shooting" || !videoLm) return;
  // 카운트다운이 끝나면 얼굴이 보이는 첫 장을 바로 찍는다
  const w = video.videoWidth, h = video.videoHeight, face = videoLm.detectForVideo(video, now).faceLandmarks[0];
  if (!face || face.length < 478) { setMsg(bareMsg, "얼굴을 찾지 못했어요 — 화면 안에 얼굴을", true); return; }
  bareCv = toCanvas(video, w, h);
  stopCamera();
  preview(bareView, bareCv);
  setMsg(bareMsg, `찍었어요 — ${bareCv.width}×${bareCv.height}`);
  refreshButtons();
  void maybeExtract();
}

function stopCamera(): void {
  stopLoop?.();
  stopLoop = null;
  for (const t of (video.srcObject as MediaStream | null)?.getTracks() ?? []) t.stop();
  video.srcObject = null;
  camMode = "off";
  camBtn.textContent = "카메라 켜기";
  snapBtn.disabled = true;
}

camBtn.addEventListener("click", async () => {
  if (camMode !== "off") { stopCamera(); preview(bareView, bareCv); return; }
  // 실시간 가이드와 같은 카메라(video) — 켜져 있으면 사진 가이드로 돌린다
  if (liveStop) await setMode(false);
  camBtn.disabled = true;
  setMsg(bareMsg, "카메라를 여는 중…");
  try {
    videoLm ??= await createLandmarker("VIDEO", { blendshapes: false });
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await video.play();
    camMode = "live";
    stopLoop = startFrameLoop(video, camFrame, { onError: (e) => setMsg(bareMsg, String(e), true) });
    camBtn.textContent = "카메라 끄기";
    snapBtn.disabled = false;
    setMsg(bareMsg, '맨얼굴로 정면을 보고 "찍기"');
  } catch (e) {
    setMsg(bareMsg, `카메라를 못 열었어요: ${e instanceof Error ? e.message : String(e)}`, true);
  } finally {
    camBtn.disabled = false;
  }
});
snapBtn.addEventListener("click", () => {
  if (camMode === "off") return;
  countT0 = performance.now();
  camMode = "countdown";
  setMsg(bareMsg, "정면을 봐 주세요 — 3초 뒤 찍어요");
});
bareFile.addEventListener("change", async () => {
  const f = bareFile.files?.[0];
  if (!f) return;
  if (camMode !== "off") stopCamera();
  bareCv = await canvasOfFile(f);
  preview(bareView, bareCv);
  setMsg(bareMsg, `${bareCv.width}×${bareCv.height}`);
  refreshButtons();
  void maybeExtract();
});
bareSave.addEventListener("click", () => save(bareCv, "nudy-bare"));

// ---------- ② 참고 화장 사진 ----------

refFile.addEventListener("change", async () => {
  const f = refFile.files?.[0];
  if (!f) return;
  refCv = await canvasOfFile(f);
  preview(refView, refCv);
  setMsg(refMsg, `${refCv.width}×${refCv.height}`);
  refreshButtons();
});

// ---------- ③ AI 가 입히기 ----------

let aiBusy = false;
guide.addEventListener("input", () => { guideVal.textContent = Number(guide.value).toFixed(2); });

/** Gradio REST: POST /gradio_api/call/predict → event_id → GET 같은 주소/event_id 의 SSE 에서 complete 줄 */
async function callAi(bare: HTMLCanvasElement, ref: HTMLCanvasElement, seed: number): Promise<{ img: HTMLCanvasElement; note: string }> {
  const fd = (c: HTMLCanvasElement) => ({ url: c.toDataURL("image/png"), meta: { _type: "gradio.FileData" } });
  const r = await fetch(`${AI_SERVER}/gradio_api/call/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [fd(bare), fd(ref), Number(steps.value) || AI_STEPS, Number(guide.value) || AI_STRENGTH, true, seed] }),
  });
  if (!r.ok) throw new Error(`AI 서버 응답 ${r.status}`);
  const { event_id: id } = (await r.json()) as { event_id: string };
  const sse = await (await fetch(`${AI_SERVER}/gradio_api/call/predict/${id}`)).text();
  const m = /event: (\w+)\ndata: (.*)/g;
  let ev: RegExpExecArray | null, data: unknown = null, kind = "";
  while ((ev = m.exec(sse))) { kind = ev[1]!; data = ev[2] ? JSON.parse(ev[2]) : null; if (kind === "complete" || kind === "error") break; }
  if (kind !== "complete" || !Array.isArray(data)) throw new Error(`AI 실패: ${kind} ${JSON.stringify(data)?.slice(0, 200)}`);
  const file = data[0] as { path: string }, note = String(data[1] ?? "");
  const blob = await (await fetch(`${AI_SERVER}/gradio_api/file=${encodeURIComponent(file.path)}`)).blob();
  const bmp = await createImageBitmap(blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/webp" }));
  const img = toCanvas(bmp, bmp.width, bmp.height);
  bmp.close();
  return { img, note };
}

aiBtn.addEventListener("click", async () => {
  if (!bareCv || !refCv) return;
  aiBusy = true;
  refreshButtons();
  const seed = Math.round(Number(seedIn.value));
  const t0 = performance.now();
  try {
    // 칠할 영역(눈두덩 · 볼 · 입술) 밖이 원본 그대로라 원래 맨얼굴과 바로 비교한다 — AI 맨얼굴은 따로 안 그린다
    // (참고 = 내 맨얼굴로 그려도 '화장을 입혀라' 지시라 화장이 들어갔다, 2026-10-06)
    setMsg(madeMsg, "AI 가 화장을 입히는 중… (켜고 처음 한 장은 1분쯤)");
    const { img, note } = await callAi(bareCv, refCv, seed);
    madeCv = img;
    preview(madeView, madeCv);
    setMsg(madeMsg, `${((performance.now() - t0) / 1000).toFixed(1)}초 · seed ${seed} · ${note}`);
    void maybeExtract();
  } catch (e) {
    setMsg(madeMsg, `${e instanceof Error ? e.message : String(e)} — AI 서버(${AI_SERVER})가 켜져 있나요?`, true);
  } finally {
    aiBusy = false;
    refreshButtons();
  }
});
madeFile.addEventListener("change", async () => {
  const f = madeFile.files?.[0];
  if (!f) return;
  madeCv = await canvasOfFile(f);
  preview(madeView, madeCv);
  setMsg(madeMsg, `${madeCv.width}×${madeCv.height}`);
  refreshButtons();
  void maybeExtract();
});
madeSave.addEventListener("click", () => save(madeCv, "nudy-ai"));

// ---------- ④ 떼기 ----------

async function lmOf(c: HTMLCanvasElement): Promise<Pt[] | null> {
  imageLm ??= createLandmarker("IMAGE", { blendshapes: false });
  const face = (await imageLm).detect(c).faceLandmarks[0];
  return face && face.length >= 478 ? face.map((p) => ({ x: p.x * c.width, y: p.y * c.height })) : null;
}

function rgbaOf(c: HTMLCanvasElement): RgbaImage {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: d.width, h: d.height };
}

/** AI 사진을 맨얼굴 크기 · 자리로 (made 점 → bare 점 아핀) */
function aligned(made: HTMLCanvasElement, t: Affine, w: number, h: number): HTMLCanvasElement {
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
function compose(cv: HTMLCanvasElement, w: number, crop: Crop, lab: Uint8Array, pixel: (i: number) => [number, number, number] | null) {
  cv.width = crop.w; cv.height = crop.h;
  const g = cv.getContext("2d")!, id = g.createImageData(crop.w, crop.h), lw = Math.max(1, Math.round(crop.w / 450));
  for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
    const i = (crop.y + y) * w + (crop.x + x), o = (y * crop.w + x) * 4, k = lab[i]!;
    let c = pixel(i);
    if (k) {
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
    cb.addEventListener("change", () => { if (cb.checked) on.add(p.id); else on.delete(p.id); render(); renderGuide(); });
    const sw = document.createElement("i");
    sw.style.background = `rgb(${p.color.join(",")})`;
    const peak = mine.length ? Math.max(...mine.map((q) => q.peakDeltaE)) : 0;
    label.append(cb, sw, `${p.name} ${n ? `${n.toLocaleString()}px · 진하기 ${peak.toFixed(0)}` : "없음"}`);
    return label;
  }));
}

/** 얼굴 점 상자 + 여백 12% */
function faceCrop(lm: readonly Pt[], w: number, h: number): Crop {
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y), mx = (Math.max(...xs) - Math.min(...xs)) * 0.12, my = (Math.max(...ys) - Math.min(...ys)) * 0.12;
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - mx)), y0 = Math.max(0, Math.floor(Math.min(...ys) - my));
  return { x: x0, y: y0, w: Math.min(w, Math.ceil(Math.max(...xs) + mx)) - x0, h: Math.min(h, Math.ceil(Math.max(...ys) + my)) - y0 };
}

/** 원래 맨얼굴과 AI 화장을 겹치고 뗀다 */
async function maybeExtract(): Promise<void> {
  if (!bareCv || !madeCv) return;
  setStatus("얼굴 점을 찾는 중…");
  const [bl, ml] = await Promise.all([lmOf(bareCv), lmOf(madeCv)]);
  if (!bl || !ml) { setStatus(!bl ? "맨얼굴에서 얼굴을 못 찾았어요" : "AI 화장 사진에서 얼굴을 못 찾았어요", true); return; }
  // 두 사진 겹치기: 얼굴 점 468개로 아핀 — 튀는 점은 무시
  const ids = Array.from({ length: 468 }, (_, i) => i);
  const t = robustAffine(ids.map((i) => ml[i]!), ids.map((i) => bl[i]!), 1);
  if (!t) { setStatus("두 사진을 겹치지 못했어요", true); return; }
  const resid = ids.reduce((s, i) => s + Math.hypot(applyAffine(t, ml[i]!).x - bl[i]!.x, applyAffine(t, ml[i]!).y - bl[i]!.y), 0) / ids.length;
  const madeCanvas = aligned(madeCv, t, bareCv.width, bareCv.height), bare = rgbaOf(bareCv), made = rgbaOf(madeCanvas);
  const eyeW = Math.hypot(bl[33]!.x - bl[133]!.x, bl[33]!.y - bl[133]!.y);
  last = {
    bare, made, bareCanvas: bareCv, madeCanvas, lm: bl, parts: [], outlines: [], crop: faceCrop(bl, bare.w, bare.h),
    info: `겹치기 오차 평균 ${resid.toFixed(1)}px (눈 폭의 ${((resid / eyeW) * 100).toFixed(1)}%)`,
  };
  await extract();
}

/**
 * 떼기 → 부위 가이드 모양 (core/part-guide: 입술 · 눈썹은 얼굴 점, 섀도는 눈꺼풀 선까지, 블러셔는 볼록하게).
 * 피부 변화 거르기는 끈다(EXTRACT 기본) — FLUX 는 칠하지 않은 곳이 원본 그대로라 차이가 깨끗하다.
 */
async function extract(): Promise<void> {
  if (!last) return;
  setStatus("떼는 중…");
  await new Promise((r) => setTimeout(r, 0));
  const t0 = performance.now(), res = extractAll(last.bare, last.made, last.lm, EXTRACT);
  last.parts = res.parts;
  // klein 이 칠하는 곳은 얼굴 윤곽을 가운데 쪽으로 0.9 줄인 안(app_klein.py OVAL_KEEP) — 그 밖은 원본에 되붙일 때 머리카락 경계에 생긴 차이라
  // 가이드에서 뺀다 (실사진: 볼 가이드에 얼굴 옆선 띠)
  const oval = FACE_OVAL.map((i) => last!.lm[i]!), c = oval.reduce((s, p) => ({ x: s.x + p.x / oval.length, y: s.y + p.y / oval.length }), { x: 0, y: 0 });
  const clip = oval.map((p) => ({ x: c.x + (p.x - c.x) * 0.9, y: c.y + (p.y - c.y) * 0.9 }));
  last.outlines = partGuides(res.parts, last.lm, res.w, res.h, { clip, made: last.made });
  const ms = Math.round(performance.now() - t0);
  drawPartList(res.parts);
  render();
  renderGuide();
  setStatus(`${last.info} · 떼기 + 테두리 ${ms}ms · 부위를 눌러 켜고 끄기`);
}

/** 가이드 그리기 — 사진의 자른 자리(crop)를 넓이 960 으로 키워 그 위에 켠 부위의 테두리 (부위 색 실선). 부위로 확대해도 선 굵기는 그대로 */
function drawOutlines(cv: HTMLCanvasElement, src: HTMLCanvasElement, crop: Rect, outlines: readonly PartGuide[]): void {
  const OUT = 960, k = OUT / crop.w;
  cv.width = OUT; cv.height = Math.round(crop.h * k);
  const g = cv.getContext("2d")!;
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, cv.width, cv.height);
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  for (const o of outlines) {
    if (!on.has(o.part)) continue;
    const color = `rgb(${PARTS.find((p) => p.id === o.part)!.color.join(",")})`;
    g.strokeStyle = color;
    for (const poly of o.polys) {
      if (poly.length < 3) continue;
      g.beginPath();
      g.moveTo((poly[0]!.x - crop.x) * k, (poly[0]!.y - crop.y) * k);
      for (const p of poly.slice(1)) g.lineTo((p.x - crop.x) * k, (p.y - crop.y) * k);
      g.closePath();
      g.stroke();
    }
    // 퍼지는 방향 (블러셔: 가운데 점 + 사방 화살표)
    const at = (q: Pt): Pt => ({ x: (q.x - crop.x) * k, y: (q.y - crop.y) * k });
    if (o.marks) strokeMarks(g, { dots: o.marks.dots.map(at), arrows: o.marks.arrows.map((a) => a.map(at)) }, 2.5, color);
  }
}

/** 사진 가이드 — 부위를 골랐으면 실시간 확대 창과 같은 비율로 그 부위만 (고른 게 없으면 얼굴 전체 · 모든 부위) */
function renderPhoto(): void {
  if (!last) return;
  const shown = focus ? last.outlines.filter((o) => pageOf(o.part) === focus) : last.outlines;
  const crop = focus ? clampRect(cropSpec(focus, last.lm, LIVE_ASPECT[focus], shown.flatMap((o) => o.polys.flat())), last.bare.w, last.bare.h) : last.crop;
  drawOutlines(cvFitBare, last.bareCanvas, crop, shown);
  drawOutlines(cvFitMade, last.madeCanvas, crop, shown);
}

function renderGuide(): void {
  if (!last) return;
  if (liveStop) buildRuns();
  drawPartChips();
  renderPhoto();
  const side = (s: PartMask["side"]) => (s === "R" ? " 사진 왼쪽" : s === "L" ? " 사진 오른쪽" : "");
  const from = { landmark: "얼굴 점 선", mixed: "얼굴 점 + 화장 영역", region: "화장 영역" } as const;
  const lines = last.outlines.map((o) => `${PARTS.find((p) => p.id === o.part)!.name}${side(o.side)}: ${from[o.from]} · 테두리 ${o.polys.length}개 · ${o.count.toLocaleString()}px`);
  fitInfo.textContent = lines.length ? lines.join("\n") : "화장 영역을 못 찾았어요";
}

// ---------- ⑤ 실시간 가이드 (예전 화면 4 엔진) ----------

const LIVE_NAME: Record<FeedbackPart, string> = { brow: "눈썹", liner: "아이라이너", shadow: "아이섀도", lip: "입술", cheek: "블러셔" };
const LIVE_ORDER: readonly FeedbackPart[] = ["brow", "liner", "shadow", "lip", "cheek"];
/** 확대 창 가로/세로 — 눈 부위는 양쪽 눈을 한 창에 */
const LIVE_ASPECT: Record<FeedbackPart, number> = { brow: 2, liner: 2, shadow: 2, lip: 4 / 3, cheek: 4 / 3 };
const partChips = $("partChips");
let liveRuns: { part: FeedbackPart; run: ReturnType<typeof createLiveRun<HTMLCanvasElement>> }[] = [];
let liveStop: (() => void) | null = null;
/** 고른 부위 — 사진 가이드 · 실시간 가이드가 같이 쓴다 (null = 전체 — 확대 없이 모든 부위) */
let focus: FeedbackPart | null = null;
let follow: ReturnType<typeof createCropFollow> | null = null;
let lastShape: Pt[] = [];

/** 켠 부위의 가이드를 화면 부위(아래 섀도는 섀도)별로 묶어 화면 4 엔진에 넣는다. 블러셔만 퍼지는 방향 표시 (모양과 상관없는 방사형) */
function buildRuns(): void {
  const l = last;
  liveRuns = [];
  if (!l) return;
  const foreheadL = foreheadLab(l.bare, l.lm)?.L ?? 60;
  for (const part of LIVE_ORDER) {
    const polys = l.outlines.filter((o) => on.has(o.part) && pageOf(o.part) === part).flatMap((o) => o.polys).filter((q) => q.length >= 3);
    if (!polys.length) continue;
    const m = part === "cheek" ? spreadMarks("cheek", polys) : null;
    const outline: Outline = m?.dots.length ? { polys, lines: [], dots: m.dots, arrows: m.arrows } : { polys, lines: [] };
    liveRuns.push({ part, run: createLiveRun<HTMLCanvasElement>({ partId: part, baseline: { lm: l.lm, foreheadL }, outline }) });
  }
}

/** 부위 칩 [전체 / 눈썹 / …] — 켠 부위 중 가이드가 있는 것만. 누르면 사진 · 실시간 둘 다 그 부위로 */
function drawPartChips(): void {
  const l = last;
  const pages = l ? LIVE_ORDER.filter((part) => l.outlines.some((o) => on.has(o.part) && pageOf(o.part) === part && o.polys.some((q) => q.length >= 3))) : [];
  if (focus && !pages.includes(focus)) focus = null;
  const chip = (label: string, f: FeedbackPart | null): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = focus === f ? "main" : "";
    b.addEventListener("click", () => { focus = f; follow = null; lastShape = []; drawPartChips(); renderPhoto(); });
    return b;
  };
  partChips.replaceChildren(...(pages.length ? [chip("전체", null), ...pages.map((part) => chip(LIVE_NAME[part], part))] : []));
}

/** 창(crop)만 거울로 칸에 맞춰 그리고 그 위에 테두리 — 화면 4 drawView 와 같은 그리기 (청록 점선 · 먼 쪽 눈은 흐리게) */
function drawLive(crop: Rect, shapes: readonly { outline: Outline | null; alpha: number[] | null }[]): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(liveView.clientWidth * dpr), H = Math.round(liveView.clientHeight * dpr);
  if (!W || !H) return;
  if (liveView.width !== W || liveView.height !== H) { liveView.width = W; liveView.height = H; }
  const g = liveView.getContext("2d")!, k = Math.min(W / crop.w, H / crop.h), ox = (W - crop.w * k) / 2, oy = (H - crop.h * k) / 2;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W, 0);
  g.scale(-1, 1);
  g.translate(ox, oy);
  g.scale(k, k);
  g.translate(-crop.x, -crop.y);
  g.drawImage(video, crop.x, crop.y, crop.w, crop.h, crop.x, crop.y, crop.w, crop.h);
  const lw = Math.max(2, W / 400) / k;
  for (const { outline: o, alpha } of shapes) {
    if (!o) continue;
    strokeOutline(g, alpha ? { ...o, polys: o.polys.filter((_, i) => (alpha[i] ?? 1) >= 1) } : o, lw);
    alpha?.forEach((a, i) => {
      if (a >= 1) return;
      g.globalAlpha = a;
      strokeOutline(g, { polys: [o.polys[i]!], lines: [] }, lw);
      g.globalAlpha = 1;
    });
  }
  g.restore();
}

function liveFrame(now: number): void {
  if (video.readyState < 2 || !videoLm || !last) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  const face = videoLm.detectForVideo(video, now).faceLandmarks[0];
  const lm: Pt[] | null = face && face.length >= 478 ? face.map((p) => ({ x: p.x * w, y: p.y * h })) : null;
  const steps = liveRuns.map((r) => ({ part: r.part, ...r.run.step({ t: now, lm, w, h, image: () => liveView }) }));
  const shown = focus ? steps.filter((s) => s.part === focus) : steps;
  let crop: Rect = { x: 0, y: 0, w, h };
  if (focus) {
    const aspect = LIVE_ASPECT[focus];
    liveView.style.aspectRatio = String(aspect);
    follow ??= createCropFollow(focus, aspect);
    // 창은 지난 장면 테두리까지 담게 (화면 4 와 같이) — 얼굴이 없으면 맨얼굴 자리
    crop = lm ? clampRect(follow.step(lm, now, lastShape), w, h) : clampRect(cropSpec(focus, last.lm, aspect), w, h);
    lastShape = shown.flatMap((s) => s.outline?.polys.flat() ?? []);
  } else liveView.style.aspectRatio = `${w} / ${h}`;
  drawLive(crop, shown);
  setMsg(liveMsg, lm ? "" : "얼굴을 찾는 중…");
}

function stopLive(): void {
  liveStop?.();
  liveStop = null;
  for (const t of (video.srcObject as MediaStream | null)?.getTracks() ?? []) t.stop();
  video.srcObject = null;
}

/** 사진 가이드 ↔ 실시간 가이드 */
async function setMode(live: boolean): Promise<void> {
  if (live && !last?.outlines.length) { setMsg(liveMsg, "가이드를 먼저 만들어 주세요 — ① 맨얼굴 · ③ AI 화장이 있어야 해요", true); return; }
  modePhoto.classList.toggle("main", !live);
  modeLive.classList.toggle("main", live);
  photoGuide.hidden = live;
  liveGuide.hidden = !live;
  if (!live) { stopLive(); setMsg(liveMsg, ""); return; }
  if (liveStop) return;
  if (camMode !== "off") { stopCamera(); preview(bareView, bareCv); }
  buildRuns();
  follow = null;
  setMsg(liveMsg, "카메라를 여는 중…");
  try {
    videoLm ??= await createLandmarker("VIDEO", { blendshapes: false });
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await video.play();
    liveStop = startFrameLoop(video, liveFrame, { onError: (e) => setMsg(liveMsg, String(e), true) });
  } catch (e) {
    await setMode(false);
    setMsg(liveMsg, `카메라를 못 열었어요: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

modePhoto.addEventListener("click", () => void setMode(false));
modeLive.addEventListener("click", () => void setMode(true));

heat.addEventListener("change", render);
preview(bareView, null); preview(refView, null); preview(madeView, null);
refreshButtons();
