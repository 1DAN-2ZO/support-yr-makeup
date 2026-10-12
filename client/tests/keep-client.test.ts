// 테스트 기간 사진 보관 — 앱이 사진을 서버로 보내는 쪽 (2026-10-09). 참고 사진은 보낼 이름이 없다
import { describe, expect, it, vi } from "vitest";
import { createKeeper, keepAttempt } from "@core/keep-client";

const SID = "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab";
const photo = (n: number): Blob => new Blob([new Uint8Array(n)], { type: "image/webp" });

type Call = { method: string; url: string; kind?: string; sid?: string; size?: number };
function server(over: { on?: number; post?: number | (() => number); fail?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET", url = String(u);
    if (over.fail) throw new TypeError("network");
    if (method === "GET") {
      calls.push({ method, url });
      return new Response(JSON.stringify({ on: true, days: 7 }), { status: over.on ?? 200 });
    }
    const body = init!.body as FormData;
    calls.push({ method, url, kind: String(body.get("kind")), sid: String(body.get("sid")), size: (body.get("file") as Blob).size });
    return new Response(null, { status: typeof over.post === "function" ? over.post() : over.post ?? 204 });
  });
  return { calls, fetchFn, posts: () => calls.filter((c) => c.method === "POST") };
}
const make = (s: ReturnType<typeof server>, enabled = true) => createKeeper({ sid: SID, enabled: () => enabled, fetchFn: s.fetchFn, base: "https://x.test/" });

