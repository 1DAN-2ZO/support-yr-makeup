// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PART_NAME } from "@core/score";
import type { PartId, PartResult, SessionSummary } from "@core/types";
import {
  anchorDownload,
  barRatio,
  CARD_H,
  CARD_W,
  cardLayout,
  fitText,
  partValueText,
  saveCard,
  type CardInput,
  type CardOp,
  type ShareEnv,
} from "@screens/result-card";

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

const summary: SessionSummary = {
  total: 82,
  base: 84.2,
  measuredCount: 5,
  partCount: 5,
  symmetryPenalty: -1.5,
  harmonyPenalty: -0.7,
  harmonyApplied: true,
  computedAt: 0,
};

function input(over: Partial<CardInput> = {}): CardInput {
  return {
    summary,
    parts: [part("brow"), part("lip", { status: "check_only", score: null, checkReason: "faint" })],
    lookName: "데일리",
    bare: null,
    after: null,
    stamp: "abc123 · score-v0.1 · look-v0.1",
    lightingNote: null,
    ...over,
  };
}

const texts = (ops: readonly CardOp[]): string[] =>
  ops.filter((o): o is Extract<CardOp, { op: "text" }> => o.op === "text").map((o) => o.text);

describe("부위 값 표시", () => {
  it("통과는 점수, 나머지는 말로", () => {
    expect(partValueText(part("brow", { score: 79.6 }))).toBe("80");
    expect(partValueText(part("lip", { status: "check_only", score: null }))).toBe("확인만");
    expect(partValueText(part("lip", { status: "skipped", score: null }))).toBe("건너뜀");
    expect(partValueText(part("lip", { status: "not_started", score: null }))).toBe("-");
  });

  it("점수가 없으면 막대가 0 이다", () => {
    expect(barRatio(part("brow", { score: 50 }))).toBe(0.5);
    expect(barRatio(part("brow", { status: "check_only", score: null }))).toBe(0);
    // 점수가 남아 있어도 통과가 아니면 안 그린다
    expect(barRatio(part("brow", { status: "skipped", score: 90 }))).toBe(0);
  });
});

describe("카드 배치", () => {
  it("합산은 숫자만 — 기준 표기도 보정도 안 나온다 (F-10)", () => {
    const t = texts(cardLayout(input()));
    expect(t).toContain("82");
    expect(t.join(" ")).not.toContain("5개");
    expect(t.join(" ")).not.toContain("-1.5");
    expect(t.join(" ")).not.toContain("84.2");
  });

  it("잰 부위가 없으면 — 와 안내", () => {
    const t = texts(cardLayout(input({ summary: { ...summary, total: null, measuredCount: 0 } })));
    expect(t).toContain("—");
    expect(t).toContain("잰 부위가 없어요");
  });

  it("부위마다 이름·막대·값이 한 줄씩", () => {
    const ops = cardLayout(input());
    const t = texts(ops);
    expect(t).toContain(PART_NAME.brow);
    expect(t).toContain(PART_NAME.lip);
    expect(t).toContain("80");
    expect(t).toContain("확인만");
    expect(ops.filter((o) => o.op === "bar")).toHaveLength(2);
  });

  it("사진이 없으면 그 자리에 빈 칸을 둔다", () => {
    const ops = cardLayout(input());
    expect(ops.filter((o) => o.op === "image")).toHaveLength(0);
    expect(ops.filter((o) => o.op === "box")).toHaveLength(2);
  });

  it("버전을 구석에 찍는다", () => {
    const ops = cardLayout(input());
    const stamp = ops.find(
      (o): o is Extract<CardOp, { op: "text" }> => o.op === "text" && o.text.startsWith("abc123"),
    );
    expect(stamp).toBeDefined();
    expect(stamp!.y).toBeGreaterThan(CARD_H - 100);
  });

  it("조명 안내는 있을 때만", () => {
    expect(texts(cardLayout(input()))).not.toContain("조명이 달라요");
    expect(texts(cardLayout(input({ lightingNote: "조명이 달라요" })))).toContain("조명이 달라요");
  });

  it("모든 요소가 카드 안에 들어간다", () => {
    const ops = cardLayout(
      input({ parts: (["brow", "liner", "shadow", "lip", "cheek", "contour"] as PartId[]).map((p) => part(p)) }),
    );
    for (const o of ops) {
      if (o.op === "bg") continue;
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(CARD_W);
      expect(o.y).toBeLessThanOrEqual(CARD_H);
    }
  });
});

