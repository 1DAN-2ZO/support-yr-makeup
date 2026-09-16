// 검증 케이스. Node 러너(tests.mjs)와 브라우저 러너(tests-browser.js)가 함께 쓴다.
import { rationale, products } from './core.js';
import { PART_IDS, FACE_SHAPES, CONTOUR_RULES } from './rules.js';
import { cropSpec, partLandmarks, boundsOf, IDX } from './core.js';
import { ORIENTATION, ASPECT, SIDE_MARGIN, PORTRAIT_ZOOM } from './rules.js';

export const assert = {
  ok(v, m) { if (!v) throw new Error(m || 'assert.ok 실패'); },
  equal(a, b, m) { if (a !== b) throw new Error(m || `${a} !== ${b}`); },
  deepEqual(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m || 'deepEqual 실패'); },
  throws(fn, m) { try { fn(); } catch { return; } throw new Error(m || '예외가 없음'); },
};

export const CASES = [];
const test = (name, fn) => CASES.push([name, fn]);

// ---------- R. 문장 ----------
test('R1 근거 한 줄에 숫자가 없다 (mm·각도·% 금지)', () => {
  for (const id of PART_IDS) {
    const s = rationale(id, 'round');
    assert.ok(s.length > 0, `${id} 근거 비어 있음`);
    assert.ok(!/[0-9]/.test(s), `${id} 근거에 숫자: ${s}`);
  }
});
test('R2 contour 근거가 얼굴형마다 다르다', () => {
  const seen = FACE_SHAPES.map((f) => rationale('contour', f));
  assert.equal(new Set(seen).size, FACE_SHAPES.length);
  assert.equal(rationale('contour', 'round'), CONTOUR_RULES.round.rationale);
});
test('R3 제품 한 줄이 partId 로 걸러진다', () => {
  assert.equal(products('liner'), '지금 필요한 것: 블랙 젤 라이너 + 각진 브러시');
  assert.equal(products('contour'), '지금 필요한 것: 컨투어 파우더 + 하이라이터 + 브러시');
  assert.throws(() => products('nope'));
});

// 합성 얼굴: 478점을 화면 중앙에 두고, 부위 인덱스만 설계된 자리로 옮긴다.
// 정규화 좌표(0~1)를 쓰고 imgSize 로 픽셀 환산한다.
export function fakeFace() {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const put = (i, x, y) => { lm[i] = { x, y, z: 0 }; };
  const spread = (idxs, x0, x1, y0, y1) => idxs.forEach((i, k) => {
    const t = idxs.length > 1 ? k / (idxs.length - 1) : 0;
    put(i, x0 + (x1 - x0) * t, (k % 2) ? y1 : y0);
  });
  // 눈: 바깥 끝 x 0.22 / 0.78, 높이 0.42~0.46
  spread(IDX.eyeRing.r, 0.22, 0.44, 0.42, 0.46);
  spread(IDX.eyeRing.l, 0.56, 0.78, 0.42, 0.46);
  put(IDX.eyeOuter.r, 0.22, 0.44); put(IDX.eyeOuter.l, 0.78, 0.44);
  // 눈썹: 눈 위 0.36~0.40
  spread(IDX.brow.r, 0.23, 0.45, 0.36, 0.40);
  spread(IDX.brow.l, 0.55, 0.77, 0.36, 0.40);
  // 입술
  spread(IDX.lipOuter, 0.40, 0.60, 0.70, 0.76);
  // 볼
  spread(IDX.cheek.r, 0.22, 0.40, 0.52, 0.62);
  spread(IDX.cheek.l, 0.60, 0.78, 0.52, 0.62);
  // 턱선·얼굴 가장자리·이마·코·눈 밑
  spread(IDX.jawline, 0.25, 0.75, 0.78, 0.88);
  put(IDX.faceEdge.r, 0.18, 0.55); put(IDX.faceEdge.l, 0.82, 0.55);
  put(IDX.foreheadTop, 0.50, 0.22);
  put(IDX.foreheadSide.r, 0.24, 0.28); put(IDX.foreheadSide.l, 0.76, 0.28);
  put(IDX.chinTip, 0.50, 0.90);
  spread(IDX.noseBridge, 0.50, 0.50, 0.40, 0.62);
  spread(IDX.underEye.r, 0.24, 0.42, 0.48, 0.50);
  spread(IDX.underEye.l, 0.58, 0.76, 0.48, 0.50);
  // 홍채: 지름이 이미지 폭의 약 6.5% 가 되게 (샘플과 비슷한 척도)
  put(IDX.iris.r[0], 0.30, 0.41); put(IDX.iris.r[1], 0.33, 0.44);
  put(IDX.iris.r[2], 0.36, 0.47); put(IDX.iris.r[3], 0.33, 0.44);
  put(IDX.iris.l[0], 0.64, 0.41); put(IDX.iris.l[1], 0.67, 0.44);
  put(IDX.iris.l[2], 0.70, 0.47); put(IDX.iris.l[3], 0.67, 0.44);
  return lm;
}
export const IMG = { w: 1080, h: 1440 };   // 샘플 세트와 같은 3:4

