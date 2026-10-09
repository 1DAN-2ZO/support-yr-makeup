// 화면 4 부위 가이드 재료 모으기 (모듈 ⑥) — 세션의 맨얼굴 · 정답사진을 풀어 core/guide-run 에 넣고 화면이 그릴 것을 돌려준다
import { describe, expect, it, vi } from "vitest";
import type { RgbaImage } from "@core/color";
import { FACE_OVAL } from "@core/makeup-extract";
import type { Baseline, Pt } from "@core/types";
import { GUIDE_DECODE_SIDE, createGuideKeeper, drawGuidePage, loadPartGuide, type GuideLoad, type GuidePicture, type GuideView } from "@screens/guide-source";
import { BARE, LMS as SYNTH, image, lipPaint } from "./helpers/synth-face";

const LMS: Pt[] = SYNTH.map((q) => ({ ...q }));
FACE_OVAL.forEach((id, k) => {
  const t = -Math.PI / 2 + (k * 2 * Math.PI) / FACE_OVAL.length;
  LMS[id] = { x: 300 + 200 * Math.cos(t), y: 300 + 220 * Math.sin(t) };
});

const bareBlob = new Blob(["bare"]), answerBlob = new Blob(["answer"]);
const baseline = (lm: Pt[] = LMS, w = 600, h = 600): Baseline =>
  ({ lm, unit: { eye: 90, lip: 120, face: 400 }, foreheadL: 70, scleraLab: null, faceShape: "oval", bareImage: bareBlob, w, h }) as unknown as Baseline;
const pictures = new Map<Blob, RgbaImage>([[bareBlob, BARE.im], [answerBlob, image(lipPaint)]]);
const toRgba = vi.fn(async (b: Blob | ImageBitmap, _maxSide?: number) => pictures.get(b as Blob)!);
const picture = (): GuidePicture => ({ width: 600, height: 600, close: vi.fn() }) as unknown as GuidePicture;
const deps = (over: Partial<Parameters<typeof loadPartGuide>[0]> = {}) => ({
  getBaseline: () => baseline(), getAnswer: () => ({ image: answerBlob }), toRgba, toPicture: async () => picture(), ...over,
});

