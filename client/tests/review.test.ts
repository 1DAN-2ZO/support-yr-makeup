// 전체 리뷰 합산 검증 — 화면 6 POC 검증 24개를 vitest 로 옮김 (이슈 #32, 3-1)
import { PARAMS } from "@core/score";
import { describe, expect, it } from "vitest";
import {
  CONTOUR_ID,
  DEFAULT_TEMPLATE,
  HistoryStore,
  computeSummary,
  harmonyPenalty,
  lightingDiffers,
  makeRecord,
  memoryAdapter,
  reviewLine,
  symmetryPenalty,
  topMisses,
  trendSeries,
  upsertPart,
} from "@core/review";
import type { SummaryTemplate } from "@core/review";
import { hasDigit } from "@core/score";
import type { PartId, PartResult, PartStatus } from "@core/types";
import { LOOK_PART_IDS, PART_IDS } from "@core/types";

const P = (partId: PartId, status: PartStatus, score: number | null, extra: Partial<PartResult> = {}): PartResult => ({
  partId,
  status,
  score,
  diagnosisCodes: [],
  diagnosis: "",
  checkReason: null,
  lrIndex: null,
  metrics: {},
  attempts: 0,
  updatedAt: 0,
  ...extra,
});
const NO_HARM: SummaryTemplate = { ...DEFAULT_TEMPLATE, harmonyRange: null };

describe("합산", () => {
  it("A1 전부 통과 (좌우 차 0, 보정 0)", () => {
    const parts = [P("brow", "passed", 88), P("liner", "passed", 82), P("shadow", "passed", 75), P("lip", "passed", 79), P("cheek", "passed", 71)];
    const s = computeSummary(parts, NO_HARM);
    const exp = (88 + 82 + 75 + 79 + 71 * 0.7) / (4 + 0.7);
    expect(s).toMatchObject({ measuredCount: 5, partCount: 5, symmetryPenalty: 0, harmonyPenalty: 0, total: Math.round(exp) });
    expect(s.base).toBeCloseTo(exp, 0);
  });

  it("A2 하나가 확인만 → 네 부위로 계산", () => {
    const parts = [P("brow", "passed", 88), P("liner", "passed", 82), P("shadow", "check_only", null), P("lip", "passed", 79), P("cheek", "passed", 71)];
    const s = computeSummary(parts, NO_HARM);
    expect(s.measuredCount).toBe(4);
    expect(s.base).toBeCloseTo((88 + 82 + 79 + 71 * 0.7) / (3 + 0.7), 0);
  });

  it("A3 하나를 건너뜀 → 제외", () => {
    const parts = [P("brow", "passed", 88), P("liner", "skipped", null), P("shadow", "passed", 75), P("lip", "passed", 79), P("cheek", "passed", 71)];
    const s = computeSummary(parts, NO_HARM);
    expect(s.measuredCount).toBe(4);
    expect(s.base).toBeCloseTo((88 + 75 + 79 + 71 * 0.7) / (3 + 0.7), 0);
  });

  it("A4 전부 확인만 → total null", () => {
    const s = computeSummary(LOOK_PART_IDS.map((id) => P(id, "check_only", null)), NO_HARM);
    expect(s).toMatchObject({ total: null, base: null, measuredCount: 0 });
  });

  it("A5 재확인 덮어쓰기 → 최신 점수로 다시 계산, attempts 증가", () => {
    let parts = [P("brow", "passed", 60), P("liner", "passed", 60)];
    const before = computeSummary(parts, NO_HARM);
    parts = upsertPart(parts, P("brow", "passed", 90));
    const after = computeSummary(parts, NO_HARM);
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.partId === "brow")?.attempts).toBe(1);
    expect(after.total).toBeGreaterThan(before.total ?? 0);
    expect(after.total).toBe(Math.round((90 + 60) / 2));
  });

  it("A6 보정 상한: 대칭 −5, 조화 −5 를 넘지 않음", () => {
    const parts = [
      P("brow", "passed", 90, { metrics: { lrDiff: 9 } }),
      P("liner", "passed", 90, { metrics: { lrDiff: 12 } }),
      P("lip", "passed", 90, { metrics: { colorAb: { a: 60, b: 60 } } }),
      P("cheek", "passed", 90, { metrics: { colorAb: { a: -60, b: -60 } }, lrIndex: { left: 10, right: 90 } }),
    ];
    expect(symmetryPenalty(parts)).toBe(-5);
    expect(harmonyPenalty(parts, DEFAULT_TEMPLATE).penalty).toBe(-5);
    expect(computeSummary(parts, DEFAULT_TEMPLATE).total).toBe(90 - 10);
  });

  it("A7 가중치: 볼터치 0.7 은 합산에 덜 들어간다", () => {
    const parts = [P("brow", "passed", 100), P("cheek", "passed", 0)];
    expect(computeSummary(parts, NO_HARM).base).toBeCloseTo(100 / 1.7, 0);
    expect(computeSummary(parts, { ...NO_HARM, weights: { brow: 1, cheek: 1 } }).base).toBeCloseTo(50, 0);
  });

  it("A8 부위 네 개짜리 룩 (partIds 축소)", () => {
    const tpl: SummaryTemplate = { ...NO_HARM, partIds: ["brow", "liner", "lip", "cheek"] };
    const parts = [P("brow", "passed", 80), P("liner", "passed", 80), P("shadow", "passed", 10), P("lip", "passed", 80), P("cheek", "passed", 80)];
    expect(computeSummary(parts, tpl)).toMatchObject({ partCount: 4, measuredCount: 4, total: 80 });
  });
});

