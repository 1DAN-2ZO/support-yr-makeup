// 룩 옮기기 2·3단계 — 화장만 떼기 · 입히기 (core/look-extract.ts)
import { describe, expect, it } from "vitest";
import { pointInPoly, rgbToLab } from "@core/color";
import type { RgbaImage } from "@core/color";
import { LM } from "@core/landmarks";
import { applyMakeup, blur, extractMakeup, labToRgb, makeupPreview, matchLook, partChange, pasteRegions } from "@core/look-extract";
import type { Pt } from "@core/types";
import { H, W, faceLandmarks } from "./helpers/synth-face";
import type { Rgb } from "./helpers/synth-face";

// 립스틱은 옮긴 뒤에도 화면이 낼 수 있는 색이 되게 고른 값 — 더 진한 빨강은 sRGB 밖이라 잘려서 숫자가 안 맞는다
const MY_SKIN: Rgb = [224, 172, 140], REF_SKIN: Rgb = [246, 214, 200], LIPSTICK: Rgb = [205, 110, 120], IRIS: Rgb = [40, 60, 90];

/** 합성 얼굴 점에 아랫눈꺼풀을 더한다 — 눈 뜬 틈이 제대로 닫힌 다각형이 되게 */
function landmarks(): Pt[] {
  const lm = faceLandmarks();
  const lower = (x0: number, x1: number): Pt[] => Array.from({ length: 9 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 8, y: 250 + 12 * Math.sin((Math.PI * i) / 8), z: 0 }));
  LM.eyeA.lower.forEach((id, i) => { lm[id] = lower(170, 260)[i]!; });
  LM.eyeB.lower.forEach((id, i) => { lm[id] = lower(430, 340)[i]!; });
  return lm;
}
const LMS = landmarks();
const lipPoly = LM.lipsOuter.map((i) => LMS[i]!);

/** 한 색 얼굴에 paint 가 정한 칸만 다른 색 */
function photo(skin: Rgb, paint: (x: number, y: number) => Rgb | null = () => null): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...(paint(x, y) ?? skin), 255], (y * W + x) * 4);
  return { data, w: W, h: H };
}
const rgbAt = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];
const labOf = (c: readonly number[]) => rgbToLab(c[0]!, c[1]!, c[2]!);
const asWarped = (im: RgbaImage) => ({ data: im.data as Uint8ClampedArray, w: im.w, h: im.h });

describe("labToRgb", () => {
  it("rgbToLab 을 되돌린다", () => {
    for (const c of [MY_SKIN, LIPSTICK, [0, 0, 0], [255, 255, 255], [12, 200, 90]] as const) {
      const { L, a, b } = labOf(c);
      labToRgb(L, a, b).forEach((v, k) => expect(v).toBeCloseTo(c[k]!, 0));
    }
  });
});

describe("blur", () => {
  it("전체 합(밝기)을 지키고 한 점을 퍼뜨린다", () => {
    const src = new Float32Array(21 * 21);
    src[10 * 21 + 10] = 1;
    const out = blur(src, 21, 21, 2);
    expect(out.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 4);
    expect(out[10 * 21 + 10]!).toBeLessThan(0.2);
    expect(out[10 * 21 + 12]!).toBeGreaterThan(0);
    expect(src[10 * 21 + 10]).toBe(1);
  });
});

