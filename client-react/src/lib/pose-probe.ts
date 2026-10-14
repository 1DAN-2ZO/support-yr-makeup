/**
 * [개발용 · #28] 화면 4 `?pose` — 입을 벌릴 때 "기준 각도 차" 가 흔들리는 원인 가르기.
 *
 * 후보마다 위아래 각도의 대리값을 잰다: 코끝(4) · 콧대 위(6) · 코 중간(195) · 이마(10) — 전부 양 눈꼬리 선 기준 수직 거리 ÷ 눈꼬리 거리,
 * 그리고 MediaPipe 얼굴 변환 행렬의 pitch(얼굴 전체 그물을 3D 모델에 맞춘 값).
 *  1) 입 다물고(jawOpen < 0.1) 끄덕이면: 옛 방식(poseOf, 턱 사용)과 짝을 모아 후보마다 계수 k 를 따로 맞춘다 → 같은 눈금
 *  2) 입 벌리면(jawOpen > 0.4): 직전(입 다문 마지막 프레임) 대비 흔들림을 그 눈금(도)으로 — 최대 · 중앙값
 * 모든 후보가 비슷하면 실제로 고개가 움직인 것, 입과 먼 후보만 작으면 점이 입에 끌려간 것.
 * 기준은 이 측정을 시작(탭)한 첫 프레임 — 맨얼굴 사진이 아니라서 앉은 자세 차이가 안 섞인다.
 */

import { poseOf, slopeFit } from "@core/gate";
import { LM, at } from "@core/landmarks";
import type { Pt } from "@core/types";

type Cand = { name: string; get: (lm: readonly Pt[], mat: readonly number[] | null) => number | null };

const vOffset = (idx: number) => (lm: readonly Pt[]): number => {
  const a = at(lm, LM.eyeA.outer), b = at(lm, LM.eyeB.outer), p = at(lm, idx);
  const D = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / D, y: (b.y - a.y) / D };
  const d = { x: p.x - (a.x + b.x) / 2, y: p.y - (a.y + b.y) / 2 };
  return ((d.x * -u.y + d.y * u.x) / D) * (180 / Math.PI);
};

/** 열 우선 4×4 (#124: 열 우선이 랜드마크와 부호가 맞음). 도 */
const matPitch = (m: readonly number[] | null): number | null => {
  if (!m || m.length < 16) return null;
  const C = (r: number, c: number): number => m[c * 4 + r] ?? 0;
  return Math.atan2(C(2, 1), C(2, 2)) * (180 / Math.PI);
};

const CANDS: Cand[] = [
  { name: "코끝4", get: vOffset(4) },
  { name: "콧대6", get: vOffset(6) },
  { name: "코중간195", get: vOffset(195) },
  { name: "이마10", get: vOffset(10) },
  { name: "행렬", get: (_lm, mat) => matPitch(mat) },
];

const median = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

export function createPoseProbe(): { step(lm: readonly Pt[], mat: readonly number[] | null, jaw: number): string; reset(): void } {
  let ref: { old: number; c: (number | null)[] } | null = null;
  let pairs: [number, number][][] = CANDS.map(() => []);
  let closed: { old: number; c: (number | null)[] } | null = null;
  let open: { old: number[]; c: number[][] } = { old: [], c: CANDS.map(() => []) };

  const reset = (): void => {
    ref = null; closed = null;
    pairs = CANDS.map(() => []);
    open = { old: [], c: CANDS.map(() => []) };
  };

  return {
    reset,
    step(lm, mat, jaw) {
      const old = poseOf(lm).pitch;
      const c = CANDS.map((k) => k.get(lm, mat));
      if (!ref) ref = { old, c };
      const ks = CANDS.map((_, i) => slopeFit(pairs[i]!));
      if (jaw < 0.1) {
        const dOld = old - ref.old;
        if (Math.abs(dOld) > 2) c.forEach((v, i) => { const r = ref!.c[i]; if (v !== null && r !== null && r !== undefined) pairs[i]!.push([dOld, v - r]); });
        closed = { old, c };
      } else if (jaw > 0.4 && closed) {
        open.old.push(Math.abs(old - closed.old));
        c.forEach((v, i) => {
          const was = closed!.c[i], k = ks[i];
          if (v !== null && was !== null && was !== undefined && k) open.c[i]!.push(Math.abs((v - was) / k));
        });
      }
      const rows = CANDS.map((k, i) => {
        const kk = ks[i], o = open.c[i]!;
        return `${k.name.padEnd(6)} k ${kk == null ? "  -  " : Math.abs(kk).toFixed(2)}(${pairs[i]!.length}) 입벌림 최대 ${o.length ? Math.max(...o).toFixed(1) : "-"}° · 중앙 ${o.length ? median(o).toFixed(1) : "-"}°`;
      });
      const oo = open.old;
      return [
        `옛 방식(턱)  입벌림 최대 ${oo.length ? Math.max(...oo).toFixed(1) : "-"}° · 중앙 ${oo.length ? median(oo).toFixed(1) : "-"}° (${oo.length}프레임)`,
        ...rows,
        `입: ${jaw.toFixed(2)}  ← 0.1 아래면 보정 중, 0.4 위면 입벌림 측정`,
      ].join("\n");
    },
  };
}