describe("보정", () => {
  it("B1 같은 입력이면 같은 total", () => {
    const parts = [
      P("brow", "passed", 88, { metrics: { lrDiff: 0.03 } }),
      P("lip", "passed", 79, { metrics: { colorAb: { a: 20, b: 10 } } }),
      P("cheek", "passed", 71, { metrics: { colorAb: { a: 22, b: 12 } }, lrIndex: { left: 41, right: 44 } }),
    ];
    const totals = [1, 2, 3].map(() => computeSummary(parts).total);
    expect(new Set(totals).size).toBe(1);
  });

  it("B2 대칭 보정 방향: 한쪽만 진하면 크게 음수, 양쪽이 비슷하면 0 ~ −1", () => {
    expect(symmetryPenalty([P("cheek", "passed", 70, { lrIndex: { left: 20, right: 60 } })])).toBeLessThan(-3);
    const even = symmetryPenalty([P("cheek", "passed", 70, { lrIndex: { left: 41, right: 44 } })]);
    expect(even).toBeLessThanOrEqual(0);
    expect(even).toBeGreaterThanOrEqual(-1);
  });

  it("B3 조화 보정: 범위 안 0 / 밖 음수 / 범위 없음 미적용", () => {
    const lip = P("lip", "passed", 80, { metrics: { colorAb: { a: 20, b: 10 } } });
    const near = [lip, P("cheek", "passed", 80, { metrics: { colorAb: { a: 24, b: 14 } } })];
    const far = [lip, P("cheek", "passed", 80, { metrics: { colorAb: { a: 45, b: 30 } } })];
    expect(harmonyPenalty(near, DEFAULT_TEMPLATE)).toMatchObject({ penalty: 0, applied: true });
    expect(harmonyPenalty(far, DEFAULT_TEMPLATE).penalty).toBeLessThan(0);
    expect(harmonyPenalty(far, NO_HARM)).toEqual({ penalty: 0, applied: false });
  });
});

describe("쉐딩·하이라이트, 진행 중, 한 줄 평", () => {
  it("V1 쉐딩은 점수가 있어도 합산에서 빠지고 partCount 는 룩 5부위", () => {
    const parts = [...LOOK_PART_IDS.map((id) => P(id, "passed", 80)), P(CONTOUR_ID, "passed", 10)];
    expect(computeSummary(parts, NO_HARM)).toMatchObject({ total: 80, measuredCount: 5, partCount: 5 });
  });

  it("V2 upsertPart 로 쉐딩에 점수를 넣어도 확인만으로 바뀐다", () => {
    const parts = upsertPart([], P(CONTOUR_ID, "passed", 77));
    expect(parts[0]).toMatchObject({ status: "check_only", score: null, checkReason: "contour" });
  });

  it("V3 진행 중·미시작 부위는 합산·측정 수에 안 들어간다", () => {
    const parts = [P("brow", "passed", 90), P("liner", "in_progress", null), P("shadow", "not_started", null)];
    expect(computeSummary(parts, NO_HARM)).toMatchObject({ total: 90, measuredCount: 1 });
  });

  it("V4 쉐딩의 좌우 차는 대칭 보정에 안 들어간다", () => {
    const parts = [P("brow", "passed", 90, { metrics: { lrDiff: 0 } }), P(CONTOUR_ID, "check_only", null, { lrIndex: { left: 10, right: 90 } })];
    expect(symmetryPenalty(parts)).toBe(0);
  });

  it("V5 한 줄 평: 쉐딩은 '확인하고 넘어가세요' + 좌우 방향, 확인만은 이유, 숫자 없음", () => {
    expect(reviewLine(P(CONTOUR_ID, "check_only", null, { lrIndex: { left: 30, right: 55 } }))).toBe("확인하고 넘어가세요. 오른쪽이 조금 진해요");
    expect(reviewLine(P(CONTOUR_ID, "check_only", null, { lrIndex: { left: 40, right: 44 } }))).toBe("확인하고 넘어가세요.");
    expect(reviewLine(P("shadow", "check_only", null))).toContain("재지 못했어요");
    expect(reviewLine(P("shadow", "check_only", null, { checkReason: "lighting" }))).toContain("조명");
    const t = reviewLine(P("liner", "passed", 82, { diagnosisCodes: ["LINER_WING_HIGH_R"] }));
    expect(t.length).toBeGreaterThan(0);
    expect(hasDigit(t)).toBe(false);
  });

  it("V6 세션 부위 순서 = 룩 5부위 + 쉐딩·하이라이트", () => {
    expect(PART_IDS).toHaveLength(6);
    expect(PART_IDS[5]).toBe(CONTOUR_ID);
  });
});

