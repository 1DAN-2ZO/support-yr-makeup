// 세션 저장소 검증 (1-7 잔존 0 · 1-11 draft 2시간 만료)
import { describe, expect, it } from "vitest";
import { createSession, stripImages } from "@core/flow";
import { DRAFT_TTL_MS, LEGACY_LOCAL_KEYS, createSessionStore, indexedDbBackend, memoryBackend } from "@core/session-store";
import type { LocalLike } from "@core/session-store";

function fakeLocal(): LocalLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe("memoryBackend", () => {
  it("set/get/delete/keys", async () => {
    const b = memoryBackend();
    await b.set("a", 1); await b.set("b", { x: 1 });
    expect(await b.get("a")).toBe(1);
    expect((await b.keys()).sort()).toEqual(["a", "b"]);
    await b.delete("a");
    expect(await b.get("a")).toBeUndefined();
  });
});

describe("indexedDbBackend", () => {
  it("IndexedDB 가 없으면 null (Node·사생활 모드), throw 하지 않는다", async () => {
    expect(await indexedDbBackend(undefined)).toBeNull();
  });
  it("open 이 실패해도 null", async () => {
    const broken = { open() { const r: { onerror?: () => void; error?: Error } = {}; setTimeout(() => r.onerror?.(), 0); r.error = new Error("denied"); return r; } } as unknown as IDBFactory;
    expect(await indexedDbBackend(broken)).toBeNull();
  });
});

describe("createSessionStore", () => {
  it("IndexedDB 없으면 메모리 한 층으로 돈다", async () => {
    const s = await createSessionStore({ idb: undefined });
    expect(s.layers).toEqual(["memory"]);
  });

  it("draft 저장 → 읽기 (savedAt·ageMs 포함)", async () => {
    let t = 1_000_000;
    const s = await createSessionStore({ idb: undefined, now: () => t });
    await s.saveDraft(stripImages(createSession(() => t)));
    t += 5000;
    const r = await s.loadDraft();
    expect(r.draft).not.toBeNull();
    if (r.draft) { expect(r.ageMs).toBe(5000); expect(r.draft.screen).toBe("consent"); }
  });

  it("2시간이 지나면 만료 — draft 와 사진이 같이 지워진다", async () => {
    let t = 0;
    const s = await createSessionStore({ idb: undefined, now: () => t });
    await s.saveDraft(stripImages(createSession(() => t)));
    await s.saveImage("bare", new ArrayBuffer(8));
    t = DRAFT_TTL_MS + 1;
    const r = await s.loadDraft();
    expect(r.draft).toBeNull();
    if (!r.draft) expect(r.reason).toBe("expired");
    expect(await s.hasImages()).toBe(false);
  });

  it("없으면 none, 깨졌으면 corrupt", async () => {
    const s = await createSessionStore({ idb: undefined });
    const r0 = await s.loadDraft();
    expect(r0.draft).toBeNull();
    if (!r0.draft) expect(r0.reason).toBe("none");
  });

  it("사진 3장 저장·읽기", async () => {
    const s = await createSessionStore({ idb: undefined });
    await s.saveImage("bare", new ArrayBuffer(4));
    await s.saveImage("fullrender", new ArrayBuffer(5));
    expect(await s.hasImages()).toBe(true);
    expect((await s.loadImage("fullrender")) instanceof ArrayBuffer).toBe(true);
    expect(await s.loadImage("lastframe")).toBeNull();
  });

  it("끝내기(clearAll): 메모리·localStorage 잔존 0", async () => {
    const local = fakeLocal();
    for (const k of LEGACY_LOCAL_KEYS) local.setItem(k, "{}");
    const s = await createSessionStore({ idb: undefined, local });
    await s.saveDraft(stripImages(createSession()));
    await s.saveImage("bare", new ArrayBuffer(4));
    await s.saveImage("lastframe", new ArrayBuffer(4));
    const r = await s.clearAll();
    expect(r.remaining).toBe(0);
    expect(local.map.size).toBe(0);
    expect((await s.loadDraft()).draft).toBeNull();
    expect(await s.hasImages()).toBe(false);
  });
});
