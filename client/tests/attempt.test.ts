// 화면 5 시도사진 (2026-10-06 새 흐름, ⑥) — 화장을 다 한 뒤 정면 눈 뜬 장 · 감은 장 두 장만.
// 판정 · 장 순서는 화면 1 과 같은 규칙(① capture-run · shotGate)을 쓴다
import { describe, expect, it } from "vitest";
import { ATTEMPT_SHOTS, startAttemptRun } from "@core/attempt";

describe("시도사진 장 순서", () => {
  it("AR1 정면 눈 뜬 장 → 감은 장 두 장뿐", () => {
    expect(ATTEMPT_SHOTS).toEqual(["front_open", "front_closed"]);
    expect(startAttemptRun({}, 0).shot).toBe("front_open");
    expect(startAttemptRun({ front_open: {} }, 0).shot).toBe("front_closed");
    expect(startAttemptRun({ front_open: {}, front_closed: {} }, 0).shot).toBeNull();
  });

  it("AR2 첫 장(눈 뜬)은 화면 1 기준 장처럼 카메라가 자리 잡기를 기다린다 — 감은 장은 안 기다린다", () => {
    expect(startAttemptRun({}, 0).settle).not.toBeNull();
    expect(startAttemptRun({ front_open: {} }, 0).settle).toBeNull();
  });
});
