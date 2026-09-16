// 화면 3 진행 칩·세션 자동 검증 (Node 전용). 실행: node tests-session.mjs

import { PART_IDS as CROP_PART_IDS } from './crop.js';
import { computeSummary } from '../screen6/core.js';
import {
  PART_IDS, PART_NAME, PART_SHORT, CONTOUR_ID,
  createSession, findPart, goTo, recordResult, skipPart,
  chips, pendingBefore, hintFor, nextPart, isComplete,
  saveSession, loadSession, clearSession, memoryStorage, SESSION_KEY, withParticle,
} from './session.js';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('PASS ', name); pass++; }
  catch (e) { console.log('FAIL ', name, '\n       ', e.message); fail++; }
}
const ok = (c, m) => { if (!c) throw new Error(m || '조건 불충족'); };
const st = (s, id) => findPart(s, id).status;

// ---------------- A. 기본 ----------------

t('A1 부위 6개로 세션이 만들어지고 첫 부위가 현재가 된다', () => {
  const s = createSession();
  ok(s.parts.length === 6, `부위 ${s.parts.length}개`);
  ok(s.currentPart === 'brow', `현재 ${s.currentPart}`);
  ok(s.parts.every((p) => p.status === 'not_started'), '초기 상태가 미시작이 아님');
});

t('A2 crop.js와 화면 6의 부위 목록이 같다 (두 벌이 어긋나지 않게)', () => {
  ok(JSON.stringify(CROP_PART_IDS) === JSON.stringify(PART_IDS),
    `crop.js ${CROP_PART_IDS} vs screen6 ${PART_IDS}`);
});

t('A3 쉐딩·하이라이트가 항상 마지막이다', () => {
  ok(PART_IDS[PART_IDS.length - 1] === CONTOUR_ID, `마지막이 ${PART_IDS[PART_IDS.length - 1]}`);
});

t('A4 짧은 이름이 6개 다 있고 원래 이름보다 길지 않다', () => {
  for (const id of PART_IDS) {
    ok(PART_SHORT[id], `${id} 짧은 이름 없음`);
    ok(PART_SHORT[id].length <= PART_NAME[id].length, `${id}: ${PART_SHORT[id]}가 더 길다`);
  }
});

t('A5 세션에 없는 부위로 가면 거부한다', () => {
  const s = createSession();
  let threw = false;
  try { goTo(s, 'nose'); } catch { threw = true; }
  ok(threw, '아무 부위나 받아들였다');
});

// ---------------- B. 이동과 상태 ----------------

t('B1 결과 없는 부위로 가면 진행 중이 된다', () => {
  const s = goTo(createSession(), 'liner');
  ok(s.currentPart === 'liner', '현재가 안 바뀜');
  ok(st(s, 'liner') === 'in_progress', `상태 ${st(s, 'liner')}`);
});

t('B2 보던 부위를 결과 없이 떠나면 미시작으로 되돌아간다', () => {
  let s = goTo(createSession(), 'liner');
  s = goTo(s, 'lip');
  ok(st(s, 'liner') === 'not_started', `아이라이너가 ${st(s, 'liner')}로 남음`);
  ok(st(s, 'lip') === 'in_progress', `입술이 ${st(s, 'lip')}`);
});

t('B3 ★ 결과가 난 부위로 돌아가도 점수가 사라지지 않는다', () => {
  let s = goTo(createSession(), 'brow');
  s = recordResult(s, 'brow', { score: 88 });
  s = goTo(s, 'lip');
  s = goTo(s, 'brow');                       // 진행 칩으로 되돌아옴
  ok(st(s, 'brow') === 'passed', `상태가 ${st(s, 'brow')}로 바뀜`);
  ok(findPart(s, 'brow').score === 88, `점수가 ${findPart(s, 'brow').score}`);
  ok(chips(s).find((c) => c.partId === 'brow').active, '활성 표시가 안 됨');
});

t('B4 다시 확인받으면 최신 점수로 덮어쓴다 (화면 6 재계산 규칙)', () => {
  let s = recordResult(goTo(createSession(), 'brow'), 'brow', { score: 82 });
  s = recordResult(s, 'brow', { score: 91 });
  ok(findPart(s, 'brow').score === 91, `점수 ${findPart(s, 'brow').score}`);
  ok(s.parts.filter((p) => p.partId === 'brow').length === 1, '부위가 중복 저장됨');
});

