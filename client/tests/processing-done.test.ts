// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { mutableJobSource, emptyJobSource } from "@core/look-jobs";
import type { LookJob, Versions } from "@core/types";
import { doneScreen, type DoneDeps } from "@screens/done";
import { processingScreen, type ProcessingDeps } from "@screens/processing";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

function job(lookId: string): LookJob {
  return {
    job_id: `j-${lookId}`,
    look_id: lookId,
    status: "queued",
    result_url: null,
    layer: null,
    identity: { cos: null },
    ms: null,
    queue_ms: null,
    error: null,
    ver,
  };
}

/** 타이머를 손으로 돌린다 — 20초·60초를 실제로 기다리지 않는다 */
function fakeTimers() {
  const fns: { fn: () => void; ms: number; id: number }[] = [];
  let next = 1;
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      fns.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id: unknown) => {
      const i = fns.findIndex((f) => f.id === id);
      if (i !== -1) fns.splice(i, 1);
    },
    /** ms 이하로 걸린 타이머를 전부 터뜨린다 */
    advance(ms: number) {
      for (const f of [...fns].sort((a, b) => a.ms - b.ms)) {
        if (f.ms <= ms) {
          this.clearTimer(f.id);
          f.fn();
        }
      }
    },
    pending: () => fns.length,
  };
}

function setup(over: Partial<ProcessingDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const go = vi.fn();
  const t = fakeTimers();
  const ctx: ScreenContext<null> = {
    root,
    session: null,
    go,
    goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "processing", part: null, ver }, m.sink),
  };
  const deps: ProcessingDeps = {
    jobs: emptyJobSource(),
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
    ...over,
  };
  return { root, ctx, deps, go, timers: t, events: m.events };
}

describe("서버 처리 화면", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("작업이 아직 없으면 기다린다", () => {
    const { root, ctx, deps, go } = setup();
    processingScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("화장을 만들고 있어요");
    expect(go).not.toHaveBeenCalled();
  });

  it("작업이 하나라도 생기면 바로 화면 2 로 — 전부 기다리지 않는다", () => {
    const source = mutableJobSource();
    const { ctx, deps, go } = setup({ jobs: source });
    processingScreen<null>(deps).mount(ctx);
    expect(go).not.toHaveBeenCalled();

    source.push([job("daily")]);
    expect(go).toHaveBeenCalledWith("looks");
  });

  it("들어올 때 이미 작업이 있으면 그냥 넘어간다", () => {
    const source = mutableJobSource([job("daily")]);
    const { ctx, deps, go } = setup({ jobs: source });
    processingScreen<null>(deps).mount(ctx);
    expect(go).toHaveBeenCalledWith("looks");
  });

  it("오래 걸리면 말이 바뀐다 — 숫자는 안 보여 준다", () => {
    const { root, ctx, deps, timers } = setup();
    processingScreen<null>(deps).mount(ctx);
    timers.advance(20_000);
    expect(root.textContent).toContain("조금만 더 기다려 주세요");
    expect(root.textContent).not.toMatch(/\d/);
  });

  it("끝내 안 오면 이용 불가로 (결정 #8)", () => {
    const { root, ctx, deps, timers, events } = setup();
    processingScreen<null>(deps).mount(ctx);
    timers.advance(60_000);
    expect(root.textContent).toContain("지금은 이용할 수 없어요");
    expect(events.some((e) => e.name === "error" && (e as { where: string }).where === "processing")).toBe(true);
  });

  it("이용 불가가 된 뒤에는 작업이 와도 안 넘어간다", () => {
    const source = mutableJobSource();
    const { ctx, deps, go, timers } = setup({ jobs: source });
    processingScreen<null>(deps).mount(ctx);
    timers.advance(60_000);
    source.push([job("daily")]);
    expect(go).not.toHaveBeenCalled();
  });

  it("다시 시도를 주면 버튼이 뜨고, 안 주면 안 뜬다", () => {
    const retry = vi.fn();
    const a = setup({ retry });
    processingScreen<null>(a.deps).mount(a.ctx);
    a.timers.advance(60_000);
    const btn = [...a.root.querySelectorAll("button")].find((b) => b.textContent === "다시 시도");
    expect(btn).toBeDefined();
    btn!.click();
    expect(retry).toHaveBeenCalledOnce();

    const b = setup();
    processingScreen<null>(b.deps).mount(b.ctx);
    b.timers.advance(60_000);
    expect([...b.root.querySelectorAll("button")]).toHaveLength(0);
  });

  it("떠날 때 타이머와 구독을 정리한다", () => {
    const source = mutableJobSource();
    const { ctx, deps, go, timers } = setup({ jobs: source });
    const stop = processingScreen<null>(deps).mount(ctx);
    expect(timers.pending()).toBe(2);

    (stop as () => void)();
    expect(timers.pending()).toBe(0);
    source.push([job("daily")]);
    expect(go).not.toHaveBeenCalled();
  });
});

function setupDone(over: Partial<DoneDeps> = {}) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const restart = vi.fn();
  const ctx: ScreenContext<null> = {
    root,
    session: null,
    go: vi.fn(),
    goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "done", part: null, ver }, m.sink),
  };
  return { root, ctx, deps: { restart, ...over } as DoneDeps, restart, events: m.events };
}

describe("끝 화면 (F-11)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("다 지웠으면 그렇게 말한다", () => {
    const { root, ctx, deps } = setupDone({ remaining: () => 0 });
    doneScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("모두 지웠어요");
    // 테스트 기간에는 서버에 사진이 남아 있다 — "서버에도 남아 있지 않아요" 는 틀린 말이었다 (2026-10-12)
    expect(root.textContent).not.toContain("서버에도 남아 있지 않아요");
    expect(root.textContent).toContain("서버에 보관한 사진은 10월 19일 오후 5시에 지워요");
  });

  it("남은 게 있으면 다르게 말하고 로그를 남긴다 — 숫자는 화면에 안 낸다", () => {
    const { root, ctx, deps, events } = setupDone({ remaining: () => 3 });
    doneScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("일부 기록이 남았어요");
    expect(root.textContent).not.toContain("3");
    const err = events.find((e) => e.name === "error");
    expect((err as { msg: string }).msg).toBe("clear_remaining:3");
  });

  it("remaining 을 안 주면 다 지운 것으로 본다", () => {
    const { root, ctx, deps } = setupDone();
    doneScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("모두 지웠어요");
  });

  it("다시 하기를 누르면 restart 를 부르고 로그를 남긴다", () => {
    const { root, ctx, deps, restart, events } = setupDone();
    doneScreen<null>(deps).mount(ctx);
    const btn = [...root.querySelectorAll("button")].find((b) => b.textContent === "다시 하기");
    btn!.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(events.some((e) => e.name === "button" && (e as { button: string }).button === "restart")).toBe(true);
  });
});
