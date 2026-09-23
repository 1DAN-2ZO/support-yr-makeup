// 화면 5 가이드 테두리 — 채점이 본 기하와 화면의 선이 같은 데서 나오는지 (이슈 #100)
import { describe, expect, it } from "vitest";
import { LM } from "@core/landmarks";
import { guideOutline } from "@core/overlay";
import { pocGuide } from "@core/guide-poc";
import { BARE, LMS, guide } from "./helpers/synth-face";

describe("guideOutline", () => {
  it("라이너: 속눈썹 선 둘 + 꼬리 선 둘, 꼬리 선은 가이드가 준 꼬리 그대로", () => {
    const g = guide("liner", BARE);
    const o = guideOutline("liner", LMS, g);
    expect(o.polys).toEqual([]);
    expect(o.lines).toHaveLength(4);
    expect(o.lines[1]).toEqual([g.liner!.wing.R[0], g.liner!.wing.R[1]]);
    expect(o.lines[0]![0]).toEqual(LMS[LM.eyeA.upper[0]!]);
  });

  it("눈썹·입술: 랜드마크 윤곽 다각형", () => {
    expect(guideOutline("brow", LMS, {}).polys.map((p) => p.length)).toEqual([10, 10]);
    expect(guideOutline("lip", LMS, {}).polys[0]).toHaveLength(LM.lipsOuter.length);
  });

  it("섀도우·볼터치: 가이드 영역 좌우, 쉐딩: 밴드 전부(쉐딩 + 하이라이트). 없으면 빈 것", () => {
    expect(guideOutline("cheek", LMS, guide("cheek", BARE)).polys).toHaveLength(2);
    const c = guide("contour", BARE).contour!;
    expect(guideOutline("contour", LMS, guide("contour", BARE)).polys).toHaveLength(c.shading.length + c.highlight.length);
    expect(guideOutline("cheek", LMS, {}).polys).toEqual([]);
    expect(guideOutline("contour", LMS, {}).polys).toEqual([]);
  });

  it("임시 가이드(guide-poc.ts)의 모든 부위가 테두리를 낸다 — 화면에 빈 사진만 뜨는 부위가 없다", () => {
    const g = pocGuide();
    for (const part of ["brow", "liner", "shadow", "lip", "cheek", "contour"] as const) {
      const o = guideOutline(part, LMS, g(part, BARE));
      expect(o.polys.length + o.lines.length, part).toBeGreaterThan(0);
    }
    // 룩 두께가 가이드에 실린다
    expect(pocGuide({ liner: { thick: 0.03 } })("liner", BARE).liner!.thick).toBe(0.03);
    expect(pocGuide()("liner", BARE).liner!.thick).toBe(0.045);
  });
});
