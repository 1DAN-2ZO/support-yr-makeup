/**
 * 화면 3 — 부위 완성본 (F-05·F-06, 정의서 3-1). 모듈 ②.
 *
 * 그 부위를 다 하면 어떻게 되는지 확대해서 보여 주고, 근거 한 줄 · 필요한 것 한 줄 · "따라 하기"(→ 화면 4).
 *  - 그림: 전체 완성 예상(④ 서버, 2-b 와 같은 그림)을 이 부위 크롭으로 줌 (3-2b). 없으면 쌩얼 사진.
 *    어느 쪽이든 그 위에 화면 4 와 **같은 테두리**를 겹친다 — 여기서 본 선이 라이브에서 따라 그릴 선이다.
 *  - 거울로 보여 준다 (화면 4 라이브와 같은 방향).
 *  - 그림이 없어도 흐름은 막지 않는다 (2-b 와 같은 원칙).
 *
 * 가정: 서버 완성본은 쌩얼 정면 사진과 같은 구도라서, 기준 랜드마크를 그림 크기로 늘여 쓴다.
 * 구도가 다르면(④ 가 자르거나 돌리면) 완성본에서 랜드마크를 다시 찾아야 한다 → #157·#29 에서.
 */

import { cropSpec, scaleLm } from "@core/crop";
import { partCard } from "@core/guide-view";
import { outlineOf } from "@core/live-run";
import type { Look } from "@core/looks";
import { wantedOrientation } from "@core/screens";
import type { Baseline, FaceShape, PartId } from "@core/types";
import { strokeOutline } from "./outline-draw";
import type { Screen, ScreenContext } from "./shell";

export interface GuideDeps {
  getPart: () => PartId | null;
  /** 부위가 안 정해졌을 때(2-b "시작") 갈 첫 부위 */
  firstPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  getLook: () => Look;
  getFaceShape: () => FaceShape | null;
  /** 고른 룩의 전체 완성 예상 그림 (④). 아직 없으면 null */
  fullRenderUrl: () => string | null;
}

export const GUIDE_TEXT = {
  start: "따라 하기",
  noImage: "준비 중",
  noPart: "부위가 정해지지 않았어요",
  imageNote: "이 선 안을 채우면 돼요",
} as const;

/** 화면에 그릴 폭(px). 긴 변 기준 */
const VIEW_W = 720;

type Drawable = { img: CanvasImageSource; w: number; h: number; close?: () => void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function loadUrl(url: string): Promise<Drawable> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("full_render_load"));
    img.src = url;
  });
}

async function loadBare(b: Baseline["bareImage"]): Promise<Drawable | null> {
  if (!b) return null;
  const bmp = b instanceof Blob ? await createImageBitmap(b) : b;
  return { img: bmp, w: bmp.width, h: bmp.height, ...(b instanceof Blob ? { close: () => bmp.close() } : {}) };
}

/** 부위 크롭 + 테두리, 거울로 */
function drawPart(cv: HTMLCanvasElement, d: Drawable, part: PartId, baseline: Baseline, look: Look): boolean {
  const aspect = wantedOrientation(part) === "landscape" ? 16 / 9 : 3 / 4;
  const lm = scaleLm(baseline.lm, { w: baseline.w, h: baseline.h }, { w: d.w, h: d.h });
  const crop = cropSpec(part, lm, aspect);
  const cw = aspect >= 1 ? VIEW_W : Math.round(VIEW_W * aspect), ch = Math.round(cw / aspect);
  cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d");
  if (!g) return false;
  const k = cw / crop.w;
  g.save();
  g.translate(cw, 0);
  g.scale(-1, 1);
  g.drawImage(d.img, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch);
  g.scale(k, k);
  g.translate(-crop.x, -crop.y);
  strokeOutline(g, outlineOf(part, lm, look.parts), Math.max(2, cw / 300) / k);
  g.restore();
  return true;
}

export function guideScreen<S>(deps: GuideDeps): Screen<S> {
  return {
    mount(ctx: ScreenContext<S>) {
      const wrap = el("div", "guide");
      ctx.root.append(wrap);
      const part = deps.getPart();
      if (!part) {
        const first = deps.firstPart();
        if (first) ctx.goPart(first);
        else wrap.append(el("p", "muted", GUIDE_TEXT.noPart));
        return;
      }
      const look = deps.getLook();
      const card = partCard(part, look, deps.getFaceShape());

      wrap.append(el("h1", "", card.title));
      const figure = el("div", "guide-img empty", GUIDE_TEXT.noImage);
      wrap.append(figure);
      if (card.rationale) wrap.append(el("p", "guide-why", card.rationale));
      if (card.need) wrap.append(el("p", "guide-need muted", card.need));
      const row = el("div", "row");
      const start = el("button", "primary", GUIDE_TEXT.start);
      start.type = "button";
      start.addEventListener("click", () => {
        ctx.log.log({ name: "button", button: "guide_follow" });
        ctx.go("live");
      });
      row.append(start);
      wrap.append(row);

      let alive = true;
      let shown: Drawable | null = null;
      const baseline = deps.getBaseline();
      const url = deps.fullRenderUrl();
      if (baseline && baseline.lm.length && (url || baseline.bareImage)) {
        void (async () => {
          // 완성본이 먼저, 못 받으면 쌩얼 (그림 없이도 선은 보인다)
          let d: Drawable | null = null;
          if (url) d = await loadUrl(url).catch(() => null);
          d ??= await loadBare(baseline.bareImage).catch(() => null);
          if (!d) return;
          if (!alive) { d.close?.(); return; }
          shown = d;
          const cv = el("canvas", "guide-canvas");
          if (!drawPart(cv, d, part, baseline, look)) return;
          figure.textContent = "";
          figure.classList.remove("empty");
          figure.append(cv, el("p", "guide-note muted", GUIDE_TEXT.imageNote));
        })().catch((e: unknown) => ctx.log.log({ name: "error", where: "guide", msg: String(e).slice(0, 120) }));
      }

      return () => {
        alive = false;
        shown?.close?.();
      };
    },
  };
}
