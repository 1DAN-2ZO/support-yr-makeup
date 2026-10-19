/**
 * [dev 전용 스파이크] 피부색 측정 POC (skin-tone-probe.html, 2026-10-09)
 *  ① 촬영: 웹캠 3초 뒤 0.2초 간격 5프레임(프레임마다 얼굴 점 + 픽셀 읽기) 또는 파일 한 장 — makeup-extract-probe 와 같은 카메라 방식
 *     조명 보정: 얼굴 둘레 배경이 흰색이면 그 색을 중립으로 맞춘다 (core/skin-bg-wb). 눈 흰자 기준은 뺐다 — 데이터셋에서 효과가 없었다
 *  ② 얼굴 점 위에 볼 영역·걸러낸 픽셀·흰 배경으로 읽은 영역을 올려 보기
 *  ③ 평균 피부색: 보정 전/후 · 좌우 볼 · 프레임 흔들림 (ΔE2000 · ΔE76 같이)
 *  ④ 슬라이더: 볼 영역(밝기 분위수 · 크기 · a* 꼬리)은 픽셀부터 다시, 좌우 합치기는 숫자만 다시
 * ⑤ 웜/쿨 경향: **보정 전** 볼 b* 를 core/skin-verdict 의 기준(T ± 애매 폭)과 견준다. 조명 보정(흰 배경 기준)과 무관하다 —
 *    데이터셋 실험에서 보정(흰자 · 배경 둘 다)이 오히려 덜 갈랐다. 계산은 core/skin-measure · skin-color · skin-verdict (순수 함수, tests/skin-*.test.ts).
 * 사진은 이 컴퓨터 안에서만 쓰고 저장하지 않는다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { deltaE } from "@core/color";
import type { RgbaImage } from "@core/color";
import { BG_LIMITS, backgroundBounds, backgroundGain, isWhiteBackground, sampleBackground } from "@core/skin-bg-wb";
import type { BgSample } from "@core/skin-bg-wb";
import { deltaE2000, describeRgb, rgbHex } from "@core/skin-color";
import type { Rgb } from "@core/skin-color";
import { ROI_DEFAULT, SIDES, TONE_DEFAULT, applyGain, combineTones, measureCheek, skinTone } from "@core/skin-measure";
import type { Merge, RoiParams, Side, SkinFrame, SkinTone, ToneParams } from "@core/skin-measure";
import { VERDICT_VERSION, warmCoolVerdict } from "@core/skin-verdict";
import type { Verdict } from "@core/skin-verdict";
import type { Pt } from "@core/types";
import { startFrameLoop } from "./camera-loop";
import { createLandmarker } from "./landmarker";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const COUNTDOWN_MS = 3000, SHOT_GAP_MS = 200, SHOTS = 5;

const video = $<HTMLVideoElement>("v");
const shotView = $<HTMLCanvasElement>("shotView"), cvOverlay = $<HTMLCanvasElement>("cvOverlay");
const camBtn = $<HTMLButtonElement>("camBtn"), snapBtn = $<HTMLButtonElement>("snapBtn"), fileIn = $<HTMLInputElement>("file");
const msgEl = $("msg"), resultEl = $("result");
const showPts = $<HTMLInputElement>("showPts"), showBg = $<HTMLInputElement>("showBg");
const qLo = $<HTMLInputElement>("qLo"), qHi = $<HTMLInputElement>("qHi"), area = $<HTMLInputElement>("area"), aCut = $<HTMLInputElement>("aCut");
const mergeSel = $<HTMLSelectElement>("merge"), resetBtn = $<HTMLButtonElement>("reset");
const cvCorrected = $<HTMLCanvasElement>("cvCorrected"), corrNote = $("corrNote");

const setMsg = (text: string, warn = false): void => { msgEl.innerHTML = warn ? `<span class="warn">${text}</span>` : text; };

// ---------- 상태 ----------

interface Shot { im: RgbaImage; lm: Pt[] }
let shots: Shot[] = [];
/** 오버레이에 깔 사진 (shots[shownIdx] 의 그림) */
let shownCanvas: HTMLCanvasElement | null = null;
let shownIdx = 0;
/** 슬라이더로 바뀌는 픽셀 단계 결과 — shots 와 같은 순서 */
let frames: SkinFrame[] = [];
/** 프레임마다 얼굴 둘레 배경 색 (core/skin-bg-wb) */
let bgs: (BgSample | null)[] = [];

