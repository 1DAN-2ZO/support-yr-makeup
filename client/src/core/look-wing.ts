/**
 * 룩 옮기기 (실험) — 아이라인 꼬리 찾기. look-guide.ts 가 눈마다 부른다.
 *
 * 꼬리는 "양쪽보다 어두운 가는 선" 이다. 세 단계로 찾는다:
 *   ① 능선 그림  흐리기 전의 밝기 차이(MakeupLayer.rawDL)에서, 칸마다 "선을 가로지르는 양쪽보다 얼마나 더 어두워졌나" 를 잰다.
 *                넓게 번진 섀도는 0 에 가깝고(한쪽이 같이 어둡다) 선만 남는다 — 섀도 안에 그은 꼬리도, 둘레가 밝아진 곳에 그은 꼬리도 남는다.
 *   ② 선 찾기    눈꼬리 점 둘레의 자리마다 · 방향마다 곧은 선을 그어 보고, 그 위 "능선 세기 − 기준" 의 합이 큰 선을 후보로 뽑는다.
 *                후보마다 길이 · 맨살 위 길이 · 세기 · 굵기 · 시작 자리 · 옆에 나란히 지나가는 선(속눈썹 가닥)의 수를 잰다.
 *   ③ 판정       가장 센 후보가 꼬리인지를 잰 값으로 가른다 (로지스틱 회귀 — WING_MODEL).
 *
 * 판정은 눈으로 표시한 정답에 맞춘 것이다 (2026-10-07). 자료 · 정확도 · 한계는 WING_MODEL 의 주석에 적었다.
 * 기준을 다시 맞출 때: 후보는 scanWing, 넣는 값은 WING_X, 판정은 judgeWing — 맞추는 스크립트는 저장소에 없다 (PR 설명 참고).
 *
 * 순수 함수 — Node 에서도 돈다.
 */

import type { Pt } from "./types";

export type Reader = (x: number, y: number) => number;

/** 한쪽 눈에서 꼬리를 찾는 데 쓰는 것. 길이는 px, 그림은 사진 좌표에서 읽는 함수 */
export interface WingInput {
  /** 흐리기 전의 어두워진 정도 (부호 있음: + 가 어두워짐, − 는 밝아짐) */
  raw: Reader;
  /** 그 자리의 값을 믿을 수 있는 정도 (0 ~ 1) — 눈 영역 밖 · 눈 뜬 틈 · 머리카락이 덮은 곳은 0 */
  weight: Reader;
  /** 맨얼굴 밝기(L) — 떼어 낸 칸 밖은 0 */
  bareL: Reader;
  outer: Pt;
  /** 안쪽 → 눈꼬리 */
  ax: Pt;
  /** 눈썹 쪽 */
  up: Pt;
  /** 눈 폭 */
  u: number;
  /** 재는 간격(px) */
  step: number;
  /** 화장 사진을 직접 포갠 것에서 볼 때 — 사람이 달라 속눈썹 끝이 "선" 으로 보이니 기준을 높인다 */
  strict: boolean;
  minStations: number;
}
/** 꼬리로 받은 선 */
export interface WingLine {
  end: Pt;
  /** 눈꼬리 점에서 끝까지 (px) · 그 방향(눈 축에서 위로 몇 도) */
  len: number;
  deg: number;
  /** 선의 능선 세기(ΔL) · 맨살 위 길이(px) · 꼬리일 확률 */
  dark: number;
  free: number;
  p: number;
  line: Pt[];
}
export interface WingFound {
  /** 맨살 위로 뺀 꼬리 */
  wing: WingLine | null;
  /** 눈꼬리 점 밖으로, 속눈썹 선 끝을 따라 그은 선 (맨살로 빼지 않아서 꼬리는 아니다) */
  outerLine: { line: Pt[]; len: number } | null;
  /** 꼬리로 받지는 않았지만 꼬리일 수도 있는 선 — 반대쪽 눈에 같은 모양의 꼬리가 있으면 받는다 (pairWings) */
  maybe: WingLine | null;
  /** 꼬리로 못 봤을 때 어디서 걸렸는지 */
  why: string;
}

