/**
 * [dev 전용] 사진 가이드 POC (photo-guide-probe.html, 2026-10-06).
 *
 * 실시간 선은 손 · 브러시 · 화장 자체 때문에 그리는 동안 계속 움직인다(웹캠 ?jump). 그래서
 *  1. 맨얼굴로 가만히 있는 순간을 찍어(core/snapshot — 몇 장 중앙값) 그 사진 위에 가이드를 그린다
 *  2. 가이드는 맨얼굴에서 한 번 정해 얼굴 그물에 붙여 둔다(mesh-pin) — 화장이 점을 밀어도 가이드 모양은 그대로
 *  3. 그리다가 "다시 찍기" → 지금 얼굴 사진 위에 같은 가이드를 놓는다
 *  4. 찍기는 3초 카운트다운 뒤 (붓을 내려놓고 자세를 잡을 시간 — PC 시험에서 바로 찍히니 너무 빨랐다). 그동안만 실시간 영상.
 *     사진 화면에서는 얼굴 찾기를 쉰다. 거울 보기는 실사용에 필요 없어서 뺐다 (2026-10-06 사용자)
 * 가이드는 앱과 같다 — planGuide(화장, 표준 계획) · outlineOf(테두리 + 퍼지는 방향). 사진은 저장하지 않는다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { cropSpec } from "@core/crop";
import { outlineOf } from "@core/live-run";
import { LOOKS, lookById } from "@core/looks";
import { pinOutline, placeOutline, type PinnedOutline } from "@core/mesh-pin";
import type { Outline } from "@core/overlay";
import { planGuide } from "@core/personal-guide";
import { standardPlan } from "@core/personalize";
import { PART_NAME } from "@core/score";
import { wantedOrientation } from "@core/screens";
import { createSnapshotCollector, type Snapshot } from "@core/snapshot";
import type { PartId, Pt } from "@core/types";
import { startFrameLoop } from "./camera-loop";
import { createLandmarker } from "./landmarker";
import { strokeOutline } from "./outline-draw";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const video = $<HTMLVideoElement>("v");
const cv = $<HTMLCanvasElement>("cv");
const statusEl = $("status");
const startBtn = $<HTMLButtonElement>("start");
const snapBtn = $<HTMLButtonElement>("snap");
const rebaseBtn = $<HTMLButtonElement>("rebase");
const saveBtn = $<HTMLButtonElement>("save");
const showGuide = $<HTMLInputElement>("showGuide");
const lookSel = $<HTMLSelectElement>("look");
const partSel = $<HTMLSelectElement>("part");
const ctx2d = cv.getContext("2d");
if (!ctx2d) throw new Error("캔버스 2D 를 쓸 수 없음");
const g: CanvasRenderingContext2D = ctx2d;

const PARTS: readonly PartId[] = ["brow", "liner", "shadow", "lip", "cheek", "contour"];
for (const l of LOOKS) lookSel.append(new Option(l.name, l.id));
for (const p of PARTS) partSel.append(new Option(PART_NAME[p], p));
lookSel.value = "daily";

/** 사진 화면 가로 폭(px) — 가로 부위 16:9, 세로 부위 3:4 (화면 3 과 같은 비율) */
const VIEW_W = 960;
/** 찍기를 누르고 실제로 모으기 시작할 때까지 */
const COUNTDOWN_MS = 3000;

type Mode = "idle" | "countdown" | "collecting" | "photo";
let mode: Mode = "idle";
let countT0 = 0;
let landmarker: FaceLandmarker | null = null;
const collector = createSnapshotCollector<HTMLCanvasElement>();
/** 맨얼굴 기준 사진 · 가이드는 여기서 정해 그물에 붙인다 */
let base: Snapshot<HTMLCanvasElement> | null = null;
let pinned: PinnedOutline | null = null;
/** 지금 보여 주는 사진 (맨얼굴 또는 마지막으로 다시 찍은 것) */
let shown: Snapshot<HTMLCanvasElement> | null = null;
let shots = 0, collectT0 = 0;

const part = (): PartId => partSel.value as PartId;
const guide = () => planGuide(lookById(lookSel.value).parts, standardPlan(null));

function grab(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")?.drawImage(video, 0, 0);
  return c;
}

/** 맨얼굴에서 가이드를 정해 얼굴 그물에 붙인다 — 부위 · 화장을 바꾸면 다시 */
function repin(): void {
  pinned = base ? pinOutline(outlineOf(part(), base.lm, guide()), base.lm) : null;
}