// ---------- 파라미터 읽기 ----------

const pct = (el: HTMLInputElement): number => Number(el.value) / 100;
const readRoi = (): RoiParams => ({ qLo: pct(qLo), qHi: pct(qHi), area: pct(area), aCut: pct(aCut) });
/** 조명 보정은 늘 흰 배경 기준 (흰자 기준은 뺐다) */
const readTone = (): ToneParams => ({ wb: true, strength: 1, linear: false, merge: mergeSel.value as Merge });

function showSliderValues(): void {
  for (const el of [qLo, qHi, area, aCut]) $(`${el.id}V`).textContent = `${el.value}%`;
}

function resetParams(): void {
  qLo.value = String(ROI_DEFAULT.qLo * 100); qHi.value = String(ROI_DEFAULT.qHi * 100);
  area.value = String(ROI_DEFAULT.area * 100); aCut.value = String(ROI_DEFAULT.aCut * 100);
  mergeSel.value = TONE_DEFAULT.merge;
}

// ---------- 그림 다루기 ----------

function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d", { willReadFrequently: true })!.drawImage(src, 0, 0, w, h);
  return c;
}

function readPixels(c: HTMLCanvasElement): RgbaImage {
  const id = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  return { data: id.data, w: id.width, h: id.height };
}

/** 촬영 칸 미리보기 — 칸에 맞춰 그린다 */
function previewShot(src: HTMLCanvasElement | null): void {
  if (src) fitView(src.width, src.height);
  const W = shotView.width, H = shotView.height;
  const g = shotView.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (src) g.drawImage(src, 0, 0, W, H);
}

/** 촬영 칸을 사진·영상과 같은 가로세로 비율로 (옆으로 긴 웹캠 화면이 작은 세로 칸에 갇히지 않게) */
function fitView(w: number, h: number): void {
  const W = Math.min(640, w), H = Math.round((W * h) / w);
  if (shotView.width !== W || shotView.height !== H) { shotView.width = W; shotView.height = H; }
}

// ---------- ① 촬영 ----------

type CamMode = "off" | "live" | "countdown" | "shooting";
let camMode: CamMode = "off", countT0 = 0, lastShotT = 0, firstShotT = 0, stopLoop: (() => void) | null = null;
let videoLm: FaceLandmarker | null = null;
let imageLm: Promise<FaceLandmarker> | null = null;

function drawLiveThumb(count?: number): void {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  fitView(w, h);
  const W = shotView.width, H = shotView.height;
  const g = shotView.getContext("2d")!;
  g.save();   // 거울로 보여 준다 (찍는 그림은 원래 방향)
  g.translate(W, 0);
  g.scale(-1, 1);
  g.drawImage(video, 0, 0, W, H);
  g.restore();
  if (count !== undefined) {
    g.font = "700 140px system-ui, sans-serif";
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
    shots = []; shownCanvas = null; lastShotT = -Infinity;
  }
  drawLiveThumb();
  if (camMode !== "shooting" || !videoLm) return;
  if (now - lastShotT < SHOT_GAP_MS) return;
  const w = video.videoWidth, h = video.videoHeight, face = videoLm.detectForVideo(video, now).faceLandmarks[0];
  if (!face || face.length < 478) { setMsg(`얼굴을 찾지 못했어요 — 화면 안에 얼굴을 (${shots.length}/${SHOTS})`, true); return; }
  const c = toCanvas(video, w, h);
  shots.push({ im: readPixels(c), lm: face.map((p) => ({ x: p.x * w, y: p.y * h })) });
  if (shots.length === 1) firstShotT = now;
  if (shots.length === 3) shownCanvas = c;
  lastShotT = now;
  setMsg(`찍는 중 ${shots.length}/${SHOTS}`);
  if (shots.length < SHOTS) return;
  const span = Math.round(now - firstShotT);
  stopCamera();
  shownIdx = 2;
  finishShots(`${w}×${h} · ${SHOTS}장 · 첫 장부터 마지막 장까지 ${span}ms`);
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
  if (camMode !== "off") { stopCamera(); previewShot(shownCanvas); return; }
  camBtn.disabled = true;
  setMsg("카메라를 여는 중…");
  try {
    videoLm ??= await createLandmarker("VIDEO", { blendshapes: false });
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await video.play();
    camMode = "live";
    stopLoop = startFrameLoop(video, camFrame, { onError: (e) => setMsg(String(e), true) });
    camBtn.textContent = "카메라 끄기";
    snapBtn.disabled = false;
    setMsg('흰 벽 · 흰 종이 앞에서, 맨얼굴로 정면을 보고 "찍기"');
  } catch (e) {
    setMsg(`카메라를 못 열었어요: ${e instanceof Error ? e.message : String(e)}`, true);
  } finally {
    camBtn.disabled = false;
  }
});

