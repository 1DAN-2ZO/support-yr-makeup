// 피부와 가까운 색의 화장은 '확인만(subtle)' — 사진으로 그렸는지 가를 수 없다 (결정 2026-09-30, 뉴트럴 라이너 #e6c5b8)
// 전엔 '아직 색이 잘 안 보여요. 조금 더 바르거나…'(faint) 로 빠져, 일부러 연한 화장인데 더 바르라고 했다
import { describe, expect, it } from "vitest";
import { rgbToLab, type Lab } from "@core/color";
import { lookById } from "@core/looks";
import { CHECK_REASON_TEXT, PARAMS, decide, templateContrast } from "@core/score";
import { scorePart } from "@core/score-part";
import { pocGuide } from "@core/guide-poc";
import { frameOf } from "@core/sampling";
import { BARE, BROWN, INK, LMS, RED, browPaint, image, lipPaint, type Paint } from "./helpers/synth-face";

// 밝은 피부 (이마) — 템플릿 색과 비교하는 기준
const SKIN: Lab = rgbToLab(236, 200, 180);

describe("화장 색이 피부와 가까우면 확인만(subtle)", () => {
  it("S1 뉴트럴 라이너(피부 가까운 베이지)는 검출 기준보다 차이가 작다 · 세미 스모키 블랙 라이너는 크다", () => {
    expect(templateContrast(SKIN, lookById("neutral").parts.liner!.color!)).toBeLessThan(PARAMS.dEThresh.liner);
    expect(templateContrast(SKIN, lookById("edgy").parts.liner!.color!)).toBeGreaterThan(PARAMS.dEThresh.liner * 2);
  });

  it("S2 차이가 기준보다 작으면 무엇을 그렸든 subtle — 점수를 지어내지 않는다", () => {
    const d = decide("liner", { present: true, score: 90 }, { templateDeltaE: 5 });
    expect(d).toEqual({ status: "check_only", reason: "subtle", score: null });
  });

  it("S3 차이가 기준 이상이면 전과 같다 (안 그렸으면 faint)", () => {
    expect(decide("liner", { present: false, score: null }, { templateDeltaE: 40 }).reason).toBe("faint");
    expect(decide("liner", { present: true, score: 80 }, { templateDeltaE: 40 }).status).toBe("scored");
  });

  it("S4 강도 부위(섀도우·볼)는 유무 기준(tPresent)으로 가른다", () => {
    expect(decide("shadow", { present: true, score: 70 }, { templateDeltaE: PARAMS.tPresent.shadow - 0.1 }).reason).toBe("subtle");
    expect(decide("shadow", { present: true, score: 70 }, { templateDeltaE: PARAMS.tPresent.shadow + 0.1 }).status).toBe("scored");
  });

  it("S5 이유 문장은 '더 바르라' 가 아니라 '거울로 보고 넘어가라'", () => {
    expect(CHECK_REASON_TEXT.subtle).toContain("거울로 보고 넘어가세요");
    expect(CHECK_REASON_TEXT.subtle).not.toContain("더 바르");
  });

  it("S6 채점에 템플릿 색을 주면 맨얼굴 그 부위 색과 비교해 ctx 에 남긴다 · 안 주면 전과 같다", () => {
    const g = pocGuide();
    const withColor = scorePart("liner", BARE, BARE, g, { templateColor: [255, 255, 255] }).ctx;
    expect(typeof withColor.templateDeltaE).toBe("number");
    expect(scorePart("liner", BARE, BARE, g).ctx.templateDeltaE).toBeUndefined();
  });

  it("S7 템플릿 색이 피부와 같으면 채점은 subtle 로 끝난다", () => {
    const skin = BARE.im.data;   // 합성 얼굴 피부 한 점을 그대로 템플릿 색으로
    const i = ((Math.round(BARE.lm[151]!.y) * BARE.im.w) + Math.round(BARE.lm[151]!.x)) * 4;
    const { result, ctx } = scorePart("liner", BARE, BARE, pocGuide(), { templateColor: [skin[i]!, skin[i + 1]!, skin[i + 2]!] });
    expect(decide("liner", result, ctx).reason).toBe("subtle");
  });

  // 비교 기준은 이마가 아니라 **그 부위 자리의 맨얼굴 색** (FFHQ 30명 점검 2026-10-01):
  // 앞머리가 이마를 덮으면 이마를 머리카락 색으로 재서 검은 라이너까지 '피부와 가깝다' 로 빠졌다 (눈썹 52 · 라이너 68 / 300)
  const frame = (p: Paint) => frameOf(image(p), LMS);
  const reasonOf = (part: "brow" | "liner" | "lip", base: ReturnType<typeof frame>, color: readonly [number, number, number]) => {
    const { result, ctx } = scorePart(part, base, base, pocGuide(), { templateColor: color });
    return decide(part, result, ctx).reason;
  };

  it("S8 앞머리가 이마를 덮어도(이마가 머리카락 색) 검은 라이너는 subtle 이 아니다 — 눈꺼풀 피부와 비교", () => {
    const bangs: Paint = (_x, y) => (y < 190 ? INK : null);
    expect(reasonOf("liner", frame(bangs), INK)).toBe("faint");   // 전엔 subtle
  });

  it("S9 눈썹은 맨얼굴 눈썹 자리와 비교 — 원래 눈썹과 같은 색으로 그리면 subtle, 훨씬 어두우면 아니다", () => {
    const base = frame(browPaint);   // 눈썹 자리가 BROWN
    expect(reasonOf("brow", base, BROWN)).toBe("subtle");   // 전엔 이마 피부와 비교해 faint('더 바르세요')
    expect(reasonOf("brow", base, INK)).toBe("faint");
  });

  it("S10 입술은 맨얼굴 입술 안쪽과 비교 — 타고난 입술색과 같은 립은 subtle", () => {
    const base = frame(lipPaint);   // 입술이 RED
    expect(reasonOf("lip", base, RED)).toBe("subtle");   // 전엔 faint
    expect(reasonOf("lip", BARE, RED)).toBe("faint");   // 입술이 살색이면 빨간 립은 보인다
  });

  it("S11 눈썹 자리의 일부만 털이면(나머지는 피부) 털 색 눈썹도 채점한다 — 피부 칸에서는 그린 게 보인다", () => {
    // 실제 눈썹은 털과 그 사이·주변 피부가 섞여 있다. 자리 전체 중앙값(=털 색)과 비교하면 채점되던 것까지 빠졌다
    // (FFHQ 30명: 눈썹 subtle 52 → 104칸, 빠진 칸의 전 점수 중앙 83)
    const upperHair: Paint = (x, y) => (y < 207 ? browPaint(x, y) : null);   // 눈썹 자리 위쪽 60% 만 털
    const base = frame(upperHair);
    expect(reasonOf("brow", base, BROWN)).toBe("faint");   // subtle 이 아니다 — 그리면 아래쪽 피부 칸에서 보인다
    expect(reasonOf("brow", frame(browPaint), BROWN)).toBe("subtle");   // 자리 전체가 털 색이면 그대로 subtle
  });
});
