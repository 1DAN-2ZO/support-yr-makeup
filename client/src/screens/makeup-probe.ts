/**
 * [dev 전용] 화장 얹어 보기 (makeup-probe.html) — 룩 템플릿의 색을 웹캠 얼굴 자리에 얹는다.
 *
 * 2-b(완성 예상)의 생성형 합성이 아니다. 자리(기하)와 색이 얼굴에 어떻게 앉는지 눈으로 보는 용도다.
 * 자리는 guides.ts 와 같은 계산을 쓴다 — 섀도 범위·볼 타원·라이너 윤곽(개인화 꼬리).
 * 사진은 어디에도 저장하지 않는다.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { unitScale } from "@core/baseline";
import { measureFace } from "@core/face-measure";
import { contourOutline } from "@core/contour";
import { faceAxis } from "@core/face-measure";
import { GUIDE_PARAMS, browStandard, linerOutline, lipOutline, planGuide } from "@core/guides";
import { guideOutline } from "@core/overlay";
import type { SampleFrame } from "@core/sampling";
import { LM, at, dist } from "@core/landmarks";
import { LOOKS } from "@core/looks";
import { PLAN_RULES, droopDeg, planLiner, resolvePlan, type LinerStyle, type PersonalPlan } from "@core/personalize";
import type { Pt } from "@core/types";
import { buildVlmPrompt } from "@core/vlm-prompt";
import { MakeupGl } from "./makeup-gl";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el as T;
};
const video = $<HTMLVideoElement>("v");
const cv = $<HTMLCanvasElement>("cv");
const statusEl = $("status");
const startBtn = $<HTMLButtonElement>("start");
const bareBtn = $<HTMLButtonElement>("bare");
const lookSel = $<HTMLSelectElement>("look");
const partsEl = $("parts");
const browShapeSel = $<HTMLSelectElement>("browShape");
const linesChk = $<HTMLInputElement>("lines");
const vlmBox = $<HTMLTextAreaElement>("vlm");
const planEl = $("plan");

/** 붙여 넣은 VLM 제안(JSON). 없으면 규칙만. 매 프레임 지금 측정값으로 관문을 다시 지난다 */
let proposal: unknown = undefined;
let plan: PersonalPlan | null = null;
let planShown = "";
$("vlmApply").addEventListener("click", () => {
  const raw = vlmBox.value, s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  try { proposal = JSON.parse(raw.slice(s, e + 1)); } catch { proposal = raw; }
});
$("vlmClear").addEventListener("click", () => { proposal = undefined; });
function showPlan(p: PersonalPlan): void {
  const lines = [
    `라이너: ${p.liner.plan.style} (${p.liner.source})`,
    `얼굴형: ${p.brow.faceShape ?? "모름"} → 눈썹 높이 ${p.brow.heightMm} mm · 미간 ${p.brow.glabellaMm} mm · 굽기 ${p.brow.arch} (${p.brow.source})`,
    `섀도 범위 ×${p.shadow.range.toFixed(2)} (${p.shadow.source}) · 라이너 두께 ×${p.linerThick.scale}`,
    `입술 오버라인 ${p.lip.overline.toFixed(2)} (${p.lip.source}) · 볼 ${p.blush.position} ×${p.blush.size} · T존 ${p.highlight.tZone ? "켬" : "끔"}`,
    `진하기 ${JSON.stringify(p.intensity)}`,
    ...Object.entries(p.rationale).map(([k, v]) => `근거 ${k}: ${v}`),
    ...(p.rejected.length ? ["거절: " + p.rejected.join(" / ")] : []),
  ].join("\n");
  if (lines !== planShown) planEl.textContent = planShown = lines;
}
const ctx2d = cv.getContext("2d");
const off = document.createElement("canvas");
const offCtx = off.getContext("2d");
if (!ctx2d || !offCtx) throw new Error("캔버스 2D 를 쓸 수 없음");
const g: CanvasRenderingContext2D = ctx2d;
const o: CanvasRenderingContext2D = offCtx;

