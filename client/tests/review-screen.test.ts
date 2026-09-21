// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, memorySink } from "@core/log";
import { PART_NAME } from "@core/score";
import type { PartId, PartResult, Versions } from "@core/types";
import { reviewScreen, type ReviewDeps } from "@screens/review";
import type { ScreenContext } from "@screens/shell";

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

function part(partId: PartId, over: Partial<PartResult> = {}): PartResult {
  return {
    partId,
    status: "passed",
    score: 80,
    diagnosisCodes: [],
    diagnosis: "",
    checkReason: null,
    lrIndex: null,
    metrics: {},
    attempts: 1,
    updatedAt: 0,
    ...over,
  };
}

const ALL: PartId[] = ["brow", "liner", "shadow", "lip", "cheek", "contour"];

function setup(over: Partial<ReviewDeps> = {}, parts: PartResult[] = ALL.map((p) => part(p))) {
  document.body.innerHTML = `<div id="root"></div>`;
  const root = document.getElementById("root") as HTMLElement;
  const m = memorySink();
  const go = vi.fn();
  const goPart = vi.fn();
  const clearAll = vi.fn().mockResolvedValue({ remaining: 0 });
  const ctx: ScreenContext<null> = {
    root,
    session: null,
    go,
    goPart,
    log: createLogger({ sid: "s1", screen: "review", part: null, ver }, m.sink),
  };
  const deps: ReviewDeps = {
    getParts: () => parts,
    getLookName: () => "데일리",
    lightingNote: () => null,
    store: { clearAll, loadImage: vi.fn().mockResolvedValue(null) },
    makeCard: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/jpeg" })),
    shareEnv: { download: vi.fn() },
    ...over,
  };
  return { root, ctx, deps, go, goPart, clearAll, events: m.events };
}

const btn = (root: HTMLElement, text: string): HTMLButtonElement => {
  const f = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
  if (!f) throw new Error(`"${text}" 버튼이 없습니다`);
  return f;
};

/** mount 안의 비동기(사진·카드)가 끝날 때까지 */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("화면 6 — 전체 리뷰", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("합산은 숫자만 크게 — 기준 표기도 보정도 없다 (F-10)", () => {
    const { root, ctx, deps } = setup();
    reviewScreen<null>(deps).mount(ctx);
    // 전부 80 점이고 대칭·조화 입력(lrDiff·colorAb)이 없어서 보정 0 → 합산 80
    expect(root.querySelector(".total-num")?.textContent).toBe("80");
    expect(root.textContent).not.toContain("6개");
    expect(root.textContent).not.toContain("보정");
  });

  it("부위 6줄이 나오고 각 줄에 이름·값·한 줄 평이 있다", () => {
    const { root, ctx, deps } = setup();
    reviewScreen<null>(deps).mount(ctx);
    const rows = root.querySelectorAll("button.part-row");
    expect(rows).toHaveLength(6);
    expect(rows[0]?.querySelector(".part-name")?.textContent).toBe(PART_NAME.brow);
    expect(rows[0]?.querySelector(".part-val")?.textContent).toBe("80");
    expect(rows[0]?.querySelector(".part-say")?.textContent).toBeTruthy();
  });

  it("확인만·건너뜀은 점수 대신 말로 나오고 막대가 안 찬다", () => {
    const { root, ctx, deps } = setup({}, [
      part("brow", { status: "check_only", score: null, checkReason: "faint" }),
      part("lip", { status: "skipped", score: null }),
    ]);
    reviewScreen<null>(deps).mount(ctx);
    const rows = root.querySelectorAll("button.part-row");
    expect(rows[0]?.querySelector(".part-val")?.textContent).toBe("확인만");
    expect(rows[1]?.querySelector(".part-val")?.textContent).toBe("건너뜀");
    expect((rows[0]?.querySelector(".part-fill") as HTMLElement).style.width).toBe("0%");
  });

  it("부위 줄을 누르면 그 부위 완성본으로 간다", () => {
    const { root, ctx, deps, goPart, events } = setup();
    reviewScreen<null>(deps).mount(ctx);
    (root.querySelectorAll<HTMLButtonElement>("button.part-row")[3] as HTMLButtonElement).click();
    expect(goPart).toHaveBeenCalledWith("lip");
    expect(events.some((e) => e.name === "button" && (e as { button: string }).button === "review_part:lip")).toBe(true);
  });

  it("잰 부위가 없으면 — 와 안내를 띄운다", () => {
    const { root, ctx, deps } = setup({}, ALL.map((p) => part(p, { status: "not_started", score: null })));
    reviewScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".total-num")?.textContent).toBe("—");
    expect(root.textContent).toContain("잰 부위가 없어요");
  });

  it("조명이 다르면 한 줄 띄운다", () => {
    const { root, ctx, deps } = setup({ lightingNote: () => "조명이 달라 색은 참고만 해 주세요" });
    reviewScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".lighting-note")?.textContent).toContain("참고만");
  });

  it("쌩얼·지금 두 자리를 만들고, 사진이 없으면 없음이라고 쓴다", async () => {
    const { root, ctx, deps } = setup();
    reviewScreen<null>(deps).mount(ctx);
    expect(root.querySelectorAll(".photo")).toHaveLength(2);
    await settle();
    expect(root.querySelector('.photo[data-which="bare"] .photo-slot')?.textContent).toBe("없음");
  });
});

