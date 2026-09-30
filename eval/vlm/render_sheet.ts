/**
 * 6단계 평가지의 화장 그림 — 평가자 브라우저에서 앱 렌더러(paintMakeup · MakeupGl)를 그대로 돌린다.
 * 사진 한 장이라 기준 얼굴 = 지금 얼굴 (휘기 없음). 앱 AR 과 같은 번짐·피부 보정(beauty 0.3) 값을 쓴다.
 * WebGL 문맥은 하나만 — 브라우저가 동시에 여는 수에 한도가 있어 그림마다 2D 캔버스로 옮긴다.
 * report.py --sheet 가 esbuild 로 묶어 평가지 HTML 에 넣는다 (sheet_bundle.mjs).
 */

import { lookById } from "../../client/src/core/looks";
import type { PersonalPlan } from "../../client/src/core/personalize";
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

async function renderAll(items: Item[], onDone: (n: number, side: "A" | "B", c: HTMLCanvasElement) => void): Promise<void> {
  const glCanvas = document.createElement("canvas");
  const gl = new MakeupGl(glCanvas);
  try {
    for (const it of items) {
      const im = await loadImage(it.img);
      const w = im.naturalWidth, h = im.naturalHeight;
      const look = lookById(it.look);
      if (!look) throw new Error(`모르는 화장 ${it.look}`);
      const pl = paintLookOf(look);
      for (const side of ["A", "B"] as const) {
        const plan = it[side];
        const mul = canvas(w, h), col = canvas(w, h), light = canvas(w, h), off = canvas(w, h);
        paintMakeup({ mul: mul.getContext("2d")!, col: col.getContext("2d")!, light: light.getContext("2d")! }, off, it.lm, pl, plan, plan.liner.plan.style);
        gl.render(im, w, h, mul, col, light, { lm: it.lm, ref: it.lm, beauty: 0.3, radius: w * 0.004 });
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
  interface Window { renderSheet: (items: Item[], onDone: (n: number, side: "A" | "B", c: HTMLCanvasElement) => void) => Promise<void> }
}
window.renderSheet = renderAll;