describe("기록 (로드맵용)", () => {
  const mk = (i: number, parts: PartResult[], lookId = "smoky", foreheadL = 60) =>
    makeRecord({ id: `r${i}`, date: `2026-09-${String(i).padStart(2, "0")}T10:00:00`, lookId, lookName: lookId, parts, template: NO_HARM, lightingRef: { foreheadL } });
  const brow60 = () => [P("brow", "passed", 60)];

  it("C1 topMisses: 회차당 한 번만 세고, 동률이면 최근 것 먼저, 건너뛴 부위는 제외", () => {
    const recs = [
      mk(1, [P("liner", "passed", 70, { diagnosisCodes: ["LINER_WING_HIGH_R", "LINER_WING_HIGH_R"] }), P("cheek", "passed", 60, { diagnosisCodes: ["CHEEK_LR_DIFF_R"] })]),
      mk(2, [P("liner", "passed", 72, { diagnosisCodes: ["LINER_WING_HIGH_R"] }), P("cheek", "skipped", null, { diagnosisCodes: ["CHEEK_LR_DIFF_R"] })]),
      mk(3, [P("liner", "check_only", null, { diagnosisCodes: ["LINER_THICK"] }), P("cheek", "passed", 65, { diagnosisCodes: ["CHEEK_LR_DIFF_R"] })]),
      mk(4, [P("liner", "passed", 80, { diagnosisCodes: ["LINER_WING_HIGH_R"] }), P("brow", "passed", 80, { diagnosisCodes: ["BROW_SPARSE"] })]),
      mk(5, [P("liner", "passed", 85, { diagnosisCodes: ["LINER_WING_HIGH_R"] }), P("brow", "passed", 80, { diagnosisCodes: ["BROW_SPARSE"] })]),
    ];
    const t = topMisses(recs, 5);
    expect(t[0]).toMatchObject({ code: "LINER_WING_HIGH_R", count: 4, n: 5, part: "아이라이너" });
    expect(t[1]).toMatchObject({ code: "BROW_SPARSE", count: 2 });
  });

  it("C2 추이: total 이 null 인 회차는 빈칸, 룩으로 거르기", () => {
    const recs = [mk(1, brow60()), mk(2, [P("brow", "check_only", null)]), mk(3, [P("brow", "passed", 70)], "daily")];
    const all = trendSeries(recs);
    expect(all).toHaveLength(3);
    expect(all[1]?.y).toBeNull();
    expect(trendSeries(recs, "daily")).toHaveLength(1);
  });

  it("C3 보관 상한: 넘치면 가장 오래된 것을 지우고 돌려준다", () => {
    const store = new HistoryStore(memoryAdapter(), 3);
    [1, 2, 3].forEach((i) => store.save(mk(i, brow60())));
    const { removed } = store.save(mk(4, brow60()));
    expect(store.list()).toHaveLength(3);
    expect(removed.map((r) => r.id)).toEqual(["r1"]);
  });

  it("C4 삭제: 하나씩, 그리고 전부", () => {
    const store = new HistoryStore(memoryAdapter(), 10);
    [1, 2].forEach((i) => store.save(mk(i, brow60())));
    expect(store.delete("r1")?.id).toBe("r1");
    expect(store.list()).toHaveLength(1);
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it("C5 저장 → 복원이 같다 (JSON 왕복)", () => {
    const rec = mk(1, [P("brow", "passed", 88, { metrics: { lrDiff: 0.03 } }), P("cheek", "passed", 71, { lrIndex: { left: 41, right: 44 } })]);
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec);
  });

  it("C6 조명 배지: 이마 L* 차가 임계 이상일 때만", () => {
    // 채점 조명 한계(PARAMS.lightTol)와 같은 기준 — 채점은 됐는데 리뷰만 "조명이 달라서" 가 뜨지 않게 (2026-09-30)
    expect(lightingDiffers({ foreheadL: 60 }, { foreheadL: 60 + PARAMS.lightTol })).toBe(true);
    expect(lightingDiffers({ foreheadL: 60 }, { foreheadL: 60 - PARAMS.lightTol })).toBe(true);
    expect(lightingDiffers({ foreheadL: 60 }, { foreheadL: 60 + PARAMS.lightTol - 1 })).toBe(false);
    expect(lightingDiffers({ foreheadL: 60 }, { foreheadL: 70 })).toBe(false);
    expect(lightingDiffers(null, { foreheadL: 65 })).toBe(false);
  });

  it("C7 같은 id 로 다시 저장 → 덮어쓰기 (중복 없음)", () => {
    const store = new HistoryStore(memoryAdapter(), 10);
    store.save(mk(1, brow60()));
    store.save(mk(1, [P("brow", "passed", 90)]));
    expect(store.list()).toHaveLength(1);
    expect(store.get("r1")?.summary.total).toBe(90);
  });
});
