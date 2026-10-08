/**
 * 화면 5·5-b — 부위 결과 (F-08·F-09). 모듈 ③.
 *
 * 화면 4 가 확인받기 순간의 프레임 묶음(CaptureBundle)을 세션에 두면, 여기서 맨얼굴 기준과 비교해 채점하고 보여 준다.
 * 채점은 core(score-part.ts) 가 하고, 이 파일은 그 위에 얇게 — 사진 위 가이드 테두리, 점수 또는 "확인만", 한 줄 평, 버튼 셋.
 *
 * 화면에 **숫자는 점수 하나뿐**이다. 거리·각도·%·좌우 지수는 안 내보낸다 (F-09). 쉐딩·하이라이트는 점수 없이 "확인만".
 *
 *   다음          → 결과를 세션에 반영(applyResult) → 다음 부위 완성본 / 마지막이면 화면 6
 *   다시 확인받기 → 결과를 남기지 않고 화면 4 로
 *   건너뛰기      → skipped → 다음 부위
 */

import type { RgbaImage } from "../core/color";
import type { ScoreOutcome } from "../core/flow";
import { guideOutline } from "../core/overlay";
import { frameOf, type HairMask } from "../core/sampling";
import { scoreBundle, type GuideSource } from "../core/score-part";
import { PARAMS, PART_NAME } from "../core/score";
import { wantedOrientation } from "../core/screens";
import type { Baseline, CaptureBundle, PartId, PartStatus } from "../core/types";
import type { Screen, ScreenContext } from "./shell";

export interface ResultDeps {
  getPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  /** 화면 4 가 세션에 둔 확인받기 프레임 묶음 */
  getCapture: (part: PartId) => CaptureBundle | null;
  /** 고른 룩 기준의 가이드 (② guides.ts, 그 전엔 guide-poc.ts) */
  guide: () => GuideSource;
  /** 세션 반영 (①의 applyResult / applySkip / nextPart) */
  apply: (part: PartId, outcome: ScoreOutcome) => void;
  skip: (part: PartId) => void;
  nextPart: (after: PartId) => PartId | null;
  /** 지금 상태 (part_status 로그의 from). 안 주면 in_progress */
  getStatus?: (part: PartId) => PartStatus;
  /** 이미지 → 픽셀. 안 주면 캔버스로. 테스트에서 바꿔 끼운다 */
  toRgba?: (src: ImageBitmap | Blob) => Promise<RgbaImage>;
  /**
   * 사진 → 머리카락 마스크 (screens/hair-segmenter createHairMasker). 주면 맨얼굴·확인받기 사진마다 만들어
   * 앞머리·옆머리 칸을 채점에서 뺀다. 안 주거나 null 이면 전과 같이 (docs/research/hair-skin-2026-09-29)
   */
  hairMask?: (im: RgbaImage) => Promise<HairMask | null>;
  /** 마스크를 이만큼만 기다린다 (ms). 처음엔 모델을 내려받는데, 폰 네트워크가 멈추면 "채점 중…" 에 영영 서 있게 된다 */
  hairTimeoutMs?: number;
  /** 개발용(?tune): 판정 근거 숫자를 한 줄로 — 밝기 차·머리카락 가림·정렬·쓴 장 수. 사용자 화면엔 안 나온다 */
  tune?: boolean;
  /** ?tune "채점 사진 저장" 에 같이 담을 것 (화장 id·개인화 계획 등) */
  tuneInfo?: () => Record<string, unknown>;
  /** 픽셀 → PNG data URL. 테스트에서 바꿔 끼운다 (기본 캔버스) */
  toPng?: (im: RgbaImage) => string;
  /** 파일 내려받기. 테스트에서 바꿔 끼운다 (기본 <a download>) */
  download?: (name: string, text: string) => void;
}

/**
 * [개발용 ?tune] 채점에 쓴 사진·얼굴 점·결과를 한 파일로 — 폰에서 난 오채점을 PC 에서 그대로 재현한다
 * (2026-09-30 폰 시험: 맨얼굴인데 눈썹 70 · 라이너 43). 본인 사진만, 저장소 밖($DHE_DATA_DIR)에 둔다
 */
function scoreDump(part: PartId, baseline: Baseline, bareIm: RgbaImage, ims: RgbaImage[], bundle: CaptureBundle, outcome: ScoreOutcome, info: Record<string, unknown>, toPng: (im: RgbaImage) => string): string {
  return JSON.stringify({
    kind: "nudy-score-dump", v: 1, at: new Date().toISOString(), part, info,
    bare: { png: toPng(bareIm), w: bareIm.w, h: bareIm.h, lm: baseline.lm, lmFrame: { w: baseline.w, h: baseline.h } },
    frames: ims.map((im, i) => ({ png: toPng(im), w: im.w, h: im.h, pts: bundle.pts[i], occluded: bundle.handOverlap[i] ?? null })),
    outcome,
  });
}

function canvasPng(im: RgbaImage): string {
  const c = document.createElement("canvas");
  c.width = im.w;
  c.height = im.h;
  c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0);
  return c.toDataURL("image/png");
}

