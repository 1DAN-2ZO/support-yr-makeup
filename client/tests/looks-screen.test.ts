// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { mutableJobSource } from "@core/look-jobs";
import { CONTOUR_PRODUCTS, LOOKS } from "@core/looks";
import type { PersonalPlan } from "@core/personalize";
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
  let finish: (ok: boolean) => void = () => {};
  const personalize = vi.fn((_id: string) => new Promise<void>((res, rej) => { finish = (ok) => (ok ? res() : rej(new Error("개인화 실패"))); }));
  const deps = {
    jobs: source,
    getLookId: () => state.lookId,
    setLookId: (id: string) => {
      state.lookId = id;
    },
    personalize,
  };
  return { root, ctx, go, deps, source, state, events: m.events, personalize, finish: (ok: boolean) => finish(ok) };
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
  });

  it("끝난 룩만 누를 수 있다", () => {
    const { root, ctx, deps } = setup([job("smoky", "done", "/r/smoky.png"), job("coral", "error")]);
    looksScreen<null>(deps).mount(ctx);
    const byId = new Map(LOOKS.map((l, i) => [l.id, cards(root)[i] as HTMLButtonElement]));
    expect(byId.get("smoky")?.disabled).toBe(false);
    expect(byId.get("coral")?.disabled).toBe(true);
    expect(byId.get("coral")?.textContent).toContain("준비 중");
  });

  it("누르면 그 룩을 고르고 '개인화 중입니다' — 끝나면 2-b(AR)로 간다 (2026-09-28 흐름)", async () => {
    const { root, ctx, go, deps, state, personalize, finish } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    expect(state.lookId).toBe("daily");
    expect(personalize).toHaveBeenCalledWith("daily");
    expect(root.querySelector(".personalizing")?.textContent).toContain("개인화 중입니다");
    expect(go).not.toHaveBeenCalled();
    finish(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(go).toHaveBeenCalledWith("fullrender");
  });

  it("개인화가 금방 끝나도 '개인화 중입니다' 는 최소 시간만큼 보여 준다 (2026-09-29 폰: 안 보였음)", async () => {
    vi.useFakeTimers();
    try {
      const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")]);
      looksScreen<null>({ ...deps, personalize: () => Promise.resolve(), minBusyMs: 1500 }).mount(ctx);
      (cards(root)[0] as HTMLButtonElement).click();
      await vi.advanceTimersByTimeAsync(1400);
      expect(go).not.toHaveBeenCalled();
      expect(root.querySelector(".personalizing")).not.toBeNull();
      await vi.advanceTimersByTimeAsync(200);
      expect(go).toHaveBeenCalledWith("fullrender");
    } finally {
      vi.useRealTimers();
    }
  });

  it("개인화 페이지에서 '다른 화장 고르기' 로 돌아가면, 개인화가 끝나도 2-b 로 끌려가지 않는다", async () => {
    const { root, ctx, go, deps, finish } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    byText(root, "다른 화장 고르기").click();
    expect(root.querySelector(".personalizing")).toBeNull();
    finish(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(go).not.toHaveBeenCalled();
  });

  it("취소한 화장을 다시 누르면 새로 최소 시간을 기다린다 — 앞 요청이 먼저 끝나도 끌려가지 않음 (#172 리뷰)", async () => {
    vi.useFakeTimers();
    try {
      let done: () => void = () => {};
      const plan = new Promise<void>((r) => { done = r; });
      const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")]);
      looksScreen<null>({ ...deps, personalize: () => plan, minBusyMs: 1500 }).mount(ctx);
      (cards(root)[0] as HTMLButtonElement).click();          // t=0
      await vi.advanceTimersByTimeAsync(1000);
      byText(root, "다른 화장 고르기").click();
      (cards(root)[0] as HTMLButtonElement).click();          // t=1000 — 다시
      await vi.advanceTimersByTimeAsync(600);                  // 첫 요청 최소 시간(1500) 지남
      done();
      await vi.advanceTimersByTimeAsync(0);
      expect(go).not.toHaveBeenCalled();                        // 두 번째 요청은 t=2500 까지
      await vi.advanceTimersByTimeAsync(1000);
      expect(go).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("이미 개인화한 화장은 기다리지 않고 바로 2-b 로 간다 (화장마다 한 번)", () => {
    const { root, ctx, go, deps, personalize } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>({ ...deps, minBusyMs: 1500, isPersonalized: (id) => id === "daily" }).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    expect(go).toHaveBeenCalledWith("fullrender");
    expect(personalize).not.toHaveBeenCalled();
    expect(root.querySelector(".personalizing")).toBeNull();
  });

  it("개인화가 실패하면 룩 화면에 남고 다시 누르라고 말한다", async () => {
    const { root, ctx, go, deps, finish } = setup([job("daily", "done", "/r/daily.png")]);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    finish(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(go).not.toHaveBeenCalled();
    expect(root.querySelector(".personalizing")).toBeNull();
    expect(root.textContent).toContain("다시 눌러");
  });

  it("개인화 중에 다른 룩을 누르면 마지막에 누른 룩으로 간다", async () => {
    const { root, ctx, go, deps, state, personalize, finish } = setup([job("daily", "done", "/r/d.png"), job("smoky", "done", "/r/s.png")]);
    looksScreen<null>(deps).mount(ctx);
    (cards(root)[0] as HTMLButtonElement).click();
    (cards(root)[1] as HTMLButtonElement).click();
    expect(state.lookId).toBe("smoky");
    expect(personalize).toHaveBeenLastCalledWith("smoky");
    finish(true);                                   // 마지막 요청(smoky)이 끝남
    await new Promise((r) => setTimeout(r, 0));
    expect(go).toHaveBeenCalledTimes(1);
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

describe("화면 2-b — AR 완성 예상 (카메라를 못 열면 서버 그림)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("고른 룩의 그림을 보여 준다", () => {
    const { root, ctx, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".full-img img")?.getAttribute("src")).toBe("/r/daily.png");
    expect(root.querySelector("h1")?.textContent).toContain(LOOKS[0]?.name ?? "");
  });

  it("그림이 없어도 '화장하러 가기' 로 부위 반복을 시작한다", () => {
    const { root, ctx, go, deps } = setup([job("daily", "running")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".full-img")?.textContent).toBe("준비 중");
    const start = byText(root, "화장하러 가기");
    expect(start.disabled).toBe(false);
    start.click();
    expect(go).toHaveBeenCalledWith("guide");
  });

  it("개인화 근거 문장과 쓰는 제품을 보여 준다 (제품 목록은 룩 화면에서 옮겨 옴)", () => {
    const { root, ctx, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    const plan = { rationale: { liner: "눈꼬리가 올라가 있어서 꼬리를 위로 뺐어요" } } as unknown as PersonalPlan;
    fullRenderScreen<null>({ ...deps, getPlan: () => plan }).mount(ctx);
    expect(root.querySelector(".ar-why")?.textContent).toContain("눈꼬리가 올라가 있어서");
    const items = root.querySelectorAll(".look-detail li");
    expect(items).toHaveLength((LOOKS[0]?.products.length ?? 0) + CONTOUR_PRODUCTS.length);
  });

  it("계획이 없으면 근거 줄을 그리지 않는다", () => {
    const { root, ctx, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>({ ...deps, getPlan: () => null }).mount(ctx);
    expect(root.querySelector(".ar-why")).toBeNull();
  });

  it("맨 위에도 뒤로 가기가 있다 — 카메라·제품 목록에 밀려 아래 버튼이 안 보여도 (2026-09-29 폰)", () => {
    const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    const top = root.querySelector<HTMLButtonElement>(".fullrender > .back");
    expect(top).not.toBeNull();
    expect(root.querySelector(".fullrender")?.firstElementChild).toBe(top);
    top!.click();
    expect(go).toHaveBeenCalledWith("looks");
  });

  it("다른 화장 보기로 화면 2 로 돌아간다", () => {
    const { root, ctx, go, deps } = setup([job("daily", "done", "/r/daily.png")], "daily");
    fullRenderScreen<null>(deps).mount(ctx);
    byText(root, "다른 화장 보기").click();
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
