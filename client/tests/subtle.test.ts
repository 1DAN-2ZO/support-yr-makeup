// 피부와 가까운 색의 화장은 '확인만(subtle)' — 사진으로 그렸는지 가를 수 없다 (결정 2026-09-30, 뉴트럴 라이너 #e6c5b8)
// 전엔 '아직 색이 잘 안 보여요. 조금 더 바르거나…'(faint) 로 빠져, 일부러 연한 화장인데 더 바르라고 했다
import { describe, expect, it } from "vitest";
import { rgbToLab, type Lab } from "@core/color";
import { lookById } from "@core/looks";
import { CHECK_REASON_TEXT, PARAMS, decide, templateContrast } from "@core/score";
import { scorePart } from "@core/score-part";
import { pocGuide } from "@core/guide-poc";
import { BARE } from "./helpers/synth-face";

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

  it("S6 채점에 템플릿 색을 주면 맨얼굴 이마 피부와 비교해 ctx 에 남긴다 · 안 주면 전과 같다", () => {
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
});
