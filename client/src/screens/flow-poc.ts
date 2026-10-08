/**
 * [dev 전용] 새 흐름 한 바퀴 POC (flow-poc.html, 2026-10-07, ②) — 서비스 정의서 §6 화면 1~7 을 한 화면씩 차례로:
 *  1 맨얼굴: 웹캠 3초 뒤 얼굴이 보이는 첫 장을 바로 찍기 (가만히 있는 장을 모으던 것은 웹캠에서 오래 걸려 뺐다, 사용자 2026-10-07) 또는 파일
 *  2 참고 사진: 파일. 정답사진을 만들면 지운다 (정의서 원칙)
 *  3 정답사진: FLUX.2 klein 4B 서버(127.0.0.1:7861, poc/look-tryon/server-bench/app_klein.py) 또는 파일 →
 *    맨얼굴에 겹쳐(얼굴 점 아핀) 부위별로 떼고(core/makeup-extract) 부위 가이드 모양을 만든다(core/part-guide)
 *  4 부위 가이드: 정답사진을 부위로 자른 정지 사진(core/crop cropSpec) + 가이드 테두리. 눈썹 → 라이너 → 섀도 → 입술 → 블러셔
 *  5 시도사진: 웹캠 또는 파일
 *  6 피드백: 시도사진도 맨얼굴에 겹쳐 떼고 가이드와 견준다(core/guide-feedback) — 덜 그림 · 넘침, 점수 없음.
 *    ③ 피드백 화면이 오기 전 흐름을 돌려 보려는 간단 비교다
 *  7 저장: 결과 한 장(PNG)을 이 기기로 내려받기 · 끝내기
 * 눈 감은 사진은 POC 에서 뺐다. 사진은 이 컴퓨터 안에서만 쓴다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { pointInPoly, type RgbaImage } from "@core/color";
import { cropSpec, type Rect } from "@core/crop";
import { robustAffine, type Affine } from "@core/eye-fit";
import { FEEDBACK, FEEDBACK_ORDER, guideFeedback, pageOf, type FeedbackPart, type PartFeedback } from "@core/guide-feedback";
import { EXTRACT, FACE_OVAL, extractAll, type ExtractPart, type PartMask } from "@core/makeup-extract";
import { partGuides, type PartGuide } from "@core/part-guide";
import type { Pt } from "@core/types";
import { startFrameLoop } from "./camera-loop";
import { createLandmarker } from "./landmarker";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const AI_SERVER = "http://127.0.0.1:7861";
const AI_STEPS = 4, AI_STRENGTH = 0.85, AI_SEED = 1234;
const COUNTDOWN_MS = 3000;

const STEP_NAME = ["맨얼굴", "참고 사진", "정답사진", "부위 가이드", "시도사진", "피드백", "저장"] as const;
const PAGE_NAME: Record<FeedbackPart, string> = { brow: "눈썹", liner: "아이라이너", shadow: "아이섀도", lip: "입술", cheek: "블러셔" };
const PAGE_HINT: Record<FeedbackPart, string> = {
  brow: "선 안을 채워요 — 꼬리 끝까지",
  liner: "선 안을 채워요 — 눈꼬리에서 꼬리 각도 그대로",
  shadow: "라이너 위로 선까지 펴 발라요",
  lip: "입술선 안을 채워요",
  cheek: "타원 안에 펴 발라요",
};
/** 자른 사진 가로/세로 — 눈 부위는 양쪽 눈을 한 장에 */
const PAGE_ASPECT: Record<FeedbackPart, number> = { brow: 2, liner: 2, shadow: 2, lip: 1.5, cheek: 1.6 };
const COLOR: Partial<Record<ExtractPart, string>> = {
  brow: "rgb(255,159,28)", liner: "rgb(0,209,255)", shadow: "rgb(177,75,255)", underShadow: "rgb(224,123,255)", lip: "rgb(255,59,92)", cheek: "rgb(255,126,182)",
};

const video = $<HTMLVideoElement>("v");
const chips = $("chips");

