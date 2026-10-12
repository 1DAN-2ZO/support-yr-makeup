/**
 * 피부색 분석용 색 계산 (스파이크 skin-tone-probe, 2026-10-09).
 *
 * - ΔE2000: 피부색끼리는 색상이 비슷하고 차이가 작아서(ΔE 1~5) CIE76(color.ts deltaE)이 채도 차이를 크게 잡는다.
 *   기존 연구 수치(ΔE76)와 견주려고 둘 다 쓴다. Sharma·Wu·Dalal(2005) 식 그대로.
 * - 색상각 h°, 채도 C*, ITA(개인 유형 각, Chardon 1991): 피부색 문헌에서 쓰는 지표.
 *   ITA = arctan((L*−50)/b*) × 180/π — b* 가 0 이하면 atan2 로 이어 간다.
 * 순수 함수. 기존 color.ts 는 건드리지 않는다.
 */

import { rgbToLab } from "./color";
import type { Lab } from "./color";

export type Rgb = [number, number, number];

const RAD = Math.PI / 180;
const POW25_7 = 25 ** 7;

const hueDeg = (b: number, a: number): number => {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / RAD;
  return h < 0 ? h + 360 : h;
};

/** CIEDE2000 색차 */
export function deltaE2000(p: Lab, q: Lab): number {
  const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1 = (1 + G) * p.a, a2 = (1 + G) * q.a;
  const C1p = Math.hypot(a1, p.b), C2p = Math.hypot(a2, q.b);
  const h1p = hueDeg(p.b, a1), h2p = hueDeg(q.b, a2);

  const dLp = q.L - p.L;
  const dCp = C2p - C1p;
  const zero = C1p * C2p === 0;
  let dhp = 0;
  if (!zero) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * RAD) / 2);

  const Lbp = (p.L + q.L) / 2, Cbp = (C1p + C2p) / 2;
  let hbp: number;
  if (zero) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

  const T =
    1 - 0.17 * Math.cos((hbp - 30) * RAD) + 0.24 * Math.cos(2 * hbp * RAD) +
    0.32 * Math.cos((3 * hbp + 6) * RAD) - 0.2 * Math.cos((4 * hbp - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Cbp7 = Cbp ** 7;
  const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc;

  const l = dLp / Sl, c = dCp / Sc, h = dHp / Sh;
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
}

export interface Lch {
  L: number;
  /** 채도 C* = √(a*²+b*²) */
  C: number;
  /** 색상각 h° (0~360). 0 = 붉은 쪽, 90 = 노란 쪽 */
  h: number;
}

export function labToLch(lab: Lab): Lch {
  return { L: lab.L, C: Math.hypot(lab.a, lab.b), h: hueDeg(lab.b, lab.a) };
}

/** 개인 유형 각 ITA°. 클수록 밝은 피부 */
export function ita(lab: Lab): number {
  return Math.atan2(lab.L - 50, lab.b) / RAD;
}

/** 한 색의 표시용 묶음 */
export interface ColorInfo {
  rgb: Rgb;
  lab: Lab;
  lch: Lch;
  ita: number;
}

export function describeRgb(rgb: Rgb): ColorInfo {
  const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { rgb, lab, lch: labToLch(lab), ita: ita(lab) };
}

export function rgbHex(rgb: Rgb): string {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