/** 길이는 전부 눈 폭 대비. 판정(WING_MODEL)을 뺀 값들은 눈대중 초기값이다 */
export const WING = {
  /** 보는 범위 (눈꼬리 점 기준): 눈 축 방향 t, 눈썹 방향 v */
  grid: { t0: -0.15, t1: 0.8, v0: -0.3, v1: 0.6 },
  /** 능선: 양쪽을 보는 거리들(가는 선 ~ 굵은 선) · 선 방향 후보(눈 축에서 위로 몇 도) · 선 방향으로 평균 내는 반 길이 */
  sides: [0.03, 0.055, 0.09],
  degs: [-30, -15, 0, 15, 30, 45, 60],
  along: 0.03,
  /**
   * 기준(tau) = 눈꼬리 밖 칸들의 능선 세기 가운데 값의 noiseK 배 — ridgeMin 과 ridgeMax 사이로.
   * (눈꼬리 아래 한 곳에서만 잡음을 쟀더니 아랫속눈썹을 그린 그림에서 기준이 37 까지 올라가 굵은 꼬리가 통째로 안 잡혔다)
   */
  ridgeMin: 3,
  ridgeMax: 8,
  noiseK: 3,
  /** 선이 시작할 수 있는 자리 (눈꼬리 점 둘레) */
  start: { from: -0.04, to: 0.1, below: -0.05, above: 0.13 },
  /** 선: 방향 범위(눈 축에서 위로 몇 도)와 간격 · 선 옆으로 능선을 찾아 주는 폭 · 끊긴 곳을 건너는 최대 길이 · 끝을 자르는 기준(그 선 진한 쪽 세기의 몇 배) */
  line: { min: -15, max: 50, step: 2.5 },
  tol: 0.02,
  gap: 0.06,
  cut: 0.4,
  /** 어두워진 정도(ΔL)가 이보다 크면 "통째로 어두운 곳" — 굵게 칠한 꼬리의 뿌리 · 짙은 섀도. 선이 거기를 지날 때는 끊긴 것으로 안 친다 */
  solid: 25,
  /** 후보: 끝이 tip 안에 있으면 같은 선으로 친다 · 다른 선과 견줄 때는 끝이 other 넘게 떨어진 것만 · 남기는 개수 */
  same: { tip: 0.06, other: 0.08 },
  keep: 6,
  /** 눈꼬리 밖에서 선이 갈 수 있는 띠: 아래로는 축 방향 1 에 belowSlope 까지(+ 여유), 위로는 aboveSlope 까지 */
  band: { belowSlope: 0.5, below: 0.07, aboveSlope: 1.8, above: 0.26 },
  /** 꼬리로 치려면: 눈꼬리 점 밖으로 minLen 넘게, 굵기는 maxWidth 이하. 맨살 위 길이가 minFree 가 안 되면 꼬리가 아니라 속눈썹 선 끝의 라이너 */
  minLen: 0.06,
  minFree: 0.04,
  maxWidth: 0.2,
  /**
   * 꼬리로 받는 확률: accept (화장 사진을 직접 포갠 것에서는 acceptStrict).
   * pair: 반대쪽 눈에 꼬리가 있을 때 이쪽 선을 받는 확률과, 같은 모양으로 치는 길이 · 방향 차이.
   * 근거 (처음 보는 얼굴에서, 꼬리 135 · 없음 169): accept 0.6 이면 찾음 88% · 가짜 10%, 0.7 이면 88% · 4%, 0.8 이면 84% · 4%, 0.9 면 75% · 0%
   * (pair.accept 0.5 일 때). pair.accept 를 0.3 으로 낮추면 찾음이 3% 늘고 가짜가 1% 는다.
   * 없는 꼬리를 그리라고 하는 쪽이 더 나쁘다고 보고 0.7 · 0.5 로 잡았다
   */
  accept: 0.7,
  acceptStrict: 0.85,
  pair: { accept: 0.5, len: 0.12, deg: 15 },
  /** 맨살 위인가: 선 옆(bareNear 안)의 맨얼굴이, 선을 가로질러 bareSide 만큼 떨어진 양쪽보다 bareDark(ΔL) 넘게 어둡지 않다 */
  bareDark: 12,
  bareNear: 0.03,
  bareSide: 0.09,
} as const;
export type WingParams = { [K in keyof typeof WING]: (typeof WING)[K] extends readonly number[] ? readonly number[] : (typeof WING)[K] extends number ? number : { [J in keyof (typeof WING)[K]]: number } };

