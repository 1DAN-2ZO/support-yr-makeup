// 화면 5 검증 — node tests.mjs (합성 Lab 스트립으로 채점·코드·문구·상태 검사)
import assert from 'node:assert/strict';
import {
  PARAMS, DIAG_TEXT, CHECK_REASON, scoreForm, compareLinerEye, linerResult, compareRegion, browResult, compareLip,
  intensityIndex, toneDelta, toneVerdict, scoreIntensity, intensityResult, decide, oneLiner, hasDigit, applyNext, applySkip, nextPartId, createSession, lightCorr, PART_IDS,
  similarityFit, alignToBaseline, makeupBiasPx, STABLE_IDS,
} from './core.js';

const results = [];
const test = (n, f) => { try { f(); results.push({ n, ok: true }); } catch (e) { results.push({ n, ok: false, e: e.message }); } };

const OFFS = []; for (let d = -3; d <= 3 + 1e-6; d += 0.25) OFFS.push(+d.toFixed(3));
const SKIN = [62, 12, 14], INK = [18, 4, 4];
const ID = (l) => l;
/** 라이너 스트립: N=80 (0~59 눈꺼풀, 60~79 꼬리 0~4mm), hit(i, offMm) 가 true 면 화장색 */
function linerStrip(hit) {
  const lab = [], isWing = [], tFromCornerMm = [];
  for (let i = 0; i < 80; i++) { const w = i >= 60; isWing.push(w); tFromCornerMm.push(w ? ((i - 59) / 20) * 4 : -1); lab.push(OFFS.map((o) => (hit(i, o) ? INK : SKIN))); }
  return { lab, meta: { offsMm: OFFS, isWing, tFromCornerMm, wingLenMm: 4 } };
}
const bareStrip = linerStrip(() => false);
const eyeRes = (hit) => compareLinerEye(bareStrip, linerStrip(hit), ID);
const perfect = (i, o) => Math.abs(o) <= 0.6;

test('F1 채점식: 완벽 100, 겹침 0.5 → 75, 밖 번짐 상한 30, 꼬리·두께 상한 20·10', () => {
  assert.equal(scoreForm({ coverage: 1, overflow: 0 }), 100);
  assert.equal(scoreForm({ coverage: 0.5, overflow: 0 }), 75);
  assert.equal(scoreForm({ coverage: 1, overflow: 1 }), 70);
  assert.equal(scoreForm({ coverage: 1, overflow: 0, wingDeltaMm: 10, thickDeltaMm: 10 }), 70);
});
test('L1 완벽한 라이너: 겹침 ≈1, 번짐 0, 두께 ≈1.25mm, 꼬리 4mm, 코드 없음, 점수 ≥95', () => {
  const R = eyeRes(perfect), L = eyeRes(perfect);
  assert.ok(R.coverage > 0.95 && R.overflow === 0 && Math.abs(R.thicknessMm - 1.25) < 0.01 && R.wingDrawnMm >= 3.9, JSON.stringify(R));
  const r = linerResult({ R, L }); assert.deepEqual(r.codes, []); assert.ok(r.score >= 95); assert.equal(r.present, true);
});
test('L2 오른쪽 꼬리 위로: 꼬리 구간이 +1.5mm 쪽 → LINER_WING_HIGH_R', () => {
  const R = eyeRes((i, o) => (i < 60 ? perfect(i, o) : Math.abs(o - 1.5) <= 0.6)), L = eyeRes(perfect);
  const r = linerResult({ R, L }); assert.ok(r.codes.includes('LINER_WING_HIGH_R'), r.codes.join()); assert.ok(!r.codes.includes('LINER_WING_HIGH_L'));
  assert.ok(r.codes.includes('LINER_LR_DIFF'));
});
test('L3 왼쪽 꼬리 아래로 → LINER_WING_LOW_L', () => {
  const r = linerResult({ R: eyeRes(perfect), L: eyeRes((i, o) => (i < 60 ? perfect(i, o) : Math.abs(o + 1.5) <= 0.6)) });
  assert.ok(r.codes.includes('LINER_WING_LOW_L'));
});
test('L4 두껍게(2.5mm) → LINER_THICK, 점수 하락', () => {
  const thick = (i, o) => Math.abs(o) <= 1.25; const r = linerResult({ R: eyeRes(thick), L: eyeRes(thick) });
  assert.ok(r.codes.includes('LINER_THICK')); assert.ok(r.score < 95);
});
test('L5 오른쪽 꼬리 짧게(1.5mm) → LINER_WING_SHORT_R', () => {
  const r = linerResult({ R: eyeRes((i, o) => perfect(i, o) && (i < 60 || ((i - 59) / 20) * 4 <= 1.5)), L: eyeRes(perfect) });
  assert.ok(r.codes.includes('LINER_WING_SHORT_R'));
});
test('L6 왼쪽 중간 비움(40%) → LINER_GAP_L', () => {
  const r = linerResult({ R: eyeRes(perfect), L: eyeRes((i, o) => perfect(i, o) && !(i >= 15 && i < 39)) });
  assert.ok(r.codes.includes('LINER_GAP_L'));
});
test('L7 화장 없음 → present false → 확인만 + 이유(색이 옅어서)', () => {
  const r = linerResult({ R: eyeRes(() => false), L: eyeRes(() => false) });
  assert.equal(r.present, false); assert.equal(r.score, null);
  const d = decide('liner', r); assert.equal(d.status, 'check_only'); assert.equal(d.reason, CHECK_REASON.absent);
});
test('L8 조명 보정: 이마 L 이 20% 어두워도 같은 판정', () => {
  const dark = (lab) => [lab[0] * 0.8, lab[1], lab[2]];
  const cur = linerStrip(perfect); cur.lab = cur.lab.map((row) => row.map(dark));
  const corr = lightCorr([60, 0, 0], [48, 0, 0]); const e = compareLinerEye(bareStrip, cur, corr);
  assert.ok(e.coverage > 0.95 && e.overflow === 0);
});