snapBtn.addEventListener("click", () => {
  if (camMode === "off") return;
  countT0 = performance.now();
  camMode = "countdown";
  setMsg(`정면을 봐 주세요 — 3초 뒤 ${SHOTS}장 찍어요`);
});

fileIn.addEventListener("change", async () => {
  const f = fileIn.files?.[0];
  if (!f) return;
  if (camMode !== "off") stopCamera();
  setMsg("얼굴 점을 찾는 중…");
  try {
    const bmp = await createImageBitmap(f);
    const c = toCanvas(bmp, bmp.width, bmp.height);
    bmp.close();
    imageLm ??= createLandmarker("IMAGE", { blendshapes: false });
    const face = (await imageLm).detect(c).faceLandmarks[0];
    if (!face || face.length < 478) { setMsg("얼굴을 찾지 못했어요", true); return; }
    shots = [{ im: readPixels(c), lm: face.map((p) => ({ x: p.x * c.width, y: p.y * c.height })) }];
    shownCanvas = c;
    shownIdx = 0;
    finishShots(`파일 ${c.width}×${c.height} · 1장`);
  } catch (e) {
    setMsg(`읽지 못했어요: ${e instanceof Error ? e.message : String(e)}`, true);
  }
});

function finishShots(info: string): void {
  previewShot(shownCanvas);
  setMsg(info);
  measureAll();
  update();
}

// ---------- 측정·표시 ----------

function measureAll(): void {
  const roi = readRoi();
  bgs = shots.map((s) => sampleBackground(s.im, s.lm));
  // 조명 보정 배수는 배경에서 (흰 배경이 아니면 null → 보정 안 함)
  frames = shots.map((s, i) => ({ R: measureCheek(s.im, s.lm, "R", roi), L: measureCheek(s.im, s.lm, "L", roi), gain: backgroundGain(bgs[i] ?? null) }));
}

const f1 = (v: number): string => v.toFixed(1);
const f2 = (v: number): string => v.toFixed(2);
const swatch = (rgb: Rgb | null): string =>
  rgb ? `<span class="sw" style="background:${rgbHex(rgb)}"></span>${rgbHex(rgb)}` : "—";
const labText = (t: SkinTone | null): string => (t ? `${f1(t.lab.L)} / ${f1(t.lab.a)} / ${f1(t.lab.b)}` : "—");

/** 화면 왼쪽에 놓인 볼 (MediaPipe 의 R/L 이름과 화면 방향이 헷갈려서 좌표로 정한다) */
function screenLeftSide(fr: SkinFrame): Side {
  const cx = (c: SkinFrame["R"]): number => (c ? c.poly.reduce((s, p) => s + p.x, 0) / c.poly.length : Infinity);
  return cx(fr.R) <= cx(fr.L) ? "R" : "L";
}

const TENDENCY_TEXT: Record<Verdict["tendency"], string> = {
  warm: "웜 쪽에 가까워 보여요",
  cool: "쿨 쪽에 가까워 보여요",
  ambiguous: "웜/쿨 어느 쪽이라고 말하기 애매해요",
};

