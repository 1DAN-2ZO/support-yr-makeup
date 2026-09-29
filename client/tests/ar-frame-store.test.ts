// 2-b AR 한 장면 (화면 3 완성본용, #182) — 지금은 메모리, ① 저장 자리(#181)가 오면 세션으로
import { describe, expect, it } from "vitest";
import { createArFrameStore, type ArFrame } from "@core/ar-frame-store";

const frame = (lookId: string): ArFrame => ({ lookId, image: new Blob(["x"]), lm: [{ x: 1, y: 2 }], w: 640, h: 480 });

describe("AR 장면 저장", () => {
  it("S1 지금 화장의 장면만 준다 — 다른 화장을 골랐으면 없음", async () => {
    const s = createArFrameStore();
    s.set("daily", frame("daily"));
    expect((await s.get("daily"))?.w).toBe(640);
    expect(s.get("smoky")).toBeNull();
    expect(s.get(null)).toBeNull();
  });

  it("S2 새 장면이 앞 장면을 바꾼다, clear 면 비운다", async () => {
    const s = createArFrameStore();
    s.set("daily", frame("daily"));
    s.set("smoky", frame("smoky"));
    expect(s.get("daily")).toBeNull();
    expect(await s.get("smoky")).not.toBeNull();
    s.clear();
    expect(s.get("smoky")).toBeNull();
  });

  it("S3 저장 중(JPEG 로 바꾸는 중)에 화면 3 이 먼저 열려도 기다렸다 받는다 — 전엔 첫 부위가 쌩얼로 떨어졌다", async () => {
    const s = createArFrameStore();
    let done!: (f: ArFrame | null) => void;
    s.set("daily", new Promise<ArFrame | null>((r) => { done = r; }));
    const got = s.get("daily");
    expect(got).not.toBeNull();
    done(frame("daily"));
    expect((await got)?.lookId).toBe("daily");
  });

  it("S4 저장이 실패하면 없음 (던지지 않는다 → 화면 3 은 쌩얼)", async () => {
    const s = createArFrameStore();
    s.set("daily", Promise.reject(new Error("toBlob")));
    expect(await s.get("daily")).toBeNull();
  });
});
