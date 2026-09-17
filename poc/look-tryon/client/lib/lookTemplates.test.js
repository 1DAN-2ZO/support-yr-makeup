// node lib/lookTemplates.test.js 로 직접 실행.
import { LOOK_TEMPLATES } from "./lookTemplates.js";
import { REGION_KEYS } from "./regions.js";

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.error("  FAIL - " + msg); }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_BLEND = new Set(["multiply", "overlay", "multiply+overlay"]);
const sortedRegionKeys = [...REGION_KEYS].sort();

for (const t of LOOK_TEMPLATES) {
  console.log(`템플릿 "${t.id}"`);
  const keys = Object.keys(t.regions).sort();
  assert(JSON.stringify(keys) === JSON.stringify(sortedRegionKeys), "부위 키 7개 전부 REGION_KEYS와 일치");
  for (const k of REGION_KEYS) {
    const layer = t.regions[k];
    assert(!!layer, `${k} 정의됨`);
    if (!layer) continue;
    assert(HEX_RE.test(layer.color), `${k} color 형식 #rrggbb (실제=${layer.color})`);
    assert(layer.opacity > 0 && layer.opacity <= 1, `${k} opacity 0<x<=1 (실제=${layer.opacity})`);
    assert(VALID_BLEND.has(layer.blend), `${k} blend 값 유효 (실제=${layer.blend})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
