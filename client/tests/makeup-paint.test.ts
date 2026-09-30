// 화장 칠하기 색 (screens/makeup-paint) — 폰 시험(2026-09-30): 화장 10개 모두 눈썹 색이 비어 있어 눈썹이 아예 안 그려졌다
import { describe, expect, it } from "vitest";
import { LOOKS } from "@core/looks";
import { BROW_DEFAULT_COLOR, paintLookOf } from "@screens/makeup-paint";

describe("화장 칠하기 색", () => {
  it("P1 눈썹 색이 없는 화장도 눈썹을 기본 갈색으로 칠한다", () => {
    for (const look of LOOKS) {
      const p = paintLookOf(look);
      expect(p.color.brow).toMatch(/^#[0-9a-f]{6}$/);
      if (!look.parts.brow?.color) expect(p.color.brow).toBe(BROW_DEFAULT_COLOR);
      expect(p.alpha.brow).toBeGreaterThan(0);
    }
  });
});
