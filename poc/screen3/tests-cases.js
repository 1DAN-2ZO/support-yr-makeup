// 검증 케이스. Node 러너(tests.mjs)와 브라우저 러너(tests-browser.js)가 함께 쓴다.
import { rationale, products } from './core.js';
import { PART_IDS, FACE_SHAPES, CONTOUR_RULES } from './rules.js';

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
