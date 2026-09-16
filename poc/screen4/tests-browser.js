// 브라우저 러너 — tests.mjs에서 자동 생성 (build-browser-tests.py). 직접 고치지 말 것.
const assert = {
  equal: (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); },
  ok: (v, m) => { if (!v) throw new Error(m || 'assert.ok failed'); },
  deepEqual: (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m || 'deepEqual failed'); },
};
import {
  PART_IDS, PART_ORIENT, chipText, orientationHint, evaluateGate, GATE_LIMITS, StabilityCounter, PresenceTracker, Smoother,
  cropSpec, partVisible, rectsOverlap, anglesFromLandmarks, createSession, setCurrent, markCaptured, nextPart, laplacianVar, rgbToL, LM,
} from './core.js';
import { buildGuide, pxPerMm, eyeClosed } from './guides.js';

export function run() {
const results = [];
const test = (n, f) => { try { f(); results.push({ n, ok: true }); } catch (e) { results.push({ n, ok: false, e: e.message }); } };

// 합성 얼굴 랜드마크 (478점, 정면, 폭 300px 기준)
function synthFace(w = 640, h = 480, opts = {}) {
  const pts = Array.from({ length: 478 }, () => ({ x: w / 2, y: h / 2, z: 0 }));
  const cx = w / 2, cy = h / 2, fw = 300;
  const set = (i, x, y) => { pts[i] = { x: cx + x, y: cy + y, z: 0 }; };
  set(LM.faceL, -fw / 2, 0); set(LM.faceR, fw / 2, 0); set(LM.forehead, 0, -200); set(LM.chin, 0, 190); set(LM.noseTip, opts.noseDx ?? 0, opts.noseDy ?? 15); set(LM.glabella, 0, -60);
  const eye = (ids, ex, closed) => {
    const { outer, inner, upper, lower, iris } = ids; const sgn = ex < 0 ? -1 : 1;
    const ox = ex + sgn * 40, ix = ex - sgn * 40;
    set(outer, ox, -50); set(inner, ix, -50);
    upper.forEach((id, i) => set(id, ox + (ix - ox) * i / (upper.length - 1), -50 - (closed ? 1 : 12) * Math.sin(Math.PI * i / (upper.length - 1))));
    lower.forEach((id, i) => set(id, ox + (ix - ox) * i / (lower.length - 1), -50 + (closed ? 1 : 10) * Math.sin(Math.PI * i / (lower.length - 1))));
    set(iris[0], ex, -50); set(iris[1], ex + 16, -50); set(iris[3], ex - 16, -50); set(iris[2], ex, -66); set(iris[4], ex, -34);
  };
  eye(LM.eyeA, -60, opts.closedA); eye(LM.eyeB, 60, opts.closedB);
  const brow = (ids, ex) => { const sgn = ex < 0 ? -1 : 1; ids.upper.forEach((id, i) => set(id, ex + sgn * (50 - i * 25), -95 - 8 * Math.sin(Math.PI * i / 4))); ids.lower.forEach((id, i) => set(id, ex + sgn * (50 - i * 25), -85 - 8 * Math.sin(Math.PI * i / 4))); };
  brow(LM.browA, -60); brow(LM.browB, 60);
  LM.lipsOuter.forEach((id, i) => { const a = i / LM.lipsOuter.length * 2 * Math.PI; set(id, 45 * Math.cos(a), 110 + 18 * Math.sin(a)); });
  set(LM.cheekA, -80, 30); set(LM.cheekB, 80, 30);
  LM.jaw.forEach((id, i) => { const a = Math.PI * i / (LM.jaw.length - 1); set(id, -fw / 2 * Math.cos(a), 40 + 150 * Math.sin(a)); });
  LM.noseBridge.forEach((id, i) => set(id, 0, -40 + i * 15));
  return pts;
}

// ---------- 진행 칩·방향 ----------
test('C1 진행 칩 문구: 부위 · 상태 (+점수)', () => {
  assert.equal(chipText({ partId: 'liner', status: 'in_progress' }), '아이라이너 · 진행 중');
  assert.equal(chipText({ partId: 'brow', status: 'passed', score: 88 }), '눈썹 · 완료 88');
  assert.equal(chipText({ partId: 'contour', status: 'check_only' }), '쉐딩·하이라이트 · 확인만');
});
test('C2 방향 안내: 눈 단계는 가로, 세로 부위는 세로, 맞으면 없음', () => {
  assert.equal(orientationHint('liner', 'portrait'), '폰을 가로로 돌리세요');
  assert.equal(orientationHint('lip', 'landscape'), '폰을 세로로 돌리세요');
  assert.equal(orientationHint('liner', 'landscape'), null); assert.equal(orientationHint('cheek', 'portrait'), null);
  assert.deepEqual(PART_IDS.filter((p) => PART_ORIENT[p] === 'landscape'), ['brow', 'liner', 'shadow']);
});
test('C3 진행 칩 이동: 현재 부위만 진행 중, 완료는 유지', () => {
  let s = createSession(); s = markCaptured(s, 'brow', 'x'); s = setCurrent(s, 'lip');
  assert.equal(s.currentPart, 'lip'); assert.equal(s.parts.find((p) => p.partId === 'lip').status, 'in_progress');
  assert.equal(s.parts.find((p) => p.partId === 'brow').status, 'passed');
  s = setCurrent(s, 'brow'); assert.equal(s.parts.find((p) => p.partId === 'lip').status, 'not_started');
});

// ---------- 게이트 ----------
const OK = { faceDetected: true, yaw: 3, pitch: -2, visible: true, handOverlap: false, sharpness: 80, foreheadL: 70, baselineL: 68, stableCount: 5, partId: 'liner' };
test('G1 전부 충족 → 확인받을 준비 됨', () => { const r = evaluateGate(OK); assert.equal(r.ok, true); assert.equal(r.text, '확인받을 준비 됨'); });
test('G2 얼굴 없음 → 문구 없음(테두리만 사라짐)', () => { const r = evaluateGate({ ...OK, faceDetected: false }); assert.equal(r.ok, false); assert.equal(r.text, ''); });
test('G3 순서: 정면 → 눈 → 손 → 선명 → 밝기 → 안정, 가장 먼저 걸린 것 하나만', () => {
  assert.equal(evaluateGate({ ...OK, yaw: 20, visible: false, handOverlap: true, sharpness: 1 }).firstFail, 'frontal');
  assert.equal(evaluateGate({ ...OK, visible: false, handOverlap: true, sharpness: 1 }).firstFail, 'visible');
  assert.equal(evaluateGate({ ...OK, handOverlap: true, sharpness: 1, foreheadL: 20 }).firstFail, 'hand');
  assert.equal(evaluateGate({ ...OK, sharpness: 1, foreheadL: 20 }).firstFail, 'sharp');
  assert.equal(evaluateGate({ ...OK, foreheadL: 20, stableCount: 0 }).firstFail, 'bright');
  assert.equal(evaluateGate({ ...OK, stableCount: 2 }).firstFail, 'stable');
});
test('G4 문구: 눈 단계는 "양쪽 눈", 세로 부위는 "부위"; 밝기 방향; 숫자 없음', () => {
  assert.equal(evaluateGate({ ...OK, visible: false }).text, '양쪽 눈이 보이게 해 주세요');
  assert.equal(evaluateGate({ ...OK, visible: false, partId: 'lip' }).text, '부위가 다 보이게 해 주세요');
  assert.equal(evaluateGate({ ...OK, foreheadL: 40 }).text, '조금 더 밝은 곳으로');
  assert.equal(evaluateGate({ ...OK, foreheadL: 95 }).text, '너무 밝아요. 조금 어두운 곳으로');
  for (const k of ['frontal', 'visible', 'hand', 'sharp']) assert.ok(!/\d/.test(evaluateGate({ ...OK, yaw: 30 }).text));
});
test('G5 밝기 기준 없으면 밝기 조건 생략, pitch 한계 ±10', () => {
  assert.equal(evaluateGate({ ...OK, baselineL: null, foreheadL: 10 }).ok, true);
  assert.equal(evaluateGate({ ...OK, pitch: 11 }).firstFail, 'frontal'); assert.equal(evaluateGate({ ...OK, pitch: -9 }).ok, true);
});
test('G6 안정 카운터: 연속 5프레임, 중간에 깨지면 0부터', () => {
  const c = new StabilityCounter(); [1, 1, 1, 0, 1, 1, 1, 1, 1].forEach((v) => c.push(!!v));
  assert.equal(c.count, 5); c.push(false); assert.equal(c.count, 0);
});
test('G7 자리 비움: 3초 미검출 → away, 재검출 → present (UI 없음)', () => {
  const p = new PresenceTracker(3000); p.update(true, 0); assert.equal(p.update(false, 2900), 'present');
  assert.equal(p.update(false, 3000), 'away'); assert.equal(p.update(true, 3100), 'present');
});

// ---------- 크롭·가이드 ----------
test('K1 눈 단계 크롭: 양쪽 눈 끝에서 끝 + 여백 15%, 가로 비율', () => {
  const pts = synthFace(); const c = cropSpec('liner', pts, 844 / 390);
  const eyeSpan = pts[LM.eyeB.outer].x - pts[LM.eyeA.outer].x;
  assert.ok(Math.abs(c.w - eyeSpan * 1.3) < 1e-6); assert.ok(Math.abs(c.w / c.h - 844 / 390) < 1e-6);
  assert.ok(c.x < pts[LM.eyeA.outer].x && c.x + c.w > pts[LM.eyeB.outer].x);
});
test('K2 입술 크롭: 부위 2.5~3배, 세로 비율, 입술 포함', () => {
  const pts = synthFace(); const c = cropSpec('lip', pts, 390 / 844);
  const xs = LM.lipsOuter.map((i) => pts[i].x), ys = LM.lipsOuter.map((i) => pts[i].y);
  assert.ok(c.x <= Math.min(...xs) && c.x + c.w >= Math.max(...xs) && c.y <= Math.min(...ys) && c.y + c.h >= Math.max(...ys));
  assert.ok(c.w >= (Math.max(...xs) - Math.min(...xs)) * 2.5);
});
test('K3 볼·쉐딩 크롭은 얼굴 폭보다 넓고 세로 비율', () => {
  const pts = synthFace(); const fw = pts[LM.faceR].x - pts[LM.faceL].x;
  for (const id of ['cheek', 'contour']) { const c = cropSpec(id, pts, 390 / 844); assert.ok(c.w >= fw * 1.15); assert.ok(Math.abs(c.w / c.h - 390 / 844) < 1e-6); }
});
test('K4 가시성: 얼굴이 프레임 밖으로 나가면 false', () => {
  const pts = synthFace(); assert.equal(partVisible('liner', pts, 640, 480), true);
  const shifted = pts.map((p) => ({ ...p, x: p.x + 300 })); assert.equal(partVisible('liner', shifted, 640, 480), false);
});
test('K5 손 겹침: 사각형 교차 판정', () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }), false);
});
test('K6 랜드마크 각도 근사: 정면 0 근처, 코끝이 옆으로 가면 yaw 커짐', () => {
  assert.ok(Math.abs(anglesFromLandmarks(synthFace()).yaw) < 1);
  assert.ok(Math.abs(anglesFromLandmarks(synthFace(640, 480, { noseDx: 60 })).yaw) > 15);
});
test('K7 떨림 제거: EMA가 급변을 줄이고 reset 후 즉시 따라감', () => {
  const s = new Smoother(0.5); s.smooth([{ x: 0, y: 0 }]); const p = s.smooth([{ x: 10, y: 0 }]); assert.equal(p[0].x, 5);
  s.reset(); assert.equal(s.smooth([{ x: 10, y: 0 }])[0].x, 10);
});
test('K8 px/mm: 홍채 지름 32px → 2.74 px/mm', () => { assert.ok(Math.abs(pxPerMm(synthFace()) - 32 / 11.7) < 1e-6); });
test('K9 눈 감김 판정(EAR)', () => { const o = synthFace(), c = synthFace(640, 480, { closedA: true }); assert.equal(eyeClosed(o, 'A'), false); assert.equal(eyeClosed(c, 'A'), true); });
test('K10 가이드: 6부위 모두 생성, 면 채우기 없음(outline-only), 숫자 라벨 없음', () => {
  const pts = synthFace();
  for (const id of PART_IDS) {
    const g = buildGuide(id, pts);
    assert.ok(g.polylines.length + g.regions.length > 0, id);
    g.regions.forEach((r) => assert.equal(r.style, 'outline-only'));
    g.labels.forEach((l) => assert.ok(!/\d/.test(l.text)));
    if (id !== 'contour') assert.equal(g.labels.length, 0);
  }
});
test('K11 아이라이너 꼬리: 눈 바깥쪽·위쪽으로 4mm', () => {
  const pts = synthFace(); const g = buildGuide('liner', pts); const wing = g.polylines.filter((p) => p.style === 'solid');
  assert.equal(wing.length, 2);
  const [a, b] = wing[0].pts; const l = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(Math.abs(l - 4 * pxPerMm(pts)) < 1e-6); assert.ok(b.y < a.y); assert.ok(b.x < a.x);   // A눈은 이미지 왼쪽 → 왼쪽 위
});

