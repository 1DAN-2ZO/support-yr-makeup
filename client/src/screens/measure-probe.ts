/**
 * [dev 전용] 얼굴 측정 확인 (measure-probe.html) — 논문 기술 A(face-measure.ts)를 실제 웹캠에서 본다.
 *
 * 가짜 얼굴로 쓴 검증은 "식이 맞는가" 만 보장한다. 이 페이지는 "실제 얼굴에서 값이 논문 범위에
 * 들어오는가" 를 본다. 측정이 현실에서 틀리면 그 위의 개인화가 전부 틀린다.
 *
 * 사진은 어디에도 저장하지 않는다. 복사 버튼은 숫자(중앙값)만 복사한다.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { unitScale } from "@core/baseline";
import { IPD_MM, measureFace, type FaceMeasure } from "@core/face-measure";
import { linerOutline } from "@core/guides";
import { LM, at, dist } from "@core/landmarks";
import { planLiner, type LinerAdapt, type LinerReason, type LinerStyle } from "@core/personalize";
import type { Pt } from "@core/types";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const video = $<HTMLVideoElement>("v");
const cv = $<HTMLCanvasElement>("cv");
const statusEl = $("status");
const rowsEl = $("rows");
const startBtn = $<HTMLButtonElement>("start");
const freezeBtn = $<HTMLButtonElement>("freeze");
const copyBtn = $<HTMLButtonElement>("copy");
const styleSel = $<HTMLSelectElement>("style");
const adaptSel = $<HTMLSelectElement>("adapt");
const ctx2d = cv.getContext("2d");
if (!ctx2d) throw new Error("캔버스 2D 를 쓸 수 없음");
const g: CanvasRenderingContext2D = ctx2d;

/** 최근 몇 프레임의 중앙값을 보여 줄지 — 한 프레임 값은 흔들린다 */
const WINDOW = 15;

type EyeIdx = typeof LM.eyeA | typeof LM.eyeB;

interface Row {
  key: string;
  label: string;
  unit: string;
  digits: number;
  ref: string;
  get: (m: FaceMeasure, lm: readonly Pt[]) => number | null;
  judge?: (v: number) => string;
}

const eyeWidth = (lm: readonly Pt[], eye: EyeIdx): number => dist(at(lm, eye.outer), at(lm, eye.inner));
const eyeHeightMm = (m: FaceMeasure, lm: readonly Pt[], eye: EyeIdx, side: "R" | "L"): number | null =>
  m.mmPerPx == null ? null : m.eye[side].heightRatio * eyeWidth(lm, eye) * m.mmPerPx;
const aspectLabel = (a: number): string => (a > 3 ? "작고 긴 눈" : a < 2.75 ? "크고 둥근 눈" : "보통");
const droopLabel = (v: number): string => (v > 0 ? "처진 눈" : "처진 눈 아님");

