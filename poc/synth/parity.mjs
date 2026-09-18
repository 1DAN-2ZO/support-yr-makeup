// core.js의 결과를 JSON으로 덤프한다. parity.py가 이걸 받아 core.py와 비교한다.
// 실행: node parity.mjs  (parity.py가 자동으로 부르므로 직접 실행할 일은 드물다)

import { randomParams, buildSample, sampleStats } from './core.js';
import { makeFixture } from './fixture.mjs';

const LM = makeFixture();
const SEEDS = Number(process.argv[2] || 50);

const out = [];
for (let seed = 0; seed < SEEDS; seed++) {
  const params = randomParams(seed);
  const sample = buildSample(LM, params);
  out.push({
    seed,
    params,
    areas: sampleStats(sample),
    parts: sample.parts.map((p) => ({
      id: p.id,
      label: p.label,
      color: p.color,
      alpha: p.alpha,
      // 폴리곤 전체를 비교하면 출력이 너무 크므로 개수와 양 끝점만 본다
      polys: p.polys.map((poly) => ({
        n: poly.length,
        first: [poly[0].x, poly[0].y],
        last: [poly[poly.length - 1].x, poly[poly.length - 1].y],
      })),
    })),
  });
}

console.log(JSON.stringify({ seeds: SEEDS, samples: out }));