describe("화면 6 — 결과 저장", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("카드가 준비되기 전에는 저장을 못 누른다", async () => {
    const { root, ctx, deps } = setup();
    reviewScreen<null>(deps).mount(ctx);
    expect(btn(root, "결과 저장").disabled).toBe(true);
    await settle();
    expect(btn(root, "결과 저장").disabled).toBe(false);
  });

  it("카드는 버튼을 누르기 전에 미리 만든다 (iOS 제스처)", async () => {
    const makeCard = vi.fn().mockResolvedValue(new Blob(["x"]));
    const { ctx, deps } = setup({ makeCard });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    // 아직 아무것도 안 눌렀는데 이미 만들어져 있어야 한다
    expect(makeCard).toHaveBeenCalledOnce();
  });

  it("카드에 버전과 룩 이름이 들어간다", async () => {
    const makeCard = vi.fn().mockResolvedValue(new Blob(["x"]));
    const { ctx, deps } = setup({ makeCard });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    const arg = makeCard.mock.calls[0]?.[0];
    expect(arg.lookName).toBe("데일리");
    expect(arg.stamp).toContain("score-v0.1");
  });

  it("저장을 누르면 결과를 말해 주고 로그를 남긴다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const { root, ctx, deps, events } = setup({
      shareEnv: { canShare: () => true, share, download: vi.fn() },
    });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    btn(root, "결과 저장").click();
    await settle();
    expect(share).toHaveBeenCalledOnce();
    expect(root.querySelector(".save-msg")?.textContent).toContain("저장");
    expect(events.some((e) => e.name === "button" && (e as { button: string }).button === "save_result")).toBe(true);
  });

  it("카드를 못 만들면 저장 대신 안내를 띄운다", async () => {
    const { root, ctx, deps } = setup({ makeCard: vi.fn().mockResolvedValue(null) });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    expect(root.querySelector(".save-msg")?.textContent).toContain("캡처");
  });
});

describe("화면 6 — 끝내기 (F-11)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("세션을 지우고 done 으로 간다", async () => {
    const { root, ctx, deps, go, clearAll } = setup();
    reviewScreen<null>(deps).mount(ctx);
    btn(root, "끝내기").click();
    await settle();
    expect(clearAll).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledWith("done");
  });

  it("끝내기 전에 세션 종료를 기록한다 — 지우고 나면 못 남긴다", () => {
    const { root, ctx, deps, events } = setup();
    reviewScreen<null>(deps).mount(ctx);
    btn(root, "끝내기").click();
    const end = events.find((e) => e.name === "session_end");
    expect(end).toBeDefined();
    expect((end as { reason: string }).reason).toBe("finish");
  });

  it("두 번 눌러도 한 번만 지운다", async () => {
    const { root, ctx, deps, clearAll } = setup();
    reviewScreen<null>(deps).mount(ctx);
    const b = btn(root, "끝내기");
    b.click();
    b.click();
    await settle();
    expect(clearAll).toHaveBeenCalledOnce();
  });

  it("화면을 떠난 뒤에는 화면을 건드리지 않는다", async () => {
    const { ctx, deps, go } = setup();
    const stop = reviewScreen<null>(deps).mount(ctx);
    (stop as () => void)();
    await settle();
    expect(go).not.toHaveBeenCalled();
  });
});