const ROWS: Row[] = [
  { key: "roll", label: "고개 기울기", unit: "°", digits: 1, ref: "±5° 안이 좋음. 눈꼬리 기울기는 이만큼 되돌려 잰다", get: (m) => m.rollDeg },
  { key: "tiltR", label: "눈꼬리 기울기 R", unit: "°", digits: 1, ref: "한국 20대 여성 약 8.4~8.8° ± 3° (Jung 2020)", get: (m) => m.eye.R.tiltDeg },
  { key: "tiltL", label: "눈꼬리 기울기 L", unit: "°", digits: 1, ref: "같음", get: (m) => m.eye.L.tiltDeg },
  { key: "abR", label: "α − β  R", unit: "°", digits: 1, ref: "0보다 크면 ILoveEye 기준 처진 눈", get: (m) => m.eye.R.alphaDeg - m.eye.R.betaDeg, judge: droopLabel },
  { key: "abL", label: "α − β  L", unit: "°", digits: 1, ref: "같음", get: (m) => m.eye.L.alphaDeg - m.eye.L.betaDeg, judge: droopLabel },
  { key: "aspectR", label: "눈 가로세로 비 R", unit: "", digits: 2, ref: "2.75~3.00 보통 · 초과 작고 긴 · 미만 크고 둥근 (ILoveEye)", get: (m) => m.eye.R.aspect, judge: aspectLabel },
  { key: "aspectL", label: "눈 가로세로 비 L", unit: "", digits: 2, ref: "같음", get: (m) => m.eye.L.aspect, judge: aspectLabel },
  { key: "hmmR", label: "눈 높이 R", unit: " mm", digits: 1, ref: "외꺼풀 8.0 · 쌍꺼풀 9.9 mm (Jung 2020)", get: (m, lm) => eyeHeightMm(m, lm, LM.eyeA, "R") },
  { key: "hmmL", label: "눈 높이 L", unit: " mm", digits: 1, ref: "같음", get: (m, lm) => eyeHeightMm(m, lm, LM.eyeB, "L") },
  { key: "face", label: "얼굴 가로/세로 비", unit: "", digits: 3, ref: "둥근 0.87 · 계란 0.79 · 각진 0.75 (Zhao 2019). 머리선이 아니라 이마 윗점 기준이라 우리 값이 더 크게 나온다", get: (m) => m.faceAspect },
  { key: "browR", label: "눈썹 굽은 정도 R", unit: "", digits: 3, ref: "0 = 일자, 클수록 굽음 (Zhao 2019 정의)", get: (m) => m.brow.R.curvature },
  { key: "browL", label: "눈썹 굽은 정도 L", unit: "", digits: 3, ref: "같음", get: (m) => m.brow.L.curvature },
  { key: "widthRatio", label: "좌우 눈 폭 비", unit: "", digits: 2, ref: "1에 가까워야 정면. 0.85 미만이면 고개가 옆으로 돌아감", get: (_m, lm) => {
    const r = eyeWidth(lm, LM.eyeA), l = eyeWidth(lm, LM.eyeB);
    return Math.max(r, l) > 0 ? Math.min(r, l) / Math.max(r, l) : null;
  } },
  { key: "ipd", label: "동공 사이", unit: " px", digits: 1, ref: `${IPD_MM} mm로 가정해 mm 환산 (Jung 2020, 사람마다 ±5%)`, get: (m) => (m.mmPerPx == null ? null : IPD_MM / m.mmPerPx) },
];

// ── 표 ──────────────────────────────────────────────
const cells = new Map<string, HTMLTableCellElement>();
for (const r of ROWS) {
  const tr = document.createElement("tr");
  const th = document.createElement("td");
  th.textContent = r.label;
  const v = document.createElement("td");
  v.className = "v";
  v.textContent = "—";
  const ref = document.createElement("td");
  ref.className = "ref";
  ref.textContent = r.ref;
  tr.append(th, v, ref);
  rowsEl.append(tr);
  cells.set(r.key, v);
}

// 라이너 개인화 결과 줄 (논문 기술 B)
const styleRow = document.createElement("tr");
const styleName = document.createElement("td");
styleName.textContent = "라이너 스타일";
const styleCell = document.createElement("td");
styleCell.className = "v";
styleCell.textContent = "—";
const styleRef = document.createElement("td");
styleRef.className = "ref";
styleRef.textContent = "처진 눈(α−β 평균 > 2°)이 아니면 Winged, 처진 눈이면 룩 설정에 따라 Extend / Drop (ILoveEye). 꼬리 15°, 눈 폭의 12%";
styleRow.append(styleName, styleCell, styleRef);
rowsEl.prepend(styleRow);

const REASON: Record<LinerReason, string> = {
  not_down: "처진 눈 아님",
  down_follow: "처진 눈 + 따라감",
  down_correct: "처진 눈 + 보정",
};
const STYLE_NAME: Record<LinerStyle, string> = { winged: "Winged", extend: "Extend", drop: "Drop" };

