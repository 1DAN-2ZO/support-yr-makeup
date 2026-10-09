// @vitest-environment jsdom
// 화면 6 피드백 잇기 (⑥, #332) — 세션의 사진을 풀어 runFeedback 에 넣고, 화면이 그릴 것(사진 주소 · 문장)을 만든다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pointInPoly, type RgbaImage } from "@core/color";
import { LM } from "@core/landmarks";
import type { Baseline } from "@core/types";
import type { AttemptShot, AttemptShots } from "@screens/attempt";
import { ATTEMPT_DECODE_SIDE, loadFeedback, type FeedbackSourceDeps } from "@screens/feedback-source";
import { LMS, P, RED, SKIN, image, type Paint, type Rgb } from "./helpers/synth-face";

const lipPoly = LM.lipsOuter.map(P);
const tint = (c: Rgb, k: number): Rgb => SKIN.map((s, i) => Math.round(s + (c[i]! - s) * k)) as unknown as Rgb;
const lips = (k: number): Paint => (x, y) => (pointInPoly(x, y, lipPoly) ? tint(RED, k) : null);

// 사진(Blob)마다 풀면 나올 그림을 짝지어 둔다 — 진짜 풀기는 브라우저가 한다
const pictures = new Map<Blob, RgbaImage>();
const photo = (p?: Paint): Blob => { const b = new Blob([`p${pictures.size}`]); pictures.set(b, image(p)); return b; };
// 풀 때마다 어느 사진을 · 얼마로 줄여서 · 동시에 몇 장을 풀고 있었는지 적어 둔다
let decoding = 0, maxDecoding = 0, sides: [Blob, number | undefined][] = [];
const toRgba = vi.fn(async (b: Blob | ImageBitmap, maxSide?: number): Promise<RgbaImage> => {
  sides.push([b as Blob, maxSide]);
  maxDecoding = Math.max(maxDecoding, ++decoding);
  await Promise.resolve();
  decoding--;
  return pictures.get(b as Blob)!;
});

const W = image().w, H = image().h;
const baseline = (bare: Blob | null, over: Partial<Baseline> = {}): Baseline => ({
  lm: LMS, unit: { eye: 1, lip: 1, face: 1 }, foreheadL: 60, scleraLab: null, faceShape: { label: "oval", confidence: 0, method: "rule", version: "t" },
  bareImage: bare, w: W, h: H, expression: null, ...over,
});
const tries = (...open: Blob[]): AttemptShots => {
  const s = (blob: Blob): AttemptShot => ({ blob, lm: LMS, w: W, h: H });
  return { front_open: open.map(s) };
};

let urls: string[] = [], revoked: string[] = [];
const deps = (over: Partial<FeedbackSourceDeps> = {}): FeedbackSourceDeps => ({
  getBaseline: () => baseline(photo()),
  getAttempt: () => tries(photo(lips(0.6))),
  getAnswer: () => ({ image: photo(lips(0.6)) }),
  toRgba,
  ...over,
});

