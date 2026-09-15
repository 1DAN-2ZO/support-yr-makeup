// 화면 7·8 검증 — node tests.mjs
import assert from 'node:assert/strict';
import {
  computeSummary, symmetryPenalty, harmonyPenalty, upsertPart, topMisses,
  lightingDiffers, trendSeries, HistoryStore, memoryAdapter, makeRecord, DEFAULT_TEMPLATE,
} from './core.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
}

const P = (partId, status, score, extra = {}) => ({ partId, status, score, diagnosis: '', metrics: {}, lrIndex: null, diagnosisCodes: [], ...extra });
const NO_HARM = { ...DEFAULT_TEMPLATE, harmonyRange: null };

// ---------- A. computeSummary 8종 ----------
test('A1 전부 통과 (좌우차 0, 보정 0)', () => {
  const parts = [P('brow','passed',88), P('liner','passed',82), P('shadow','passed',75), P('lip','passed',79), P('cheek','passed',71)];
  const s = computeSummary(parts, NO_HARM);
  const exp = (88+82+75+79+71*0.7)/(4+0.7);
  assert.equal(s.measuredCount, 5); assert.equal(s.partCount, 5);
  assert.ok(Math.abs(s.base - exp) <= 0.5, `base ${s.base} vs ${exp}`);
  assert.equal(s.symmetryPenalty, 0); assert.equal(s.harmonyPenalty, 0);
  assert.equal(s.total, Math.round(exp));
});
test('A2 1개 확인만 → 4개 기준, 확인만 점수 무시', () => {
  const parts = [P('brow','passed',88), P('liner','passed',82), P('shadow','check_only',null), P('lip','passed',79), P('cheek','passed',71)];
  const s = computeSummary(parts, NO_HARM);
  assert.equal(s.measuredCount, 4);
  const exp = (88+82+79+71*0.7)/(3+0.7);
  assert.ok(Math.abs(s.base - exp) <= 0.5);
});
test('A3 1개 건너뜀 → 제외', () => {
  const parts = [P('brow','passed',88), P('liner','skipped',null), P('shadow','passed',75), P('lip','passed',79), P('cheek','passed',71)];
  const s = computeSummary(parts, NO_HARM);
  assert.equal(s.measuredCount, 4);
  assert.ok(Math.abs(s.base - (88+75+79+71*0.7)/(3+0.7)) <= 0.5);
});
test('A4 전부 확인만 → total null, 크래시 없음', () => {
  const parts = ['brow','liner','shadow','lip','cheek'].map((id) => P(id,'check_only',null));
  const s = computeSummary(parts, NO_HARM);
  assert.equal(s.total, null); assert.equal(s.base, null); assert.equal(s.measuredCount, 0);
});
test('A5 재확인 덮어쓰기 → 최신 점수로 재계산, attempts 증가', () => {
  let parts = [P('brow','passed',60), P('liner','passed',60)];
  const s1 = computeSummary(parts, NO_HARM);
  parts = upsertPart(parts, P('brow','passed',90));
  const s2 = computeSummary(parts, NO_HARM);
  assert.equal(parts.length, 2);
  assert.equal(parts.find(p=>p.partId==='brow').attempts, 1 + 0); // 첫 기록 attempts 0 → 1
  assert.ok(s2.total > s1.total);
  assert.equal(s2.total, Math.round((90+60)/2));
});
test('A6 보정 상한: 대칭 -5, 조화 -5 를 넘지 않음', () => {
  const parts = [
    P('brow','passed',90, { metrics: { lrDiffMm: 9 } }),          // 3mm=1 → 포화
    P('liner','passed',90, { metrics: { lrDiffMm: 12 } }),
    P('lip','passed',90, { metrics: { colorAb: { a: 60, b: 60 } } }),
    P('cheek','passed',90, { metrics: { colorAb: { a: -60, b: -60 } }, lrIndex: { left: 10, right: 90 } }),
  ];
  assert.equal(symmetryPenalty(parts), -5);
  assert.equal(harmonyPenalty(parts, DEFAULT_TEMPLATE).penalty, -5);
  const s = computeSummary(parts, DEFAULT_TEMPLATE);
  assert.equal(s.total, 90 - 10);
});
test('A7 가중치 반영: 볼 0.7 이 합산에 덜 영향', () => {
  const hi = [P('brow','passed',100), P('cheek','passed',0)];
  const s = computeSummary(hi, NO_HARM);
  assert.ok(Math.abs(s.base - 100/1.7) <= 0.5); // 58.8
  const custom = { ...NO_HARM, weights: { brow: 1, cheek: 1 } };
  assert.ok(Math.abs(computeSummary(hi, custom).base - 50) <= 0.5);
});
test('A8 부위 4개 룩 (partIds 축소)', () => {
  const tpl = { ...NO_HARM, partIds: ['brow','liner','lip','cheek'] };
  const parts = [P('brow','passed',80), P('liner','passed',80), P('shadow','passed',10), P('lip','passed',80), P('cheek','passed',80)];
  const s = computeSummary(parts, tpl);
  assert.equal(s.partCount, 4); assert.equal(s.measuredCount, 4); assert.equal(s.total, 80); // shadow 무시
});

