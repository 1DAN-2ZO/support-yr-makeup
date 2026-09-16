// 샘플 20장 × 부위 6개 실측 — node report.mjs
import { readFileSync } from 'node:fs';
import { cropSpec, partLandmarks, boundsOf, IDX } from './core.js';
import { PART_IDS, PART_NAME, PORTRAIT_ZOOM, SIDE_MARGIN, ORIENTATION, ASPECT } from './rules.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const EXPECTED_SAMPLES = 20;
const names = Object.keys(fx);
console.log(`fixtures.json: ${names.length}장 (기대 ${EXPECTED_SAMPLES}장)${names.length !== EXPECTED_SAMPLES ? '  ⚠ 불일치' : ''}`);

const rows = [];
for (const [name, { size, landmarks }] of Object.entries(fx)) {
  for (const id of PART_IDS) {
    const c = cropSpec(landmarks, size, id);
    const bbox = boundsOf(partLandmarks(landmarks, size, id));
    rows.push({
      name, id, size, zoom: c.zoomRatio, covered: c.covered, clamped: c.clamped,
      sides: c.clampedSides, w: Math.round(c.w), h: Math.round(c.h),
      bboxArea: bbox.w * bbox.h, cropArea: c.w * c.h,
    });
  }
}

console.log(`샘플 ${names.length}장 × 부위 ${PART_IDS.length}개 = ${rows.length} 케이스`);
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
  for (const b of bad) console.log(`  ${b.name} ${PART_NAME[b.id]} zoom=${b.zoom.toFixed(2)} covered=${b.covered} clamped=${b.clamped} sides=${b.sides.join(',')}`);
  console.log('\n→ README 의 실측 결과에 이 표와, 어떤 여백·배수 값이면 0건이 되는지 제안을 적는다.');
} else {
  console.log('\n문제 케이스 0건. 문서의 가정값이 이 샘플에서 성립한다.');
}

// ---------------------------------------------------------------------------
// covered/clamped 는 이 알고리즘에서 반증되기 어려운 지표다.
// - covered: cropSpec 이 "부위가 박스보다 크면 담을 수 있을 만큼 박스를 키운다"(core.js
//   `if (b.w > w) …` / `if (b.h > h) …`) 다음에 중심을 맞추므로, 축소(clamped)가 없는 한
//   기준 랜드마크는 항상 박스 안에 들어간다 — 알고리즘의 항등식이지 측정값이 아니다.
// - 세로 부위 clamped=0 도 산술적으로 당연하다: h = (imgW/zoom)/aspect 는 랜드마크와
//   무관하고, h ≤ imgH 이기만 하면 축소가 없다.
// 그래서 "얼마나 아슬아슬한가"는 covered/clamped 가 아니라, 닫힌 식으로 구한
// 축소 임계값과 현재값의 비율(여유 배수)로만 알 수 있다. 아래는 그 실측이다.
console.log('\n## 축소 임계값 — covered/clamped 가 말하지 못하는 여유');
console.log('가로 부위: h = b.w*(1+2m)/aspect 가 imgH 를 넘으면 축소된다. 임계 m = (imgH*aspect/b.w - 1)/2.');
console.log('세로 부위: h = (imgW/zoom)/aspect 가 imgH 를 넘으면 축소된다. 임계 zoom = imgW/(imgH*aspect).');
console.log('부위\t현재값\t축소 임계값(가장 빠듯한 샘플)\t여유 배수');
for (const id of PART_IDS) {
  const orientation = ORIENTATION[id];
  const aspect = ASPECT[orientation];
  const r = rows.filter((x) => x.id === id);
  if (orientation === 'landscape') {
    const thresholds = r.map((x) => (x.size.h * aspect / boundsOf(partLandmarks(fx[x.name].landmarks, x.size, id)).w - 1) / 2);
    const worst = Math.min(...thresholds); // 가장 작은 임계 여백 = 가장 빠듯한 사람
    const headroom = worst / SIDE_MARGIN;
    console.log(`${PART_NAME[id]}\t여백 ${(SIDE_MARGIN * 100).toFixed(0)}%\t여백 ${(worst * 100).toFixed(1)}%\t${headroom.toFixed(2)}배`);
  } else {
    const thresholds = r.map((x) => x.size.w / (x.size.h * aspect));
    const worst = Math.max(...thresholds); // 가장 큰 임계 zoom = 가장 빠듯한 사람(여유가 가장 작음)
    const headroom = PORTRAIT_ZOOM / worst;
    console.log(`${PART_NAME[id]}\tzoom ${PORTRAIT_ZOOM}\tzoom ${worst.toFixed(3)}\t${headroom.toFixed(2)}배`);
  }
}

// clampedSides 가 비어 있지 않은 케이스 수 — 박스가 이동(translate)된 횟수.
// clamped(축소)와 달리 "이동만으로 해결됐다"는 것도 지금까지 어디에도 집계되지 않았다.
console.log('\n## clampedSides 가 비어 있지 않은 케이스 수 (박스가 이동된 횟수, 축소 여부와 무관)');
console.log('부위\t이동된 케이스\t비율');
for (const id of PART_IDS) {
  const r = rows.filter((x) => x.id === id);
  const moved = r.filter((x) => x.sides.length > 0).length;
  console.log(`${PART_NAME[id]}\t${moved}/${r.length}\t${((moved / r.length) * 100).toFixed(0)}%`);
}

// 부위 bbox 면적 ÷ 크롭 박스 면적의 중앙값 — "확대"가 아니라 "비율 맞추기"에 가까운
// 부위가 있는지 (예: 입술은 3% 수준 — 크롭 박스 대부분이 입술이 아니라 주변 얼굴이다).
console.log('\n## 부위 bbox 면적 ÷ 크롭 박스 면적 (중앙값) — covered/clamped 가 재지 못하는 "쓸모"');
console.log('부위\t면적비 중앙값');
for (const id of PART_IDS) {
  const r = rows.filter((x) => x.id === id);
  const ratios = r.map((x) => x.bboxArea / x.cropArea).sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  console.log(`${PART_NAME[id]}\t${(med * 100).toFixed(1)}%`);
}

// B-3: 얼굴 폭 비율 (README 수치의 재현 가능한 출처)
console.log('\n## 얼굴 폭 비율 (|faceEdge.l - faceEdge.r| ÷ 이미지 폭)');
const faceWidthRatios = Object.entries(fx).map(([name, { size, landmarks }]) => {
  const [r, l] = [landmarks[IDX.faceEdge.r], landmarks[IDX.faceEdge.l]];
  return Math.abs((l.x - r.x) * size.w) / size.w;
}).sort((a, b) => a - b);
const fwMed = faceWidthRatios[Math.floor(faceWidthRatios.length / 2)];
const fwAvg = faceWidthRatios.reduce((a, b) => a + b, 0) / faceWidthRatios.length;
console.log(`평균 ${(fwAvg * 100).toFixed(1)}% (최소 ${(faceWidthRatios[0] * 100).toFixed(1)}% / 중앙 ${(fwMed * 100).toFixed(1)}% / 최대 ${(faceWidthRatios[faceWidthRatios.length - 1] * 100).toFixed(1)}%)`);