describe("결과 저장", () => {
  const blob = new Blob(["x"], { type: "image/jpeg" });

  it("공유가 되면 공유한다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const env: ShareEnv = { canShare: () => true, share, download };
    expect(await saveCard(blob, "a.jpg", env)).toBe("shared");
    expect(download).not.toHaveBeenCalled();
    expect(share.mock.calls[0]?.[0].files[0].name).toBe("a.jpg");
  });

  it("공유가 없으면 내려받는다", async () => {
    const download = vi.fn();
    expect(await saveCard(blob, "a.jpg", { download })).toBe("downloaded");
    expect(download).toHaveBeenCalledOnce();
  });

  it("파일 공유를 못 받는 브라우저면 내려받는다", async () => {
    const share = vi.fn();
    const download = vi.fn();
    expect(await saveCard(blob, "a.jpg", { canShare: () => false, share, download })).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
  });

  it("사용자가 공유 창을 닫으면 몰래 내려받지 않는다", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    const download = vi.fn();
    expect(await saveCard(blob, "a.jpg", { canShare: () => true, share, download })).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });

  it("공유가 다른 이유로 실패하면 내려받기로 넘어간다", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    const download = vi.fn();
    expect(await saveCard(blob, "a.jpg", { canShare: () => true, share, download })).toBe("downloaded");
    expect(download).toHaveBeenCalledOnce();
  });

  it("카드를 못 만들었으면 저장 못 한다고 한다", async () => {
    const download = vi.fn();
    expect(await saveCard(null, "a.jpg", { download })).toBe("unavailable");
    expect(download).not.toHaveBeenCalled();
  });

  it("내려받기까지 막히면 unavailable", async () => {
    const download = vi.fn(() => {
      throw new Error("blocked");
    });
    expect(await saveCard(blob, "a.jpg", { download })).toBe("unavailable");
  });

  it("anchorDownload 는 a[download] 를 한 번 누른다", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    anchorDownload(blob, "b.jpg");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("긴 글자는 폭에 맞춰 말줄임 (#79)", () => {
  const measure = (t: string) => t.length * 10;   // 글자당 10px 인 가짜 폭

  it("F1 들어가면 그대로", () => {
    expect(fitText(measure, "데일리", 30)).toBe("데일리");
  });

  it("F2 넘치면 '…' 을 붙여 폭 안에 들어가는 만큼만", () => {
    expect(fitText(measure, "가나다라마바", 35)).toBe("가나…");
    expect(measure(fitText(measure, "가나다라마바사아자차", 55))).toBeLessThanOrEqual(55);
  });

  it("F3 '…' 도 안 들어가면 빈 글자", () => {
    expect(fitText(measure, "가나다", 5)).toBe("");
  });

  it("F4 카드의 화장 이름·조명 안내 줄은 폭 제한을 갖는다 (글자 수로 자르지 않는다)", () => {
    const ops = cardLayout(input({ lookName: "아주아주아주아주 긴 화장 이름입니다", lightingNote: "조명이 달라서 색은 참고만 해 주세요" }));
    const ts = ops.filter((o) => o.op === "text") as { text: string; maxW?: number }[];
    expect(ts.find((o) => o.text.startsWith("아주"))?.maxW).toBeGreaterThan(0);
    expect(ts.find((o) => o.text.startsWith("조명이"))?.maxW).toBeGreaterThan(0);
  });
});