/** 꼬리 후보 하나: 눈꼬리 근처에서 시작하는 곧은(살짝 휜) 어두운 선과, 그 선에서 잰 값들 */
export interface WingCand {
  /** 선 위의 점들 (눈 좌표 px: t = 눈 축 바깥쪽, v = 눈썹 쪽) 과 자리마다의 능선 세기 */
  path: { t: number; v: number; r: number }[];
  /** "능선 세기 − 기준" 의 합 */
  score: number;
  /** 잰 값 (길이는 눈 폭 대비): 판정에 쓴다 */
  f: WingFeatures;
}
export interface WingFeatures {
  /** 끝이 눈꼬리 점에서 축 방향으로 얼마나 나갔나 · 선의 길이 · 맨살 위 길이 */
  out: number;
  len: number;
  free: number;
  /** 능선 세기의 가운데 값(ΔL) · 선 위에서 능선이 이어진 비율 · 굵기 */
  strength: number;
  solid: number;
  width: number;
  /** 선 방향(눈 축에서 위로 몇 도) · 선이 시작하는 자리 (눈꼬리 점 기준) */
  dir: number;
  startT: number;
  startV: number;
  /** 끝이 다른 자리에 있는 후보 중 가장 센 것보다 몇 배 센가 (최대 5) · 그런 후보 중 이 선의 절반 넘게 센 것의 수 */
  lead: number;
  fan: number;
  /** 선 옆에 나란히 지나가는 다른 선의 수 (속눈썹 가닥) · 그중 가장 센 것이 이 선의 몇 배인가 · 선에서 옆으로 벗어난 정도 */
  rivals: number;
  rivalPeak: number;
  bend: number;
}
export interface WingScan {
  cands: WingCand[];
  tau: number;
  /** 능선 그림 (눈 좌표 격자: 가로 nt 칸 · 세로 nv 칸, 한 칸 c px, 왼쪽 아래가 (t0, v0)) — 들여다볼 때 쓴다 */
  grid: { nt: number; nv: number; t0: number; v0: number; c: number; R: Float32Array };
}

const pct = (v: number): string => `눈 폭의 ${Math.round(v * 100)}%`;