type Part = "brow" | "shadow" | "liner" | "cheek" | "lip" | "contour" | "highlight";
/** blur 는 얼굴 폭 대비 번짐 — 섀도·볼은 넓게, 라이너는 거의 없이 */
const PARTS: { id: Part; name: string; blur: number }[] = [
  { id: "brow", name: "눈썹", blur: 0.004 },
  { id: "shadow", name: "섀도", blur: 0.012 },
  { id: "liner", name: "라이너", blur: 0.0015 },
  { id: "cheek", name: "볼", blur: 0.03 },
  { id: "lip", name: "입술", blur: 0.003 },
  { id: "contour", name: "쉐딩", blur: 0.025 },
  { id: "highlight", name: "하이라이트", blur: 0.025 },
];

interface Tpl { name: string; color: Partial<Record<Part, string>>; lipEdge?: string; alpha: Partial<Record<Part, number>>; linerThick: number }

/** 쉐딩·하이라이트는 룩에 없다(얼굴형 규칙 부위, F-04) — 얹어 보기용 기본 색 */
const CONTOUR_COLORS = { contour: "#a07a66", highlight: "#fff3e6" };
const CONTOUR_ALPHA = { contour: 0.35, highlight: 0.45 };

const hex = (c: readonly number[]): string => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const TEMPLATES: Tpl[] = [
  // 사진에서 뽑은 템플릿 (스크래치패드 extract.py 결과). 관찰색이라 보통 합성 + 불투명도로 얹는다. 불투명도는 눈대중 시작값
  {
    name: "사진 추출 (플럼 스모키)",
    color: { brow: "#8b7371", shadow: "#4e3e44", liner: "#1a1217", cheek: "#dec0bd", lip: "#b31540", ...CONTOUR_COLORS },
    lipEdge: "#c26375",
    alpha: { brow: 0.45, shadow: 0.55, liner: 0.9, cheek: 0.35, lip: 0.75, ...CONTOUR_ALPHA },
    linerThick: 0.045,
  },
  // 사진에서 뽑은 템플릿 2 (스크래치패드 extract_tpl.py 결과, before.png/after.png). 랜드마크 폴리곤 평균색 + ΔE 근사 alpha
  {
    name: "사진 추출 2 (로즈 브라운)",
    color: { brow: "#bd9694", shadow: "#a7837f", liner: "#644646", cheek: "#d5b2af", lip: "#af7879", ...CONTOUR_COLORS },
    lipEdge: "#b98784",
    alpha: { brow: 0.29, shadow: 0.47, liner: 0.32, cheek: 0.39, lip: 0.13, ...CONTOUR_ALPHA },
    linerThick: 0.076,
  },
  // 사진에서 뽑은 템플릿 3 (스크래치패드 extract_tpl.py 결과, before2.png/after2.png)
  {
    name: "사진 추출 3 (윙드 라이너)",
    color: { brow: "#b09495", shadow: "#977f80", liner: "#463a40", cheek: "#d2b7b8", lip: "#a98387", ...CONTOUR_COLORS },
    lipEdge: "#ac8386",
    alpha: { brow: 0.27, shadow: 0.51, liner: 0.39, cheek: 0.14, lip: 0.11, ...CONTOUR_ALPHA },
    linerThick: 0.076,
  },
  ...LOOKS.map((l): Tpl => ({
    name: l.name,
    color: { ...CONTOUR_COLORS, ...Object.fromEntries(Object.entries(l.parts).flatMap(([k, p]) => (p?.color ? [[k, hex(p.color)]] : []))) },
    alpha: { ...CONTOUR_ALPHA, ...Object.fromEntries(Object.entries(l.parts).map(([k, p]) => [k, p?.alpha ?? p?.alphaR ?? 0.5])) },
    linerThick: l.parts.liner?.thick ?? GUIDE_PARAMS.liner.thick,
  })),
];
TEMPLATES.forEach((t, i) => lookSel.add(new Option(t.name, String(i))));

// ── 부위별 조절 ─────────────────────────────────────
const sliders = new Map<Part, { input: HTMLInputElement; out: HTMLOutputElement; chip: HTMLElement; on: HTMLInputElement }>();
for (const p of PARTS) {
  const row = document.createElement("label");
  row.className = "part";
  const on = document.createElement("input");
  on.type = "checkbox";
  const chip = document.createElement("i");
  const name = document.createElement("span");
  name.textContent = p.name;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  const out = document.createElement("output");
  input.addEventListener("input", () => { out.textContent = Number(input.value).toFixed(2); });
  row.append(on, chip, name, input, out);
  partsEl.append(row);
  sliders.set(p.id, { input, out, chip, on });
}