describe("부위 가이드 재료 모으기", () => {
  it("GS1 맨얼굴이나 정답사진이 없으면 무엇이 없는지 알린다 — 사진을 풀지 않는다", async () => {
    toRgba.mockClear();
    expect(await loadPartGuide(deps({ getBaseline: () => null }))).toEqual({ ok: false, missing: "bare" });
    expect(await loadPartGuide(deps({ getAnswer: () => null }))).toEqual({ ok: false, missing: "answer" });
    expect(toRgba).not.toHaveBeenCalled();
  });

  it("GS2 맨얼굴 · 정답사진을 같은 크기로 줄여서 풀고, 부위별 재료와 정답사진 그림을 돌려준다", async () => {
    toRgba.mockClear();
    const r = await loadPartGuide(deps());
    if (!r.ok) throw new Error(r.missing);
    // 원본(2160×3840)을 그대로 풀면 폰에서 느리다 — 둘 다 같은 한도로 줄인다
    expect(toRgba.mock.calls.map((c) => c[1])).toEqual([GUIDE_DECODE_SIDE, GUIDE_DECODE_SIDE]);
    expect(r.view.found).toEqual(["lip"]);
    expect(r.view.size).toEqual({ w: 600, h: 600 });
    expect(r.view.picture.width).toBe(600);
  });

  it("GS3 얼굴 점은 촬영 크기 좌표다 — 푼 그림 크기에 맞춰 옮긴다", async () => {
    // 촬영 크기가 1200×1200 (점도 두 배 좌표), 푼 그림은 600×600
    const big = LMS.map((q) => ({ x: q.x * 2, y: q.y * 2 }));
    const r = await loadPartGuide(deps({ getBaseline: () => baseline(big, 1200, 1200) }));
    if (!r.ok) throw new Error(r.missing);
    expect(r.view.found).toEqual(["lip"]);
    // 입술 자를 자리가 푼 그림(600) 안의 입술 근처다 — 점을 안 옮겼으면 두 배 자리(그림 밖)로 간다
    const c = r.view.pages.lip.crop;
    expect(c.x + c.w / 2).toBeCloseTo(300, -1);
    expect(c.y + c.h / 2).toBeCloseTo(420, -1);
  });

  it("GS4 정답사진이 맨얼굴과 크기가 다르면 만들지 않는다 — 그림도 붙들지 않는다", async () => {
    const close = vi.fn();
    const wrong = new Blob(["wrong"]);
    pictures.set(wrong, { data: new Uint8ClampedArray(300 * 300 * 4), w: 300, h: 300 });
    const r = await loadPartGuide(deps({ getAnswer: () => ({ image: wrong }), toPicture: async () => ({ width: 300, height: 300, close }) as unknown as GuidePicture }));
    expect(r).toEqual({ ok: false, missing: "answer_size" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("GS5 다 쓰면 붙들고 있던 정답사진 그림을 놓는다", async () => {
    const pic = picture();
    const r = await loadPartGuide(deps({ toPicture: async () => pic }));
    if (!r.ok) throw new Error(r.missing);
    r.view.dispose();
    expect(pic.close).toHaveBeenCalledTimes(1);
  });

  describe("만든 것 보관 — 부위를 넘길 때마다 다시 만들지 않는다", () => {
    const okLoad = () => {
      const dispose = vi.fn();
      const r: GuideLoad = { ok: true, view: { dispose } as unknown as GuideView };
      return { r, dispose };
    };

    it("GS6 같은 정답사진이면 한 번만 만든다", async () => {
      const { r } = okLoad();
      const load = vi.fn(async () => r);
      const keeper = createGuideKeeper({ getBaseline: () => baseline(), getAnswer: () => ({ image: answerBlob }) }, load);
      expect(await keeper.get()).toBe(r);
      expect(await keeper.get()).toBe(r);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("GS7 정답사진이 바뀌면 앞의 것을 놓고 새로 만든다 — 옛 정답사진의 가이드가 남지 않게", async () => {
      const a = okLoad(), b = okLoad();
      let answer = answerBlob;
      const load = vi.fn().mockResolvedValueOnce(a.r).mockResolvedValueOnce(b.r);
      const keeper = createGuideKeeper({ getBaseline: () => baseline(), getAnswer: () => ({ image: answer }) }, load);
      expect(await keeper.get()).toBe(a.r);
      answer = new Blob(["다른 정답사진"]);
      expect(await keeper.get()).toBe(b.r);
      await Promise.resolve();
      expect(a.dispose).toHaveBeenCalledTimes(1);
      expect(b.dispose).not.toHaveBeenCalled();
    });

    it("GS8 정답사진이 없어지면(끝내기 · 맨얼굴 다시 찍기) 앞의 것을 놓고 '없음' 으로 답한다", async () => {
      const a = okLoad();
      let answer: Blob | null = answerBlob;
      const load = vi.fn(async (): Promise<GuideLoad> => (answer ? a.r : { ok: false, missing: "answer" }));
      const keeper = createGuideKeeper({ getBaseline: () => baseline(), getAnswer: () => (answer ? { image: answer } : null) }, load);
      await keeper.get();
      answer = null;
      expect(await keeper.get()).toEqual({ ok: false, missing: "answer" });
      await Promise.resolve();
      expect(a.dispose).toHaveBeenCalledTimes(1);
    });

    it("GS9 못 만든 것은 보관하지 않는다 — 다음에 다시 해 본다", async () => {
      const { r } = okLoad();
      const load = vi.fn().mockResolvedValueOnce({ ok: false, missing: "answer_size" }).mockResolvedValueOnce(r);
      const keeper = createGuideKeeper({ getBaseline: () => baseline(), getAnswer: () => ({ image: answerBlob }) }, load);
      expect(await keeper.get()).toEqual({ ok: false, missing: "answer_size" });
      expect(await keeper.get()).toBe(r);
    });

    it("GS10 drop 하면 놓는다 — 다음에는 새로 만든다", async () => {
      const a = okLoad(), b = okLoad();
      const load = vi.fn().mockResolvedValueOnce(a.r).mockResolvedValueOnce(b.r);
      const keeper = createGuideKeeper({ getBaseline: () => baseline(), getAnswer: () => ({ image: answerBlob }) }, load);
      await keeper.get();
      keeper.drop();
      await Promise.resolve();
      expect(a.dispose).toHaveBeenCalledTimes(1);
      expect(await keeper.get()).toBe(b.r);
    });
  });

  it("GS11 블러셔 페이지에는 테두리 위에 퍼지는 방향(점 + 화살표)을 그린다 — 자른 자리 기준으로 옮겨서 (사용자 2026-10-09)", () => {
    const calls: string[] = [];
    const g = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) { return k in t ? t[k] : (...a: unknown[]) => { calls.push(`${k}(${a.map(String).join(",")})`); }; },
      set(t, k: string, v) { t[k] = v; calls.push(`${k}=${String(v)}`); return true; },
    }) as unknown as CanvasRenderingContext2D;
    const out = { width: 0, height: 0, getContext: () => g } as unknown as HTMLCanvasElement;
    const crop = { x: 100, y: 200, w: 200, h: 100 };
    const page = { part: "cheek" as const, crop, polys: [{ part: "cheek" as const, poly: [{ x: 150, y: 220 }, { x: 250, y: 220 }, { x: 200, y: 280 }] }],
      marks: { dots: [{ x: 200, y: 250 }], arrows: [[{ x: 210, y: 250 }, { x: 240, y: 250 }]] } };
    const view = { pages: { cheek: page } as unknown as GuideView["pages"], size: { w: 600, h: 600 }, picture: picture() };
    expect(drawGuidePage(out, view, "cheek", 400)).toBe(true);
    // 400 / 200 = 2 배 — 점 (200, 250) → (200, 100), 화살표 끝 (240, 250) → (280, 100)
    expect(calls.some((c) => c.startsWith("arc(200,100,")), "가운데 점").toBe(true);
    expect(calls, "화살표 끝").toContain("lineTo(280,100)");
  });
});
