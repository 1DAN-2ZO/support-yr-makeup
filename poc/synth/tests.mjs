// 합성 생성기 자동 검증 (Node 전용). 실행: node tests.mjs
// core.js는 순수 함수라 MediaPipe·브라우저 없이 검증할 수 있다.

import {
  IDX, PART_IDS, PART_LABEL, mulberry32, randomParams,
  linerPolygon, shadowPolygon, browPolygon, lipPolygon, cheekPolygon,
  buildSample, sampleStats, polygonArea, bbox, centroid, faceWidth,
} from './core.js';

import { makeFixture } from './fixture.mjs';

const LM = makeFixture();

// ---------------- 테스트 러너 ----------------

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('PASS ', name); pass++; }
  catch (e) { console.log('FAIL ', name, '\n       ', e.message); fail++; }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || '조건 불충족'); }
function near(a, b, tol, msg) {
  const d = Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
  ok(d <= tol, `${msg || ''} (${a} vs ${b}, 상대차 ${(d * 100).toFixed(2)}% > ${tol * 100}%)`);
}
const finite = (poly) => poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

// ---------------- A. 폴리곤 기본 ----------------

t('A1 가짜 얼굴 척도가 잡힌다', () => {
  ok(faceWidth(LM) > 90 && faceWidth(LM) < 160, `faceWidth=${faceWidth(LM)}`);
});

t('A2 부위 5개 모두 면적 > 0', () => {
  const p = randomParams(1);
  p.shadow.present = true; p.cheek.present = true;
  const s = buildSample(LM, p);
  const stats = sampleStats(s);
  for (const id of PART_IDS) ok(stats[id] > 0, `${id} 면적 ${stats[id]}`);
});

t('A3 모든 폴리곤 좌표가 유한수 (NaN 없음)', () => {
  const p = randomParams(7);
  p.shadow.present = true; p.cheek.present = true;
  for (const part of buildSample(LM, p).parts) {
    for (const poly of part.polys) ok(finite(poly), `${part.id}에 NaN/Infinity`);
  }
});

t('A4 모든 폴리곤이 점 3개 이상', () => {
  const p = randomParams(11);
  p.shadow.present = true; p.cheek.present = true;
  for (const part of buildSample(LM, p).parts) {
    for (const poly of part.polys) ok(poly.length >= 3, `${part.id} 점 ${poly.length}개`);
  }
});

t('A5 마스크 라벨이 부위마다 고유하고 0이 아니다', () => {
  const vals = Object.values(PART_LABEL);
  ok(new Set(vals).size === vals.length, '라벨 중복');
  ok(vals.every((v) => v > 0), '배경(0)과 겹침');
  ok(vals.length === PART_IDS.length, '부위 수와 라벨 수 불일치');
});

// ---------------- B. 시드 재현성 ----------------

t('B1 같은 시드 → 같은 파라미터', () => {
  ok(JSON.stringify(randomParams(42)) === JSON.stringify(randomParams(42)), '재현 실패');
});

t('B2 다른 시드 → 다른 파라미터', () => {
  ok(JSON.stringify(randomParams(42)) !== JSON.stringify(randomParams(43)), '시드가 안 먹음');
});

t('B3 같은 시드 → 같은 폴리곤', () => {
  const a = buildSample(LM, randomParams(99));
  const b = buildSample(LM, randomParams(99));
  ok(JSON.stringify(sampleStats(a)) === JSON.stringify(sampleStats(b)), '면적 불일치');
});

t('B4 난수가 0~1 범위', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 500; i++) {
    const v = rng();
    ok(v >= 0 && v < 1, `난수 ${v}`);
  }
});

// ---------------- C. 파라미터 범위 ----------------

