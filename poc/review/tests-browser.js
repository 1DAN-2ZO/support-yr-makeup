// 브라우저용 러너: tests.mjs 와 같은 케이스 (node:assert 대신 최소 assert)
import {
  computeSummary, symmetryPenalty, harmonyPenalty, upsertPart, oneLiner, topMisses,
  lightingDiffers, trendSeries, HistoryStore, memoryAdapter, makeRecord, DEFAULT_TEMPLATE, PART_IDS, LOOK_PART_IDS, CONTOUR_ID,
} from './core.js';

const assert = {
  equal: (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); },
  ok: (v, m) => { if (!v) throw new Error(m || 'assert.ok failed'); },
  deepEqual: (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m || 'deepEqual failed'); },
};

export function run() {
  const results = [];
  const test = (name, fn) => { try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };
  const P = (partId, status, score, extra = {}) => ({ partId, status, score, diagnosis: '', metrics: {}, lrIndex: null, diagnosisCodes: [], ...extra });
  const NO_HARM = { ...DEFAULT_TEMPLATE, harmonyRange: null };
  const mk = (i, parts, lookId = 'smoky', fl = 60) => makeRecord({ id: 'r' + i, date: `2026-09-${String(i).padStart(2, '0')}T10:00:00`, lookId, lookName: lookId, parts, template: NO_HARM, lightingRef: { foreheadL: fl } });

  test('A1 전부 통과', () => { const parts = [P('brow','passed',88), P('liner','passed',82), P('shadow','passed',75), P('lip','passed',79), P('cheek','passed',71)]; const s = computeSummary(parts, NO_HARM); const exp = (88+82+75+79+71*0.7)/(4+0.7); assert.equal(s.measuredCount,5); assert.ok(Math.abs(s.base-exp)<=0.5); assert.equal(s.total, Math.round(exp)); });
  test('A2 1개 확인만', () => { const parts = [P('brow','passed',88), P('liner','passed',82), P('shadow','check_only',null), P('lip','passed',79), P('cheek','passed',71)]; const s = computeSummary(parts, NO_HARM); assert.equal(s.measuredCount,4); assert.ok(Math.abs(s.base-(88+82+79+71*0.7)/(3+0.7))<=0.5); });
  test('A3 1개 건너뜀', () => { const parts = [P('brow','passed',88), P('liner','skipped',null), P('shadow','passed',75), P('lip','passed',79), P('cheek','passed',71)]; const s = computeSummary(parts, NO_HARM); assert.equal(s.measuredCount,4); });
  test('A4 전부 확인만 → null', () => { const s = computeSummary(LOOK_PART_IDS.map((id)=>P(id,'check_only',null)), NO_HARM); assert.equal(s.total,null); assert.equal(s.measuredCount,0); });
  test('A5 재확인 덮어쓰기', () => { let parts=[P('brow','passed',60),P('liner','passed',60)]; const s1=computeSummary(parts,NO_HARM); parts=upsertPart(parts,P('brow','passed',90)); const s2=computeSummary(parts,NO_HARM); assert.equal(parts.length,2); assert.ok(s2.total>s1.total); assert.equal(s2.total,75); });
  test('A6 보정 상한 -5/-5', () => { const parts=[P('brow','passed',90,{metrics:{lrDiffMm:9}}),P('liner','passed',90,{metrics:{lrDiffMm:12}}),P('lip','passed',90,{metrics:{colorAb:{a:60,b:60}}}),P('cheek','passed',90,{metrics:{colorAb:{a:-60,b:-60}},lrIndex:{left:10,right:90}})]; assert.equal(symmetryPenalty(parts),-5); assert.equal(harmonyPenalty(parts,DEFAULT_TEMPLATE).penalty,-5); assert.equal(computeSummary(parts,DEFAULT_TEMPLATE).total,80); });
  test('A7 가중치 반영', () => { const hi=[P('brow','passed',100),P('cheek','passed',0)]; assert.ok(Math.abs(computeSummary(hi,NO_HARM).base-100/1.7)<=0.5); assert.ok(Math.abs(computeSummary(hi,{...NO_HARM,weights:{brow:1,cheek:1}}).base-50)<=0.5); });
  test('A8 부위 4개 룩', () => { const tpl={...NO_HARM,partIds:['brow','liner','lip','cheek']}; const parts=[P('brow','passed',80),P('liner','passed',80),P('shadow','passed',10),P('lip','passed',80),P('cheek','passed',80)]; const s=computeSummary(parts,tpl); assert.equal(s.partCount,4); assert.equal(s.total,80); });
  test('B1 멱등성', () => { const parts=[P('brow','passed',88,{metrics:{lrDiffMm:1}}),P('lip','passed',79,{metrics:{colorAb:{a:20,b:10}}}),P('cheek','passed',71,{metrics:{colorAb:{a:22,b:12}},lrIndex:{left:41,right:44}})]; const t=[1,2,3].map(()=>computeSummary(parts).total); assert.equal(t[0],t[1]); assert.equal(t[1],t[2]); });
  test('B2 대칭 보정 방향', () => { assert.ok(symmetryPenalty([P('cheek','passed',70,{lrIndex:{left:20,right:60}})])<-3); const e=symmetryPenalty([P('cheek','passed',70,{lrIndex:{left:41,right:44}})]); assert.ok(e<=0&&e>=-1); });
  test('B3 조화 보정', () => { const inside=[P('lip','passed',80,{metrics:{colorAb:{a:20,b:10}}}),P('cheek','passed',80,{metrics:{colorAb:{a:24,b:14}}})]; const outside=[P('lip','passed',80,{metrics:{colorAb:{a:20,b:10}}}),P('cheek','passed',80,{metrics:{colorAb:{a:45,b:30}}})]; assert.equal(harmonyPenalty(inside,DEFAULT_TEMPLATE).penalty,0); assert.ok(harmonyPenalty(outside,DEFAULT_TEMPLATE).penalty<0); assert.equal(harmonyPenalty(outside,NO_HARM).applied,false); });
  test('V1 쉐딩 합산 제외', () => { const parts=[P('brow','passed',80),P('liner','passed',80),P('shadow','passed',80),P('lip','passed',80),P('cheek','passed',80),P(CONTOUR_ID,'passed',10)]; const s=computeSummary(parts,NO_HARM); assert.equal(s.total,80); assert.equal(s.measuredCount,5); assert.equal(s.partCount,5); });
  test('V2 쉐딩 upsert → 확인만', () => { const parts=upsertPart([],P(CONTOUR_ID,'passed',77)); assert.equal(parts[0].status,'check_only'); assert.equal(parts[0].score,null); });
  test('V3 진행 중 제외', () => { const s=computeSummary([P('brow','passed',90),P('liner','in_progress',null),P('shadow','not_started',null)],NO_HARM); assert.equal(s.total,90); assert.equal(s.measuredCount,1); });
  test('V4 쉐딩 좌우차는 대칭 보정 제외', () => { assert.equal(symmetryPenalty([P('brow','passed',90,{metrics:{lrDiffMm:0}}),P(CONTOUR_ID,'check_only',null,{lrIndex:{left:10,right:90}})]),0); });
  test('V5 한 줄 평', () => { assert.equal(oneLiner(P(CONTOUR_ID,'check_only',null,{lrIndex:{left:30,right:55}})),'확인하고 넘어가세요. 오른쪽이 조금 진해요'); assert.ok(oneLiner(P('shadow','check_only',null)).includes('재지 못했어요')); const t=oneLiner(P('liner','passed',82,{diagnosisCodes:['LINER_WING_HIGH_R']})); assert.ok(t.length>0&&!/\d/.test(t)); });
  test('V6 부위 순서 6개', () => { assert.equal(PART_IDS.length,6); assert.equal(PART_IDS[5],CONTOUR_ID); });
  test('C1 topMisses', () => { const recs=[mk(1,[P('liner','passed',70,{diagnosisCodes:['LINER_WING_HIGH_R','LINER_WING_HIGH_R']}),P('cheek','passed',60,{diagnosisCodes:['CHEEK_LR_DIFF']})]),mk(2,[P('liner','passed',72,{diagnosisCodes:['LINER_WING_HIGH_R']}),P('cheek','skipped',null,{diagnosisCodes:['CHEEK_LR_DIFF']})]),mk(3,[P('liner','check_only',null,{diagnosisCodes:['LINER_THICK']}),P('cheek','passed',65,{diagnosisCodes:['CHEEK_LR_DIFF']})]),mk(4,[P('liner','passed',80,{diagnosisCodes:['LINER_WING_HIGH_R']}),P('brow','passed',80,{diagnosisCodes:['BROW_TAIL_SHORT']})]),mk(5,[P('liner','passed',85,{diagnosisCodes:['LINER_WING_HIGH_R']}),P('brow','passed',80,{diagnosisCodes:['BROW_TAIL_SHORT']})])]; const t=topMisses(recs,5); assert.equal(t[0].code,'LINER_WING_HIGH_R'); assert.equal(t[0].count,4); assert.equal(t[1].code,'BROW_TAIL_SHORT'); assert.equal(t[1].count,2); });
  test('C2 추이 null·필터', () => { const recs=[mk(1,[P('brow','passed',60)]),mk(2,[P('brow','check_only',null)]),mk(3,[P('brow','passed',70)],'daily')]; const all=trendSeries(recs); assert.equal(all.length,3); assert.equal(all[1].y,null); assert.equal(trendSeries(recs,'daily').length,1); });
  test('C3 보관 상한', () => { const store=new HistoryStore(memoryAdapter(),3); [1,2,3].forEach((i)=>store.save(mk(i,[P('brow','passed',60)]))); const {removed}=store.save(mk(4,[P('brow','passed',60)])); assert.equal(store.list().length,3); assert.equal(removed[0].id,'r1'); });
  test('C4 삭제', () => { const store=new HistoryStore(memoryAdapter(),10); [1,2].forEach((i)=>store.save(mk(i,[P('brow','passed',60)]))); assert.equal(store.delete('r1').id,'r1'); store.clear(); assert.equal(store.list().length,0); });
  test('C5 JSON 왕복', () => { const rec=mk(1,[P('brow','passed',88,{metrics:{lrDiffMm:1}})]); const back=JSON.parse(JSON.stringify(rec)); assert.deepEqual(back.summary.total,rec.summary.total); assert.deepEqual(back.parts,rec.parts); });
  test('C6 조명 배지', () => { assert.equal(lightingDiffers({foreheadL:60},{foreheadL:70}),true); assert.equal(lightingDiffers({foreheadL:60},{foreheadL:65}),false); assert.equal(lightingDiffers(null,{foreheadL:65}),false); });
  test('C7 같은 id 덮어쓰기', () => { const store=new HistoryStore(memoryAdapter(),10); store.save(mk(1,[P('brow','passed',60)])); store.save(mk(1,[P('brow','passed',90)])); assert.equal(store.list().length,1); assert.equal(store.get('r1').summary.total,90); });

  const pass = results.filter((r) => r.ok).length;
  return results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.err}`).join('\n') + `\n\n${pass}/${results.length} passed`;
}