// ---------- B. 보정 방향·멱등 ----------
test('B1 멱등성: 같은 입력 3회 → 같은 total', () => {
  const parts = [P('brow','passed',88,{metrics:{lrDiffMm:1}}), P('lip','passed',79,{metrics:{colorAb:{a:20,b:10}}}), P('cheek','passed',71,{metrics:{colorAb:{a:22,b:12}}, lrIndex:{left:41,right:44}})];
  const t = [1,2,3].map(()=>computeSummary(parts).total);
  assert.equal(t[0], t[1]); assert.equal(t[1], t[2]);
});
test('B2 대칭 보정 방향: 한쪽만 진함 → 음수, 양쪽 같음 → 0~-1', () => {
  const uneven = [P('cheek','passed',70,{lrIndex:{left:20,right:60}})];
  const even = [P('cheek','passed',70,{lrIndex:{left:41,right:44}})];
  assert.ok(symmetryPenalty(uneven) < -3);
  const e = symmetryPenalty(even); assert.ok(e <= 0 && e >= -1);
});
test('B3 조화 보정: 범위 안 0 / 밖 음수 / 범위 없음 미적용', () => {
  const inside = [P('lip','passed',80,{metrics:{colorAb:{a:20,b:10}}}), P('cheek','passed',80,{metrics:{colorAb:{a:24,b:14}}})];
  const outside = [P('lip','passed',80,{metrics:{colorAb:{a:20,b:10}}}), P('cheek','passed',80,{metrics:{colorAb:{a:45,b:30}}})];
  assert.equal(harmonyPenalty(inside, DEFAULT_TEMPLATE).penalty, 0);
  assert.ok(harmonyPenalty(outside, DEFAULT_TEMPLATE).penalty < 0);
  const none = harmonyPenalty(outside, NO_HARM); assert.equal(none.penalty, 0); assert.equal(none.applied, false);
});

// ---------- C. 기록 ----------
const mk = (i, parts, lookId='smoky', fl=60) => makeRecord({ id: 'r'+i, date: `2026-09-${String(i).padStart(2,'0')}T10:00:00`, lookId, lookName: lookId, parts, template: NO_HARM, lightingRef: { foreheadL: fl } });

