// 새 흐름 화면 6 — 사진에서 재서 문장까지 (feedbackWhole) · 겹치는 그림에서 라이너 꼬리 끝 찾기 (ridgeTail)
import { describe, expect, it } from "vitest";
import { pointInPoly } from "@core/color";
import { browTail, feedbackWhole, measureWhole, ridgeTail } from "@core/feedback-measure";
import { composeFeedback, type WholeMeasures } from "@core/feedback-whole";
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

  it("F1b 입꼬리 옆으로 번지게 바르면 그쪽을 짚는다 — 둘레 띠 전체 평균으로는 묽어져 안 보였다 (실험 42)", () => {
    const c = P(61), o = P(291), w = Math.hypot(c.x - o.x, c.y - o.y), ax = (c.x - o.x) / w, ay = (c.y - o.y) / w;
    const smear: Paint = (x, y) => { const u = ((x - c.x) * ax + (y - c.y) * ay) / w, v = (-(x - c.x) * ay + (y - c.y) * ax) / w; return u > 0 && u < 0.2 && Math.abs(v) < 0.1 ? tint(RED, 0.6) : null; };
    expect(say(over(lips(0.6), smear)).lip!.line).toBe("오른쪽 입꼬리 옆으로 번졌어요");
    expect(measureWhole({ bare, target, cur: frameOf(image(lips(0.6)), LMS) }).lip!.sideR).toBeCloseTo(0, 1);
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

describe("눈썹 꼬리 끝 (browTail) — 머리카락 분할이 있어야 잰다", () => {
  const browPolys = [LM.browA, LM.browB].map((b) => [...b.upper.map(P), ...b.lower.map(P).reverse()]);
  const brows: Paint = (x, y) => (browPolys.some((p) => pointInPoly(x, y, p)) ? [80, 55, 45] : null);
  /** 눈썹 꼬리를 눈썹 길이의 ext 배만큼 늘린 것 (머리 → 꼬리 축을 따라 뾰족하게) */
  const longer = (side: "R" | "L", ext: number): Paint => {
    const b = side === "R" ? LM.browA : LM.browB, mid = (i: number, j: number) => ({ x: (P(i).x + P(j).x) / 2, y: (P(i).y + P(j).y) / 2 });
    const h = mid(b.upper[b.upper.length - 1]!, b.lower[b.lower.length - 1]!), t = mid(b.upper[0]!, b.lower[0]!), len = Math.hypot(t.x - h.x, t.y - h.y);
    const tri = [P(b.upper[0]!), P(b.lower[0]!), { x: t.x + ((t.x - h.x) / len) * len * ext, y: t.y + ((t.y - h.y) / len) * len * ext }];
    return (x, y) => (pointInPoly(x, y, tri) ? [80, 55, 45] : null);
  };
  const noHair = { w: 8, h: 8, data: new Float32Array(64) };
  const fr = (p: Paint, hair = noHair) => frameOf(image(p), LMS, hair);

  it("T1 원래 눈썹의 끝은 얼굴 점의 꼬리 근처 (1) · 늘리면 그만큼 길게 읽는다", () => {
    for (const side of ["R", "L"] as const) {
      const base = browTail(fr(brows), side)!;
      expect(Math.abs(base - 1)).toBeLessThan(0.12);
      expect(browTail(fr(over(brows, longer(side, 0.3))), side)! - base).toBeGreaterThan(0.15);
    }
  });

  it("T2 머리카락 분할이 없으면 재지 않는다 (null) — 관자놀이 머리카락까지 이어 읽기 때문", () => {
    expect(browTail(frameOf(image(brows), LMS), "R")).toBeNull();
  });

  it("T3 머리카락 칸에서 멈춘다", () => {
    // 꼬리 바깥을 전부 머리카락으로 표시하면 늘린 꼬리를 따라가지 않는다
    const tailX = P(LM.browA.upper[0]!).x, W8 = 600, hair = { w: W8, h: 1, data: Float32Array.from({ length: W8 }, (_, x) => (x < tailX - 4 ? 1 : 0)) };
    const withHair = fr(over(brows, longer("R", 0.3)), hair), base = browTail(fr(brows, hair), "R")!;
    expect(browTail(withHair, "R")! - base).toBeLessThan(0.08);
  });

  it("T4 문장: 정답이 꼬리를 늘렸는데 안 늘렸으면 '눈썹 꼬리가 짧아요' · 정답이 안 늘렸으면 말하지 않는다", () => {
    const base = { target: 13, amountR: 0.9, amountL: 0.9, below: 0.1, belowTarget: 0.1 };
    const line = (brow: NonNullable<WholeMeasures["brow"]>) => composeFeedback({ brow }).parts.find((p) => p.part === "brow")!;
    expect(line({ ...base, tailTargetR: 0.2, tailTargetL: 0.2, tailR: 0.0, tailL: 0.02 }).line).toBe("눈썹 꼬리가 정답보다 짧아요");
    expect(line({ ...base, tailTargetR: 0.2, tailTargetL: 0.2, tailR: 0.2, tailL: 0.02 }).line).toBe("왼쪽 눈썹 꼬리가 정답보다 짧아요");
    expect(line({ ...base, tailTargetR: 0.2, tailTargetL: 0.2, tailR: 0.18, tailL: 0.22 }).line).toBe("정답과 비슷해요");
    expect(line({ ...base, tailTargetR: 0.02, tailTargetL: 0.0, tailR: 0.25, tailL: 0.25 }).line).toBe("눈썹 꼬리가 정답보다 길어요");
    expect(line({ ...base, tailTargetR: 0.02, tailTargetL: 0.0, tailR: 0.05, tailL: 0.04 }).line).toBe("정답과 비슷해요");
  });
});

describe("정답사진의 맨얼굴이 따로 있을 때 (targetBare)", () => {
  // 정답사진은 다른 촬영에서 만들어졌다: 그 촬영의 맨얼굴은 입술이 원래 더 붉게 찍혔다(0.4). 정답은 거기에 0.2 만큼 더 바른 것(0.6)
  const tBare = frameOf(image(lips(0.4)), LMS), target = image(lips(0.6));
  const lipLine = (cur: Paint, withBare: boolean) => feedbackWhole({ bare, target, cur: frameOf(image(cur), LMS), ...(withBare ? { targetBare: tBare } : {}) }).parts.find((p) => p.part === "lip")!;

  it("B1 정답의 변화는 정답의 맨얼굴과, 내 화장의 변화는 내 맨얼굴과 견준다", () => {
    // 내 맨얼굴(입술 0)에 0.2 만큼 발랐다 = 정답이 바른 만큼
    expect(measureWhole({ bare, target, targetBare: tBare, cur: frameOf(image(lips(0.2)), LMS) }).lip!.amount).toBeCloseTo(1, 0);
    // 정답의 맨얼굴을 안 주면 두 촬영의 차(0.4)가 정답의 변화에 섞여 3배로 읽히고, 같은 화장이 옅게 나온다
    expect(measureWhole({ bare, target, cur: frameOf(image(lips(0.2)), LMS) }).lip!.amount).toBeLessThan(0.5);
    expect(lipLine(() => null, true).tone).not.toBe("ok");
  });

  it("B2 정답 그림의 꼬리도 정답의 맨얼굴과 견줘 읽는다", () => {
    // 정답의 맨얼굴에 원래 있는 선(주름)은 꼬리가 아니다
    const crease = tail("R", 0.2, -20, [150, 110, 95]), tb = frameOf(image(over(crease, lips(0.4))), LMS), t2 = image(over(crease, lips(0.6), tail("L", 0.3)));
    const m = measureWhole({ bare, target: t2, targetBare: tb, cur: frameOf(image(lips(0.2)), LMS), moved: image(tail("L", 0.3)) });
    expect(m.liner!.targetR).toBeNull();
    expect(Math.abs(m.liner!.targetL! - 0.3)).toBeLessThan(0.03);
    expect(measureWhole({ bare, target: t2, cur: frameOf(image(lips(0.2)), LMS), moved: image(tail("L", 0.3)) }).liner!.targetR).not.toBeNull();   // 안 주면 주름을 꼬리로 읽는다
  });

  it("B3 안 주면 내 맨얼굴과 겹친다고 본다 (지금까지와 같다)", () => {
    expect(feedbackWhole({ bare, target: image(lips(0.6)), cur: frameOf(image(lips(0.6)), LMS) }).parts.find((p) => p.part === "lip")!.line).toBe("정답과 비슷해요");
  });
});

describe("문턱은 부위마다 · 여러 장은 가운데 값으로 (실험 41)", () => {
  it("M1 정답 변화가 작을 때의 문턱이 부위마다 다르다 — 입술 5 · 섀도우 3.5 · 눈썹 6", () => {
    const line = (m: WholeMeasures, part: string) => composeFeedback(m).parts.find((p) => p.part === part)!;
    const lip = { target: 7, amount: 1, out: 0, outTarget: 0, upper: 1, lower: 1 }, shadow = { target: 4.5, amountR: 0.9, amountL: 0.9, higher: false, outer: 1, outerTarget: 1 };
    const brow = { target: 4.2, amountR: 0.9, amountL: 0.9, below: 0, belowTarget: 0 };
    expect(line({ lip }, "lip").line).toBe("정답과 비슷해요");
    expect(line({ lip: { ...lip, target: 4 } }, "lip").line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(line({ shadow }, "shadow").line).toBe("정답과 비슷해요");
    expect(line({ shadow: { ...shadow, target: 3 } }, "shadow").line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(line({ brow }, "brow").line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(line({ brow: { ...brow, target: 7 } }, "brow").line).toBe("정답과 비슷해요");
  });

  it("M2 여러 장을 주면 값마다 가운데 값으로 판정한다 — 한두 장이 튀어도 문장이 안 바뀐다", () => {
    const mid = (P(61).y + P(291).y) / 2, target = image(lips(0.6));
    // 다섯 장 중 두 장은 입술이 반쯤 지워진 것처럼 찍혔다
    const curs = [lips(0.6), lips(0.6), lips(0.6), (x: number, y: number) => (y > mid ? lips(0.6)(x, y) : null), () => null].map((p) => frameOf(image(p as Paint), LMS));
    const r = feedbackWhole({ bare, target, cur: curs }, true).parts.find((p) => p.part === "lip")!;
    expect(r.line).toBe("정답과 비슷해요");
    expect(feedbackWhole({ bare, target, cur: curs[4]! }, true).parts.find((p) => p.part === "lip")!.line).toBe("내 화장에서 변화를 찾지 못했어요");
  });

  it("M3 사진 조건은 여러 장 중 절반 넘게 걸릴 때만 막는다", () => {
    const target = image(lips(0.6)), ok = frameOf(image(lips(0.6)), LMS), dark = frameOf(image(lips(0.6), 0.45), LMS);
    expect(feedbackWhole({ bare, target, cur: [ok, ok, dark] }).blocked).toBeUndefined();
    expect(feedbackWhole({ bare, target, cur: [ok, dark, dark] }).blocked).toMatch(/밝기/);
  });
});
