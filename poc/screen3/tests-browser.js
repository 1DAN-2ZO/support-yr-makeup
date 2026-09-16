// 검증 탭 러너. tests.mjs 와 같은 케이스(tests-cases.js)를 브라우저에서 돌린다.
import { CASES } from './tests-cases.js';

export function runTests() {
  const out = [];
  for (const [name, fn] of CASES) {
    try { fn(); out.push(`PASS  ${name}`); }
    catch (e) { out.push(`FAIL  ${name}\n      ${e.message}`); }
  }
  const pass = out.filter((l) => l.startsWith('PASS')).length;
  return `${out.join('\n')}\n\n${pass}/${CASES.length} passed`;
}
