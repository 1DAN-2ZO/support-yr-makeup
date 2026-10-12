// 피부 정돈 (2026-10-12) — 맨얼굴 · 시도사진을 저장하기 전에 피부의 잔결만 부드럽게. 눈 · 눈썹 · 입술 · 얼굴 밖은 그대로
import { describe, expect, it } from "vitest";
import { SKIN_SMOOTH, smoothSkin } from "@core/skin-smooth";
import { LM } from "@core/landmarks";
import { FACE_OVAL } from "@core/makeup-extract";
import { pointInPoly } from "@core/color";
import type { Pt } from "@core/types";
import { BROWN, INK, LMS, RED, SKIN, W, H, image } from "./helpers/synth-face";

// 합성 얼굴에 얼굴 윤곽(타원)과 아랫눈꺼풀을 채운다 — 정돈은 윤곽 안에서 눈 · 눈썹 · 입술 구멍을 뺀 곳만 한다
const lm: Pt[] = LMS.map((p) => ({ ...p }));
FACE_OVAL.forEach((id, k) => { const t = (k / FACE_OVAL.length) * 2 * Math.PI - Math.PI / 2; lm[id] = { x: 300 + 200 * Math.cos(t), y: 330 + 260 * Math.sin(t) }; });
const lower = (upper: readonly number[], ids: readonly number[]) => ids.forEach((id, k) => { const u = lm[upper[k]!]!; lm[id] = { x: u.x, y: 250 + 12 * Math.sin((Math.PI * k) / (ids.length - 1)) }; });
lower(LM.eyeA.upper, LM.eyeA.lower);
lower(LM.eyeB.upper, LM.eyeB.lower);
const poly = (ids: readonly number[]) => ids.map((i) => lm[i]!);
const eyes = [LM.eyeA, LM.eyeB].map((e) => [...poly(e.upper), ...poly([...e.lower].reverse())]);
const brows = [LM.browA, LM.browB].map((b) => [...poly(b.upper), ...poly([...b.lower].reverse())]);
const lips = poly(LM.lipsOuter), oval = poly(FACE_OVAL);

/** 살 · 눈 · 눈썹 · 입술을 칠하고, 살에는 잔결(±6 — 실사진 모공 · 잔주름 세기)을 뿌린다. 이보다 센 변화는 점 · 선으로 보고 살린다 (SK4) */
const noise = (x: number, y: number) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 13) - 6;
const face = () => image((x, y) => {
  if (eyes.some((p) => pointInPoly(x, y, p))) return INK;
  if (brows.some((p) => pointInPoly(x, y, p))) return BROWN;
  if (pointInPoly(x, y, lips)) return RED;
  const n = noise(x, y);
  return [SKIN[0] + n, SKIN[1] + n, SKIN[2] + n];
});
const at = (im: { data: ArrayLike<number> }, x: number, y: number) => { const i = (y * W + x) * 4; return [im.data[i]!, im.data[i + 1]!, im.data[i + 2]!]; };
const patch = (im: { data: ArrayLike<number> }, cx: number, cy: number, r = 12) => {
  const v: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) v.push(at(im, x, y)[0]!);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
};

describe("피부 정돈 (smoothSkin)", () => {
  it("SK1 볼 · 이마의 잔결이 절반 넘게 줄고, 평균 색은 그대로", () => {
    const a = face(), b = face();
    smoothSkin(b, lm);
    for (const [cx, cy] of [[200, 360], [400, 360], [300, 160]] as const) {
      const p = patch(a, cx, cy), q = patch(b, cx, cy);
      expect(q.sd, `(${cx},${cy}) 잔결 ${p.sd.toFixed(1)} → ${q.sd.toFixed(1)}`).toBeLessThan(0.5 * p.sd);
      expect(Math.abs(q.mean - p.mean)).toBeLessThan(1.5);
    }
  });

  it("SK2 눈 · 눈썹 · 입술 안은 한 픽셀도 안 바뀐다", () => {
    const a = face(), b = face();
    smoothSkin(b, lm);
    let n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (![...eyes, ...brows, lips].some((p) => pointInPoly(x, y, p))) continue;
      n++;
      expect(at(b, x, y), `(${x},${y})`).toEqual(at(a, x, y));
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("SK3 얼굴 윤곽 밖(머리카락 · 배경)은 그대로", () => {
    const a = face(), b = face();
    smoothSkin(b, lm);
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
      if (pointInPoly(x, y, oval)) continue;
      expect(at(b, x, y)).toEqual(at(a, x, y));
    }
  });

  it("SK4 살 안의 뚜렷한 경계(점 · 진한 선)는 살린다 — 대비가 80% 넘게 남는다", () => {
    const line = (im: ReturnType<typeof image>) => { for (let y = 320; y < 380; y++) for (let x = 240; x < 246; x++) { const i = (y * W + x) * 4; im.data[i] = 90; im.data[i + 1] = 60; im.data[i + 2] = 50; } return im; };
    const a = line(face()), b = line(face());
    smoothSkin(b, lm);
    const contrast = (im: ReturnType<typeof image>) => at(im, 230, 350)[0]! - at(im, 243, 350)[0]!;
    expect(contrast(b)).toBeGreaterThan(0.8 * contrast(a));
  });

  it("SK5 얼굴 점이 모자라면(468 밑) 아무것도 안 한다 · 끄면(on: false) 아무것도 안 한다", () => {
    const a = face(), b = face(), c = face();
    smoothSkin(b, lm.slice(0, 100));
    smoothSkin(c, lm, { ...SKIN_SMOOTH, on: false });
    expect(b.data).toEqual(a.data);
    expect(c.data).toEqual(a.data);
  });
});
