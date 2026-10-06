// 새 흐름 화면 6 — 잰 값을 부위별 문장으로 (점수 없음). 기준값은 2026-10-06 실험에서 잰 흔들림 폭에서 왔다 (eval/samples/shape/README.md 실험 19~36)
import { describe, expect, it } from "vitest";
import { FEEDBACK, composeFeedback, type WholeMeasures } from "@core/feedback-whole";

const good: WholeMeasures = {
  lip: { target: 9, amount: 0.9, out: 0, outTarget: 0, upper: 0.85, lower: 1 },
  shadow: { target: 12, amountR: 0.85, amountL: 0.7, higher: false, outer: 0.9, outerTarget: 1 },
  brow: { target: 13, amountR: 0.8, amountL: 0.9, below: 0.1, belowTarget: 0.1 },
  cheek: { target: 9, amount: 1.1 },
  liner: { targetR: 0.3, targetL: 0.27, R: 0.29, L: 0.26 },
};
const line = (m: WholeMeasures, part: string) => composeFeedback(m).parts.find((p) => p.part === part)!;

describe("화면 6 피드백 문장 (composeFeedback)", () => {
  it("C1 정답대로면 부위마다 '정답과 비슷해요' — '잘 됐어요'라고 하지 않는다", () => {
    const r = composeFeedback(good);
    expect(r.parts.map((p) => p.part)).toEqual(["brow", "shadow", "liner", "cheek", "lip"]);
    for (const p of r.parts) { expect(p.tone).toBe("ok"); expect(p.line).toBe("정답과 비슷해요"); }
    expect(r.ok).toEqual(["눈썹", "섀도우", "라이너", "볼", "입술"]);
    expect(r.fix).toEqual([]);
  });

  it("C2 내 사진에서 변화가 없으면 '내 화장에서 변화를 찾지 못했어요' (단정하지 않는다) · 그 부위는 다른 말을 덧붙이지 않는다", () => {
    const p = line({ ...good, lip: { ...good.lip!, amount: 0.02, upper: 0, lower: 0.05, out: 0.4 } }, "lip");
    expect(p.tone).toBe("fix");
    expect(p.line).toBe("내 화장에서 변화를 찾지 못했어요");
    expect(p.more).toBeUndefined();
  });

  it("C3 정답 그림에서 그 부위가 거의 안 바뀌었으면 '정답 화장에서 변화를 찾지 못했어요' — 고칠 것이 아니다", () => {
    const p = line({ ...good, brow: { ...good.brow!, target: 5 } }, "brow");
    expect(p.tone).toBe("info");
    expect(p.line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(composeFeedback({ ...good, brow: { ...good.brow!, target: 5 } }).fix).toEqual([]);
  });

  it("C4 한쪽만 했으면 그쪽을 짚는다 — 진하기보다 먼저", () => {
    expect(line({ ...good, shadow: { ...good.shadow!, amountL: 0.02 } }, "shadow").line).toBe("왼쪽 눈이 비었어요");
    expect(line({ ...good, brow: { ...good.brow!, amountR: 0.05 } }, "brow").line).toBe("오른쪽 눈썹이 비었어요");
    expect(line({ ...good, lip: { ...good.lip!, upper: 0.1 } }, "lip").line).toBe("윗입술이 비었어요");
  });

  it("C5 자리 · 모양: 입술선 밖 · 섀도우 높이 · 바깥쪽 · 눈썹 두께", () => {
    expect(line({ ...good, lip: { ...good.lip!, out: 0.5 } }, "lip").line).toBe("입술선 밖으로 나갔어요");
    expect(line({ ...good, shadow: { ...good.shadow!, higher: true } }, "shadow").line).toBe("정답보다 높이 칠했어요");
    expect(line({ ...good, shadow: { ...good.shadow!, outer: 1.25 } }, "shadow").line).toBe("눈꼬리 바깥으로 더 뺐어요");
    expect(line({ ...good, brow: { ...good.brow!, below: 0.75 } }, "brow").line).toBe("정답보다 아래로 두꺼워요");
    // 둘이 같이 걸리면 하나는 덧붙임으로
    const both = line({ ...good, shadow: { ...good.shadow!, higher: true, outer: 1.25 } }, "shadow");
    expect(both.line).toBe("정답보다 높이 칠했어요");
    expect(both.more).toBe("눈꼬리 바깥으로 더 뺐어요");
  });

  it("C6 진하기는 정답의 절반 아래일 때만 '옅어요' — 흔들림 폭 안의 차이는 말하지 않는다", () => {
    expect(line({ ...good, lip: { ...good.lip!, amount: 0.4, upper: 0.4, lower: 0.4 } }, "lip").line).toBe("정답보다 옅어요");
    expect(line({ ...good, lip: { ...good.lip!, amount: 0.7 } }, "lip").line).toBe("정답과 비슷해요");
    // 섀도우는 눈 하나의 값이 ±0.25 흔들린다 — 두 눈 평균으로만
    expect(line({ ...good, shadow: { ...good.shadow!, amountR: 0.45, amountL: 0.9 } }, "shadow").line).toBe("정답과 비슷해요");
    expect(line({ ...good, shadow: { ...good.shadow!, amountR: 0.4, amountL: 0.45 } }, "shadow").line).toBe("정답보다 옅어요");
    expect(FEEDBACK.weak).toBe(0.5);
  });

  it("C7 라이너 꼬리: 눈 폭의 10% 미만은 보지 않는다 · 8%p 넘게 다를 때만 짧다 · 길다", () => {
    expect(line({ ...good, liner: { targetR: 0.08, targetL: 0.07, R: 0.2, L: 0.2 } }, "liner").line).toBe("정답 화장에서 변화를 찾지 못했어요");
    expect(line({ ...good, liner: { ...good.liner!, R: null, L: null } }, "liner").line).toBe("내 화장에서 꼬리를 찾지 못했어요");
    expect(line({ ...good, liner: { ...good.liner!, L: null } }, "liner").line).toBe("왼쪽 눈에 꼬리가 없어요");
    expect(line({ ...good, liner: { ...good.liner!, R: 0.15, L: 0.14 } }, "liner").line).toBe("꼬리가 정답보다 짧아요");
    expect(line({ ...good, liner: { ...good.liner!, R: 0.45, L: 0.26 } }, "liner").line).toBe("오른쪽 꼬리가 정답보다 길어요");
    expect(line({ ...good, liner: { ...good.liner!, R: 0.25, L: 0.22 } }, "liner").line).toBe("정답과 비슷해요");   // 5%p 차 — 흔들림 안
  });

  it("C8 못 잰 부위는 이유를 말한다 · 사진 조건이 다르면 판정 대신 그것을 알린다", () => {
    const noLiner: WholeMeasures = { lip: good.lip!, shadow: good.shadow!, brow: good.brow!, cheek: good.cheek! };
    expect(line(noLiner, "liner").line).toBe("이번에는 볼 수 없었어요");
    const r = composeFeedback({ ...good, condition: "light" });
    expect(r.blocked).toBe("처음 찍은 사진과 밝기가 많이 달라요. 같은 자리에서 다시 찍어 주세요");
    expect(r.parts).toEqual([]);
  });

  it("C9 볼은 했나 안 했나만", () => {
    expect(line({ ...good, cheek: { target: 9, amount: 0.3 } }, "cheek").line).toBe("내 화장에서 변화를 찾지 못했어요");
    expect(line({ ...good, cheek: { target: 9, amount: 0.75 } }, "cheek").line).toBe("정답과 비슷해요");
  });
});

describe("고치는 방법 (fix) — 방향만 말한다", () => {
  it("C10 고칠 것이 있는 부위에만 붙고, 양(몇 mm)은 말하지 않는다", () => {
    const r = composeFeedback({ ...good, liner: { ...good.liner!, R: 0.15, L: 0.14 }, lip: { ...good.lip!, out: 0.5 }, cheek: { target: 9, amount: 0.2 } });
    const by = Object.fromEntries(r.parts.map((p) => [p.part, p]));
    expect(by.liner!.fix).toBe("꼬리를 조금 더 길게 빼 보세요");
    expect(by.lip!.fix).toBe("입술선 안쪽으로 정리해 보세요");
    expect(by.cheek!.fix).toBe("볼에 블러셔를 올려 보세요");
    expect(by.shadow!.fix).toBeUndefined();   // 비슷한 부위에는 없다
    expect(by.brow!.fix).toBeUndefined();
    for (const p of r.parts) expect(p.fix ?? "").not.toMatch(/\d/);
    expect(r.fix).toEqual(["라이너", "볼", "입술"]);
    expect(r.ok).toEqual(["눈썹", "섀도우"]);
  });
});