// ---------- 눈썹 ----------
function browGrid(hit) {
  const lab = [], inside = [], tail = [], side = [];
  for (const key of ['R', 'L']) for (let ui = 0; ui < 24; ui++) for (const v of [-0.6, -0.3, 0.1, 0.3, 0.5, 0.7, 0.9, 1.3, 1.6]) {
    const inn = v >= 0 && v <= 1, tl = ui / 23 < 0.4; inside.push(inn); tail.push(tl); side.push(key); lab.push(hit(key, ui / 23, v, inn, tl) ? INK : SKIN);
  }
  return { lab, meta: { inside, tail, side } };
}
const bareGrid = browGrid(() => false);
test('B1 눈썹 잘 됨: 안쪽 전부 채움 → 코드 없음, 점수 ≥95', () => {
  const per = compareRegion(bareGrid, browGrid((k, u, v, inn) => inn), ID, PARAMS.dEThresh.brow); const r = browResult(per);
  assert.deepEqual(r.codes, []); assert.ok(r.score >= 95);
});
test('B2 오른쪽 꼬리 비움 → BROW_TAIL_SHORT_R', () => {
  const r = browResult(compareRegion(bareGrid, browGrid((k, u, v, inn, tl) => inn && !(k === 'R' && tl)), ID, PARAMS.dEThresh.brow));
  assert.ok(r.codes.includes('BROW_TAIL_SHORT_R') && !r.codes.includes('BROW_TAIL_SHORT_L'));
});
test('B3 테두리 밖 번짐 → BROW_OUT_R/L, 점수 하락', () => {
  const r = browResult(compareRegion(bareGrid, browGrid(() => true), ID, PARAMS.dEThresh.brow));
  assert.ok(r.codes.includes('BROW_OUT_R') && r.codes.includes('BROW_OUT_L')); assert.ok(r.score <= 75);
});

// ---------- 입술 ----------
function lipStrip(hit) {
  const lab = [], half = [], side = [];
  for (let i = 0; i < 60; i++) { const h = i < 30 ? 'upper' : 'lower', s = i % 2 ? 'R' : 'L'; half.push(h); side.push(s); lab.push(OFFS.map((o) => (hit(h, o, i) ? INK : SKIN))); }
  return { lab, meta: { offsMm: OFFS, half, side } };
}
const bareLip = lipStrip(() => false);
test('P1 입술 잘 됨(경계 +0.5mm까지) → 코드 없음', () => { const r = compareLip(bareLip, lipStrip((h, o) => o <= 0.5), ID); assert.deepEqual(r.codes, []); assert.ok(r.score >= 95); });
test('P2 아래 경계 밖 2mm → LIP_OUT_LOWER 만', () => { const r = compareLip(bareLip, lipStrip((h, o) => o <= (h === 'lower' ? 2.5 : 0.5)), ID); assert.deepEqual(r.codes, ['LIP_OUT_LOWER']); });
test('P3 안쪽 덜 채움 → LIP_UNDER, 화장 없음 → 확인만', () => {
  assert.ok(compareLip(bareLip, lipStrip((h, o) => o >= -0.25 && o <= 0.5), ID).codes.includes('LIP_UNDER'));
  const r = compareLip(bareLip, lipStrip(() => false), ID); assert.equal(r.present, false); assert.equal(decide('lip', r).status, 'check_only');
});

