/**
 * 화면 4 부위 가이드 재료 모으기 (2026-10-08, 모듈 ⑥) — 화면이 아니다. 화면(⑤)은 loadPartGuide 가 준 것을 그리기만 한다.
 *
 * 세션의 맨얼굴 · 화면 3 의 정답사진을 풀어(사진 → 픽셀) core/guide-run 에 넣고, 화면이 쓸 것 —
 * 부위별 "정답사진에서 자를 자리 · 가이드 테두리" 와 정답사진 그림 — 을 돌려준다.
 * 그리는 것은 drawGuidePage: 정답사진을 그 부위로 잘라 키우고 테두리를 얹는다 (② 시험 페이지 flow-poc 의 drawCrop 과 같은 모양).
 */

import type { RgbaImage } from "@core/color";
import { scaleLm } from "@core/crop";
import type { FeedbackPart } from "@core/guide-feedback";
import { runGuide, type GuideMissing, type GuidePage } from "@core/guide-run";
import type { ExtractPart } from "@core/makeup-extract";
import type { Baseline, Pt } from "@core/types";
import { blobToRgba, type AnswerPhoto } from "./feedback-source";
import { strokeMarks } from "./outline-draw";

/**
 * 가이드를 만들 때는 긴 변을 이만큼으로 줄여서 푼다. 원본(2160×3840)은 한 장이 33MB 쯤이라 폰에서 느리다.
 * ② 가 가이드 모양을 확인한 것도 웹캠 크기(긴 변 1280 안팎)의 사진이다. 맨얼굴과 정답사진을 같은 한도로 줄이니 겹침은 그대로다.
 * 화면에 그릴 때는 줄이지 않은 정답사진에서 자른다 — 확대해도 흐리지 않게
 */
export const GUIDE_DECODE_SIDE = 1280;

/** 그릴 정답사진 (줄이지 않은 것) — 다 쓰면 close */
export type GuidePicture = CanvasImageSource & { width: number; height: number; close(): void };

export interface GuideSourceDeps {
  getBaseline: () => Baseline | null;
  getAnswer: () => AnswerPhoto | null;
  /** 사진 → 픽셀. maxSide 를 주면 긴 변을 그만큼으로 줄여서 푼다. 테스트에서 갈아 끼운다 */
  toRgba?: (src: Blob | ImageBitmap, maxSide?: number) => Promise<RgbaImage>;
  /** 사진 → 그릴 그림. 테스트에서 갈아 끼운다 */
  toPicture?: (src: Blob) => Promise<GuidePicture>;
  now?: () => number;
}

/** 화면 4 가 그릴 것 */
export interface GuideView {
  /** 부위별 자를 자리 · 테두리 — 좌표는 size 기준 px */
  pages: Record<FeedbackPart, GuidePage>;
  /** 테두리가 있는 부위. 여기 없는 부위는 정답사진에서 그 부위의 화장을 못 찾은 것이다 (자른 그림은 보여 줄 수 있다) */
  found: FeedbackPart[];
  /** pages 의 좌표가 놓인 그림 크기 (줄여서 푼 크기) */
  size: { w: number; h: number };
  /** 정답사진 (줄이지 않은 것) */
  picture: GuidePicture;
  /** 사진을 풀고 만드는 데 걸린 시간 */
  ms: number;
  dispose: () => void;
}

export type GuideLoad = { ok: true; view: GuideView } | { ok: false; missing: GuideMissing };

export async function loadPartGuide(deps: GuideSourceDeps): Promise<GuideLoad> {
  const now = deps.now ?? (() => performance.now()), toRgba = deps.toRgba ?? blobToRgba;
  const toPicture = deps.toPicture ?? ((b: Blob): Promise<GuidePicture> => createImageBitmap(b));
  const base = deps.getBaseline(), answer = deps.getAnswer();
  if (!base?.bareImage) return { ok: false, missing: "bare" };
  if (!answer) return { ok: false, missing: "answer" };

  const t0 = now();
  // 한 장씩 푼다 — 한꺼번에 풀면 여러 장이 메모리에 같이 올라간다
  const bareIm = await toRgba(base.bareImage, GUIDE_DECODE_SIDE), answerIm = await toRgba(answer.image, GUIDE_DECODE_SIDE);
  const picture = await toPicture(answer.image);
  // 얼굴 점은 촬영 크기 좌표다 — 푼 그림 크기로 맞춘다
  const run = runGuide({ bare: { image: bareIm, lm: scaleLm(base.lm, base, { w: bareIm.w, h: bareIm.h }) }, answer: answerIm });
  if (!run.ok) {
    picture.close();
    return run;
  }
  return {
    ok: true,
    view: { pages: run.pages, found: run.found, size: { w: answerIm.w, h: answerIm.h }, picture, ms: Math.round(now() - t0), dispose: () => picture.close() },
  };
}