/** 사진 + 가이드 — 부위 크기로 확대, 거울로 (화면 3 drawPart 와 같은 방식) */
function drawPhoto(): void {
  if (!shown) return;
  const p = part(), aspect = wantedOrientation(p) === "landscape" ? 16 / 9 : 3 / 4;
  const o: Outline | null = pinned ? placeOutline(pinned, shown.lm) : null;
  const crop = cropSpec(p, shown.lm, aspect, o ? [...o.polys.flat(), ...o.lines.flat()] : []);
  const cw = aspect >= 1 ? VIEW_W : Math.round(VIEW_W * 0.6), ch = Math.round(cw / aspect);
  cv.width = cw; cv.height = ch;
  const k = cw / crop.w;
  g.save();
  g.translate(cw, 0);
  g.scale(-1, 1);
  g.drawImage(shown.image, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
  if (o && showGuide.checked) {
    g.scale(k, k);
    g.translate(-crop.x, -crop.y);
    strokeOutline(g, o, Math.max(2, cw / 300) / k);
  }
  g.restore();
}

/** 실시간 영상 (선 없음) — 찍기 전 · 카운트다운 · 찍는 중. count 가 있으면 가운데에 크게 */
function drawLive(count?: number): void {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  const cw = VIEW_W, ch = Math.round((cw * h) / w);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  g.save();
  g.translate(cw, 0);
  g.scale(-1, 1);
  g.drawImage(video, 0, 0, cw, ch);
  g.restore();
  if (count !== undefined) {
    g.save();
    g.font = `700 ${Math.round(ch / 3)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = Math.max(4, ch / 90);
    g.strokeStyle = "rgba(0,0,0,.6)";
    g.fillStyle = "#fff";
    g.strokeText(String(count), cw / 2, ch / 2);
    g.fillText(String(count), cw / 2, ch / 2);
    g.restore();
  }
}

function setStatus(text: string, warn = false): void {
  statusEl.innerHTML = warn ? `<span class="warn">${text}</span>` : text;
}

function refreshButtons(): void {
  const busy = mode === "countdown" || mode === "collecting";
  snapBtn.disabled = !landmarker || busy;
  snapBtn.textContent = base ? "다시 찍기" : "찍기 (맨얼굴)";
  rebaseBtn.disabled = !base || busy;
  saveBtn.disabled = !shown || busy;
}

const stamp = (): string => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * 지금 보이는 사진(맨얼굴 또는 다시 찍은 것)을 원본 크기 · 원래 방향(거울 아님)으로 내려받는다 — PNG(손실 없음).
 * AI 화장 입히기(Stable-Makeup 데모) · 화장 떼기(makeup-extract-probe)에 그대로 올린다. 사용자가 누를 때만, 다운로드 폴더로
 */
function saveShown(): void {
  if (!shown) return;
  const name = shown === base ? `nudy-bare-${stamp()}.png` : `nudy-shot${shots}-${stamp()}.png`;
  shown.image.toBlob((blob) => {
    if (!blob) { setStatus("사진을 만들지 못했어요", true); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`${name} 저장 — 다운로드 폴더 (원본 크기, 거울 아닌 원래 방향)`);
  }, "image/png");
}

function showPhotoMode(): void {
  mode = "photo";
  drawPhoto();
  const p = PART_NAME[part()];
  setStatus(shown === base ? `맨얼굴 사진 위 ${p} 가이드 — 보면서 그리고 "다시 찍기"` : `${shots}번째로 다시 찍은 사진 위 ${p} 가이드 — 비어 있는 곳을 더 그리세요`);
  refreshButtons();
}

function frame(now: number): void {
  if (!landmarker || video.readyState < 2) return;
  if (mode === "photo") return;   // 사진 화면 — 얼굴 찾기 · 그리기 쉼
  if (mode === "countdown") {
    const left = COUNTDOWN_MS - (now - countT0);
    if (left > 0) { drawLive(Math.ceil(left / 1000)); return; }
    mode = "collecting";
    collector.reset();
    collectT0 = now;
    setStatus("가만히 있어 주세요…");
  }
  drawLive();
  if (mode !== "collecting") return;
  const w = video.videoWidth, h = video.videoHeight;
  const face = landmarker.detectForVideo(video, now).faceLandmarks[0];
  const lm: Pt[] | null = face && face.length >= 478 ? face.map((p) => ({ x: p.x * w, y: p.y * h })) : null;
  const done = collector.push(lm, grab());
  if (!done) {
    const waited = now - collectT0;
    setStatus(!lm ? "얼굴을 찾지 못했어요" : waited > 2500 ? "고개를 잠깐 멈춰 주세요" : "가만히 있어 주세요…", !lm || waited > 2500);
    return;
  }
  if (!base) { base = done; repin(); } else shots++;
  shown = done;
  showPhotoMode();
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  setStatus("모델을 불러오는 중…");
  try {
    landmarker = await createLandmarker("VIDEO", { blendshapes: false });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    startFrameLoop(video, frame, { onError: (e) => setStatus(e instanceof Error ? e.message : String(e), true) });
    setStatus('맨얼굴로 정면을 보고 "찍기" 를 눌러 주세요');
    refreshButtons();
  } catch (e) {
    startBtn.disabled = false;
    setStatus(`시작하지 못했어요: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

startBtn.addEventListener("click", () => void start());
saveBtn.addEventListener("click", saveShown);
snapBtn.addEventListener("click", () => {
  countT0 = performance.now();
  mode = "countdown";
  setStatus("붓을 내려놓고 정면을 봐 주세요 — 3초 뒤 찍어요");
  refreshButtons();
});
rebaseBtn.addEventListener("click", () => {
  base = null; pinned = null; shown = null; shots = 0;
  mode = "idle";
  setStatus('맨얼굴로 정면을 보고 "찍기" 를 눌러 주세요');
  refreshButtons();
});
const redraw = (): void => {
  repin();
  if (mode === "photo") showPhotoMode();
};
partSel.addEventListener("change", redraw);
lookSel.addEventListener("change", redraw);
showGuide.addEventListener("change", () => { if (mode === "photo") drawPhoto(); });