/** 보정 전 볼 b* 로 말하는 웜/쿨 경향 — 판단 근거(값 · 기준 · 애매 폭)를 같이 보여 준다 */
function verdictHtml(rawLab: { b: number }): string {
  const v = warmCoolVerdict(rawLab);
  const shown = (n: number): string => n.toFixed(1);
  const side = v.tendency === "ambiguous" ? `기준 ${shown(v.threshold)} ± ${shown(v.margin)} 안`
    : `기준 ${shown(v.threshold)}보다 ${shown(Math.abs(v.diff))} ${v.diff > 0 ? "높음" : "낮음"}`;
  return `<div style="font-size:1.15em;font-weight:600;margin-bottom:4px">${TENDENCY_TEXT[v.tendency]}</div>
    <div class="sub" style="margin-bottom:12px;line-height:1.7">
      보정 전 볼 b*(노란기) ${shown(v.value)} — ${side}<br>
      데이터셋(4,910장)에서 이 기준의 정확도는 약 70% 안팎이라, 단정이 아니라 경향이에요 · 기준 ${VERDICT_VERSION}
    </div>`;
}

/** 흰 배경 기준 보정 결과: 배경 색 · 흰 배경 여부 · 보정 전 → 후 b* · 보정 후 값으로 본 판정 (비교용) */
function backgroundHtml(rawLab: { b: number }, fixed: SkinTone): string {
  const have = bgs.filter((b): b is BgSample => b !== null);
  if (!have.length) return '<div class="sub" style="margin-bottom:12px">흰 배경: 얼굴 둘레 배경을 못 쟀어요 (얼굴이 화면을 거의 다 채움) — 조금 떨어져서 찍어 주세요</div>';
  const med = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1]!;
  const rgb = [0, 1, 2].map((k) => med(have.map((b) => b.rgb[k]!))) as Rgb;
  const white = have.filter((b) => isWhiteBackground(b)).length;
  const head = `배경 색 ${swatch(rgb)} · L* ${f1(med(have.map((b) => b.L)))} · C* ${f1(med(have.map((b) => b.chroma)))} — 흰 배경 ${white}/${have.length}장 (기준 L* ≥ ${BG_LIMITS.minL} · C* ≤ ${BG_LIMITS.maxChroma})`;
  if (!fixed.wbApplied) return `<div class="sub" style="margin-bottom:12px;line-height:1.7"><span class="warn">흰 배경이 아니라 조명 보정을 못 했어요</span> — 흰 벽 · 흰 종이 앞에서 다시 찍어 주세요<br>${head}</div>`;
  const v2 = warmCoolVerdict(fixed.lab);
  return `<div class="sub" style="margin-bottom:12px;line-height:1.7">흰 배경 기준 보정: 볼 b* ${f1(rawLab.b)} → ${f1(fixed.lab.b)} · 보정 후 값으로 봐도 같은 기준이면 ${TENDENCY_TEXT[v2.tendency]} <span style="opacity:.8">(비교용 — 위 판정은 보정 전 값)</span><br>${head}</div>`;
}