function saveFile(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const HAIR_TIMEOUT_MS = 3000;

const GUIDE_COLOR = "#3FD1C4";
const INTENSITY: readonly PartId[] = ["shadow", "cheek"];

export function resultScreen<S>(deps: ResultDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const part = deps.getPart();
      const wrap = el("div", "result");
      wrap.dataset.want = wantedOrientation(part);
      ctx.root.append(wrap);
      if (!part) {
        wrap.append(line("muted", "부위가 정해지지 않았어요"));
        return;
      }
      wrap.append(line("result-part", PART_NAME[part]));

      const baseline = deps.getBaseline(), bundle = deps.getCapture(part);
      if (!baseline?.bareImage || !bundle || !bundle.frames.length || bundle.pts.length !== bundle.frames.length) {
        wrap.append(line("muted", "확인받기 결과가 없어요. 다시 확인받아 주세요"));
        wrap.append(buttons(ctx, deps, part, null));
        return;
      }

      const photo = el("div", "result-photo");
      const canvas = document.createElement("canvas");
      photo.append(canvas);
      const scoreEl = el("div", "result-score");
      scoreEl.textContent = "채점 중…";
      const say = line("result-say", "");
      const extra = line("result-extra muted", "");
      wrap.append(photo, scoreEl, say, extra);
      const row = buttons(ctx, deps, part, null);
      wrap.append(row);

      let alive = true;
      const toRgba = deps.toRgba ?? canvasToRgba;
      const t0 = performance.now();
      void (async () => {
        let outcome: ScoreOutcome;
        let shot: { bare: RgbaImage; ims: RgbaImage[] } | null = null;   // ?tune 사진 저장용
        try {
          // 확인받기 묶음 전체를 채점한다 (3-3): 가려진 장은 빼고, 점수는 중앙값, 사진은 대표 장
          const [bareIm, ...ims] = await Promise.all([toRgba(baseline.bareImage!), ...bundle.frames.map((f) => toRgba(f))]);
          shot = { bare: bareIm, ims };
          if (!alive) return;
          const guide = deps.guide();
          // 머리카락 마스크 — 실패한 장은 null(그 장은 머리카락을 안 뺌). 맨얼굴 것도 같이: 한쪽이라도 가린 칸은 뺀다
          // 늦으면 기다리지 않는다 — 마스크 없이 채점 (전과 같은 결과)
          const hairOf = deps.hairMask ?? (async () => null);
          const late = new Promise<null>((r) => setTimeout(() => r(null), deps.hairTimeoutMs ?? HAIR_TIMEOUT_MS));
          const [bareHair, ...hairs] = await Promise.all([bareIm, ...ims].map((im) => Promise.race([hairOf(im).catch(() => null), late])));
          if (!alive) return;
          const base = frameOf(bareIm, baseline.lm, bareHair ?? undefined);
          const b = scoreBundle(part, base, ims.map((im, i) => ({ im, pts: bundle.pts[i]!, occluded: bundle.handOverlap[i] ?? null, ...(hairs[i] ? { hair: hairs[i] } : {}) })), guide);
          outcome = b.outcome;
          if (b.pick !== null && b.cur) drawOverlay(canvas, bundle.frames[b.pick]!, ims[b.pick]!, guideOutline(part, b.cur.lm, guide(part, b.cur)));
          ctx.log.log({ name: "score", part, status: outcome.decision === "scored" ? "passed" : "check_only", check_reason: outcome.checkReason, ms: Math.round(performance.now() - t0) });
        } catch (e) {
          if (!alive) return;
          ctx.log.log({ name: "error", where: "result", msg: e instanceof Error ? e.message : String(e) });
          scoreEl.textContent = "채점하지 못했어요";
          say.textContent = "다시 확인받아 주세요";
          return;
        }
        fill(scoreEl, say, extra, part, outcome);
        if (deps.tune && shot) {
          const sh = shot;
          row.before(tuneLine(outcome));
          const dump = el("button", "secondary result-dump");
          dump.textContent = "채점 사진 저장 (개발용)";
          const done = outcome;
          dump.addEventListener("click", () => {
            const text = scoreDump(part, baseline, sh.bare, sh.ims, bundle, done, deps.tuneInfo?.() ?? {}, deps.toPng ?? canvasPng);
            (deps.download ?? saveFile)(`nudy-score-${part}-${Date.now()}.json`, text);
          });
          row.before(dump);
        }
        row.replaceWith(buttons(ctx, deps, part, outcome));
      })();

      return () => {
        alive = false;
      };
    },
  };
}

