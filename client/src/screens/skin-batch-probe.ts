/**
 * [dev 전용 스파이크] 피부색 일괄 측정 + 웜/쿨 기준 T 찾기 (skin-batch-probe.html, 2026-10-09)
 *  ① Deep Armocromia 폴더(경로가 곧 라벨: <원본 폴더>/<train|test>/<계절>/<유형>/<번호>.png)의 사진마다
 *     얼굴 점 → 볼 영역 색(core/skin-measure measureFrame) → 보정 전 RGB 중앙값 · 흰자 보정 배수만 남긴다 (픽셀은 안 들고 있음)
 *  ② 라벨 방식 · 흰자 보정 · 합치기를 바꾸면 숫자만 다시 계산 (toneFromCheeks)
 *  ③ 축(h° · b* · a* · C* · 논문식 D · 대조군 L*)별 AUC, train 에서 찾은 T 와 test 정확도 (core/skin-threshold)
 *  ④ T · 방향 · 애매 폭을 직접 바꿔 보며 분포와 정확도를 본다. 설정 JSON 을 복사해 간다
 * 사진은 이 컴퓨터 안에서만 읽는다. 측정 CSV 에는 사진 경로 번호와 색 숫자만 있다.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Lab } from "@core/color";
import { csvCell, csvSplit } from "@core/csv-lite";
import type { Rgb } from "@core/skin-color";
import { BG_LIMITS, backgroundGain, isWhiteBackground, sampleBackground } from "@core/skin-bg-wb";
import type { BgSample } from "@core/skin-bg-wb";
import { rgbToLab } from "@core/color";
import { ROI_DEFAULT, TONE_DEFAULT, measureFrame, toneFromCheeks } from "@core/skin-measure";
import type { Merge, RoiParams, ToneParams } from "@core/skin-measure";
import { AXES, auc, evaluate, fitThreshold } from "@core/skin-threshold";
import type { AxisId, Evaluation, Fit, Item } from "@core/skin-threshold";
import { createLandmarker } from "./landmarker";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};

const SEASONS = ["primavera", "estate", "autunno", "inverno"] as const;
type Season = (typeof SEASONS)[number];
/** 계절 → 웜 (봄 · 가을). 계절 이름이 곧 웜/쿨 정답은 아니고 관례적 묶음이다 */
const SEASON_WARM: Record<Season, boolean> = { primavera: true, autunno: true, estate: false, inverno: false };
const MAX_SIDE = 1024;

interface Rec {
  id: string;           // train/autunno/deep/10306
  partition: "train" | "test";
  season: Season;
  sub: string;
  celeba: boolean | null;
  R: Rgb | null;
  L: Rgb | null;
  gain: Rgb | null;
  /** 얼굴 둘레 배경 색 (core/skin-bg-wb). 옛 측정 CSV 에는 없다 */
  bg: BgSample | null;
  nR: number;
  nL: number;
}

const dirIn = $<HTMLInputElement>("dir"), annotIn = $<HTMLInputElement>("annot"), loadCsvIn = $<HTMLInputElement>("loadCsv");
const maxPer = $<HTMLInputElement>("maxPer");
const qLo = $<HTMLInputElement>("qLo"), qHi = $<HTMLInputElement>("qHi"), area = $<HTMLInputElement>("area"), aCut = $<HTMLInputElement>("aCut");
const startBtn = $<HTMLButtonElement>("start"), stopBtn = $<HTMLButtonElement>("stop"), exportBtn = $<HTMLButtonElement>("export");
const prog = $<HTMLProgressElement>("prog"), runMsg = $("runMsg"), countsEl = $("counts");
const scheme = $<HTMLSelectElement>("scheme"), origin = $<HTMLSelectElement>("origin");
const wbOn = $<HTMLInputElement>("wbOn"), wbLin = $<HTMLInputElement>("wbLin"), wbDrop = $<HTMLInputElement>("wbDrop");
const wbStr = $<HTMLInputElement>("wbStr"), mergeSel = $<HTMLSelectElement>("merge");
const wbSrc = $<HTMLSelectElement>("wbSrc"), bgOnly = $<HTMLInputElement>("bgOnly");
const axesEl = $("axes"), axisSel = $<HTMLSelectElement>("axis");
const tIn = $<HTMLInputElement>("T"), dir2 = $<HTMLSelectElement>("dir2"), marginIn = $<HTMLInputElement>("margin"), autoBtn = $<HTMLButtonElement>("auto");
const hist = $<HTMLCanvasElement>("hist"), evalOut = $("evalOut"), jsonOut = $("json"), copyBtn = $<HTMLButtonElement>("copy");

