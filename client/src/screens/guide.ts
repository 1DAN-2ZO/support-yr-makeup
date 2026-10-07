/**
 * 화면 3 — 부위 완성본 (F-05·F-06, 정의서 3-1). 모듈 ②.
 *
 * 그 부위를 다 하면 어떻게 되는지 확대해서 보여 주고, 근거 한 줄 · 필요한 것 한 줄 · "따라 하기"(→ 화면 4).
 *  - 그림(#192): **쌩얼 정면 사진 + 지금 화장의 개인화 계획으로 입힌 화장**(screens/completed — 2-b AR 과 같은 그리기 코드)을
 *    이 부위 크롭으로 줌 (3-2b). 사진은 촬영 원본(고해상도)이 있으면 그것, 없으면(앱을 다시 켬) 저장한 쌩얼.
 *    정면 사진이라 확대해도 테두리가 안 비뚤고, 채점도 이 쌩얼과 비교해서 완성본·테두리·채점이 한 얼굴이다.
 *    (#190 의 2-b AR 장면은 누르는 순간 자세에 달려 비뚤기 쉽고 앱을 다시 켜면 없어서 바꿨다 — #192)
 *    그 위에 화면 4 와 **같은 테두리**를 맨얼굴 점(그림 크기로 맞춤)으로 겹친다 — 여기서 본 선이 라이브에서 따라 그릴 선이다.
 *    계획이 없거나 그리기가 실패하면(WebGL 없음) 쌩얼 + 테두리.
 *  - 거울로 보여 준다 (화면 4 라이브와 같은 방향).
 *  - 그림이 없어도 흐름은 막지 않는다 (2-b 와 같은 원칙).
 *
 */

import { cropSpec, scaleLm } from "@core/crop";
import { partCard } from "@core/guide-view";
import { lookGuide } from "@core/guides";
import { outlineOf } from "@core/live-run";
import { mustRotate, rotateText, nowOrientation } from "@core/orientation-lock";
import type { Look } from "@core/looks";
import type { PersonalPlan } from "@core/personalize";
import type { GuideSource } from "@core/score-part";
import { wantedOrientation, type Orientation } from "@core/screens";
import type { Baseline, FaceShape, PartId, Pt } from "@core/types";
import type { HairMask } from "@core/sampling";
import { paintCompleted, type Drawable } from "./completed";
import { strokeOutline } from "./outline-draw";
import type { Screen, ScreenContext } from "./shell";

export interface GuideDeps {
  getPart: () => PartId | null;
  /** 부위가 안 정해졌을 때(2-b "시작") 갈 첫 부위 */
  firstPart: () => PartId | null;
  getBaseline: () => Baseline | null;
  getLook: () => Look;
  getFaceShape: () => FaceShape | null;
  /** 지금 화장의 개인화 계획 — getGuide 와 같은 계획. 없으면 완성본을 안 그리고 쌩얼 */
  getPlan?: () => PersonalPlan | null;
  /** 촬영 원본(정면 눈 뜸, 고해상도). 메모리에만 있어 앱을 다시 켜면 null → 저장한 쌩얼 */
  getBareSource?: () => HTMLCanvasElement | null;
  /** 완성본 그리기 — 테스트에서 바꿔 끼운다 (기본 completed.paintCompleted) */
  paint?: typeof paintCompleted;
  /**
   * 쌩얼 사진 → 머리카락 마스크 (⑥ screens/hair-segmenter). 주면 앞머리 위엔 화장·보정을 안 한다.
   * 없거나 실패·null 이면 마스크 없이 전과 같이 그린다 (docs/research/hair-skin-2026-09-29)
   */
  getHairMask?: (d: Drawable) => Promise<HairMask | null>;
  /** 지금 화면 방향 — 테스트에서 바꿔 끼운다 (기본 orientation 미디어 쿼리). 모르면 null — 막지 않는다 */
  orientation?: () => Orientation | null;
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
  // 테두리(표준 눈썹 꼬리 등)가 얼굴 점 밖으로 나가도 창에 다 담는다 (#204)
  const crop = cropSpec(part, lm, aspect, [...outline.polys.flat(), ...outline.lines.flat()]);
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
      // 눈 부위는 가로, 나머지는 세로에서만 (팀 협의) — 방향이 틀리면 내용 대신 안내만. 돌리면 껍데기가 다시 그린다
      if (mustRotate(part, (deps.orientation ?? nowOrientation)())) {
        wrap.append(el("p", "rotate-lock", rotateText(part)));
        return;
      }
      const look = deps.getLook();
      const card = partCard(part, look, deps.getFaceShape());

      const top = el("div", "guide-topbar");
      top.innerHTML = `
        <div class="nudy-logo guide-logo" aria-label="nudy">
          <span>nudy</span>
          <i aria-hidden="true"></i>
        </div>
      `;
      const head = el("div", "guide-head");
      head.innerHTML = `
        <div class="guide-coach">
          <img src="/ui/nudy-coach-simple.svg" alt="" aria-hidden="true" />
          <div><span>${card.rationale ?? "이 선을 기준으로 천천히 따라 해볼게요"}</span><i aria-hidden="true"></i></div>
        </div>
        <h1>${card.title}</h1>
      `;
      wrap.append(top, head);
      const figure = el("div", "guide-img empty", GUIDE_TEXT.noImage);
      wrap.append(figure);
      if (card.need) {
        const need = el("p", "guide-need");
        need.textContent = card.need.replace(/^지금 필요한 것:\s*/, "");
        wrap.append(need);
      }
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
        if (!baseline?.lm.length) return;
        // 쌩얼: 촬영 원본이 있으면 원본(선명), 없으면 저장한 쌩얼 (그림 없이도 선은 보인다)
        const orig = deps.getBareSource?.() ?? null;
        const bare: Drawable | null = orig
          ? { img: orig, w: orig.width, h: orig.height }
          : baseline.bareImage ? await load(baseline.bareImage, toBitmap).catch(() => null) : null;
        if (!bare) return;
        if (!alive) { bare.close?.(); return; }
        // 맨얼굴 점은 촬영 크기(w·h) 좌표 — 그림 크기로 맞춘다. 완성본·테두리·채점이 이 한 얼굴
        const lm = scaleLm(baseline.lm, { w: baseline.w, h: baseline.h }, { w: bare.w, h: bare.h });
        let d: Drawable = bare;
        const plan = deps.getPlan?.() ?? null;
        // 그리다 오류가 나도(WebGL 컨텍스트 잃음 등) 쌩얼 + 테두리는 보인다 — 안 감싸면 바깥 catch 로 가서 그림 칸이 빈다 (#195 리뷰)
        let painted: HTMLCanvasElement | null = null;
        if (plan) {
          const hair = deps.getHairMask ? await deps.getHairMask(bare).catch(() => null) : null;
          if (!alive) { bare.close?.(); return; }
          try {
            painted = (deps.paint ?? paintCompleted)(bare, lm, look, plan, hair);
          } catch (e) {
            ctx.log.log({ name: "error", where: "guide", msg: `paint:${String(e).slice(0, 120)}` });
          }
        }
        if (painted) {
          bare.close?.();
          d = { img: painted, w: bare.w, h: bare.h };
        }
        shown = d;
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
