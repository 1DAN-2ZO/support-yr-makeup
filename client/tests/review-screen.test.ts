// @vitest-environment jsdom
import { SCORE_VERSION } from "@core/score";
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
    expect(arg.stamp).toContain(SCORE_VERSION);   // rules/score.json (#44)
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

describe("화면 6 — 들어오면 지금 얼굴 정면 1장 (#79)", () => {
  // jsdom 에는 없다 — 사진 칸이 Blob 을 보여 줄 때 쓴다
  beforeEach(() => { (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:test"; });
  const shot = { blob: new Blob(["jpg"], { type: "image/jpeg" }), foreheadL: 70 };
  /** 카메라 대신: 부르면 host 에 표시만 하고, done 은 시험에서 누른다 */
  const fakeShoot = () => {
    let finish: (r: typeof shot | null) => void = () => {};
    const shoot = vi.fn((host: HTMLElement, done: (r: typeof shot | null) => void) => {
      host.append(document.createTextNode("카메라"));
      finish = done;
      return vi.fn();
    });
    return { shoot, finish: (r: typeof shot | null) => finish(r) };
  };
  const btnOf = (root: HTMLElement, text: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

  it("R1 '지금' 사진이 없으면 카메라 칸을 먼저 띄운다 — 찍기 전엔 저장을 못 누른다", async () => {
    const { shoot } = fakeShoot();
    const { root, ctx, deps } = setup({ shoot });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    expect(shoot).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".review-shot")).not.toBeNull();
    expect(btnOf(root, "결과 저장")?.disabled).toBe(true);
  });

  it("R2 찍으면 lastframe 으로 저장하고, 조명이 다르면 한 줄, 카드는 그 사진·문구로 만든다", async () => {
    const { shoot, finish } = fakeShoot();
    const saveImage = vi.fn().mockResolvedValue(undefined);
    const lightingNote = vi.fn((L?: number | null) => (L === 70 ? "조명이 달라서 색은 참고만 해 주세요" : null));
    const makeCard = vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    const { root, ctx, deps } = setup({ shoot, lightingNote, makeCard, store: { clearAll: vi.fn(), loadImage: vi.fn().mockResolvedValue(null), saveImage } });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    finish(shot);
    await settle(); await settle();
    expect(saveImage).toHaveBeenCalledWith("lastframe", shot.blob);
    expect(root.querySelector(".review-shot")).toBeNull();
    expect(root.querySelector('.photo[data-which="after"] img')).not.toBeNull();
    expect(root.querySelector(".lighting-note")?.textContent).toBe("조명이 달라서 색은 참고만 해 주세요");
    const input = makeCard.mock.calls.at(-1)![0] as { after: unknown; lightingNote: string | null };
    expect(input.after).not.toBeNull();
    expect(input.lightingNote).toBe("조명이 달라서 색은 참고만 해 주세요");
    expect(btnOf(root, "결과 저장")?.disabled).toBe(false);
  });

  it("R3 건너뛰면 사진 없이 이어간다 — 저장하지 않고, 카드는 만든다", async () => {
    const { shoot, finish } = fakeShoot();
    const saveImage = vi.fn();
    const { root, ctx, deps } = setup({ shoot, store: { clearAll: vi.fn(), loadImage: vi.fn().mockResolvedValue(null), saveImage } });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    finish(null);
    await settle(); await settle();
    expect(saveImage).not.toHaveBeenCalled();
    expect(root.querySelector(".review-shot")).toBeNull();
    expect(btnOf(root, "결과 저장")?.disabled).toBe(false);
  });

  it("R4 이미 '지금' 사진이 있으면(되살린 세션) 카메라를 안 연다", async () => {
    const { shoot } = fakeShoot();
    const loadImage = vi.fn((k: string) => Promise.resolve(k === "lastframe" ? new Blob(["a"]) : null));
    const { ctx, deps } = setup({ shoot, store: { clearAll: vi.fn(), loadImage, saveImage: vi.fn() } });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    expect(shoot).not.toHaveBeenCalled();
  });

  it("R5 화면을 떠나면 카메라를 끈다", async () => {
    const { shoot } = fakeShoot();
    const { ctx, deps } = setup({ shoot });
    const stop = reviewScreen<null>(deps).mount(ctx) as () => void;
    await settle();
    const cameraStop = shoot.mock.results[0]!.value as ReturnType<typeof vi.fn>;
    stop();
    expect(cameraStop).toHaveBeenCalled();
  });

  it("R6 저장 파일 이름은 nudy.jpg", async () => {
    const download = vi.fn();
    const { root, ctx, deps } = setup({ shareEnv: { download } });
    reviewScreen<null>(deps).mount(ctx);
    await settle();
    btnOf(root, "결과 저장")!.click();
    await settle();
    expect(download.mock.calls[0]![1]).toBe("nudy.jpg");
  });
});


describe("화면 6 — 공유 창 안내는 누르기 전에 (#79)", () => {
  it("S1 공유 창을 쓸 수 있으면 저장 버튼 아래에 '이미지 저장을 눌러 주세요' 가 처음부터 있다", () => {
    const { root, ctx, deps } = setup({ shareEnv: { download: vi.fn(), share: vi.fn(), canShare: () => true } });
    reviewScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".share-hint")?.textContent).toContain("이미지 저장");
  });

  it("S2 내려받기만 되는 곳(데스크톱)에서는 안 띄운다", () => {
    const { root, ctx, deps } = setup({ shareEnv: { download: vi.fn() } });
    reviewScreen<null>(deps).mount(ctx);
    expect(root.querySelector(".share-hint")).toBeNull();
  });
});