// ---------- 강도 ----------
test('I1 지수: 부위 ΔE 12.5, 참조 0 → 50. 참조도 같이 변하면 0', () => {
  assert.equal(intensityIndex(SKIN, [SKIN[0] - 12.5, SKIN[1], SKIN[2]], SKIN, SKIN, ID).index, 50);
  assert.equal(intensityIndex(SKIN, INK, SKIN, INK, ID).index, 0);
});
test('I2 톤 차이 ΔL/4, 밴드 판정, 점수: 밴드 안 100 / 초과·좌우차 감점 / 밴드 없음 null', () => {
  assert.equal(toneDelta([50, 0, 0], [42, 0, 0], [60, 0, 0], [60, 0, 0], ID), -2);
  assert.equal(toneVerdict(70, [25, 60]), 'TONE_OVER'); assert.equal(toneVerdict(10, [25, 60]), 'TONE_UNDER'); assert.equal(toneVerdict(40, [25, 60]), 'TONE_OK'); assert.equal(toneVerdict(40, null), null);
  assert.equal(scoreIntensity(40, 40, [25, 60]), 100); assert.ok(scoreIntensity(80, 80, [25, 60]) < 80); assert.ok(scoreIntensity(30, 60, [25, 60]) < 100); assert.equal(scoreIntensity(40, 40, null), null);
});
test('I3 볼터치: 오른쪽 진함 → CHEEK_LR_DIFF_R, 너무 진함 → TONE_OVER, 없음 → 확인만', () => {
  const mk = (l, r) => ({ L: { index: l }, R: { index: r }, present: true });
  assert.ok(intensityResult('cheek', mk(30, 55)).codes.includes('CHEEK_LR_DIFF_R'));
  assert.ok(intensityResult('cheek', mk(80, 80)).codes.includes('TONE_OVER'));
  assert.deepEqual(intensityResult('cheek', mk(40, 42)).codes, []);
  const none = intensityResult('cheek', { L: { index: 2 }, R: { index: 1 }, present: false }); assert.equal(decide('cheek', none).status, 'check_only');
});
test('I4 섀도우 방향 불일치 → SHADOW_DIR', () => { assert.ok(intensityResult('shadow', { L: { index: 40 }, R: { index: 40 }, present: true, directionOk: false }).codes.includes('SHADOW_DIR')); });
test('I5 쉐딩·하이라이트: 항상 확인만, 점수 null, 좌우 10 이상이면 방향 코드', () => {
  const r = intensityResult('contour', { L: { index: 30 }, R: { index: 45 }, present: true });
  assert.equal(r.score, null); assert.deepEqual(r.codes, ['CONTOUR_LR_R']); assert.equal(decide('contour', r).status, 'check_only');
  assert.equal(oneLiner('contour', decide('contour', r), r.codes), '확인하고 넘어가세요. 오른쪽이 조금 진해요');
  assert.equal(oneLiner('contour', decide('contour', r), []), '확인하고 넘어가세요.');
});
test('I6 밴드 없는 룩 → 점수 null → 확인만(기준 없음 이유)', () => {
  const r = intensityResult('cheek', { L: { index: 40 }, R: { index: 40 }, present: true, band: null });
  assert.equal(r.score, null); assert.equal(decide('cheek', r).reason, CHECK_REASON.noband);
});

