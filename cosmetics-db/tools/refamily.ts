/** 색이 있는 호수의 계열을 색으로 다시 매긴다 — 추측보다 규칙이 낫다 */
import { describeColor } from "../../nudy-react/src/core/color-name";
import { hexToRgb } from "../../nudy-react/src/core/color-family";
import type { PalettePart } from "../../nudy-react/src/core/color-family";
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("/tmp/sh.json", "utf8")) as
  { id: number; code: string; name: string; family: string; hex: string; part: PalettePart }[];
console.log(`${"호수".padEnd(16)} ${"지금".padEnd(10)} ${"색으로".padEnd(10)} 판정`);
for (const r of rows) {
  const got = describeColor(hexToRgb(r.hex), r.part);
  const same = got.base === r.family;
  console.log(`${(r.code+" "+r.name).padEnd(16)} ${r.family.padEnd(10)} ${got.base.padEnd(10)} ${same ? "같음" : "← 다름"}  ${r.hex}`);
}