/** 지금 그릴 스타일. 자동이면 규칙 — 흔들림을 줄이려고 한 프레임이 아니라 중앙값 α−β 로 정한다 */
function currentPlan(m: FaceMeasure): { style: LinerStyle; why: string } {
  if (styleSel.value !== "auto") return { style: styleSel.value as LinerStyle, why: "직접 고름" };
  const abR = shown["abR"], abL = shown["abL"];
  const src: FaceMeasure = abR != null && abL != null
    ? { ...m, eye: { R: { ...m.eye.R, alphaDeg: abR, betaDeg: 0 }, L: { ...m.eye.L, alphaDeg: abL, betaDeg: 0 } } }
    : m;
  const plan = planLiner(src, adaptSel.value as LinerAdapt);
  return { style: plan.style, why: REASON[plan.reason] };
}

const history: Record<string, number>[] = [];
let shown: Record<string, number | null> = {};
let frozen = false;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

function record(m: FaceMeasure, lm: readonly Pt[]): void {
  const sample: Record<string, number> = {};
  for (const r of ROWS) {
    const v = r.get(m, lm);
    if (v != null && Number.isFinite(v)) sample[r.key] = v;
  }
  history.push(sample);
  if (history.length > WINDOW) history.shift();
}

function render(): void {
  if (frozen) return;
  const next: Record<string, number | null> = {};
  for (const r of ROWS) {
    const xs = history.map((s) => s[r.key]).filter((v): v is number => v != null);
    const v = xs.length ? median(xs) : null;
    next[r.key] = v;
    const cell = cells.get(r.key);
    if (!cell) continue;
    cell.textContent = v == null ? "—" : `${v.toFixed(r.digits)}${r.unit}${r.judge ? `  (${r.judge(v)})` : ""}`;
  }
  shown = next;
}