describe("사진 보관 보내기", () => {
  it("KC1 켜져 있는지 먼저 한 번 묻고, 사진을 종류 · 세션 번호와 함께 보낸다", async () => {
    const s = server(), k = make(s);
    k.keep("bare", photo(10));
    k.keep("answer", photo(20));
    await k.idle();
    expect(s.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET https://x.test/keep", "POST https://x.test/keep", "POST https://x.test/keep"]);
    expect(s.posts()).toEqual([
      { method: "POST", url: "https://x.test/keep", kind: "bare", sid: SID, size: 10 },
      { method: "POST", url: "https://x.test/keep", kind: "answer", sid: SID, size: 20 },
    ]);
  });

  it("KC1b 세션 번호는 보낼 때마다 묻는다 — 다시 시작해 번호가 바뀌면 새 번호로 간다", async () => {
    const s = server();
    let sid = SID;
    const k = createKeeper({ sid: () => sid, enabled: () => true, fetchFn: s.fetchFn, base: "https://x.test/" });
    k.keep("bare", photo(10));
    await k.idle();
    sid = "9f2b8c1e-bbbb-4bbb-8ccc-1234567890ab";
    k.keep("bare", photo(11));
    await k.idle();
    expect(s.posts().map((p) => p.sid)).toEqual([SID, sid]);
  });

  it("KC2 서버가 꺼져 있으면(503) 사진을 하나도 올리지 않는다 — 다시 묻지도 않는다", async () => {
    const s = server({ on: 503 }), k = make(s);
    k.keep("bare", photo(10));
    await k.idle();
    k.keep("answer", photo(20));
    await k.idle();
    expect(s.posts()).toEqual([]);
    expect(s.calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  it("KC3 동의하기 전에는 묻지도 보내지도 않는다", async () => {
    const s = server(), k = make(s, false);
    k.keep("bare", photo(10));
    await k.idle();
    expect(s.calls).toEqual([]);
  });

  it("KC4 한 번에 하나씩 보낸다 — 큰 사진 여러 장이 동시에 올라가지 않게", async () => {
    let inFlight = 0, most = 0;
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return new Response("{}", { status: 200 });
      inFlight++; most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(null, { status: 204 });
    });
    const k = createKeeper({ sid: SID, enabled: () => true, fetchFn });
    for (let i = 0; i < 5; i++) k.keep(`attempt_open_${i}` as "attempt_open_0", photo(5));
    await k.idle();
    expect(most).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("KC5 아직 못 보낸 같은 종류가 있으면 새것으로 바꾼다 — 다시 찍은 사진만 간다", async () => {
    const s = server(), k = make(s);
    k.keep("bare", photo(1));
    k.keep("attempt_open_0", photo(2));
    k.keep("attempt_open_0", photo(3));
    await k.idle();
    expect(s.posts().map((c) => `${c.kind}:${c.size}`)).toEqual(["bare:1", "attempt_open_0:3"]);
  });

  it("KC6 보내다 실패해도 던지지 않고 다음 것을 이어 보낸다 — 보관이 화면을 막지 않는다", async () => {
    let n = 0;
    const s = server({ post: () => (++n === 1 ? 500 : 204) }), k = make(s);
    expect(() => k.keep("bare", photo(1))).not.toThrow();
    k.keep("answer", photo(2));
    await k.idle();
    expect(s.posts().map((c) => c.kind)).toEqual(["bare", "answer"]);
    const down = server({ fail: true }), k2 = make(down);
    expect(() => k2.keep("bare", photo(1))).not.toThrow();
    await expect(k2.idle()).resolves.toBeUndefined();
  });

  it("KC7 보내는 도중 서버가 꺼지면(503) 남은 것은 보내지 않는다", async () => {
    let n = 0;
    const s = server({ post: () => (++n === 1 ? 503 : 204) }), k = make(s);
    k.keep("bare", photo(1));
    k.keep("answer", photo(2));
    k.keep("moved", photo(3));
    await k.idle();
    expect(s.posts().map((c) => c.kind)).toEqual(["bare"]);
  });

  it("KC8 피드백 결과는 글(JSON)로 보낸다 — 사진 주소 · 원본 그림은 넣지 않는다", async () => {
    const s = server(), k = make(s);
    let sent = "";
    s.fetchFn.mockImplementation(async (_u, init) => {
      if ((init?.method ?? "GET") === "GET") return new Response("{}", { status: 200 });
      sent = await ((init!.body as FormData).get("file") as Blob).text();
      return new Response(null, { status: 204 });
    });
    k.keepFeedback({ ok: ["입술"], fix: [], parts: [{ part: "lip", name: "입술", tone: "ok", line: "정답과 비슷해요" }] } as never);
    await k.idle();
    expect(JSON.parse(sent)).toEqual({ ok: ["입술"], fix: [], parts: [{ part: "lip", name: "입술", tone: "ok", line: "정답과 비슷해요" }] });
  });

  it("KC10 시도사진 묶음 — 눈 뜬 장을 다섯 장까지 순서대로. 여섯째부터는 안 보낸다 (눈 감은 장은 이제 찍지 않는다 #386)", () => {
    const keep = vi.fn();
    keepAttempt({ keep }, [1, 2, 3, 4, 5, 6].map(photo));
    expect(keep.mock.calls.map((c) => `${c[0]}:${(c[1] as Blob).size}`)).toEqual(["attempt_open_0:1", "attempt_open_1:2", "attempt_open_2:3", "attempt_open_3:4", "attempt_open_4:5"]);
    keep.mockClear();
    keepAttempt({ keep }, [photo(1)]);
    expect(keep.mock.calls.map((c) => c[0])).toEqual(["attempt_open_0"]);
  });

  it("KC9 켜졌는지 묻다가 인터넷이 끊기면 그 사진은 버리고, 다음에 다시 묻는다", async () => {
    const s = server({ fail: true }), k = make(s);
    k.keep("bare", photo(1));
    await k.idle();
    s.fetchFn.mockImplementation(async (_u, init) => new Response((init?.method ?? "GET") === "GET" ? "{}" : null, { status: (init?.method ?? "GET") === "GET" ? 200 : 204 }));
    k.keep("answer", photo(2));
    await k.idle();
    expect(s.fetchFn.mock.calls.filter((c) => (c[1]?.method ?? "GET") === "POST")).toHaveLength(1);
  });
});