export interface GuideKeeper {
  /** 지금 정답사진의 가이드 재료 — 같은 정답사진이면 만들어 둔 것을 그대로 준다 */
  get(): Promise<GuideLoad>;
  /** 만들어 둔 것을 놓는다 (붙들고 있던 정답사진 그림도) */
  drop(): void;
}

/**
 * 만든 것을 보관한다 — 부위를 넘길 때마다 사진을 다시 풀고 떼지 않게 (한 번에 1초 안팎).
 * 정답사진이 바뀌거나 없어지면(끝내기 · 맨얼굴 다시 찍기) 앞의 것을 놓는다. 못 만든 것은 보관하지 않는다
 */
export function createGuideKeeper(deps: GuideSourceDeps, load: (d: GuideSourceDeps) => Promise<GuideLoad> = loadPartGuide): GuideKeeper {
  let held: { answer: Blob; p: Promise<GuideLoad> } | null = null;
  const drop = (): void => {
    const old = held;
    held = null;
    void old?.p.then((r) => { if (r.ok) r.view.dispose(); }).catch(() => {});
  };
  return {
    get() {
      const answer = deps.getAnswer()?.image ?? null;
      if (held && held.answer !== answer) drop();
      if (!answer) return load(deps);
      if (!held) {
        const p = load(deps);
        const mine = (held = { answer, p });
        void p.then((r) => { if (!r.ok && held === mine) held = null; }).catch(() => { if (held === mine) held = null; });
      }
      return held.p;
    },
    drop,
  };
}

/** 테두리 색 — ② 시험 페이지(flow-poc COLOR)와 같은 값 */
const LINE: Partial<Record<ExtractPart, string>> = {
  brow: "rgb(255,159,28)", liner: "rgb(0,209,255)", shadow: "rgb(177,75,255)", underShadow: "rgb(224,123,255)", lip: "rgb(255,59,92)", cheek: "rgb(255,126,182)",
};

/** 자른 그림의 넓이 (px) — 폰 화면 폭의 두세 배 */
export const GUIDE_OUT_W = 960;

/**
 * 정답사진을 그 부위로 잘라 out 에 키워 그리고 가이드 테두리를 얹는다. 캔버스를 못 열면 false.
 * 테두리가 없는 부위(화장을 못 찾음)는 자른 그림만 그린다
 */
export function drawGuidePage(out: HTMLCanvasElement, view: Pick<GuideView, "pages" | "size" | "picture">, part: FeedbackPart, outW = GUIDE_OUT_W): boolean {
  const page = view.pages[part], crop = page.crop;
  out.width = outW;
  out.height = Math.round((outW * crop.h) / crop.w);
  const g = out.getContext("2d");
  if (!g) return false;
  // 자를 자리는 줄여서 푼 그림 기준 — 줄이지 않은 그림에서는 그만큼 큰 자리다
  const up = view.picture.width / view.size.w, k = outW / crop.w;
  g.fillStyle = "#000";
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(view.picture, crop.x * up, crop.y * up, crop.w * up, crop.h * up, 0, 0, out.width, out.height);
  g.lineJoin = "round";
  for (const { part: p, poly } of page.polys) {
    g.beginPath();
    g.moveTo((poly[0]!.x - crop.x) * k, (poly[0]!.y - crop.y) * k);
    for (const q of poly.slice(1)) g.lineTo((q.x - crop.x) * k, (q.y - crop.y) * k);
    g.closePath();
    g.strokeStyle = "rgba(0,0,0,.45)";
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = LINE[p] ?? "#fff";
    g.lineWidth = 2.5;
    g.stroke();
  }
  // 퍼지는 방향 (블러셔: 가운데 점 + 사방 화살표) — 테두리와 같은 색 (② part-guide, 2026-10-09)
  const at = (q: Pt): Pt => ({ x: (q.x - crop.x) * k, y: (q.y - crop.y) * k });
  if (page.marks) strokeMarks(g, { dots: page.marks.dots.map(at), arrows: page.marks.arrows.map((a) => a.map(at)) }, 2.5, LINE[part] ?? "#fff");
  return true;
}
