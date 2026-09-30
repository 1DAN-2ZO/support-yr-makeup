// 조명 색 보정 후보 (S-4 #40) — 폰 시험·합성 얼굴(2026-09-30): 맨얼굴인데 노란 불빛이면 눈썹·라이너·입술이 66~70점.
// 채점은 이마 L* 만 보정해서(lightCorr) 불빛 색(a*b*)이 돌면 "색이 바뀐 곳 = 그린 곳" 이 된다.
// 후보 "sclera": 눈 흰자는 원래 흰색 — 흰자 a*b* 가 돈 만큼 조명 색이 돈 것으로 보고 되돌린다.
import { describe, expect, it } from "vitest";
import type { RgbaImage } from "@core/color";
import { frameOf } from "@core/sampling";
import { scorePart } from "@core/score-part";
import { PARAMS, decide, type ScoreParams } from "@core/score";
import type { PartId } from "@core/types";
import { LMS, NATURAL, browPaint, guide, image, linerPaint, lipPaint, naturalPaint, over } from "./helpers/synth-face";
import type { Paint } from "./helpers/synth-face";

const WARM: [number, number, number] = [1.08, 1.0, 0.82], COOL: [number, number, number] = [0.9, 0.97, 1.1];
function tinted(k: [number, number, number], paint: Paint = naturalPaint): RgbaImage {
  const im = image(paint);
  for (let i = 0; i < im.data.length; i += 4) for (let c = 0; c < 3; c++) im.data[i + c] = Math.min(255, im.data[i + c]! * k[c]!);
  return im;
}
const P = (colorCorr: ScoreParams["colorCorr"]): ScoreParams => ({ ...PARAMS, colorCorr });
const judge = (part: PartId, im: RgbaImage, p: ScoreParams) => {
  const { result, ctx } = scorePart(part, NATURAL, frameOf(im, LMS), guide, {}, p);
  return decide(part, result, ctx, p);
};

describe("조명 색 보정 (S-4)", () => {
  it("K1 (문제) 이마 L* 만 보정하면 노란·파란 불빛의 맨얼굴을 '그렸다' 로 채점한다", () => {
    expect(judge("brow", tinted(WARM), P("L")).status).toBe("scored");
    expect(judge("lip", tinted(COOL), P("L")).status).toBe("scored");
  });

  it("K2 흰자 보정이면 노란·파란 불빛의 맨얼굴은 화장 없음(faint)", () => {
    for (const k of [WARM, COOL]) for (const part of ["brow", "liner", "lip"] as const) {
      expect(judge(part, tinted(k), P("sclera")), `${part} ${k}`).toMatchObject({ status: "check_only", reason: "faint" });
    }
  });

  it("K3 흰자 보정이어도 노란 불빛에서 실제로 그린 눈썹·라이너·입술은 잡는다", () => {
    for (const [part, paint] of [["brow", browPaint], ["liner", linerPaint()], ["lip", lipPaint]] as const) {
      expect(judge(part, tinted(WARM, over(paint, naturalPaint)), P("sclera")).status, part).toBe("scored");
    }
  });

  it("K4 흰자를 못 재면(눈 감음 등) 이마 L* 보정으로 돌아간다 — 던지지 않는다", () => {
    const closed = LMS.map((p) => ({ ...p }));
    expect(() => scorePart("lip", frameOf(image(), closed), frameOf(tinted(WARM, () => null), closed), guide, {}, P("sclera"))).not.toThrow();
  });
});
