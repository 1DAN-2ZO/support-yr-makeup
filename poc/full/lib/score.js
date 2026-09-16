// 화면 5·5-b 부위 결과 — 순수 로직 (브라우저·Node 공용)
// 입력은 sampling.js가 뽑은 Lab 샘플(기준 쌩얼 vs 내 화장). 여기서 ΔE → 지표 → 점수 → 진단 코드 → 한 줄 평 → 상태.
// 화면에는 점수(또는 "확인만")와 한 줄 평만. mm·각도·%는 내부용.

export const PART_IDS = ['brow', 'liner', 'shadow', 'lip', 'cheek', 'contour'];
export const PART_NAME = { brow: '눈썹', liner: '아이라이너', shadow: '섀도우', lip: '입술', cheek: '볼터치', contour: '쉐딩·하이라이트' };
export const PART_ORIENT = { brow: 'landscape', liner: 'landscape', shadow: 'landscape', lip: 'portrait', cheek: 'portrait', contour: 'portrait' };
export const FORM_PARTS = ['brow', 'liner', 'lip'];
export const INTENSITY_PARTS = ['shadow', 'cheek', 'contour'];

// 가정값 (2단계 실험으로 정함)
export const PARAMS = {
  dEThresh: { liner: 14, brow: 10, lip: 10 },     // 형태 부위 화장 감지 임계
  tPresent: { shadow: 3.5, cheek: 4, contour: 4 },  // 강도 부위 유무 임계 (부위 ΔE − 참조 ΔE)
  dEMaxSession: 25, toneDiv: 4, lightTol: 12,
  band: { cheek: [25, 60], shadow: [20, 65] },     // 목표 지수 밴드 (룩 템플릿 값, 없으면 확인만)
  guide: { liner: { thickMm: 1.2, wingMm: 4 }, brow: { tailMm: 3 }, lip: { offsetMm: 0.5 } },
};