/** 눈꼬리 둘레의 능선 그림을 만들고, 꼬리 후보들을 센 순서로 돌려준다 */
export function scanWing(inp: WingInput, P: WingParams = WING): WingScan {
  const { raw, weight, bareL, outer, ax, up, u } = inp;
  const c = inp.step, G = P.grid;
  const nt = Math.round(((G.t1 - G.t0) * u) / c) + 1, nv = Math.round(((G.v1 - G.v0) * u) / c) + 1;
  const tOf = (i: number): number => G.t0 * u + i * c, vOf = (j: number): number => G.v0 * u + j * c;
  const spot = (t: number, v: number): Pt => ({ x: outer.x + ax.x * t + up.x * v, y: outer.y + ax.y * t + up.y * v });
  // 눈 좌표 격자로 옮긴다: V = 어두워진 정도(부호 있음), ok = 그 칸을 믿을 수 있나 (눈 뜬 틈 · 가려진 곳 · 영역 밖은 0)
  const V = new Float32Array(nt * nv), ok = new Uint8Array(nt * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nt; i++) {
    const p = spot(tOf(i), vOf(j));
    if (weight(p.x, p.y) < 0.5) continue;
    ok[j * nt + i] = 1;
    V[j * nt + i] = raw(p.x, p.y);
  }
  /** 격자 사이를 부드럽게 읽는다. 믿을 수 없는 칸이면 null */
  const g = (fi: number, fj: number): number | null => {
    if (fi < 0 || fj < 0 || fi > nt - 1 || fj > nv - 1 || !ok[Math.round(fj) * nt + Math.round(fi)]) return null;
    const ia = Math.floor(fi), ja = Math.floor(fj), ib = Math.min(nt - 1, ia + 1), jb = Math.min(nv - 1, ja + 1), x = fi - ia, y = fj - ja;
    return (V[ja * nt + ia]! * (1 - x) + V[ja * nt + ib]! * x) * (1 - y) + (V[jb * nt + ia]! * (1 - x) + V[jb * nt + ib]! * x) * y;
  };
  // ① 능선 세기: 그 자리가 선을 가로지르는 양쪽보다 얼마나 더 어두운가 (양쪽 차이 중 작은 쪽) — 방향 · 거리 후보 중 가장 큰 것.
  // 양쪽을 다 믿을 수 있는 자리만 잰다 — 한쪽만 보면 눈 뜬 틈 · 가려진 곳의 가장자리가 전부 선으로 보인다
  const R = new Float32Array(nt * nv);
  const dirs = P.degs.map((d) => ({ cx: Math.cos((d * Math.PI) / 180), sy: Math.sin((d * Math.PI) / 180) }));
  const a = (P.along * u) / c, sides = P.sides.map((s) => (s * u) / c);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nt; i++) {
    if (!ok[j * nt + i]) continue;
    let best = 0;
    for (const { cx, sy } of dirs) {
      /** 선 방향으로 다섯 자리 평균 */
      const m = (fi: number, fj: number): number | null => {
        const mid = g(fi, fj);
        if (mid === null) return null;
        let sum = mid;
        for (const k of [-1, -0.5, 0.5, 1]) sum += g(fi + k * a * cx, fj + k * a * sy) ?? mid;
        return sum / 5;
      };
      const m0 = m(i, j);
      if (m0 === null) continue;
      for (const s of sides) {
        const p = m(i - s * sy, j + s * cx), q = m(i + s * sy, j - s * cx);
        if (p === null || q === null) continue;
        const r = Math.min(m0 - p, m0 - q);
        if (r > best) best = r;
      }
    }
    R[j * nt + i] = best;
  }
  // 기준: 눈꼬리 밖 칸들의 능선 세기 가운데 값에서
  const beyond: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nt; i++) if (ok[j * nt + i] && tOf(i) > 0) beyond.push(R[j * nt + i]!);
  beyond.sort((p, q) => p - q);
  const tau = Math.min(P.ridgeMax, Math.max(P.ridgeMin, P.noiseK * (beyond.length ? beyond[beyond.length >> 1]! : 0)));
  const grid = { nt, nv, t0: G.t0 * u, v0: G.v0 * u, c, R };
  // ② 선 찾기: 눈꼬리 근처(start)의 자리마다 · 방향마다 곧은 선을 그어 보고, 그 위 "능선 세기 − 기준" 의 합을 잰다.
  // 꼬리는 곧거나 살짝 휜 한 획이다 — 선 옆 tol 안에서 가장 센 능선을 그 자리의 값으로 쳐서 살짝 휜 것도 따라간다.
  // (칸을 이어 가며 자유롭게 휘는 길을 찾았더니, 눈두덩의 진한 섀도 띠로 올라갔다 내려오는 길 · 꼬리 끝을 지나 흐린 얼룩을 따라가는 길이 뽑혔다)
  const maxDeficit = ((P.gap * u) / c) * tau, tol = Math.max(1, Math.round((P.tol * u) / c));
  const inBand = (t: number, v: number): boolean => t <= 0 || (v >= -P.band.belowSlope * t - P.band.below * u && v <= P.band.aboveSlope * t + P.band.above * u);
  /** (fi, fj) 에서 선을 가로질러 tol 칸 안의 가장 센 능선과 그 옮긴 칸 수 */
  const across = (fi: number, fj: number, nx: number, ny: number): { r: number; o: number } => {
    let best = { r: 0, o: 0 };
    for (let o = -tol; o <= tol; o++) {
      const i = Math.round(fi + o * nx), j = Math.round(fj + o * ny);
      if (i < 0 || j < 0 || i >= nt || j >= nv) continue;
      const r = R[j * nt + i]!;
      if (r > best.r || (r === best.r && Math.abs(o) < Math.abs(best.o))) best = { r, o };
    }
    return best;
  };
  /** 그 칸이 통째로 어두운 덩어리 안인가 (어두워진 정도가 solid 넘음) */
  const solidAt = (fi: number, fj: number): boolean => {
    const i = Math.round(fi), j = Math.round(fj);
    return i >= 0 && j >= 0 && i < nt && j < nv && ok[j * nt + i] === 1 && V[j * nt + i]! >= P.solid;
  };
  /** 한 선을 따라가며 "능선 세기 − 기준" 의 합이 가장 커지는 곳까지. 끊긴 곳을 너무 길게 건너면 멈춘다 */
  const walk = (i0: number, j0: number, cx: number, sy: number): { score: number; n: number } => {
    let sum = 0, top = 0, best = 0, n = 0;
    for (let d = 0; ; d++) {
      const fi = i0 + d * cx, fj = j0 + d * sy;
      if (fi < 0 || fj < 0 || fi > nt - 1 || fj > nv - 1 || !inBand(tOf(fi), vOf(fj))) break;
      const r = across(fi, fj, -sy, cx).r;
      // 굵게 칠한 꼬리의 뿌리처럼 통째로 어두운 곳은 능선이 없다 — 거기는 끊긴 것으로 치지 않고 그냥 지나간다
      sum += r >= tau || !solidAt(fi, fj) ? r - tau : 0;
      if (sum > best) {
        best = sum;
        n = d;
      }
      top = Math.max(top, sum);
      if (sum < top - maxDeficit) break;
    }
    return { score: best, n };
  };
  const ia = Math.max(0, Math.round(((P.start.from - G.t0) * u) / c)), ib = Math.min(nt - 1, Math.round(((P.start.to - G.t0) * u) / c));
  const ja = Math.max(0, Math.round(((P.start.below - G.v0) * u) / c)), jb = Math.min(nv - 1, Math.round(((P.start.above - G.v0) * u) / c));
  type Line = { score: number; n: number; i0: number; j0: number; cx: number; sy: number; deg: number; tipT: number; tipV: number };
  const lines: Line[] = [];
  for (let deg = P.line.min; deg <= P.line.max; deg += P.line.step) {
    const cx = Math.cos((deg * Math.PI) / 180), sy = Math.sin((deg * Math.PI) / 180);
    for (let j0 = ja; j0 <= jb; j0++) for (let i0 = ia; i0 <= ib; i0++) {
      const w = walk(i0, j0, cx, sy), tipT = tOf(i0 + w.n * cx);
      // 눈꼬리 점 밖으로 나간 선만
      if (w.score > 0 && tipT >= 0) lines.push({ ...w, i0, j0, cx, sy, deg, tipT, tipV: vOf(j0 + w.n * sy) });
    }
  }
  lines.sort((p, q) => q.score - p.score);
  // 같은 선을 여러 번 세지 않게: 끝이 가까운 것은 가장 센 것만 남긴다
  const kept: Line[] = [];
  for (const l of lines) {
    if (kept.length >= P.keep) break;
    if (kept.some((k) => Math.hypot(k.tipT - l.tipT, k.tipV - l.tipV) < P.same.tip * u)) continue;
    kept.push(l);
  }
  // 맨살 위인가 — 그 자리에 맨얼굴의 어두운 선(속눈썹 선 · 머리카락)이 같은 방향으로 지나가지 않는다.
  // 맨얼굴에서도 "양쪽보다 어두운 선" 인지를 본다: 선 옆 bareNear 안의 가장 어두운 밝기가, 선을 가로질러 bareSide 만큼 떨어진 양쪽보다 bareDark 넘게 어두우면 거기는 원래 선이 있던 자리다.
  // (둘레 어디든 어두운 것이 있으면 맨살이 아니라고 봤더니, 눈가 주름 · 그늘이 있는 얼굴에서 맨살 위로 뺀 꼬리가 "속눈썹 선 끝의 라이너" 로 잡혔다)
  const onSkin = (q: { t: number; v: number }, sy: number, cx: number): boolean => {
    const L = (d: number): number => {
      const at = spot(q.t - d * sy, q.v + d * cx);
      return bareL(at.x, at.y);
    };
    let mid = Infinity;
    for (let d = -P.bareNear * u; d <= P.bareNear * u; d += c) {
      const v = L(d);
      if (v > 0) mid = Math.min(mid, v);
    }
    const a2 = L(P.bareSide * u), b2 = L(-P.bareSide * u);
    // 맨얼굴 밝기를 못 읽는 곳(떼어 낸 칸 밖)은 맨살로 안 친다
    if (mid === Infinity || a2 <= 0 || b2 <= 0) return false;
    return Math.min(a2, b2) - mid < P.bareDark;
  };
  const cands: WingCand[] = [];
  for (const l of kept) {
    const { i0, j0, cx, sy } = l;
    const at = Array.from({ length: l.n + 1 }, (_, d) => across(i0 + d * cx, j0 + d * sy, -sy, cx));
    // 선의 범위를 다시 잡는다: 그 선의 진한 쪽 세기(위쪽 1/4)에 견줘 cut 배 아래로 흐린 곳은 선이 아니다 —
    // "세기 − level" 의 합이 가장 큰 이어진 구간이 그 획이다 (진한 꼬리 앞뒤의 흐린 얼룩을 잘라 낸다)
    const lit = at.map((q) => q.r).filter((r) => r >= tau).sort((p, q) => p - q);
    if (!lit.length) continue;
    const level = Math.max(tau, P.cut * lit[Math.floor((lit.length - 1) * 0.75)]!);
    let run = 0, runFrom = 0, best = 0, da = 0, db = -1;
    at.forEach((q, d) => {
      if (run <= 0) {
        run = 0;
        runFrom = d;
      }
      run += q.r - level;
      if (run > best) {
        best = run;
        da = runFrom;
        db = d;
      }
    });
    if (db - da < 2) continue;
    const path = at.slice(da, db + 1).map((q, k) => ({ t: tOf(i0 + (da + k) * cx - q.o * sy), v: vOf(j0 + (da + k) * sy + q.o * cx), r: q.r }));
    const tip = path[path.length - 1]!;
    if (tip.t < 0) continue;
    let freeN = 0;
    for (let k = path.length - 1; k >= 0 && path[k]!.t >= 0 && onSkin(path[k]!, sy, cx); k--) freeN++;
    const rs = path.map((q) => q.r).sort((p, q) => p - q), strength = rs[rs.length >> 1]!;
    // 굵기: 선의 끝 쪽(80% 지점)에서, 선을 가로질러 — 양쪽 바탕(더 어두운 쪽)과 가운데의 중간이 되는 곳까지.
    // 가운데서 재면 뿌리가 굵은 꼬리(쐐기 모양)가 번진 섀도로 걸러진다
    const mid = path[Math.floor((path.length - 1) * 0.8)]!, val = (d: number): number | null => {
      const p = spot(mid.t - d * sy, mid.v + d * cx);
      return weight(p.x, p.y) < 0.5 ? null : raw(p.x, p.y);
    };
    const reach = 0.2 * u, v0 = val(0) ?? 0, baseOf = (sign: number): number => {
      let m = v0;
      for (let d = c; d <= reach; d += c) m = Math.min(m, val(sign * d) ?? m);
      return m;
    };
    const half = (v0 + Math.max(baseOf(1), baseOf(-1))) / 2;
    let wa = 0, wb = 0;
    while (wb < reach && (val(wb + c) ?? -Infinity) >= half) wb += c;
    while (wa > -reach && (val(wa - c) ?? -Infinity) >= half) wa -= c;
    // 나란히 지나가는 다른 선(속눈썹 가닥): 선의 가운데에서 가로질러 가며 능선이 이 선 세기의 절반을 넘는 봉우리를 센다
    const fm = i0 + ((da + db) / 2) * cx, gm = j0 + ((da + db) / 2) * sy, span = Math.round((0.18 * u) / c), own = Math.round((0.035 * u) / c);
    let rivals = 0, inPeak = false, rivalPeak = 0;
    for (let o = -span; o <= span; o++) {
      const i = Math.round(fm - o * sy), j = Math.round(gm + o * cx);
      const r = Math.abs(o) <= own || i < 0 || j < 0 || i >= nt || j >= nv ? 0 : R[j * nt + i]!;
      if (r >= 0.5 * strength && !inPeak) rivals++;
      inPeak = r >= 0.5 * strength;
      rivalPeak = Math.max(rivalPeak, r);
    }
    cands.push({
      path, score: l.score,
      f: {
        out: tip.t / u, len: ((db - da) * c) / u, free: (freeN * c) / u, strength, solid: path.filter((q) => q.r >= level).length / path.length, width: (wb - wa) / u,
        dir: l.deg, startT: path[0]!.t / u, startV: path[0]!.v / u, lead: 5, fan: 0, rivals, rivalPeak: rivalPeak / Math.max(1, strength),
        bend: (at.slice(da, db + 1).reduce((s2, q) => s2 + Math.abs(q.o), 0) / path.length) * (c / u),
      },
    });
  }
  // 다른 선보다 얼마나 센가 — 끝이 다른 자리에 있는 후보하고만 견준다 (같은 획을 방향만 달리 잡은 후보는 빼고)
  const tipOf = (cd: WingCand): { t: number; v: number } => cd.path[cd.path.length - 1]!;
  for (const cd of cands) {
    const others = cands.filter((o) => o !== cd && Math.hypot(tipOf(o).t - tipOf(cd).t, tipOf(o).v - tipOf(cd).v) >= P.same.other * u);
    const top = Math.max(0, ...others.map((o) => o.score));
    cd.f.lead = top > 0 ? Math.min(5, cd.score / top) : 5;
    cd.f.fan = others.filter((o) => o.score >= 0.5 * cd.score).length;
  }
  return { cands, tau, grid };
}