// ---------- 상태 ----------

interface Entry { file: File; partition: "train" | "test"; season: Season; sub: string; stem: string; key: string }
let entries: Entry[] = [];
let celebaMap = new Map<string, boolean>();
let recs: Rec[] = [];
let runRoi: RoiParams | null = null;
let stopFlag = false, running = false;
let landmarker: Promise<FaceLandmarker> | null = null;
let selAxis: AxisId = "h";
let tAuto = true;

const pct = (el: HTMLInputElement): number => Number(el.value) / 100;
const readRoi = (): RoiParams => ({ qLo: pct(qLo), qHi: pct(qHi), area: pct(area), aCut: pct(aCut) });
const readTone = (): ToneParams => ({ wb: wbOn.checked, strength: pct(wbStr), linear: wbLin.checked, merge: mergeSel.value as Merge });
const showSliders = (): void => { for (const el of [qLo, qHi, area, aCut, wbStr]) $(`${el.id}V`).textContent = `${el.value}%`; };
const f2 = (v: number): string => v.toFixed(2);
const pc = (v: number | null): string => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

// ---------- 폴더 → 항목 ----------

const PATH_RE = /(?:^|\/)(ORIGINAL_RGB_NOT_PROCESSED|RGB)\/(train|test)\/(primavera|estate|autunno|inverno)\/([^/]+)\/([^/]+)\.(?:png|jpe?g)$/i;

function parseEntries(files: readonly File[]): Entry[] {
  const all: (Entry & { root: string })[] = [];
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const m = PATH_RE.exec(rel.replace(/\\/g, "/"));
    if (!m) continue;
    const partition = m[2]!.toLowerCase() as "train" | "test", season = m[3]!.toLowerCase() as Season, sub = m[4]!.toLowerCase(), stem = m[5]!;
    all.push({ file, partition, season, sub, stem, key: `${partition}/${season}/${sub}/${stem}`, root: m[1]!.toUpperCase() });
  }
  // 원본(처리 안 한) 폴더가 있으면 그것만 — RGB 와 같은 사진이 두 번 세어지지 않게
  const useOriginal = all.some((e) => e.root === "ORIGINAL_RGB_NOT_PROCESSED");
  return all.filter((e) => (e.root === "ORIGINAL_RGB_NOT_PROCESSED") === useOriginal);
}

