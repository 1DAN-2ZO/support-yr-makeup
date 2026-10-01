/**
 * [dev 전용] 화장 얹어 보기 (makeup-probe.html) — 룩 템플릿의 색을 웹캠 얼굴 자리에 얹는다.
 *
 * 2-b(완성 예상)의 생성형 합성이 아니다. 자리(기하)와 색이 얼굴에 어떻게 앉는지 눈으로 보는 용도다.
 * 자리는 personal-guide.ts(+guides.ts 상수)와 같은 계산을 쓴다 — 섀도 범위·볼 타원·라이너 윤곽(개인화 꼬리).
 * 사진은 어디에도 저장하지 않는다.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { unitScale } from "@core/baseline";
import { measureFace } from "@core/face-measure";
import { contourOutline } from "@core/contour";
import { faceAxis } from "@core/face-measure";
import { GUIDE_PARAMS } from "@core/guides";
import { browStandard, linerOutline, lipOutline, planGuide } from "@core/personal-guide";
import { guideOutline } from "@core/overlay";
import type { SampleFrame } from "@core/sampling";
import { LM, at, dist } from "@core/landmarks";
import { LOOKS } from "@core/looks";
import { PLAN_RULES, droopDeg, planLiner, resolvePlan, type LinerStyle, type PersonalPlan } from "@core/personalize";
import type { Pt } from "@core/types";
import { buildVlmPrompt } from "@core/vlm-prompt";
import type { LashState } from "@core/lash";
import { LashTextures, drawLashes } from "./lash-render";
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

/**
 * 일부 WebKit(Safari 27 확인, 2026-09-30 실측: `getContext("2d").filter`가 `undefined`)은
 * CanvasRenderingContext2D.filter 자체가 없다 — `o.filter = "blur(...)"` 가 조용히 무시돼
 * 블러 없이 도형만 그려졌다. UA 문자열 대신 기능 자체를 한 번 감지해서 분기한다.
 */
const SUPPORTS_CANVAS_FILTER = typeof o.filter === "string";
/** 번짐(px) → 절반으로 줄이는 단계 수. screens/makeup-paint.ts softenLevels와 같다(#271) */
function softenLevels(blurPx: number): number {
  return Math.max(1, Math.min(6, Math.round(Math.log2(Math.max(1, blurPx))) + 1));
}
const blurTmps: HTMLCanvasElement[] = [];
/**
 * filter 없는 환경의 블러 대체 — screens/makeup-paint.ts softenByResize와 같은 방식(#271):
 * 절반씩 여러 번 줄였다가 두 배씩 다시 키운다. 한 번에 크게 줄이면(이전 버전) 중간 픽셀을 건너뛰어
 * 블러 반경이 큰 부위(볼·쉐딩)가 계단 모양으로 나왔다 — 절반씩이면 매 단계 이웃 네 픽셀이 고르게 섞인다.
 * 정확한 가우시안은 아니지만 근사로는 충분하다.
 */
function blurByResize(blurPx: number): void {
  const n = softenLevels(blurPx);
  const ctxs: CanvasRenderingContext2D[] = [];
  let src: HTMLCanvasElement = off;
  for (let i = 0; i < n; i++) {
    const c = (blurTmps[i] ??= document.createElement("canvas"));
    c.width = Math.max(1, Math.round(off.width / 2 ** (i + 1)));
    c.height = Math.max(1, Math.round(off.height / 2 ** (i + 1)));
    const t = c.getContext("2d");
    if (!t) return;   // 못 번지면 그린 그대로 둔다
    t.imageSmoothingEnabled = true;
    t.clearRect(0, 0, c.width, c.height);
    t.drawImage(src, 0, 0, c.width, c.height);
    ctxs.push(t);
    src = c;
  }
  // 가장 작은 것부터 한 단계씩 키워 올라간다
  for (let i = n - 1; i >= 1; i--) {
    const up = blurTmps[i - 1]!, t = ctxs[i - 1]!;
    t.clearRect(0, 0, up.width, up.height);
    t.drawImage(blurTmps[i]!, 0, 0, up.width, up.height);
  }
  o.clearRect(0, 0, off.width, off.height);
  o.imageSmoothingEnabled = true;
  o.drawImage(blurTmps[0]!, 0, 0, off.width, off.height);
}