/**
 * 판정에 넣는 값들 — 후보에서 잰 값(WingFeatures)과 점수를 로지스틱 회귀에 넣기 좋게 바꾼 것.
 * 꺾이는 값(wide · smudge · startHigh · startLow · dirUp · dirDown)은 "어느 선을 넘으면 그만큼" 을 배우게 하려고 넣었다:
 *   속눈썹 가닥은 눈꺼풀 선 위(눈꼬리 점보다 눈 폭의 8% 넘게 위)에서 시작해 가파르게(30° 넘게) 올라가고,
 *   번진 얼룩은 굵으면서 흐리고(smudge), 아랫속눈썹 쪽 선은 눈꼬리 점보다 아래에서 시작한다(startLow)
 */
export const WING_X: readonly { name: string; of: (f: WingFeatures, score: number) => number }[] = [
  { name: "logStrength", of: (f) => Math.log(Math.max(1, f.strength)) },
  { name: "logScore", of: (_, score) => Math.log(Math.max(1, score)) },
  { name: "out", of: (f) => f.out },
  { name: "free", of: (f) => f.free },
  { name: "solid", of: (f) => f.solid },
  { name: "wide", of: (f) => Math.max(0, Math.min(0.25, f.width) - 0.1) },
  { name: "smudge", of: (f) => (Math.max(0, Math.min(0.25, f.width) - 0.08) * Math.max(0, 20 - f.strength)) / 10 },
  { name: "startHigh", of: (f) => Math.max(0, f.startV - 0.08) },
  { name: "startLow", of: (f) => Math.max(0, -0.03 - f.startV) },
  { name: "dirUp", of: (f) => Math.max(0, f.dir - 30) / 20 },
  { name: "lashLike", of: (f) => (Math.max(0, f.startV - 0.08) * Math.max(0, f.dir - 30)) / 2 },
  { name: "dirDown", of: (f) => Math.max(0, -5 - f.dir) / 10 },
  { name: "fan", of: (f) => Math.min(5, f.fan) },
  { name: "rivalPeak", of: (f) => Math.min(2, f.rivalPeak) },
  { name: "lead", of: (f) => Math.min(3, f.lead) },
];
/** 맞춘 판정: p = 1 / (1 + exp(−(bias + Σ weights × 값))). weights 의 순서는 WING_X 와 같다 */
export interface WingModel {
  weights: readonly number[];
  bias: number;
}
/**
 * 2026-10-07 에 맞춘 값. 읽는 법: + 면 꼬리 쪽, − 면 아닌 쪽 —
 * 선이 진하고(logStrength) 눈꼬리 밖으로 길게 나갈수록(out · free) 꼬리, 눈꺼풀 선 위에서 시작하거나(startHigh) 가파르거나(dirUp) 굵으면서 흐리면(smudge) 아니다.
 *
 * 자료: 얼굴 11명. 생성 모델로 만든 그림 202장 —
 *   (가) 화장 사진 4장에 길이 · 각도를 아는 꼬리(없음 ~ 눈 폭의 40%)를 그려 넣어 만든 154장
 *   (나) 꼬리가 있는 · 없는 실제 화장 사진 12장으로 만든 것 중 얼굴 4명분 48장
 *   그 눈 404개 중 "꼬리가 또렷하다(끝점 표시) / 없다" 를 눈으로 가를 수 있었던 304개(있음 135 · 없음 169)와,
 *   모델 출력에 꼬리를 직접 그려 넣은 눈 259개(무게 0.15)로 맞췄다. 판단이 안 서는 눈 96개는 뺐다.
 * 정확도 (얼굴 하나를 빼고 맞춘 뒤 그 얼굴에서 잰 값 — 처음 보는 얼굴에서):
 *   꼬리 135개 중 88% 를 찾고 80% 는 끝점이 눈 폭의 5% 안 (찾은 것의 끝점 오차 가운데 값 2%), 꼬리 없는 눈 169개 중 4% 를 꼬리라고 했다.
 *   그 전 방법(가는 선을 한 칸씩 따라가기)은 같은 눈에서 40% · 29% · 9% 였다.
 *   (나) 묶음만 빼고 맞춘 뒤 (나) 에서 재면(처음 보는 화장 사진) 찾음 89% · 끝점 85% 였다.
 * 한계: 표시는 한 사람이 눈대중으로 했다(끝점 ± 눈 폭의 2 ~ 3%) — 팀 기준이 아니다.
 *   못 찾는 것: 머리카락이 눈꼬리를 덮은 눈 · 인조 속눈썹처럼 가닥이 많은 그림 속의 짧은 꼬리 · 눈 폭의 15% 가 안 되는 짧은 꼬리 ·
 *   속눈썹 선을 따라 아래로 살짝 이어 그은 흐린 선 · 눈두덩 전체와 한 덩어리가 된 아주 굵은 꼬리.
 *   얼굴 사진 일부는 연구용 공개 자료(상업 이용 불가)다 — 사진은 저장소에 없고 여기 남은 것은 숫자 16개뿐이지만, 상업 전환 때는 쓸 수 있는 사진으로 다시 맞춰야 한다.
 */
