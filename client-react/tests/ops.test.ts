/**
 * 운영 연결(lib/ops) 시험 — #454 A2 · A3 · A4 · A6.
 * 본 앱 main.ts 의 연결과 같은지: 세션 번호 유지 · 동의 전엔 안 보냄 · 화면 이름은 본 앱 이름 · 다시 하기면 새 번호
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SID_KEY } from "@core/session-id";

/** 모듈을 매번 새로 읽는다 — ops 는 앱에 하나뿐인 싱글턴이라 시험 사이에 섞이면 안 된다 */
async function freshOps() {
  vi.resetModules();
  const m = await import("../src/lib/ops");
  return m.ops();
}

/** 가짜 서버 — 받은 요청을 모아 둔다. /events 는 204, /keep GET 은 200, /keep POST 는 200 */
function fakeServer() {
  const calls: { url: string; method: string; body: string | FormData | null }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: (init?.body as string | FormData | null) ?? null });
    if (url.endsWith("/events")) return new Response(null, { status: 204 });
    if (url.endsWith("/keep")) return new Response(null, { status: 200 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchFn);
  return { calls, fetchFn };
}

/** 보내기가 끝날 때까지 — 보내기는 기다리지 않고 뒤에서 돈다 */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** /events 로 간 기록 전부 — 서버 규격(PR #317)은 `{"events":[...]}` 한 묶음이다 */
function eventsSent(calls: { url: string; method: string; body: string | FormData | null }[]): { name: string; screen: string; sid: string; ver: { app: string; score: string } }[] {
  return calls
    .filter((c) => c.url.endsWith("/events") && c.method === "POST")
    .flatMap((c) => (JSON.parse(c.body as string) as { events: { name: string; screen: string; sid: string; ver: { app: string; score: string } }[] }).events);
}

describe("세션 번호 (A6)", () => {
  beforeEach(() => window.localStorage.clear());

  it("폰 저장소에 적어 두고, 다시 읽어도 같은 번호를 쓴다", async () => {
    fakeServer();
    const a = await freshOps();
    const sid = a.sid.sid();
    expect(sid).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(window.localStorage.getItem(SID_KEY)!).sid).toBe(sid);
    // 새로고침 = 모듈을 다시 읽음
    const b = await freshOps();
    expect(b.sid.sid()).toBe(sid);
  });

  it("다시 하기(restart)면 새 번호로 바꾸고 폰의 옛 번호는 지운다", async () => {
    fakeServer();
    const o = await freshOps();
    const before = o.sid.sid();
    o.restart();
    const after = o.sid.sid();
    expect(after).not.toBe(before);
  });
});

describe("사용 기록 보내기 (A3 · A4)", () => {
  it("동의 전에는 /events 로 아무것도 안 보낸다", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.enter("consent");
    o.enter("capture");
    await settle();
    expect(calls.filter((c) => c.url.endsWith("/events"))).toHaveLength(0);
  });

  it("동의한 뒤 화면에 들어오면 모아 둔 기록(landing 포함)을 /events 로 보낸다", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.enter("consent");
    o.consent(true);
    o.enter("capture");
    await settle();
    const names = eventsSent(calls).map((e) => e.name);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names).toContain("landing");
    expect(names).toContain("consent");
    expect(names).toContain("screen_enter");
  });

  it("화면 이름은 본 앱 이름으로 적는다 — upload · answer · palette 는 전부 answer 이고 한 번만", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.consent(true);
    // 실제로는 화면 사이에 시간이 있다 — 보내는 중에 들어온 줄은 다음 보내기 때 간다 (본 앱과 같다). 그래서 한 번씩 기다린다
    for (const stage of ["capture", "upload", "answer", "palette", "partguide"]) {
      o.enter(stage);
      await settle();
    }
    await o.sender.send();
    const lines = eventsSent(calls);
    const entered = lines.filter((l) => l.name === "screen_enter").map((l) => l.screen);
    expect(entered).toEqual(["capture", "answer", "partguide"]);
    // 리액트에만 있는 이름은 기록에 안 나온다
    expect(JSON.stringify(lines)).not.toMatch(/"screen":"(upload|palette)"/);
  });

  it("기록 한 줄에 세션 번호 · 화면 · 판 이름이 붙는다 (ver.app 은 'dev' 가 아니어도 되지만 비어 있지 않다)", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.consent(true);
    o.enter("capture");
    await settle();
    const line = eventsSent(calls)[0]!;
    expect(line.sid).toBe(o.sid.sid());
    expect(line.ver.app).toBeTruthy();
    expect(line.ver.score).toMatch(/^score-/);
  });
});

describe("사진 보관 (A2)", () => {
  it("동의한 뒤 시도사진 묶음을 보내면 GET /keep 으로 켜졌는지 묻고 POST /keep 으로 한 장씩 올린다", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.consent(true);
    o.keepAttempt([new Blob(["a"]), new Blob(["b"])]);
    await o.keeper.idle();
    const keep = calls.filter((c) => c.url.endsWith("/keep"));
    expect(keep.some((c) => c.method === "GET")).toBe(true);
    expect(keep.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("동의 전에는 /keep 으로 아무것도 안 간다", async () => {
    const { calls } = fakeServer();
    const o = await freshOps();
    o.keeper.keep("bare", new Blob(["x"]));
    await o.keeper.idle();
    expect(calls.filter((c) => c.url.endsWith("/keep"))).toHaveLength(0);
  });
});
