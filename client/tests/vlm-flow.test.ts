// 개인화 = VLM 이 정하고 규칙 관문이 거른다 (2026-09-29). 거절되면 이유를 붙여 한 번만 다시 묻는다
import { describe, expect, it, vi } from "vitest";
import { measureFace } from "@core/face-measure";
import { LOOKS } from "@core/looks";
import { resolvePlan } from "@core/personalize";
import { PROMPT_VER, planWithVlm, retryPrompt, vlmSchema } from "@core/vlm-flow";
import { LMS } from "./helpers/synth-face";

const m = measureFace(LMS);
const look = LOOKS[0]!;
const rule = resolvePlan(m);
const good = JSON.stringify({ liner: { style: rule.liner.plan.style }, rationale: { liner: "눈매에 맞춰 꼬리를 정했어요" } });
// 눈두덩이 좁은데 넓히자고 함 — 관문이 거절하는 제안 (합성 얼굴은 눈두덩이 좁다)
const bad = JSON.stringify({ shadow: { range: 1.2 } });

describe("VLM 개인화 흐름", () => {
  it("F1 관문을 통과하면 한 번만 묻고 VLM 의 근거 문장을 쓴다", async () => {
    const ask = vi.fn().mockResolvedValue(good);
    const r = await planWithVlm(m, look, null, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.tries).toBe(1);
    expect(r.plan.rejected).toEqual([]);
    expect(r.plan.rationale.liner).toBe("눈매에 맞춰 꼬리를 정했어요");
  });

  it("F2 거절되면 거절 이유를 붙여 한 번 더 묻고, 그 답을 쓴다", async () => {
    const ask = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const r = await planWithVlm(m, look, null, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    const second = ask.mock.calls[1]![0] as string;
    expect(second).toContain("눈두덩이 좁은데 넓히자고 함");
    expect(r.tries).toBe(2);
    expect(r.plan.rejected).toEqual([]);
  });

  it("F3 두 번째도 거절되면 더 묻지 않는다 — 거절된 항목만 규칙값", async () => {
    const ask = vi.fn().mockResolvedValue(bad);
    const r = await planWithVlm(m, look, null, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(r.plan.shadow.range).toBe(rule.shadow.range);
    expect(r.plan.rejected.length).toBeGreaterThan(0);
  });

  it("F4 VLM 이 실패하면(서버 없음) 규칙으로 대신하지 않고 그대로 던진다 — VLM 없으면 이용 불가", async () => {
    const ask = vi.fn().mockRejectedValue(new Error("서버 없음"));
    await expect(planWithVlm(m, look, null, ask)).rejects.toThrow("서버 없음");
  });

  it("F5 스키마는 관문 허용값과 같다 — 결정 필드가 근거 문장보다 앞", () => {
    const s = vlmSchema() as { properties: Record<string, unknown>; required: string[] };
    const keys = Object.keys(s.properties);
    expect(keys.indexOf("liner")).toBeLessThan(keys.indexOf("rationale"));
    expect(keys.at(-1)).toBe("rationale");
    expect(PROMPT_VER).toMatch(/^vlm-prompt-v\d+/);
  });
  it("F6 다시 묻다가 실패하면(시간 초과·붐빔) 첫 답(관문을 거친 계획)을 쓴다 — 버리지 않는다 (#179 리뷰)", async () => {
    const ask = vi.fn().mockResolvedValueOnce(bad).mockRejectedValueOnce(new Error("시간 초과"));
    const r = await planWithVlm(m, look, null, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(r.tries).toBe(2);
    expect(r.retryFailed).toBe(true);
    expect(r.plan.shadow.range).toBe(rule.shadow.range);   // 거절된 항목은 규칙값
  });

  it("F7 다시 묻는 글에 모듈 번호 같은 내부 표기가 들어가지 않는다", () => {
    const t = retryPrompt("앞 글", ["얼굴형: ⑤ 판정(round)과 다름 — oval"]);
    expect(t).not.toMatch(/[①-⑥]/);
    expect(t).toContain("얼굴형");
  });
});