t('C1 100개 시드 모두 파라미터가 정의 범위 안', () => {
  for (let s = 0; s < 100; s++) {
    const p = randomParams(s);
    ok(p.liner.thickness >= 0.05 && p.liner.thickness <= 0.13, `thickness ${p.liner.thickness}`);
    ok(p.liner.wingLen >= 0 && p.liner.wingLen <= 0.30, `wingLen ${p.liner.wingLen}`);
    ok(p.brow.fill >= 1.0 && p.brow.fill <= 1.18, `fill ${p.brow.fill}`);
    ok(p.lip.overline >= -0.04 && p.lip.overline <= 0.10, `overline ${p.lip.overline}`);
    ok(Math.abs(p.asym) <= 0.18, `asym ${p.asym}`);
    for (const id of PART_IDS) ok(p[id].alpha > 0 && p[id].alpha <= 1, `${id} alpha ${p[id].alpha}`);
  }
});

t('C2 100개 시드 모두 부위 면적이 양수', () => {
  for (let s = 0; s < 100; s++) {
    const p = randomParams(s);
    p.shadow.present = true; p.cheek.present = true;
    const stats = sampleStats(buildSample(LM, p));
    for (const id of PART_IDS) ok(stats[id] > 0, `시드 ${s} ${id} 면적 ${stats[id]}`);
  }
});

// ---------------- D. 파라미터 → 모양 (단조성) ----------------

const base = () => {
  const p = randomParams(3);
  p.asym = 0;
  return p;
};

t('D1 라이너 두께를 키우면 면적이 는다', () => {
  const p = base();
  p.liner.wingLen = 0;
  const thin = polygonArea(linerPolygon(LM, 'L', { ...p.liner, thickness: 0.04 }));
  const thick = polygonArea(linerPolygon(LM, 'L', { ...p.liner, thickness: 0.10 }));
  ok(thick > thin * 1.5, `${thin} → ${thick}`);
});

t('D2 꼬리를 길게 하면 가로 폭이 는다', () => {
  const p = base();
  const noWing = bbox(linerPolygon(LM, 'L', { ...p.liner, wingLen: 0 })).w;
  const wing = bbox(linerPolygon(LM, 'L', { ...p.liner, wingLen: 0.3 })).w;
  ok(wing > noWing, `${noWing} → ${wing}`);
});

t('D3 입술 오버립을 키우면 면적이 는다', () => {
  const inLip = polygonArea(lipPolygon(LM, { overline: -0.04 }));
  const outLip = polygonArea(lipPolygon(LM, { overline: 0.10 }));
  ok(outLip > inLip, `${inLip} → ${outLip}`);
});

t('D4 섀도우 높이를 키우면 면적이 는다', () => {
  const lo = polygonArea(shadowPolygon(LM, 'L', { height: 0.15 }));
  const hi = polygonArea(shadowPolygon(LM, 'L', { height: 0.42 }));
  ok(hi > lo * 1.5, `${lo} → ${hi}`);
});

t('D5 볼터치 반지름을 키우면 면적이 는다', () => {
  const lo = polygonArea(cheekPolygon(LM, 'L', { radius: 0.22 }));
  const hi = polygonArea(cheekPolygon(LM, 'L', { radius: 0.40 }));
  ok(hi > lo * 2, `${lo} → ${hi}`);
});

t('D6 눈썹 꼬리를 들면 폴리곤이 위로 올라간다', () => {
  const flat = bbox(browPolygon(LM, 'L', { fill: 1.0, tailLift: 0 }));
  const lift = bbox(browPolygon(LM, 'L', { fill: 1.0, tailLift: 0.22 }));
  ok(lift.y0 < flat.y0, `y0 ${flat.y0} → ${lift.y0}`);
});

// ---------------- E. 좌우 대칭·비대칭 ----------------

t('E1 대칭 얼굴 + asym 0 → 좌우 라이너 면적이 같다', () => {
  const p = base();
  const l = polygonArea(linerPolygon(LM, 'L', p.liner));
  const r = polygonArea(linerPolygon(LM, 'R', p.liner));
  near(l, r, 0.02, '좌우 라이너');
});

