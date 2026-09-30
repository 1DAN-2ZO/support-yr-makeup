/**
 * 전체 리뷰 합산 — 순수 로직 (화면 6, F-10).
 * poc/full/lib/review.js 를 계약 타입(types.ts)에 맞춰 옮긴 것. DOM 을 쓰지 않는다.
 *
 *  - 룩 5부위(brow·liner·shadow·lip·cheek)만 합산한다. contour(쉐딩·하이라이트)는 항상 확인만, 합산 제외
 *  - passed 만 점수에 들어간다. check_only·skipped·in_progress 는 빠진다
 *  - 대칭·조화 보정은 내부 계산이다. 화면에는 합산 점수만 나온다
 *  - 코드표는 score.ts 한 곳에 있다. 여기서는 가져다 쓴다
 *  - HistoryStore·topMisses·trendSeries 는 로드맵(기록 화면)용으로만 남긴다
 */

import { CHECK_REASON_SHORT, CHECK_REASON_TEXT, PARAMS, PART_NAME, diagText } from "./score";
import type { LookTemplate, PartId, PartResult, PartStatus, SessionSummary, Versions } from "./types";
import { LOOK_PART_IDS } from "./types";

export const CONTOUR_ID = "contour" satisfies PartId;

export const STATUS_LABEL: Record<PartStatus, string> = {
  not_started: "미시작",
  in_progress: "진행 중",
  check_only: "확인만",
  passed: "완료",
  skipped: "건너뜀",
};

/** 합산에 쓰는 룩 템플릿 조각 */
export type SummaryTemplate = Pick<LookTemplate, "partIds" | "weights" | "harmonyRange">;