// ---------- 상태 ----------

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
let step: Step = 1, reached: Step = 1;
let bareCv: HTMLCanvasElement | null = null, refCv: HTMLCanvasElement | null = null, tryCv: HTMLCanvasElement | null = null;
/** 맨얼굴 — 모든 그림을 이 좌표에 겹친다. keep: 얼굴 윤곽 0.9 안 (klein 이 칠하는 곳 · 시도사진 떼기도 여기만) */
let base: { lm: Pt[]; bare: RgbaImage; clip: Pt[]; keep: Uint8Array; eyeW: number } | null = null;
let answer: { made: HTMLCanvasElement; parts: PartMask[]; guides: PartGuide[]; pages: FeedbackPart[] } | null = null;
let attempt: { tried: HTMLCanvasElement; fb: PartFeedback[] } | null = null;
let pageIdx = 0;

const say = (el: HTMLElement, text: string, warn = false): void => { el.innerHTML = warn ? `<span class="warn">${text}</span>` : text; };

// ---------- 화면 넘기기 ----------

function go(next: Step): void {
  if (next !== step) cams.forEach((c) => c.stop());
  step = next;
  if (next > reached) reached = next;
  for (const s of document.querySelectorAll<HTMLElement>("section[data-step]")) s.classList.toggle("now", Number(s.dataset.step) === next);
  drawChips();
  if (next === 4) renderGuide();
  if (next === 6) renderFeedback();
  window.scrollTo({ top: 0 });
}

function drawChips(): void {
  chips.replaceChildren(...STEP_NAME.map((name, i) => {
    const n = (i + 1) as Step, b = document.createElement("button");
    b.type = "button";
    b.textContent = `${n} ${name}`;
    b.className = n === step ? "now" : "";
    b.disabled = n > reached;
    b.addEventListener("click", () => go(n));
    return b;
  }));
}

/** 앞 단계가 바뀌면 그 뒤는 다시 */
function resetFrom(s: Step): void {
  if (s <= 3) { answer = null; pageIdx = 0; }
  attempt = null;
  reached = Math.min(reached, s) as Step;
  drawChips();
}

// ---------- 그림 다루기 ----------

function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d", { willReadFrequently: true })!.drawImage(src, 0, 0, w, h);
  return c;
}

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

function rgbaOf(c: HTMLCanvasElement): RgbaImage {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: d.width, h: d.height };
}

let imageLm: Promise<FaceLandmarker> | null = null;
async function lmOf(c: HTMLCanvasElement): Promise<Pt[] | null> {
  imageLm ??= createLandmarker("IMAGE", { blendshapes: false });
  const face = (await imageLm).detect(c).faceLandmarks[0];
  return face && face.length >= 478 ? face.map((p) => ({ x: p.x * c.width, y: p.y * c.height })) : null;
}

/** 다른 사진을 맨얼굴 크기 · 자리로 (그 사진 얼굴 점 → 맨얼굴 얼굴 점 아핀, 튀는 점 무시) */
async function alignToBare(src: HTMLCanvasElement): Promise<HTMLCanvasElement | string> {
  if (!base || !bareCv) return "맨얼굴이 없어요";
  const lm = await lmOf(src);
  if (!lm) return "사진에서 얼굴을 못 찾았어요";
  const ids = Array.from({ length: 468 }, (_, i) => i);
  const t: Affine | null = robustAffine(ids.map((i) => lm[i]!), ids.map((i) => base!.lm[i]!), 1);
  if (!t) return "맨얼굴과 겹치지 못했어요";
  const c = document.createElement("canvas");
  c.width = bareCv.width; c.height = bareCv.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.setTransform(t[0], t[3], t[1], t[4], t[2], t[5]);
  g.drawImage(src, 0, 0);
  return c;
}

/** 떼기 — 얼굴 윤곽 0.9 밖은 버린다 */
function extractOn(img: HTMLCanvasElement): PartMask[] {
  const b = base!, res = extractAll(b.bare, rgbaOf(img), b.lm, EXTRACT);
  return res.parts.map((p) => {
    const mask = p.mask.map((v, i) => (v && b.keep[i] ? 1 : 0));
    return { ...p, mask, count: mask.reduce((s, v) => s + v, 0) };
  });
}