export const DIAG_TEXT = {
  LINER_WING_HIGH_R: '오른쪽 꼬리가 조금 위로 갔어요. 왼쪽에 맞춰 살짝 내려 그리세요',
  LINER_WING_HIGH_L: '왼쪽 꼬리가 조금 위로 갔어요. 오른쪽에 맞춰 살짝 내려 그리세요',
  LINER_WING_LOW_R: '오른쪽 꼬리가 조금 아래로 갔어요. 살짝 올려 그리세요',
  LINER_WING_LOW_L: '왼쪽 꼬리가 조금 아래로 갔어요. 살짝 올려 그리세요',
  LINER_WING_SHORT_R: '오른쪽 꼬리가 짧아요. 조금 더 빼 주세요', LINER_WING_SHORT_L: '왼쪽 꼬리가 짧아요. 조금 더 빼 주세요',
  LINER_THICK: '선이 조금 두꺼워요. 다음엔 얇게 시작해 보세요', LINER_THIN: '선이 옅어요. 한 번 더 겹쳐 그리세요',
  LINER_GAP_R: '오른쪽 속눈썹 사이가 비었어요', LINER_GAP_L: '왼쪽 속눈썹 사이가 비었어요',
  LINER_OUT_R: '오른쪽 선이 라인 밖으로 번졌어요', LINER_OUT_L: '왼쪽 선이 라인 밖으로 번졌어요',
  LINER_LR_DIFF: '좌우 꼬리 높이가 달라요',
  BROW_TAIL_SHORT_R: '오른쪽 눈썹 꼬리가 짧아요. 눈꼬리 연장선까지 채우세요', BROW_TAIL_SHORT_L: '왼쪽 눈썹 꼬리가 짧아요. 눈꼬리 연장선까지 채우세요',
  BROW_OUT_R: '오른쪽 눈썹이 테두리 밖으로 나갔어요', BROW_OUT_L: '왼쪽 눈썹이 테두리 밖으로 나갔어요',
  BROW_SPARSE: '눈썹 안쪽이 덜 채워졌어요', BROW_LR_DIFF: '좌우 눈썹 높이가 달라요',
  LIP_OUT_LOWER: '아래 경계가 살짝 밖으로 나갔어요', LIP_OUT_UPPER: '위 경계가 살짝 밖으로 나갔어요',
  LIP_UNDER: '입술 안쪽이 덜 채워졌어요. 가운데를 한 번 더', LIP_LR_DIFF: '좌우 입꼬리가 달라요',
  SHADOW_DIR: '눈꼬리 쪽으로 더 진하게 가야 해요', SHADOW_LR_DIFF_R: '오른쪽 섀도우가 조금 진해요', SHADOW_LR_DIFF_L: '왼쪽 섀도우가 조금 진해요',
  CHEEK_LR_DIFF_R: '오른쪽이 조금 진해요', CHEEK_LR_DIFF_L: '왼쪽이 조금 진해요',
  TONE_OVER: '조금 진해요', TONE_UNDER: '조금 더 진하게', TONE_OK: '적당해요',
  CONTOUR_LR_R: '오른쪽이 조금 진해요', CONTOUR_LR_L: '왼쪽이 조금 진해요',
};
export const CHECK_REASON = {
  absent: '색이 옅어서 재지 못했어요. 직접 보고 넘어가세요',
  lighting: '조명이 달라져서 재지 못했어요. 직접 보고 넘어가세요',
  noface: '얼굴을 찾지 못해 재지 못했어요. 직접 보고 넘어가세요',
  noband: '이 룩은 진하기 기준이 없어요. 직접 보고 넘어가세요',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
/** 조명 보정: 이마 L* 비율로 현재 Lab의 L 스케일 */
export const lightCorr = (baseFore, curFore) => { const r = baseFore[0] / Math.max(1, curFore[0]); return (lab) => [lab[0] * r, lab[1], lab[2]]; };

// ---------- 형태 채점 (문서 5-3) ----------
export function scoreForm({ coverage, overflow, wingDeltaMm = 0, thickDeltaMm = 0 }) {
  let s = 100;
  s -= (1 - coverage) * 50;
  s -= clamp(overflow * 60, 0, 30);
  s -= clamp(Math.abs(wingDeltaMm) * 8, 0, 20);
  s -= clamp(Math.abs(thickDeltaMm) * 5, 0, 10);
  return Math.round(clamp(s, 0, 100));
}

/**
 * 아이라이너 스트립 비교. strip = { lab: [N][M], meta: { offsMm[M], isWing[N], tFromCornerMm[N], wingLenMm, sideSign[N] } }
 * 눈별 지표: coverage(밴드 안 감지율), overflow(밴드 밖 감지율), thicknessMm, wingDrawnMm, wingDevMm(+위/−아래), gapRatio
 */
export function compareLinerEye(base, cur, corr, p = PARAMS) {
  const { offsMm, isWing, tFromCornerMm, wingLenMm } = cur.meta, half = p.guide.liner.thickMm / 2, N = Math.min(base.lab.length, cur.lab.length), M = offsMm.length;
  const step = M > 1 ? offsMm[1] - offsMm[0] : 0.25;
  let rowsN = 0, rowsCovered = 0, outN = 0, outHit = 0, wingDrawn = 0, lidRows = 0, lidHitRows = 0;
  const thick = [], devs = [];
  for (let i = 0; i < N; i++) {
    let drawnW = 0, hitOffs = [], bandHit = false;
    for (let j = 0; j < M; j++) {
      const d = dE(base.lab[i][j], corr(cur.lab[i][j])), hit = d >= p.dEThresh.liner, o = offsMm[j];
      if (Math.abs(o) <= half + 0.3) { if (hit) bandHit = true; }           // 가이드 밴드(두께 + 허용 0.3mm) 안에 감지가 있으면 그 행은 덮임
      else if (Math.abs(o) > half + 0.6) { outN++; if (hit) outHit++; }   // 밴드 밖 번짐
      if (hit) { drawnW += step; hitOffs.push(o); }
    }
    rowsN++; if (bandHit) rowsCovered++;
    if (drawnW > 0) { thick.push(drawnW); if (isWing[i] && tFromCornerMm[i] > wingLenMm * 0.5) devs.push(median(hitOffs)); }   // 꼬리 바깥쪽 절반의 중심 오프셋
    if (!isWing[i]) { lidRows++; if (drawnW > 0) lidHitRows++; }
    if (isWing[i] && drawnW >= 0.4) wingDrawn = Math.max(wingDrawn, tFromCornerMm[i]);
  }
  const wingRows = devs;   // 꼬리 끝 쪽 행들의 감지 중심 오프셋(mm, + = 위)
  return {
    coverage: rowsN ? rowsCovered / rowsN : 0, overflow: outN ? outHit / outN : 0,
    thicknessMm: median(thick), wingGuideMm: wingLenMm, wingDrawnMm: wingDrawn,
    wingDevMm: wingRows.length ? median(wingRows) : 0,   // + 는 가이드 법선(위·바깥) 방향
    gapRatio: lidRows ? 1 - lidHitRows / lidRows : 1, present: thick.length >= 3,
  };
}
export function linerResult(perEye, baseAsymMm = 0, p = PARAMS) {
  const R = perEye.R, L = perEye.L, codes = [];
  const present = R.present || L.present;
  if (!present) return { present, score: null, codes, metrics: { perEye } };
  for (const [k, e] of [['R', R], ['L', L]]) {
    if (!e.present) { codes.push(`LINER_GAP_${k}`); continue; }
    if (e.wingDevMm > 0.6) codes.push(`LINER_WING_HIGH_${k}`); else if (e.wingDevMm < -0.6) codes.push(`LINER_WING_LOW_${k}`);
    if (e.wingDrawnMm < e.wingGuideMm - 1.5) codes.push(`LINER_WING_SHORT_${k}`);
    if (e.gapRatio > 0.25) codes.push(`LINER_GAP_${k}`);
    if (e.overflow > 0.35) codes.push(`LINER_OUT_${k}`);
  }
  const thickAvg = (R.thicknessMm + L.thicknessMm) / 2;
  if (thickAvg > p.guide.liner.thickMm + 0.4) codes.push('LINER_THICK'); else if (thickAvg < p.guide.liner.thickMm - 0.6 && thickAvg > 0) codes.push('LINER_THIN');
  const lrDiffMm = Math.abs((R.wingDevMm - L.wingDevMm) - baseAsymMm);
  if (lrDiffMm > 1.2) codes.push('LINER_LR_DIFF');
  const avg = (a, b) => (a + b) / 2;
  const score = scoreForm({ coverage: avg(R.coverage, L.coverage), overflow: avg(R.overflow, L.overflow), wingDeltaMm: avg(R.wingDrawnMm - R.wingGuideMm, L.wingDrawnMm - L.wingGuideMm), thickDeltaMm: thickAvg - p.guide.liner.thickMm });
  return { present, score, codes, metrics: { perEye, lrDiffMm, thicknessMm: thickAvg } };
}

/** 영역 격자 비교 (눈썹): grid = { lab: [K], meta: { inside[K], tail[K], side[K] } } */
export function compareRegion(base, cur, corr, thresh) {
  const K = Math.min(base.lab.length, cur.lab.length);
  const acc = { R: { inN: 0, inHit: 0, outN: 0, outHit: 0, tailN: 0, tailHit: 0 }, L: { inN: 0, inHit: 0, outN: 0, outHit: 0, tailN: 0, tailHit: 0 } };
  for (let i = 0; i < K; i++) {
    const a = acc[cur.meta.side[i]];
    const th = base.lab[i][0] < 40 ? thresh * 0.5 : thresh;                 // 맨얼굴에서 이미 어두운 점(눈썹 털)은 펜슬 변화가 작으므로 임계를 절반으로
    const hit = dE(base.lab[i], corr(cur.lab[i])) >= th;
    if (cur.meta.inside[i]) { a.inN++; if (hit) a.inHit++; if (cur.meta.tail[i]) { a.tailN++; if (hit) a.tailHit++; } } else { a.outN++; if (hit) a.outHit++; }
  }
  const f = (a) => ({ coverage: a.inN ? a.inHit / a.inN : 0, overflow: a.outN ? a.outHit / a.outN : 0, tailCoverage: a.tailN ? a.tailHit / a.tailN : 0, present: a.inHit >= 6 });
  return { R: f(acc.R), L: f(acc.L) };
}
export function browResult(per, p = PARAMS) {
  const codes = [], present = per.R.present || per.L.present;
  if (!present) return { present, score: null, codes, metrics: per };
  for (const k of ['R', 'L']) { const e = per[k]; if (e.tailCoverage < 0.4) codes.push(`BROW_TAIL_SHORT_${k}`); if (e.overflow > 0.3) codes.push(`BROW_OUT_${k}`); }
  if ((per.R.coverage + per.L.coverage) / 2 < 0.45) codes.push('BROW_SPARSE');
  const score = scoreForm({ coverage: (per.R.coverage + per.L.coverage) / 2, overflow: (per.R.overflow + per.L.overflow) / 2 });
  return { present, score, codes, metrics: per };
}

/** 입술 경계 스트립: strip = { lab:[N][M], meta:{ offsMm[M] (−안쪽 … +바깥쪽), half[N]: 'upper'|'lower', side[N] } } */
export function compareLip(base, cur, corr, p = PARAMS) {
  const { offsMm, half, side } = cur.meta, N = Math.min(base.lab.length, cur.lab.length), M = offsMm.length, off = p.guide.lip.offsetMm;
  const acc = { upper: { outN: 0, outHit: 0 }, lower: { outN: 0, outHit: 0 } }; let inN = 0, inHit = 0, rowsHit = 0; const sideHit = { R: [0, 0], L: [0, 0] };
  for (let i = 0; i < N; i++) {
    let any = false;
    for (let j = 0; j < M; j++) {
      const hit = dE(base.lab[i][j], corr(cur.lab[i][j])) >= p.dEThresh.lip, o = offsMm[j];
      if (o <= off + 0.3) { inN++; if (hit) inHit++; } else if (o > off + 0.6) { acc[half[i]].outN++; if (hit) acc[half[i]].outHit++; }
      if (hit) any = true;
    }
    if (any) rowsHit++; sideHit[side[i]][0]++; if (any) sideHit[side[i]][1]++;
  }
  const coverage = inN ? inHit / inN : 0, overU = acc.upper.outN ? acc.upper.outHit / acc.upper.outN : 0, overL = acc.lower.outN ? acc.lower.outHit / acc.lower.outN : 0;
  const present = rowsHit >= N * 0.3, codes = [];
  if (!present) return { present, score: null, codes, metrics: { coverage, overU, overL } };
  if (overL > 0.3) codes.push('LIP_OUT_LOWER'); if (overU > 0.3) codes.push('LIP_OUT_UPPER'); if (coverage < 0.5) codes.push('LIP_UNDER');
  const r = sideHit.R[0] ? sideHit.R[1] / sideHit.R[0] : 0, l = sideHit.L[0] ? sideHit.L[1] / sideHit.L[0] : 0; if (Math.abs(r - l) > 0.35) codes.push('LIP_LR_DIFF');
  return { present, score: scoreForm({ coverage, overflow: (overU + overL) / 2 }), codes, metrics: { coverage, overU, overL } };
}

// ---------- 강도 부위 (문서 5b-2) ----------
/** 부위 평균 ΔE − 참조 ΔE → 세션 내 지수 0~100 */
export function intensityIndex(partLabBase, partLabCur, refLabBase, refLabCur, corr, p = PARAMS) {
  const d = dE(partLabBase, corr(partLabCur)) - dE(refLabBase, corr(refLabCur));
  return { delta: d, index: clamp(d / p.dEMaxSession * 100, 0, 100) };
}
/** 피부 대비 톤 차이 (ΔL 나누기 4) */
export function toneDelta(partBase, partCur, adjBase, adjCur, corr, p = PARAMS) {
  const now = corr(partCur)[0] - corr(adjCur)[0], bare = partBase[0] - adjBase[0];
  return (now - bare) / p.toneDiv;
}
export function toneVerdict(index, band) {
  if (!band) return null;
  if (index > band[1]) return 'TONE_OVER'; if (index < band[0]) return 'TONE_UNDER'; return 'TONE_OK';
}
/** 볼터치·섀도우 점수: 밴드 안 100, 초과·미달 비례 감점, 좌우 차 감점. 밴드 없으면 null */
export function scoreIntensity(idxL, idxR, band) {
  if (!band) return null;
  const mean = (idxL + idxR) / 2;
  const out = mean > band[1] ? mean - band[1] : mean < band[0] ? band[0] - mean : 0;
  return Math.round(clamp(100 - out * 1.5 - Math.abs(idxL - idxR) * 0.8, 0, 100));
}
export function intensityResult(partId, { L, R, present, directionOk = true, band = PARAMS.band[partId] ?? null }) {
  const codes = [], lrDiff = R.index - L.index;
  if (partId === 'contour') {
    if (Math.abs(lrDiff) >= 10) codes.push(lrDiff > 0 ? 'CONTOUR_LR_R' : 'CONTOUR_LR_L');
    return { present, score: null, codes, checkOnly: true, metrics: { lrIndex: { left: L.index, right: R.index } } };
  }
  if (!present) return { present, score: null, codes, metrics: { lrIndex: { left: L.index, right: R.index } } };
  const mean = (L.index + R.index) / 2, verdict = toneVerdict(mean, band);
  if (Math.abs(lrDiff) >= 12) codes.push(partId === 'cheek' ? (lrDiff > 0 ? 'CHEEK_LR_DIFF_R' : 'CHEEK_LR_DIFF_L') : (lrDiff > 0 ? 'SHADOW_LR_DIFF_R' : 'SHADOW_LR_DIFF_L'));
  if (partId === 'shadow' && !directionOk) codes.push('SHADOW_DIR');
  if (verdict && verdict !== 'TONE_OK') codes.push(verdict);
  return { present, score: scoreIntensity(L.index, R.index, band), codes, verdict, metrics: { lrIndex: { left: L.index, right: R.index }, band } };
}

// ---------- 상태·한 줄 평 ----------
/** 결과 → PartResult 상태 결정. 측정 불가는 확인만 + 이유 */
export function decide(partId, res, ctx = {}) {
  if (ctx.noFace) return { status: 'check_only', reason: CHECK_REASON.noface, score: null };
  if (partId === 'contour') return { status: 'check_only', reason: null, score: null };
  if (typeof ctx.lightShift === 'number' && Math.abs(ctx.lightShift) > PARAMS.lightTol) return { status: 'check_only', reason: CHECK_REASON.lighting, score: null };
  if (!res.present) return { status: 'check_only', reason: CHECK_REASON.absent, score: null };
  if (res.score == null) return { status: 'check_only', reason: CHECK_REASON.noband, score: null };
  return { status: 'scored', reason: null, score: res.score };
}
/** 한 줄 평: 숫자 없이. 코드 우선순위대로 최대 2문장 */
export function oneLiner(partId, decision, codes = []) {
  if (partId === 'contour') { const s = codes.map((c) => DIAG_TEXT[c]).filter(Boolean)[0]; return '확인하고 넘어가세요.' + (s ? ' ' + s : ''); }
  if (decision.status === 'check_only') return decision.reason;
  const texts = codes.map((c) => DIAG_TEXT[c]).filter(Boolean);
  if (!texts.length) return '잘 됐어요';
  return texts.slice(0, 2).join('. ');
}
export function hasDigit(s) { return /\d/.test(s); }

// ---------- 랜드마크 정렬 (문서 5-2: 각 프레임을 Baseline 좌표계로) ----------
/** 화장에 영향받지 않는 안정 점: 눈 안팎 끝, 콧대, 얼굴 옆, 턱, 이마 */
export const STABLE_IDS = [33, 133, 362, 263, 168, 6, 197, 195, 5, 4, 234, 454, 152, 10, 127, 356];
/** 2D 유사변환(크기·회전·이동) 최소제곱: src → dst. 반환 { s, deg, apply(p), residual } */
export function similarityFit(src, dst) {
  const n = Math.min(src.length, dst.length); let mx = 0, my = 0, ux = 0, uy = 0;
  for (let i = 0; i < n; i++) { mx += src[i].x; my += src[i].y; ux += dst[i].x; uy += dst[i].y; }
  mx /= n; my /= n; ux /= n; uy /= n;
  let a = 0, b = 0, v = 0;
  for (let i = 0; i < n; i++) { const sx = src[i].x - mx, sy = src[i].y - my, dx = dst[i].x - ux, dy = dst[i].y - uy; a += sx * dx + sy * dy; b += sx * dy - sy * dx; v += sx * sx + sy * sy; }
  const cr = v ? a / v : 1, ci = v ? b / v : 0;
  const apply = (p) => ({ x: cr * (p.x - mx) - ci * (p.y - my) + ux, y: ci * (p.x - mx) + cr * (p.y - my) + uy, z: p.z });
  let res = 0; for (let i = 0; i < n; i++) { const q = apply(src[i]); res += Math.hypot(q.x - dst[i].x, q.y - dst[i].y); }
  return { s: Math.hypot(cr, ci), deg: Math.atan2(ci, cr) * 180 / Math.PI, apply, residual: n ? res / n : 0 };
}
/** 기준(쌩얼) 랜드마크를 현재 프레임으로 옮긴다. 화장 부위 랜드마크는 재검출값을 쓰지 않는다(화장에 따른 편향 차단) */
export function alignToBaseline(baseLm, curLm) {
  const fit = similarityFit(STABLE_IDS.map((i) => baseLm[i]), STABLE_IDS.map((i) => curLm[i]));
  return { lm: baseLm.map(fit.apply), fit };
}
/** 화장으로 인한 랜드마크 이동량(px 평균): 재검출값 vs 정렬값, 화장 부위 점만 */
export function makeupBiasPx(alignedLm, curLm, ids) { return ids.reduce((s, i) => s + Math.hypot(alignedLm[i].x - curLm[i].x, alignedLm[i].y - curLm[i].y), 0) / ids.length; }

// ---------- 세션 (화면 5의 다음·건너뛰기) ----------
export function applyNext(session, partId, result) {
  const status = result.status === 'check_only' ? 'check_only' : 'passed';
  const parts = session.parts.map((p) => p.partId === partId ? { ...p, status, score: result.score, diagnosisCodes: result.codes, diagnosis: result.oneLiner, checkReason: result.reason, attempts: (p.attempts || 0) + 1 } : p);
  return { ...session, parts };
}
export function applySkip(session, partId) {
  return { ...session, parts: session.parts.map((p) => p.partId === partId ? { ...p, status: 'skipped', score: null } : p) };
}
export function nextPartId(session, partId) {
  const i = PART_IDS.indexOf(partId);
  return PART_IDS.slice(i + 1).find((id) => ['not_started', 'in_progress'].includes(session.parts.find((p) => p.partId === id).status)) || null;
}
export function createSession() { return { parts: PART_IDS.map((partId) => ({ partId, status: 'not_started', score: null, attempts: 0 })) }; }
