// 사용 기록 보내기 — 서버 규격(PR #317: 64KB·200줄, 204/413/422/503)대로 도는지
import { describe, expect, it, vi } from "vitest";
import { MAX_LINES, createEventSender, takeBatch } from "@core/event-sender";
import type { Event } from "@core/types";

const ev = (screen: string): Event => ({ name: "screen_enter", screen }) as Event;
const many = (n: number): Event[] => Array.from({ length: n }, (_, i) => ev(`s${i}`));

function setup(status: number | number[], over: { enabled?: () => boolean } = {}) {
  const codes = Array.isArray(status) ? [...status] : [status];
  const bodies: string[] = [];
  const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    const code = codes.length > 1 ? codes.shift()! : codes[0]!;
    return { status: code, ok: code >= 200 && code < 300 } as Response;
  });
  const trouble: string[] = [];
  const sender = createEventSender({
    base: "https://x.test/",
    enabled: over.enabled ?? (() => true),
    fetchFn: fetchFn as unknown as typeof fetch,
    beacon: () => true,
    onTrouble: (w) => trouble.push(w),
  });
  return { sender, fetchFn, bodies, trouble };
}

describe("사용 기록 보내기", () => {
  it("ES1 서버가 정한 주소·형식으로 보낸다 — POST /events, { events: [...] }", async () => {
    const { sender, fetchFn, bodies } = setup(204);
    sender.add(ev("consent"));
    expect(await sender.send()).toBe("sent");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://x.test/events");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init?.keepalive).toBe(true);
    expect(JSON.parse(bodies[0]!)).toEqual({ events: [{ name: "screen_enter", screen: "consent" }] });
    expect(sender.waiting()).toBe(0);
  });

  it("ES2 한 번에 200줄까지 — 넘으면 나눠 보낸다", () => {
    expect(takeBatch(many(500))).toHaveLength(MAX_LINES);
  });

  it("ES3 줄 수가 모자라도 64KB 를 넘기지 않는다 — 한글은 한 글자가 3바이트라 글자 수로 재면 안 된다", () => {
    const big = Array.from({ length: 60 }, () => ({ name: "error", where: "x", msg: "가".repeat(500) }) as Event);
    const batch = takeBatch(big);
    expect(batch.length).toBeLessThan(60);
    const bytes = new TextEncoder().encode(JSON.stringify({ events: batch })).length;
    expect(bytes).toBeLessThanOrEqual(64 * 1024);
    // 글자 수로 쟀다면 60 줄이 전부 들어갔을 것이다 (60 × 약 520 글자 = 60KB 미만)
    expect(JSON.stringify({ events: big }).length).toBeLessThan(64 * 1024);
  });

  it("ES4 못 보내면 버리지 않고 들고 있다가 다음에 다시 보낸다", async () => {
    const { sender } = setup([500, 204]);
    sender.add(ev("capture"));
    expect(await sender.send()).toBe("kept");
    expect(sender.waiting()).toBe(1);
    expect(await sender.send()).toBe("sent");
    expect(sender.waiting()).toBe(0);
  });

  it("ES5 네트워크가 끊겨도 줄을 잃지 않는다", async () => {
    const sender = createEventSender({
      base: "https://x.test",
      enabled: () => true,
      fetchFn: (async () => { throw new Error("offline"); }) as unknown as typeof fetch,
      beacon: () => true,
    });
    sender.add(ev("capture"));
    expect(await sender.send()).toBe("kept");
    expect(sender.waiting()).toBe(1);
  });

  it("ES6 422·413 은 다시 보내도 같은 답이라 그 묶음만 버리고 뒤는 계속 보낸다", async () => {
    for (const code of [422, 413]) {
      const { sender, trouble } = setup([code, 204]);
      sender.add(ev("a"));
      expect(await sender.send()).toBe("dropped");
      expect(sender.waiting()).toBe(0);
      expect(trouble).toContain(`events ${code}`);
      sender.add(ev("b"));
      expect(await sender.send()).toBe("sent");
    }
  });

  it("ES7 503(서버에 쌓을 곳 없음)이면 이 세션에서는 더 안 보낸다", async () => {
    const { sender, fetchFn, trouble } = setup(503);
    sender.add(ev("a"));
    expect(await sender.send()).toBe("off");
    expect(trouble).toContain("events 503");
    sender.add(ev("b"));
    expect(await sender.send()).toBe("off");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ES8 동의 전에는 보내지 않는다 — 쌓이기만 한다", async () => {
    let ok = false;
    const { sender, fetchFn } = setup(204, { enabled: () => ok });
    sender.add(ev("consent"));
    expect(await sender.send()).toBe("kept");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sender.waiting()).toBe(1);
    ok = true;
    expect(await sender.send()).toBe("sent");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("ES9 들고 있는 줄이 너무 많이 쌓이면 오래된 것부터 버린다 — 메모리를 안 먹는다", () => {
    const { sender } = setup(204, { enabled: () => false });
    for (const e of many(1500)) sender.add(e);
    expect(sender.waiting()).toBe(1000);
  });

  it("ES10 화면이 가려질 때는 답을 안 기다리고 보낸다 (sendBeacon)", () => {
    const sent: string[] = [];
    const sender = createEventSender({
      base: "https://x.test",
      enabled: () => true,
      fetchFn: (async () => ({ status: 204, ok: true }) as Response) as unknown as typeof fetch,
      beacon: (_u, body) => { sent.push(body); return true; },
    });
    sender.add(ev("save"));
    sender.flushBeacon();
    expect(JSON.parse(sent[0]!).events).toHaveLength(1);
    expect(sender.waiting()).toBe(0);
  });

  it("ES11 끝내기(stop) 뒤에는 쌓지도 보내지도 않는다", async () => {
    const { sender, fetchFn } = setup(204);
    sender.add(ev("a"));
    sender.stop();
    expect(sender.waiting()).toBe(0);
    sender.add(ev("b"));
    expect(await sender.send()).toBe("off");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("ES12 한 줄이 혼자 한도를 넘어도 묶음이 비지 않는다 — 영원히 막히면 안 된다", () => {
    const huge = [{ name: "error", where: "x", msg: "가".repeat(80000) }] as Event[];
    expect(takeBatch(huge)).toHaveLength(1);
  });
});