t('B5 건너뛰면 건너뜀 상태가 되고 점수가 없다', () => {
  const s = skipPart(goTo(createSession(), 'shadow'), 'shadow');
  ok(st(s, 'shadow') === 'skipped', `상태 ${st(s, 'shadow')}`);
  ok(findPart(s, 'shadow').score === null, '점수가 남음');
});

t('B6 원본 세션을 바꾸지 않는다 (순수 함수)', () => {
  const s0 = createSession();
  const snap = JSON.stringify(s0);
  goTo(s0, 'lip'); recordResult(s0, 'brow', { score: 70 }); skipPart(s0, 'cheek');
  ok(JSON.stringify(s0) === snap, '원본이 바뀌었다');
});

// ---------------- C. 쉐딩·하이라이트는 항상 확인만 ----------------

t('C1 쉐딩에 점수를 줘도 확인만으로 바뀌고 점수가 지워진다', () => {
  const s = recordResult(goTo(createSession(), CONTOUR_ID), CONTOUR_ID, { score: 95 });
  ok(st(s, CONTOUR_ID) === 'check_only', `상태 ${st(s, CONTOUR_ID)}`);
  ok(findPart(s, CONTOUR_ID).score === null, `점수가 ${findPart(s, CONTOUR_ID).score}로 남음`);
});

t('C2 쉐딩은 합산에 들어가지 않는다', () => {
  let s = createSession();
  s = recordResult(s, 'brow', { score: 90 });
  s = recordResult(s, CONTOUR_ID, { score: 10 });   // 확인만으로 정규화됨
  const sum = computeSummary(s.parts);
  ok(sum.measuredCount === 1, `합산 대상이 ${sum.measuredCount}개`);
  ok(Math.abs(sum.total - 90) < 6, `합산 ${sum.total} (보정 전 90 근처여야)`);
});

// ---------------- D. 앞 단계 안내 ----------------

t('D1 앞 단계를 건너뛰고 뒤로 가면 안내 문구가 나온다', () => {
  const s = goTo(createSession(), 'lip');
  const h = hintFor(s, 'lip');
  ok(h && h.includes('눈썹'), `안내가 "${h}"`);
});

t('D1b 받침에 맞는 조사가 붙는다 (을(를) 같은 표기 금지)', () => {
  ok(withParticle('눈썹') === '눈썹을', withParticle('눈썹'));          // 받침 ㅂ
  ok(withParticle('입술') === '입술을', withParticle('입술'));          // 받침 ㄹ
  ok(withParticle('아이라이너') === '아이라이너를', withParticle('아이라이너'));  // 받침 없음
  ok(withParticle('섀도우') === '섀도우를', withParticle('섀도우'));
  ok(withParticle('볼터치') === '볼터치를', withParticle('볼터치'));
  ok(!hintFor(goTo(createSession(), 'lip'), 'lip').includes('('), '괄호 표기가 남아 있다');
});

t('D2 앞 단계를 다 했으면 안내가 없다', () => {
  let s = createSession();
  for (const id of ['brow', 'liner', 'shadow']) s = recordResult(s, id, { score: 80 });
  ok(hintFor(s, 'lip') === null, `안내가 "${hintFor(s, 'lip')}"로 남음`);
});

t('D3 건너뛴 부위는 "안 한 것"으로 치지 않는다', () => {
  let s = skipPart(createSession(), 'brow');
  s = recordResult(s, 'liner', { score: 80 });
  s = recordResult(s, 'shadow', { score: 80 });
  ok(hintFor(s, 'lip') === null, `안내가 "${hintFor(s, 'lip')}"`);
});

t('D4 첫 부위에는 안내가 없다', () => {
  ok(hintFor(createSession(), 'brow') === null, '첫 부위에 안내가 떴다');
  ok(pendingBefore(createSession(), 'brow').length === 0, '앞 단계가 있다고 나옴');
});

t('D5 이동 자체는 막지 않는다 (알려 주기만)', () => {
  const s = goTo(createSession(), CONTOUR_ID);
  ok(s.currentPart === CONTOUR_ID, '이동이 막혔다');
  ok(hintFor(s, CONTOUR_ID) !== null, '안내는 나와야 한다');
});

