import { describe, expect, it } from "vitest";
import {
  chipLabel,
  chips,
  inNewFlow,
  isPartScreen,
  nextGuidePart,
  orientationHint,
  SCREEN_NAME,
  SCREEN_ORDER,
  SCREEN_OWNER,
  wantedOrientation,
} from "@core/screens";
import { SCREENS } from "@core/flow";
import { CONTOUR_PRODUCTS, LOOKS, lookById, LOOK_PART_ORDER, productList } from "@core/looks";
import { PART_IDS } from "@core/types";
import type { ChipInput } from "@core/screens";

describe("화면 목록", () => {
  it("새 흐름 (2026-10-06): 동의 → 맨얼굴 촬영 → 참고 사진·정답사진 → 부위 가이드 → 시도사진 → 피드백 → 저장·공유 → 끝", () => {
    expect(SCREEN_ORDER).toEqual(["consent", "capture", "answer", "partguide", "attempt", "feedback", "save", "done"]);
  });

  it("모든 화면(옛 흐름 화면 포함)에 이름·담당이 빠짐없이 있다", () => {
    for (const s of SCREENS) {
      expect(SCREEN_NAME[s], s).toBeTruthy();
      expect(SCREEN_OWNER[s], s).toBeTruthy();
    }
  });

  it("부위를 도는 화면은 부위 가이드 하나 — 부위마다 중간 확인(실시간·결과)이 없다", () => {
    expect(SCREENS.filter(isPartScreen)).toEqual(["partguide"]);
  });

  it("담당: 맨얼굴 사진 다음 정답사진까지는 ①②④ 한 덩어리(prep) · 부위 가이드 ② · 피드백 ③ · 시도사진·저장 ⑥", () => {
    expect(SCREEN_OWNER.capture).toBe("capture");
    expect(SCREEN_OWNER.answer).toBe("prep");
    expect(SCREEN_OWNER.partguide).toBe("guide");
    expect(SCREEN_OWNER.feedback).toBe("score");
    expect(SCREEN_OWNER.attempt).toBe("app");
    expect(SCREEN_OWNER.save).toBe("app");
  });

  it("옛 흐름에서 빠진 화면에 멈춘 세션은 가까운 새 화면으로 — 코드는 남아 있다", () => {
    expect(inNewFlow("processing")).toBe("answer");
    expect(inNewFlow("looks")).toBe("answer");
    expect(inNewFlow("fullrender")).toBe("answer");
    expect(inNewFlow("guide")).toBe("partguide");
    expect(inNewFlow("live")).toBe("partguide");
    expect(inNewFlow("result")).toBe("partguide");
    expect(inNewFlow("review")).toBe("feedback");
    for (const s of [...SCREEN_ORDER, "denied"] as const) expect(inNewFlow(s)).toBe(s);
  });

  it("부위 가이드 순서 — 부위마다 확인받지 않으니 상태와 상관없이 다음 부위, 마지막이면 null", () => {
    expect(nextGuidePart(null)).toBe(PART_IDS[0]);
    for (let i = 0; i < PART_IDS.length - 1; i++) expect(nextGuidePart(PART_IDS[i]!)).toBe(PART_IDS[i + 1]);
    expect(nextGuidePart(PART_IDS[PART_IDS.length - 1]!)).toBeNull();
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
    expect(lookById("edgy").id).toBe("edgy");
    expect(lookById("없는룩").id).toBe(LOOKS[0]!.id);
    expect(lookById(null).id).toBe(LOOKS[0]!.id);
  });
});