type Part = "brow" | "shadow" | "liner" | "cheek" | "lip" | "contour" | "highlight" | "under" | "aegyo" | "lash";
/** blur 는 얼굴 폭 대비 번짐 — 섀도·볼은 넓게, 라이너는 거의 없이. lash(마스카라)는 낱개 선이라 블러 안 먹임(0 이지만 미사용) */
const PARTS: { id: Part; name: string; blur: number }[] = [
  { id: "brow", name: "눈썹", blur: 0.004 },
  { id: "shadow", name: "섀도", blur: 0.012 },
  { id: "liner", name: "라이너", blur: 0.0015 },
  { id: "cheek", name: "볼", blur: 0.03 },
  { id: "lip", name: "입술", blur: 0.003 },
  { id: "contour", name: "쉐딩", blur: 0.025 },
  { id: "highlight", name: "하이라이트", blur: 0.025 },
  { id: "under", name: "언더라인", blur: 0.002 },
  { id: "aegyo", name: "애교살", blur: 0.02 },
  { id: "lash", name: "마스카라", blur: 0 },
];

/**
 * stops/axis — 부위 하나를 단색이 아니라 여러 색으로 입체감 있게 바를 때만 채운다(지금은 shadow만 소비).
 * axis vertical(기본): 속눈썹↔눈썹 방향, 마지막 색이 눈썹 쪽에서 알파 0으로 자동 페이드(피부에 스며듦).
 * axis horizontal: 눈 앞머리↔눈꼬리 방향, 양끝이 이 패턴의 핵심 색이라 자동 페이드를 안 한다.
 */
interface Tpl {
  name: string; color: Partial<Record<Part, string>>; lipEdge?: string; alpha: Partial<Record<Part, number>>; linerThick: number;
  stops?: Partial<Record<Part, { color: string; at: number }[]>>;
  axis?: Partial<Record<Part, "vertical" | "horizontal">>;
  /** true 면 밴드가 라이너 꼬리 방향으로 뻗어 점점 좁아지는 쐐기(눈꼬리 깊게)까지 이어진다. 지금은 shadow만 소비 */
  tailExtend?: Partial<Record<Part, boolean>>;
  /**
   * matte(기본, 생략 가능) | glitter — glitter는 단색 채우기 대신 밝은 점을 흩뿌려 채운다.
   * 빛 각도·시간에 따른 반짝임 애니메이션은 없다(고정 시드라 매 프레임 같은 자리) — 정적 무늬 하나를 그릴 뿐이다.
   * 지금은 aegyo(애교살)·shadow(섀도우)만 소비한다 — 2026-09-29 "화장 10종" 중 글리터 포인트 룩(아이돌·
   * 러블리·키치/하이틴) 때문에 추가. 애굣살에만 있으면 글리터가 눈 밑에서 뚝 끊겨 보여서 섀도우에도 얹는다.
   */
  finish?: Partial<Record<Part, "matte" | "glitter">>;
  /**
   * 마스카라 세기 — natural(연한) | deep(진한), 생략하면 미적용(속눈썹 체크박스가 꺼진 채 비활성화).
   * 각각 참고 사진 기반 텍스처 세트(client/public/lashes/{natural,deep}/, scripts/gen_photo_lash.py)를
   * 쓴다 — front 각도·눈뜸 3단계만 있고, 세로(v) 값은 1차 추정치라 실기기로 다시 맞춰야 한다(2026-10-01).
   */
  lashIntensity?: "natural" | "deep";
}

/** 시드 고정 의사난수(mulberry32) — 글리터 점 자리를 프레임마다 똑같이 만든다(반짝임 애니메이션 없음) */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 글리터: 다각형들 안에만 아주 작은 점을 촘촘히 흩뿌려 "펄 가루" 느낌을 낸다 — 자기 클립을 직접 거니
 * 어떤 패스 상태에서 불러도 안전하다(번짐이 끝난 뒤로 미뤄 불러도 됨, screens/makeup-paint.ts glitterIn과 같다).
 * 실측 참고 사진(2026-09-29, 사용자 제공 아이섀도 글리터 사진) 기준으로 큼직한 점 몇 개가 아니라 반경 1px
 * 안팎의 점을 빽빽하게 — 듬성듬성한 스팽글이 아니라 파우더 펄이다.
 * darken=false(기본, 애교살 — screen 블렌드): 점마다 흰 하이라이트를 얹어 반짝이는 입체감(단색 점보다 실감남).
 * darken=true(섀도우 — multiply 블렌드): 흰색은 곱하기에서 그대로 통과해(1을 곱하면 변화 없음) 안 보이므로,
 * 대신 검은 반점을 얹어 입자감을 낸다 — multiply 층에서는 밝게 반짝일 수 없어 "진한 펄 가루" 로 대체(실측 확인).
 */