/** [개발용 ?tune] 판정 근거 한 줄 — "밝기가 달라요" 가 왜 떴는지 폰에서 바로 본다 */
function tuneLine(o: ScoreOutcome): HTMLElement {
  const m = (o.metrics ?? {}) as { lightShift?: number; hairFrac?: number; alignResidual?: number; frames?: { used: number; excluded: number } };
  const f = (v: number | undefined, d = 1): string => (typeof v === "number" ? v.toFixed(d) : "-");
  const p = line("result-tune muted", "");
  p.textContent = `밝기 차 ${f(m.lightShift)} (한계 ${PARAMS.lightTol}) · 머리카락 ${f(m.hairFrac, 2)} (한계 ${PARAMS.hairMax}) · 정렬 ${f(m.alignResidual, 3)} (한계 ${PARAMS.alignMax}) · 사용 ${m.frames?.used ?? "-"}장 / 제외 ${m.frames?.excluded ?? "-"}장 · ${o.checkReason ?? "채점"}`;
  return p;
}

/** 점수(또는 확인만) · 한 줄 평 · 강도 부위 한 줄. 숫자는 점수뿐 */
function fill(scoreEl: HTMLElement, say: HTMLElement, extra: HTMLElement, part: PartId, o: ScoreOutcome): void {
  scoreEl.textContent = "";
  if (o.decision === "scored" && o.score != null) {
    const n = el("strong", "result-num");
    n.textContent = String(o.score);
    const unit = el("span", "result-unit");
    unit.textContent = "/ 100";
    scoreEl.append(n, unit);
  } else {
    scoreEl.textContent = "확인만";
  }
  say.textContent = o.diagnosis;
  if (INTENSITY.includes(part) && o.decision === "scored") {
    const bits = ["발림 확인"];
    if (part === "shadow") bits.push(o.diagnosisCodes.includes("SHADOW_DIR") ? "방향 불일치" : "방향 일치");
    extra.textContent = bits.join(" · ");
  } else if (INTENSITY.includes(part) && o.checkReason === "faint") {
    extra.textContent = "감지되지 않음";
  } else {
    extra.textContent = "";
  }
}

/**
 * 버튼 셋. outcome 이 없으면(채점 전·실패) "다음"은 잠긴다 — 결과 없이 passed 가 되면 안 된다.
 * 마지막 부위면 "다음" 대신 "결과 보러 가기"
 */
function buttons<S>(ctx: ScreenContext<S>, deps: ResultDeps, part: PartId, outcome: ScoreOutcome | null): HTMLElement {
  const next = deps.nextPart(part);
  const wrap = el("div", "result-buttons");
  const from = (): PartStatus => deps.getStatus?.(part) ?? "in_progress";
  const goOn = (): void => {
    if (next) ctx.goPart(next);
    else ctx.go("review");
  };

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "primary";
  nextBtn.textContent = next ? "다음" : "결과 보러 가기";
  nextBtn.disabled = !outcome;
  nextBtn.addEventListener("click", () => {
    if (!outcome) return;
    ctx.log.log({ name: "button", button: next ? "next" : "to_review" });
    const to: PartStatus = part === "contour" || outcome.decision === "check_only" ? "check_only" : "passed";
    ctx.log.log({ name: "part_status", part, from: from(), to, score: to === "passed" ? outcome.score : null });
    deps.apply(part, outcome);
    goOn();
  });

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "다시 확인받기";
  retry.addEventListener("click", () => {
    ctx.log.log({ name: "button", button: "retry" });
    ctx.go("live");
  });

  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "ghost";
  skip.textContent = "건너뛰기";
  skip.addEventListener("click", () => {
    ctx.log.log({ name: "button", button: "skip" });
    ctx.log.log({ name: "part_status", part, from: from(), to: "skipped", score: null });
    deps.skip(part);
    goOn();
  });

  // POC: 다음 → 다시 확인받기 → 건너뛰기, 세로로 한 줄씩
  retry.className = "secondary";
  const row = el("div", "btns");
  row.append(nextBtn, retry, skip);
  wrap.append(row);
  return wrap;
}

/** 사진 위에 청록 테두리만. 캔버스를 못 쓰는 환경(jsdom)에서는 조용히 넘어간다 */
function drawOverlay(canvas: HTMLCanvasElement, frame: ImageBitmap | Blob, im: RgbaImage, outline: ReturnType<typeof guideOutline>): void {
  canvas.width = im.w;
  canvas.height = im.h;
  canvas.dataset.polys = String(outline.polys.length);
  canvas.dataset.lines = String(outline.lines.length);
  if (typeof ImageData === "undefined") return;   // jsdom — 캔버스 없음
  const g = canvas.getContext("2d");
  if (!g) return;
  if (frame instanceof ImageBitmap) g.drawImage(frame, 0, 0, im.w, im.h);
  else g.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0);
  g.strokeStyle = GUIDE_COLOR;
  g.lineWidth = Math.max(2, im.w / 300);
  g.lineJoin = "round";
  const path = (pts: readonly { x: number; y: number }[], close: boolean): void => {
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    if (close) g.closePath();
    g.stroke();
  };
  for (const p of outline.polys) path(p, true);
  for (const l of outline.lines) path(l, false);
}

async function canvasToRgba(src: ImageBitmap | Blob): Promise<RgbaImage> {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("캔버스를 열 수 없어요");
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { data: d.data, w: d.width, h: d.height };
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function line(cls: string, text: string): HTMLElement {
  const p = el("p", cls);
  p.textContent = text;
  return p;
}