t('E4 꼬리가 양쪽 다 위로 뻗는다 (회전 부호 좌우 반전)', () => {
  const p = base();
  p.liner.wingLen = 0.3;
  p.liner.wingAngle = 0.5;
  for (const side of ['L', 'R']) {
    const eyeC = centroid((side === 'L' ? IDX.eyeRingL : IDX.eyeRingR).map((i) => LM[i]));
    const tip = linerPolygon(LM, side, p.liner)[0];   // 꼬리 끝이 첫 점
    ok(tip.y < eyeC.y, `${side}쪽 꼬리가 아래로 갔다 (꼬리 y ${tip.y}, 눈 중심 y ${eyeC.y})`);
  }
});

t('E2 대칭 얼굴 + asym 0 → 좌우 눈썹 면적이 같다', () => {
  const p = base();
  const l = polygonArea(browPolygon(LM, 'L', p.brow));
  const r = polygonArea(browPolygon(LM, 'R', p.brow));
  near(l, r, 0.02, '좌우 눈썹');
});

t('E3 asym을 주면 좌우 면적이 벌어진다', () => {
  const p = base();
  p.asym = 0.18;
  p.liner.wingLen = 0;
  const s = buildSample(LM, p);
  const liner = s.parts.find((x) => x.id === 'liner');
  const l = polygonArea(liner.polys[0]);
  const r = polygonArea(liner.polys[1]);
  ok(Math.abs(l - r) / Math.max(l, r) > 0.1, `좌 ${l} 우 ${r} — 차이가 너무 작다`);
});

// ---------------- F. 구성 ----------------

t('F1 섀도우를 끄면 parts에서 빠진다', () => {
  const p = base();
  p.shadow.present = false;
  ok(!buildSample(LM, p).parts.some((x) => x.id === 'shadow'), 'shadow가 남아 있다');
});

t('F2 볼터치를 끄면 parts에서 빠진다', () => {
  const p = base();
  p.cheek.present = false;
  ok(!buildSample(LM, p).parts.some((x) => x.id === 'cheek'), 'cheek가 남아 있다');
});

t('F3 그리는 순서가 섀도우 → 라이너 → 눈썹 → 입술 → 볼터치', () => {
  const p = base();
  p.shadow.present = true; p.cheek.present = true;
  const ids = buildSample(LM, p).parts.map((x) => x.id);
  ok(JSON.stringify(ids) === JSON.stringify(['shadow', 'liner', 'brow', 'lip', 'cheek']), ids.join(','));
});

t('F4 라이너가 눈 위쪽에 놓인다 (눈 중심보다 위)', () => {
  const p = base();
  p.liner.wingLen = 0;
  const poly = linerPolygon(LM, 'L', p.liner);
  const eyeC = centroid(IDX.eyeRingL.map((i) => LM[i]));
  ok(centroid(poly).y < eyeC.y, `라이너 y ${centroid(poly).y} >= 눈 중심 y ${eyeC.y}`);
});

t('F5 볼터치가 눈과 입 사이 높이에 놓인다', () => {
  const poly = cheekPolygon(LM, 'L', { radius: 0.3 });
  const c = centroid(poly);
  ok(c.y > LM[IDX.eyeBottomL].y && c.y < LM[IDX.mouthCornerL].y, `볼터치 y ${c.y}`);
});

t('F6 볼터치가 입꼬리보다 바깥쪽에 놓인다 (다크서클 위치 방지)', () => {
  const faceCx = (LM[IDX.eyeOuterL].x + LM[IDX.eyeOuterR].x) / 2;
  for (const side of ['L', 'R']) {
    const c = centroid(cheekPolygon(LM, side, { radius: 0.3 }));
    const mouth = LM[side === 'L' ? IDX.mouthCornerL : IDX.mouthCornerR];
    ok(Math.abs(c.x - faceCx) > Math.abs(mouth.x - faceCx),
      `${side}쪽 볼터치가 입꼬리보다 안쪽 (볼 ${c.x}, 입꼬리 ${mouth.x}, 중심 ${faceCx})`);
  }
});

// ---------------- 결과 ----------------

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
