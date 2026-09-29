/**
 * 화면 3 — 부위 완성본 (F-05·F-06, 정의서 3-1). 모듈 ②.
 *
 * 그 부위를 다 하면 어떻게 되는지 확대해서 보여 주고, 근거 한 줄 · 필요한 것 한 줄 · "따라 하기"(→ 화면 4).
 *  - 그림(#182): **2-b AR 장면**("화장하러 가기" 를 누른 순간 내 얼굴에 개인화 화장이 입혀진 한 장)을 이 부위 크롭으로 줌 (3-2b).
 *    사용자가 2-b 에서 본 그 얼굴 그대로다. 없으면(AR 이 안 켜짐 · 다른 화장 · 앱을 다시 켬) 쌩얼 — core/completed-source.
 *    어느 쪽이든 그 위에 화면 4 와 **같은 테두리**를 겹친다 — 여기서 본 선이 라이브에서 따라 그릴 선이다.
 *    테두리는 **그 그림의 얼굴 점**으로 그린다 (AR 장면은 맨얼굴과 구도가 달라 장면과 함께 저장된 점).
 *  - 거울로 보여 준다 (화면 4 라이브와 같은 방향).
 *  - 그림이 없어도 흐름은 막지 않는다 (2-b 와 같은 원칙).
 *
 */

import type { ArFrame } from "@core/ar-frame-store";
import { completedSource } from "@core/completed-source";
import { cropSpec, scaleLm } from "@core/crop";
import { partCard } from "@core/guide-view";
import { lookGuide } from "@core/guides";
import { outlineOf } from "@core/live-run";
import type { Look } from "@core/looks";
import type { GuideSource } from "@core/score-part";
import { wantedOrientation } from "@core/screens";
import type { Baseline, FaceShape, PartId, Pt } from "@core/types";
import { strokeOutline } from "./outline-draw";
import type { Screen, ScreenContext } from "./shell";

export interface GuideDeps {
  getPart: () => PartId | null;
  /** 부위가 안 정해졌을 때(2-b "시작") 갈 첫 부위 */
  firstPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  getLook: () => Look;
  getFaceShape: () => FaceShape | null;
  /** 고른 화장의 2-b AR 장면 (⑥ ar-frame-store). 없으면 null → 쌩얼. 저장 자리가 세션으로 옮겨 가도(① #181) 그대로 받게 Promise 도 받는다 */
  getArFrame?: () => ArFrame | null | Promise<ArFrame | null>;
  /** Blob → 그림. 테스트에서 바꿔 끼운다 (기본 createImageBitmap) */
  toBitmap?: (b: Blob) => Promise<ImageBitmap>;
  /** 테두리 모양 — 화면 4·5 와 같은 것. 없으면 lookGuide(getLook().parts). ⑥ 개인화 계획이 여기 꽂힌다 */
  getGuide?: () => GuideSource;
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

async function load(b: Blob | ImageBitmap, toBitmap: (b: Blob) => Promise<ImageBitmap>): Promise<Drawable> {
  const bmp = b instanceof Blob ? await toBitmap(b) : b;
  return { img: bmp, w: bmp.width, h: bmp.height, ...(b instanceof Blob ? { close: () => bmp.close() } : {}) };
}

/** 부위 크롭 + 테두리, 거울로. lm 은 그 그림의 얼굴 점(그림 크기) */
function drawPart(cv: HTMLCanvasElement, d: Drawable, part: PartId, lm: readonly Pt[], guide: GuideSource): boolean {
  const aspect = wantedOrientation(part) === "landscape" ? 16 / 9 : 3 / 4;
  const outline = outlineOf(part, lm, guide);
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
  strokeOutline(g, outline, Math.max(2, cw / 300) / k);
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
        // mount 안에서 바로 다시 그리면 안쪽 화면의 정리 함수가 바깥 render 에 덮여 안 불린다 → 끝난 뒤로 미룬다 (#167 리뷰)
        if (first) queueMicrotask(() => ctx.goPart(first));
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
      const baseline: Baseline | null = deps.getBaseline();
      const toBitmap = deps.toBitmap ?? ((b: Blob) => createImageBitmap(b));
      void (async () => {
        const ar = (await deps.getArFrame?.()) ?? null;
        const src = completedSource(ar, baseline);
        if (!src || !alive) return;
        // AR 장면이 깨져 못 열면 쌩얼로 (그림 없이도 선은 보인다)
        let d = await load(src.image, toBitmap).catch(() => null);
        let from = src;
        if (!d && src.from === "ar") {
          const bare = completedSource(null, baseline);
          if (bare) { from = bare; d = await load(bare.image, toBitmap).catch(() => null); }
        }
        if (!d) return;
        if (!alive) { d.close?.(); return; }
        shown = d;
        // 점은 저장할 때 크기(w·h) 좌표 — 그림을 줄여 저장했을 수 있어 그림 크기로 맞춘다
        const lm = scaleLm(from.lm, { w: from.w, h: from.h }, { w: d.w, h: d.h });
        const cv = el("canvas", "guide-canvas");
        if (!drawPart(cv, d, part, lm, deps.getGuide?.() ?? lookGuide(look.parts))) return;
        figure.textContent = "";
        figure.classList.remove("empty");
        figure.append(cv, el("p", "guide-note muted", GUIDE_TEXT.imageNote));
      })().catch((e: unknown) => ctx.log.log({ name: "error", where: "guide", msg: String(e).slice(0, 120) }));

      return () => {
        alive = false;
        shown?.close?.();
      };
    },
  };
}
