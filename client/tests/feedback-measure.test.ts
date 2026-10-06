// 새 흐름 화면 6 — 사진에서 재서 문장까지 (feedbackWhole) · 겹치는 그림에서 라이너 꼬리 끝 찾기 (ridgeTail)
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import { feedbackWhole, measureWhole, ridgeTail } from "@core/feedback-measure";
import { LM } from "@core/landmarks";
import { frameOf } from "@core/sampling";
import { LMS, P, RED, SKIN, image, type Paint, type Rgb } from "./helpers/synth-face";

const lipPoly = LM.lipsOuter.map(P);
const tint = (c: Rgb, k: number): Rgb => SKIN.map((s, i) => Math.round(s + (c[i]! - s) * k)) as unknown as Rgb;
const lips = (k: number): Paint => (x, y) => (pointInPoly(x, y, lipPoly) ? tint(RED, k) : null);
const over = (...ps: Paint[]): Paint => (x, y) => { for (const p of ps) { const c = p(x, y); if (c) return c; } return null; };
const bare = frameOf(image(), LMS), eyeW = Math.hypot(P(LM.eyeA.outer).x - P(LM.eyeA.inner).x, P(LM.eyeA.outer).y - P(LM.eyeA.inner).y);
/** 눈꼬리에서 눈 축 기준 deg 도 위로 len(눈 폭 비율) 만큼, 굵기 2px 의 선 */
const tail = (side: "R" | "L", len: number, deg = 15, ink: Rgb = [30, 25, 28]): Paint => {
  const e = side === "R" ? LM.eyeA : LM.eyeB, o = P(e.outer), i = P(e.inner), ax = { x: (o.x - i.x) / eyeW, y: (o.y - i.y) / eyeW }, r = (deg * Math.PI) / 180;
  const up = ax.x > 0 ? { x: ax.y, y: -ax.x } : { x: -ax.y, y: ax.x }, d = { x: ax.x * Math.cos(r) + up.x * Math.sin(r), y: ax.y * Math.cos(r) + up.y * Math.sin(r) };
  return (x, y) => { const px = x - o.x, py = y - o.y, u = px * d.x + py * d.y, v = Math.abs(-px * d.y + py * d.x); return u >= 0 && u <= len * eyeW && v <= 1 ? ink : null; };
};

describe("겹치는 그림에서 라이너 꼬리 끝 (ridgeTail)", () => {
  it("R1 그린 길이를 눈 폭의 3% 안으로 읽는다 · 안 그렸으면 null", () => {
    expect(ridgeTail(bare, image(), "R")).toBeNull();
    for (const len of [0.15, 0.3]) for (const side of ["R", "L"] as const) expect(Math.abs(ridgeTail(bare, image(tail(side, len)), side)! - len)).toBeLessThan(0.03);
    expect(ridgeTail(bare, image(tail("R", 0.3)), "L")).toBeNull();   // 한쪽만 그렸으면 다른 쪽은 없다
  });

  it("R2 넓은 그늘은 꼬리가 아니다 — 모델이 그리는 눈꼬리 바깥의 섀도우 띠", () => {
    const o = P(LM.eyeA.outer), shade: Paint = (x, y) => (Math.hypot(x - (o.x - 0.2 * eyeW), y - (o.y - 0.05 * eyeW)) < 0.14 * eyeW ? [170, 125, 105] : null);
    expect(ridgeTail(bare, image(shade), "R")).toBeNull();
    // 그늘 위에 그린 꼬리는 읽는다
    expect(Math.abs(ridgeTail(bare, image(over(tail("R", 0.3), shade)), "R")! - 0.3)).toBeLessThan(0.04);
  });

  it("R3 시작점이 눈꼬리 얼굴 점에서 조금 벗어나 있어도 끝을 읽는다 — 얼굴 점이 실제 눈꼬리보다 안쪽일 수 있다", () => {
    const moved: Paint = (x, y) => tail("R", 0.25)(x + 0.06 * eyeW, y - 0.03 * eyeW);   // 꼬리 전체를 바깥 · 아래로 옮긴 것
    const t = ridgeTail(bare, image(moved), "R")!;
    expect(t).toBeGreaterThan(0.25);
    expect(t).toBeLessThan(0.36);
  });

  it("R4 맨얼굴과 크기가 다른 그림은 재지 않는다 (겹친다는 전제가 깨졌다)", () => {
    const im = image();
    expect(ridgeTail(bare, { data: im.data, w: im.w, h: im.h - 10 }, "R")).toBeNull();
  });
});

describe("사진에서 재서 문장까지 (feedbackWhole)", () => {
  const target = image(over(lips(0.6), tail("R", 0.3), tail("L", 0.3)));
  const say = (cur: Paint, moved?: Paint) => Object.fromEntries(feedbackWhole({ bare, target, cur: frameOf(image(cur), LMS), ...(moved ? { moved: image(moved) } : {}) }).parts.map((p) => [p.part, p]));

  it("F1 입술: 정답대로 → 비슷해요 · 안 바름 → 내 화장에서 변화를 찾지 못했어요 · 아랫입술만 → 윗입술이 비었어요", () => {
    expect(say(lips(0.6)).lip!.line).toBe("정답과 비슷해요");
    expect(say(() => null).lip!.line).toBe("내 화장에서 변화를 찾지 못했어요");
    const mid = (P(61).y + P(291).y) / 2;
    expect(say((x, y) => (y > mid ? lips(0.6)(x, y) : null)).lip!.line).toBe("윗입술이 비었어요");
  });

  it("F2 정답 그림이 안 건드린 부위는 '정답 화장에서 변화를 찾지 못했어요'", () => {
    const r = say(lips(0.6));
    for (const part of ["brow", "shadow"]) expect(r[part]!.line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(r.cheek).toBeUndefined();   // 볼은 아직 재지 않는다 — 줄을 내지 않는다
  });

  it("F3 라이너는 옮긴 그림이 있어야 본다 — 없으면 볼 수 없었어요, 있으면 길이를 정답과 견준다", () => {
    expect(say(lips(0.6)).liner!.line).toBe("이번에는 볼 수 없었어요");
    expect(say(lips(0.6), over(tail("R", 0.3), tail("L", 0.3))).liner!.line).toBe("정답과 비슷해요");
    expect(say(lips(0.6), over(tail("R", 0.15), tail("L", 0.15))).liner!.line).toBe("꼬리가 정답보다 짧아요");
    expect(say(lips(0.6), tail("R", 0.3)).liner!.line).toBe("왼쪽 눈에 꼬리가 없어요");
    expect(say(lips(0.6), () => null).liner!.line).toBe("내 화장에서 꼬리를 찾지 못했어요");
  });

  it("F4 사진 조건이 다르면 재지 않고 다시 찍어 달라고 한다", () => {
    const r = feedbackWhole({ bare, target, cur: frameOf(image(lips(0.6), 0.75), LMS) });
    expect(r.blocked).toMatch(/밝기/);
    expect(r.parts).toEqual([]);
  });

  it("F5 measureWhole 은 정답 그림의 얼굴 점으로 맨얼굴 것을 쓴다 (겹치는 그림)", () => {
    const m = measureWhole({ bare, target, cur: frameOf(image(lips(0.6)), LMS) });
    expect(m.lip!.amount).toBeCloseTo(1, 1);
    expect(m.liner).toBeUndefined();
  });
});