// ── 겹쳐 그리기 ─────────────────────────────────────
function line(pts: readonly Pt[], color: string, width = 2, dash: number[] = []): void {
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

function dot(p: Pt, color: string, r = 3): void {
  g.fillStyle = color;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
}

function drawOverlay(lm: readonly Pt[], style: LinerStyle): void {
  const P = (i: number): Pt => at(lm, i);
  const lw = Math.max(1.5, cv.width / 640);
  // 라이너: 개인화 윤곽(주황)과 기존 꼬리(회색 점선). 윤곽 = [속눈썹 선 9점(안쪽→바깥), 꼬리 끝, 위 테두리]
  const frame = { lm, unit: unitScale(lm) };
  const personal = linerOutline(frame, 0.045, style);
  const base = linerOutline(frame, 0.045);
  const tipAt = LM.eyeA.upper.length;
  for (const side of ["R", "L"] as const) {
    const poly = personal[side];
    line([...poly, poly[0]!], "#fb923c", lw * 1.5);
    line([base[side][tipAt - 1]!, base[side][tipAt]!], "#6b7280", lw, [5, 4]);
  }
  // 얼굴 폭·높이
  line([P(LM.faceL), P(LM.faceR)], "#9ca3af", lw, [6, 6]);
  line([P(LM.forehead), P(LM.chin)], "#9ca3af", lw, [6, 6]);
  // 눈동자 선 = 얼굴 수평
  line([P(LM.eyeA.iris[0]), P(LM.eyeB.iris[0])], "#ffffff", lw);
  for (const eye of [LM.eyeA, LM.eyeB]) {
    line(eye.upper.map(P), "#facc15", lw);
    line(eye.lower.map(P), "#4ade80", lw);
    line([P(eye.outer), P(eye.inner)], "#22d3ee", lw);
    dot(P(eye.outer), "#22d3ee", lw * 2);
  }
  for (const brow of [LM.browA, LM.browB]) {
    const mid = brow.upper.map((k, n) => {
      const u = P(k), l = P(brow.lower[n]!);
      return { x: (u.x + l.x) / 2, y: (u.y + l.y) / 2 };
    });
    line(mid, "#e879f9", lw);
    line([mid[0]!, mid[mid.length - 1]!], "#e879f9", lw / 1.5, [4, 4]);
  }
}

// ── 상태 줄 ─────────────────────────────────────────
let frames = 0;
let fps = 0;
let fpsT0 = performance.now();

function setStatus(found: boolean): void {
  const warns: string[] = [];
  const roll = shown["roll"];
  const wr = shown["widthRatio"];
  if (roll != null && Math.abs(roll) > 5) warns.push("고개가 기울어져 있어요");
  if (wr != null && wr < 0.85) warns.push("고개가 옆으로 돌아가 있어요 — 정면을 봐 주세요");
  if (!found) warns.push("얼굴을 찾지 못했어요");
  statusEl.innerHTML = `${fps} fps · ${frozen ? "<b>값 고정됨</b>" : `최근 ${history.length}프레임`}` +
    (warns.length ? ` · <span class="warn">${warns.join(" · ")}</span>` : "");
}

// ── 루프 ────────────────────────────────────────────
let landmarker: FaceLandmarker | null = null;

function tick(): void {
  if (!landmarker || video.readyState < 2) {
    requestAnimationFrame(tick);
    return;
  }
  const w = video.videoWidth, h = video.videoHeight;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  g.drawImage(video, 0, 0, w, h);
  const res = landmarker.detectForVideo(video, performance.now());
  const face = res.faceLandmarks[0];
  let found = false;
  if (face && face.length >= 478) {
    found = true;
    const lm: Pt[] = face.map((p) => ({ x: p.x * w, y: p.y * h }));
    const m = measureFace(lm);
    if (!frozen) record(m, lm);
    render();
    const plan = currentPlan(m);
    drawOverlay(lm, plan.style);
    if (!frozen) styleCell.textContent = `${STYLE_NAME[plan.style]}  (${plan.why})`;
  }
  frames++;
  const now = performance.now();
  if (now - fpsT0 >= 1000) {
    fps = Math.round((frames * 1000) / (now - fpsT0));
    frames = 0;
    fpsT0 = now;
  }
  setStatus(found);
  requestAnimationFrame(tick);
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  statusEl.textContent = "모델을 불러오는 중…";
  try {
    const files = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
    // 모델: 로컬 사본(client/public/models/)이 있으면 그것, 없으면 MediaPipe 공식 CDN — capture-probe 와 같은 방식
    const LOCAL_MODEL = "/models/face_landmarker.task";
    const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    const modelPath = await fetch(LOCAL_MODEL, { method: "HEAD" })
      .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? LOCAL_MODEL : CDN_MODEL))
      .catch(() => CDN_MODEL);
    const opts = (delegate: "GPU" | "CPU") => ({
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: "VIDEO" as const,
      numFaces: 1,
    });
    landmarker = await FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
    statusEl.textContent = "카메라를 여는 중…";
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    freezeBtn.disabled = false;
    copyBtn.disabled = false;
    requestAnimationFrame(tick);
  } catch (e) {
    startBtn.disabled = false;
    statusEl.innerHTML = `<span class="warn">시작하지 못했어요: ${e instanceof Error ? e.message : String(e)}</span>`;
  }
}

startBtn.addEventListener("click", () => void start());

freezeBtn.addEventListener("click", () => {
  frozen = !frozen;
  freezeBtn.textContent = frozen ? "고정 풀기" : "값 고정";
});

copyBtn.addEventListener("click", () => {
  const values: Record<string, number | null> = {};
  for (const r of ROWS) {
    const v = shown[r.key];
    values[r.label] = v == null ? null : Number(v.toFixed(r.digits + 1));
  }
  const text = JSON.stringify({ 시각: new Date().toISOString(), 프레임수: history.length, 라이너: styleCell.textContent, 룩설정: adaptSel.value, 값: values }, null, 2);
  navigator.clipboard.writeText(text).then(
    () => { statusEl.textContent = "값을 복사했어요. 대화창에 붙여 넣어 주세요."; },
    () => { window.prompt("아래 값을 복사해 주세요", text); },
  );
});
