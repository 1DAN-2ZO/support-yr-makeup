/**
 * 머리를 입체로 옮기기 — 화면 4 테두리, 고개를 많이 돌렸을 때 먼 쪽 눈 (2026-10-02 PC 시험, B안).
 *
 * 고개를 많이 돌리면 MediaPipe 가 먼 쪽 눈꺼풀 점을 빗나가게 잡는다(먼 쪽 눈머리가 코 쪽으로 삐져나옴). 그 점을 따르면 테두리도 빗나간다.
 * 눈 주변 점으로 평면 변환(A안)을 해 봤지만 안 맞았다 — 눈은 눈썹·콧대보다 안쪽(깊이)이라.
 * 그래서 잘 잡히는 얼굴 점(이마·콧대·광대)의 **입체 위치(x · y · 깊이 z)** 로 정면 머리 → 지금 머리의 회전·크기·이동을 맞추고
 * (Horn 사원수 방법), 정면에서 그린 눈 테두리를 깊이까지 같이 돌려 화면에 비춘다. MediaPipe 의 x · y 는 화면 좌표, z 는 깊이라 x · y 를 그대로 쓴다.
 * 이 변환은 눈꺼풀 움직임(감기·내리깔기)을 모르므로, 각도 차가 작을 땐 눈꺼풀 점을 쓰고 클수록 서서히 넘긴다 (farEyeWeight).
 */

import type { Pt } from "./types";

/** 머리를 맞추는 점 — 이마 · 콧대·코 · 이마 옆 · 광대. 눈꺼풀·홍채·입술·턱선(돌리면 윤곽이 됨)은 뺀다 */
export const HEAD_IDS: readonly number[] = [
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1,   // 이마 가운데 → 콧대 → 코끝
  109, 67, 103, 338, 297, 332,                 // 이마 옆
  50, 280, 205, 425, 116, 345,                 // 광대
];

type P3 = { x: number; y: number; z: number };

export interface HeadMove {
  s: number;
  /** 3×3 회전 (행 우선) */
  r: readonly number[];
  t: P3;
}

const z0 = (p: Pt): P3 => ({ x: p.x, y: p.y, z: p.z ?? 0 });

export function applyHead(m: HeadMove, p: Pt): P3 {
  const q = z0(p), r = m.r;
  return {
    x: m.t.x + m.s * (r[0]! * q.x + r[1]! * q.y + r[2]! * q.z),
    y: m.t.y + m.s * (r[3]! * q.x + r[4]! * q.y + r[5]! * q.z),
    z: m.t.z + m.s * (r[6]! * q.x + r[7]! * q.y + r[8]! * q.z),
  };
}

/** 대칭 4×4 의 가장 큰 고윳값의 고유벡터 (야코비 회전) */
function topEigenvector(n: number[][]): number[] {
  const a = n.map((row) => row.slice()), v: number[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j): number => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i]![j]! ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < 4; p++) {
      for (let q = p + 1; q < 4; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const th = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 4; k++) { const kp = a[k]![p]!, kq = a[k]![q]!; a[k]![p] = c * kp - s * kq; a[k]![q] = s * kp + c * kq; }
        for (let k = 0; k < 4; k++) { const pk = a[p]![k]!, qk = a[q]![k]!; a[p]![k] = c * pk - s * qk; a[q]![k] = s * pk + c * qk; }
        for (let k = 0; k < 4; k++) { const kp = v[k]![p]!, kq = v[k]![q]!; v[k]![p] = c * kp - s * kq; v[k]![q] = s * kp + c * kq; }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (a[i]![i]! > a[best]![best]!) best = i;
  return v.map((row) => row[best]!);
}

/** 점 짝(정면 src → 지금 dst)에 가장 잘 맞는 회전·크기·이동. 점이 모자라거나 한 줄 위에만 있으면 null */
export function fitHead(src: readonly Pt[], dst: readonly Pt[]): HeadMove | null {
  const n = Math.min(src.length, dst.length);
  if (n < 3) return null;
  const a = src.slice(0, n).map(z0), b = dst.slice(0, n).map(z0);
  const mean = (ps: P3[]): P3 => ({ x: ps.reduce((s, p) => s + p.x, 0) / n, y: ps.reduce((s, p) => s + p.y, 0) / n, z: ps.reduce((s, p) => s + p.z, 0) / n });
  const ma = mean(a), mb = mean(b);
  const ac = a.map((p) => ({ x: p.x - ma.x, y: p.y - ma.y, z: p.z - ma.z })), bc = b.map((p) => ({ x: p.x - mb.x, y: p.y - mb.y, z: p.z - mb.z }));
  // 한 줄 위 점이면 그 줄을 축으로 한 회전을 모른다 — 정면 점들의 퍼짐(공분산)이 두 방향 이상이어야
  let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
  for (const p of ac) { cxx += p.x * p.x; cyy += p.y * p.y; czz += p.z * p.z; cxy += p.x * p.y; cxz += p.x * p.z; cyz += p.y * p.z; }
  const tr = cxx + cyy + czz, minors = cxx * cyy - cxy * cxy + cxx * czz - cxz * cxz + cyy * czz - cyz * cyz;
  if (!(tr > 0) || minors < 1e-10 * tr * tr) return null;
  let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0;
  for (let i = 0; i < n; i++) {
    const p = ac[i]!, q = bc[i]!;
    sxx += p.x * q.x; sxy += p.x * q.y; sxz += p.x * q.z;
    syx += p.y * q.x; syy += p.y * q.y; syz += p.y * q.z;
    szx += p.z * q.x; szy += p.z * q.y; szz += p.z * q.z;
  }
  const [q0, qx, qy, qz] = topEigenvector([
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ]) as [number, number, number, number];
  const r = [
    q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy),
    2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx),
    2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz,
  ];
  let num = 0;
  for (let i = 0; i < n; i++) {
    const p = ac[i]!, q = bc[i]!;
    num += q.x * (r[0]! * p.x + r[1]! * p.y + r[2]! * p.z) + q.y * (r[3]! * p.x + r[4]! * p.y + r[5]! * p.z) + q.z * (r[6]! * p.x + r[7]! * p.y + r[8]! * p.z);
  }
  const s = num / tr;
  const rm = { x: r[0]! * ma.x + r[1]! * ma.y + r[2]! * ma.z, y: r[3]! * ma.x + r[4]! * ma.y + r[5]! * ma.z, z: r[6]! * ma.x + r[7]! * ma.y + r[8]! * ma.z };
  return { s, r, t: { x: mb.x - s * rm.x, y: mb.y - s * rm.y, z: mb.z - s * rm.z } };
}

/** 각도 차가 이만큼까지는 눈꺼풀 점, 이만큼부터는 입체로 돌린 자리만 (rigidPoseDiff 눈금 — 화면 4 각도 차 한계 12 와 같은 눈금). 가정값 */
export const FAR_EYE = { from: 12, to: 25 } as const;

/** 먼 쪽 눈을 입체로 돌린 자리로 넘기는 정도 0~1 */
export function farEyeWeight(absYawDiff: number): number {
  const t = (absYawDiff - FAR_EYE.from) / (FAR_EYE.to - FAR_EYE.from);
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
