/**
 * 화면 4 부위 가이드 잇기 (2026-10-08, 모듈 ⑥) — 맨얼굴 + 정답사진 → 부위별로 "정답사진에서 자를 자리 · 가이드 테두리". 순수 함수.
 *
 * 떼기(core/makeup-extract) · 모양(core/part-guide) · 자르기(core/crop)는 전부 ② 것이다. 순서는 ② 의 시험 페이지
 * (screens/flow-poc.ts 의 setBare · setMade · cropOf)가 하는 그대로 — 여기서 새로 정한 값은 없다:
 *   1. 얼굴 윤곽을 0.9 로 줄인 안쪽만 본다 — FLUX(app_klein OVAL_KEEP 0.9)가 칠하는 곳. 그 밖은 원본에 되붙인 경계 차이다
 *   2. 맨얼굴과 정답사진의 차이에서 부위별 화장 영역을 뗀다
 *   3. 부위 가이드 모양을 만든다
 *   4. 부위마다 정답사진에서 자를 자리를 정한다 — 테두리가 다 들어오게
 * 넣기 전에 "넣어도 되는 것인가" 만 본다 (core/feedback-run 과 같은 규칙): 정답사진이 맨얼굴과 크기가 다르면 만들지 않는다.
 */

import { pointInPoly, type RgbaImage } from "./color";
import { cropSpec, type Rect } from "./crop";
import { FEEDBACK_ORDER, pageOf, type FeedbackPart } from "./guide-feedback";
import { EXTRACT, FACE_OVAL, extractAll, type ExtractPart } from "./makeup-extract";
import { partGuides } from "./part-guide";
import type { Pt } from "./types";

/** 자른 그림의 가로/세로 — 눈 부위는 양쪽 눈을 한 장에 (flow-poc PAGE_ASPECT 와 같은 값) */
export const GUIDE_ASPECT: Record<FeedbackPart, number> = { brow: 2, liner: 2, shadow: 2, lip: 1.5, cheek: 1.6 };

/** FLUX 가 칠하는 곳 — 얼굴 윤곽을 가운데 쪽으로 이만큼 줄인 안 (app_klein.py OVAL_KEEP) */
export const GUIDE_KEEP = 0.9;

export interface GuidePage {
  part: FeedbackPart;
  /** 정답사진에서 자를 자리 (넣은 그림의 px) */
  crop: Rect;
  /** 가이드 테두리들 (닫힌 선, 넣은 그림의 px). 그 부위의 화장을 못 찾았으면 비어 있다 */
  polys: { part: ExtractPart; poly: Pt[] }[];
  /** 퍼지는 방향 표시 (블러셔: 가운데 점 + 사방 화살표 — ② part-guide). 없으면 빈 배열 (2026-10-09) */
  marks: { dots: Pt[]; arrows: Pt[][] };
}

export interface GuideSources {
  /** 맨얼굴 눈 뜬 장 (화면 1) — 그림과 그 그림 px 기준 얼굴 점 */
  bare: { image: RgbaImage; lm: readonly Pt[] } | null;
  /** 정답사진 (화면 3) — 맨얼굴과 같은 크기 · 같은 자리 */
  answer: RgbaImage | null;
}

/** 만들지 못한 까닭: 무엇이 없나 · answer_size = 정답사진이 맨얼굴과 크기가 다름 */
export type GuideMissing = "bare" | "answer" | "answer_size";

export type GuideRun =
  | { ok: true; pages: Record<FeedbackPart, GuidePage>; /** 테두리가 있는 부위 (순서대로) */ found: FeedbackPart[] }
  | { ok: false; missing: GuideMissing };

export function runGuide(s: GuideSources): GuideRun {
  if (!s.bare) return { ok: false, missing: "bare" };
  if (!s.answer) return { ok: false, missing: "answer" };
  const { image: bare, lm } = s.bare, made = s.answer;
  if (made.w !== bare.w || made.h !== bare.h) return { ok: false, missing: "answer_size" };
  const w = bare.w, h = bare.h;

  const oval = FACE_OVAL.map((i) => lm[i]!);
  const mid = oval.reduce((a, p) => ({ x: a.x + p.x / oval.length, y: a.y + p.y / oval.length }), { x: 0, y: 0 });
  const clip = oval.map((p) => ({ x: mid.x + (p.x - mid.x) * GUIDE_KEEP, y: mid.y + (p.y - mid.y) * GUIDE_KEEP }));
  const keep = new Uint8Array(w * h), xs = clip.map((p) => p.x), ys = clip.map((p) => p.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(h - 1, Math.ceil(Math.max(...ys))); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(w - 1, Math.ceil(Math.max(...xs))); x++) if (pointInPoly(x, y, clip)) keep[y * w + x] = 1;
  }

  const parts = extractAll(bare, made, lm, EXTRACT).parts.map((p) => {
    const mask = p.mask.map((v, i) => (v && keep[i] ? 1 : 0));
    return { ...p, mask, count: mask.reduce((a, v) => a + v, 0) };
  });
  // 블러셔 테두리는 실제 얼굴 윤곽 안까지 (사용자가 잡은 모양 — 윤곽 90% 너머까지 잡았다)
  const guides = partGuides(parts, lm, w, h, { clip, made, face: oval });

  const pages = {} as Record<FeedbackPart, GuidePage>;
  for (const part of FEEDBACK_ORDER) {
    const polys = guides.filter((g) => pageOf(g.part) === part).flatMap((g) => g.polys.filter((q) => q.length >= 3).map((poly) => ({ part: g.part, poly })));
    const on = guides.filter((g) => pageOf(g.part) === part && g.marks);
    const marks = { dots: on.flatMap((g) => g.marks!.dots), arrows: on.flatMap((g) => g.marks!.arrows) };
    pages[part] = { part, crop: cropSpec(part, lm, GUIDE_ASPECT[part], polys.flatMap((q) => q.poly)), polys, marks };
  }
  return { ok: true, pages, found: FEEDBACK_ORDER.filter((p) => pages[p].polys.length > 0) };
}
