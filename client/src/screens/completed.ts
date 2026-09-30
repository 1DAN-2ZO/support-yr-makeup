/**
 * 화면 3 완성본 그리기 (#192) — 쌩얼 정면 사진 위에 지금 화장의 개인화 계획대로 화장을 입힌 한 장.
 *
 * 2-b AR 과 **같은 코드**로 그린다 — 화장 층은 ⑥ makeup-paint.paintMakeup, 섞기는 makeup-gl.MakeupGl(같은 셰이더·같은 피부 보정).
 * 그래서 2-b 에서 본 화장과 색·모양이 같고, 다른 건 "그 순간" 뿐이다. 사진이 한 장이라 휘기는 없다(기준 점 = 지금 점).
 * 정면 사진(촬영 관문 통과)이라 확대해도 테두리가 안 비뚤고, 채점도 이 쌩얼과 비교해서 완성본·테두리·채점이 한 얼굴이다.
 */

import type { Look } from "@core/looks";
import type { PersonalPlan } from "@core/personalize";
import type { HairMask } from "@core/sampling";
import type { Pt } from "@core/types";
import { MakeupGl } from "./makeup-gl";
import { paintLookOf, paintMakeup } from "./makeup-paint";

export type Drawable = { img: CanvasImageSource & TexImageSource; w: number; h: number; close?: () => void };

/** 2-b AR 과 같은 피부 보정 (screens/fullrender.ts 의 gl.render 인자와 같은 값) */
const BEAUTY = 0.3;
const RADIUS = 0.004;

/** 못 그리면(WebGL2 없음 등) null — 화면은 쌩얼로 대신한다 */
/** hair: 쌩얼 사진의 머리카락 마스크 — 있으면 앞머리 위엔 화장·보정을 안 한다 (makeup-gl) */
export function paintCompleted(d: Drawable, lm: readonly Pt[], look: Look, plan: PersonalPlan, hair: HairMask | null = null): HTMLCanvasElement | null {
  const mk = (): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = d.w; c.height = d.h;
    return c;
  };
  const mul = mk(), col = mk(), light = mk(), off = mk();
  const gm = mul.getContext("2d"), gc = col.getContext("2d"), gli = light.getContext("2d");
  if (!gm || !gc || !gli) return null;
  paintMakeup({ mul: gm, col: gc, light: gli }, off, lm, paintLookOf(look), plan, plan.liner.plan.style);

  const glCanvas = document.createElement("canvas");
  let gl: MakeupGl;
  try {
    gl = new MakeupGl(glCanvas);
  } catch {
    return null;
  }
  try {
    gl.render(d.img, d.w, d.h, mul, col, light, { lm, ref: lm, beauty: BEAUTY, radius: d.w * RADIUS, hair });
    // WebGL 은 곧 돌려준다(살아 있는 개수 제한, #172 리뷰) — 결과를 2D 캔버스로 옮겨 둔다
    const out = mk();
    const g = out.getContext("2d");
    if (!g) return null;
    g.drawImage(glCanvas, 0, 0);
    return out;
  } finally {
    gl.dispose();
  }
}