/** 자른 자리를 넓이 OUT_W 로 키워 그리고 가이드 테두리 · (있으면) 덜 그림 · 넘침을 얹는다 */
const OUT_W = 960;
function drawCrop(out: HTMLCanvasElement, src: HTMLCanvasElement, crop: Rect, guides: readonly PartGuide[], fb?: PartFeedback): void {
  out.width = OUT_W;
  out.height = Math.round((OUT_W * crop.h) / crop.w);
  const g = out.getContext("2d")!, k = OUT_W / crop.w;
  g.fillStyle = "#000";
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  if (fb) {
    const x0 = Math.max(0, Math.floor(crop.x)), y0 = Math.max(0, Math.floor(crop.y));
    const x1 = Math.min(src.width, Math.ceil(crop.x + crop.w)), y1 = Math.min(src.height, Math.ceil(crop.y + crop.h));
    if (x1 > x0 && y1 > y0) {
      const ov = document.createElement("canvas");
      ov.width = x1 - x0; ov.height = y1 - y0;
      const og = ov.getContext("2d")!, id = og.createImageData(ov.width, ov.height);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * src.width + x, o = ((y - y0) * ov.width + (x - x0)) * 4;
        const c = fb.missed[i] ? [255, 59, 92] : fb.over[i] ? [255, 210, 63] : null;
        if (!c) continue;
        id.data[o] = c[0]!; id.data[o + 1] = c[1]!; id.data[o + 2] = c[2]!; id.data[o + 3] = 150;
      }
      og.putImageData(id, 0, 0);
      g.drawImage(ov, (x0 - crop.x) * k, (y0 - crop.y) * k, ov.width * k, ov.height * k);
    }
  }
  for (const o of guides) for (const poly of o.polys) {
    if (poly.length < 3) continue;
    g.beginPath();
    g.moveTo((poly[0]!.x - crop.x) * k, (poly[0]!.y - crop.y) * k);
    for (const p of poly.slice(1)) g.lineTo((p.x - crop.x) * k, (p.y - crop.y) * k);
    g.closePath();
    g.lineJoin = "round";
    g.strokeStyle = "rgba(0,0,0,.45)";
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = COLOR[o.part] ?? "#fff";
    g.lineWidth = 2.5;
    g.stroke();
  }
}

const guidesOf = (page: FeedbackPart): PartGuide[] => (answer?.guides ?? []).filter((g) => pageOf(g.part) === page);
const cropOf = (page: FeedbackPart): Rect => cropSpec(page, base!.lm, PAGE_ASPECT[page], guidesOf(page).flatMap((g) => g.polys.flat()));

// ---------- 카메라 (1 맨얼굴 · 5 시도사진) ----------

let videoLm: FaceLandmarker | null = null;
const cams: { stop: () => void }[] = [];

