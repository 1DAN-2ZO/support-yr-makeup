// 룩별 개인화 — 누른 룩마다 한 번 계산해 기억한다. 계산 중에 여러 개를 누르면 마지막에 누른 룩부터 (결정 2026-09-28)
import { describe, expect, it } from "vitest";
import { createPlanQueue } from "@core/plan-queue";

/** 손으로 끝내는 가짜 계산 — 어떤 순서로 불렸는지 본다 */
function fakeCompute() {
  const calls: string[] = [];
  const waiting = new Map<string, (v: string) => void>();
  const compute = (id: string) => new Promise<string>((res) => { calls.push(id); waiting.set(id, res); });
  const finish = async (id: string) => { waiting.get(id)!(`plan:${id}`); await new Promise((r) => setTimeout(r, 0)); };
  return { compute, calls, finish };
}

describe("룩별 개인화 대기열", () => {
  it("처음 누른 룩은 계산하고, 결과를 기억한다", async () => {
    const f = fakeCompute();
    const q = createPlanQueue(f.compute);
    const p = q.request("edgy");
    expect(q.get("edgy")).toBeUndefined();
    await f.finish("edgy");
    expect(await p).toBe("plan:edgy");
    expect(q.get("edgy")).toBe("plan:edgy");
  });

  it("이미 계산한 룩은 다시 계산하지 않는다", async () => {
    const f = fakeCompute();
    const q = createPlanQueue(f.compute);
    const first = q.request("edgy");
    await f.finish("edgy");
    await first;
    expect(await q.request("edgy")).toBe("plan:edgy");
    expect(f.calls).toEqual(["edgy"]);
  });

  it("계산 중인 룩을 또 눌러도 한 번만 계산한다", async () => {
    const f = fakeCompute();
    const q = createPlanQueue(f.compute);
    const a = q.request("edgy"), b = q.request("edgy");
    await f.finish("edgy");
    expect(await a).toBe("plan:edgy");
    expect(await b).toBe("plan:edgy");
    expect(f.calls).toEqual(["edgy"]);
  });

  it("계산 중에 여러 개를 누르면 마지막에 누른 룩부터 — 시작한 계산은 끝까지 한다", async () => {
    const f = fakeCompute();
    const q = createPlanQueue(f.compute);
    const all = ["daily", "edgy", "coral", "rose"].map((id) => q.request(id));
    expect(f.calls).toEqual(["daily"]);            // 처음 것은 바로 시작
    await f.finish("daily");
    expect(f.calls).toEqual(["daily", "rose"]);    // 다음은 마지막에 누른 것
    await f.finish("rose");
    expect(f.calls).toEqual(["daily", "rose", "coral"]);
    await f.finish("coral");
    await f.finish("edgy");
    expect(await Promise.all(all)).toEqual(["plan:daily", "plan:edgy", "plan:coral", "plan:rose"]);
  });

  it("기다리던 룩을 다시 누르면 맨 앞으로 온다", async () => {
    const f = fakeCompute();
    const q = createPlanQueue(f.compute);
    void q.request("daily"); void q.request("edgy"); void q.request("coral");
    void q.request("edgy");                        // edgy 를 다시 누름
    await f.finish("daily");
    expect(f.calls).toEqual(["daily", "edgy"]);
  });

  it("계산이 실패하면 기억하지 않고, 다시 누르면 다시 계산한다", async () => {
    let n = 0;
    const q = createPlanQueue((id: string) => (n++ === 0 ? Promise.reject(new Error("VLM 끊김")) : Promise.resolve(`plan:${id}`)));
    await expect(q.request("edgy")).rejects.toThrow("VLM 끊김");
    expect(q.get("edgy")).toBeUndefined();
    expect(await q.request("edgy")).toBe("plan:edgy");
  });

  it("clear 하면 기억한 것을 모두 지운다 (새 세션·다시 찍기)", async () => {
    const q = createPlanQueue((id: string) => Promise.resolve(`plan:${id}`));
    await q.request("edgy");
    q.clear();
    expect(q.get("edgy")).toBeUndefined();
  });
  it("계산이 바로(동기로) 던져도 큐가 멈추지 않는다 — 다음 요청은 돈다 (#172 리뷰)", async () => {
    let n = 0;
    const q = createPlanQueue<number>((id) => {
      n++;
      if (id === "bad") throw new Error("동기 실패");
      return Promise.resolve(1);
    });
    await expect(q.request("bad")).rejects.toThrow("동기 실패");
    await expect(q.request("ok")).resolves.toBe(1);
    expect(n).toBe(2);
  });
});