/** 같은 입력이면 같은 순서 (재현용) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickEntries(all: Entry[], perGroup: number): Entry[] {
  if (perGroup <= 0) return [...all].sort((p, q) => (p.key < q.key ? -1 : 1));
  const rnd = mulberry32(20241009);
  const groups = new Map<string, Entry[]>();
  for (const e of [...all].sort((p, q) => (p.key < q.key ? -1 : 1))) {
    const g = `${e.partition}|${e.season}|${e.sub}`;
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(e);
  }
  const out: Entry[] = [];
  for (const list of groups.values()) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j]!, list[i]!]; }
    const cap = list[0]!.partition === "train" ? perGroup : Math.max(1, Math.ceil(perGroup / 4));
    out.push(...list.slice(0, cap));
  }
  return out;
}

dirIn.addEventListener("change", () => {
  entries = parseEntries([...(dirIn.files ?? [])]);
  const by = (p: string): number => entries.filter((e) => e.partition === p).length;
  runMsg.textContent = entries.length ? `사진 ${entries.length}장 찾음 (train ${by("train")} · test ${by("test")})` : "경로가 <train|test>/<계절>/<유형>/<파일> 꼴인 사진을 못 찾았어요.";
  startBtn.disabled = !entries.length || running;
});

annotIn.addEventListener("change", async () => {
  const f = annotIn.files?.[0];
  if (!f) return;
  const lines = (await f.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = csvSplit(lines[0]!);
  const ci = head.indexOf("celeba"), pi = head.indexOf("path_rgb_original");
  celebaMap = new Map();
  if (ci < 0 || pi < 0) { runMsg.textContent = "annotations.csv 에 celeba · path_rgb_original 열이 없어요."; return; }
  for (const ln of lines.slice(1)) {
    const c = csvSplit(ln);
    const m = /^RGB\/(train|test)\/([^/]+)\/([^/]+)\/([^/.]+)\./.exec((c[pi] ?? "").replace(/\\/g, "/"));
    if (m) celebaMap.set(`${m[1]}/${m[2]}/${m[3]}/${m[4]}`, c[ci]!.trim().toLowerCase() === "true");
  }
  for (const r of recs) if (r.celeba === null) r.celeba = celebaMap.get(r.id) ?? null;
  runMsg.textContent = `annotations.csv: ${celebaMap.size}행`;
  refresh();
});

// ---------- 측정 ----------

async function measureOne(e: Entry, lmk: FaceLandmarker, roi: RoiParams): Promise<Rec | "noface" | "nocheek"> {
  const bmp = await createImageBitmap(e.file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const face = lmk.detect(c).faceLandmarks[0];
  if (!face || face.length < 478) return "noface";
  const id = g.getImageData(0, 0, w, h);
  const im = { data: id.data, w, h }, lm = face.map((p) => ({ x: p.x * w, y: p.y * h }));
  const fr = measureFrame(im, lm, roi);
  if (!fr.R && !fr.L) return "nocheek";
  return {
    id: e.key, partition: e.partition, season: e.season, sub: e.sub, celeba: celebaMap.get(e.key) ?? null,
    R: fr.R?.rgb ?? null, L: fr.L?.rgb ?? null, gain: fr.gain, bg: sampleBackground(im, lm), nR: fr.R?.n ?? 0, nL: fr.L?.n ?? 0,
  };
}

startBtn.addEventListener("click", async () => {
  const chosen = pickEntries(entries, Math.max(0, Math.floor(Number(maxPer.value) || 0)));
  if (!chosen.length) return;
  running = true; stopFlag = false;
  startBtn.disabled = true; stopBtn.disabled = false; exportBtn.disabled = true;
  recs = []; runRoi = readRoi();
  const fail = { noface: 0, nocheek: 0, error: 0 };
  const t0 = performance.now();
  try {
    runMsg.textContent = "얼굴 모델을 여는 중…";
    const lmk = await (landmarker ??= createLandmarker("IMAGE", { blendshapes: false }));
    prog.max = chosen.length;
    for (let i = 0; i < chosen.length; i++) {
      if (stopFlag) break;
      try {
        const r = await measureOne(chosen[i]!, lmk, runRoi);
        if (r === "noface") fail.noface++; else if (r === "nocheek") fail.nocheek++; else recs.push(r);
      } catch { fail.error++; }
      prog.value = i + 1;
      if ((i + 1) % 5 === 0 || i + 1 === chosen.length) {
        const sec = (performance.now() - t0) / 1000, left = (sec / (i + 1)) * (chosen.length - i - 1);
        runMsg.textContent = `${i + 1}/${chosen.length} · 측정 ${recs.length}장 · 얼굴 못 찾음 ${fail.noface} · 볼 못 잼 ${fail.nocheek} · 읽기 오류 ${fail.error} · 남은 시간 약 ${Math.ceil(left / 60)}분`;
      }
      if ((i + 1) % 100 === 0) refresh();
    }
  } catch (err) {
    runMsg.innerHTML = `<span class="warn">${err instanceof Error ? err.message : String(err)}</span>`;
  } finally {
    running = false; stopBtn.disabled = true; startBtn.disabled = !entries.length; exportBtn.disabled = !recs.length;
    runMsg.textContent += `${stopFlag ? " — 중지함" : " — 끝"} (${Math.round((performance.now() - t0) / 1000)}초)`;
    refresh();
  }
});
stopBtn.addEventListener("click", () => { stopFlag = true; });

// ---------- 측정 CSV ----------

const COLS = ["id", "partition", "season", "sub", "celeba", "rR", "rG", "rB", "lR", "lG", "lB", "gR", "gG", "gB", "nR", "nL"];
/** 배경 색 열 — 나중에 늘어난 열이라 불러올 때는 없어도 된다 */
const BG_COLS = ["bR", "bG", "bB", "bN"];
const cell = (v: number | null): string => (v === null ? "" : String(Math.round(v * 100) / 100));

