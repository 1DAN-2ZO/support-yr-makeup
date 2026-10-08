/**
 * 데모용 참고 사진 분석 결과 (2026-10-06).
 *
 * 참고 사진 업로드가 아직 진짜가 아니라, 화면을 눈으로 확인하려고 둔 값이다.
 * 지어낸 숫자가 아니라 **전지원이 준 참고 사진 한 장을 실제로 분석해서 나온 값**이다
 * (client/src/core/ref-colors.ts 의 규칙 그대로, 780x764 사진).
 *
 * 업로드가 붙으면 이 파일은 지운다.
 */

import type { PalettePart } from "@core/color-family";
import { describeColor } from "@core/color-name";
import type { RefColors } from "@core/ref-colors";
import { hexToRgb } from "@core/color-family";

/** 사진에서 뽑힌 색 (hex) 과 그때 쓴 픽셀 수 */
const MEASURED: Record<PalettePart, { hex: string; n: number }> = {
  brow: { hex: "#786259", n: 1870 },
  liner: { hex: "#1a130f", n: 430 },
  shadow: { hex: "#a88271", n: 2240 },
  lip: { hex: "#966861", n: 5120 },
  cheek: { hex: "#d4a28d", n: 7360 },
};

export const DEMO_REF_COLORS: RefColors = Object.fromEntries(
  Object.entries(MEASURED).map(([part, { hex, n }]) => {
    const rgb = hexToRgb(hex);
    const name = describeColor(rgb, part as PalettePart);
    // 더미라 보이는 색과 제품용 색이 같다 (진짜 사진이면 보정이 들어간다)
    return [part, { hex, rgb, name, product: { hex, rgb, name }, n }];
  }),
) as RefColors;