function camera(view: HTMLCanvasElement, msg: HTMLElement, camBtn: HTMLButtonElement, snapBtn: HTMLButtonElement, onShot: (c: HTMLCanvasElement) => void): void {
  let mode: "off" | "live" | "countdown" | "shooting" = "off", t0 = 0, stopLoop: (() => void) | null = null;
  const stop = (): void => {
    if (mode === "off") return;
    stopLoop?.();
    stopLoop = null;
    for (const t of (video.srcObject as MediaStream | null)?.getTracks() ?? []) t.stop();
    video.srcObject = null;
    mode = "off";
    camBtn.textContent = "카메라 켜기";
    snapBtn.disabled = true;
  };
  cams.push({ stop });
  const drawLive = (count?: number): void => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const W = 480, H = 640;
    view.width = W; view.height = H;
    const g = view.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    const k = Math.max(W / w, H / h), dw = w * k, dh = h * k;
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    g.restore();
    if (count === undefined) return;
    g.font = "700 160px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(0,0,0,.6)";
    g.fillStyle = "#fff";
    g.strokeText(String(count), W / 2, H / 2);
    g.fillText(String(count), W / 2, H / 2);
  };
  const frame = (now: number): void => {
    if (mode === "off" || video.readyState < 2) return;
    if (mode === "countdown") {
      const left = COUNTDOWN_MS - (now - t0);
      if (left > 0) { drawLive(Math.ceil(left / 1000)); return; }
      mode = "shooting";
    }
    drawLive();
    if (mode !== "shooting" || !videoLm) return;
    // 카운트다운이 끝나면 얼굴이 보이는 첫 장을 바로 찍는다
    const w = video.videoWidth, h = video.videoHeight, face = videoLm.detectForVideo(video, now).faceLandmarks[0];
    if (!face || face.length < 478) { say(msg, "얼굴을 찾지 못했어요 — 화면 안에 얼굴을", true); return; }
    const shot = toCanvas(video, w, h);
    stop();
    onShot(shot);
  };
  camBtn.addEventListener("click", async () => {
    if (mode !== "off") { stop(); return; }
    cams.forEach((c) => c.stop());
    camBtn.disabled = true;
    say(msg, "카메라를 여는 중…");
    try {
      videoLm ??= await createLandmarker("VIDEO", { blendshapes: false });
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      await video.play();
      mode = "live";
      stopLoop = startFrameLoop(video, frame, { onError: (e) => say(msg, String(e), true) });
      camBtn.textContent = "카메라 끄기";
      snapBtn.disabled = false;
      say(msg, '정면을 보고 "찍기"');
    } catch (e) {
      say(msg, `카메라를 못 열었어요: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      camBtn.disabled = false;
    }
  });
  snapBtn.addEventListener("click", () => {
    if (mode === "off") return;
    t0 = performance.now();
    mode = "countdown";
    say(msg, "정면을 봐 주세요 — 3초 뒤 찍어요");
  });
}

// ---------- 1 맨얼굴 ----------

const bareView = $<HTMLCanvasElement>("bareView"), bareMsg = $("bareMsg"), bareNext = $<HTMLButtonElement>("bareNext"), bareSave = $<HTMLButtonElement>("bareSave");

async function setBare(c: HTMLCanvasElement): Promise<void> {
  bareCv = c;
  base = null;
  resetFrom(1);
  preview(bareView, c);
  bareSave.disabled = false;
  bareNext.disabled = true;
  say(bareMsg, "얼굴 점을 찾는 중…");
  const lm = await lmOf(c);
  if (!lm) { say(bareMsg, "얼굴을 못 찾았어요 — 다시 찍어 주세요", true); return; }
  const oval = FACE_OVAL.map((i) => lm[i]!), m = oval.reduce((s, p) => ({ x: s.x + p.x / oval.length, y: s.y + p.y / oval.length }), { x: 0, y: 0 });
  // klein 이 칠하는 곳(app_klein.py OVAL_KEEP 0.9) — 그 밖은 원본에 되붙인 경계 차이라 버린다
  const clip = oval.map((p) => ({ x: m.x + (p.x - m.x) * 0.9, y: m.y + (p.y - m.y) * 0.9 }));
  const keep = new Uint8Array(c.width * c.height), xs = clip.map((p) => p.x), ys = clip.map((p) => p.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(c.height - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(c.width - 1, Math.ceil(Math.max(...xs))); x++) if (pointInPoly(x, y, clip)) keep[y * c.width + x] = 1;
  }
  base = { lm, bare: rgbaOf(c), clip, keep, eyeW: Math.hypot(lm[33]!.x - lm[133]!.x, lm[33]!.y - lm[133]!.y) };
  say(bareMsg, `찍었어요 — ${c.width}×${c.height}`);
  bareNext.disabled = false;
  refNext.disabled = !refCv;
}

camera(bareView, bareMsg, $("bareCam"), $("bareSnap"), (c) => void setBare(c));
$<HTMLInputElement>("bareFile").addEventListener("change", async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) await setBare(await canvasOfFile(f));
});
bareNext.addEventListener("click", () => go(2));
// 개발용 — 같은 사진으로 다시 돌려 보려고 원본 크기 그대로 내려받는다
bareSave.addEventListener("click", () => { if (bareCv) download(bareCv, "nudy-bare"); });

// ---------- 2 참고 사진 ----------

const refView = $<HTMLCanvasElement>("refView"), refMsg = $("refMsg"), refNext = $<HTMLButtonElement>("refNext");
$<HTMLInputElement>("refFile").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (!f) return;
  refCv = await canvasOfFile(f);
  input.value = "";
  preview(refView, refCv);
  say(refMsg, `${refCv.width}×${refCv.height}`);
  refNext.disabled = !base;
});
$("refBack").addEventListener("click", () => go(1));
refNext.addEventListener("click", () => {
  go(3);
  void makeAnswer();
});

// ---------- 3 정답사진 ----------

const madeView = $<HTMLCanvasElement>("madeView"), madeMsg = $("madeMsg"), madeNext = $<HTMLButtonElement>("madeNext");
let aiBusy = false;

/** Gradio REST: POST /gradio_api/call/predict → event_id → GET 같은 주소/event_id 의 SSE 에서 complete 줄 */
async function callAi(bare: HTMLCanvasElement, ref: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const fd = (c: HTMLCanvasElement) => ({ url: c.toDataURL("image/png"), meta: { _type: "gradio.FileData" } });
  const r = await fetch(`${AI_SERVER}/gradio_api/call/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [fd(bare), fd(ref), AI_STEPS, AI_STRENGTH, true, AI_SEED] }),
  });
  if (!r.ok) throw new Error(`AI 서버 응답 ${r.status}`);
  const { event_id: id } = (await r.json()) as { event_id: string };
  const sse = await (await fetch(`${AI_SERVER}/gradio_api/call/predict/${id}`)).text();
  const m = /event: (\w+)\ndata: (.*)/g;
  let ev: RegExpExecArray | null, data: unknown = null, kind = "";
  while ((ev = m.exec(sse))) { kind = ev[1]!; data = ev[2] ? JSON.parse(ev[2]) : null; if (kind === "complete" || kind === "error") break; }
  if (kind !== "complete" || !Array.isArray(data)) throw new Error(`AI 실패: ${kind} ${JSON.stringify(data)?.slice(0, 200)}`);
  const file = data[0] as { path: string };
  const blob = await (await fetch(`${AI_SERVER}/gradio_api/file=${encodeURIComponent(file.path)}`)).blob();
  const bmp = await createImageBitmap(blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/webp" }));
  const img = toCanvas(bmp, bmp.width, bmp.height);
  bmp.close();
  return img;
}

