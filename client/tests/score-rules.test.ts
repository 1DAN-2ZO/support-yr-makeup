// #44 채점 가정값은 rules/score.json 한 곳 — 코드에 숫자를 박지 않는다 (dev-stack-v6.md §6). 버전도 여기서
import { describe, expect, it } from "vitest";
import rules from "../../rules/score.json";
import { PARAMS, SCORE_VERSION } from "@core/score";
import { REGISTER } from "@core/score-part";
import { SAMPLE } from "@core/sampling";
import { getVersions } from "@core/versions";

describe("채점 규칙 파일", () => {
  it("R1 채점 임계·정렬·평균 창이 rules/score.json 에서 온다", () => {
    expect(PARAMS).toEqual(rules.params);
    expect(REGISTER).toEqual(rules.register);
    expect(SAMPLE.boxRatio).toBeCloseTo(rules.sample.boxRatio, 10);
  });

  it("R2 버전은 파일에 적힌 것 — 로그·결과 카드의 score 버전도 같다", () => {
    expect(SCORE_VERSION).toBe(rules.version);
    expect(SCORE_VERSION).toMatch(/^score-v0\.\d+$/);
    expect(getVersions().score).toBe(rules.version);
  });
});
