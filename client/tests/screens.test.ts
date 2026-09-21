import { describe, expect, it } from "vitest";
import {
  chipLabel,
  chips,
  isPartScreen,
  orientationHint,
  SCREEN_NAME,
  SCREEN_ORDER,
  SCREEN_OWNER,
  wantedOrientation,
} from "@core/screens";
import { CONTOUR_PRODUCTS, LOOKS, lookById, LOOK_PART_ORDER, productList } from "@core/looks";
import { PART_IDS } from "@core/types";
import type { ChipInput } from "@core/screens";

describe("화면 목록", () => {
  it("11개이고 이름·담당이 빠짐없이 있다", () => {
    expect(SCREEN_ORDER).toHaveLength(11);
    for (const s of SCREEN_ORDER) {
      expect(SCREEN_NAME[s]).toBeTruthy();
      expect(SCREEN_OWNER[s]).toBeTruthy();
    }
  });

  it("부위를 도는 화면은 완성본·실시간·결과 셋", () => {
    expect(SCREEN_ORDER.filter(isPartScreen)).toEqual(["guide", "live", "result"]);
  });

  it("화면 5 담당은 score (2026-09-21 결정)", () => {
    expect(SCREEN_OWNER.result).toBe("score");
    expect(SCREEN_OWNER.review).toBe("app");
    expect(SCREEN_OWNER.live).toBe("guide");
  });
});

describe("화면 방향", () => {
  it("눈썹·아이라이너·섀도우는 가로, 나머지는 세로", () => {
    expect(wantedOrientation("brow")).toBe("landscape");
    expect(wantedOrientation("liner")).toBe("landscape");
    expect(wantedOrientation("shadow")).toBe("landscape");
    expect(wantedOrientation("lip")).toBe("portrait");
    expect(wantedOrientation("cheek")).toBe("portrait");
    expect(wantedOrientation("contour")).toBe("portrait");
    expect(wantedOrientation(null)).toBe("portrait");
  });

  it("맞으면 안내가 없고, 틀리면 한 줄 나온다", () => {
    expect(orientationHint("liner", "landscape")).toBeNull();
    expect(orientationHint("lip", "portrait")).toBeNull();
    expect(orientationHint("liner", "portrait")).toBe("폰을 가로로 돌리세요");
    expect(orientationHint("lip", "landscape")).toBe("폰을 세로로 돌리세요");
    expect(orientationHint(null, "landscape")).toBeNull();
  });
});

describe("진행 칩", () => {
  const parts: ChipInput[] = [
    { partId: "brow", status: "passed", score: 82 },
    { partId: "liner", status: "check_only", score: null },
    { partId: "shadow", status: "skipped", score: null },
    { partId: "contour", status: "passed", score: 91 },
  ];

  it("부위 6개가 고정 순서로 나온다", () => {
    expect(chips(parts, "lip").map((c) => c.partId)).toEqual([...PART_IDS]);
  });

  it("없는 부위는 미시작, 현재 부위에 표시가 붙는다", () => {
    const got = chips(parts, "lip");
    expect(got.find((c) => c.partId === "lip")).toMatchObject({ status: "not_started", current: true });
    expect(got.filter((c) => c.current)).toHaveLength(1);
  });

  it("쉐딩·하이라이트는 점수가 와도 안 보여준다", () => {
    const contour = chips(parts, null).find((c) => c.partId === "contour")!;
    expect(contour.score).toBeNull();
    expect(chipLabel(contour)).toBe("완료");
  });

  it("칩 문구는 점수 있으면 숫자, 없으면 상태말", () => {
    const got = chips(parts, null);
    expect(chipLabel(got.find((c) => c.partId === "brow")!)).toBe("82");
    expect(chipLabel(got.find((c) => c.partId === "liner")!)).toBe("확인만");
    expect(chipLabel(got.find((c) => c.partId === "shadow")!)).toBe("건너뜀");
  });
});

describe("룩 템플릿 (rules/looks.json)", () => {
  it("룩 10개, 부위 5개", () => {
    expect(LOOKS).toHaveLength(10);
    expect(LOOK_PART_ORDER).toEqual(["brow", "liner", "shadow", "lip", "cheek"]);
  });

  it("룩마다 제품 5줄·근거 5줄이고 근거에 숫자가 없다", () => {
    for (const l of LOOKS) {
      expect(l.products).toHaveLength(5);
      expect(Object.keys(l.rationale)).toHaveLength(5);
      for (const t of Object.values(l.rationale)) expect(t).not.toMatch(/\d/);
    }
  });

  it("쉐딩·하이라이트는 룩에 없고 기본 제품에서 온다", () => {
    for (const l of LOOKS) expect(Object.keys(l.parts)).not.toContain("contour");
    expect(CONTOUR_PRODUCTS.length).toBeGreaterThan(0);
    expect(productList(LOOKS[0]!)).toHaveLength(5 + CONTOUR_PRODUCTS.length);
  });

  it("없는 id 는 첫 룩으로 떨어진다", () => {
    expect(lookById("smoky").id).toBe("smoky");
    expect(lookById("없는룩").id).toBe(LOOKS[0]!.id);
    expect(lookById(null).id).toBe(LOOKS[0]!.id);
  });
});
