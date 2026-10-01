// 개인화 = VLM 이 정하고 규칙 관문이 거른다 (2026-09-29). 거절되면 이유를 붙여 한 번만 다시 묻는다
import { describe, expect, it, vi } from "vitest";
import { measureFace } from "@core/face-measure";
import { LOOKS } from "@core/looks";
import { resolvePlan } from "@core/personalize";
import { PROMPT_VER, planWithVlm, retryPrompt, vlmSchema } from "@core/vlm-flow";
import { allowedChoices } from "@core/vlm-prompt";
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

  it("F5 스키마(형식 E) — 관찰 → 근거 → 결정 순서, 숫자는 선택지, 이 얼굴에서 관문이 받아 주는 값만", () => {
    type P = { properties: Record<string, { properties?: Record<string, { enum?: unknown[] }> }>; required: string[] };
    const s = vlmSchema(m) as P;
    const keys = Object.keys(s.properties);
    expect(keys.slice(0, 3)).toEqual(["observation", "rationale", "liner"]);
    // llama.cpp 는 required 키만 순서를 고정한다 — 모두 required (진하기는 칸은 있고 안의 부위는 바꿀 것만)
    expect(s.required).toEqual(keys);
    expect(s.properties.shadow!.properties!.range!.enum).toEqual(allowedChoices(m).shadow);
    expect(s.properties.linerThick!.properties!.scale!.enum).toEqual([0.8, 0.9, 1, 1.1, 1.2]);
    expect(JSON.stringify(s)).not.toMatch(/"minimum"|"maximum"/);   // 소수 범위는 llama.cpp 가 강제하지 않는다
    expect(PROMPT_VER).toBe("vlm-prompt-v2");
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
