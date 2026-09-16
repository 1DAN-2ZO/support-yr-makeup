// 브라우저 러너 — tests.mjs에서 자동 생성 (build_browser_tests.py). 직접 고치지 말 것.
const assert = {
  equal: (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); },
  ok: (v, m) => { if (!v) throw new Error(m || 'assert.ok failed'); },
  deepEqual: (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m || `deepEqual: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); },
};
import { SCREENS, SHOTS, SERVER_SHOTS, shotGate, nextShot, createSession, setCurrentPart, applyResult, applySkip, nextPart, allDone, toReviewParts, stripImages, PART_ORDER } from './lib/flow.js';
import { LOOKS, lookById, estimateFaceShape, CONTOUR_RATIONALE, LOOK_PART_ORDER } from './lib/looks.js';
import { computeSummary, oneLiner as reviewLine } from './lib/review.js';
import { PARAMS as SCORE_PARAMS, DIAG_TEXT } from './lib/score.js';
import { GATE_TEXT } from './lib/gate.js';
import { LM } from './lib/landmarks.js';
import { contourOutline, cropSpec as s3Crop, IDX, faceWidthPx } from './lib/screen3-core.js';
import { unitScale, TEMPLATE } from './lib/guides.js';
import { PARAMS as SP2 } from './lib/score.js';
import { CONTOUR_RULES, FACE_SHAPES } from './lib/screen3-rules.js';
import { buildRegions, solveAffine, REGION_KEYS } from './lib/tryon.js';

export function run() {
const results = [];
const test = (n, f) => { try { f(); results.push({ n, ok: true }); } catch (e) { results.push({ n, ok: false, e: e.message }); } };
const OK = { faceDetected: true, yaw: 0, pitch: 0, closedA: false, closedB: false, faceRatio: 0.5, sharpness: 80, foreheadL: 70, baselineL: 70, stableCount: 5 };

test('F1 화면 순서 11개, 부위 순서 = 룩 5부위 + 쉐딩', () => { assert.equal(SCREENS.length, 11); assert.deepEqual(PART_ORDER, [...LOOK_PART_ORDER, 'contour']); });
test('S1 촬영 4장 정의, 서버 전송 3장(눈 감음 제외)', () => { assert.deepEqual(SHOTS.map((s) => s.id), ['front_open', 'front_closed', 'left_45', 'right_45']); assert.deepEqual(SERVER_SHOTS, ['front_open', 'left_45', 'right_45']); });
test('S2 정면 눈 뜸: 전부 맞으면 "찍을게요"', () => { assert.equal(shotGate('front_open', OK).ok, true); });
test('S3 촬영 조건 순서: 얼굴(문구 없음) → 각도 → 눈 → 크기 → 선명 → 밝기 → 안정, 하나만', () => {
  assert.equal(shotGate('front_open', { ...OK, faceDetected: false }).text, '');
  assert.equal(shotGate('front_open', { ...OK, yaw: 20, closedA: true, closedB: true, faceRatio: 0.1 }).text, '조금만 정면으로');
  assert.equal(shotGate('front_open', { ...OK, closedA: true, closedB: true, faceRatio: 0.1 }).text, '눈을 떠 주세요');
  assert.equal(shotGate('front_closed', { ...OK, faceRatio: 0.1 }).text, '눈을 감아 주세요');
  assert.equal(shotGate('front_open', { ...OK, faceRatio: 0.1, sharpness: 1 }).text, '조금 더 가까이');
  assert.equal(shotGate('front_open', { ...OK, faceRatio: 0.9 }).text, '조금 멀리');
  assert.equal(shotGate('front_open', { ...OK, sharpness: 1, foreheadL: 20 }).text, '흔들려요. 잠시 멈춰 주세요');
  assert.equal(shotGate('front_open', { ...OK, foreheadL: 40 }).text, '조금 더 밝은 곳으로');
  assert.equal(shotGate('front_open', { ...OK, stableCount: 1 }).text, '잠시만 그대로');
});
test('S4 45° 장: 덜 돌리면 "더", 너무 돌리면 "돌아오세요"', () => {
  assert.equal(shotGate('left_45', { ...OK, yaw: -5 }).text, '고개를 왼쪽으로 조금 더');
  assert.equal(shotGate('left_45', { ...OK, yaw: -70 }).text, '너무 돌렸어요. 조금만 돌아오세요');
  assert.equal(shotGate('left_45', { ...OK, yaw: -40 }).ok, true);
  assert.equal(shotGate('right_45', { ...OK, yaw: 5 }).text, '고개를 오른쪽으로 조금 더');
  assert.equal(shotGate('right_45', { ...OK, yaw: 40 }).ok, true);
});
test('S5 문구에 숫자 없음, 다음 장 계산·틀린 장만 다시', () => {
  for (const m of [{ ...OK, yaw: 30 }, { ...OK, closedA: true, closedB: true }, { ...OK, faceRatio: 0.1 }]) assert.ok(!/\d/.test(shotGate('front_open', m).text));
  const shots = { front_open: 1, front_closed: 1 }; assert.equal(nextShot(shots), 'left_45');
  delete shots.front_open; assert.equal(nextShot(shots), 'front_open');
  assert.equal(nextShot({ front_open: 1, front_closed: 1, left_45: 1, right_45: 1 }), null);
});

test('P1 세션: 부위 진행, 결과 반영(점수 낮아도 passed), 쉐딩은 확인만, 건너뛰기, 전부 끝', () => {
  let s = createSession(); assert.equal(s.screen, 'consent'); assert.equal(s.parts.length, 6);
  s = setCurrentPart(s, 'brow'); assert.equal(s.parts[0].status, 'in_progress');
  s = applyResult(s, 'brow', { decision: { status: 'scored' }, score: 31, codes: ['BROW_SPARSE'], oneLiner: 'x', metrics: {} }); assert.equal(s.parts[0].status, 'passed'); assert.equal(s.parts[0].score, 31); assert.equal(s.parts[0].attempts, 1);
  assert.equal(nextPart(s, 'brow'), 'liner');
  s = applyResult(setCurrentPart(s, 'liner'), 'liner', { decision: { status: 'check_only', reason: '색이 옅어서 재지 못했어요' }, score: null, codes: [], oneLiner: '색이 옅어서 재지 못했어요', metrics: {} }); assert.equal(s.parts[1].status, 'check_only'); assert.equal(s.parts[1].score, null);
  s = applySkip(s, 'shadow'); assert.equal(s.parts[2].status, 'skipped'); assert.equal(nextPart(s, 'shadow'), 'lip');
  s = applyResult(s, 'lip', { decision: { status: 'scored' }, score: 80, codes: [], oneLiner: '잘 됐어요', metrics: {} });
  s = applyResult(s, 'cheek', { decision: { status: 'scored' }, score: 70, codes: ['CHEEK_LR_DIFF_R'], oneLiner: '오른쪽이 조금 진해요', metrics: { lrIndex: { left: 30, right: 55 } } });
  assert.equal(allDone(s), false);
  s = applyResult(s, 'contour', { decision: { status: 'scored' }, score: 99, codes: ['CONTOUR_LR_R'], oneLiner: '확인하고 넘어가세요. 오른쪽이 조금 진해요', metrics: { lrIndex: { left: 20, right: 40 } } });
  assert.equal(s.parts[5].status, 'check_only'); assert.equal(s.parts[5].score, null); assert.equal(allDone(s), true); assert.equal(nextPart(s, 'contour'), null);
  // 화면 6 변환·합산
  const sum = computeSummary(toReviewParts(s)); assert.equal(sum.measuredCount, 3); assert.equal(sum.partCount, 5); assert.ok(sum.total > 0 && sum.total <= 100);
  assert.equal(reviewLine(toReviewParts(s)[5]), '확인하고 넘어가세요. 오른쪽이 조금 진해요');
  assert.equal(reviewLine(toReviewParts(s)[1]), '색이 옅어서 재지 못했어요');
});
test('P2 재확인: 덮어쓰기 + attempts 증가', () => {
  let s = applyResult(createSession(), 'brow', { decision: { status: 'scored' }, score: 50, codes: [], oneLiner: '', metrics: {} });
  s = applyResult(s, 'brow', { decision: { status: 'scored' }, score: 90, codes: [], oneLiner: '', metrics: {} }); assert.equal(s.parts[0].attempts, 2); assert.equal(s.parts[0].score, 90);
});
test('P3 draft 저장 형식: 이미지 제외, JSON 왕복', () => {
  let s = createSession(); s.shots.front_open = { canvas: {} }; s.baseline = { foreheadL: 66, unit: { eye: 130, lip: 220, face: 620 }, im: {} }; s.parts[0].captured = { canvas: {} };
  const d = JSON.parse(JSON.stringify(stripImages(s))); assert.equal(d.shots.front_open, true); assert.equal(d.baseline.foreheadL, 66); assert.equal(d.baseline.unit.eye, 130); assert.equal(d.baseline.im, undefined); assert.equal(d.parts[0].captured, true);
});

test('L1 룩 10개, 각 룩은 5부위 파라미터·제품 5줄·근거 5줄(숫자 없음), 쉐딩 없음', () => {
  assert.equal(LOOKS.length, 10);
  for (const l of LOOKS) {
    assert.deepEqual(Object.keys(l.parts).sort(), [...LOOK_PART_ORDER].sort(), l.id); assert.equal(l.products.length, 5); assert.equal(Object.keys(l.rationale).length, 5);
    for (const t of Object.values(l.rationale)) assert.ok(!/\d/.test(t), t);
    assert.equal(l.parts.contour, undefined);
  }
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, 10); assert.equal(lookById('nope').id, LOOKS[0].id);
});
test('L2 얼굴형 근사 5종 + 멘트', () => {
  const mk = (w, h, jaw, fore) => { const lm = Array.from({ length: 478 }, () => ({ x: 0, y: 0 })); lm[234] = { x: 0, y: 0 }; lm[454] = { x: w, y: 0 }; lm[10] = { x: 0, y: 0 }; lm[152] = { x: 0, y: h }; lm[172] = { x: 0, y: 0 }; lm[397] = { x: jaw, y: 0 }; lm[103] = { x: 0, y: 0 }; lm[332] = { x: fore, y: 0 }; return lm; };
  assert.equal(estimateFaceShape(mk(100, 125, 60, 80)).label, 'round');
  assert.equal(estimateFaceShape(mk(100, 140, 60, 80)).label, 'oval');
  assert.equal(estimateFaceShape(mk(100, 140, 82, 80)).label, 'square');
  assert.equal(estimateFaceShape(mk(100, 160, 60, 80)).label, 'oblong');
  assert.equal(estimateFaceShape(mk(100, 140, 55, 98)).label, 'heart');
  for (const k of Object.keys(CONTOUR_RATIONALE)) assert.ok(!/\d/.test(CONTOUR_RATIONALE[k]));
});
test('X1 모듈 간 부위 이름·문구 일관: 화면 4 게이트 문구와 화면 5 코드 문구에 숫자 없음', () => {
  for (const t of Object.values(GATE_TEXT)) assert.ok(!/\d/.test(t)); for (const t of Object.values(DIAG_TEXT)) assert.ok(!/\d/.test(t));
  assert.equal(SCORE_PARAMS.dEMaxSession, 25); assert.ok(LM.lipsOuter.length === 20);
});

// ---------- 통합: 화면 3 POC(soyoon)·화면 2 POC(firefox1234123) 모듈 ----------
function s3Face() {   // poc/screen3 tests-cases.js fakeFace() 축약 (같은 배치)
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 })); const put = (i, x, y) => { lm[i] = { x, y, z: 0 }; };
  const spread = (idxs, x0, x1, y0, y1) => idxs.forEach((i, k) => { const t = idxs.length > 1 ? k / (idxs.length - 1) : 0; put(i, x0 + (x1 - x0) * t, (k % 2) ? y1 : y0); });
  const line = (idxs, x0, x1, y0, y1) => idxs.forEach((i, k) => { const t = idxs.length > 1 ? k / (idxs.length - 1) : 0; put(i, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); });
  spread(IDX.eyeRing.r, 0.22, 0.44, 0.42, 0.46); spread(IDX.eyeRing.l, 0.56, 0.78, 0.42, 0.46); put(IDX.eyeOuter.r, 0.22, 0.44); put(IDX.eyeOuter.l, 0.78, 0.44);
  spread(IDX.brow.r, 0.23, 0.45, 0.36, 0.40); spread(IDX.brow.l, 0.55, 0.77, 0.36, 0.40); spread(IDX.lipOuter, 0.40, 0.60, 0.70, 0.76);
  spread(IDX.cheek.r, 0.22, 0.40, 0.52, 0.62); spread(IDX.cheek.l, 0.60, 0.78, 0.62, 0.52); spread(IDX.jawline, 0.25, 0.75, 0.78, 0.88);
  put(IDX.faceEdge.r, 0.18, 0.55); put(IDX.faceEdge.l, 0.82, 0.55); put(IDX.foreheadTop, 0.50, 0.22); put(IDX.foreheadSide.r, 0.24, 0.28); put(IDX.foreheadSide.l, 0.76, 0.28); put(IDX.chinTip, 0.50, 0.90);
  line(IDX.noseBridge, 0.50, 0.50, 0.40, 0.62); spread(IDX.underEye.r, 0.24, 0.42, 0.48, 0.50); spread(IDX.underEye.l, 0.58, 0.76, 0.48, 0.50);
  put(IDX.iris.r[0], 0.30, 0.41); put(IDX.iris.r[1], 0.33, 0.44); put(IDX.iris.r[2], 0.36, 0.47); put(IDX.iris.r[3], 0.33, 0.44);
  put(IDX.iris.l[0], 0.64, 0.41); put(IDX.iris.l[1], 0.67, 0.44); put(IDX.iris.l[2], 0.70, 0.47); put(IDX.iris.l[3], 0.67, 0.44);
  return lm;
}
test('I1 화면 3 모듈: 얼굴형 5종 규칙이 서로 다른 쉐딩·하이라이트 폴리곤을 내고, 멘트에 숫자 없음', () => {
  const lm = s3Face(), size = { w: 1080, h: 1440 }; const outs = FACE_SHAPES.map((f) => contourOutline(lm, size, f));
  for (const o of outs) { assert.ok(o.shading.length > 0 && o.highlight.length > 0); assert.equal(o.labels.length, 2); assert.equal(o.source, 'landmark_only'); }
  assert.equal(new Set(outs.map((o) => JSON.stringify(o.shading))).size, 5);
  for (const f of FACE_SHAPES) assert.ok(!/\d/.test(CONTOUR_RULES[f].rationale));
});
test('I2 화면 3 모듈: cropSpec 이 잘림을 covered/clamped 로 드러내고 종횡비를 지킨다', () => {
  const c = s3Crop(s3Face(), { w: 1080, h: 1440 }, 'contour'); assert.ok(typeof c.covered === 'boolean' && typeof c.clamped === 'boolean');
  const l = s3Crop(s3Face(), { w: 1080, h: 1440 }, 'liner'); assert.ok(Math.abs(l.w / l.h - 19.5 / 9) < 0.01); assert.equal(l.orientation, 'landscape');
});
test('I3 화면 2 모듈: 부위 폴리곤 7개, 아핀 해가 3점을 정확히 맞춘다', () => {
  const lm = s3Face(); const r = buildRegions(lm, 640, 480); assert.deepEqual(Object.keys(r).sort(), [...REGION_KEYS].sort()); for (const k of REGION_KEYS) assert.ok(r[k].length >= 3);
  const src = [[0, 0], [10, 0], [0, 10]], dst = [[5, 5], [25, 6], [4, 26]], m = solveAffine(src, dst);
  const ap = ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  src.forEach((p, i) => { const q = ap(p); assert.ok(Math.abs(q[0] - dst[i][0]) < 1e-9 && Math.abs(q[1] - dst[i][1]) < 1e-9); });
});

test('U1 단위: 템플릿·임계에 mm 없음, 기준 길이는 눈 폭·입술 폭·얼굴 폭', () => {
  assert.equal(JSON.stringify(TEMPLATE).includes('Mm'), false); assert.equal(JSON.stringify(SP2.guide).includes('Mm'), false);
  assert.ok(TEMPLATE.liner.wing > 0 && TEMPLATE.liner.wing < 1 && SP2.tol.wingDev < 0.1);
  const lm = s3Face().map((p) => ({ x: p.x * 1080, y: p.y * 1440 })); const u = unitScale(lm);
  assert.ok(u.eye > 0 && u.lip > 0 && u.face > 0); assert.ok(Math.abs(faceWidthPx(s3Face(), { w: 1080, h: 1440 }) - u.face) < 1e-6);
  const big = s3Face().map((p) => ({ x: p.x * 2160, y: p.y * 2880 })); const u2 = unitScale(big); assert.ok(Math.abs(u2.eye / u.eye - 2) < 1e-9);   // 해상도 2배 → 기준 길이 2배 (비율 불변)
});

  const pass = results.filter((r) => r.ok).length;
  return results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : '\n      ' + r.e}`).join('\n') + `\n\n${pass}/${results.length} passed`;
}
