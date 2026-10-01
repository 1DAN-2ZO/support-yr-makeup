/**
 * 6단계 평가지의 화장 그림 — 평가자 브라우저에서 앱 렌더러(paintMakeup · MakeupGl)를 그대로 돌린다.
 * 사진 한 장이라 기준 얼굴 = 지금 얼굴 (휘기 없음). 앱 AR(fullrender)과 같은 번짐·피부 보정(beauty 0.3)·
 * 머리카락 가림을 쓴다. 문항마다 셋을 그린다 — 기준(개인화 없음: 계획 없이 화장 템플릿 그대로, 라이너는 기본 winged) · A · B. 마스카라는 앱 AR 이 아직 그리지 않아 여기서도 그리지 않는다 (makeup-probe 에만 있다).
 * WebGL 문맥은 하나만 — 브라우저가 동시에 여는 수에 한도가 있어 그림마다 2D 캔버스로 옮긴다.
 * report.py --sheet 가 esbuild 로 묶어 평가지 HTML 에 넣는다 (sheet_bundle.mjs).
 */

import { lookById } from "../../client/src/core/looks";
import type { PersonalPlan } from "../../client/src/core/personalize";
import type { HairMask } from "../../client/src/core/sampling";
import type { Pt } from "../../client/src/core/types";
import { MakeupGl } from "../../client/src/screens/makeup-gl";
import { paintLookOf, paintMakeup } from "../../client/src/screens/makeup-paint";

interface Item {
  n: number;
  img: string; // data URL (맨얼굴 원본)
  lm: Pt[]; // 원본 픽셀 좌표 478점
  look: string;
  A: PersonalPlan;
  B: PersonalPlan;
  /** 머리카락 확률 (앱 AR 과 같은 모델·가로 320 — report.py 가 미리 계산, 0~255 바이트 base64) */
  hair?: { w: number; h: number; b64: string } | null;
}

function hairMask(h: Item["hair"]): HairMask | null {
  if (!h) return null;
  const bin = atob(h.b64);
  const data = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i) / 255;
  return { w: h.w, h: h.h, data };
}

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error("사진을 못 읽음"));
    im.src = src;
  });
}

/** N = 기준 (개인화 없음) */
type Side = "N" | "A" | "B";

async function renderAll(items: Item[], onDone: (n: number, side: Side, c: HTMLCanvasElement) => void): Promise<void> {
  const glCanvas = document.createElement("canvas");
  const gl = new MakeupGl(glCanvas);
  try {
    for (const it of items) {
      const im = await loadImage(it.img);
      const w = im.naturalWidth, h = im.naturalHeight;
      const look = lookById(it.look);
      if (!look) throw new Error(`모르는 화장 ${it.look}`);
      const pl = paintLookOf(look);
      const hair = hairMask(it.hair);
      for (const side of ["N", "A", "B"] as const) {
        const plan = side === "N" ? null : it[side];
        const mul = canvas(w, h), col = canvas(w, h), light = canvas(w, h), off = canvas(w, h);
        paintMakeup({ mul: mul.getContext("2d")!, col: col.getContext("2d")!, light: light.getContext("2d")! }, off, it.lm, pl, plan, plan ? plan.liner.plan.style : "winged");
        gl.render(im, w, h, mul, col, light, { lm: it.lm, ref: it.lm, beauty: 0.3, radius: w * 0.004, hair });
        const out = canvas(w, h);
        out.getContext("2d")!.drawImage(glCanvas, 0, 0);
        onDone(it.n, side, out);
      }
      await new Promise((r) => setTimeout(r, 0)); // 화면이 멈추지 않게
    }
  } finally {
    gl.dispose();
  }
}

declare global {
  interface Window { renderSheet: (items: Item[], onDone: (n: number, side: Side, c: HTMLCanvasElement) => void) => Promise<void> }
}
window.renderSheet = renderAll;