function render(): void {
  if (!frames.length) { resultEl.textContent = "사진을 찍거나 올려 주세요."; return; }
  const tp = readTone();
  const corr = frames.map((f) => skinTone(f, tp)).filter((t): t is SkinTone => t !== null);
  const raw = frames.map((f) => skinTone(f, { ...tp, wb: false })).filter((t): t is SkinTone => t !== null);
  const C = combineTones(corr), R = combineTones(raw);
  if (!C || !R) { resultEl.innerHTML = '<span class="warn">볼 영역을 못 쟀어요 — 영역을 키우거나 분위수를 넓혀 보세요</span>'; return; }

  const shown = frames[shownIdx] ?? frames[0]!;
  const left = screenLeftSide(shown);
  const order: Side[] = left === "R" ? ["R", "L"] : ["L", "R"];
  const cheekRow = (s: Side, name: string): string => {
    const c = shown[s];
    return `<tr><td>${name}</td><td>${swatch(R.cheeks[s])}</td><td>${swatch(C.cheeks[s])}</td><td>${c ? `${c.n}/${c.total}` : "—"}</td></tr>`;
  };

  // 조명 보정 (흰 배경 기준)
  const gains = frames.map((f) => f.gain).filter((g): g is Rgb => g !== null);
  const gainMed = gains.length ? ([0, 1, 2].map((k) => [...gains.map((g) => g[k]!)].sort((a, b) => a - b)[gains.length >> 1]!) as Rgb) : null;
  const wbLine = !gainMed ? '<span class="warn">흰 배경이 아니라 보정 못 함 — 보정 전 값 그대로</span>'
    : `${gains.length}/${frames.length}장 성공 · 배수 R ${f2(gainMed[0])} G ${f2(gainMed[1])} B ${f2(gainMed[2])}`;

  // 프레임 흔들림 (보정 후 합친 값 기준)
  let spread = "1장이라 해당 없음";
  if (corr.length >= 2) {
    const d00 = corr.map((t) => deltaE2000(t.lab, C.lab)), d76 = corr.map((t) => deltaE(t.lab, C.lab));
    spread = `중앙값에서 최대 ΔE00 ${f2(Math.max(...d00))} · ΔE76 ${f2(Math.max(...d76))} (${corr.length}장)`;
  }

  const lrA = C.cheeks.R, lrB = C.cheeks.L;
  const lr = lrA && lrB ? (() => {
    const la = describeRgb(lrA).lab, lb = describeRgb(lrB).lab;
    return `ΔE00 ${f2(deltaE2000(la, lb))} · ΔE76 ${f2(deltaE(la, lb))}`;
  })() : "—";

  resultEl.innerHTML = `${verdictHtml(R.lab)}${backgroundHtml(R.lab, C)}
    <table>
      <tr><th></th><th>보정 전</th><th>보정 후</th></tr>
      <tr><td>합친 볼 색</td><td>${swatch(R.rgb)}</td><td>${swatch(C.rgb)}</td></tr>
      <tr><td>L* / a* / b*</td><td>${labText(R)}</td><td>${labText(C)}</td></tr>
      <tr><td>채도 C* / 색상각 h°</td><td>${f1(R.lch.C)} / ${f1(R.lch.h)}°</td><td>${f1(C.lch.C)} / ${f1(C.lch.h)}°</td></tr>
      <tr><td>ITA°</td><td>${f1(R.ita)}</td><td>${f1(C.ita)}</td></tr>
    </table>
    <table style="margin-top:10px">
      <tr><th>볼 (보여 주는 사진 기준)</th><th>보정 전</th><th>보정 후</th><th>쓴 픽셀</th></tr>
      ${cheekRow(order[0]!, "화면 왼쪽")}
      ${cheekRow(order[1]!, "화면 오른쪽")}
    </table>
    <div class="sub" style="margin-top:10px;line-height:1.7">
      조명 보정(흰 배경 기준): ${wbLine}<br>
      보정 전 → 후 색 차이: ΔE00 ${f2(deltaE2000(R.lab, C.lab))} · ΔE76 ${f2(deltaE(R.lab, C.lab))}<br>
      좌우 볼 차이 (보정 후): ${lr}<br>
      프레임 흔들림: ${spread}
    </div>`;
}


