// node lib/regions.test.js로 직접 실행. DOM 불필요(순수 배열 연산).
import { buildRegions, REGION_KEYS, TRACKED_IDX } from "./regions.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

// 478개 더미 랜드마크(격자 배치) — 실제 얼굴 형태는 아니지만 인덱스별로 다른 좌표를 가져
// centroid/lerp 계산이 항등으로 뭉개지지 않는지 확인하기엔 충분하다.
const lm = Array.from({ length: 478 }, (_, i) => ({ x: (i % 30) / 30, y: Math.floor(i / 30) / 16, z: 0 }));

console.log("1) 7개 부위 폴리곤 전부 생성됨");
{
  const regions = buildRegions(lm, 640, 480);
  for (const k of REGION_KEYS) assert(Array.isArray(regions[k]) && regions[k].length > 0, `${k} 폴리곤 점 있음 (${regions[k]?.length}개)`);
}

console.log("2) eyeR/eyeL은 눈꺼풀(9점) + 눈썹 방향 대응점(9점) = 18점(섀도우 밴드)");
{
  const regions = buildRegions(lm, 640, 480);
  assert(regions.eyeR.length === 18, `eyeR 18점 (실제=${regions.eyeR.length})`);
  assert(regions.eyeL.length === 18, `eyeL 18점 (실제=${regions.eyeL.length})`);
}

console.log("3) TRACKED_IDX는 실제 쓰이는 인덱스만 중복 없이 포함");
{
  const set = new Set(TRACKED_IDX);
  assert(set.size === TRACKED_IDX.length, "중복 없음");
  assert(TRACKED_IDX.length > 0 && TRACKED_IDX.length < 478, `478개 미만 (실제=${TRACKED_IDX.length})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
