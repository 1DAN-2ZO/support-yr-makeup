// 작업 시간 기록 (2026-10-08, 모듈 ⑥) — 정답사진 만들기 · 부위 가이드 · 피드백처럼 기다리는 작업이 몇 초 걸렸는지 사용 기록에 남긴다
import { describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { timeTask } from "@core/task-timer";
import type { Versions } from "@core/types";

const ver: Versions = { app: "t", score: "s", look: "l", faceshape: "f", transfer: "t" };
function setup() {
  const m = memorySink();
  const log = createLogger({ sid: "s1", screen: "answer", part: null, ver }, m.sink);
  let t = 1000;
  const now = (): number => t;
  return { log, events: m.events, now, pass: (ms: number) => { t += ms; } };
}

describe("작업 시간 기록", () => {
  it("TT1 작업이 끝나면 걸린 시간과 결과를 한 줄 남기고, 작업의 답은 그대로 돌려준다", async () => {
    const { log, events, now, pass } = setup();
    const r = await timeTask(log, "answer_make", async () => { pass(23400.6); return { picture: "p" }; }, () => ({ ok: true, gen_ms: 21000, queue_ms: 12000, flux_ms: 8600 }), now);
    expect(r).toEqual({ picture: "p" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "task", task: "answer_make", ms: 23401, ok: true, why: null, gen_ms: 21000, queue_ms: 12000, flux_ms: 8600, screen: "answer", sid: "s1" });
  });

  it("TT2 못 한 작업도 남긴다 — 까닭과 함께", async () => {
    const { log, events, now, pass } = setup();
    await timeTask(log, "answer_make", async () => { pass(1200); return { ok: false, why: "busy" }; }, (r) => ({ ok: r.ok, why: r.why }), now);
    expect(events[0]).toMatchObject({ name: "task", task: "answer_make", ms: 1200, ok: false, why: "busy" });
  });

  it("TT3 작업이 오류로 끝나면 error 로 남기고 오류는 그대로 던진다 — 부르는 쪽 처리가 바뀌지 않는다", async () => {
    const { log, events, now, pass } = setup();
    const boom = new Error("풀지 못함");
    await expect(timeTask(log, "guide_build", async () => { pass(300); throw boom; }, () => ({ ok: true }), now)).rejects.toBe(boom);
    expect(events[0]).toMatchObject({ name: "task", task: "guide_build", ms: 300, ok: false, why: "error" });
  });

  it("TT4 기록하다 오류가 나도 작업의 답은 그대로 돌려준다 — 기록이 화면을 막지 않는다", async () => {
    const { now } = setup();
    const broken = { log: vi.fn(() => { throw new Error("저장소 꽉 참"); }) };
    expect(await timeTask(broken, "feedback_run", async () => 7, () => ({ ok: true }), now)).toBe(7);
    // 답을 읽는 함수가 틀려도 마찬가지
    const { log, events } = setup();
    expect(await timeTask(log, "feedback_run", async () => 7, () => { throw new Error("읽기 실패"); }, now)).toBe(7);
    expect(events).toHaveLength(0);
  });

  it("TT5 남기는 것은 숫자와 짧은 이름뿐 — 없는 값은 빼고, 긴 까닭은 자른다", async () => {
    const { log, events, now } = setup();
    await timeTask(log, "ref_analyze", async () => 1, () => ({ ok: false, why: "x".repeat(200), n: undefined, kb: null }), now);
    const e = events[0] as unknown as Record<string, unknown>;
    expect((e.why as string).length).toBeLessThanOrEqual(40);
    expect("n" in e).toBe(false);
    expect("kb" in e).toBe(false);
  });
});
