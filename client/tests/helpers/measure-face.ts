// 측정용 가짜 얼굴 — 눈·홍채·눈썹·얼굴 윤곽을 치수로 배치한다 (face-measure·brow-standard 테스트가 같이 쓴다)
import { LM } from "@core/landmarks";
import type { Pt } from "@core/types";
import { LMS } from "./synth-face";

export interface EyeSpec {
  /** 눈 폭 px */
  w: number;
  /** 눈 축에서 윗눈꺼풀까지 가장 먼 거리 px */
  up: number;
  /** 눈 축에서 아랫눈꺼풀까지 가장 먼 거리 px */
  down: number;
  /** 바깥 눈꼬리가 올라간 각도(°). 음수면 처진 눈 */
  tilt: number;
  /** 윗눈꺼풀 꼭대기의 위치 (0 = 바깥 눈꼬리, 1 = 안쪽 눈꼬리). 바깥 쪽에 있을수록 눈꼬리가 덮여 보인다 */
  apex?: number;
}

/** 눈 하나를 배치한다. 점 순서는 LM 과 같다: 바깥 → 안쪽 */
export function placeEye(lm: Pt[], eye: typeof LM.eyeA | typeof LM.eyeB, cx: number, cy: number, s: EyeSpec, outerOnLeft: boolean): void {
  const dir = outerOnLeft ? -1 : 1;            // 바깥 눈꼬리 쪽
  const th = ((outerOnLeft ? 1 : -1) * s.tilt * Math.PI) / 180;
  const rot = (x: number, y: number): Pt => ({ x: cx + x * Math.cos(th) - y * Math.sin(th), y: cy + x * Math.sin(th) + y * Math.cos(th) });
  const apex = s.apex ?? 0.5;
  // 한쪽으로 치우친 봉우리: t 를 apex 기준으로 다시 펴서 sin 을 씌운다
  const bump = (t: number) => Math.sin(Math.PI * (t < apex ? (0.5 * t) / apex : 0.5 + (0.5 * (t - apex)) / (1 - apex)));
  const n = eye.upper.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);                     // 0 = 바깥, 1 = 안쪽
    const x = dir * (s.w / 2) * (1 - 2 * t);
    lm[eye.upper[i]!] = rot(x, -s.up * bump(t));
    lm[eye.lower[i]!] = rot(x, s.down * bump(t));
  }
}

/** 홍채: 가운데 + 둘레 네 점 (MediaPipe 순서: 469 오른쪽, 470 위, 471 왼쪽, 472 아래) */
export function placeIris(lm: Pt[], iris: readonly number[], cx: number, cy: number, d: number): void {
  const r = d / 2;
  lm[iris[0]!] = { x: cx, y: cy };
  lm[iris[1]!] = { x: cx + r, y: cy };
  lm[iris[2]!] = { x: cx, y: cy - r };
  lm[iris[3]!] = { x: cx - r, y: cy };
  lm[iris[4]!] = { x: cx, y: cy + r };
}

/** 눈썹: 중심선이 호 모양. rise = 가운데가 양 끝 직선보다 올라간 px */
export function placeBrow(lm: Pt[], brow: { readonly upper: readonly number[]; readonly lower: readonly number[] }, x0: number, x1: number, y: number, rise: number, thick: number): void {
  const n = brow.upper.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const cy = y - rise * Math.sin(Math.PI * t);
    lm[brow.upper[i]!] = { x: x0 + (x1 - x0) * t, y: cy - thick / 2 };
    lm[brow.lower[i]!] = { x: x0 + (x1 - x0) * t, y: cy + thick / 2 };
  }
}

export interface FaceSpec {
  eye?: Partial<EyeSpec>; iris?: number; faceW?: number; faceH?: number; browRise?: number;
  /** 입술: 윗입술 가운데 두께·아랫입술 두께·입 너비 px, peak = 큐피드 활 봉우리 → 입 가운데(구열점) 높이 px (없으면 upper + 1) */
  lip?: { upper: number; lower: number; width: number; peak?: number };
}

export function face(spec: FaceSpec = {}): Pt[] {
  const lm = LMS.map((p) => ({ ...p }));
  const eye: EyeSpec = { w: 90, up: 18, down: 12, tilt: 0, ...spec.eye };
  placeEye(lm, LM.eyeA, 215, 250, eye, true);   // 이미지 왼쪽 = 피험자 오른쪽(R)
  placeEye(lm, LM.eyeB, 385, 250, eye, false);
  placeIris(lm, LM.eyeA.iris, 215, 250, spec.iris ?? 20);
  placeIris(lm, LM.eyeB.iris, 385, 250, spec.iris ?? 20);
  const rise = spec.browRise ?? 0;
  placeBrow(lm, LM.browA, 160, 270, 205, rise, 12);
  placeBrow(lm, LM.browB, 440, 330, 205, rise, 12);
  const fw = spec.faceW ?? 400, fh = spec.faceH ?? 500;
  lm[LM.faceL] = { x: 300 - fw / 2, y: 300 };
  lm[LM.faceR] = { x: 300 + fw / 2, y: 300 };
  lm[LM.forehead] = { x: 300, y: 50 };
  lm[LM.chin] = { x: 300, y: 50 + fh };
  const lip = spec.lip ?? { upper: 7, lower: 10, width: 100 };
  lm[0] = { x: 300, y: 420 - lip.upper };            // 윗입술 바깥 가운데
  lm[13] = { x: 300, y: 420 };                       // 윗입술 안쪽 가운데
  lm[14] = { x: 300, y: 422 };                       // 아랫입술 안쪽 가운데
  lm[17] = { x: 300, y: 422 + lip.lower };           // 아랫입술 바깥 가운데
  const peak = lip.peak ?? lip.upper + 1;             // 구열점(입 가운데) y = 421
  lm[37] = { x: 285, y: 421 - peak };                // 큐피드 활 봉우리 (이미지 왼쪽)
  lm[267] = { x: 315, y: 421 - peak };               // 큐피드 활 봉우리 (이미지 오른쪽)
  lm[61] = { x: 300 - lip.width / 2, y: 421 };       // 입꼬리
  lm[291] = { x: 300 + lip.width / 2, y: 421 };
  lm[LM.alaA] = { x: 270, y: 370 };   // 콧방울 바깥 — 눈썹 꼬리 끝을 정하는 선의 출발점
  lm[LM.alaB] = { x: 330, y: 370 };
  return lm;
}

/** 얼굴 전체를 (300, 300) 을 중심으로 deg 만큼 돌린다. 화면에서 시계 방향이 + */
export const tiltHead = (lm: readonly Pt[], deg: number): Pt[] => {
  const t = (deg * Math.PI) / 180;
  return lm.map((p) => ({ x: 300 + (p.x - 300) * Math.cos(t) - (p.y - 300) * Math.sin(t), y: 300 + (p.x - 300) * Math.sin(t) + (p.y - 300) * Math.cos(t) }));
};