async function makeAnswer(): Promise<void> {
  if (!bareCv || !refCv || aiBusy) return;
  aiBusy = true;
  resetFrom(3);
  madeNext.disabled = true;
  preview(madeView, null);
  const t0 = performance.now();
  try {
    say(madeMsg, "정답사진을 만드는 중… (AI 서버를 켜고 처음 한 장은 1분쯤)");
    const img = await callAi(bareCv, refCv);
    // 다른 사람 사진(참고 사진)은 정답사진을 만든 뒤 바로 지운다 (서비스 정의서 원칙)
    refCv = null;
    preview(refView, null);
    say(refMsg, "참고 사진은 정답사진을 만든 뒤 지웠어요");
    refNext.disabled = true;
    await setMade(img, `${((performance.now() - t0) / 1000).toFixed(1)}초 · 참고 사진은 지웠어요`);
  } catch (e) {
    say(madeMsg, `${e instanceof Error ? e.message : String(e)} — AI 서버(${AI_SERVER})가 켜져 있나요? 정답사진 파일을 직접 올려도 돼요`, true);
  } finally {
    aiBusy = false;
  }
}

/** 정답사진 → 맨얼굴에 겹쳐 떼고 부위 가이드 모양 */
async function setMade(img: HTMLCanvasElement, note: string): Promise<void> {
  resetFrom(3);
  preview(madeView, img);
  madeNext.disabled = true;
  say(madeMsg, `${note}\n부위 가이드를 만드는 중…`);
  const made = await alignToBare(img);
  if (typeof made === "string") { say(madeMsg, made, true); return; }
  await new Promise((r) => setTimeout(r, 0));
  const parts = extractOn(made);
  const guides = partGuides(parts, base!.lm, made.width, made.height, { clip: base!.clip, made: rgbaOf(made) });
  const pages = FEEDBACK_ORDER.filter((p) => guides.some((g) => pageOf(g.part) === p && g.polys.some((q) => q.length >= 3)));
  answer = { made, parts, guides, pages };
  pageIdx = 0;
  if (!pages.length) { say(madeMsg, `${note}\n화장한 부위를 못 찾았어요 — 다른 참고 사진으로 해 보세요`, true); return; }
  say(madeMsg, `${note}\n부위 ${pages.length}개: ${pages.map((p) => PAGE_NAME[p]).join(" → ")}`);
  madeNext.disabled = false;
}