// ---------- 세션 ----------
test('S1 세션 초기: 눈썹 진행 중, 나머지 미시작', () => { const s = createSession(); assert.equal(s.parts[0].status, 'in_progress'); assert.equal(s.parts.slice(1).every((p) => p.status === 'not_started'), true); });
test('S2 확인받기 → 즉시 촬영 → 완료, 쉐딩은 확인만, 다음 부위 계산', () => {
  let s = createSession(); s = markCaptured(s, 'brow', 'data:x'); assert.equal(s.parts[0].status, 'passed'); assert.equal(s.parts[0].captured, 'data:x');
  assert.equal(nextPart(s), 'liner');
  s = setCurrent(s, 'contour'); s = markCaptured(s, 'contour', 'y'); assert.equal(s.parts[5].status, 'check_only');
  s = markCaptured(setCurrent(s, 'liner'), 'liner', 'z'); s = markCaptured(setCurrent(s, 'shadow'), 'shadow', 'z'); s = markCaptured(setCurrent(s, 'lip'), 'lip', 'z'); s = markCaptured(setCurrent(s, 'cheek'), 'cheek', 'z');
  assert.equal(nextPart(s), null);
});
test('S3 세션 JSON 왕복', () => { const s = markCaptured(createSession(), 'brow', 'u'); assert.deepEqual(JSON.parse(JSON.stringify(s)).parts, s.parts); });

// ---------- 색·선명 ----------
test('M1 라플라시안 분산: 평면 0, 체크무늬 큼', () => {
  const flat = new Float32Array(100).fill(128); assert.equal(laplacianVar(flat, 10, 10), 0);
  const chk = Float32Array.from({ length: 100 }, (_, i) => ((i % 10) + Math.floor(i / 10)) % 2 ? 255 : 0); assert.ok(laplacianVar(chk, 10, 10) > 1000);
});
test('M2 L*: 검정 0, 흰색 100', () => { assert.ok(rgbToL(0, 0, 0) < 0.01); assert.ok(Math.abs(rgbToL(255, 255, 255) - 100) < 0.01); });

  const pass = results.filter((r) => r.ok).length;
  return results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : '\n      ' + r.e}`).join('\n') + `\n\n${pass}/${results.length} passed`;
}