beforeEach(() => {
  pictures.clear(); toRgba.mockClear(); urls = []; revoked = []; decoding = 0; maxDecoding = 0; sides = [];
  Object.assign(URL, { createObjectURL: () => { const u = `blob:f${urls.length}`; urls.push(u); return u; }, revokeObjectURL: (u: string) => { revoked.push(u); } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("피드백 재료 모으기 (loadFeedback)", () => {
  it("FS1 다 있으면 문장 · 정답사진 주소 · 시도사진 주소 · 걸린 시간 · 본 장 수", async () => {
    const r = await loadFeedback(deps());
    if (!r.ok) throw new Error(r.missing);
    expect(r.view.feedback.parts.find((p) => p.part === "lip")?.line).toBe("예상 메이크업과 비슷해요");
    expect([r.view.answerUrl, r.view.attemptUrl]).toEqual(urls);
    expect(urls).toHaveLength(2);
    expect(r.view.frames).toBe(1);
    expect(r.view.ms).toBeGreaterThanOrEqual(0);
  });

  it("FS2 다 본 뒤 dispose 하면 사진 주소를 돌려준다", async () => {
    const r = await loadFeedback(deps());
    if (!r.ok) throw new Error(r.missing);
    r.view.dispose();
    expect(revoked).toEqual(urls);
  });

  it("FS3 없는 것이 있으면 사진을 풀지도 않고 무엇이 없는지만 — 주소도 안 만든다", async () => {
    expect(await loadFeedback(deps({ getAnswer: () => null }))).toEqual({ ok: false, missing: "answer" });
    expect(await loadFeedback(deps({ getAttempt: () => null }))).toEqual({ ok: false, missing: "attempt" });
    expect(await loadFeedback(deps({ getBaseline: () => null }))).toEqual({ ok: false, missing: "bare" });
    expect(await loadFeedback(deps({ getBaseline: () => baseline(null) }))).toEqual({ ok: false, missing: "bare" });
    expect(toRgba).not.toHaveBeenCalled();
    expect(urls).toEqual([]);
  });

  it("FS4 시도사진 눈 뜬 묶음 전부를 넣는다 — 감은 장은 안 넣는다", async () => {
    const open = [photo(lips(0.6)), photo(lips(0.6)), photo(), photo(lips(0.6)), photo(lips(0.6))];
    const r = await loadFeedback(deps({ getAttempt: () => tries(...open) }));
    if (!r.ok) throw new Error(r.missing);
    expect(r.view.frames).toBe(5);
    expect(toRgba).toHaveBeenCalledTimes(1 + 1 + 5);   // 맨얼굴 · 예상 메이크업 · 시도 5장
    expect(r.view.feedback.parts.find((p) => p.part === "lip")?.line).toBe("예상 메이크업과 비슷해요");
  });

  it("FS5 얼굴 점은 촬영 크기 좌표다 — 사진이 그보다 작게 저장돼 있으면 사진 크기로 맞춰 잰다 (예전 세션의 줄인 맨얼굴, #240)", async () => {
    // 촬영 크기를 두 배로 적어 둔 맨얼굴 · 시도사진: 점을 절반으로 줄여야 사진과 맞는다
    const big = LMS.map((p) => ({ x: p.x * 2, y: p.y * 2 }));
    const r = await loadFeedback(deps({
      getBaseline: () => baseline(photo(), { lm: big, w: W * 2, h: H * 2 }),
      getAttempt: () => ({ front_open: [{ blob: photo(lips(0.6)), lm: big, w: W * 2, h: H * 2 }] }),
    }));
    if (!r.ok) throw new Error(r.missing);
    expect(r.view.feedback.parts.find((p) => p.part === "lip")?.line).toBe("예상 메이크업과 비슷해요");
  });

  it("FS6 정답사진이 맨얼굴과 크기가 다르면 판정하지 않고, 만든 주소가 없다", async () => {
    const im = image(lips(0.6)), small = new Blob(["s"]);
    pictures.set(small, { data: im.data, w: im.w, h: im.h - 10 });
    expect(await loadFeedback(deps({ getAnswer: () => ({ image: small }) }))).toEqual({ ok: false, missing: "answer_size" });
    expect(urls.length).toBe(revoked.length);
  });

  it("FS7 옮긴 그림을 주면 같이 넣고, 받다가 실패하면 없는 것으로 치고 나머지는 판정한다", async () => {
    const withMoved = await loadFeedback(deps({ getMoved: async () => photo(lips(0.6)) }));
    if (!withMoved.ok) throw new Error(withMoved.missing);
    expect(toRgba).toHaveBeenCalledTimes(4);
    const failed = await loadFeedback(deps({ getMoved: async () => { throw new Error("server"); } }));
    if (!failed.ok) throw new Error(failed.missing);
    expect(failed.view.feedback.parts.find((p) => p.part === "lip")?.line).toBe("예상 메이크업과 비슷해요");
    expect(failed.view.movedFailed).toBe(true);
    expect(withMoved.view.movedFailed).toBe(false);
  });

  it("FS8 시도사진 묶음은 긴 변 1920 으로 줄여서 푼다 — 맨얼굴 · 정답사진 · 옮긴 그림은 서로 같은 크기여야 해서 안 줄인다 (#336 ③ 리뷰: 원본 다섯 장은 폰 메모리에 무겁다)", async () => {
    expect(ATTEMPT_DECODE_SIDE).toBe(1920);
    const bare = photo(), answer = photo(lips(0.6)), moved = photo(lips(0.6));
    const open = [photo(lips(0.6)), photo(lips(0.6)), photo(lips(0.6))];
    const r = await loadFeedback(deps({ getBaseline: () => baseline(bare), getAnswer: () => ({ image: answer }), getMoved: async () => moved, getAttempt: () => tries(...open) }));
    expect(r.ok).toBe(true);
    const sideOf = (b: Blob) => sides.find(([x]) => x === b)![1];
    expect(open.map(sideOf)).toEqual([1920, 1920, 1920]);
    expect([bare, answer, moved].map(sideOf)).toEqual([undefined, undefined, undefined]);
  });

  it("FS9 사진은 한 장씩 푼다 — 한꺼번에 풀면 원본 크기 여러 장이 메모리에 같이 올라간다", async () => {
    const open = [photo(lips(0.6)), photo(lips(0.6)), photo(lips(0.6)), photo(lips(0.6)), photo(lips(0.6))];
    const r = await loadFeedback(deps({ getAttempt: () => tries(...open), getMoved: async () => photo(lips(0.6)) }));
    expect(r.ok).toBe(true);
    expect(toRgba).toHaveBeenCalledTimes(8);
    expect(maxDecoding).toBe(1);
  });
});
