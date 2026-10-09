// @vitest-environment jsdom
// 화면 7 저장 · 공유 잇기 (⑥) — 결과 한 장(정답사진 · 내 화장 · 부위별 문장)의 배치와, 폰에 내보내는 길
import { describe, expect, it, vi } from "vitest";
import type { WholeFeedback } from "@core/feedback-whole";
import { CARD_TEXT, FEEDBACK_CARD_W, feedbackCardLayout, prepareSave, wrapText, type FeedbackCardOp } from "@screens/feedback-card";
import type { ShareEnv } from "@screens/result-card";

const fb = (over: Partial<WholeFeedback> = {}): WholeFeedback => ({
  parts: [
    { part: "brow", name: "눈썹", tone: "ok", line: "예상 메이크업과 비슷해요" },
    { part: "shadow", name: "섀도우", tone: "fix", line: "오른쪽 눈이 비었어요", more: "눈꼬리 바깥으로 더 나갔어요", fix: "오른쪽 눈두덩에도 발라 보세요" },
    { part: "liner", name: "라이너", tone: "info", line: "이번에는 볼 수 없었어요" },
    { part: "lip", name: "입술", tone: "fix", line: "입술선 밖으로 나갔어요", fix: "입술선 안쪽으로 정리해 보세요" },
  ],
  ok: ["눈썹"], fix: ["섀도우", "입술"],
  ...over,
});
const texts = (ops: readonly FeedbackCardOp[]): string[] => ops.flatMap((o) => (o.op === "text" ? [o.text] : []));
const yOf = (ops: readonly FeedbackCardOp[], text: string): number => { const o = ops.find((x) => x.op === "text" && x.text === text); if (!o || o.op !== "text") throw new Error(`없음: ${text}`); return o.y; };

describe("결과 한 장 배치 (feedbackCardLayout)", () => {
  it("FC1 사진 두 장(정답사진 · 내 화장)이 같은 크기로 나란히, 그 아래 요약 · 부위별 문장", () => {
    const { ops, height } = feedbackCardLayout(fb());
    const imgs = ops.filter((o) => o.op === "image");
    expect(imgs.map((o) => (o.op === "image" ? o.which : ""))).toEqual(["answer", "attempt"]);
    const [a, b] = imgs as Extract<FeedbackCardOp, { op: "image" }>[];
    expect([a!.w, a!.h, a!.y]).toEqual([b!.w, b!.h, b!.y]);
    expect(a!.x + a!.w).toBeLessThan(b!.x);
    expect(b!.x + b!.w).toBeLessThanOrEqual(FEEDBACK_CARD_W);
    const t = texts(ops);
    expect(t).toEqual(expect.arrayContaining([CARD_TEXT.answer, CARD_TEXT.attempt, "눈썹", "예상 메이크업과 비슷해요", "오른쪽 눈이 비었어요", "눈꼬리 바깥으로 더 나갔어요"]));
    expect(yOf(ops, "눈썹")).toBeGreaterThan(a!.y + a!.h);
    expect(height).toBeGreaterThan(yOf(ops, "입술"));
  });

  it("FC2 부위는 받은 순서 그대로 위에서 아래로, 고치는 방법은 화살표를 붙여 그 부위 문장 아래에", () => {
    const { ops } = feedbackCardLayout(fb());
    const ys = ["눈썹", "섀도우", "라이너", "입술"].map((n) => yOf(ops, n));
    expect([...ys].sort((p, q) => p - q)).toEqual(ys);
    const fix = `${CARD_TEXT.fixMark} 오른쪽 눈두덩에도 발라 보세요`;
    expect(yOf(ops, fix)).toBeGreaterThan(yOf(ops, "오른쪽 눈이 비었어요"));
    expect(yOf(ops, fix)).toBeLessThan(yOf(ops, "라이너"));
  });

  it("FC3 요약 두 묶음 — 비어 있는 묶음은 줄을 만들지 않는다", () => {
    const t = texts(feedbackCardLayout(fb()).ops);
    expect(t).toContain("눈썹");
    expect(t).toEqual(expect.arrayContaining([CARD_TEXT.okHead, CARD_TEXT.fixHead, "섀도우 · 입술"]));
    const none = texts(feedbackCardLayout(fb({ ok: [], fix: [] })).ops);
    expect(none).not.toContain(CARD_TEXT.okHead);
    expect(none).not.toContain(CARD_TEXT.fixHead);
  });

  it("FC4 숫자 · 점수를 넣지 않는다", () => {
    for (const t of texts(feedbackCardLayout(fb()).ops)) expect(/\d/.test(t), t).toBe(false);
  });

  it("FC5 긴 문장은 잘리지 않고 줄을 바꾼다 — 문장은 앞으로 바뀔 수 있다 (#318: 30자쯤까지)", () => {
    const long = "왼쪽 눈썹 꼬리가 예상 메이크업보다 짧고 오른쪽 눈썹 앞머리는 예상 메이크업보다 조금 진해요";
    expect(wrapText(long, 20).join("").replace(/ /g, "")).toBe(long.replace(/ /g, ""));   // 글자를 잃지 않는다
    expect(wrapText(long, 20).every((l) => [...l].length <= 20)).toBe(true);
    expect(wrapText("예상 메이크업과 비슷해요", 20)).toEqual(["예상 메이크업과 비슷해요"]);
    const short = feedbackCardLayout(fb()), tall = feedbackCardLayout(fb({ parts: [{ part: "brow", name: "눈썹", tone: "fix", line: long, fix: long }, ...fb().parts.slice(1)] }));
    expect(tall.height).toBeGreaterThan(short.height);
    expect(texts(tall.ops).join("").replace(/ /g, "")).toContain(long.replace(/ /g, ""));
  });

  it("FC6 부위가 줄면 그만큼 짧아진다 (볼 수 없던 부위는 줄이 빠질 수 있다)", () => {
    expect(feedbackCardLayout(fb({ parts: fb().parts.slice(0, 2) })).height).toBeLessThan(feedbackCardLayout(fb()).height);
  });
});