$<HTMLInputElement>("madeFile").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (!f) return;
  input.value = "";
  await setMade(await canvasOfFile(f), "정답사진 파일");
});
$("madeBack").addEventListener("click", () => go(2));
madeNext.addEventListener("click", () => { pageIdx = 0; go(4); });

// ---------- 4 부위 가이드 ----------

const guideView = $<HTMLCanvasElement>("guideView"), guideTitle = $("guideTitle"), guideHint = $("guideHint"), guideMsg = $("guideMsg");
const guidePrev = $<HTMLButtonElement>("guidePrev"), guideNext = $<HTMLButtonElement>("guideNext");
const guideBase = (): "made" | "bare" => (document.querySelector<HTMLInputElement>('input[name="guideBase"]:checked')?.value === "bare" ? "bare" : "made");

function renderGuide(): void {
  if (!answer || !base || !bareCv) return;
  const page = answer.pages[pageIdx];
  if (!page) return;
  guideTitle.textContent = `4 부위 가이드 — ${PAGE_NAME[page]} (${pageIdx + 1}/${answer.pages.length})`;
  guideHint.textContent = PAGE_HINT[page];
  drawCrop(guideView, guideBase() === "bare" ? bareCv : answer.made, cropOf(page), guidesOf(page));
  say(guideMsg, "폰을 두고 거울로 가서 그려요. 다 그렸으면 다음");
  guidePrev.textContent = pageIdx ? `이전 — ${PAGE_NAME[answer.pages[pageIdx - 1]!]}` : "정답사진 다시 보기";
  const next = answer.pages[pageIdx + 1];
  guideNext.textContent = next ? `다음 — ${PAGE_NAME[next]}` : "다 했어요 — 시도사진 찍기";
}

for (const r of document.querySelectorAll<HTMLInputElement>('input[name="guideBase"]')) r.addEventListener("change", renderGuide);
guidePrev.addEventListener("click", () => {
  if (pageIdx) { pageIdx--; renderGuide(); } else go(3);
});
guideNext.addEventListener("click", () => {
  if (answer && pageIdx < answer.pages.length - 1) { pageIdx++; renderGuide(); window.scrollTo({ top: 0 }); } else go(5);
});

// ---------- 5 시도사진 ----------

const tryView = $<HTMLCanvasElement>("tryView"), tryMsg = $("tryMsg"), tryNext = $<HTMLButtonElement>("tryNext");

function setTry(c: HTMLCanvasElement): void {
  tryCv = c;
  attempt = null;
  preview(tryView, c);
  say(tryMsg, `찍었어요 — ${c.width}×${c.height}`);
  tryNext.disabled = false;
}

camera(tryView, tryMsg, $("tryCam"), $("trySnap"), setTry);
$<HTMLInputElement>("tryFile").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (!f) return;
  input.value = "";
  setTry(await canvasOfFile(f));
});
$("tryBack").addEventListener("click", () => { pageIdx = 0; go(4); });
tryNext.addEventListener("click", async () => {
  if (!tryCv || !answer || !base) return;
  tryNext.disabled = true;
  say(tryMsg, "정답사진과 견주는 중…");
  const tried = await alignToBare(tryCv);
  tryNext.disabled = false;
  if (typeof tried === "string") { say(tryMsg, tried, true); return; }
  await new Promise((r) => setTimeout(r, 0));
  const fb = guideFeedback(answer.guides, answer.parts, extractOn(tried), tried.width, tried.height, FEEDBACK.tol * base.eyeW).filter((f) => answer!.pages.includes(f.part));
  attempt = { tried, fb };
  say(tryMsg, "");
  go(6);
});

// ---------- 6 피드백 ----------

const fbList = $("fbList");

function renderFeedback(): void {
  if (!attempt || !answer) return;
  fbList.replaceChildren(...attempt.fb.map((f) => {
    const card = document.createElement("div");
    card.className = "fb";
    const h = document.createElement("h3");
    h.textContent = PAGE_NAME[f.part];
    const pair = document.createElement("div");
    pair.className = "pair";
    const crop = cropOf(f.part), guides = guidesOf(f.part);
    for (const [cap, src, withFb] of [["정답사진", answer!.made, false], ["내 사진", attempt!.tried, true]] as const) {
      const fig = document.createElement("figure"), fc = document.createElement("figcaption"), cv = document.createElement("canvas");
      fc.textContent = cap;
      cv.className = "wide";
      drawCrop(cv, src, crop, guides, withFb ? f : undefined);
      fig.append(fc, cv);
      pair.append(fig);
    }
    const ul = document.createElement("ul");
    for (const n of f.notes) {
      const li = document.createElement("li");
      li.textContent = n;
      ul.append(li);
    }
    card.append(h, pair, ul);
    return card;
  }));
}