const currentTpl = (): Tpl => TEMPLATES[Number(lookSel.value)] ?? TEMPLATES[0]!;

function applyTemplate(): void {
  const t = currentTpl();
  for (const p of PARTS) {
    const s = sliders.get(p.id)!;
    const c = t.color[p.id];
    s.on.checked = !!c;
    s.on.disabled = !c;
    s.chip.style.background = c ?? "transparent";
    s.input.value = String(t.alpha[p.id] ?? 0.5);
    s.out.textContent = Number(s.input.value).toFixed(2);
  }
}
lookSel.addEventListener("change", applyTemplate);
applyTemplate();

// ── 모양 ────────────────────────────────────────────
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const SIDES = [
  { eye: LM.eyeA, brow: LM.browA, cheek: LM.cheekA, face: LM.faceL, sign: -1 },
  { eye: LM.eyeB, brow: LM.browB, cheek: LM.cheekB, face: LM.faceR, sign: 1 },
] as const;

function path(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

/** 부위 하나를 오프스크린에 흐리게 칠한 뒤 불투명도로 얹는다 — 가장자리가 번져야 화장처럼 보인다 */
/**
 * 필터 방식 — 색을 덮지 않고 피부에 섞는다. 곱하기(multiply)는 피부 결·그늘·광이 그대로 비쳐 "칠한 스티커" 가 아니라 "바른 것" 처럼 보인다.
 * 입술은 곱하기 뒤에 색상(color)을 반쯤 한 번 더 — 입술 밝기(광)는 두고 색만 옮긴다.
 */
const renderSel = $<HTMLSelectElement>("render");
const FILTER_BLEND: Record<Part, GlobalCompositeOperation[]> = {
  brow: ["multiply"], liner: ["multiply"], shadow: ["multiply"], cheek: ["multiply"], lip: ["multiply", "color"],
  contour: ["multiply"], highlight: ["screen"],   // 하이라이트는 밝힌다
};
const natural = (): boolean => renderSel.value !== "sticker";
const meshMode = (): boolean => renderSel.value === "mesh";

// ── 그물 필터 (WebGL) ───────────────────────────────
// 화장을 기준 얼굴 위 무늬 두 장(곱하기 층·입술 색 층)에 그리고, WebGL 이 삼각형마다 지금 얼굴로 휘어 피부와 섞는다
const glcv = $<HTMLCanvasElement>("glcv");
const beautyIn = $<HTMLInputElement>("beauty");
const atlasMul = document.createElement("canvas");
const atlasCol = document.createElement("canvas");
const atlasLight = document.createElement("canvas");
const aLight = atlasLight.getContext("2d")!;
const aMul = atlasMul.getContext("2d")!;
const aCol = atlasCol.getContext("2d")!;
let glr: MakeupGl | null = null;
/** 무늬를 그린 기준 얼굴. 찍은 사진이 있으면 그것, 아니면 카메라를 켜고 처음 잡힌 얼굴 */
let liveRef: Pt[] | null = null;
$("reref").addEventListener("click", () => { liveRef = null; });

// ── 가이드 선 (화면 4 테두리 시험) ───────────────────
// 앱 채점과 같은 planGuide 로 그린다 — 계획이 있으면 그 정답, 없으면 규칙 계획. 테두리만, 면 채우기 없음(F-07)
const guidecv = $<HTMLCanvasElement>("guidecv");
const gg = guidecv.getContext("2d")!;
const guideOn = $<HTMLInputElement>("guideOn");
const GUIDE_PARTS = ["brow", "liner", "shadow", "cheek", "lip"] as const;
function drawGuide(lm: readonly Pt[], w: number, h: number, p: PersonalPlan): void {
  if (guidecv.width !== w || guidecv.height !== h) { guidecv.width = w; guidecv.height = h; }
  gg.clearRect(0, 0, w, h);
  guidecv.style.width = `${(glcv.hidden ? cv : glcv).clientWidth}px`;
  guidecv.style.transform = "scaleX(-1)";
  if (!guideOn.checked) return;
  const look = LOOKS.find((l) => l.name === currentTpl().name);
  const frame = { lm, unit: unitScale(lm) } as unknown as SampleFrame;   // 가이드는 점과 기준 길이만 본다
  const guide = planGuide(look?.parts ?? {}, p);
  gg.save();
  gg.strokeStyle = "#22d3ee";
  gg.lineWidth = Math.max(1.5, w / 600);
  gg.setLineDash([6, 4]);
  for (const part of GUIDE_PARTS) {
    const o = guideOutline(part, lm, guide(part, frame));
    for (const poly of o.polys) { gg.beginPath(); path(gg, poly); gg.stroke(); }
    for (const ln of o.lines) {
      gg.beginPath();
      gg.moveTo(ln[0]!.x, ln[0]!.y);
      for (const q of ln.slice(1)) gg.lineTo(q.x, q.y);
      gg.stroke();
    }
  }
  gg.restore();
}
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function paint(blurPx: number, alpha: number, draw: (ctx: CanvasRenderingContext2D) => void, blends: GlobalCompositeOperation[] = ["source-over"]): void {
  o.filter = "none";
  o.clearRect(0, 0, off.width, off.height);
  o.filter = `blur(${Math.max(0.5, blurPx)}px)`;
  draw(o);
  if (meshMode()) {
    // 무늬에는 색과 세기만 담는다 — 섞는 건 셰이더가 한다
    if (blends.includes("screen")) { aLight.globalAlpha = alpha; aLight.drawImage(off, 0, 0); return; }
    aMul.globalAlpha = alpha;
    aMul.drawImage(off, 0, 0);
    if (blends.includes("color")) { aCol.globalAlpha = alpha * 0.5; aCol.drawImage(off, 0, 0); }
    return;
  }
  blends.forEach((b, i) => {
    g.save();
    g.globalCompositeOperation = b;
    g.globalAlpha = i === 0 ? alpha : alpha * 0.5;
    g.drawImage(off, 0, 0);
    g.restore();
  });
}

/** 라이너 꼬리 — 한 프레임 α−β 는 흔들리므로 최근 15프레임 중앙값으로 규칙을 돌린다 */
const droops: number[] = [];
function linerStyle(lm: readonly Pt[]): LinerStyle {
  const m = measureFace(lm);
  droops.push(droopDeg(m));
  if (droops.length > 15) droops.shift();
  const med = [...droops].sort((a, b) => a - b)[Math.floor(droops.length / 2)]!;
  return planLiner({ ...m, eye: { R: { ...m.eye.R, alphaDeg: med, betaDeg: 0 }, L: { ...m.eye.L, alphaDeg: med, betaDeg: 0 } } }).style;
}

const ownBrow = (lm: readonly Pt[], brow: (typeof SIDES)[number]["brow"]): Pt[] =>
  [...brow.upper.map((i) => at(lm, i)), ...[...brow.lower].reverse().map((i) => at(lm, i))];

/** 표준 눈썹과 내 눈썹의 윤곽선 — 어디가 얼마나 다른지 본다 */
function drawBrowLines(lm: readonly Pt[]): void {
  const lw = Math.max(1.5, cv.width / 640);
  const stroke = (pts: readonly Pt[], color: string) => {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    path(g, pts);
    g.stroke();
    g.restore();
  };
  for (const { brow } of SIDES) stroke(ownBrow(lm, brow), "#22d3ee");
  const std = browStandard({ lm, unit: unitScale(lm) });
  if (std) for (const s of ["R", "L"] as const) stroke(std[s].outline, "#fb923c");
}

function drawMakeup(lm: readonly Pt[], style: LinerStyle): void {
  const t = currentTpl();
  const P = (i: number): Pt => at(lm, i);
  const unit = unitScale(lm);
  const faceW = unit.face;
  for (const p of PARTS) {
    const s = sliders.get(p.id)!, color = t.color[p.id];
    if (!color || !s.on.checked) continue;
    const alpha = Math.min(1, Number(s.input.value) * (p.id === "contour" || p.id === "highlight" ? 1 : (plan?.intensity[p.id] ?? 1)));
    const soft = natural();
    paint(p.blur * faceW * (soft ? 1.6 : 1), alpha, (ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      if (p.id === "brow") {
        // 표준: 이 얼굴에 세운 표준 눈썹(C-1). mm 를 모르면 내 눈썹으로 물러선다
        const std = browShapeSel.value === "standard" ? browStandard({ lm, unit }, plan?.brow) : null;
        if (std) for (const s of ["R", "L"] as const) path(ctx, std[s].outline);
        else for (const { brow } of SIDES) path(ctx, ownBrow(lm, brow));
      } else if (p.id === "shadow") {
        // guides.ts 섀도 범위와 같은 계산: 윗눈꺼풀 → 눈썹 아래로 rangeRatio 만큼
        for (const { eye, brow } of SIDES) {
          const lid = eye.upper.map(P), lo = brow.lower.map(P);
          const top = lid.map((q, i) => mix(q, lo[Math.min(lo.length - 1, Math.round((i / (lid.length - 1)) * (lo.length - 1)))]!, GUIDE_PARAMS.shadow.rangeRatio * (plan?.shadow.range ?? 1)));
          if (soft) {
            // 속눈썹 선에서 가장 진하고 위로 갈수록 옅어진다 — 섀도를 펴 바른 모양
            const a = lid[Math.floor(lid.length / 2)]!, b = top[Math.floor(top.length / 2)]!;
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, rgba(color, 1));
            grad.addColorStop(0.55, rgba(color, 0.6));
            grad.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            path(ctx, [...lid, ...[...top].reverse()]);
            ctx.fill();
            continue;
          }
          path(ctx, [...lid, ...top.reverse()]);
        }
        if (soft) return;
      } else if (p.id === "liner") {
        const outline = linerOutline({ lm, unit }, t.linerThick * (plan?.linerThick.scale ?? 1), style);
        path(ctx, outline.R);
        path(ctx, outline.L);
      } else if (p.id === "cheek") {
        // 볼: 계획의 위치(얼굴 위쪽으로 blushShift)·크기 배율 — guides.ts planGuide 의 cheek 과 같은 계산
        const c0 = GUIDE_PARAMS.cheek, sz = plan?.blush.size ?? 1;
        const c = { ...c0, rx: c0.rx * sz, ry: c0.ry * sz };
        const ax = faceAxis(lm), shift = plan?.blush.position === "higher" ? PLAN_RULES.blushShift : plan?.blush.position === "lower" ? -PLAN_RULES.blushShift : 0;
        for (const { cheek, face, sign } of SIDES) {
          const c1 = mix(P(cheek), P(face), c.toward);
          const ctr = { x: c1.x + ax.y * shift * faceW, y: c1.y - ax.x * shift * faceW };
          if (soft) {
            // 가운데에서 바깥으로 사라지는 블러셔 — 타원 모양은 좌표를 늘려서 만든다
            ctx.save();
            ctx.translate(ctr.x, ctr.y);
            ctx.rotate((sign * c.tilt * Math.PI) / 180);
            ctx.scale(1, c.ry / c.rx);
            const r = faceW * c.rx * 1.3;
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            grad.addColorStop(0, rgba(color, 1));
            grad.addColorStop(0.5, rgba(color, 0.55));
            grad.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            continue;
          }
          ctx.moveTo(ctr.x + faceW * c.rx, ctr.y);
          ctx.ellipse(ctr.x, ctr.y, faceW * c.rx, faceW * c.ry, (sign * c.tilt * Math.PI) / 180, 0, Math.PI * 2);
        }
        if (soft) return;
      } else if (p.id === "lip") {
        // 입술: 바깥 테두리 − 안쪽(입 벌린 자리). 가운데 → 가장자리 그라데이션
        const inner = LIP_INNER.map(P);
        if (t.lipEdge) {
          const cx = inner.reduce((a, q) => a + q.x, 0) / inner.length, cy = inner.reduce((a, q) => a + q.y, 0) / inner.length;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dist(P(61), P(291)) / 2);
          grad.addColorStop(0.2, color);
          grad.addColorStop(1, t.lipEdge);
          ctx.fillStyle = grad;
        }
        path(ctx, lipOutline(lm, plan?.lip.overline ?? 0));
        path(ctx, inner);
        ctx.fill("evenodd");
        return;
      } else {
        // 쉐딩·하이라이트: 계획의 얼굴형 규칙 밴드 (모르면 계란형), T존은 계획대로
        const bands = contourOutline(lm, plan?.faceShape ?? "oval", { tZone: plan?.highlight.tZone ?? true });
        for (const b of p.id === "contour" ? bands.shading : bands.highlight) path(ctx, b);
      }
      ctx.fill();
    }, soft ? FILTER_BLEND[p.id] : undefined);
  }
}

