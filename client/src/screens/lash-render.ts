/**
 * 마스카라 PNG 텍스처를 캔버스에 그린다 (Ulike·SODA 방식, 2026-09-30).
 *
 * 눈꺼풀 선을 따라 띠를 만들고(core/lash.ts), PNG 를 삼각형 단위로 휘어 붙인다.
 * 눈 뜬 정도로 위·중간·아래 그림을 뚝 끊어 바꾼다(섞지 않음). 아랫속눈썹은 눈 감음일 때 그리지 않는다.
 * 그림·규격: client/public/lashes/{natural,deep}/ (scripts/gen_photo_lash.py 가 참고 사진에서 만든다).
 */

import { affine, eyeOpenness, lashState, lidStrip, texPx, type LashMeta, type LashState, type StripVertex } from "@core/lash";
import { LM, at, dist } from "@core/landmarks";
import type { Pt } from "@core/types";

/** lashes.json 과 PNG 를 불러 두고, 룩 색으로 입힌 사본을 캐시한다 */
export class LashTextures {
  meta: LashMeta | null = null;
  private readonly img = new Map<string, HTMLImageElement>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  constructor(private readonly base: string) {}

  get ready(): boolean { return this.meta !== null; }

  async load(): Promise<void> {
    const m = (await (await fetch(`${this.base}lashes.json`)).json()) as LashMeta;
    await Promise.all(Object.values(m.textures).map((t) => new Promise<void>((ok, fail) => {
      const img = new Image();
      img.onload = () => { this.img.set(t.file, img); ok(); };
      img.onerror = () => fail(new Error(`속눈썹 그림 ${t.file} 없음`));
      img.src = `${this.base}${t.file}`;
    })));
    this.tinted.clear();
    this.meta = m;
  }

  /** 알파는 그림 그대로, 색만 룩 색으로 */
  tint(file: string, color: string): HTMLCanvasElement | null {
    const key = `${file}|${color}`;
    const hit = this.tinted.get(key);
    if (hit) return hit;
    const img = this.img.get(file);
    if (!img) return null;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    this.tinted.set(key, c);
    return c;
  }
}

/** 띠 격자(세로줄 목록)를 따라 그림을 삼각형 단위로 휘어 그린다. 이음매가 안 보이게 삼각형을 0.6px 부풀려 자른다 */
export function drawStrip(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, cols: StripVertex[][], meta: Pick<LashMeta, "uMin" | "uMax">, tex: { vMin: number; vMax: number }): void {
  const S = (q: StripVertex): Pt => texPx(q.u, q.v, meta, tex, img.width, img.height);
  const tri = (a: StripVertex, b: StripVertex, c: StripVertex): void => {
    const s0 = S(a), s1 = S(b), s2 = S(c);
    const m = affine(s0, s1, s2, a.at, b.at, c.at);
    if (!m) return;
    const cx = (a.at.x + b.at.x + c.at.x) / 3, cy = (a.at.y + b.at.y + c.at.y) / 3;
    const grow = (q: Pt): Pt => {
      const dx = q.x - cx, dy = q.y - cy, l = Math.hypot(dx, dy) || 1;
      return { x: q.x + (dx / l) * 0.6, y: q.y + (dy / l) * 0.6 };
    };
    const g0 = grow(a.at), g1 = grow(b.at), g2 = grow(c.at);
    // 그림 전체가 아니라 이 삼각형이 덮는 부분만 옮긴다 (프레임마다 삼각형 ~200개)
    const sx = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 1), sy = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 1);
    const sw = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 1) - sx;
    const sh = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 1) - sy;
    if (sw <= 0 || sh <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(...m);
    ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  };
  for (let i = 0; i < cols.length - 1; i++) {
    const A = cols[i]!, B = cols[i + 1]!;
    for (let r = 0; r < A.length - 1; r++) {
      tri(A[r]!, B[r]!, B[r + 1]!);
      tri(A[r]!, B[r + 1]!, A[r + 1]!);
    }
  }
}

const EYES = [{ eye: LM.eyeA, brow: LM.browA }, { eye: LM.eyeB, brow: LM.browB }] as const;

/**
 * 양쪽 눈에 속눈썹을 그린다. prev = 직전 프레임 상태(문턱 근처 깜빡임 방지). 반환: 이번 상태 [A(피험자 오른쪽), B(왼쪽)].
 * ctx 는 비어 있는 층이어야 한다 — 피부와 섞는 것(multiply)은 부르는 쪽이 정한다.
 */
export function drawLashes(ctx: CanvasRenderingContext2D, tex: LashTextures, lm: readonly Pt[], color: string, alpha: number,
  prev: readonly [LashState | null, LashState | null] = [null, null]): [LashState, LashState] {
  const meta = tex.meta;
  if (!meta) throw new Error("속눈썹 텍스처가 아직 없음");
  const P = (i: number): Pt => at(lm, i);
  const mean = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((a, q) => a + q.x, 0) / ps.length, y: ps.reduce((a, q) => a + q.y, 0) / ps.length });
  const states: LashState[] = [];
  ctx.save();
  ctx.globalAlpha = alpha;
  EYES.forEach(({ eye, brow }, side) => {
    const upper = eye.upper.map(P), lower = eye.lower.map(P);
    const eyeW = dist(P(eye.outer), P(eye.inner));
    const state = lashState(eyeOpenness(upper, lower, eyeW), prev[side] ?? null);
    states.push(state);
    const eyeC = mean([...upper, ...lower]), browC = mean(brow.lower.map(P));
    const up = { x: browC.x - eyeC.x, y: browC.y - eyeC.y };
    // 아랫속눈썹 먼저 — 윗속눈썹이 위에 겹친다. 눈 감음이면 윗속눈썹에 가려 안 그린다
    if (state !== "down") {
      const t = meta.textures.lower, img = tex.tint(t.file, color);
      if (img) drawStrip(ctx, img, lidStrip([...lower].reverse(), { x: -up.x, y: -up.y }, eyeW, t), meta, t);
    }
    const t = meta.textures[state], img = tex.tint(t.file, color);
    if (img) drawStrip(ctx, img, lidStrip([...upper].reverse(), up, eyeW, t), meta, t);   // 점 순서가 바깥→안쪽이라 뒤집는다
  });
  ctx.restore();
  return [states[0]!, states[1]!];
}
