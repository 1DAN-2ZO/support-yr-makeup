// 2-b AR 한 장면 (화면 3 완성본용, #182) — 지금은 메모리, ① 저장 자리(#181)가 오면 세션으로
import { describe, expect, it } from "vitest";
import { createArFrameStore } from "@core/ar-frame-store";

const frame = (lookId: string) => ({ lookId, image: new Blob(["x"]), lm: [{ x: 1, y: 2 }], w: 640, h: 480 });

describe("AR 장면 저장", () => {
  it("S1 지금 화장의 장면만 준다 — 다른 화장을 골랐으면 없음", () => {
    const s = createArFrameStore();
    s.set(frame("daily"));
    expect(s.get("daily")?.w).toBe(640);
    expect(s.get("smoky")).toBeNull();
    expect(s.get(null)).toBeNull();
  });

  it("S2 새 장면이 앞 장면을 바꾼다, clear 면 비운다", () => {
    const s = createArFrameStore();
    s.set(frame("daily"));
    s.set(frame("smoky"));
    expect(s.get("daily")).toBeNull();
    expect(s.get("smoky")).not.toBeNull();
    s.clear();
    expect(s.get("smoky")).toBeNull();
  });
});