function drawOverlay(): void {
  const src = shownCanvas, shot = shots[shownIdx], fr = frames[shownIdx];
  if (!src || !shot || !fr) { cvOverlay.getContext("2d")!.clearRect(0, 0, cvOverlay.width, cvOverlay.height); return; }
  cvOverlay.width = src.width; cvOverlay.height = src.height;
  const g = cvOverlay.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const k = Math.max(1, src.width / 700);

  for (const [key, color] of [["kept", "rgba(0,200,0,.45)"], ["dropped", "rgba(255,40,40,.5)"]] as const) {
    g.fillStyle = color;
    g.beginPath();
    for (const s of SIDES) {
      const c = fr[s];
      if (!c) continue;
      const xy = c[key];
      for (let i = 0; i < xy.length; i += 2) g.rect(xy[i]!, xy[i + 1]!, c.step, c.step);
    }
    g.fill();
  }

  const path = (pts: readonly Pt[]): void => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.stroke();
  };
  g.lineWidth = 2 * k;
  g.strokeStyle = "#fff";
  for (const s of SIDES) if (fr[s]) path(fr[s]!.poly);

  if (showBg.checked) {
    // 배경 표본을 뽑는 곳 (얼굴 상자 바깥 — 옆 · 이마 위). 흰 벽이 아닌 것(머리카락 · 어깨 · 물건)이 보이면 여기서 확인
    const b = backgroundBounds(shot.lm);
    if (b) {
      const mark = (x: number, y: number, w: number, h: number): void => { g.fillRect(Math.max(0, x), Math.max(0, y), Math.max(0, w), Math.max(0, h)); };
      g.fillStyle = "rgba(77,208,255,.28)";
      mark(0, 0, b.left, src.height); mark(b.right, 0, src.width - b.right, src.height); mark(b.left, 0, b.right - b.left, b.top);
    }
  }
  if (showPts.checked) {
    g.fillStyle = "rgba(255,235,59,.85)";
    for (const p of shot.lm) g.fillRect(p.x - k, p.y - k, 2 * k, 2 * k);
  }

  g.font = `700 ${14 * k}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.lineWidth = 3 * k;
  for (const s of SIDES) {
    const c = fr[s];
    if (!c) continue;
    const cx = c.poly.reduce((a, p) => a + p.x, 0) / c.poly.length, cy = c.poly.reduce((a, p) => a + p.y, 0) / c.poly.length;
    const t = `${Math.round((c.n / c.total) * 100)}%`;
    g.strokeStyle = "rgba(0,0,0,.7)";
    g.strokeText(t, cx, cy);
    g.fillStyle = "#fff";
    g.fillText(t, cx, cy);
  }
}

/** 보정 배수를 사진 전체에 곱해 본 것 (채널별 룩업 — 배수가 채널마다 독립이라) */
function drawCorrected(): void {
  const shot = shots[shownIdx], fr = frames[shownIdx];
  const g = cvCorrected.getContext("2d")!;
  if (!shot || !fr) { g.clearRect(0, 0, cvCorrected.width, cvCorrected.height); return; }
  const tp = readTone();
  const { w, h, data } = shot.im;
  cvCorrected.width = w; cvCorrected.height = h;
  const out = g.createImageData(w, h);
  const gain = tp.wb && fr.gain && tp.strength > 0 ? fr.gain : null;
  const lut = [0, 1, 2].map((k) => {
    const t = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) t[v] = gain ? applyGain([v, v, v], gain, tp.strength, tp.linear)[k]! : v;
    return t;
  });
  for (let i = 0; i < data.length; i += 4) {
    out.data[i] = lut[0]![data[i]!]!; out.data[i + 1] = lut[1]![data[i + 1]!]!; out.data[i + 2] = lut[2]![data[i + 2]!]!; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  corrNote.innerHTML = gain
    ? `보정을 건 사진 (배수 R ${gain[0].toFixed(2)} G ${gain[1].toFixed(2)} B ${gain[2].toFixed(2)}) — 위 ②의 원본과 견주세요.`
    : '<span class="warn">보정이 걸리지 않아 원본과 같은 사진이에요.</span>';
}

function update(): void {
  render();
  drawOverlay();
  drawCorrected();
}

// ---------- 슬라이더 ----------

let raf = 0, pending: "render" | "measure" | null = null;
function schedule(level: "render" | "measure"): void {
  showSliderValues();
  if (level === "measure" || pending === null) pending = level;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const p = pending;
    pending = null;
    if (!shots.length) return;
    if (p === "measure") measureAll();
    update();
  });
}

for (const el of [qLo, qHi, area, aCut]) el.addEventListener("input", () => schedule("measure"));
for (const el of [mergeSel]) el.addEventListener("input", () => schedule("render"));
for (const el of [showPts, showBg]) el.addEventListener("input", () => schedule("render"));
resetBtn.addEventListener("click", () => { resetParams(); schedule("measure"); });

resetParams();
showSliderValues();
previewShot(null);