function toCsv(): string {
  const tp = readTone();
  const lines = [[...COLS, ...BG_COLS, "L", "a", "b", "h", "C", "D"].join(",")];
  for (const r of recs) {
    const t = toneOf(r, tp);
    const lab = t?.lab;
    const derived = lab ? [lab.L, lab.a, lab.b, AXES.h.of(lab), AXES.C.of(lab), AXES.D.of(lab)].map((v) => cell(v)) : ["", "", "", "", "", ""];
    lines.push([
      csvCell(r.id), r.partition, r.season, r.sub, r.celeba === null ? "" : String(r.celeba),
      ...(r.R ?? [null, null, null]).map(cell), ...(r.L ?? [null, null, null]).map(cell), ...(r.gain ?? [null, null, null]).map((v) => (v === null ? "" : String(Math.round(v * 1000) / 1000))),
      r.nR, r.nL, ...(r.bg?.rgb ?? [null, null, null]).map(cell), r.bg?.n ?? "", ...derived,
    ].join(","));
  }
  return lines.join("\n");
}

exportBtn.addEventListener("click", () => {
  const d = new Date(), p = (n: number): string => String(n).padStart(2, "0");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + toCsv()], { type: "text/csv" }));
  a.download = `skin-batch-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

loadCsvIn.addEventListener("change", async () => {
  const f = loadCsvIn.files?.[0];
  if (!f) return;
  const lines = (await f.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = csvSplit(lines[0]!);
  const ix = (n: string): number => head.indexOf(n);
  if (COLS.some((c) => ix(c) < 0)) { runMsg.textContent = "측정 CSV 열이 달라요 (이 페이지에서 내보낸 파일만 불러와요)."; return; }
  const num = (c: string[], n: string): number | null => { const s = c[ix(n)]; return s === undefined || s === "" ? null : Number(s); };
  const rgb = (c: string[], a: string, b: string, d: string): Rgb | null => {
    const v = [num(c, a), num(c, b), num(c, d)];
    return v.every((x) => x !== null) ? (v as Rgb) : null;
  };
  recs = [];
  for (const ln of lines.slice(1)) {
    const c = csvSplit(ln);
    const season = c[ix("season")] as Season;
    if (!SEASONS.includes(season)) continue;
    const cel = c[ix("celeba")];
    recs.push({
      id: c[ix("id")]!, partition: c[ix("partition")] === "test" ? "test" : "train", season, sub: c[ix("sub")]!,
      celeba: cel === "true" ? true : cel === "false" ? false : null,
      R: rgb(c, "rR", "rG", "rB"), L: rgb(c, "lR", "lG", "lB"), gain: rgb(c, "gR", "gG", "gB"), bg: bgOf(rgb(c, "bR", "bG", "bB"), num(c, "bN")), nR: num(c, "nR") ?? 0, nL: num(c, "nL") ?? 0,
    });
  }
  runRoi = null;
  exportBtn.disabled = !recs.length;
  runMsg.textContent = `측정 CSV ${recs.length}장 불러옴 (볼 영역 설정은 파일에 없어서 JSON 에 기록되지 않아요)`;
  refresh();
});

// ---------- 분석 ----------

/** 보정 배수 — 흰자 기준이면 측정 때 구한 것, 배경 기준이면 배경 색에서 */
const gainOf = (r: Rec): Rgb | null => (wbSrc.value === "bg" ? backgroundGain(r.bg) : r.gain);
const toneOf = (r: Rec, tp: ToneParams): ReturnType<typeof toneFromCheeks> => toneFromCheeks({ R: r.R, L: r.L }, gainOf(r), tp);

/** 측정 CSV 의 배경 색 열 → BgSample (L* · C* 는 색에서 다시 계산) */
function bgOf(rgb: Rgb | null, n: number | null): BgSample | null {
  if (!rgb) return null;
  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { rgb, n: n ?? 0, L: lab.L, chroma: Math.hypot(lab.a, lab.b) };
}

function labelOf(r: Rec): boolean | null {
  if (scheme.value === "season") return SEASON_WARM[r.season];
  return r.sub === "warm" ? true : r.sub === "cool" ? false : null;
}

interface Row { rec: Rec; lab: Lab; warm: boolean }
interface Selection { rows: Row[]; skipped: { noLabel: number; origin: number; wb: number; noCheek: number; notWhite: number } }

function select(): Selection {
  const tp = readTone();
  const skipped = { noLabel: 0, origin: 0, wb: 0, noCheek: 0, notWhite: 0 };
  const rows: Row[] = [];
  for (const rec of recs) {
    const warm = labelOf(rec);
    if (warm === null) { skipped.noLabel++; continue; }
    if (origin.value === "web" && rec.celeba !== false) { skipped.origin++; continue; }
    if (origin.value === "celeba" && rec.celeba !== true) { skipped.origin++; continue; }
    // 보정을 꺼도 같은 사진만 남긴다 — 켬/끔을 같은 사진끼리 견주려고
    if (bgOnly.checked && !isWhiteBackground(rec.bg)) { skipped.notWhite++; continue; }
    if (wbDrop.checked && gainOf(rec) === null) { skipped.wb++; continue; }
    const t = toneOf(rec, tp);
    if (!t) { skipped.noCheek++; continue; }
    rows.push({ rec, lab: t.lab, warm });
  }
  return { rows, skipped };
}

const itemsOf = (rows: readonly Row[], axis: AxisId, part?: "train" | "test"): Item[] =>
  rows.filter((r) => !part || r.rec.partition === part).map((r) => ({ v: AXES[axis].of(r.lab), warm: r.warm }));
const split = (items: readonly Item[]): string => `<span class="w">웜 ${items.filter((i) => i.warm).length}</span> / <span class="c">쿨 ${items.filter((i) => !i.warm).length}</span>`;

/** 배경이 흰 사진이 얼마나 되는지 — 흰 배경 사진만 남기기 전에 얼마나 남는지 보려고 */
function bgSummary(): string {
  const have = recs.filter((r) => r.bg);
  if (!have.length) return "배경 색: 이 측정에는 없어요 (다시 측정하세요)";
  const white = have.filter((r) => isWhiteBackground(r.bg)).length;
  const Ls = have.map((r) => r.bg!.L).sort((p, q) => p - q), Cs = have.map((r) => r.bg!.chroma).sort((p, q) => p - q);
  const q = (v: number[], p: number): string => v[Math.min(v.length - 1, Math.floor(v.length * p))]!.toFixed(0);
  return `배경 색: ${have.length}장 중 흰 배경(L* ≥ ${BG_LIMITS.minL} · C* ≤ ${BG_LIMITS.maxChroma}) ${white}장 (${((white / have.length) * 100).toFixed(1)}%) · 배경 L* 중앙 ${q(Ls, 0.5)} (하위10% ${q(Ls, 0.1)}) · C* 중앙 ${q(Cs, 0.5)} (상위10% ${q(Cs, 0.9)})`;
}

function refresh(): void {
  if (!recs.length) { countsEl.textContent = ""; axesEl.textContent = "측정한 사진이 아직 없어요."; evalOut.textContent = ""; jsonOut.textContent = ""; drawHist([], 0, 1, 0); return; }
  const { rows, skipped } = select();
  const tr = itemsOf(rows, "h", "train"), te = itemsOf(rows, "h", "test");
  countsEl.innerHTML = `쓰는 사진 ${rows.length}장 — train ${split(tr)} · test ${split(te)}<br>빠진 사진: 라벨 없음 ${skipped.noLabel} · 출처 필터 ${skipped.origin} · 보정 안 됨 ${skipped.wb} · 흰 배경 아님 ${skipped.notWhite} · 볼 못 잼 ${skipped.noCheek}<br>${bgSummary()}`;

  // 축별 표
  let html = "<table><tr><th>축</th><th>분리도</th><th>방향</th><th>train 최적 T</th><th>train 균형정확도</th><th>test 균형정확도</th></tr>";
  const fits = {} as Record<AxisId, Fit | null>;
  for (const id of Object.keys(AXES) as AxisId[]) {
    const all = itemsOf(rows, id), train = itemsOf(rows, id, "train"), test = itemsOf(rows, id, "test");
    const a = auc(all), fit = fitThreshold(train);
    fits[id] = fit;
    const sep = a === null ? null : Math.max(a, 1 - a);
    const ev = fit && test.length ? evaluate(test, fit.threshold, fit.dir, 0) : null;
    html += `<tr class="${id === selAxis ? "sel" : ""}${id === "L" ? " ctrl" : ""}" data-axis="${id}" style="cursor:pointer"><td>${AXES[id].label}</td><td>${sep === null ? "—" : f2(sep)}</td>` +
      `<td>${fit ? (fit.dir === 1 ? "클수록 웜" : "작을수록 웜") : "—"}</td><td>${fit ? f2(fit.threshold) : "—"}</td><td>${fit ? pc(fit.balAcc) : "—"}</td><td>${pc(ev?.balAcc ?? null)}</td></tr>`;
  }
  axesEl.innerHTML = html + "</table>";

  // T 자동값
  const fit = fits[selAxis];
  if (tAuto && fit) { tIn.value = f2(fit.threshold); dir2.value = String(fit.dir); }
  renderEval(rows);
}

axesEl.addEventListener("click", (e) => {
  const tr = (e.target as HTMLElement).closest("tr[data-axis]") as HTMLElement | null;
  if (!tr) return;
  selAxis = tr.dataset["axis"] as AxisId;
  axisSel.value = selAxis;
  tAuto = true;
  refresh();
});
axisSel.innerHTML = (Object.keys(AXES) as AxisId[]).map((id) => `<option value="${id}">${AXES[id].label}</option>`).join("");
axisSel.value = selAxis;
axisSel.addEventListener("change", () => { selAxis = axisSel.value as AxisId; tAuto = true; refresh(); });

function evalRow(name: string, ev: Evaluation, items: readonly Item[]): string {
  return `<tr><td>${name}</td><td>${split(items)}</td><td><b>${pc(ev.balAcc)}</b></td><td>${pc(ev.tpr)}</td><td>${pc(ev.tnr)}</td>` +
    `<td>${pc(ev.coverage)} (애매 웜 ${ev.ambiguousWarm} · 쿨 ${ev.ambiguousCool})</td><td>웜→웜 ${ev.tp} · 웜→쿨 ${ev.fn} · 쿨→쿨 ${ev.tn} · 쿨→웜 ${ev.fp}</td></tr>`;
}

function renderEval(rowsIn?: Row[]): void {
  const rows = rowsIn ?? select().rows;
  const T = Number(tIn.value), dir = Number(dir2.value) === -1 ? -1 : 1, margin = Math.max(0, Number(marginIn.value) || 0);
  const train = itemsOf(rows, selAxis, "train"), test = itemsOf(rows, selAxis, "test");
  if (!Number.isFinite(T) || !rows.length) { evalOut.textContent = ""; return; }
  evalOut.innerHTML = `<table><tr><th></th><th>사진</th><th>균형 정확도</th><th>웜을 웜으로</th><th>쿨을 쿨로</th><th>판정한 비율</th><th>혼동 (애매 제외)</th></tr>` +
    evalRow("train", evaluate(train, T, dir, margin), train) + evalRow("test", evaluate(test, T, dir, margin), test) + "</table>";
  const ax = AXES[selAxis];
  const testEv = evaluate(test, T, dir, margin);
  jsonOut.textContent = JSON.stringify({
    axis: selAxis, axisLabel: ax.label, threshold: Math.round(T * 100) / 100, warmIf: dir === 1 ? "greater" : "less", margin,
    labels: scheme.value, origin: origin.value, roi: runRoi, tone: readTone(),
    testBalancedAccuracy: testEv.balAcc === null ? null : Math.round(testEv.balAcc * 1000) / 1000, testCoverage: Math.round(testEv.coverage * 1000) / 1000,
    trainN: train.length, testN: test.length, data: "Deep Armocromia (ECCVW 2024)",
  }, null, 2);
  drawHist([...train, ...test], T, dir, margin);
}

// ---------- 히스토그램 ----------

function drawHist(items: readonly Item[], T: number, dir: number, margin: number): void {
  const g = hist.getContext("2d")!;
  const W = hist.width, H = hist.height, padL = 36, padB = 24, padT = 8;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  g.clearRect(0, 0, W, H);
  g.fillStyle = dark ? "#ddd" : "#222";
  g.font = "12px system-ui, sans-serif";
  if (!items.length) { g.fillText("측정한 사진이 없어요", padL, H / 2); return; }
  const vs = items.map((i) => i.v).sort((p, q) => p - q);
  const lo = vs[Math.floor(vs.length * 0.01)]!, hi = vs[Math.min(vs.length - 1, Math.floor(vs.length * 0.99))]!;
  const span = hi - lo || 1, BINS = 48;
  const count = (warm: boolean): number[] => {
    const c = new Array<number>(BINS).fill(0);
    const sub = items.filter((i) => i.warm === warm);
    for (const it of sub) c[Math.max(0, Math.min(BINS - 1, Math.floor(((it.v - lo) / span) * BINS)))]!++;
    return c.map((n) => (sub.length ? n / sub.length : 0));
  };
  const cw = count(true), cc = count(false), mx = Math.max(...cw, ...cc, 1e-9);
  const x = (v: number): number => padL + ((v - lo) / span) * (W - padL - 8);
  const y = (d: number): number => H - padB - (d / mx) * (H - padB - padT);
  const bw = (W - padL - 8) / BINS;
  const bars = (c: number[], color: string): void => { g.fillStyle = color; c.forEach((d, i) => g.fillRect(padL + i * bw, y(d), bw - 1, H - padB - y(d))); };
  bars(cw, "rgba(232,89,12,.55)");
  bars(cc, "rgba(28,126,214,.55)");
  g.strokeStyle = dark ? "#888" : "#999";
  g.beginPath(); g.moveTo(padL, H - padB); g.lineTo(W - 8, H - padB); g.stroke();
  g.fillStyle = dark ? "#ddd" : "#222";
  for (let k = 0; k <= 5; k++) { const v = lo + (span * k) / 5; g.fillText(v.toFixed(1), x(v) - 10, H - 8); }
  if (Number.isFinite(T)) {
    g.fillStyle = "rgba(250,176,5,.22)";
    g.fillRect(x(T - margin), padT, Math.max(1, x(T + margin) - x(T - margin)), H - padB - padT);
    g.strokeStyle = "#f59f00"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x(T), padT); g.lineTo(x(T), H - padB); g.stroke(); g.lineWidth = 1;
    g.fillStyle = "#f59f00";
    g.fillText(`T ${T.toFixed(2)} (${dir === 1 ? "→ 웜" : "← 웜"})`, Math.min(x(T) + 6, W - 120), padT + 12);
  }
  g.fillStyle = "rgb(232,89,12)"; g.fillText("■ 웜", W - 100, padT + 12);
  g.fillStyle = "rgb(28,126,214)"; g.fillText("■ 쿨", W - 50, padT + 12);
}

// ---------- 연결 ----------

for (const el of [qLo, qHi, area, aCut]) el.addEventListener("input", showSliders);
for (const el of [scheme, origin, wbOn, wbLin, wbDrop, wbStr, mergeSel, wbSrc, bgOnly]) el.addEventListener("input", () => { showSliders(); tAuto = true; refresh(); });
for (const el of [tIn, dir2]) el.addEventListener("input", () => { tAuto = false; renderEval(); });
marginIn.addEventListener("input", () => renderEval());
autoBtn.addEventListener("click", () => { tAuto = true; refresh(); });
copyBtn.addEventListener("click", () => { void navigator.clipboard?.writeText(jsonOut.textContent ?? ""); });

qLo.value = String(ROI_DEFAULT.qLo * 100); qHi.value = String(ROI_DEFAULT.qHi * 100);
area.value = String(ROI_DEFAULT.area * 100); aCut.value = String(ROI_DEFAULT.aCut * 100);
wbOn.checked = TONE_DEFAULT.wb; wbStr.value = String(TONE_DEFAULT.strength * 100);
showSliders();
refresh();