export const DEFAULT_TEMPLATE: SummaryTemplate = {
  partIds: LOOK_PART_IDS,
  weights: { brow: 1.0, liner: 1.0, shadow: 1.0, lip: 1.0, cheek: 0.7 },
  harmonyRange: { maxDeltaAb: 12 },
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;

type ReviewPart = Pick<PartResult, "partId" | "status" | "score" | "diagnosisCodes" | "diagnosis" | "checkReason" | "lrIndex" | "metrics">;

/** 화면 6 부위 줄의 한 줄 평. 숫자 없이 방향 표현만. 확인만 부위는 이유 문장 */
export function reviewLine(p: ReviewPart): string {
  if (p.partId === CONTOUR_ID) {
    const lr = p.lrIndex ? p.lrIndex.right - p.lrIndex.left : 0;
    const side = Math.abs(lr) >= 10 ? (lr > 0 ? " 오른쪽이 조금 진해요" : " 왼쪽이 조금 진해요") : "";
    return CHECK_REASON_TEXT.contour + side;
  }
  // 리뷰는 다 끝난 뒤라 할 일("다시 확인받아") 없이 이유만
  if (p.status === "check_only") return CHECK_REASON_SHORT[p.checkReason ?? "faint"];
  if (p.status === "skipped") return "건너뛴 부위예요";
  if (p.status !== "passed") return "";
  if (p.diagnosis) return p.diagnosis;
  const texts = p.diagnosisCodes.map(diagText).filter((t): t is string => !!t);
  return texts.length ? texts.join(". ") : "잘 됐어요";
}

/** 좌우 차가 이만큼이면 대칭 보정이 끝까지 간다. 형태 부위는 눈 폭 비율(≈ 옛 3mm), 강도 부위는 지수 차 */
const SYM_FULL = { lrDiff: 0.11, lrIndex: 30 } as const;

/** 대칭 보정 (0 ~ −5). 통과 부위 중 좌우 정보가 있는 부위만. 형태 부위는 metrics.lrDiff, 강도 부위는 lrIndex 차 */
export function symmetryPenalty(parts: readonly ReviewPart[]): number {
  const vals: number[] = [];
  for (const p of parts) {
    if (p.status !== "passed" || p.partId === CONTOUR_ID) continue;
    if (typeof p.metrics.lrDiff === "number") vals.push(clamp(Math.abs(p.metrics.lrDiff) / SYM_FULL.lrDiff, 0, 1));
    else if (p.lrIndex) vals.push(clamp(Math.abs(p.lrIndex.left - p.lrIndex.right) / SYM_FULL.lrIndex, 0, 1));
  }
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return round1(-5 * avg) || 0;   // -0 방지
}

export interface HarmonyResult {
  penalty: number;
  /** 볼·입술 둘 다 통과했고 색이 있어서 실제로 비교했는가 */
  applied: boolean;
  /** 볼·입술 a*b* 거리. 비교했을 때만 */
  dist?: number;
}

/** 조화 보정 (0 ~ −5). 볼·입술 둘 다 통과하고 색(a*·b*)이 있을 때만. 템플릿에 범위가 없으면 미적용 */
export function harmonyPenalty(parts: readonly ReviewPart[], template: Pick<SummaryTemplate, "harmonyRange">): HarmonyResult {
  const range = template.harmonyRange;
  if (!range) return { penalty: 0, applied: false };
  const colorOf = (id: PartId) => {
    const p = parts.find((x) => x.partId === id);
    return p && p.status === "passed" ? p.metrics.colorAb : undefined;
  };
  const cheek = colorOf("cheek"), lip = colorOf("lip");
  if (!cheek || !lip) return { penalty: 0, applied: false };
  const dist = Math.hypot(cheek.a - lip.a, cheek.b - lip.b);
  if (dist <= range.maxDeltaAb) return { penalty: 0, applied: true, dist };
  const over = (dist - range.maxDeltaAb) / range.maxDeltaAb;
  return { penalty: round1(-clamp(5 * over, 0, 5)), applied: true, dist };
}

/** 합산 (F-10). 룩 부위 중 passed 만 가중 평균 + 보정. 측정된 부위가 없으면 total = null */
export function computeSummary(parts: readonly ReviewPart[], template: SummaryTemplate = DEFAULT_TEMPLATE, now: () => number = Date.now): SessionSummary {
  const partIds: readonly PartId[] = template.partIds;
  const measured = parts.filter((p) => p.partId !== CONTOUR_ID && partIds.includes(p.partId) && p.status === "passed" && typeof p.score === "number");
  const sym = symmetryPenalty(parts);
  const harm = harmonyPenalty(parts, template);
  let base: number | null = null, total: number | null = null;
  if (measured.length) {
    let ws = 0, acc = 0;
    for (const p of measured) {
      const w = (template.weights as Partial<Record<PartId, number>>)[p.partId] ?? 1;
      ws += w;
      acc += w * (p.score ?? 0);
    }
    base = acc / ws;
    total = clamp(Math.round(base + sym + harm.penalty), 0, 100);
  }
  return {
    total,
    base: base == null ? null : round1(base),
    measuredCount: measured.length,
    partCount: partIds.length,
    symmetryPenalty: sym,
    harmonyPenalty: harm.penalty,
    harmonyApplied: harm.applied,
    computedAt: now(),
  };
}

/** 부위 결과 덮어쓰기 (재확인). 같은 partId 는 교체하고 attempts 를 올린다. 쉐딩은 점수가 와도 확인만으로 */
export function upsertPart(parts: readonly PartResult[], next: PartResult, now: () => number = Date.now): PartResult[] {
  const idx = parts.findIndex((p) => p.partId === next.partId);
  const prevAttempts = idx >= 0 ? parts[idx]!.attempts : 0;
  const norm: PartResult = next.partId === CONTOUR_ID && next.status === "passed" ? { ...next, status: "check_only", score: null, checkReason: "contour" } : next;
  const rec: PartResult = { ...norm, attempts: prevAttempts + 1, updatedAt: now() };
  const out = parts.slice();
  if (idx >= 0) out[idx] = rec;
  else out.push(rec);
  return out;
}

// ---------- 기록 (로드맵용) ----------

export interface SessionRecord {
  id: string;
  /** ISO 시각. 문자열 비교로 정렬한다 */
  date: string;
  lookId: string;
  lookName: string;
  summary: SessionSummary;
  parts: PartResult[];
  previewImagePath: string | null;
  finalImagePath: string | null;
  lightingRef: { foreheadL: number } | null;
  ver: Versions | null;
}

export interface Miss {
  code: string;
  partId: PartId;
  part: string;
  text: string;
  count: number;
  /** 집계한 회차 수 */
  n: number;
}

/**
 * 자주 틀리는 부위. 최근 n회에서 진단 코드가 등장한 회차 수를 센다 (회차당 1회).
 * 대상 부위 상태: passed 또는 check_only. 동률이면 더 최근에 나온 것 먼저
 */
export function topMisses(records: readonly SessionRecord[], n = 5, top = 2): Miss[] {
  const recent = records.slice(-n);
  const count = new Map<string, { code: string; count: number; lastIdx: number; partId: PartId }>();
  recent.forEach((r, idx) => {
    const seen = new Set<string>();
    for (const p of r.parts) {
      if (p.status !== "passed" && p.status !== "check_only") continue;
      for (const code of p.diagnosisCodes) {
        if (seen.has(code)) continue;
        seen.add(code);
        const e = count.get(code) ?? { code, count: 0, lastIdx: -1, partId: p.partId };
        e.count += 1;
        e.lastIdx = idx;
        count.set(code, e);
      }
    }
  });
  return [...count.values()]
    .sort((a, b) => b.count - a.count || b.lastIdx - a.lastIdx)
    .slice(0, top)
    .map((e) => ({ code: e.code, partId: e.partId, part: PART_NAME[e.partId], text: diagText(e.code) ?? e.code, count: e.count, n: recent.length }));
}

/** 조명 차 안내 한 줄 (화면 6·결과 카드). 숫자 없이 (F-09) */
export const LIGHTING_NOTE = "조명이 달라서 색은 참고만 해 주세요";

/**
 * 조명 참조(이마 L*) 차이가 임계 이상이면 "조명 다름". 임계는 채점 조명 한계(PARAMS.lightTol)와 같다 —
 * 전엔 8 이라 채점은 된 결과에 "조명이 달라서 색은 참고만" 이 붙었다 (2026-09-30 조명 한계 맞추기)
 */
export function lightingDiffers(a: { foreheadL: number } | null, b: { foreheadL: number } | null, threshold = PARAMS.lightTol): boolean {
  if (!a || !b) return false;
  return Math.abs(a.foreheadL - b.foreheadL) >= threshold;
}

/** 추이 데이터. total 이 null 인 회차는 y = null 로 둔다 (빈칸) */
export function trendSeries(records: readonly SessionRecord[], lookId: string | null = null): { id: string; date: string; y: number | null; lookId: string }[] {
  return records.filter((r) => !lookId || r.lookId === lookId).map((r) => ({ id: r.id, date: r.date, y: r.summary.total, lookId: r.lookId }));
}

export interface HistoryAdapter {
  load(): SessionRecord[];
  save(records: SessionRecord[]): void;
}

/** 기록 저장소. cap 을 넘으면 오래된 것부터 지운다 */
export class HistoryStore {
  constructor(
    private readonly adapter: HistoryAdapter,
    private readonly cap = 100,
  ) {}

  list(): SessionRecord[] {
    return this.adapter.load();
  }

  get(id: string): SessionRecord | null {
    return this.list().find((r) => r.id === id) ?? null;
  }

  /** removed 의 이미지 파일은 부르는 쪽에서 지운다 */
  save(record: SessionRecord): { saved: SessionRecord; removed: SessionRecord[] } {
    const arr = this.list().filter((r) => r.id !== record.id);
    arr.push(record);
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const removed = arr.splice(0, Math.max(0, arr.length - this.cap));
    this.adapter.save(arr);
    return { saved: record, removed };
  }

  delete(id: string): SessionRecord | null {
    const arr = this.list();
    this.adapter.save(arr.filter((r) => r.id !== id));
    return arr.find((r) => r.id === id) ?? null;
  }

  clear(): SessionRecord[] {
    const arr = this.list();
    this.adapter.save([]);
    return arr;
  }
}

export function memoryAdapter(): HistoryAdapter {
  let data: SessionRecord[] = [];
  return { load: () => data.slice(), save: (arr) => { data = arr.slice(); } };
}

export interface MakeRecordInput {
  id: string;
  date: string;
  lookId: string;
  lookName: string;
  parts: PartResult[];
  template?: SummaryTemplate;
  previewImagePath?: string | null;
  finalImagePath?: string | null;
  lightingRef?: { foreheadL: number } | null;
  ver?: Versions | null;
}

export function makeRecord(input: MakeRecordInput, now: () => number = Date.now): SessionRecord {
  const { id, date, lookId, lookName, parts, template = DEFAULT_TEMPLATE } = input;
  return {
    id, date, lookId, lookName,
    summary: computeSummary(parts, template, now),
    parts,
    previewImagePath: input.previewImagePath ?? null,
    finalImagePath: input.finalImagePath ?? null,
    lightingRef: input.lightingRef ?? null,
    ver: input.ver ?? null,
  };
}