describe("extractMakeup → applyMakeup", () => {
  const bare = photo(MY_SKIN);

  it("화장 사진이 피부만 더 밝고 화장이 없으면 내 얼굴이 그대로다 — 피부색 차이는 화장이 아니다", () => {
    const layer = extractMakeup(bare, asWarped(photo(REF_SKIN)), LMS);
    const out = applyMakeup(bare, layer);
    for (const [x, y] of [[300, 420], [300, 160], [215, 215], [190, 340]] as const) {
      rgbAt(out, x, y).forEach((v, k) => expect(Math.abs(v - MY_SKIN[k]!)).toBeLessThanOrEqual(1));
    }
  });

  it("립스틱은 '화장 사진의 맨살 대비 차이'만큼 내 입술에 옮겨 온다", () => {
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const out = applyMakeup(bare, extractMakeup(bare, asWarped(ref), LMS));
    const got = labOf(rgbAt(out, 300, 425));
    const my = labOf(MY_SKIN), refSkin = labOf(REF_SKIN), lip = labOf(LIPSTICK);
    expect(got.L).toBeCloseTo(my.L + lip.L - refSkin.L, 0);
    expect(got.a).toBeCloseTo(my.a + lip.a - refSkin.a, 0);
    // 이마·코는 건드리지 않는다
    expect(rgbAt(out, 300, 160)).toEqual([...MY_SKIN]);
    expect(rgbAt(out, 300, 300)).toEqual([...MY_SKIN]);
  });

  it("세기 0 이면 그대로, 0.5 면 절반만", () => {
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const layer = extractMakeup(bare, asWarped(ref), LMS);
    expect(rgbAt(applyMakeup(bare, layer, { lip: 0 }), 300, 425)).toEqual([...MY_SKIN]);
    const half = labOf(rgbAt(applyMakeup(bare, layer, { lip: 0.5 }), 300, 425)), full = labOf(rgbAt(applyMakeup(bare, layer), 300, 425));
    expect(half.a - labOf(MY_SKIN).a).toBeCloseTo((full.a - labOf(MY_SKIN).a) / 2, 0);
  });

  it("눈동자는 옮겨 오지 않는다 — 눈 뜬 틈은 화장이 있을 수 없는 곳", () => {
    const eye = LM.eyeA.upper.map((i) => LMS[i]!).concat([...LM.eyeA.lower].reverse().map((i) => LMS[i]!));
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, eye) ? IRIS : null));
    const out = applyMakeup(bare, extractMakeup(bare, asWarped(ref), LMS));
    expect(rgbAt(out, 215, 250)).toEqual([...MY_SKIN]);
  });

  it("화장 사진의 머리카락이 맨살 표본에 섞여도 피부색 기준이 흔들리지 않는다", () => {
    // 이마 절반을 검은 머리카락이 덮은 화장 사진
    const ref = photo(REF_SKIN, (x, y) => (y < 190 && x < 300 ? [20, 15, 12] : pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const out = applyMakeup(bare, extractMakeup(bare, asWarped(ref), LMS));
    const got = labOf(rgbAt(out, 300, 425)), my = labOf(MY_SKIN), refSkin = labOf(REF_SKIN), lip = labOf(LIPSTICK);
    expect(Math.abs(got.L - (my.L + lip.L - refSkin.L))).toBeLessThan(2);
  });

  it("미리보기: 부위 밖은 투명, 입술은 불투명", () => {
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const layer = extractMakeup(bare, asWarped(ref), LMS);
    const pre = makeupPreview(layer);
    const alphaAt = (x: number, y: number): number => pre[((y - layer.y0) * layer.w + (x - layer.x0)) * 4 + 3]!;
    expect(alphaAt(300, 425)).toBeGreaterThan(250);
    expect(alphaAt(300, 160)).toBe(0);
    expect(layer.skinSamples.bare).toBeGreaterThan(1000);
  });

  it("머리카락이 덮은 곳(가림 지도)은 옮기지 않고, 얼마나 뺐는지 알려 준다", () => {
    // 화장 사진의 입술 왼쪽 절반(x < 300)을 검은 머리카락이 덮었다
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? (x < 300 ? [20, 15, 12] : LIPSTICK) : null));
    const without = applyMakeup(bare, extractMakeup(bare, asWarped(ref), LMS));
    expect(labOf(rgbAt(without, 270, 425)).L).toBeLessThan(labOf(MY_SKIN).L - 30);   // 가림 지도가 없으면 머리카락이 화장으로 옮겨 온다

    // 가림 지도는 사진과 크기가 달라도 된다 (절반 크기)
    const occ = { w: W / 2, h: H / 2, data: Float32Array.from({ length: (W / 2) * (H / 2) }, (_, i) => (i % (W / 2) < 150 ? 1 : 0)) };
    const layer = extractMakeup(bare, asWarped(ref), LMS, occ);
    const out = applyMakeup(bare, layer);
    expect(rgbAt(out, 270, 425)).toEqual([...MY_SKIN]);                               // 덮인 쪽은 그대로
    expect(labOf(rgbAt(out, 330, 425)).a).toBeGreaterThan(labOf(MY_SKIN).a + 10);    // 안 덮인 쪽은 립스틱
    expect(layer.hidden.lip).toBeGreaterThan(0.35);
    expect(layer.hidden.lip).toBeLessThan(0.65);
  });

  it("pasteRegions: 다른 그림에서 화장 부위만(또는 얼굴 안쪽만) 붙이고 나머지는 내 사진 그대로", () => {
    const GEN: Rgb = [10, 200, 30];   // 생성 그림은 온통 초록 — 어디가 붙었는지 값으로 안다
    const gen = photo(GEN);
    const layer = extractMakeup(bare, asWarped(photo(REF_SKIN)), LMS);
    // 이 layer 는 화장이 없는 사진에서 뗀 것 — 약한 변화를 버리면(기본) 붙일 곳이 없다
    expect(rgbAt(pasteRegions(bare, gen, layer, "parts"), 300, 425)).toEqual([...MY_SKIN]);
    const parts = pasteRegions(bare, gen, layer, "parts", {}, "keep");
    expect(rgbAt(parts, 300, 425)).toEqual([...GEN]);          // 입술
    expect(rgbAt(parts, 300, 300)).toEqual([...MY_SKIN]);      // 코 — 부위가 아니다
    expect(rgbAt(parts, 215, 250)).toEqual([...MY_SKIN]);      // 눈동자
    expect(rgbAt(pasteRegions(bare, gen, layer, "parts", { lip: 0 }, "keep"), 300, 425)).toEqual([...MY_SKIN]);
    const face = pasteRegions(bare, gen, layer, "face");
    expect(rgbAt(face, 300, 300)).toEqual([...GEN]);           // 얼굴 안쪽은 전부
    expect(rgbAt(face, 215, 250)).toEqual([...MY_SKIN]);       // 눈동자는 뺀다
    expect(rgbAt(face, 5, 5)).toEqual([...MY_SKIN]);           // 얼굴 밖
    expect(() => pasteRegions(bare, { data: new Uint8ClampedArray(4), w: 1, h: 1 }, layer, "face")).toThrow(/크기/);
  });

  it("색이 실제로 바뀐 곳만 화장으로 친다 — 영역 안이라도 안 바뀐 맨살은 떼어 오지 않는다", () => {
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const layer = extractMakeup(bare, asWarped(ref), LMS);
    const at = (x: number, y: number): number => (y - layer.y0) * layer.w + (x - layer.x0);
    // 눈꼬리 바깥(140, 250)은 눈 둘레 "찾아볼 영역" 안이지만 화장이 없다
    expect(layer.parts.eye.mask[at(140, 250)]!).toBeGreaterThan(0.9);
    expect(layer.parts.eye.amount[at(140, 250)]!).toBe(0);
    expect(layer.parts.lip.amount[at(300, 425)]!).toBeCloseTo(1, 3);
    // 미리보기: 기본은 화장 있는 곳만 보이고, "keep" 이면 영역 전체가 보인다 (전에는 늘 이랬다)
    expect(makeupPreview(layer)[at(140, 250) * 4 + 3]).toBe(0);
    expect(makeupPreview(layer, {}, "keep")[at(140, 250) * 4 + 3]!).toBeGreaterThan(200);
    expect(layer.present.lip.lo).toBe(2.5);   // 잡음 없는 합성 사진 — 기본 경계 그대로
  });

  it("맨살 잡음 수준의 약한 변화는 버린다 (기본) — keep 이면 그대로 입힌다", () => {
    const FAINT: Rgb = [246, 211, 199];   // 화장 사진 맨살과 ΔE 2 안쪽
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? FAINT : null));
    const layer = extractMakeup(bare, asWarped(ref), LMS);
    expect(partChange(layer).lip).toBeLessThan(2.5);
    expect(rgbAt(applyMakeup(bare, layer), 300, 425)).toEqual([...MY_SKIN]);
    expect(rgbAt(applyMakeup(bare, layer, {}, "keep"), 300, 425)).not.toEqual([...MY_SKIN]);
  });

  it("가늘고 진한 선은 흐려져 사라지지 않는다 — 눈꼬리 밖 2px 검은 선(라이너 꼬리)이 입힌 뒤에도 어둡다", () => {
    // 눈꼬리(170, 250) 바깥으로 뻗은 가로 2px · 길이 20px 선
    const INK: Rgb = [30, 25, 28];
    const ref = photo(MY_SKIN, (x, y) => (x >= 148 && x <= 168 && (y === 249 || y === 250) ? INK : null));
    const out = applyMakeup(bare, extractMakeup(bare, asWarped(ref), LMS));
    const skinL = labOf(MY_SKIN).L, inkL = labOf(INK).L;
    // 선 위: 원래 차이(약 60)의 대부분이 남는다. 흐리기만 하면 20 도 안 남는다
    expect(skinL - labOf(rgbAt(out, 158, 249)).L).toBeGreaterThan(0.7 * (skinL - inkL));
    // 선에서 6px 떨어진 맨살은 그대로
    expect(rgbAt(out, 158, 242)).toEqual([...MY_SKIN]);
  });

  it("어긋난 윤곽은 선으로 되살리지 않는다 — 어두운 선 바로 옆에 밝은 선이 있으면 한 쌍(어긋남)이다", () => {
    // 내 사진에는 y 250 에 어두운 윤곽선이 있고, 생성 그림에서는 그 선이 2px 위(y 248)로 옮겨 가 있다
    const INK: Rgb = [60, 45, 40];
    const mine = photo(MY_SKIN, (x, y) => (x >= 148 && x <= 168 && y === 250 ? INK : null));
    const made = photo(MY_SKIN, (x, y) => (x >= 148 && x <= 168 && y === 248 ? INK : null));
    const out = applyMakeup(mine, extractMakeup(mine, asWarped(made), LMS));
    const skinL = labOf(MY_SKIN).L;
    // 옮겨 간 자리(y 248)가 진한 선으로 살아나지 않는다 — 한쪽뿐인 진짜 선이면 차이가 40 넘게 난다 (위 시험)
    expect(skinL - labOf(rgbAt(out, 158, 248)).L).toBeLessThan(15);
  });

  it("partChange: 화장한 부위만 큰 값 — 립스틱만 있으면 입술만", () => {
    const ref = photo(REF_SKIN, (x, y) => (pointInPoly(x, y, lipPoly) ? LIPSTICK : null));
    const c = partChange(extractMakeup(bare, asWarped(ref), LMS));
    expect(c.lip).toBeGreaterThan(20);
    expect(c.brow).toBeLessThan(1);
    expect(c.eye).toBeLessThan(1);
  });

  describe("matchLook — 두 화장이 얼마나 닮았나", () => {
    const SHADOW: Rgb = [215, 130, 90];
    const lips = (c: Rgb) => (x: number, y: number): Rgb | null => (pointInPoly(x, y, lipPoly) ? c : null);
    /** 왼쪽 눈(화면) 위 눈두덩 / 아래 눈밑에 칠한 섀도 */
    const shadowAt = (y0: number, y1: number) => (x: number, y: number): Rgb | null => (x > 175 && x < 255 && y > y0 && y < y1 ? SHADOW : null);
    const layerOf = (paint: (x: number, y: number) => Rgb | null, skin: Rgb = REF_SKIN) => extractMakeup(bare, asWarped(photo(skin, paint)), LMS);

    it("같은 화장이면 1, 화장 사진의 피부가 더 밝고 립스틱이 더 진해도 색 방향이 같으면 거의 1", () => {
      const a = layerOf(lips(LIPSTICK));
      expect(matchLook(a, a).score).toBeCloseTo(1, 5);
      const deeper = layerOf(lips([190, 80, 95]), MY_SKIN);
      const m = matchLook(a, deeper);
      expect(m.parts.lip.sim).toBeGreaterThan(0.95);
      expect(m.parts.eye.sim).toBe(1);   // 둘 다 눈화장 없음 — "안 한 것을 안 그렸다"
    });

    it("화장 사진에 있는 립스틱을 안 그렸으면 입술 0 — 전체는 입술 무게만큼 깎인다", () => {
      const m = matchLook(layerOf(lips(LIPSTICK)), layerOf(() => null));
      expect(m.parts.lip.sim).toBe(0);
      // 합성 얼굴에는 볼 영역이 없어 셈에서 빠진다 — 눈 0.4 + 눈썹 0.2 는 맞고 입술 0.25 는 틀림
      expect(m.parts.cheek.used).toBe(false);
      expect(m.score).toBeCloseTo(0.6 / 0.85, 5);
    });

    it("화장 사진에 없는 것을 그렸으면 그 부위 0 (없던 섀도를 지어냄)", () => {
      const m = matchLook(layerOf(lips(LIPSTICK)), layerOf((x, y) => lips(LIPSTICK)(x, y) ?? shadowAt(225, 240)(x, y)));
      expect(m.parts.eye.sim).toBe(0);
      expect(m.parts.lip.sim).toBeGreaterThan(0.95);
    });

    it("같은 색이라도 자리가 다르면 낮다 — 눈두덩 섀도 대 눈밑 섀도", () => {
      const lid = layerOf(shadowAt(225, 240));
      expect(matchLook(lid, lid).parts.eye.sim).toBeCloseTo(1, 5);
      expect(matchLook(lid, layerOf(shadowAt(266, 278))).parts.eye.sim).toBeLessThan(0.3);
    });

    it("색 방향이 다르면 낮다 — 붉은 입술 대 어두운 푸른 입술", () => {
      const m = matchLook(layerOf(lips(LIPSTICK)), layerOf(lips([120, 130, 190])));
      expect(m.parts.lip.sim).toBeLessThan(0.5);
    });
  });

  it("크기가 다른 포갠 사진은 받지 않는다", () => {
    expect(() => extractMakeup(bare, { data: new Uint8ClampedArray(4), w: 1, h: 1 }, LMS)).toThrow(/크기/);
  });
});
