/**
 * [dev 전용] 머리선 확인 (hairline-probe.html) — core/hairline.ts 를 실제 웹캠에서 본다 (2026-10-05).
 * 랜드마크 478개 · MediaPipe 이마 위 선 · 머리선 점(찾음 / 앞머리 / 못 찾음)을 겹쳐 그린다.
 * 사진은 어디에도 저장하지 않는다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FOREHEAD_ARC, findHairline, type HairlinePoint } from "@core/hairline";
import type { HairMask } from "@core/sampling";
import type { Pt } from "@core/types";
import { startFrameLoop } from "./camera-loop";
import { loadHairSegmenter, type HairSegmenter } from "./hair-segmenter";
import { createLandmarker } from "./landmarker";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const video = $<HTMLVideoElement>("v");
const cv = $<HTMLCanvasElement>("cv");
const statusEl = $("status");
const startBtn = $<HTMLButtonElement>("start");
const showLm = $<HTMLInputElement>("showLm");
const showMask = $<HTMLInputElement>("showMask");
const ctx2d = cv.getContext("2d");
if (!ctx2d) throw new Error("캔버스 2D 를 쓸 수 없음");
const g: CanvasRenderingContext2D = ctx2d;

/** 머리카락 분할 간격 · 분할에 넣을 크기 (2-b AR 과 비슷하게 — 매 장면 돌리면 느려진다) */
const SEG = { intervalMs: 200, width: 512 };
const COLOR = { lm: "rgba(229,231,235,.7)", arc: "#22d3ee", hair: "#4ade80", bangs: "#fb923c", none: "#9ca3af" } as const;

let landmarker: FaceLandmarker | null = null;
let segmenter: HairSegmenter | null = null;
let mask: HairMask | null = null;
let lastSeg = -Infinity, segMs = 0;
const small = document.createElement("canvas");
const maskCv = document.createElement("canvas");
let frames = 0, fps = 0, fpsT0 = performance.now();

function segment(now: number, w: number, h: number): void {
  if (!segmenter || now - lastSeg < SEG.intervalMs) return;
  lastSeg = now;
  small.width = SEG.width;
  small.height = Math.round((h * SEG.width) / w);
  const sg = small.getContext("2d", { willReadFrequently: true });
  if (!sg) return;
  sg.drawImage(video, 0, 0, small.width, small.height);
  const px = sg.getImageData(0, 0, small.width, small.height), t0 = performance.now();
  mask = segmenter.segment({ data: px.data, w: small.width, h: small.height }) ?? mask;
  segMs = Math.round(performance.now() - t0);
}

function drawMask(w: number, h: number): void {
  if (!mask) return;
  maskCv.width = mask.w;
  maskCv.height = mask.h;
  const mg = maskCv.getContext("2d");
  if (!mg) return;
  const img = mg.createImageData(mask.w, mask.h);
  for (let i = 0; i < mask.w * mask.h; i++) {
    const a = Math.round(Math.min(1, Math.max(0, Number(mask.data[i] ?? 0))) * 140);
    img.data.set([232, 121, 249, a], i * 4);
  }
  mg.putImageData(img, 0, 0);
  g.drawImage(maskCv, 0, 0, w, h);
}

function dot(p: Pt, color: string, r: number, hollow = false): void {
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (hollow) { g.strokeStyle = color; g.lineWidth = r / 2; g.stroke(); }
  else { g.fillStyle = color; g.fill(); }
}

function line(pts: readonly Pt[], color: string, width: number, dash: number[] = []): void {
  if (pts.length < 2) return;
  g.save();
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke();
  g.restore();
}

function drawOverlay(lm: readonly Pt[], hl: readonly HairlinePoint[], w: number): void {
  const lw = Math.max(1.5, w / 640);
  if (showLm.checked) for (const p of lm) dot(p, COLOR.lm, lw * 0.9);
  line(FOREHEAD_ARC.map((i) => lm[i]!), COLOR.arc, lw * 1.5);
  // 머리선: 찾은 칸끼리 잇고, 출발점 → 머리선은 점선
  line(hl.map((p) => p.at), COLOR.hair, lw * 1.5);
  for (const p of hl) {
    if (p.kind === "hair") { line([p.base, p.at], COLOR.hair, lw, [lw * 2, lw * 2]); dot(p.at, COLOR.hair, lw * 3); }
    else if (p.kind === "bangs") dot(p.at, COLOR.bangs, lw * 3);
    else dot(p.at, COLOR.none, lw * 3, true);
  }
}

function frame(now: number): void {
  if (!landmarker || video.readyState < 2) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  g.drawImage(video, 0, 0, w, h);
  segment(now, w, h);
  if (showMask.checked) drawMask(w, h);
  const face = landmarker.detectForVideo(video, now).faceLandmarks[0];
  let info = "얼굴을 찾지 못했어요";
  if (face && face.length >= 478) {
    const lm: Pt[] = face.map((p) => ({ x: p.x * w, y: p.y * h }));
    if (mask) {
      const hl = findHairline(lm, mask, { w, h });
      drawOverlay(lm, hl, w);
      const n = (k: HairlinePoint["kind"]) => hl.filter((p) => p.kind === k).length;
      info = `머리선 ${n("hair")}칸 · 앞머리 ${n("bangs")}칸 · 못 찾음 ${n("none")}칸`;
    } else {
      drawOverlay(lm, [], w);
      info = segmenter ? "머리카락 분할 준비 중" : "머리카락 분할을 못 불러왔어요 — 랜드마크만";
    }
  }
  frames++;
  if (now - fpsT0 >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT0)); frames = 0; fpsT0 = now; }
  statusEl.textContent = `${fps} fps · 분할 ${segMs}ms (${SEG.intervalMs}ms 마다) · ${info}`;
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  statusEl.textContent = "모델을 불러오는 중…";
  try {
    landmarker = await createLandmarker("VIDEO", { blendshapes: false });
    segmenter = await loadHairSegmenter().catch((e: unknown) => {
      statusEl.innerHTML = `<span class="warn">머리카락 분할을 못 불러왔어요: ${e instanceof Error ? e.message : String(e)}</span>`;
      return null;
    });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    startFrameLoop(video, frame, { onError: (e) => { statusEl.innerHTML = `<span class="warn">${e instanceof Error ? e.message : String(e)}</span>`; } });
  } catch (e) {
    startBtn.disabled = false;
    statusEl.innerHTML = `<span class="warn">시작하지 못했어요: ${e instanceof Error ? e.message : String(e)}</span>`;
  }
}

startBtn.addEventListener("click", () => void start());
