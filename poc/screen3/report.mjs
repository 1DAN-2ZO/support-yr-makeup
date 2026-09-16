// 샘플 20장 × 부위 6개 실측 — node report.mjs
import { readFileSync } from 'node:fs';
import { cropSpec } from './core.js';
import { PART_IDS, PART_NAME, PORTRAIT_ZOOM, SIDE_MARGIN } from './rules.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const rows = [];
for (const [name, { size, landmarks }] of Object.entries(fx)) {
  for (const id of PART_IDS) {
    const c = cropSpec(landmarks, size, id);
    rows.push({ name, id, zoom: c.zoomRatio, covered: c.covered, clamped: c.clamped, sides: c.clampedSides.join(','), w: Math.round(c.w), h: Math.round(c.h) });
  }
}

console.log(`샘플 ${Object.keys(fx).length}장 × 부위 ${PART_IDS.length}개 = ${rows.length} 케이스`);
console.log(`가정값: 가로 여백 ${SIDE_MARGIN * 100}%, 세로 확대 ${PORTRAIT_ZOOM}배\n`);
console.log('부위\t확대율(최소/중앙/최대)\tcovered\tclamped');
for (const id of PART_IDS) {
  const r = rows.filter((x) => x.id === id);
  const z = r.map((x) => x.zoom).sort((a, b) => a - b);
  const med = z[Math.floor(z.length / 2)];
  const cov = r.filter((x) => x.covered).length, cla = r.filter((x) => x.clamped).length;
  console.log(`${PART_NAME[id]}\t${z[0].toFixed(2)} / ${med.toFixed(2)} / ${z[z.length - 1].toFixed(2)}\t${cov}/${r.length}\t${cla}/${r.length}`);
}

const bad = rows.filter((x) => !x.covered || x.clamped);
if (bad.length) {
  console.log(`\n문제 케이스 ${bad.length}건:`);
  for (const b of bad) console.log(`  ${b.name} ${PART_NAME[b.id]} zoom=${b.zoom.toFixed(2)} covered=${b.covered} clamped=${b.clamped} sides=${b.sides}`);
  console.log('\n→ README 의 실측 결과에 이 표와, 어떤 여백·배수 값이면 0건이 되는지 제안을 적는다.');
} else {
  console.log('\n문제 케이스 0건. 문서의 가정값이 이 샘플에서 성립한다.');
}
