// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { mutableJobSource } from "@core/look-jobs";
import { CONTOUR_PRODUCTS, LOOKS } from "@core/looks";
import type { JobStatus, LookJob, Versions } from "@core/types";
import { fullRenderScreen } from "@screens/fullrender";
import { looksScreen } from "@screens/looks";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

function job(lookId: string, status: JobStatus, url: string | null = null): LookJob {
  return {
    job_id: `j-${lookId}`,
    look_id: lookId,
    status,
    result_url: url,
    layer: null,
    identity: { cos: 0.9 },
    ms: 1200,
    queue_ms: 30,
    error: null,
    ver,
  };
}

function setup(jobs: LookJob[] = [], lookId: string | null = null) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const source = mutableJobSource(jobs);
  const state = { lookId };
  const go = vi.fn();
  const ctx: ScreenContext<null> = {
    root,
    session: null,
    go,
    goPart: vi.fn(),
    log: createLogger({ sid: "s1", screen: "looks", part: null, ver }, m.sink),
  };
  const deps = {
    jobs: source,
    getLookId: () => state.lookId,
    setLookId: (id: string) => {
      state.lookId = id;
    },
  };
  return { root, ctx, go, deps, source, state, events: m.events };
}

function cards(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>("button.look-card")];
}

function byText(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  );
  if (!found) throw new Error(`"${text}" 버튼이 없습니다`);
  return found;
}

describe("화면 2 — 룩 선택", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("서버가 아직 없어도 룩 10개가 로딩 중으로 뜬다", () => {
    const { root, ctx, deps } = setup();
    looksScreen<null>(deps).mount(ctx);
    const cs = cards(root);
    expect(cs).toHaveLength(LOOKS.length);
    expect(cs.every((c) => c.disabled)).toBe(true);
    expect(root.querySelector(".look-thumb")?.textContent).toBe("로딩 중");
    expect(byText(root, "이 룩으로 시작").disabled).toBe(true);
  });

  it("끝난 룩만 누를 수 있다", () => {
    const { root, ctx, deps } = setup([job("smoky", "done", "/r/smoky.png"), job("coral", "error")]);
    looksScreen<null>(deps).mount(ctx);
    const byId = new Map(LOOKS.map((l, i) => [l.id, cards(root)[i] as HTMLButtonElement]));
    expect(byId.get("smoky")?.disabled).toBe(false);
    expect(byId.get("coral")?.disabled).toBe(true);
    expect(byId.get("coral")?.textContent).toContain("준비 중");
  });

  it("고르면 제품 목록이 접힘 없이 전부 나온다 (F-04)", () => {
    const { root, ctx, deps, state } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();

    expect(state.lookId).toBe("daily");
    const items = root.querySelectorAll(".look-detail li");
    const look = LOOKS[0];
    expect(items).toHaveLength((look?.products.length ?? 0) + CONTOUR_PRODUCTS.length);
    expect(root.querySelectorAll("details")).toHaveLength(0);
  });

  it("고른 다음에야 시작할 수 있고 2-b 로 간다", () => {
    const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    expect(byText(root, "이 룩으로 시작").disabled).toBe(true);
    (cards(root)[0] as HTMLButtonElement).click();
    byText(root, "이 룩으로 시작").click();
    expect(go).toHaveBeenCalledWith("fullrender");
  });

  it("나중에 도착한 룩이 화면에 들어온다", () => {
    const { root, ctx, deps, source } = setup();
    looksScreen<null>(deps).mount(ctx);
    expect(cards(root).every((c) => c.disabled)).toBe(true);

    source.push([job("daily", "done", "/r/daily.png")]);
    expect((cards(root)[0] as HTMLButtonElement).disabled).toBe(false);
    expect(root.querySelector(".look-thumb img")?.getAttribute("src")).toBe("/r/daily.png");
  });

  it("전부 실패하면 다시 오라고 말한다", () => {
    const { root, ctx, deps } = setup(LOOKS.map((l) => job(l.id, "error")));
    looksScreen<null>(deps).mount(ctx);
    expect(root.textContent).toContain("잠시 후 다시 열어 주세요");
  });

  it("끝난 작업은 한 번만 로그로 남는다", () => {
    const { ctx, deps, source, events } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    source.push([job("daily", "done", "/r/daily.png"), job("smoky", "fallback")]);

    const logged = events.filter((e) => e.name === "look_job");
    expect(logged).toHaveLength(2);
    expect(logged.map((e) => (e as { look_id: string }).look_id)).toEqual(["daily", "smoky"]);
    expect((logged[1] as { error: string | null }).error).toBe("fallback");
  });

  it("떠날 때 구독을 끊는다", () => {
    const { ctx, deps, source, root } = setup();
    const stop = looksScreen<null>(deps).mount(ctx);
    expect(typeof stop).toBe("function");
    (stop as () => void)();
    root.textContent = "";
    source.push([job("daily", "done", "/r/daily.png")]);
    expect(root.textContent).toBe("");
  });
});

describe("화면 2-b — 전체 완성 예상", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("고른 룩의 그림을 보여 준다", () => {
    const { root, ctx, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".full-img img")?.getAttribute("src")).toBe("/r/daily.png");
    expect(root.querySelector("h1")?.textContent).toContain(LOOKS[0]?.name ?? "");
  });

  it("그림이 없어도 시작을 막지 않는다", () => {
    const { root, ctx, go, deps } = setup([job("daily", "running")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".full-img")?.textContent).toBe("준비 중");
    const start = byText(root, "시작");
    expect(start.disabled).toBe(false);
    start.click();
    expect(go).toHaveBeenCalledWith("guide");
  });

  it("다른 룩 보기로 화면 2 로 돌아간다", () => {
    const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    byText(root, "다른 룩 보기").click();
    expect(go).toHaveBeenCalledWith("looks");
  });

  it("그림이 늦게 와도 화면이 따라간다", () => {
    const { root, ctx, deps, source } = setup([], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".full-img.empty")).not.toBeNull();
    source.push([job("daily", "done", "/r/daily.png")]);
    expect(root.querySelector(".full-img img")?.getAttribute("src")).toBe("/r/daily.png");
  });
});