export const WING_MODEL: WingModel = {
  weights: [4.062, 0.109, 12.061, 2.514, 2.219, -3.359, -14.267, -31.881, -1.115, -5.663, -2.178, -1.235, -0.791, -0.13, 0.031],
  bias: -14.827,
};
/** 이 후보가 꼬리일 확률 (0 ~ 1) */
export function wingProb(cd: WingCand, m: WingModel = WING_MODEL): number {
  const z = WING_X.reduce((sum, x, k) => sum + m.weights[k]! * x.of(cd.f, cd.score), m.bias);
  return 1 / (1 + Math.exp(-z));
}

/** 한쪽 눈의 꼬리: 가장 센 후보 선을 잰 값으로 판정한다 */
export function findWing(inp: WingInput, P: WingParams = WING, model: WingModel = WING_MODEL): WingFound {
  return judgeWing(inp, scanWing(inp, P).cands[0] ?? null, P, model);
}

/** 후보 선 하나(가장 센 것)를 꼬리로 받을지 정한다 — findWing 의 뒤쪽 절반 (기준을 맞출 때 후보를 다시 찾지 않으려고 따로 뒀다) */
export function judgeWing(inp: WingInput, cd: WingCand | null, P: WingParams = WING, model: WingModel = WING_MODEL): WingFound {
  const { outer, ax, up, u } = inp;
  const none = (why: string, maybe: WingLine | null = null): WingFound => ({ wing: null, outerLine: null, maybe, why });
  if (!cd) return none("눈꼬리 밖으로 나가는 가는 선 없음");
  const spot = (q: { t: number; v: number }): Pt => ({ x: outer.x + ax.x * q.t + up.x * q.v, y: outer.y + ax.y * q.t + up.y * q.v });
  const tip = cd.path[cd.path.length - 1]!, p = wingProb(cd, model);
  // 그릴 선: 따라간 선 그대로, 눈꼬리 점 밖 부분만 — 선이 실제 꼬리 위에 놓인다 (눈꼬리 점은 꼬리가 시작하는 곳과 다를 수 있다).
  // 자리마다 능선을 찾아 옆으로 한두 칸씩 옮긴 것이 톱니처럼 보여서, 이웃끼리 고르게 편다 (양 끝은 그대로)
  let line = cd.path.filter((q) => q.t >= 0).map(spot);
  for (let pass = 0; pass < 6; pass++) {
    line = line.map((q, k) => (k === 0 || k === line.length - 1 ? q : { x: (line[k - 1]!.x + 2 * q.x + line[k + 1]!.x) / 4, y: (line[k - 1]!.y + 2 * q.y + line[k + 1]!.y) / 4 }));
  }
  // 길이 · 각도는 눈꼬리 점에서 꼬리 끝까지 — 바르는 사람이 보는 것
  const found: WingLine = { end: spot(tip), len: Math.hypot(tip.t, tip.v), deg: Math.round((Math.atan2(tip.v, tip.t) * 180) / Math.PI), dark: cd.f.strength, free: cd.f.free * u, p, line };
  if (cd.f.out < P.minLen) return none(`눈꼬리 밖으로 ${pct(cd.f.out)}뿐 — 꼬리로 안 봄`);
  if (cd.f.width > P.maxWidth) return none(`눈꼬리 밖이 넓게 어두움(굵기 ${pct(cd.f.width)}) — 선이 아니라 번진 섀도로 봄`);
  if (line.length < inp.minStations) return none("눈꼬리 밖 선이 너무 짧음");
  if (p < (inp.strict ? P.acceptStrict : P.accept)) {
    const what = cd.f.startV > 0.08 && cd.f.dir > 30 ? "속눈썹 가닥으로 봄" : cd.f.fan >= 3 ? "비슷한 선이 여럿 — 속눈썹 가닥일 수 있음" : "선이 흐리거나 짧음";
    return none(`눈꼬리 밖 ${pct(cd.f.out)}까지 선이 있지만 꼬리로 보기 어려움 (꼬리일 확률 ${Math.round(p * 100)}% — ${what})`, cd.f.free >= P.minFree ? found : null);
  }
  if (cd.f.free < P.minFree) {
    const why = `속눈썹 선 끝을 따라간 선 (맨살 위로는 ${pct(cd.f.free)}뿐)`;
    // 화장 사진을 직접 포갠 것에서는 안 받는다 — 사람이 달라 속눈썹 끝이 다르게 생긴 것이 그대로 "선" 으로 보인다
    return inp.strict ? none(`${why} — 사람마다 다른 속눈썹 끝일 수 있어 안 받음`) : { wing: null, outerLine: { line, len: tip.t }, maybe: null, why: `${why} — 꼬리가 아니라 눈꼬리 끝의 라이너로 봄` };
  }
  return { wing: found, outerLine: null, maybe: null, why: "" };
}

/**
 * 두 눈을 같이 본다: 한쪽 눈에만 꼬리가 잡혔을 때, 반대쪽 눈에 "꼬리일 수도 있는 선"(maybe)이 있고 길이 · 방향이 비슷하면 그것을 꼬리로 받는다.
 * 꼬리는 두 눈에 같이 그리는 것이라, 혼자서는 기준에 못 미친 선도 반대쪽이 받쳐 주면 믿을 만하다. 돌려주는 것은 [a, b] 순서 그대로
 */
export function pairWings(a: WingFound, b: WingFound, u: number, P: WingParams = WING): [WingFound, WingFound] {
  const lift = (weak: WingFound, strong: WingFound): WingFound => {
    const m = weak.maybe, s = strong.wing;
    if (weak.wing || !m || !s || m.p < P.pair.accept || Math.abs(m.len - s.len) > P.pair.len * u || Math.abs(m.deg - s.deg) > P.pair.deg) return weak;
    return { wing: m, outerLine: null, maybe: null, why: "" };
  };
  return [lift(a, b), lift(b, a)];
}
