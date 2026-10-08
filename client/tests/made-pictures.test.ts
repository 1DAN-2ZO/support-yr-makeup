// 만든 그림(정답사진 · 옮긴 그림) 보관 — 폰 세션 저장소에 두 칸 (#331 ② 제안, ⑥ 연결)
import { describe, expect, it } from "vitest";
import { createMadePictures } from "@core/made-pictures";
import { IMAGE_KEYS, createSessionStore } from "@core/session-store";

const blob = (s: string): Blob => new Blob([s], { type: "image/png" });
const text = async (b: Blob | null): Promise<string | null> => (b ? b.text() : null);

describe("세션 저장소 — 만든 그림 두 칸", () => {
  it("MP1 정답사진 · 옮긴 그림 칸이 있고, 저장 · 읽기 · 하나만 지우기가 된다", async () => {
    expect(IMAGE_KEYS).toEqual(expect.arrayContaining(["answer", "moved"]));
    const s = await createSessionStore({ idb: undefined });
    await s.saveImage("answer", blob("A"));
    await s.saveImage("moved", blob("M"));
    expect(await text((await s.loadImage("answer")) as Blob)).toBe("A");
    await s.deleteImage("moved");
    expect(await s.loadImage("moved")).toBeNull();
    expect(await text((await s.loadImage("answer")) as Blob)).toBe("A");   // 다른 칸은 그대로
  });

  it("MP2 끝내기(clearAll)는 만든 그림도 지운다 — 잔존 0", async () => {
    const s = await createSessionStore({ idb: undefined });
    await s.saveImage("answer", blob("A"));
    await s.saveImage("moved", blob("M"));
    expect(await s.hasImages()).toBe(true);
    expect(await s.clearAll()).toEqual({ remaining: 0 });
    expect(await s.loadImage("answer")).toBeNull();
    expect(await s.hasImages()).toBe(false);
  });
});

describe("만든 그림 보관 (createMadePictures)", () => {
  const setup = async () => { const store = await createSessionStore({ idb: undefined }); return { store, made: createMadePictures(store) }; };

  it("MP3 넣으면 바로 읽히고 폰 저장소에도 남는다", async () => {
    const { store, made } = await setup();
    expect(made.get("answer")).toBeNull();
    await made.set("answer", blob("A"));
    expect(await text(made.get("answer"))).toBe("A");
    expect(await text((await store.loadImage("answer")) as Blob)).toBe("A");
  });

  it("MP4 앱을 다시 켜도 되살아난다 — 저장소에서 다시 읽는다 (ArrayBuffer 로 돌아와도 그림으로)", async () => {
    const { store, made } = await setup();
    await made.set("answer", blob("A"));
    await store.saveImage("moved", await blob("M").arrayBuffer());
    const again = createMadePictures(store);
    expect(again.get("answer")).toBeNull();     // 되살리기 전에는 없다
    await again.restore();
    expect(await text(again.get("answer"))).toBe("A");
    expect(await text(again.get("moved"))).toBe("M");
  });

  it("MP5 null 을 넣으면 메모리와 저장소에서 같이 지운다", async () => {
    const { store, made } = await setup();
    await made.set("answer", blob("A"));
    await made.set("answer", null);
    expect(made.get("answer")).toBeNull();
    expect(await store.loadImage("answer")).toBeNull();
  });

  it("MP6 정답사진이 바뀌면 옮긴 그림은 버린다 — 옛 정답사진과 짝이던 그림이 새 정답사진과 견줘지지 않게", async () => {
    const { store, made } = await setup();
    await made.set("answer", blob("A"));
    await made.set("moved", blob("M"));
    await made.set("answer", blob("A2"));
    expect(made.get("moved")).toBeNull();
    expect(await store.loadImage("moved")).toBeNull();
    expect(await text(made.get("answer"))).toBe("A2");
  });

  it("MP7 맨얼굴을 다시 찍으면(clear) 둘 다 버린다 — 옛 맨얼굴에 겹치던 그림이다", async () => {
    const { store, made } = await setup();
    await made.set("answer", blob("A"));
    await made.set("moved", blob("M"));
    await made.clear();
    expect([made.get("answer"), made.get("moved")]).toEqual([null, null]);
    expect(await store.hasImages()).toBe(false);
  });

  it("MP8 저장소가 막혀도(저장 실패) 이번 세션에서는 쓸 수 있다 — 메모리에는 남는다", async () => {
    const broken = { saveImage: async () => { throw new Error("quota"); }, loadImage: async () => null, deleteImage: async () => {} };
    const made = createMadePictures(broken);
    await made.set("answer", blob("A"));
    expect(await text(made.get("answer"))).toBe("A");
  });
});
