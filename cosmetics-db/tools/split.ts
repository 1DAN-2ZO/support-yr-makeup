/**
 * 계열 경계를 데이터에서 찾아본다 — 손으로 그은 금 대신.
 *
 * 쓰는 도구는 팀장이 #436 에서 만든 skin-threshold (웜/쿨 기준 T 찾기).
 * 하는 일이 같다: 숫자 축 하나 위에서 두 집단이 갈리는지(AUC), 어디에 금을 그을지(T),
 * 금 둘레를 "애매" 로 빼면 어떻게 되는지(margin).
 *
 * **정답 라벨은 사람이 안 붙인다** — 브랜드가 호수 이름에 이미 붙여 놓았다.
 * "크림 베이지" 는 베이지, "바닐라 로즈" 는 로즈.
 */
import { auc, fitThreshold, evaluate, AXES, type AxisId, type Item }
  from "/Users/jeonjiwon/Desktop/support-yr-makeup/client/src/core/skin-threshold";
import { rgbToLab } from "/Users/jeonjiwon/Desktop/support-yr-makeup/client/src/core/color";
import { readFileSync } from "node:fs";

const rows = JSON.parse(readFileSync("/tmp/hexes.json","utf8")) as
  {code:string;name:string;hex:string;part:string}[];
const rgb = (h:string): [number,number,number] =>
  [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];

// 호수 이름에 들어 있는 계열 말
const WORDS = ["베이지","브라운","로즈","핑크","모브","피치","코랄","카라멜"];
const labelOf = (n:string) => WORDS.filter(w => n.includes(w));

console.log(`호수 ${rows.length}개\n`);
for (const want of WORDS) {
  const items: Item[] = [];
  for (const r of rows) {
    const ls = labelOf(r.name);
    if (!ls.length) continue;
    items.push({ v: 0, warm: ls.includes(want) });  // v 는 축마다 다시 채운다
  }
  const yes = items.filter(i=>i.warm).length;
  if (yes < 4 || items.length - yes < 4) continue;   // 한쪽이 너무 적으면 못 잼
  console.log(`■ "${want}" ${yes}개  vs  나머지 ${items.length-yes}개`);
  const scored: {ax:AxisId;a:number;t:number;acc:number}[] = [];
  for (const ax of Object.keys(AXES) as AxisId[]) {
    const got = rows.filter(r=>labelOf(r.name).length).map((r,i) => {
      const [R,G,B] = rgb(r.hex);
      return { v: AXES[ax].of(rgbToLab(R,G,B)), warm: items[i]!.warm };
    });
    const a = auc(got); const f = fitThreshold(got);
    if (a === null || !f) continue;
    scored.push({ ax, a, t: f.threshold, acc: f.balAcc });
  }
  scored.sort((p,q)=>Math.abs(q.a-0.5)-Math.abs(p.a-0.5));
  for (const s of scored.slice(0,3)) {
    const got = rows.filter(r=>labelOf(r.name).length).map((r,i) => {
      const [R,G,B] = rgb(r.hex);
      return { v: AXES[s.ax].of(rgbToLab(R,G,B)), warm: items[i]!.warm };
    });
    const f = fitThreshold(got)!;
    const e0 = evaluate(got, f.threshold, f.dir, 0);
    const em = evaluate(got, f.threshold, f.dir, 5);
    console.log(`   ${AXES[s.ax].label.padEnd(14)} AUC ${s.a.toFixed(2)}  금 ${s.t.toFixed(1).padStart(6)}  정확도 ${(e0.balAcc*100).toFixed(0)}%  →  애매±5 빼면 ${(em.balAcc*100).toFixed(0)}%`);
  }
  console.log();
}