function fillGlitter(ctx: CanvasRenderingContext2D, polys: readonly (readonly Pt[])[], color: string, darken = false): void {
  const pts = polys.flat();
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  ctx.save();
  ctx.beginPath();
  for (const poly of polys) path(ctx, poly);
  ctx.clip();
  const rnd = mulberry32(0x9e3779b9);
  const n = Math.max(40, Math.round(w * h * 0.02));
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h;
    const r = 0.45 + rnd() * 0.85;
    ctx.beginPath();
    ctx.fillStyle = rgba(color, (darken ? 0.7 : 0.55) + rnd() * 0.4);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = darken ? `rgba(0,0,0,${0.35 + rnd() * 0.35})` : rgba("#ffffff", 0.6 + rnd() * 0.4);
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** span(안쪽→바깥 순 점 목록) 위에서 비율 t(0~1)에 해당하는 자리를 선형보간으로 구한다 */
function pointAlong(span: readonly Pt[], t: number): Pt {
  const f = Math.max(0, Math.min(1, t)) * (span.length - 1);
  const i0 = Math.min(span.length - 2, Math.floor(f));
  return mix(span[i0]!, span[i0 + 1]!, f - i0);
}

/**
 * 마스카라 — "인조 마스카라 스티커"(속눈썹 연장) 컨셉. 참고 사진(eyelash1/2, 2026-09-29) 기준으로
 * 다시 잡음 — 안쪽→바깥 단조 증가가 아니라 3구간 구조였다:
 *   1) 중앙 부근에 제일 높이 솟은 스파이크(hump, 사인 곡선 봉우리) — 거의 수직
 *   2) 안쪽 끝은 짧게 유지
 *   3) 눈꼬리 쪽 마지막 30%에서만 갑자기 길어지며 옆(눈썹 방향)으로 확 젖혀지는 "윙" 구간
 * 낱개는 부드러운 곡선이 아니라 뿌리에서 끝까지 곧게 뻗는 뾰족한 스파이크(직선).
 * 위치는 매 프레임 완전히 고정(랜덤 없음), 길이만 살짝 흔들어 스티커 느낌을 살린다.
 * 블러는 안 먹인다(먹으면 선이 아니라 얼룩이 된다 — 글리터와 같은 이유).
 */
function fillLashes(ctx: CanvasRenderingContext2D, span: readonly Pt[], dir: 1 | -1, eyeWidth: number, color: string): void {
  const upper = dir === -1;
  const rnd = mulberry32(upper ? 0x1a5e5a : 0x2a5e5a);
  const n = upper ? 16 : 10;   // 윗속눈썹이 더 촘촘하다
  // span의 안쪽→바깥 축에서 "바깥(눈꼬리)" 방향의 가로 성분 — 윙 구간에서만 이 방향으로 젖혀진다
  const outVec = { x: span[span.length - 1]!.x - span[0]!.x, y: span[span.length - 1]!.y - span[0]!.y };
  const outLen = Math.hypot(outVec.x, outVec.y) || 1;
  const ux = outVec.x / outLen;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = pointAlong(span, t);
    const hump = Math.sin(t * Math.PI);   // 0(양끝)→1(중앙) 봉우리
    const wingT = Math.max(0, (t - 0.7) / 0.3);
    const wing = wingT * wingT;   // 0(t<0.7)→1(t=1), 눈꼬리 쪽 윙 구간만 살아남
    const humpAmt = upper ? 0.22 : 0.09, wingAmt = upper ? 0.34 : 0.12, baseAmt = upper ? 0.045 : 0.03;
    const len = eyeWidth * (baseAmt + humpAmt * hump + wingAmt * wing) * (0.85 + rnd() * 0.3);
    const fan = (upper ? 0.75 : 0.5) * wing;   // 윙 구간 전에는 거의 수직, 윙에서만 옆으로 젖혀짐
    let dx = ux * fan, dy = dir * (1 - fan * 0.4);
    const dlen = Math.hypot(dx, dy) || 1;
    dx /= dlen; dy /= dlen;
    // 뿌리는 거의 수직으로 서다가 끝에서 fan 방향으로 휜다(C컬) — 직선이 아니라 자연스러운 곡선(eyelash1.jpeg 참고, 2026-09-29)
    const fanRoot = fan * 0.25;
    let rx = ux * fanRoot, ry = dir * (1 - fanRoot * 0.4);
    const rlen = Math.hypot(rx, ry) || 1;
    rx /= rlen; ry /= rlen;
    const bendX = base.x + rx * len * 0.55, bendY = base.y + ry * len * 0.55;   // 휘어지는 중간 지점
    const tipX = base.x + dx * len, tipY = base.y + dy * len;
    // 선(stroke)이 아니라 면(fill) — 뿌리는 넓고 끝은 뾰족해야 "그림" 느낌이 난다.
    // 폭을 eyeWidth 고정 비율이 아니라 이 스파이크 "자기 길이"에 비례시킨다 — 길수록 뿌리도 굵어져야
    // 실제 낱개 속눈썹처럼 보인다(고정 비율이면 반폭이 1px도 안 돼서 결국 선처럼 보였다, 실측 확인)
    const px = -ry, py = rx;   // 뿌리 방향 기준 수직(뿌리 폭)
    const bpx = -dy, bpy = dx;   // 끝 방향 기준 수직(굽는 지점 폭)
    const w = len * 0.14 * (0.75 + rnd() * 0.5), bw = w * 0.5;
    ctx.fillStyle = rgba(color, 0.75 + rnd() * 0.2);
    ctx.beginPath();
    ctx.moveTo(base.x + px * w, base.y + py * w);
    ctx.quadraticCurveTo(bendX + bpx * bw, bendY + bpy * bw, tipX, tipY);
    ctx.quadraticCurveTo(bendX - bpx * bw, bendY - bpy * bw, base.x - px * w, base.y - py * w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const TEMPLATES: Tpl[] = [
  // 화장 10종 (2026-09-29, 사용자가 준 헥스값 그대로 반영 — 눈썹·라이너·쉐딩/하이라이트만 헥스가 없어서
  // 추정치. 섀도우 2색은 밝기를 비교해 어두운 쪽을 속눈썹 쪽(stops at:0), 밝은 쪽을 눈썹 쪽(at:1)으로 배치했다
  // (원문 나열 순서와 다를 수 있음 — 기존 "속눈썹에서 진하고 위로 옅어진다" 기본 그러데이션 방향과 맞춘 것).
  {
    name: "어른 여자 (Chic & Elegant)",
    color: { brow: "#5c4438", shadow: "#5c4033", liner: "#3a241c", lash: "#3a241c", cheek: "#a57164", lip: "#8b3a3a", contour: "#8f6b57", highlight: "#fff3e6", aegyo: "#d2b48c" },
    lipEdge: "#a85d62",
    alpha: { brow: 0.4, shadow: 0.45, liner: 0.9, lash: 0.9, cheek: 0.3, lip: 0.7, contour: 0.5, highlight: 0.35, aegyo: 0.25 },
    linerThick: 0.04,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#5c4033" }, { at: 1.0, color: "#b0897a" }] },
    tailExtend: { shadow: true },
    lashIntensity: "natural",
  },
  {
    name: "세미 스모키 (Hip & Edgy)",
    color: { brow: "#262320", shadow: "#363636", liner: "#0d0b09", lash: "#0d0b09", cheek: "#8b7d7b", lip: "#800020", contour: "#6b5040", highlight: "#fff3e6", aegyo: "#808080" },
    alpha: { brow: 0.55, shadow: 0.55, liner: 0.95, lash: 0.95, cheek: 0.25, lip: 0.55, contour: 0.55, highlight: 0.3, aegyo: 0.35 },
    linerThick: 0.06,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#363636" }, { at: 1.0, color: "#a9a9a9" }] },
    lashIntensity: "deep",
  },
  {
    name: "가을 (Autumn Mute)",
    color: { brow: "#6b4a34", shadow: "#8b4513", liner: "#5a3b28", lash: "#5a3b28", cheek: "#c86446", lip: "#b22222", contour: "#8a5c42", highlight: "#fff3e6", aegyo: "#e6c687" },
    lipEdge: "#c4795a",
    alpha: { brow: 0.45, shadow: 0.5, liner: 0.75, lash: 0.75, cheek: 0.32, lip: 0.6, contour: 0.45, highlight: 0.35, aegyo: 0.4 },
    linerThick: 0.045,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#8b4513" }, { at: 1.0, color: "#d27d2d" }] },
    lashIntensity: "natural",
  },
  {
    name: "청순 (Pure & Clean)",
    color: { brow: "#7a6552", shadow: "#e0b8a6", liner: "#2e2420", lash: "#2e2420", cheek: "#ffb7c5", lip: "#ff6f61", contour: "#b99783", highlight: "#fff3e6", aegyo: "#fff8dc" },
    alpha: { brow: 0.3, shadow: 0.28, liner: 0.6, lash: 0.6, cheek: 0.28, lip: 0.4, contour: 0.3, highlight: 0.4, aegyo: 0.3 },
    linerThick: 0.02,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#e0b8a6" }, { at: 1.0, color: "#f5e5d6" }] },
    lashIntensity: "natural",
  },
  {
    name: "아이돌 (Idol Sparkle)",
    color: { brow: "#7a5c42", shadow: "#ff9eaa", liner: "#241a16", lash: "#241a16", cheek: "#ffb6c1", lip: "#ff1493", contour: "#a88068", highlight: "#fff3e6", aegyo: "#ffffff" },
    lipEdge: "#ff6fab",
    alpha: { brow: 0.35, shadow: 0.45, liner: 0.9, lash: 0.9, cheek: 0.35, lip: 0.6, contour: 0.4, highlight: 0.6, aegyo: 0.6 },
    linerThick: 0.05,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#ff9eaa" }, { at: 1.0, color: "#ffd1dc" }] },
    tailExtend: { shadow: true },
    finish: { shadow: "glitter", aegyo: "glitter" },
    lashIntensity: "deep",
  },
  {
    name: "힙스터 (Street & Y2K)",
    color: { brow: "#a08868", shadow: "#4a3b32", liner: "#1a1512", lash: "#1a1512", cheek: "#b87333", lip: "#a0522d", contour: "#8a6048", highlight: "#fff3e6", aegyo: "#b8860b" },
    lipEdge: "#9c5040",
    alpha: { brow: 0.35, shadow: 0.35, liner: 0.85, lash: 0.85, cheek: 0.3, lip: 0.55, contour: 0.55, highlight: 0.35, aegyo: 0.4 },
    linerThick: 0.055,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#4a3b32" }, { at: 1.0, color: "#c4a484" }] },
    tailExtend: { shadow: true },
    lashIntensity: "deep",
  },
  {
    name: "러블리 (Soft Romantic)",
    color: { brow: "#7c5c48", shadow: "#ffb6c1", liner: "#4a362c", lash: "#4a362c", cheek: "#e6a8d7", lip: "#e06666", contour: "#c4a090", highlight: "#fff3e6", aegyo: "#ffe4e1" },
    lipEdge: "#f0a8ac",
    alpha: { brow: 0.35, shadow: 0.4, liner: 0.7, lash: 0.7, cheek: 0.35, lip: 0.55, contour: 0.3, highlight: 0.4, aegyo: 0.45 },
    linerThick: 0.04,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#ffb6c1" }, { at: 1.0, color: "#fff0f5" }] },
    finish: { shadow: "glitter", aegyo: "glitter" },
    lashIntensity: "natural",
  },
  {
    // 마스카라 미적용(lashIntensity 생략) 예시 — 출근·등교라 화장 시간을 줄인 룩
    name: "출근/학생 (Daily Quick)",
    color: { brow: "#6b5240", shadow: "#967969", liner: "#2e2420", cheek: "#e9967a", lip: "#cd5c5c", contour: "#b4967f", highlight: "#fff3e6", aegyo: "#f5f5dc" },
    alpha: { brow: 0.3, shadow: 0.3, liner: 0.6, cheek: 0.28, lip: 0.35, contour: 0.25, highlight: 0.3, aegyo: 0.22 },
    linerThick: 0.02,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#967969" }, { at: 1.0, color: "#e8d8c8" }] },
  },
  {
    name: "키치/하이틴 (Kitsch & High-teen)",
    color: { brow: "#6b4a32", shadow: "#ffb7b2", liner: "#120f0d", lash: "#120f0d", cheek: "#ffb2d0", lip: "#ff4081", contour: "#8a6048", highlight: "#ffd9ec", aegyo: "#ffd1dc" },
    lipEdge: "#ff85a8",
    alpha: { brow: 0.4, shadow: 0.5, liner: 0.85, lash: 0.85, cheek: 0.38, lip: 0.65, contour: 0.4, highlight: 0.55, aegyo: 0.55 },
    linerThick: 0.045,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#ffb7b2" }, { at: 1.0, color: "#e6e6fa" }] },
    tailExtend: { shadow: true },
    finish: { shadow: "glitter", aegyo: "glitter" },
    lashIntensity: "deep",
  },
  {
    name: "뉴트럴 (Clean Girl)",
    // 2026-09-30 갱신: "그림자 음영" 컨셉(어두운 샌드/올리브)에서 "유리알 글래스스킨"(맑은 피치·아이보리)으로 다시 받음
    // TODO liner/lash가 섀도우색(#e6c5b8, 피부톤에 가까운 밝기)을 그대로 따라가서 캠에서 거의 안 보일 수 있음 —
    // "청순" 템플릿처럼 라이너만 따로 어둡게 분리하는 게 나을 수 있다. 캠으로 확인 후 나중에 손보기.
    color: { brow: "#6e5a48", shadow: "#e6c5b8", liner: "#e6c5b8", lash: "#e6c5b8", cheek: "#f2b8a2", lip: "#e29a86", contour: "#b49a86", highlight: "#fff3e6", aegyo: "#f3e3d3" },
    lipEdge: "#f2b8a2",
    alpha: { brow: 0.28, shadow: 0.28, liner: 0.45, lash: 0.45, cheek: 0.25, lip: 0.4, contour: 0.3, highlight: 0.55, aegyo: 0.2 },
    linerThick: 0.05,
    axis: { shadow: "vertical" },
    stops: { shadow: [{ at: 0.0, color: "#e6c5b8" }, { at: 1.0, color: "#f9ebe0" }] },
    lashIntensity: "natural",
  },
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
/** 섀도 꼬리 연장 길이 (눈 폭 비율). 라이너 꼬리(12%)보다 크게 — 블러 반경보다 작으면 뭉개진다(실측 확인) */
const SHADOW_TAIL_RATIO = 0.35;
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
  under: ["multiply"], aegyo: ["screen"],   // 애교살은 하이라이트처럼 밝힌다
  lash: ["multiply"],
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

/** crisp: 번짐이 끝난 뒤 또렷하게 그릴 것(글리터 점) — screens/makeup-paint.ts와 같은 순서(#271) */
function paint(blurPx: number, alpha: number, draw: (ctx: CanvasRenderingContext2D) => void, blends: GlobalCompositeOperation[] = ["source-over"], crisp: readonly (() => void)[] = []): void {
  o.clearRect(0, 0, off.width, off.height);
  if (SUPPORTS_CANVAS_FILTER) {
    o.filter = `blur(${Math.max(0.5, blurPx)}px)`;
    draw(o);
    o.filter = "none";
  } else {
    draw(o);
    blurByResize(Math.max(0.5, blurPx));
  }
  for (const fn of crisp) fn();
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
    const alpha = Math.min(1, Number(s.input.value) *
      (p.id === "contour" || p.id === "highlight" || p.id === "under" || p.id === "aegyo" || p.id === "lash" ? 1 : (plan?.intensity[p.id] ?? 1)));
    const soft = natural();
    const crisp: (() => void)[] = [];
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
        const stops = t.stops?.shadow;
        const axis = t.axis?.shadow ?? "vertical";
        // 눈꼬리 연장(선택): 라이너 꼬리 방향으로 밴드가 뻗어 점점 좁아지는 쐐기. shadow1/shadow2 참고 사진의 "눈꼬리 깊게" 영역
        const tailExtend = t.tailExtend?.shadow;
        const linerOut = tailExtend ? linerOutline({ lm, unit }, t.linerThick * (plan?.linerThick.scale ?? 1), style) : null;
        for (const [side, { eye, brow }] of SIDES.entries()) {
          const lid = eye.upper.map(P), lo = brow.lower.map(P);
          const top = lid.map((q, i) => mix(q, lo[Math.min(lo.length - 1, Math.round((i / (lid.length - 1)) * (lo.length - 1)))]!, GUIDE_PARAMS.shadow.rangeRatio * (plan?.shadow.range ?? 1)));
          // 라이너 꼬리 "방향"만 따라가고 길이는 직접 늘린다 — 라이너 자체 길이(눈 폭 12%)는 블러 반경(약 8px)보다 작아 뭉개졌다(실측 확인).
          // SHADOW_TAIL_RATIO(35%)는 블러보다 확실히 크게 잡은 눈대중값 — 조정 필요하면 여기만 바꾸면 됨
          const linerTip = linerOut ? (side === 0 ? linerOut.R : linerOut.L)[eye.upper.length] : null;
          const outer = lid[0]!;
          const wingTip = linerTip ? (() => {
            const dx = linerTip.x - outer.x, dy = linerTip.y - outer.y, len = Math.hypot(dx, dy) || 1;
            return { x: outer.x + (dx / len) * SHADOW_TAIL_RATIO * unit.eye, y: outer.y + (dy / len) * SHADOW_TAIL_RATIO * unit.eye };
          })() : null;
          const topWing = wingTip ? mix(top[0]!, wingTip, 0.5) : null;
          const bandPts = wingTip ? [...lid, ...[...top].reverse(), topWing!, wingTip] : [...lid, ...[...top].reverse()];
          if (soft) {
            const mid = Math.floor(lid.length / 2);
            // vertical: 속눈썹 중앙 → 눈썹 아래 중앙. horizontal: 눈꼬리(lid[0]) → 눈 앞머리(lid 끝)
            const [a, b] = axis === "horizontal" ? [lid[0]!, lid[lid.length - 1]!] : [lid[mid]!, top[mid]!];
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            if (stops && stops.length > 0) {
              for (const st of stops) grad.addColorStop(Math.max(0, Math.min(1, st.at)), st.color);
              const last = stops[stops.length - 1]!;
              if (axis === "vertical" && last.at < 1) grad.addColorStop(1, rgba(last.color, 0));   // 눈썹 쪽으로 스며들듯 페이드
            } else {
              // 속눈썹 선에서 가장 진하고 위로 갈수록 옅어진다 — 섀도를 펴 바른 모양 (stops 없을 때 기본값)
              grad.addColorStop(0, rgba(color, 1));
              grad.addColorStop(0.55, rgba(color, 0.6));
              grad.addColorStop(1, rgba(color, 0));
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            path(ctx, bandPts);
            ctx.fill();
            // 글리터 룩(아이돌·러블리·키치): 그라데이션 베이스 위에 같은 밴드 안쪽으로만 점을 흩뿌린다 — 번짐 끝난 뒤(crisp)
            if (t.finish?.shadow === "glitter") crisp.push(() => fillGlitter(ctx, [bandPts], color, true));
            continue;
          }
          path(ctx, bandPts);
        }
        if (soft) return;
      } else if (p.id === "liner") {
        const outline = linerOutline({ lm, unit }, t.linerThick * (plan?.linerThick.scale ?? 1), style);
        path(ctx, outline.R);
        path(ctx, outline.L);
      } else if (p.id === "cheek") {
        // 볼: 계획의 위치(얼굴 위쪽으로 blushShift)·크기 배율 — personal-guide.ts planGuide 의 cheek 과 같은 계산
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
      } else if (p.id === "lash") {
        // PNG 텍스처 방식은 여기서 그리지 않는다 — 지금 얼굴(lm)로 lashcv 에 따로 그린다(drawLashLayer).
        // 그물 모드는 기준 얼굴(ref)에 그려 휘는데, 눈 뜸 3단계는 지금 얼굴로 정해야 해서다
        if (lashMode() === "texture") return;
        // 마스카라(인조 스티커 컨셉): 실제 속눈썹이 자라는 눈꺼풀 길이(eye.upper/lower) 안에서만 —
        // 라이너 꼬리는 피부 위에 그리는 선이라 속눈썹이 없는 자리까지 뻗으면 안 된다(#158 정정)
        ctx.filter = "none";
        for (const { eye } of SIDES) {
          const upperSpan = [...eye.upper.map(P)].reverse();   // 안쪽→바깥
          const lowerSpan = [...eye.lower.map(P)].reverse();   // 안쪽→바깥
          fillLashes(ctx, upperSpan, -1, unit.eye, color);
          fillLashes(ctx, lowerSpan, 1, unit.eye, color);
        }
        return;
      } else if (p.id === "under" || p.id === "aegyo") {
        // 언더라인·애교살: 아랫속눈썹 라인 → 볼 점 사이를 보간한 밴드(섀도와 같은 방식). 비율은 눈대중 시작값
        const [lo, hi] = p.id === "under" ? [0, 0.1] : [0.1, 0.35];
        const bands: Pt[][] = [];
        for (const { eye, cheek } of SIDES) {
          const lash = eye.lower.map(P), cPt = P(cheek);
          const band = [...lash.map((q) => mix(q, cPt, lo)), ...lash.map((q) => mix(q, cPt, hi)).reverse()];
          path(ctx, band);
          bands.push(band);
        }
        // 글리터 룩(아이돌·러블리·키치): 단색 채우기 대신 이 밴드들 안에 밝은 점을 흩뿌린다 — 번짐 끝난 뒤(crisp)
        if (p.id === "aegyo" && t.finish?.aegyo === "glitter") {
          crisp.push(() => fillGlitter(ctx, bands, color));
          return;
        }
      } else {
        // 쉐딩·하이라이트: 계획의 얼굴형 규칙 밴드 (모르면 계란형), T존은 계획대로
        const bands = contourOutline(lm, plan?.faceShape ?? "oval", { tZone: plan?.highlight.tZone ?? true });
        for (const b of p.id === "contour" ? bands.shading : bands.highlight) path(ctx, b);
      }
      ctx.fill();
    }, soft ? FILTER_BLEND[p.id] : undefined, crisp);
  }
}

// ── 마스카라 PNG 텍스처 (Ulike·SODA 방식, 2026-09-30) ─────────────
// 눈꺼풀 선을 따라 띠를 만들고 PNG 를 삼각형 단위로 휘어 붙인다. 눈 뜬 정도로 위·중간·아래 그림을 뚝 끊어 바꾼다(섞지 않음).
// 그림·규격: client/public/lashes/{natural,deep}/ (scripts/gen_photo_lash.py, 참고 사진 기반). 계산: core/lash.ts
const lashModeSel = $<HTMLSelectElement>("lashMode");
const lashMode = (): "texture" | "code" => (lashModeSel.value === "code" ? "code" : "texture");
const lashcv = $<HTMLCanvasElement>("lashcv");
const lg = lashcv.getContext("2d")!;
const lashesNatural = new LashTextures("/lashes/natural/");
const lashesDeep = new LashTextures("/lashes/deep/");
for (const lt of [lashesNatural, lashesDeep]) void lt.load().catch((e) => { console.warn("속눈썹 텍스처를 못 불러왔어요", e); });
const lashPrev: [LashState | null, LashState | null] = [null, null];

/** 지금 얼굴(lm)로 속눈썹 층을 그린다. 끄거나 텍스처가 없으면 비운다. 반환: 상태 글 (예 "R up · L mid") */
function drawLashLayer(lm: readonly Pt[] | null, w: number, h: number): string {
  if (lashcv.width !== w || lashcv.height !== h) { lashcv.width = w; lashcv.height = h; }
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.clearRect(0, 0, w, h);
  lashcv.style.width = `${(glcv.hidden ? cv : glcv).clientWidth}px`;
  lashcv.style.transform = "scaleX(-1)";
  lashcv.style.mixBlendMode = natural() ? "multiply" : "normal";
  const s = sliders.get("lash")!, t = currentTpl(), color = t.color.lash;
  const tex = t.lashIntensity === "deep" ? lashesDeep : lashesNatural;
  if (!lm || bare || lashMode() !== "texture" || !tex.ready || !color || !s.on.checked) { lashPrev[0] = lashPrev[1] = null; return ""; }
  const states = drawLashes(lg, tex, lm, color, Math.min(1, Number(s.input.value)), lashPrev);
  lashPrev[0] = states[0]; lashPrev[1] = states[1];
  return `R ${states[0]} · L ${states[1]}`;
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
    lashMode: lashModeSel.value,
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
  // cv 만 보고 넘어가면 off(오프스크린)가 어긋난 채로 남을 수 있다 — macOS 웹캠에서 videoWidth/Height가
  // 늦게 확정되는 경우 cv 는 맞는데 off 만 옛 크기라 화장이 블러·블렌드 없이 도형으로만 보였다(실측 보고)
  if (cv.width !== w || cv.height !== h || off.width !== w || off.height !== h) { cv.width = off.width = w; cv.height = off.height = h; }
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
    const lashShown = drawLashLayer(lm, w, h);
    if (!statusEl.textContent?.startsWith("VLM")) statusEl.textContent = `라이너 꼬리: ${style}${lashShown ? ` · 속눈썹 ${lashShown}` : ""}${bare ? " · 맨얼굴" : ""}${stillLm ? " · 찍은 사진" : ""}`;
  } else {
    statusEl.innerHTML = `<span class="warn">얼굴을 찾지 못했어요</span>`;
    drawLashLayer(null, w, h);
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
