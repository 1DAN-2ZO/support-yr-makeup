// VLM 서버 호출 (2026-09-29 흐름: VLM 이 없으면 이용 불가). 계약: POST /plan · GET /health (중간 서버 → llama-server)
import { describe, expect, it, vi } from "vitest";
import { VlmFailure, createVlmClient } from "@core/vlm-client";

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const REQ = { image: "data:image/jpeg;base64,AAA", prompt: "p", schema: { type: "object" }, promptVer: "v1", lookId: "daily" };

describe("VLM 클라이언트", () => {
  it("V1 /plan 에 계약대로 보내고 모델 답(문자열)을 돌려준다", async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => ok({ proposal: '{"liner":{}}', ms: 3200, model: "qwen3vl8b" }));
    const c = createVlmClient("https://api.test", f);
    const r = await c.plan(REQ);
    expect(r).toEqual({ proposal: '{"liner":{}}', ms: 3200, model: "qwen3vl8b" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.test/plan");
    expect(JSON.parse(init!.body as string)).toEqual({ image: REQ.image, prompt: "p", schema: { type: "object" }, prompt_ver: "v1", look_id: "daily" });
  });

  it("V2 붐비면(503 busy) busy, 모델이 없으면(503 그 밖) unavailable, 504 는 timeout", async () => {
    const reason = async (res: Promise<Response>) => (await createVlmClient("", () => res).plan(REQ).catch((e: VlmFailure) => e)) as VlmFailure;
    expect((await reason(ok({ reason: "busy" }, 503))).reason).toBe("busy");
    expect((await reason(ok({ reason: "model_down" }, 503))).reason).toBe("unavailable");
    expect((await reason(ok({}, 504))).reason).toBe("timeout");
    expect((await reason(ok({ nope: 1 }))).reason).toBe("bad_response");
  });

  it("V3 네트워크가 끊기면 unavailable, 시간이 넘으면 timeout", async () => {
    const down = createVlmClient("", () => Promise.reject(new TypeError("Failed to fetch")));
    expect(((await down.plan(REQ).catch((e) => e)) as VlmFailure).reason).toBe("unavailable");
    vi.useFakeTimers();
    try {
      const slow = createVlmClient("", (_u, init) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))), 1000);
      const p = slow.plan(REQ).catch((e) => e);
      await vi.advanceTimersByTimeAsync(1001);
      expect(((await p) as VlmFailure).reason).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("V4 health: 서버와 VLM 이 둘 다 살아 있어야 ok. 못 닿으면 ok false (던지지 않는다)", async () => {
    expect(await createVlmClient("", () => ok({ ok: true, vlm: { ok: true, model: "m" } })).health()).toEqual({ ok: true, model: "m" });
    expect((await createVlmClient("", () => ok({ ok: true, vlm: { ok: false } })).health()).ok).toBe(false);
    expect((await createVlmClient("", () => ok({ ok: true })).health()).ok).toBe(false);
    expect((await createVlmClient("", () => Promise.reject(new TypeError("x"))).health()).ok).toBe(false);
  });
});