// ---------------- E. 칩 뷰 ----------------

t('E1 칩이 6개 나오고 순서가 세션과 같다', () => {
  const c = chips(createSession());
  ok(c.length === 6, `칩 ${c.length}개`);
  ok(JSON.stringify(c.map((x) => x.partId)) === JSON.stringify(PART_IDS), '순서가 다르다');
});

t('E2 칩에 상태 라벨과 점수가 실린다', () => {
  let s = recordResult(createSession(), 'brow', { score: 88 });
  s = goTo(s, 'liner');
  const c = chips(s);
  const brow = c.find((x) => x.partId === 'brow');
  const liner = c.find((x) => x.partId === 'liner');
  ok(brow.score === 88 && brow.label === '완료', `눈썹 ${brow.label}/${brow.score}`);
  ok(liner.label === '진행 중' && liner.active, `라이너 ${liner.label}/${liner.active}`);
  ok(c.filter((x) => x.active).length === 1, '활성 칩이 하나가 아니다');
});

t('E3 다음 부위와 완료 여부', () => {
  ok(nextPart(createSession(), 'brow') === 'liner', '다음이 틀림');
  ok(nextPart(createSession(), CONTOUR_ID) === null, '마지막 다음이 있다고 나옴');
  let s = createSession();
  ok(!isComplete(s), '시작부터 완료라고 나옴');
  for (const id of PART_IDS) s = recordResult(s, id, { score: 80 });
  ok(isComplete(s), '다 했는데 완료가 아니라고 나옴');
});

// ---------------- F. 저장·복원 (F-07) ----------------

t('F1 저장했다 불러오면 그대로다', () => {
  const store = memoryStorage();
  let s = recordResult(goTo(createSession(), 'brow'), 'brow', { score: 77 });
  s = goTo(s, 'lip');
  ok(saveSession(s, store), '저장 실패');
  const back = loadSession(store);
  ok(JSON.stringify(back) === JSON.stringify(s), '복원값이 다르다');
  ok(back.currentPart === 'lip' && findPart(back, 'brow').score === 77, '내용이 다르다');
});

t('F2 저장된 게 없으면 null', () => {
  ok(loadSession(memoryStorage()) === null, 'null이 아님');
});

t('F3 깨진 값이 들어 있어도 죽지 않는다', () => {
  const store = memoryStorage();
  store.setItem(SESSION_KEY, '{이건 JSON이 아님');
  ok(loadSession(store) === null, '예외가 났거나 값을 돌려줌');
  store.setItem(SESSION_KEY, '{"id":"x"}');
  ok(loadSession(store) === null, '모양이 안 맞는데 통과시킴');
});

t('F4 끝내기 하면 지워진다 (F-11 세션 삭제)', () => {
  const store = memoryStorage();
  saveSession(createSession(), store);
  clearSession(store);
  ok(store.getItem(SESSION_KEY) === null, '남아 있다');
  ok(loadSession(store) === null, '여전히 불러와진다');
});

t('F5 저장소가 막혀 있어도 죽지 않는다', () => {
  const blocked = {
    getItem: () => { throw new Error('막힘'); },
    setItem: () => { throw new Error('막힘'); },
    removeItem: () => { throw new Error('막힘'); },
  };
  ok(saveSession(createSession(), blocked) === false, '실패를 알리지 않음');
  ok(loadSession(blocked) === null, 'null이 아님');
  ok(clearSession(blocked) === false, '실패를 알리지 않음');
});

// ---------------- 결과 ----------------

console.log('\n진행 예시 — 눈썹 완료(88) → 라이너 보는 중 → 섀도우 건너뜀');
{
  let s = recordResult(createSession(), 'brow', { score: 88 });
  s = skipPart(s, 'shadow');
  s = goTo(s, 'liner');
  for (const c of chips(s)) {
    console.log(`  ${c.active ? '▸' : ' '} ${c.short.padEnd(7)} ${c.label.padEnd(6)}` +
                `${c.score !== null ? ' ' + c.score : ''}`);
  }
  const h = hintFor(s, 'liner');
  console.log(`  안내: ${h || '(없음)'}`);
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