// ---------- 상태·문구 ----------
test('D1 조명 급변(±12 초과) → 확인만(조명 이유), 얼굴 없음 → 확인만', () => {
  const ok = { present: true, score: 80, codes: [] };
  assert.equal(decide('liner', ok, { lightShift: 15 }).reason, CHECK_REASON.lighting);
  assert.equal(decide('liner', ok, { lightShift: 5 }).status, 'scored');
  assert.equal(decide('liner', ok, { noFace: true }).reason, CHECK_REASON.noface);
});
test('D2 한 줄 평: 모든 문구에 숫자 없음, 코드 최대 2문장, 없으면 "잘 됐어요"', () => {
  for (const t of Object.values(DIAG_TEXT)) assert.ok(!hasDigit(t), t);
  for (const t of Object.values(CHECK_REASON)) assert.ok(!hasDigit(t), t);
  const d = { status: 'scored' };
  assert.equal(oneLiner('liner', d, []), '잘 됐어요');
  assert.equal(oneLiner('liner', d, ['LINER_WING_HIGH_R']), DIAG_TEXT.LINER_WING_HIGH_R);
  assert.equal(oneLiner('liner', d, ['LINER_WING_HIGH_R', 'LINER_THICK', 'LINER_LR_DIFF']).split('. ').length <= 4, true);
  assert.equal(oneLiner('lip', { status: 'check_only', reason: CHECK_REASON.absent }, []), CHECK_REASON.absent);
});
test('S1 다음: 점수 낮아도 passed, 확인만은 check_only, 건너뛰기는 skipped, 다음 부위 순서', () => {
  let s = createSession();
  s = applyNext(s, 'brow', { status: 'scored', score: 31, codes: ['BROW_SPARSE'], oneLiner: 'x' }); assert.equal(s.parts[0].status, 'passed'); assert.equal(s.parts[0].score, 31);
  assert.equal(nextPartId(s, 'brow'), 'liner');
  s = applyNext(s, 'liner', { status: 'check_only', score: null, codes: [], reason: CHECK_REASON.absent }); assert.equal(s.parts[1].status, 'check_only');
  s = applySkip(s, 'shadow'); assert.equal(s.parts[2].status, 'skipped'); assert.equal(nextPartId(s, 'shadow'), 'lip');
  s = applyNext(s, 'lip', { status: 'scored', score: 70, codes: [] }); s = applyNext(s, 'cheek', { status: 'scored', score: 70, codes: [] }); s = applyNext(s, 'contour', { status: 'check_only', score: null, codes: [] });
  assert.equal(nextPartId(s, 'contour'), null); assert.equal(s.parts.every((p) => ['passed', 'check_only', 'skipped'].includes(p.status)), true);
});
test('S2 재확인: attempts 증가, 최신 결과로 덮어쓰기', () => {
  let s = applyNext(createSession(), 'brow', { status: 'scored', score: 50, codes: [] }); s = applyNext(s, 'brow', { status: 'scored', score: 90, codes: [] });
  assert.equal(s.parts[0].attempts, 2); assert.equal(s.parts[0].score, 90);
});

// ---------- 정렬 ----------
test('A1 유사변환 복원: 크기 1.2·회전 10°·이동 (30,-20) → 잔차 0', () => {
  const src = Array.from({ length: 20 }, (_, i) => ({ x: 100 + 37 * Math.cos(i), y: 80 + 29 * Math.sin(i * 1.3) }));
  const t = 10 * Math.PI / 180, dst = src.map((p) => ({ x: 1.2 * (p.x * Math.cos(t) - p.y * Math.sin(t)) + 30, y: 1.2 * (p.x * Math.sin(t) + p.y * Math.cos(t)) - 20 }));
  const f = similarityFit(src, dst); assert.ok(Math.abs(f.s - 1.2) < 1e-6 && Math.abs(f.deg - 10) < 1e-6 && f.residual < 1e-6, JSON.stringify([f.s, f.deg, f.residual]));
});
test('A2 기준 정렬: 화장으로 입술 랜드마크가 5px 밀려도 정렬값은 기준 기하를 유지 → 편향 5px 로 측정', () => {
  const base = Array.from({ length: 478 }, (_, i) => ({ x: 200 + (i % 30) * 7, y: 150 + Math.floor(i / 30) * 9, z: 0 }));
  const cur = base.map((p, i) => ({ ...p, x: p.x + 12, y: p.y + 3 }));       // 얼굴 전체 이동 (안정 점 포함)
  const lips = [61, 291, 0, 17]; for (const i of lips) cur[i] = { ...cur[i], y: cur[i].y + 5 };   // 화장 편향
  const { lm, fit } = alignToBaseline(base, cur);
  assert.ok(fit.residual < 1e-6); assert.ok(Math.abs(lm[61].y - (base[61].y + 3)) < 1e-6);
  assert.ok(Math.abs(makeupBiasPx(lm, cur, lips) - 5) < 1e-6); assert.equal(STABLE_IDS.includes(61), false);
});

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : '\n      ' + r.e}`);
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
