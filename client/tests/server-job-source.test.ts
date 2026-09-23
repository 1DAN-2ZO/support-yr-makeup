import { describe, expect, it, vi, beforeEach } from "vitest";
import { createServerJobSource } from "../src/core/server-job-source";
import { resetVersions, getVersions } from "../src/core/versions";

function jobFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    job_id: "j1", look_id: "daily", status: "queued",
    result_url: null, layer: null, identity: { cos: null },
    ms: null, queue_ms: null, error: null,
    ver: { app: "dev", score: "score-v0.1", look: "look-v0.1", faceshape: "faceshape-rule-v1", transfer: "transfer-v0.1-sm-fp16-8step" },
    ...overrides,
  };
}

beforeEach(() => { resetVersions(); vi.useRealTimers(); });

describe("createServerJobSource", () => {
  it("세션 jobs 엔드포인트로 사진·룩ID·고른 룩을 보낸다", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe("http://x/sessions/s1/jobs");
      expect(init?.method).toBe("POST");
      const body = init!.body as FormData;
      expect(body.get("look_ids")).toBe("daily,smoky");
      expect(body.get("chosen")).toBe("daily");
      expect(body.get("photo")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ session_id: "s1", jobs: [jobFixture()] }), { status: 200 });
    });

    createServerJobSource({
      baseUrl: "http://x", sessionId: "s1", photo: new Blob(["x"]),
      lookIds: ["daily", "smoky"], chosen: "daily", fetchImpl,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
  });

  it("응답 job들을 current()로 내놓고 transfer 버전을 setVersions로 알린다", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ session_id: "s1", jobs: [jobFixture(), jobFixture({ job_id: "j2", look_id: "smoky", status: "done" })] }), { status: 200 }),
    );
    const src = createServerJobSource({
      baseUrl: "http://x", sessionId: "s1", photo: new Blob(["x"]),
      lookIds: ["daily", "smoky"], fetchImpl,
    });
    await vi.waitFor(() => expect(src.current()).toHaveLength(2));
    expect(src.current().map((j) => j.look_id)).toEqual(["daily", "smoky"]);
    expect(getVersions().transfer).toBe("transfer-v0.1-sm-fp16-8step");
  });

  it("subscribe 콜백이 상태 갱신마다 불린다", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ session_id: "s1", jobs: [jobFixture()] }), { status: 200 }),
    );
    const src = createServerJobSource({ baseUrl: "http://x", sessionId: "s1", photo: new Blob(["x"]), lookIds: ["daily"], fetchImpl });
    const onChange = vi.fn();
    const stop = src.subscribe(onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    stop();
  });

  it("끝나지 않은 job을 polling으로 다시 물어 done이 되면 멈춘다", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(JSON.stringify({ session_id: "s1", jobs: [jobFixture({ status: "running" })] }), { status: 200 });
      }
      pollCount++;
      const status = pollCount >= 2 ? "done" : "running";
      return new Response(JSON.stringify(jobFixture({ status, result_url: status === "done" ? "/r/daily.png" : null })), { status: 200 });
    });

    const src = createServerJobSource({ baseUrl: "http://x", sessionId: "s1", photo: new Blob(["x"]), lookIds: ["daily"], pollMs: 1000, fetchImpl });

    await vi.advanceTimersByTimeAsync(1);   // 최초 POST 처리
    await vi.advanceTimersByTimeAsync(1000); // 1차 폴링 -> running
    expect(src.current()[0]?.status).toBe("running");
    await vi.advanceTimersByTimeAsync(1000); // 2차 폴링 -> done
    expect(src.current()[0]?.status).toBe("done");
    expect(src.current()[0]?.result_url).toBe("/r/daily.png");

    const callsAtDone = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); // 더 기다려도 더 안 부른다
    expect(fetchImpl.mock.calls.length).toBe(callsAtDone);
    vi.useRealTimers();
  });

  it("제출이 실패해도 던지지 않고 onError만 부른다", async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const src = createServerJobSource({ baseUrl: "http://x", sessionId: "s1", photo: new Blob(["x"]), lookIds: ["daily"], fetchImpl, onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(src.current()).toEqual([]);
  });
});