describe("폰에 내보내기 (prepareSave)", () => {
  const blob = new Blob(["card"], { type: "image/jpeg" });
  const view = (feedback: WholeFeedback) => ({ feedback, answer: new Blob(["a"]), attempt: new Blob(["t"]) });
  const env = (over: Partial<ShareEnv> = {}): ShareEnv => ({ download: vi.fn(), ...over });

  it("FC7 카드는 미리 만들어 둔다 — 누른 뒤에 그리면 iOS 가 공유 창을 안 열어 준다", async () => {
    const makeCard = vi.fn(async () => blob);
    const kit = await prepareSave(view(fb()), { env: env(), makeCard });
    expect(makeCard).toHaveBeenCalledTimes(1);
    expect(kit?.card).toBe(blob);
    await kit!.save();
    expect(makeCard).toHaveBeenCalledTimes(1);   // 저장할 때 다시 만들지 않는다
  });

  it("FC8 공유 창이 있으면 공유로, 없으면 내려받기로 — 사용자가 공유 창을 닫은 것은 취소", async () => {
    const share = vi.fn(async () => {});
    const withShare = await prepareSave(view(fb()), { env: env({ canShare: () => true, share }), makeCard: async () => blob });
    expect(withShare!.usesShareSheet).toBe(true);
    expect(await withShare!.save()).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);

    const download = vi.fn();
    const plain = await prepareSave(view(fb()), { env: env({ download }), makeCard: async () => blob });
    expect(plain!.usesShareSheet).toBe(false);
    expect(await plain!.save()).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(blob, "nudy.jpg");

    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    const cancelled = await prepareSave(view(fb()), { env: env({ canShare: () => true, share: async () => { throw abort; }, download }), makeCard: async () => blob });
    expect(await cancelled!.save()).toBe("cancelled");
    expect(download).toHaveBeenCalledTimes(1);   // 취소했으면 내려받기로 넘기지 않는다
  });

  it("FC9 판정이 없으면(다시 찍기 안내만 있으면) 저장할 것이 없다", async () => {
    const makeCard = vi.fn(async () => blob);
    expect(await prepareSave(view({ blocked: "처음 찍은 사진과 얼굴 크기가 많이 달라요", parts: [], ok: [], fix: [] }), { env: env(), makeCard })).toBeNull();
    expect(await prepareSave(null, { env: env(), makeCard })).toBeNull();
    expect(makeCard).not.toHaveBeenCalled();
  });

  it("FC10 카드를 못 만들어도(캔버스 없음) 멈추지 않는다 — 저장을 누르면 '저장할 수 없다' 로", async () => {
    const kit = await prepareSave(view(fb()), { env: env(), makeCard: async () => null });
    expect(kit!.card).toBeNull();
    expect(await kit!.save()).toBe("unavailable");
  });
});