test('C1 topMisses: 회차당 1회 집계, 동률은 최근 우선, null·건너뜀 제외', () => {
  const recs = [
    mk(1, [P('liner','passed',70,{diagnosisCodes:['LINER_WING_HIGH_R','LINER_WING_HIGH_R']}), P('cheek','passed',60,{diagnosisCodes:['CHEEK_LR_DIFF']})]),
    mk(2, [P('liner','passed',72,{diagnosisCodes:['LINER_WING_HIGH_R']}), P('cheek','skipped',null,{diagnosisCodes:['CHEEK_LR_DIFF']})]),
    mk(3, [P('liner','check_only',null,{diagnosisCodes:['LINER_THICK']}), P('cheek','passed',65,{diagnosisCodes:['CHEEK_LR_DIFF']})]),
    mk(4, [P('liner','passed',80,{diagnosisCodes:['LINER_WING_HIGH_R']}), P('brow','passed',80,{diagnosisCodes:['BROW_TAIL_SHORT']})]),
    mk(5, [P('liner','passed',85,{diagnosisCodes:['LINER_WING_HIGH_R']}), P('brow','passed',80,{diagnosisCodes:['BROW_TAIL_SHORT']})]),
  ];
  const t = topMisses(recs, 5);
  assert.equal(t[0].code, 'LINER_WING_HIGH_R'); assert.equal(t[0].count, 4); assert.equal(t[0].n, 5);
  // CHEEK_LR_DIFF: 회차1,3 = 2회 (회차2는 skipped 제외). BROW_TAIL_SHORT: 회차4,5 = 2회 → 동률, 더 최근(5) 우선
  assert.equal(t[1].code, 'BROW_TAIL_SHORT'); assert.equal(t[1].count, 2);
});
test('C2 추이: total null 회차는 y=null 로 빈칸, 룩 필터', () => {
  const recs = [mk(1,[P('brow','passed',60)]), mk(2,[P('brow','check_only',null)]), mk(3,[P('brow','passed',70)],'daily')];
  const all = trendSeries(recs);
  assert.equal(all.length, 3); assert.equal(all[1].y, null);
  assert.equal(trendSeries(recs,'daily').length, 1);
});
test('C3 보관 상한: cap 초과 시 가장 오래된 것 제거·반환', () => {
  const store = new HistoryStore(memoryAdapter(), 3);
  [1,2,3].forEach((i)=>store.save(mk(i,[P('brow','passed',60)])));
  const { removed } = store.save(mk(4,[P('brow','passed',60)]));
  assert.equal(store.list().length, 3); assert.equal(removed.length, 1); assert.equal(removed[0].id, 'r1');
});
test('C4 삭제: 개별·전체 삭제 후 잔존 0', () => {
  const store = new HistoryStore(memoryAdapter(), 10);
  [1,2].forEach((i)=>store.save(mk(i,[P('brow','passed',60)])));
  assert.equal(store.delete('r1').id, 'r1'); assert.equal(store.list().length, 1);
  store.clear(); assert.equal(store.list().length, 0);
});
test('C5 저장→복원 동일성 (JSON 왕복)', () => {
  const rec = mk(1,[P('brow','passed',88,{metrics:{lrDiffMm:1}}), P('cheek','passed',71,{lrIndex:{left:41,right:44}})]);
  const back = JSON.parse(JSON.stringify(rec));
  assert.deepEqual(back.summary.total, rec.summary.total); assert.deepEqual(back.parts, rec.parts);
});
test('C6 조명 배지: 이마 L* 차 8 이상', () => {
  assert.equal(lightingDiffers({foreheadL:60},{foreheadL:70}), true);
  assert.equal(lightingDiffers({foreheadL:60},{foreheadL:65}), false);
  assert.equal(lightingDiffers(null,{foreheadL:65}), false);
});
test('C7 같은 id 재저장 → 덮어쓰기 (중복 없음)', () => {
  const store = new HistoryStore(memoryAdapter(), 10);
  store.save(mk(1,[P('brow','passed',60)])); store.save(mk(1,[P('brow','passed',90)]));
  assert.equal(store.list().length, 1); assert.equal(store.get('r1').summary.total, 90);
});

// ---------- 출력 ----------
const pass = results.filter(r=>r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.err}`);
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