// ---------- C. 크롭 박스 ----------
test('C1 랜드마크를 전부 담거나, 못 담으면 clamped 로 보고한다', () => {
  const lm = fakeFace();
  for (const id of PART_IDS) {
    const c = cropSpec(lm, IMG, id);
    assert.ok(c.covered || c.clamped, `${id} covered=false 인데 clamped 도 false — 조용히 잘렸다`);
  }
  // 좁은 세로 부위는 여유 있게 담겨야 한다
  const lip = cropSpec(lm, IMG, 'lip');
  assert.ok(lip.covered && !lip.clamped, 'lip 은 담겨야 한다');
});
test('C2 liner 폭이 눈 끝 폭의 1.3배다 (양쪽 15%)', () => {
  const lm = fakeFace();
  const c = cropSpec(lm, IMG, 'liner');
  // fakeFace()의 눈 x좌표 범위: 0.22~0.44(오른쪽 눈), 0.56~0.78(왼쪽 눈)
  // 전체 범위 0.22~0.78, 폭 = (0.78-0.22)*1080 = 604.8px
  // SIDE_MARGIN=0.15이므로 1.3배 = 604.8 * 1.3 = 786.24px
  const wantWidth = 786.24;
  assert.ok(Math.abs(c.w - wantWidth) < 1, `w=${c.w} want=${wantWidth}`);
});
test('C3 orientation 이 부위 정의와 일치한다', () => {
  const lm = fakeFace();
  const WANT = { brow: 'landscape', liner: 'landscape', shadow: 'landscape', lip: 'portrait', cheek: 'portrait', contour: 'portrait' };
  for (const id of PART_IDS) assert.equal(cropSpec(lm, IMG, id).orientation, WANT[id], id);
});
test('C4 박스 종횡비가 목표와 1% 이내로 같다', () => {
  const lm = fakeFace();
  for (const id of PART_IDS) {
    const c = cropSpec(lm, IMG, id);
    const want = ASPECT[ORIENTATION[id]];
    assert.ok(Math.abs(c.w / c.h - want) / want < 0.01, `${id} aspect ${c.w / c.h} vs ${want}`);
  }
});
test('C5 경계를 넘으면 이동, 이동으로 안 되면 축소 + clamped', () => {
  const lm = fakeFace();
  // 좁은 이미지: 세로 부위 박스가 이미지보다 커져 축소가 일어난다
  const narrow = { w: 200, h: 200 };
  const c = cropSpec(lm, narrow, 'contour');
  assert.ok(c.clamped, '축소가 일어나야 한다');
  assert.ok(c.w <= narrow.w + 0.001 && c.h <= narrow.h + 0.001, '박스가 이미지 안에 들어와야 한다');
  // 이동만으로 해결되면 축소는 없다
  const c2 = cropSpec(lm, IMG, 'lip');
  if (c2.clampedSides.length) assert.ok(!c2.clamped, '이동만으로 되면 clamped 는 false');
});
test('C6 스케일 불변: 이미지 2배 → 박스 2배, zoomRatio 동일', () => {
  const lm = fakeFace();
  const a = cropSpec(lm, IMG, 'lip');
  const b = cropSpec(lm, { w: IMG.w * 2, h: IMG.h * 2 }, 'lip');
  assert.ok(Math.abs(b.w - a.w * 2) < 1 && Math.abs(b.h - a.h * 2) < 1, `${b.w} vs ${a.w * 2}`);
  assert.ok(Math.abs(b.zoomRatio - a.zoomRatio) < 0.001);
});
test('C7 알 수 없는 partId 는 예외', () => {
  assert.throws(() => cropSpec(fakeFace(), IMG, 'nope'));
});
test('C8 세로 부위 기본 zoomRatio 가 2.5다', () => {
  const c = cropSpec(fakeFace(), IMG, 'lip');
  assert.ok(!c.clamped, '이 케이스에서 축소가 일어나면 안 됨');
  // PORTRAIT_ZOOM=2.5이므로 w = 1080/2.5 = 432px, h = 432*(9/19.5) = 936px, zoomRatio = 2.5
  const wantWidth = 432;
  const wantHeight = 936;
  const wantZoomRatio = 2.5;
  assert.ok(Math.abs(c.w - wantWidth) < 1, `w=${c.w} want=${wantWidth}`);
  assert.ok(Math.abs(c.h - wantHeight) < 1, `h=${c.h} want=${wantHeight}`);
  assert.ok(Math.abs(c.zoomRatio - wantZoomRatio) < 0.01, `zoom=${c.zoomRatio} want=${wantZoomRatio}`);
});

