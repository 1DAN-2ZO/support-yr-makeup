// 합성 화장 세트 (eval/samples/paint_levels.mjs) — 네 단계가 뜻대로 칠해지는지. 사진 없이 합성 얼굴로
// 덜 채움 < 적당함 < 조금 번짐 < 많이 번짐 순으로 칠한 넓이가 커져야 표(기대 판정)가 말이 된다
import { describe, expect, it } from "vitest";
import { lookGuide } from "@core/guides";
import { LM } from "@core/landmarks";
import { lookById } from "@core/looks";
import { BARE, LMS } from "./helpers/synth-face";
import { EXPECT, LEVELS, PARTS, paint, shapes } from "../../eval/samples/paint_levels.mjs";

const core = { LM };
const look = lookById("edgy");
const painted = (part: string, level: string): number => {
  const geom = lookGuide(look.parts)(part as never, BARE);
  return paint(BARE.im, shapes(core, part, level, LMS, look.parts, geom, BARE.unit), [0, 0, 0], 0.7).painted as number;
};

describe("합성 화장 세트 — 네 단계", () => {
  it("V1 부위마다 칠한 넓이가 덜 채움 < 적당함 < 조금 번짐 < 많이 번짐", () => {
    for (const part of PARTS as string[]) {
      const n = (LEVELS as string[]).map((lv) => painted(part, lv));
      expect(n[0], `${part} under`).toBeGreaterThan(0);
      for (let i = 1; i < n.length; i++) expect(n[i], `${part} ${LEVELS[i]}`).toBeGreaterThan(n[i - 1]!);
    }
  });

  it("V2 기대 판정은 골든 세트와 같은 말 — 조금 · 맞음 · 조금 · 많이", () => {
    expect(EXPECT).toEqual({ under: "slight", ok: "ok", slight: "slight", heavy: "off" });
  });

  it("V3 칠해도 원본은 그대로 (사본에 칠한다) · 덮는 비율만큼만 섞는다", () => {
    const before = BARE.im.data.slice();
    const { im } = paint(BARE.im, shapes(core, "lip", "ok", LMS, look.parts, lookGuide(look.parts)("lip", BARE), BARE.unit), [0, 0, 0], 0.5);
    expect(BARE.im.data).toEqual(before);
    const c = { x: 300, y: 438 };   // 아랫입술 안
    const i = (c.y * BARE.im.w + c.x) * 4;
    expect(im.data[i]).toBe(Math.round(before[i]! * 0.5));
  });
});