$("fbBack").addEventListener("click", () => go(5));
$("fbNext").addEventListener("click", () => go(7));

// ---------- 7 저장 ----------

const saveMsg = $("saveMsg");

/** 얼굴 점 상자 + 여백 12% */
function faceRect(lm: readonly Pt[], w: number, h: number): Rect {
  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y), mx = (Math.max(...xs) - Math.min(...xs)) * 0.12, my = (Math.max(...ys) - Math.min(...ys)) * 0.12;
  const x0 = Math.max(0, Math.min(...xs) - mx), y0 = Math.max(0, Math.min(...ys) - my);
  return { x: x0, y: y0, w: Math.min(w, Math.max(...xs) + mx) - x0, h: Math.min(h, Math.max(...ys) + my) - y0 };
}

/** 결과 한 장 — 위: 정답사진 · 내 사진 얼굴, 아래: 부위마다 두 장 + 한 줄 */
function resultImage(): HTMLCanvasElement | null {
  if (!attempt || !answer || !base) return null;
  const W = 1200, half = W / 2, gap = 12, face = faceRect(base.lm, answer.made.width, answer.made.height);
  const faceH = Math.round((half * face.h) / face.w);
  const rows = attempt.fb.map((f) => {
    const crop = cropOf(f.part), a = document.createElement("canvas"), b = document.createElement("canvas");
    drawCrop(a, answer!.made, crop, guidesOf(f.part));
    drawCrop(b, attempt!.tried, crop, guidesOf(f.part), f);
    return { f, a, b, h: Math.round((half * crop.h) / crop.w) };
  });
  const out = document.createElement("canvas");
  out.width = W;
  out.height = 60 + faceH + rows.reduce((s, r) => s + 44 + r.h + gap, 0) + 20;
  const g = out.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = "#222";
  g.font = '600 26px system-ui, "Malgun Gothic", sans-serif';
  g.fillText("정답사진", 12, 38);
  g.fillText("내 사진", half + 12, 38);
  g.drawImage(answer.made, face.x, face.y, face.w, face.h, 0, 50, half - 4, faceH);
  g.drawImage(attempt.tried, face.x, face.y, face.w, face.h, half + 4, 50, half - 4, faceH);
  let y = 60 + faceH;
  for (const r of rows) {
    g.fillStyle = "#222";
    g.font = '600 22px system-ui, "Malgun Gothic", sans-serif';
    g.fillText(`${PAGE_NAME[r.f.part]} — ${r.f.notes.join(" · ")}`, 12, y + 30);
    y += 44;
    g.drawImage(r.a, 0, y, half - 4, r.h);
    g.drawImage(r.b, half + 4, y, half - 4, r.h);
    y += r.h + gap;
  }
  return out;
}

const stamp = (): string => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** PNG 로 이 기기의 다운로드 폴더에 */
function download(c: HTMLCanvasElement, name: string, done?: () => void): void {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${stamp()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    done?.();
  }, "image/png");
}

$("saveBtn").addEventListener("click", () => {
  const c = resultImage();
  if (!c) { say(saveMsg, "피드백까지 마쳐야 저장할 수 있어요", true); return; }
  download(c, "nudy-result", () => say(saveMsg, "저장했어요 — 다운로드 폴더"));
});
$("restart").addEventListener("click", () => {
  bareCv = refCv = tryCv = null;
  base = answer = attempt = null;
  pageIdx = 0;
  reached = 1;
  for (const v of [bareView, refView, madeView, tryView]) preview(v, null);
  for (const m of [bareMsg, refMsg, madeMsg, tryMsg, saveMsg]) say(m, "");
  bareNext.disabled = refNext.disabled = madeNext.disabled = tryNext.disabled = bareSave.disabled = true;
  fbList.replaceChildren();
  go(1);
});

for (const v of [bareView, refView, madeView, tryView]) preview(v, null);
go(1);
