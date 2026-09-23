import { describe, expect, it } from "vitest";
import {
  allUnavailable,
  anySelectable,
  fullRenderUrl,
  lookDetail,
  tileState,
  tiles,
} from "@core/look-view";
import { CONTOUR_PRODUCTS, LOOKS, SUMMARY_TEMPLATE } from "@core/looks";
import { computeSummary, DEFAULT_TEMPLATE } from "@core/review";
import type { JobStatus, LookJob, PartId, PartResult, Versions } from "@core/types";

const ver: Versions = {
  app: "test",
  score: "score-v0.1",
  look: "look-v0.1",
  faceshape: "faceshape-rule-v1",
  transfer: "transfer-stub-v0",
};

function job(lookId: string, status: JobStatus, url: string | null = null): LookJob {
  return {
    job_id: `j-${lookId}`,
    look_id: lookId,
    status,
    result_url: url,
    layer: null,
    identity: { cos: null },
    ms: null,
    queue_ms: null,
    error: null,
    ver,
  };
}

describe("룩 타일 상태", () => {
  it("아직 안 온 룩은 로딩 중", () => {
    expect(tileState(undefined)).toBe("loading");
    expect(tileState(job("daily", "queued"))).toBe("loading");
    expect(tileState(job("daily", "running"))).toBe("loading");
  });

  it("큐가 밀리면 따로 알려 준다", () => {
    expect(tileState(job("daily", "waiting_long"))).toBe("waiting_long");
  });

  it("정체성 미달과 오류는 사용자에게 똑같이 준비 중으로 보인다", () => {
    expect(tileState(job("daily", "fallback"))).toBe("unavailable");
    expect(tileState(job("daily", "error"))).toBe("unavailable");
  });

  it("done 인데 그림이 없으면 고를 수 없다", () => {
    expect(tileState(job("daily", "done", null))).toBe("unavailable");
    expect(tileState(job("daily", "done", "/r/daily.png"))).toBe("ready");
  });
});

describe("타일 목록", () => {
  it("룩 순서는 rules/looks.json 그대로고 빠지는 룩이 없다", () => {
    const ts = tiles(LOOKS, []);
    expect(ts.map((t) => t.lookId)).toEqual(LOOKS.map((l) => l.id));
    expect(ts.every((t) => t.state === "loading" && !t.selectable)).toBe(true);
  });

  it("끝난 것부터 고를 수 있다 — 다 올 때까지 안 기다린다", () => {
    const ts = tiles(LOOKS, [job("smoky", "done", "/r/smoky.png"), job("coral", "running")]);
    const byId = new Map(ts.map((t) => [t.lookId, t]));
    expect(byId.get("smoky")?.selectable).toBe(true);
    expect(byId.get("smoky")?.imageUrl).toBe("/r/smoky.png");
    expect(byId.get("coral")?.selectable).toBe(false);
    expect(anySelectable(ts)).toBe(true);
  });

  it("고를 수 있는 룩의 안내 문구는 비어 있다", () => {
    const ts = tiles(LOOKS, [job("daily", "done", "/r/daily.png")]);
    expect(ts[0]?.note).toBe("");
    expect(ts[1]?.note).toBe("로딩 중");
  });

  it("전부 실패면 서버가 죽은 것으로 본다", () => {
    const ts = tiles(LOOKS, LOOKS.map((l) => job(l.id, "error")));
    expect(allUnavailable(ts)).toBe(true);
    expect(anySelectable(ts)).toBe(false);
  });

  it("하나라도 로딩 중이면 전부 실패가 아니다", () => {
    const jobs = LOOKS.map((l) => job(l.id, "error"));
    const ts = tiles(LOOKS, jobs.slice(1));
    expect(allUnavailable(ts)).toBe(false);
  });
});

describe("제품 목록", () => {
  it("룩 5부위에 쉐딩·하이라이트가 붙는다 (F-04)", () => {
    const d = lookDetail("daily");
    expect(d.look.id).toBe("daily");
    expect(d.products).toHaveLength(d.look.products.length + CONTOUR_PRODUCTS.length);
    expect(d.products.slice(-CONTOUR_PRODUCTS.length)).toEqual([...CONTOUR_PRODUCTS]);
  });

  it("모르는 룩이면 첫 룩으로 떨어진다", () => {
    expect(lookDetail("없는룩").look.id).toBe(LOOKS[0]?.id);
    expect(lookDetail(null).look.id).toBe(LOOKS[0]?.id);
  });
});

describe("전체 완성 예상", () => {
  const jobs = [job("daily", "done", "/r/daily.png"), job("smoky", "fallback")];

  it("고른 룩의 결과만 쓴다", () => {
    expect(fullRenderUrl(jobs, "daily")).toBe("/r/daily.png");
  });

  it("고르지 않았거나 실패했으면 없다", () => {
    expect(fullRenderUrl(jobs, null)).toBeNull();
    expect(fullRenderUrl(jobs, "smoky")).toBeNull();
    expect(fullRenderUrl(jobs, "rose")).toBeNull();
  });
});

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

describe("합산 설정 — 전 룩 공통 (결정 2026-09-22)", () => {
  it("rules/looks.json 에서 온다 — 코드에 숫자를 박지 않는다", () => {
    expect(SUMMARY_TEMPLATE.weights.brow).toBeTypeOf("number");
    expect(SUMMARY_TEMPLATE.harmonyRange?.maxDeltaAb).toBeTypeOf("number");
  });

  it("③ 의 기본값과 같다 — 코드에서 옮겨 왔고 숫자는 안 바꿨다", () => {
    expect(SUMMARY_TEMPLATE.weights).toEqual(DEFAULT_TEMPLATE.weights);
    expect(SUMMARY_TEMPLATE.harmonyRange).toEqual(DEFAULT_TEMPLATE.harmonyRange);
    expect([...SUMMARY_TEMPLATE.partIds]).toEqual([...DEFAULT_TEMPLATE.partIds]);
  });

  it("룩마다 따로 두지 않는다 — 룩 객체에 가중치가 없어야 한다", () => {
    for (const l of LOOKS) {
      expect(l).not.toHaveProperty("weights");
      expect(l).not.toHaveProperty("harmonyRange");
    }
  });

  it("룩 5부위를 전부 덮는다", () => {
    for (const p of SUMMARY_TEMPLATE.partIds) {
      expect(SUMMARY_TEMPLATE.weights[p], `${p} 가중치 없음`).toBeTypeOf("number");
    }
  });

  it("이걸로 합산하면 가중 평균이 나온다", () => {
    const parts = SUMMARY_TEMPLATE.partIds.map((partId) => part(partId, { score: 80 }));
    const s = computeSummary(parts, SUMMARY_TEMPLATE);
    expect(s.total).toBe(80);
    expect(s.measuredCount).toBe(SUMMARY_TEMPLATE.partIds.length);
  });
});
