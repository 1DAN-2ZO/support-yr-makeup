// 화면 7·8 핵심 계산 모듈 (순수 함수). 브라우저·Node 공용 ESM.

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek'];
export const PART_NAME = { brow: '눈썹', liner: '아이라이너', shadow: '섀도우', lip: '입술', cheek: '볼·쉐딩' };

export const DEFAULT_TEMPLATE = {
  partIds: PART_IDS,
  weights: { brow: 1.0, liner: 1.0, shadow: 1.0, lip: 1.0, cheek: 0.7 },
  // 볼·입술 색 조화 허용 범위 (Lab a*,b* 거리). null 이면 조화 보정 미적용
  harmonyRange: { maxDeltaAb: 12 },
};

// 진단 코드 → 표시 문장
export const DIAG_TEXT = {
  LINER_WING_HIGH_R: '아이라이너 오른쪽 꼬리가 위로',
  LINER_WING_LOW_L: '아이라이너 왼쪽 꼬리가 아래로',
  LINER_THICK: '아이라이너 두께 초과',
  BROW_TAIL_SHORT: '눈썹 꼬리 짧음',
  BROW_LR_DIFF: '눈썹 좌우 높이 차이',
  SHADOW_DIR: '섀도우 방향 불일치',
  LIP_OUT_LOWER: '입술 아래 경계 밖',
  CHEEK_LR_DIFF: '볼 쉐딩 좌우 차이',
  CONTOUR_TOO_DARK: '쉐딩 너무 어두움',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * 대칭 보정 (0 ~ -5). 통과 부위 중 좌우 정보가 있는 부위만.
 * 형태 부위: metrics.lrDiffMm (3mm = 1), 강도 부위: lrIndex 차 (30 = 1)
 */
export function symmetryPenalty(parts) {
  const vals = [];
  for (const p of parts) {
    if (p.status !== 'passed') continue;
    if (p.metrics && typeof p.metrics.lrDiffMm === 'number') {
      vals.push(clamp(Math.abs(p.metrics.lrDiffMm) / 3, 0, 1));
    } else if (p.lrIndex && typeof p.lrIndex.left === 'number' && typeof p.lrIndex.right === 'number') {
      vals.push(clamp(Math.abs(p.lrIndex.left - p.lrIndex.right) / 30, 0, 1));
    }
  }
  if (!vals.length) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return round1(-5 * avg);
}

/**
 * 조화 보정 (0 ~ -5). 볼·입술 둘 다 통과하고 색(a*,b*)이 있을 때만.
 * 템플릿에 범위가 없으면 {penalty:0, applied:false}
 */
export function harmonyPenalty(parts, template) {
  const range = template && template.harmonyRange;
  if (!range || typeof range.maxDeltaAb !== 'number') return { penalty: 0, applied: false };
  const cheek = parts.find((p) => p.partId === 'cheek');
  const lip = parts.find((p) => p.partId === 'lip');
  const ok = (p) => p && p.status === 'passed' && p.metrics && p.metrics.colorAb;
  if (!ok(cheek) || !ok(lip)) return { penalty: 0, applied: false };
  const da = cheek.metrics.colorAb.a - lip.metrics.colorAb.a;
  const db = cheek.metrics.colorAb.b - lip.metrics.colorAb.b;
  const dist = Math.hypot(da, db);
  if (dist <= range.maxDeltaAb) return { penalty: 0, applied: true, dist };
  const over = (dist - range.maxDeltaAb) / range.maxDeltaAb;
  return { penalty: round1(-clamp(5 * over, 0, 5)), applied: true, dist };
}

/** 합산 (F-10). 통과 부위만 가중 평균 + 보정. 측정 0개면 total=null */
export function computeSummary(parts, template = DEFAULT_TEMPLATE) {
  const weights = template.weights || DEFAULT_TEMPLATE.weights;
  const partIds = template.partIds || PART_IDS;
  const measured = parts.filter((p) => partIds.includes(p.partId) && p.status === 'passed' && typeof p.score === 'number');
  const sym = symmetryPenalty(parts);
  const harm = harmonyPenalty(parts, template);
  let base = null, total = null;
  if (measured.length) {
    let ws = 0, acc = 0;
    for (const p of measured) { const w = weights[p.partId] ?? 1; ws += w; acc += w * p.score; }
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
    weights,
    computedAt: Date.now(),
  };
}

/** 부위 결과 덮어쓰기 (재확인). 같은 partId 는 교체, attempts 증가 */
export function upsertPart(parts, next) {
  const idx = parts.findIndex((p) => p.partId === next.partId);
  const prevAttempts = idx >= 0 ? (parts[idx].attempts || 0) : 0;
  const rec = { ...next, attempts: prevAttempts + 1, updatedAt: Date.now() };
  const out = parts.slice();
  if (idx >= 0) out[idx] = rec; else out.push(rec);
  return out;
}

/**
 * 자주 틀리는 부위. 최근 n회에서 진단 코드가 등장한 회차 수를 센다(회차당 1회).
 * 대상 부위 상태: passed 또는 check_only. 동률이면 더 최근 등장 우선.
 */
export function topMisses(records, n = 5, top = 2) {
  const recent = records.slice(-n);
  const count = new Map(); // code -> {count, lastIdx, partId}
  recent.forEach((r, idx) => {
    const seen = new Set();
    for (const p of r.parts || []) {
      if (p.status !== 'passed' && p.status !== 'check_only') continue;
      for (const code of p.diagnosisCodes || []) {
        if (seen.has(code)) continue;
        seen.add(code);
        const e = count.get(code) || { code, count: 0, lastIdx: -1, partId: p.partId };
        e.count += 1; e.lastIdx = idx; count.set(code, e);
      }
    }
  });
  return [...count.values()]
    .sort((a, b) => b.count - a.count || b.lastIdx - a.lastIdx)
    .slice(0, top)
    .map((e) => ({ code: e.code, partId: e.partId, part: PART_NAME[e.partId] || e.partId, text: DIAG_TEXT[e.code] || e.code, count: e.count, n: recent.length }));
}

/** 조명 참조(이마 L*) 차이가 임계 이상이면 '조명 다름' */
export function lightingDiffers(a, b, threshold = 8) {
  if (!a || !b || typeof a.foreheadL !== 'number' || typeof b.foreheadL !== 'number') return false;
  return Math.abs(a.foreheadL - b.foreheadL) >= threshold;
}

/** 추이 데이터. total null 은 y=null 로 유지(빈칸) */
export function trendSeries(records, lookId = null) {
  return records
    .filter((r) => !lookId || r.lookId === lookId)
    .map((r) => ({ id: r.id, date: r.date, y: r.summary ? r.summary.total : null, lookId: r.lookId }));
}

/** 기록 저장소. adapter = {load():Array, save(arr)} ; cap 초과 시 오래된 것부터 삭제 */
export class HistoryStore {
  constructor(adapter, cap = 100) { this.adapter = adapter; this.cap = cap; }
  list() { return this.adapter.load() || []; }
  get(id) { return this.list().find((r) => r.id === id) || null; }
  save(record) {
    const arr = this.list().filter((r) => r.id !== record.id);
    arr.push(record);
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const removed = [];
    while (arr.length > this.cap) removed.push(arr.shift());
    this.adapter.save(arr);
    return { saved: record, removed }; // removed 의 이미지 파일은 호출측에서 삭제
  }
  delete(id) {
    const arr = this.list();
    const target = arr.find((r) => r.id === id) || null;
    this.adapter.save(arr.filter((r) => r.id !== id));
    return target;
  }
  clear() { const arr = this.list(); this.adapter.save([]); return arr; }
}

export function memoryAdapter() { let data = []; return { load: () => data.slice(), save: (arr) => { data = arr.slice(); } }; }

export function makeRecord({ id, date, lookId, lookName, parts, template, previewImagePath = null, finalImagePath = null, lightingRef = null }) {
  return {
    id, date, lookId, lookName,
    summary: computeSummary(parts, template),
    parts, previewImagePath, finalImagePath, lightingRef,
    appVersion: 'poc-0.1', ruleVersion: 'r1', modelVersion: 'none',
  };
}
