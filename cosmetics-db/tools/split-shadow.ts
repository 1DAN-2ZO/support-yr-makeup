/**
 * 섀도우 계열을 다시 나눈 뒤, **그 경계가 어느 축에서 그어진 것인지** 되짚어 본다.
 *
 * split.ts 와 같은 도구를 쓴다 — 팀의 core/skin-threshold (AUC·금·애매 구간).
 * 다른 점은 정답 라벨이다. split.ts 는 호수 이름의 낱말("크림 베이지" → 베이지)을 썼는데,
 * 섀도우는 호수 이름이 "봄업스토어" 처럼 색과 상관없어서 낱말이 안 통한다.
 * 그래서 라벨은 **Lab 공간에서 색이 몰린 자리(군집)** 로 둔다 — 색이 이름을 정하게 한 것이다.
 *
 * 읽는 파일: 인자로 받은 JSON — [{ hex, family }]. trust='ok' 칸만 넣는다
 * (글리터가 섞인 doubt 칸은 밝은 쪽으로 끌려 금을 흐린다).
 *
 * 쓰는 법 (client 폴더에서):
 *   npx tsx /Users/jeonjiwon/Desktop/nudy-db/tools/split-shadow.ts <그 JSON 경로>
 */
import { auc, fitThreshold, evaluate, AXES, type AxisId, type Item }
  from "/Users/jeonjiwon/Desktop/support-yr-makeup/client/src/core/skin-threshold";
import { rgbToLab } from "/Users/jeonjiwon/Desktop/support-yr-makeup/client/src/core/color";
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("JSON 경로를 인자로 주세요"); process.exit(1); }
const rows = JSON.parse(readFileSync(path, "utf8")) as { hex: string; family: string }[];
const rgb = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const labs = rows.map((r) => rgbToLab(...rgb(r.hex)));

console.log(`칸 ${rows.length}개 · 계열 ${new Set(rows.map((r) => r.family)).size}개\n`);
for (const want of [...new Set(rows.map((r) => r.family))]) {
  const yes = rows.filter((r) => r.family === want).length;
  if (yes < 3) continue;
  console.log(`■ "${want}" ${yes}개  vs  나머지 ${rows.length - yes}개`);
  const scored: { ax: AxisId; a: number }[] = [];
  const itemsOn = (ax: AxisId): Item[] =>
    rows.map((r, i) => ({ v: AXES[ax].of(labs[i]!), warm: r.family === want }));
  for (const ax of Object.keys(AXES) as AxisId[]) {
    const a = auc(itemsOn(ax));
    if (a !== null) scored.push({ ax, a });
  }
  scored.sort((p, q) => Math.abs(q.a - 0.5) - Math.abs(p.a - 0.5));
  for (const s of scored.slice(0, 3)) {
    const items = itemsOn(s.ax);
    const f = fitThreshold(items)!;
    const e0 = evaluate(items, f.threshold, f.dir, 0);
    const em = evaluate(items, f.threshold, f.dir, 3);
    console.log(
      `   ${AXES[s.ax].label.padEnd(14)} AUC ${s.a.toFixed(2)}  금 ${f.threshold.toFixed(1).padStart(6)}` +
      `  ${f.dir > 0 ? "넘으면" : "밑이면"} 이 계열  정확도 ${((e0.balAcc ?? 0) * 100).toFixed(0)}%` +
      `  →  애매±3 빼면 ${((em.balAcc ?? 0) * 100).toFixed(0)}% (남는 칸 ${(em.coverage * 100).toFixed(0)}%)`,
    );
  }
  console.log();
}