import { contourOutline, REGION_NAMES } from './core.js';

const polyPts = (polys) => polys.flat();

// ---------- N. 윤곽선 ----------
test('N1 얼굴형 5종이 서로 다른 폴리곤을 낸다', () => {
  const lm = fakeFace();
  const sigs = FACE_SHAPES.map((f) => JSON.stringify(contourOutline(lm, IMG, f).shading));
  assert.equal(new Set(sigs).size, FACE_SHAPES.length);
});
test('N2 정면 합성 얼굴에서 좌우 대칭이다', () => {
  const lm = fakeFace();
  for (const f of FACE_SHAPES) {
    const o = contourOutline(lm, IMG, f);
    for (const key of ['shading', 'highlight']) {
      const xs = polyPts(o[key]).map((p) => p[0]);
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      assert.ok(Math.abs(meanX - IMG.w / 2) < IMG.w * 0.02, `${f}.${key} meanX=${meanX}`);
    }
  }
});
test('N3 폴리곤이 얼굴 범위 안에 있다', () => {
  const lm = fakeFace();
  const face = boundsOf(partLandmarks(lm, IMG, 'contour'));
  const pad = IMG.h * 0.35;   // 이마·콧대는 contour 바운딩보다 위에 있다
  for (const f of FACE_SHAPES) {
    const o = contourOutline(lm, IMG, f);
    for (const p of polyPts([...o.shading, ...o.highlight])) {
      assert.ok(p[0] >= -1 && p[0] <= IMG.w + 1, `${f} x=${p[0]}`);
      assert.ok(p[1] >= face.y - pad && p[1] <= face.y + face.h + pad, `${f} y=${p[1]}`);
    }
  }
});
test('N4 모르는 label 은 oval 로 폴백한다', () => {
  const lm = fakeFace();
  assert.deepEqual(contourOutline(lm, IMG, 'wat'), contourOutline(lm, IMG, 'oval'));
});
test('N5 shading·highlight 가 비어 있지 않고 source 가 landmark_only 다', () => {
  const lm = fakeFace();
  for (const f of FACE_SHAPES) {
    const o = contourOutline(lm, IMG, f);
    assert.ok(o.shading.length > 0 && o.highlight.length > 0, f);
    assert.ok(o.shading.every((p) => p.length >= 4), `${f} 폴리곤 점이 4개 미만`);
    assert.equal(o.source, 'landmark_only');
    assert.deepEqual(o.labels.map((l) => l.text), ['쉐딩', '하이라이트']);
  }
  // region 이름 검증: CONTOUR_RULES 에 쓰인 모든 region 이 REGION_BUILDERS 에 있어야 한다
  for (const f of FACE_SHAPES) {
    const rule = CONTOUR_RULES[f];
    for (const { region } of [...rule.shading, ...rule.highlight]) {
      assert.ok(REGION_NAMES.includes(region), `${f}: REGION_BUILDERS 에 없는 region 이름 "${region}"`);
    }
  }
});