// ── 설정 받기 (JSON) ────────────────────────────────
// 화면에서 조정한 값(부위 켜기·진하기·색, 피부 보정, 입히기, 눈썹 모양, 룩)과 그때 쓰인 개인화 계획을 파일로 내려받는다.
// 사진·얼굴 점은 넣지 않는다 — 숫자 설정만.
function settingsJson(): string {
  const t = currentTpl();
  const parts = Object.fromEntries(PARTS.map((p) => {
    const s = sliders.get(p.id)!;
    return [p.id, { name: p.name, on: s.on.checked && !s.on.disabled, intensity: Number(s.input.value), color: t.color[p.id] ?? null, blur: p.blur }];
  }));
  return JSON.stringify({
    savedAt: new Date().toISOString(),
    look: t.name,
    render: renderSel.value,
    beauty: Number(beautyIn.value),
    browShape: browShapeSel.value,
    linerThick: t.linerThick,
    parts,
    rules: { guide: GUIDE_PARAMS, plan: PLAN_RULES },
    plan,
  }, null, 2);
}

$("exportJson").addEventListener("click", () => {
  const blob = new Blob([settingsJson()], { type: "application/json" });
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = URL.createObjectURL(blob);
  a.download = `makeup-settings-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $("exportMsg").textContent = `받음: ${a.download}`;
});

// ── 루프 ────────────────────────────────────────────
let landmarker: FaceLandmarker | null = null;
let bare = false;

// ── 사진 찍기 (2-b 예상도 시험) ─────────────────────
// 찍은 한 장과 그 랜드마크를 들고 있다가 그 위에 화장을 얹는다. 사진은 메모리에만 있고 저장하지 않는다.
const still = document.createElement("canvas");
let stillLm: Pt[] | null = null;
let lastLm: Pt[] | null = null;
const shotBtn = $<HTMLButtonElement>("shot");
const sendBtn = $<HTMLButtonElement>("send");
/** 개발용 VLM 중계(스크래치패드 server.mjs). 사용자가 직접 켠다 — 켜면 사진이 VLM 회사로 간다 */
const VLM_RELAY = "http://localhost:5199/vlm";

shotBtn.addEventListener("click", () => {
  if (stillLm) {
    stillLm = null;
    shotBtn.textContent = "사진 찍기";
    sendBtn.disabled = true;
    return;
  }
  if (!lastLm) return;
  still.width = video.videoWidth;
  still.height = video.videoHeight;
  still.getContext("2d")!.drawImage(video, 0, 0);
  stillLm = lastLm;
  shotBtn.textContent = "다시 찍기";
  sendBtn.disabled = false;
});

const promptFor = (lm: readonly Pt[]): string => {
  const look = LOOKS.find((l) => l.name === currentTpl().name) ?? LOOKS[0]!;
  return buildVlmPrompt(measureFace(lm), look);
};

sendBtn.addEventListener("click", () => {
  if (!stillLm) return;
  sendBtn.disabled = true;
  planEl.textContent = planShown = "VLM 에 보내는 중… (10초 안팎)";
  const image = still.toDataURL("image/jpeg", 0.9);
  fetch(VLM_RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, prompt: promptFor(stillLm) }) })
    .then((r) => r.json() as Promise<{ result: string; cost: number | null; model?: string; ms: number; error?: string }>)
    .then((r) => {
      vlmBox.value = r.result;
      const s = r.result.indexOf("{"), e = r.result.lastIndexOf("}");
      try { proposal = JSON.parse(r.result.slice(s, e + 1)); } catch { proposal = r.result; }
      planShown = "";
      statusEl.textContent = `VLM ${r.model ?? ""} ${(r.ms / 1000).toFixed(1)}초${r.cost != null ? ` · $${r.cost.toFixed(2)}` : ""}${r.error ? ` · 오류 ${r.error}` : ""}`;
    })
    .catch(() => { planEl.textContent = planShown = "VLM 중계에 닿지 못했어요. 중계(server.mjs)가 켜져 있는지 확인해 주세요."; })
    .finally(() => { sendBtn.disabled = false; });
});

function tick(): void {
  if (!landmarker || video.readyState < 2) { requestAnimationFrame(tick); return; }
  const w = video.videoWidth, h = video.videoHeight;
  if (cv.width !== w || cv.height !== h) { cv.width = off.width = w; cv.height = off.height = h; }
  let face: { x: number; y: number }[] | undefined;
  if (stillLm) {
    g.drawImage(still, 0, 0, w, h);
  } else {
    g.drawImage(video, 0, 0, w, h);
    face = landmarker.detectForVideo(video, performance.now()).faceLandmarks[0];
    const raw = face && face.length >= 478 ? face.map((p) => ({ x: p.x * w, y: p.y * h })) : null;
    lastLm = raw;   // 스무딩 없음 (2026-09-28 요청)
    shotBtn.disabled = !lastLm;
  }
  const lmNow = stillLm ?? lastLm;
  if (lmNow) {
    const lm: Pt[] = lmNow;
    const ruleStyle = linerStyle(lm);
    // VLM 제안이 없어도 규칙 계획으로 늘 개인화한다 (라이너 스타일만 여러 프레임 중앙값 규칙 — 한 프레임은 흔들린다)
    plan = resolvePlan(measureFace(lm), {}, proposal);
    showPlan(plan);
    const style = proposal === undefined ? ruleStyle : plan.liner.plan.style;
    if (meshMode()) {
      const ref = stillLm ?? (liveRef ??= lm.map((p) => ({ ...p })));
      if (atlasMul.width !== w || atlasMul.height !== h) { atlasMul.width = atlasCol.width = atlasLight.width = w; atlasMul.height = atlasCol.height = atlasLight.height = h; }
      aMul.clearRect(0, 0, w, h);
      aCol.clearRect(0, 0, w, h);
      aLight.clearRect(0, 0, w, h);
      if (!bare) drawMakeup(ref, style);
      glr ??= new MakeupGl(glcv);
      glr.render(stillLm ? still : video, w, h, atlasMul, atlasCol, atlasLight, { lm, ref, beauty: bare ? 0 : Number(beautyIn.value), radius: unitScale(lm).face * 0.012 });
    } else {
      if (!bare) drawMakeup(lm, style);
      if (linesChk.checked) drawBrowLines(lm);
    }
    glcv.hidden = !meshMode();
    cv.hidden = meshMode();
    drawGuide(lm, w, h, plan);
    if (!statusEl.textContent?.startsWith("VLM")) statusEl.textContent = `라이너 꼬리: ${style}${bare ? " · 맨얼굴" : ""}${stillLm ? " · 찍은 사진" : ""}`;
  } else {
    statusEl.innerHTML = `<span class="warn">얼굴을 찾지 못했어요</span>`;
    if (meshMode() && glr) glr.render(video, w, h, atlasMul, atlasCol, atlasLight, null);
  }
  requestAnimationFrame(tick);
}

async function start(): Promise<void> {
  startBtn.disabled = true;
  statusEl.textContent = "모델을 불러오는 중…";
  try {
    const files = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
    // measure-probe 와 같은 방식: 로컬 사본이 있으면 그것, 없으면 공식 CDN
    const LOCAL_MODEL = "/models/face_landmarker.task";
    const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
    const modelPath = await fetch(LOCAL_MODEL, { method: "HEAD" })
      .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html") ? LOCAL_MODEL : CDN_MODEL))
      .catch(() => CDN_MODEL);
    const opts = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: modelPath, delegate }, runningMode: "VIDEO" as const, numFaces: 1 });
    landmarker = await FaceLandmarker.createFromOptions(files, opts("GPU")).catch(() => FaceLandmarker.createFromOptions(files, opts("CPU")));
    statusEl.textContent = "카메라를 여는 중…";
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await video.play();
    bareBtn.disabled = false;
    requestAnimationFrame(tick);
  } catch (e) {
    startBtn.disabled = false;
    statusEl.innerHTML = `<span class="warn">시작하지 못했어요: ${e instanceof Error ? e.message : String(e)}</span>`;
  }
}

startBtn.addEventListener("click", () => void start());
const setBare = (v: boolean) => (): void => { bare = v; };
bareBtn.addEventListener("pointerdown", setBare(true));
bareBtn.addEventListener("pointerup", setBare(false));
bareBtn.addEventListener("pointerleave", setBare(false));
