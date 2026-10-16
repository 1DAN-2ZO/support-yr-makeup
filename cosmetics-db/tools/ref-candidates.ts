/**
 * 기준색이 없는 계열의 후보를 찾는다.
 *
 * 지어내지 않는다 — color-name.ts 의 `describeColor` 에 **실제로 넣어 보고**
 * 그 계열 이름이 나오는 색만 고른다. 그래야 "이름은 지어지는데 기준색이 없다" 는
 * 지금 문제가 되풀이되지 않는다.
 *
 * 고르는 기준: 그 부위에 이미 있는 기준색들의 밝기·채도 한가운데에 가장 가까운 것.
 * 혼자 너무 밝거나 쨍하면 이웃 계열과의 거리가 들쭉날쭉해진다.
 */
import { describeColor, toLch } from "../../nudy-react/src/core/color-name";
import type { PalettePart } from "../../nudy-react/src/core/color-family";
import { PALETTE, COLOR_FAMILY, hexToRgb, rgbToHex } from "../../nudy-react/src/core/color-family";

const PARTS: PalettePart[] = ["brow", "liner", "shadow", "lip", "cheek"];
const want: Record<string, string[]> = JSON.parse(process.argv[2]!);

for (const part of PARTS) {
  const miss = want[part] ?? [];
  if (!miss.length) continue;
  // 그 부위에 이미 있는 색들의 밝기·채도 한가운데
  const have = PALETTE[part].map((h) => toLch(hexToRgb(h)));
  const midL = have.map((v) => v.L).sort((a, b) => a - b)[have.length >> 1]!;
  const midC = have.map((v) => v.C).sort((a, b) => a - b)[have.length >> 1]!;

  console.log(`\n■ ${part}  (이미 있는 색 밝기 ${midL.toFixed(0)} · 채도 ${midC.toFixed(0)})`);
  for (const fam of miss) {
    let best: { hex: string; d: number; L: number; C: number; h: number } | null = null;
    for (let r = 0; r < 256; r += 3) for (let g = 0; g < 256; g += 3) for (let b = 0; b < 256; b += 3) {
      const rgb: [number, number, number] = [r, g, b];
      if (describeColor(rgb, part).base !== fam) continue;
      const { L, C, h } = toLch(rgb);
      const d = Math.abs(L - midL) + Math.abs(C - midC);   // 한가운데에서 먼 정도
      if (!best || d < best.d) best = { hex: rgbToHex(r, g, b), d, L, C, h };
    }
    if (!best) { console.log(`   ${fam.padEnd(8)} 못 찾음 — 그 이름이 나오는 색이 없다`); continue; }
    console.log(`   ${fam.padEnd(8)} ${best.hex}   밝기 ${best.L.toFixed(0)} 채도 ${best.C.toFixed(0)} 색상각 ${best.h.toFixed(0)}`);
  }
}
