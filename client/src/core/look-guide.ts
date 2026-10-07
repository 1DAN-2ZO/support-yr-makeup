/**
 * 룩 옮기기 (실험) 4단계 — 떼어 낸 화장(look-extract.ts)에서 "어디에 얼마나" 를 점 · 선으로 뽑는다 (부위 가이드).
 *
 * 떼어 낸 화장은 "색이 이만큼 바뀐 칸" 의 얼룩이라 그대로는 가이드가 못 된다 — 경계가 기준값에 따라 움직이고
 * 꼬리 끝 · 섀도 높이 같은 것이 안 나온다. 그래서 얼룩의 테두리를 따지 않고 **얼굴 점이 정한 선을 따라 잰다**:
 *   섀도우  속눈썹 선에서 눈썹 쪽으로 올라가며 색이 옅어지는 곳까지 → 위쪽 경계
 *   라이너  속눈썹 선에 붙은 어두운 띠의 두께, 눈꼬리에서 바깥으로 뻗은 어두운 선 → 꼬리 끝 · 각도
 *   눈썹    가운데 선을 따라가며 "둘레 맨살보다 어두운 띠" 를 잰다 — 맨얼굴에서 한 번(내 눈썹), 눈썹 화장을 입힌 것에서 한 번(그릴 눈썹)
 *   볼      색이 바뀐 곳의 중심에서 사방으로 → 테두리 · 중심
 *   입술    입술선(얼굴 점) 그대로 + 색
 * 경계는 "그 부위 보통 진하기의 GUIDE.edge 배" 로 잡는다 — 화장이 전체로 진하든 연하든 가장자리 자리는 같게 나온다
 * (절대값 기준으로 자르면 연한 화장은 자리가 흔들린다 — 2026-10-06 시험에서 같은 화장 세 장의 눈 쪽 겹침이 40 ~ 46% 였다).
 *
 * 숫자는 전부 눈 폭 대비 비율 — 얼굴 크기 · 사진 크기와 상관없다. 경계값 · 범위는 눈대중 초기값이고 팀 기준이 아니다.
 * 순수 함수 — Node 에서도 돈다.
 */

import { LM, at, dist } from "./landmarks";
import { TRANSFER_PARTS, blur, labToRgb } from "./look-extract";
import type { MakeupLayer, TransferPart } from "./look-extract";
import { findWing, pairWings, type WingFound } from "./look-wing";
import type { Outline } from "./overlay";
import type { Pt } from "./types";

/** liner = 눈머리 ~ 눈꼬리의 속눈썹 선에 긋는 아이라인, wing = 눈꼬리 밖으로 뻗는 꼬리 (따로 알아보고 따로 알려 준다) */
export type GuidePartId = "brow" | "liner" | "wing" | "shadow" | "lip" | "cheek";
export const GUIDE_PARTS: readonly GuidePartId[] = ["brow", "liner", "wing", "shadow", "lip", "cheek"];

export interface PartGuide {
  /** 이 부위에 화장이 있다고 봤나. 아니면 나머지는 비어 있다 */
  found: boolean;
  /** 그릴 자리 — 닫힌 테두리(polys)와 선(lines). screens/outline-draw.strokeOutline 으로 그린다 */
  outline: Outline;
  /** 짚어 줄 점 (라이너 꼬리 끝 · 눈썹 꼬리 끝 · 볼 중심) */
  dots: { at: Pt; label: string }[];
  /** 그 자리에 올라간 색 (정답사진에서 본 색, RGB 0~255) */
  color: [number, number, number] | null;
  /** 말로 풀 숫자. 화장이 없다고 봤을 때는 왜 그렇게 봤는지가 들어갈 수 있다 */
  notes: { label: string; value: string }[];
  /** 더 진하게 올릴 안쪽 자리 (섀도우의 가장 진한 곳, 블러셔의 중심부, 입술 가운데) */
  zones: { poly: Pt[]; label: string }[];
  /** 방향 화살표 (라이너 꼬리가 뻗는 방향, 블러셔를 쓸어 주는 방향) */
  arrows: { from: Pt; to: Pt; label: string }[];
  /** 길이를 재어 보여 주는 선 (섀도우 높이, 눈썹 두께) */
  measures: { from: Pt; to: Pt; label: string }[];
  /** 따라 하는 순서 — 잰 값으로 만든 문장. 좌우를 따로 재서 평균으로 말한다 */
  steps: string[];
}
export type LookGuide = Record<GuidePartId, PartGuide>;

/** 길이는 전부 눈 폭 대비 */
export const GUIDE = {
  /** 경계 = 그 부위 보통 진하기(색이 바뀐 칸들의 중앙값)의 이 비율까지 */
  edge: 0.6,
  /** 선을 따라 재는 간격 · 이만큼 끊긴 것은 이어진 것으로 본다 */
  step: 0.01,
  gap: 0.03,
  /** 이어진 자리가 이만큼은 돼야 그 부위에 화장이 있다고 본다 (재는 자리 개수) */
  minStations: 3,
  /** 화장이 있다고 치려면: 보통 진하기가 "화장 있음" 경계(look-extract present.lo)의 이 배 이상, 색이 바뀐 넓이가 눈 폭² 의 이 비율 이상 */
  minStrength: 1.15,
  minArea: { shadow: 0.02, brow: 0.03 },
  /**
   * 섀도우: 위로 재는 범위 · 눈꼬리 밖으로 재는 범위와 간격 · 눈 밑으로 재는 범위.
   * 눈 밑은 잡음에 잘 걸려서 더 까다롭게 — 이어진 자리 underStations 개 이상, 평균 폭 underMin 이상이어야 있다고 본다.
   * minHeight: 속눈썹 선에서 이만큼도 안 올라온 얇은 띠는 섀도우가 아니다 — 생성 모델이 속눈썹 선을 조금 진하게 그린 것이
   * 화장 없는 사진(시험 A)에서 "섀도우 6%" 로 잡혔다. 실제 섀도우는 같은 얼굴에서 23 ~ 27% 였다.
   * coreMin: "가장 진한 자리" 로 치는 최소 폭. 가장 진한 자리 = 그쪽 눈에서 색이 바뀐 칸들 중 진한 쪽 1/4 에 드는 곳.
   * snap: 칠한 구간이 눈꺼풀 선에서 이 안쪽에서 시작하면 눈꺼풀 선부터 칠한 것으로 본다 — 눈 뜬 틈 가장자리는 떼어 낸 영역이 옅어서
   * (눈동자 · 속눈썹을 안 옮기려고) 늘 눈 폭의 6% 쯤 떨어져 시작하는 것처럼 재이고, 그대로 그리면 속눈썹 선과 섀도우 사이가 뜬다
   */
  shadow: { reach: 0.9, out: 0.6, outStep: 0.1, under: 0.45, underStations: 9, underMin: 0.06, minHeight: 0.1, snap: 0.1, coreMin: 0.04, capTall: 1.6 },
  /**
   * 라이너: 어둡다고 칠 최소 밝기 차(ΔL) · 두께를 재는 범위 · 최소 두께 · 최대 두께.
   * 최대 두께보다 넓은 어두운 곳은 선이 아니라 어두운 섀도다 (스모키 · 짙은 색 섀도) — 속눈썹 선의 라이너로 안 본다.
   * fineBlur: "가는 선만 남긴 그림" = 어두워진 정도에서 그것을 이만큼 흐린 것을 뺀 것. lineDark: 그 그림에서 선으로 치는 진하기 (색을 잴 때 쓴다).
   * 꼬리(눈꼬리 밖으로 뺀 선)는 look-wing.ts 가 따로 찾는다 — 기준도 거기 있다.
   * lash: 속눈썹 선을 따라간 라이너. 눈꺼풀 선의 자리마다 증거 둘 중 하나가 있으면 "여기 라이너" 로 친다:
   *   fine — 눈꺼풀 선에서 눈썹 쪽 from ~ to 사이에 가는 어두운 선이 이만큼 진하다
   *   gain · gainDark — 눈꺼풀 선의 어두운 띠가 맨얼굴보다 gain 넘게 두꺼워졌고, 두꺼워진 자리가 gainDark 넘게 어두워졌다
   * 그런 자리가 gapMax 자리 이하로 끊기며 min 개 이상 이어지면 라이너. skipInner = 눈 앞머리 쪽에서 안 보는 구간.
   * normal · relaxed(반대쪽 눈에서 찾았을 때) · strict(화장 사진을 직접 포갠 것에서 볼 때).
   * relaxed 를 9 까지 낮추면 섀도만 바른 덮인 눈(가는 선 8 ~ 13)이 "거의 전체에 라이너" 로 잡힌다 — 그래서 11. 그래도 안 잡히는 쪽은 반대쪽 것을 옮겨 그린다.
   * 2026-10-06 잰 값 — 라이너가 보이는 눈(스모키): fine 15 ~ 28, 두꺼워짐 3 ~ 13% · 어두워짐 15 ~ 35.
   *   라이너 없는 눈(화장 없음 · 섀도만): fine 0 ~ 13, 두꺼워짐 0 ~ 1%. 눈 앞머리 윤곽 어긋남: fine 9 ~ 18 · 두꺼워짐 2% · 어두워짐 23 ~ 30 (세 자리).
   * thin · thick = 그릴 때 쓰는 두께의 아래 · 위 한계 (thin 은 두께를 못 쟀을 때 그리는 두께이기도 하다).
   * taper · taperTo = 정해 둔 영역(눈머리 ~ 눈꼬리)의 모양: 눈머리에서 제 두께의 taper 배로 시작해 눈 길이의 taperTo 지점부터 제 두께.
   */
  liner: { minDark: 6, reach: 0.3, minThick: 0.012, maxThick: 0.12, fineBlur: 0.06, lineDark: 16, lash: { from: 0.02, to: 0.14, draw: 0.025, reach: 0.22, core: 0.06, contrast: 8, skipInner: 0.12, gapMax: 2, min: { normal: 4, strict: 5 }, fine: { normal: 14, relaxed: 11, strict: 20 }, gain: { normal: 0.02, relaxed: 0.015, strict: 0.03 }, gainDark: { normal: 12, relaxed: 10, strict: 18 }, thin: 0.03, thick: 0.1, taper: 0.5, taperTo: 0.4 } },
  /**
   * 눈썹: 가운데 선에서 위아래로 재는 범위 · 꼬리 · 앞머리 밖으로 더 재는 칸 수와 간격 · 어둡다고 칠 최소 밝기 차(ΔL).
   * 눈썹은 "어두워진 곳" 만 본다 — 색이 바뀐 곳 전부를 보면 눈썹까지 올라온 섀도 색이 눈썹으로 잡힌다 (주황 섀도 샘플에서 그랬다).
   * cover: 내 눈썹 길이의 이 비율 이상이 짙어져야 눈썹 화장이 있다고 본다. 일부만 짙어진 조각을 테두리로 그리면 엉뚱한 모양의
   * 눈썹을 그리라는 말이 된다 (2026-10-06 주황 섀도 샘플: 꼬리 쪽 조각만 잡혀 눈썹 절반 길이의 덩어리가 그려졌다).
   * minContrast: 둘레 맨살보다 이만큼(ΔL)은 어두워야 눈썹이 보인다고 친다. 눈썹의 가장자리는 그 어두움의 절반이 되는 곳 —
   * 위쪽 가장자리는 위쪽 맨살(이마), 아래쪽 가장자리는 아래쪽 맨살(눈두덩)을 기준으로 따로 잰다. 한 기준으로 재면 이마보다 어두운 눈두덩 그늘 ·
   * 섀도 · 관자놀이 잔머리까지 눈썹에 붙어서 두께가 눈 폭의 23% 로(보이는 것은 14% 쯤) 재였다 (2026-10-06).
   * margin: 얼굴 점이 잡은 눈썹 자리에서 위아래로 이만큼 더 본다.
   * coverPair: 반대쪽 눈썹이 cover 를 넘었으면 이쪽은 cover 의 이 배만 넘어도 받는다 (잔머리에 가려 한쪽만 56% 로 재인 적이 있다).
   * 눈썹의 두께를 얼굴 점(위 · 아래 눈썹 점)으로 재지 않는 까닭: 그 점들 사이는 눈 폭의 22% 로, 보이는 눈썹의 두 배쯤이었다
   */
  brow: { reach: 0.18, extend: 3, extendStep: 0.08, minDark: 6, cover: 0.6, minContrast: 8, margin: 0.07, coverPair: 0.65 },
  /**
   * 볼(블러셔): 붉어진 정도(Δa)만 본다 — 블러셔는 넓고 연해서 "색이 바뀐 크기" 로는 그늘 · 톤 차이와 안 갈린다.
   * minRed · noiseK: 그쪽 볼에서 가장 붉어진 정도(위쪽 2% 자리)가 minRed 와 "볼 맨살 잡음 × noiseK" 를 둘 다 넘어야 블러셔로 본다.
   *   2026-10-06 잰 값(가장 붉어진 정도): 화장 없음 0.8 ~ 1.0 · 블러셔를 거의 못 옮긴 그림 1.3 ~ 3.1 · 연한 블러셔 3.4 ~ 3.6 · 진한 블러셔 13 ~ 17.
   *   연한 블러셔와 "못 옮긴 그림" 이 붙어 있어서 3.2 근처는 어느 쪽으로도 틀릴 수 있다.
   * edge · core: 테두리는 가장 붉은 정도의 edge 배가 되는 곳, 가장 진한 자리는 core 배가 되는 곳.
   * reach · rays: 중심에서 재는 범위 · 방향 수. round: 긴 쪽 / 짧은 쪽이 이보다 작으면 동그랗다고 말한다. strong: 이보다 붉으면 "또렷하게"
   */
  cheek: { reach: 1.6, rays: 32, minRed: 3.2, noiseK: 3, edge: 0.5, core: 0.8, round: 1.3, strong: 7, pair: 0.75 },
} as const;

const NAME: Record<"R" | "L", string> = { R: "오른쪽", L: "왼쪽" };
const pct = (v: number): string => `눈 폭의 ${Math.round(v * 100)}%`;
const empty = (): PartGuide => ({ found: false, outline: { polys: [], lines: [] }, dots: [], color: null, notes: [], zones: [], arrows: [], measures: [], steps: [] });

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, d: Pt, t: number): Pt => ({ x: a.x + d.x * t, y: a.y + d.y * t });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
/** v 에 수직이면서 from → target 쪽을 보는 단위 벡터 */
const perpToward = (v: Pt, from: Pt, target: Pt): Pt => {
  const n = unit({ x: -v.y, y: v.x });
  return dot(n, sub(target, from)) >= 0 ? n : { x: -n.x, y: -n.y };
};
const centroid = (pts: readonly Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const median = (v: number[]): number => {
  if (!v.length) return 0;
  v.sort((p, q) => p - q);
  return v[v.length >> 1]!;
};

/**
 * 떼어 낸 화장 → 부위 가이드. layer = 정답사진(또는 화장 사진)에서 뗀 것, lm = 내 맨얼굴 얼굴 점(px).
 * refLayer = 화장 사진을 내 얼굴에 직접 포개서 뗀 것 (있으면). 아이라이너에만 쓴다 — 정답사진에 라이너가 안 그려졌거나
 * 덮인 눈꺼풀에 가려 안 보일 때, 화장 사진에 있는 라이너를 거기서 찾는다
 */
export function buildGuide(layer: MakeupLayer, lm: readonly Pt[], refLayer: MakeupLayer | null = null): LookGuide {
  const { x0, y0, w, h, u } = layer;
  const P = (i: number): Pt => at(lm, i);
  const step = Math.max(0.5, GUIDE.step * u), gap = GUIDE.gap * u;

  /** 칸 배열을 사진 좌표(px)에서 읽는 함수 — 칸 사이는 부드럽게, 칸 밖은 0 */
  const reader = (arr: Float32Array) => (x: number, y: number): number => {
    const fx = x - x0, fy = y - y0;
    if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) return 0;
    const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(w - 1, xa + 1), yb = Math.min(h - 1, ya + 1);
    const tx = fx - xa, ty = fy - ya;
    return (arr[ya * w + xa]! * (1 - tx) + arr[ya * w + xb]! * tx) * (1 - ty) + (arr[yb * w + xa]! * (1 - tx) + arr[yb * w + xb]! * tx) * ty;
  };
  /** 부위의 "진하기" 그림: 영역 × 색이 바뀐 크기(ΔE) */
  const strengthOf = (p: TransferPart): Float32Array => {
    const part = layer.parts[p], s = new Float32Array(w * h);
    for (let i = 0; i < s.length; i++) s[i] = part.mask[i]! * Math.hypot(part.dL[i]!, part.da[i]!, part.db[i]!);
    return s;
  };
  const S = {} as Record<TransferPart, Float32Array>;
  for (const p of TRANSFER_PARTS) S[p] = strengthOf(p);

  /** 얼굴 가운데 세로선 — 이보다 사진 왼쪽이면 R(본인 오른쪽) */
  const midX = P(LM.glabella).x;
  const sideOf = (x: number): "R" | "L" => (x < midX ? "R" : "L");

  /** 그 부위 · 그쪽에서 색이 바뀐 칸들의 보통 진하기와 넓이(눈 폭² 대비). 화장이 없으면 typical 0 */
  const typical = (p: TransferPart, side: "R" | "L" | null, keep: (i: number) => boolean = () => true): { typical: number; area: number; strong: number } => {
    const lo = layer.present[p].lo, s = S[p], vals: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (s[i]! < lo || (side && sideOf(x + x0) !== side) || !keep(i)) continue;
      vals.push(s[i]!);
    }
    const mid = median(vals);   // 정렬해 둔다 — strong = 진한 쪽 1/4 이 시작하는 값
    return { typical: mid, area: vals.length / (u * u), strong: vals.length ? vals[Math.floor((vals.length - 1) * 0.75)]! : 0 };
  };

  /**
   * p0 에서 d 방향으로 t ∈ [from, to] 를 보며 f ≥ level 인 구간 중 가장 무거운(Σf) 것. gap 이하로 끊긴 것은 잇는다.
   * startBy 를 주면 그 자리(t) 전에 시작하는 구간만 받는다 (속눈썹 선에 붙은 띠, 눈꼬리에서 뻗은 선, 중심에서 번진 볼터치)
   */
  const run = (f: (x: number, y: number) => number, p0: Pt, d: Pt, from: number, to: number, level: number, startBy?: number): { a: number; b: number } | null => {
    let best: { a: number; b: number; mass: number } | null = null, cur: { a: number; b: number; mass: number } | null = null;
    const close = (): void => {
      if (cur && (startBy === undefined || cur.a <= startBy) && (!best || cur.mass > best.mass)) best = cur;
      cur = null;
    };
    for (let t = from; t <= to; t += step) {
      const v = f(p0.x + d.x * t, p0.y + d.y * t);
      if (v >= level) {
        if (cur && t - cur.b <= gap + step) {
          cur.b = t;
          cur.mass += v;
        } else {
          close();
          cur = { a: t, b: t, mass: v };
        }
      } else if (cur && t - cur.b > gap) close();
    }
    close();
    return best;
  };

  /** 그 자리들의 평균 색: 내 얼굴 색 + 떼어 낸 차이. weight 가 0 인 칸은 뺀다 */
  const colorOf = (p: TransferPart, weight: (i: number, x: number) => number): [number, number, number] | null => {
    const part = layer.parts[p];
    let L = 0, a = 0, b = 0, ws = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, k = weight(i, x + x0);
      if (k <= 0) continue;
      L += k * (layer.bare.L[i]! + part.dL[i]!);
      a += k * (layer.bare.a[i]! + part.da[i]!);
      b += k * (layer.bare.b[i]! + part.db[i]!);
      ws += k;
    }
    return ws > 0 ? labToRgb(L / ws, a / ws, b / ws) : null;
  };

  /** 이어진 자리 묶음 중 가장 긴 것 (자리마다 값이 있거나 null) */
  const longest = <T>(items: readonly (T | null)[]): T[] => {
    let best: T[] = [], cur: T[] = [];
    for (const it of items) {
      if (it) cur.push(it);
      else {
        if (cur.length > best.length) best = cur;
        cur = [];
      }
    }
    return cur.length > best.length ? cur : best;
  };

  /** 점 사이에 가운데 점을 하나씩 넣는다 — 재는 자리를 촘촘하게 */
  const dense = (pts: readonly Pt[]): Pt[] => pts.flatMap((p, k) => (k + 1 < pts.length ? [p, { x: (p.x + pts[k + 1]!.x) / 2, y: (p.y + pts[k + 1]!.y) / 2 }] : [p]));
  /** 이웃한 자리끼리 값이 튀지 않게: 셋 중 가운데 값 → 셋 평균 */
  const smooth = (v: readonly number[]): number[] => {
    const near = (a: readonly number[], k: number): number[] => [a[Math.max(0, k - 1)]!, a[k]!, a[Math.min(a.length - 1, k + 1)]!];
    const med = v.map((_, k) => near(v, k).sort((p, q) => p - q)[1]!);
    return med.map((_, k) => near(med, k).reduce((s, q) => s + q, 0) / 3);
  };
  /** 더 세게 고르기: 다섯 중 가운데 값 → 셋 평균. 두 자리가 나란히 튀어도 뾰족한 뿔이 안 남는다 (섀도우 위쪽 가장자리용) */
  const smoothWide = (v: readonly number[]): number[] => {
    const med = v.map((_, k) => [-2, -1, 0, 1, 2].map((d) => v[Math.max(0, Math.min(v.length - 1, k + d))]!).sort((p, q) => p - q)[2]!);
    return med.map((_, k) => (med[Math.max(0, k - 1)]! + med[k]! + med[Math.min(med.length - 1, k + 1)]!) / 3);
  };
  /** 닫힌 테두리의 모서리를 한 번 깎는다 (Chaikin) */
  const round = (poly: readonly Pt[]): Pt[] => poly.flatMap((p, k) => {
    const q = poly[(k + 1) % poly.length]!;
    return [{ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 }];
  });

  /**
   * 띠의 테두리: 자리마다 잰 위쪽 점(top) · 아래쪽 점(bottom)을 이어 닫는다.
   * 진행 방향을 거스르는 점은 버린다 — 재는 방향이 자리마다 달라서 점이 뒤로 돌아가면 테두리에 고리 · 갈고리가 생긴다.
   * 양 끝은 반듯하게 자르지 않고 한 점으로 모아 둥글린다 (화장은 끝이 각지지 않는다)
   */
  /** dir 방향으로 나아가는 점만 남긴다 (뒤로 돌아가는 점을 버린다) */
  const forward = (pts: readonly Pt[], dir: Pt): Pt[] => {
    const kept: Pt[] = [];
    let far = -Infinity;
    for (const q of pts) {
      const along = dot(q, dir);
      if (along <= far + step / 2) continue;
      kept.push(q);
      far = along;
    }
    return kept;
  };
  const outlineOf = (top: readonly Pt[], bottom: readonly Pt[]): Pt[] => {
    const dir = unit(sub(top[top.length - 1]!, top[0]!));
    const t = forward(top, dir), b = forward(bottom, dir);
    const cap = (a: Pt, c: Pt, sign: number): Pt => add({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, dir, sign * Math.min(dist(a, c) / 2, 0.06 * u));
    return round(round([cap(t[0]!, b[0]!, -1), ...t, cap(t[t.length - 1]!, b[b.length - 1]!, 1), ...[...b].reverse()]));
  };
  /** 점들을 지나는 부드러운 곡선 (Catmull-Rom) — 얼굴 점처럼 믿을 만한 점은 깎지 않고 그 사이만 둥글게 잇는다. 닫힌 테두리용 */
  const through = (pts: readonly Pt[], per = 4): Pt[] => pts.flatMap((p1, k) => {
    const p0 = pts[(k - 1 + pts.length) % pts.length]!, p2 = pts[(k + 1) % pts.length]!, p3 = pts[(k + 2) % pts.length]!;
    return Array.from({ length: per }, (_, j) => {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
    });
  });

  const eyes = [{ side: "R" as const, eye: LM.eyeA, brow: LM.browA }, { side: "L" as const, eye: LM.eyeB, brow: LM.browB }];
  const out: LookGuide = { brow: empty(), liner: empty(), wing: empty(), shadow: empty(), lip: empty(), cheek: empty() };
  type Sides<T> = Partial<Record<"R" | "L", T>>;
  /** 좌우에서 따로 잰 것 — 따라 하는 순서 문장과 "좌우가 다름" 알림을 만들 때 쓴다 */
  const bySide = {
    shadow: {} as Sides<{ height: number; beyond: number; core: string | null; under: boolean; wraps: boolean }>,
    liner: {} as Sides<{ thick: number; where: string | null }>,
    wing: {} as Sides<{ len: number; deg: number; kind: "wing" | "extend" }>,
    brow: {} as Sides<{ thick: number; more: number; arch: number }>,
    cheek: {} as Sides<{ where: string; shape: string; size: number; strength: string }>,
  };
  const sEye = reader(S.eye), eyeLo = layer.present.eye.lo;

  // ── 섀도우 · 라이너 ─────────────────────────────────────────
  /** 어두워진 정도: 영역 × 밝기가 내려간 크기(ΔL) */
  // 눈 영역은 눈 뜬 틈 가장자리에서 0.5 쯤으로 옅어진다 — 바로 그 속눈썹 선에 라이너가 있으므로 영역을 두 배로 쳐서(1 까지) 덜 깎는다
  type Reader = (x: number, y: number) => number;
  type EyeMaps = { darkArr: Float32Array; fineArr: Float32Array; dark: Reader; fine: Reader; dL: Reader; raw: Reader; weight: Reader; lo: number };
  /** 눈 둘레의 "어두워진 정도" 를 읽는 그림들 — 떼어 낸 화장 한 장에서 만든다 */
  const eyeMapsOf = (from: MakeupLayer): EyeMaps => {
    const part = from.parts.eye, darkA = new Float32Array(w * h);
    for (let i = 0; i < darkA.length; i++) darkA[i] = Math.min(1, 2 * part.mask[i]!) * Math.max(0, -part.dL[i]!);
    // 가는 선만: 넓게 어두운 곳(섀도)은 흐린 것과 차이가 없어 0 이 되고, 2 ~ 3px 선은 남는다
    const wideA = blur(darkA, w, h, GUIDE.liner.fineBlur * u), fineA = new Float32Array(w * h);
    for (let i = 0; i < fineA.length; i++) fineA[i] = Math.max(0, darkA[i]! - wideA[i]!);
    // 꼬리 찾기(look-wing.ts)가 읽는 것: 흐리기 전의 어두워진 정도(부호 있음)와, 그 칸을 믿을 수 있는 정도
    const rawA = new Float32Array(w * h), weightA = new Float32Array(w * h);
    for (let i = 0; i < rawA.length; i++) {
      rawA[i] = -from.rawDL[i]!;
      weightA[i] = Math.min(1, 2 * part.mask[i]!);
    }
    return { darkArr: darkA, fineArr: fineA, dark: reader(darkA), fine: reader(fineA), dL: reader(part.dL), raw: reader(rawA), weight: reader(weightA), lo: from.present.eye.lo };
  };
  const M0 = eyeMapsOf(layer), darkArr = M0.darkArr, fineArr = M0.fineArr;
  // 화장 사진을 직접 포갠 것은 같은 칸(같은 맨얼굴 · 같은 얼굴 점)에서 뗀 것이어야 쓴다
  const Mref = refLayer && refLayer.x0 === x0 && refLayer.y0 === y0 && refLayer.w === w && refLayer.h === h ? eyeMapsOf(refLayer) : null;
  /**
   * 한쪽 눈에서 잰 아이라인. 길이는 눈 폭 대비.
   * seen = 속눈썹 선에서 라이너가 보인 구간(눈머리 0 ~ 눈꼬리 1)과 두께. tail = 눈꼬리 점 밖으로 나간 선 —
   * kind "wing" 은 맨살 위로 뺀 꼬리, "extend" 는 속눈썹 선 끝을 따라 짧게 이어 그은 것
   */
  type LinerRaw = { seen: { a: number; b: number; thick: number; where: string } | null; tail: { len: number; deg: number; free: number; kind: "wing" | "extend" } | null };
  type LinerFound = { raw: LinerRaw; lashNote: string; wing: PartGuide; wf: WingFound };
  const linerJobs: {
    side: "R" | "L";
    find: (M: EyeMaps, relaxed: boolean, strict: boolean) => LinerFound;
    /** 눈머리 ~ 눈꼬리 전체를 두께 thick 의 띠로 — 속눈썹 선 아이라인의 정해 둔 영역 */
    region: (thick: number) => { line: Pt[]; zone: Pt[]; head: Pt; tail: Pt };
    /** 반대쪽 눈에서 잰 꼬리를 이 눈에 옮겨 그린다 */
    mirrorTail: (tail: NonNullable<LinerRaw["tail"]>) => PartGuide;
    /** 꼬리 찾기 결과 → 잰 값과 그릴 것. paired = 반대쪽 눈의 꼬리가 받쳐 줘서 받은 것 */
    tailOf: (wf: WingFound, paired?: boolean) => { tail: LinerRaw["tail"]; wing: PartGuide };
  }[] = [];
  /** 맨얼굴 밝기(L) — 떼어 낸 칸 밖은 0 */
  const bareL = layer.bare.L, rBare = reader(bareL);

  for (const { side, eye, brow } of eyes) {
    const inner = P(eye.inner), outer = P(eye.outer);
    const browC = centroid([...brow.upper, ...brow.lower].map(P));
    const mid = { x: (inner.x + outer.x) / 2, y: (inner.y + outer.y) / 2 };
    const ax = unit(sub(outer, inner));               // 안쪽 → 눈꼬리 (바깥)
    const up = perpToward(ax, mid, browC);            // 눈썹 쪽
    const lid = dense([...eye.upper].reverse().map(P));      // 윗눈꺼풀: 안쪽 → 눈꼬리
    const under = dense([...eye.lower].reverse().map(P));    // 아랫눈꺼풀: 안쪽 → 눈꼬리
    const tangent = (pts: readonly Pt[], k: number): Pt => sub(pts[Math.min(pts.length - 1, k + 1)]!, pts[Math.max(0, k - 1)]!);
    /** 재는 방향: 눈꺼풀 선에 수직인 방향과 눈썹 쪽(또는 그 반대)을 반씩 — 눈 끝에서 방향이 옆으로 눕지 않게 */
    const normal = (pts: readonly Pt[], k: number, away: Pt): Pt => {
      const n = perpToward(tangent(pts, k), { x: 0, y: 0 }, away);
      return unit({ x: n.x + away.x, y: n.y + away.y });
    };
    const down = { x: -up.x, y: -up.y };

    // 섀도우: 속눈썹 선에서 눈썹 쪽으로, 눈꼬리 밖으로도
    const t = typical("eye", side);
    if (t.typical >= GUIDE.minStrength * eyeLo && t.area >= GUIDE.minArea.shadow) {
      const level = Math.max(eyeLo, GUIDE.edge * t.typical);
      /** 재는 자리 하나: 시작점 p 에서 n 방향으로 a ~ b 가 칠해진 구간 */
      type St = { p: Pt; n: Pt; a: number; b: number; onLid: boolean };
      /** 이웃 자리끼리 a · b 를 고르게 한 뒤 테두리로: 아래쪽 점들 + 위쪽 점들(거꾸로) */
      /** far = 눈에서 먼 쪽 가장자리, near = 눈 쪽 가장자리(눈꺼풀 선) */
      const polyOf = (got: readonly St[]): { poly: Pt[]; far: Pt[]; near: Pt[]; heights: number[] } => {
        // 위쪽 가장자리는 이웃끼리 세게 고르고, 보통 높이의 capTall 배를 넘는 뿔은 깎는다 — 눈꼬리 끝 자리는 재는 방향이 부채꼴로 벌어져
        // 눈썹 꼬리 쪽 그늘까지 올라가 재이는 일이 있다 (2026-10-06 시험 E: 한쪽 눈만 52%, 나머지는 25 ~ 30%)
        const a = smooth(got.map((s) => s.a)), wide = smoothWide(got.map((s) => s.b)), cap = GUIDE.shadow.capTall * median([...wide]);
        const b = wide.map((v) => Math.min(v, cap));
        const far = got.map((s, k) => add(s.p, s.n, b[k]!)), near = got.map((s, k) => add(s.p, s.n, a[k]!));
        return { poly: outlineOf(far, near), far, near, heights: b };
      };
      const stations: (St | null)[] = lid.map((p, k) => {
        const n = normal(lid, k, up);
        const r = run(sEye, p, n, 0, GUIDE.shadow.reach * u, level);
        return r && r.b - r.a >= step ? { p, n, a: r.a <= GUIDE.shadow.snap * u ? 0 : r.a, b: r.b, onLid: true } : null;
      });
      const extN = Math.round(GUIDE.shadow.out / GUIDE.shadow.outStep);
      for (let j = 1; j <= extN; j++) {
        const p = add(outer, ax, j * GUIDE.shadow.outStep * u);
        // 눈꼬리 밖은 눈 축 위쪽만 잰다 — 아래쪽으로 번진 것은 눈 밑 테두리가 맡는다 (둘이 겹쳐 그려지지 않게)
        const r = run(sEye, p, up, 0, GUIDE.shadow.reach * u, level);
        stations.push(r && r.b - r.a >= step ? { p, n: up, a: r.a <= GUIDE.shadow.snap * u ? 0 : r.a, b: r.b, onLid: false } : null);
      }
      const got = longest(stations);
      const made = got.length >= GUIDE.minStations ? polyOf(got) : null;
      const onLid = made ? made.heights.filter((_, k) => got[k]!.onLid) : [];
      const height = onLid.length ? onLid.reduce((s, q) => s + q, 0) / onLid.length : 0;
      const upper = made && height >= GUIDE.shadow.minHeight * u ? made : null;
      if (made && !upper) out.shadow.notes.push({ label: `${NAME[side]} 눈`, value: `속눈썹 선 가까이만 색이 바뀜 (${pct(height / u)}) — 섀도우로 안 봄` });
      if (upper) {
        const beyond = got.filter((q) => !q.onLid).length;
        const peakH = Math.max(...upper.heights.filter((_, k) => got[k]!.onLid));
        out.shadow.notes.push({ label: `${NAME[side]} 눈 — 위로`, value: `가장 높은 곳이 ${pct(peakH / u)} (평균 ${Math.round((100 * height) / u)}%)` });
        out.shadow.notes.push({ label: `${NAME[side]} 눈 — 눈꼬리 밖으로`, value: beyond ? pct(beyond * GUIDE.shadow.outStep) : "안 나감" });
        // 가장 높이 올라간 자리에 높이를 재는 선
        let top = -1;
        got.forEach((q, k) => {
          if (q.onLid && (top < 0 || upper.heights[k]! > upper.heights[top]!)) top = k;
        });
        if (top >= 0) out.shadow.measures.push({ from: got[top]!.p, to: add(got[top]!.p, got[top]!.n, upper.heights[top]!), label: `${Math.round((100 * upper.heights[top]!) / u)}%` });
        // 가장 진한 자리: 진한 쪽 1/4 에 드는 칸이 이어진 곳 — 색을 어디에 가장 많이 올리는지
        const coreLevel = Math.max(level, t.strong);
        const core = longest(lid.map((p, k): (St & { k: number }) | null => {
          const n = normal(lid, k, up);
          const r = run(sEye, p, n, 0, GUIDE.shadow.reach * u, coreLevel);
          return r && r.b - r.a >= GUIDE.shadow.coreMin * u ? { p, n, a: r.a, b: r.b, onLid: true, k } : null;
        }));
        let where: string | null = null;
        if (core.length >= GUIDE.minStations) {
          const a = core[0]!.k / (lid.length - 1), b = core[core.length - 1]!.k / (lid.length - 1);
          where = b - a >= 0.7 ? "눈두덩 전체" : (a + b) / 2 >= 0.6 ? "눈꼬리 쪽" : (a + b) / 2 <= 0.4 ? "눈 앞머리 쪽" : "눈 가운데";
          out.shadow.zones.push({ poly: polyOf(core).poly, label: "가장 진하게" });
          out.shadow.notes.push({ label: `${NAME[side]} 눈 — 가장 진한 곳`, value: where });
        }
        bySide.shadow[side] = { height: peakH / u, beyond: beyond * GUIDE.shadow.outStep, core: where, under: false, wraps: false };
      }
      // 눈 밑: 아랫눈꺼풀 선에서 아래로, 눈꼬리 밖으로도 (눈 축 아래쪽)
      const underSt: (St | null)[] = under.map((p, k) => {
        const n = normal(under, k, down);
        const r = run(sEye, p, n, 0, GUIDE.shadow.under * u, level);
        return r && r.b - r.a >= step ? { p, n, a: r.a <= GUIDE.shadow.snap * u ? 0 : r.a, b: r.b, onLid: true } : null;
      });
      for (let j = 1; j <= extN; j++) {
        const p = add(outer, ax, j * GUIDE.shadow.outStep * u);
        const r = run(sEye, p, down, 0, GUIDE.shadow.under * u, level);
        underSt.push(r && r.b - r.a >= step ? { p, n: down, a: r.a <= GUIDE.shadow.snap * u ? 0 : r.a, b: r.b, onLid: false } : null);
      }
      const below = longest(underSt);
      // 눈 밑이 있다고 치는 것은 아랫눈꺼풀 선 위의 자리만 센다 — 눈꼬리 밖 자리까지 세면 꼬리 · 눈꼬리 그늘만으로도 "눈 밑" 이 된다
      const lower = below.filter((q) => q.onLid).length >= GUIDE.shadow.underStations && below.reduce((s, q) => s + q.b - q.a, 0) / below.length >= GUIDE.shadow.underMin * u ? polyOf(below) : null;
      if (lower) out.shadow.notes.push({ label: `${NAME[side]} 눈 — 눈 밑`, value: "있음" });
      if (lower && bySide.shadow[side]) bySide.shadow[side]!.under = true;
      if (upper || lower) out.shadow.found = true;
      // 위 · 아래가 둘 다 눈꼬리 밖까지 나갔으면 눈꼬리를 감싸는 한 덩어리로 그린다 (두 조각으로 그리면 눈꼬리에서 겹친 선이 생긴다):
      // 위쪽 먼 가장자리(앞머리 → 눈꼬리 밖) → 눈꼬리 밖 끝 → 아래쪽 먼 가장자리(→ 앞머리) → 아랫눈꺼풀 선(→ 눈꼬리) → 윗눈꺼풀 선(→ 앞머리)
      if (upper && lower && got.some((q) => !q.onLid) && below.some((q) => !q.onLid)) {
        const back = { x: -ax.x, y: -ax.y };
        const farU = forward(upper.far, ax), farD = forward(lower.far, ax);
        const endU = farU[farU.length - 1]!, endD = farD[farD.length - 1]!;
        const tip = add({ x: (endU.x + endD.x) / 2, y: (endU.y + endD.y) / 2 }, ax, Math.min(dist(endU, endD) / 2, 0.06 * u));
        const lidU = forward(upper.near.filter((_, k) => got[k]!.onLid), ax), lidD = forward(lower.near.filter((_, k) => below[k]!.onLid), ax);
        out.shadow.outline.polys.push(round(round([...farU, tip, ...forward([...farD].reverse(), back), ...lidD, ...forward([...lidU].reverse(), back)])));
        out.shadow.notes.push({ label: `${NAME[side]} 눈 — 모양`, value: "눈꼬리를 감싸 위 · 아래가 이어짐" });
        bySide.shadow[side]!.wraps = true;
      } else {
        if (upper) out.shadow.outline.polys.push(upper.poly);
        if (lower) out.shadow.outline.polys.push(lower.poly);
      }
    }

    const W = GUIDE.liner;
    /**
     * 이 눈의 라이너를 그림들(M)에서 찾는다.
     * relaxed = 반대쪽 눈에서 찾았을 때 기준을 낮춰 다시 보는 것 (라이너는 두 눈에 같이 그린다).
     * strict = 화장 사진을 직접 포갠 것에서 볼 때 — 사람이 달라 속눈썹 · 눈매 차이가 섞이니 기준을 높인다
     */
    const findLiner = (M: EyeMaps, relaxed: boolean, strict: boolean): LinerFound => {
    const dark = M.dark, fine = M.fine, eyeLo = M.lo;
    // 라이너 ① 속눈썹 선에 붙은 어두운 띠. 속쌍꺼풀 · 덮인 눈꺼풀이면 눈을 뜬 사진에서 안 보일 수 있다 — 그래도 꼬리는 보인다.
    // 실제 사진(2026-10-06, 덮인 눈꺼풀 한 사람 7장)에서는 이 띠가 한 번도 안 잡혔다: 맨얼굴의 속눈썹 선이 이미 어두워서 그 위에
    // 라이너를 그려도 밝기 차이가 작고, 눈 뜬 틈 가장자리는 영역이 옅다. 그 자리에서 잡히는 것은 눈썹 쪽으로 7 ~ 9% 떨어져 시작하는
    // 넓은 섀도(선이 아님)와 눈 앞머리의 윤곽 어긋남뿐이었다. 그래서 띠는 "속눈썹 선에 딱 붙어 시작할 때만" 받는다 (startBy 0)
    const need = Math.max(GUIDE.liner.minDark, 1.5 * eyeLo);
    const peaks = lid.map((p, k) => {
      const n = normal(lid, k, up);
      let m = 0;
      for (let d = 0; d <= 0.1 * u; d += step) m = Math.max(m, dark(p.x + n.x * d, p.y + n.y * d));
      return m;
    });
    // 라이너는 눈꼬리 쪽 절반에만 그리기도 한다 — 가장 어두운 세 자리의 평균으로 본다
    const top = [...peaks].sort((p, q) => q - p).slice(0, 3);
    const peak = top.reduce((s, q) => s + q, 0) / Math.max(1, top.length);
    let thick = 0, hasBand = false, wide = false;
    if (peak >= need) {
      const level = Math.max(GUIDE.liner.minDark * 0.6, 0.5 * peak);
      const band = longest(lid.map((p, k) => {
        const n = normal(lid, k, up);
        const r = run(dark, p, n, -0.03 * u, GUIDE.liner.reach * u, level, 0);
        return r && r.b - Math.max(0, r.a) >= GUIDE.liner.minThick * u ? { at: add(p, n, (Math.max(0, r.a) + r.b) / 2), thick: r.b - Math.max(0, r.a) } : null;
      }));
      if (band.length >= GUIDE.minStations) {
        thick = band.reduce((s, q) => s + q.thick, 0) / band.length;
        // 넓게 어두우면 선이 아니라 어두운 섀도다 (스모키 · 짙은 색 섀도)
        if (thick > GUIDE.liner.maxThick * u) wide = true;
        else hasBand = true;
      }
    }
    // 라이너 ①-b 속눈썹 선을 따라간 가는 어두운 선. ① 의 띠로 안 잡힌 것을 "가는 선만 남긴 그림" 에서 찾는다 —
    // 넓은 섀도는 거기서 0 에 가깝고, 속눈썹 선 위의 라이너는 눈꺼풀 선에서 눈 폭의 6 ~ 13% 위에 능선으로 남는다
    // 자리마다 증거 둘 중 하나면 "여기 라이너":
    //   (가) 가는 어두운 선이 지나간다 (가는 선만 남긴 그림에서 진하다)
    //   (나) 눈꺼풀 선의 어두운 띠가 맨얼굴보다 두꺼워졌고, 두꺼워진 자리가 뚜렷이 어두워졌다 — 섀도와 붙은 얇은 라이너는 (가) 로 안 잡힌다
    // 눈 앞머리 쪽 자리는 뺀다 (생성 그림의 눈 앞머리 윤곽이 어긋나 (가) · (나) 가 다 켜진다 — 화장 없는 그림에서 세 자리가 그랬다).
    let lashCells: { from: number; to: number; cells: { p: Pt; n: Pt; k: number; strong: boolean; top: number | null }[] } | null = null;
    if (!hasBand && !wide) {
      const Q = W.lash, k0 = Math.ceil(Q.skipInner * (lid.length - 1));
      const needFine = strict ? Q.fine.strict : relaxed ? Q.fine.relaxed : Q.fine.normal;
      const needGain = (strict ? Q.gain.strict : relaxed ? Q.gain.relaxed : Q.gain.normal) * u, needGainDark = strict ? Q.gainDark.strict : relaxed ? Q.gainDark.relaxed : Q.gainDark.normal;
      /** 밝기 줄에서 눈꺼풀 선에 붙은 어두운 띠의 위쪽 끝: 가장 어두운 자리에서 올라가, 그 위 맨살(또는 섀도) 밝기와의 중간이 되는 곳 */
      const bandTop = (ts: readonly number[], Ls: readonly number[]): number | null => {
        let i0 = -1;
        for (let i = 0; i < ts.length; i++) if (ts[i]! <= Q.core * u && (i0 < 0 || Ls[i]! < Ls[i0]!)) i0 = i;
        if (i0 < 0) return null;
        let above = Ls[i0]!;
        for (let i = i0 + 1; i < ts.length; i++) above = Math.max(above, Ls[i]!);
        if (above - Ls[i0]! < Q.contrast) return null;
        let i = i0;
        while (i + 1 < ts.length && Ls[i + 1]! < (above + Ls[i0]!) / 2) i++;
        return ts[i]!;
      };
      const cells = lid.map((p, k) => {
        const n = normal(lid, k, up);
        let f = 0;
        for (let d = Q.from * u; d <= Q.to * u; d += step) f = Math.max(f, fine(p.x + n.x * d, p.y + n.y * d));
        const ts: number[] = [], lb: number[] = [], lmade: number[] = [];
        for (let t = 0; t <= Q.reach * u; t += step) {
          const x = p.x + n.x * t, y = p.y + n.y * t, vb = rBare(x, y);
          if (vb <= 0) continue;
          ts.push(t);
          lb.push(vb);
          lmade.push(vb + M.dL(x, y));
        }
        const tb = bandTop(ts, lb), tm = bandTop(ts, lmade);
        let added = 0, cnt = 0;
        if (tb !== null && tm !== null) {
          for (let i = 0; i < ts.length; i++) {
            if (ts[i]! <= tb || ts[i]! > tm) continue;
            added += lb[i]! - lmade[i]!;
            cnt++;
          }
        }
        const thicker = tb !== null && tm !== null && tm - tb >= needGain && cnt > 0 && added / cnt >= needGainDark;
        return { p, n, k, strong: k >= k0 && (f >= needFine || thicker), top: tm };
      });
      // 가장 긴 묶음: 사이가 gapMax 자리 이하로 끊긴 것은 잇는다
      let best: number[] = [], cur: number[] = [];
      for (const c of cells) {
        if (!c.strong) continue;
        if (cur.length && c.k - cur[cur.length - 1]! > Q.gapMax + 1) {
          if (cur.length > best.length) best = cur;
          cur = [];
        }
        cur.push(c.k);
      }
      if (cur.length > best.length) best = cur;
      if (best.length >= (strict ? Q.min.strict : Q.min.normal)) {
        lashCells = { from: best[0]!, to: best[best.length - 1]!, cells };
      }
    }
    // 라이너 ② 꼬리: 눈꼬리 밖으로 뻗은 가늘고 어두운 선. 속눈썹 선의 띠가 안 보여도, 눈두덩이 넓게 어두워도 따로 찾는다 (look-wing.ts)
    const wf = findWing({ raw: M.raw, weight: M.weight, bareL: rBare, outer, ax, up, u, step, strict, minStations: GUIDE.minStations });
    // ── 이 눈에서 잰 것을 두 갈래로 정리한다 ──
    // (가) 속눈썹 선: 라이너가 보인 구간과 두께만 잰다. 그리는 영역은 눈머리 ~ 눈꼬리 전체로 정해 둔다 (아래 region)
    const whereOf = (a: number, b: number): string => {
      const share = `눈 길이의 ${Math.round((b - a) * 100)}%`;
      return b - a >= 0.7 ? `거의 전체 (${share})` : a >= 0.35 ? `눈꼬리 쪽 (${share})` : b <= 0.65 ? `눈머리 쪽 (${share})` : `가운데 (${share})`;
    };
    let seen: LinerRaw["seen"] = hasBand ? { a: 0, b: 1, thick: thick / u, where: whereOf(0, 1) } : null;
    if (lashCells) {
      const Q = W.lash, cells = lashCells.cells, last = lid.length - 1;
      // 두께: 어두운 띠의 위쪽 끝(눈꺼풀 선에서부터) — 속눈썹 뿌리까지 든 값이다
      const tops = cells.flatMap((c) => (c.strong && c.k >= lashCells!.from && c.k <= lashCells!.to && c.top !== null ? [c.top] : []));
      const thickness = Math.max(Q.thin * u, Math.min(Q.thick * u, tops.length ? median(tops) : Q.thin * u));
      seen = { a: lashCells.from / last, b: lashCells.to / last, thick: thickness / u, where: whereOf(lashCells.from / last, lashCells.to / last) };
    }
    const lashNote = seen
      ? `라이너가 보인 구간: ${seen.where} · 두께 ${pct(seen.thick)}`
      : wide
        ? `어두운 곳이 넓어서(${pct(thick / u)}) 선이 아니라 어두운 섀도로 봄`
        : `이 눈의 속눈썹 선에서는 라이너가 안 보임 (어두워진 정도 −${peak.toFixed(1)})`;
    // (나) 꼬리: 눈꼬리 점 밖으로 나간 선은 속눈썹 선과 따로 알린다 (아래 tailOf)
    const t = tailOf(wf);
    return { raw: { seen, tail: t.tail }, lashNote, wing: t.wing, wf };
    };
    /**
     * 꼬리 찾기 결과 → 잰 값과 그릴 것. 맨살 위로 뺀 것(wing)과, 속눈썹 선 끝을 따라 짧게 이어 그은 것(extend)을 구분해 적는다
     */
    const tailOf = (wf: WingFound, paired = false): { tail: LinerRaw["tail"]; wing: PartGuide } => {
      const tgtW = empty();
      let tail: LinerRaw["tail"] = null;
      const degWord = (deg: number): string => `눈 축에서 ${deg > 0 ? "위로 " : deg < 0 ? "아래로 " : ""}${Math.abs(deg)}°`;
      if (wf.wing) {
        const wing = wf.wing, sure = `꼬리일 확률 ${Math.round(wing.p * 100)}%`;
        tail = { len: wing.len / u, deg: wing.deg, free: wing.free / u, kind: "wing" };
        tgtW.outline.lines.push(wing.line);
        tgtW.dots.push({ at: wing.end, label: `${NAME[side]} 꼬리 끝` });
        tgtW.arrows.push({ from: wing.line[0]!, to: wing.end, label: `${Math.round((100 * wing.len) / u)}% · ${wing.deg}°` });
        tgtW.notes.push({
          label: `${NAME[side]} 눈`,
          value: `눈꼬리 점에서 ${pct(wing.len / u)}, ${degWord(wing.deg)} — 내 속눈썹 선 끝을 지나 맨살 위로 ${Math.round((100 * wing.free) / u)}% 뺌 (${paired ? `혼자서는 ${sure} 였지만 반대쪽 눈의 꼬리와 모양이 비슷해 받음` : sure})`,
        });
      } else if (wf.outerLine) {
        const line = wf.outerLine.line, tip = line[line.length - 1]!, v = sub(tip, outer);
        const deg = Math.round((Math.atan2(dot(v, up), dot(v, ax)) * 180) / Math.PI), len = dist(outer, tip);
        tail = { len: len / u, deg, free: 0, kind: "extend" };
        tgtW.outline.lines.push(line);
        tgtW.dots.push({ at: tip, label: `${NAME[side]} 꼬리 끝` });
        tgtW.arrows.push({ from: line[0]!, to: tip, label: `${Math.round((100 * len) / u)}% · ${deg}°` });
        tgtW.notes.push({ label: `${NAME[side]} 눈`, value: `눈꼬리 점에서 ${pct(len / u)}, ${degWord(deg)} — 속눈썹 선 끝을 따라 짧게 이어 그음 (맨살로는 거의 안 뺌)` });
      } else {
        tgtW.notes.push({ label: `${NAME[side]} 눈`, value: wf.why ? `없음 (${wf.why})` : "없음" });
      }
      return { tail, wing: tgtW };
    };
    /**
     * 속눈썹 선 아이라인의 영역: 눈머리(눈 안쪽 끝) ~ 눈꼬리(눈 바깥 끝) 전체를 띠로 정해 둔다 — 어느 구간에 그었는지를 찾아서 그리지 않는다.
     * 찾아서 그리면 토막 난 선 · 한쪽만 짧은 선이 나와 "거기만 그으라" 는 말이 된다 (2026-10-06 결정).
     * 띠는 눈머리 쪽을 가늘게(taper) 시작해 눈 길이의 taperTo 지점부터 제 두께가 된다 — 아이라인을 그리는 보통 모양이다 (잰 것이 아니라 정해 둔 것)
     */
    const region = (thickFrac: number): { line: Pt[]; zone: Pt[]; head: Pt; tail: Pt } => {
      const Q = W.lash, last = lid.length - 1;
      const cells = lid.map((p, k) => ({ p, n: normal(lid, k, up), t: thickFrac * u * (Q.taper + (1 - Q.taper) * Math.min(1, k / (Q.taperTo * last))) }));
      const line = cells.map((q) => add(q.p, q.n, Math.min(q.t / 2, Q.draw * u)));
      return { line, zone: outlineOf(cells.map((q) => add(q.p, q.n, q.t)), cells.map((q) => q.p)), head: line[0]!, tail: line[line.length - 1]! };
    };
    /** 반대쪽 눈에서 잰 꼬리를 이 눈에 옮겨 그린다 — 같은 길이 · 같은 각도로, 이 눈의 눈꼬리 점에서 */
    const mirrorTail = (tail: NonNullable<LinerRaw["tail"]>): PartGuide => {
      const tgt = empty(), th = (tail.deg * Math.PI) / 180, len = tail.len * u;
      const tip = { x: outer.x + (ax.x * Math.cos(th) + up.x * Math.sin(th)) * len, y: outer.y + (ax.y * Math.cos(th) + up.y * Math.sin(th)) * len };
      tgt.outline.lines.push([outer, tip]);
      tgt.dots.push({ at: tip, label: `${NAME[side]} 꼬리 끝` });
      tgt.arrows.push({ from: { x: (outer.x + tip.x) / 2, y: (outer.y + tip.y) / 2 }, to: tip, label: `${Math.round(tail.len * 100)}% · ${tail.deg}°` });
      tgt.notes.push({ label: `${NAME[side]} 눈`, value: "반대쪽 눈에서 잰 꼬리를 같은 길이 · 같은 각도로 옮겨 그림 (이쪽 눈에서는 안 재임)" });
      return tgt;
    };
    linerJobs.push({ side, find: findLiner, region, mirrorTail, tailOf });
  }
  // ── 아이라인 판단 ──
  // ① 정답사진에서 뗀 것으로 먼저 ② 속눈썹 선의 라이너가 한쪽 눈에서만 보이면 반대쪽은 기준을 낮춰 다시
  // ③ 아무것도 안 나온 눈은 화장 사진을 직접 포갠 것에서 (정답사진에 안 그려졌거나, 덮인 눈꺼풀에 가려 안 보이는 라이너)
  const linerRes = linerJobs.map((job) => ({ job, res: job.find(M0, false, false), fromRef: false, extra: [] as string[] }));
  if (linerRes.length === 2 && !linerRes[0]!.res.raw.seen !== !linerRes[1]!.res.raw.seen) {
    const miss = linerRes.find((q) => !q.res.raw.seen)!, again = miss.job.find(M0, true, false);
    if (again.raw.seen) miss.res = again;
  }
  // 꼬리가 한쪽 눈에서만 잡혔으면, 반대쪽 눈의 "꼬리일 수도 있는 선" 이 같은 모양인지 본다 (look-wing.ts pairWings)
  if (linerRes.length === 2) {
    pairWings(linerRes[0]!.res.wf, linerRes[1]!.res.wf, u).forEach((wf, k) => {
      const q = linerRes[k]!;
      if (wf === q.res.wf) return;
      const t = q.job.tailOf(wf, true);
      q.res = { ...q.res, wf, raw: { ...q.res.raw, tail: t.tail }, wing: t.wing };
    });
  }
  if (Mref) {
    for (const q of linerRes) {
      if (q.res.raw.seen || q.res.raw.tail) continue;
      const r = q.job.find(Mref, false, true);
      if (r.raw.seen || r.raw.tail) {
        q.res = r;
        q.fromRef = true;
      } else q.extra.push(`화장 사진을 직접 포갠 것에서도: ${r.lashNote}`);
    }
  }
  const linerFromRef = linerRes.some((q) => q.fromRef);
  const srcNote = (q: (typeof linerRes)[number]): string => (q.fromRef ? " [화장 사진을 직접 포갠 것에서 잼 — 정답사진에는 또렷이 안 그려짐]" : "");
  // (가) 속눈썹 선: 어느 눈에서든 라이너나 꼬리가 보였으면, 두 눈 모두 눈머리 ~ 눈꼬리 전체를 영역으로 그린다.
  // 두께는 그 눈에서 잰 것 → 반대쪽 눈에서 잰 것 → 못 쟀으면 가는 선(thin). 꼬리만 보인 덮인 눈꺼풀도 속눈썹 선은 긋는다고 본다
  const anyLiner = linerRes.some((q) => q.res.raw.seen || q.res.raw.tail);
  for (const q of linerRes) {
    const side = q.job.side, own = q.res.raw.seen, other = linerRes.find((o) => o !== q)?.res.raw.seen ?? null;
    if (!anyLiner) {
      out.liner.notes.push({ label: `${NAME[side]} 눈`, value: [q.res.lashNote, ...q.extra].join(" · ") });
      continue;
    }
    const thickFrac = own?.thick ?? other?.thick ?? GUIDE.liner.lash.thin;
    const r = q.job.region(thickFrac);
    out.liner.found = true;
    out.liner.outline.lines.push(r.line);
    out.liner.zones.push({ poly: r.zone, label: "아이라인 영역" });
    out.liner.dots.push({ at: r.head, label: `${NAME[side]} 눈머리` }, { at: r.tail, label: `${NAME[side]} 눈꼬리` });
    out.liner.notes.push({
      label: `${NAME[side]} 눈`,
      value: `눈머리 ~ 눈꼬리 전체 (정해 둔 영역) · 그린 두께 ${pct(thickFrac)}${own ? "" : other ? " (반대쪽 눈에서 잰 두께)" : " (못 재서 가는 선으로)"} · ${q.res.lashNote}${srcNote(q)}`,
    });
    bySide.liner[side] = { thick: thickFrac, where: own?.where ?? null };
  }
  // (나) 꼬리: 따로. 한쪽 눈에서만 보이면 반대쪽 눈에 같은 길이 · 각도로 옮겨 그린다
  let tailMirrored = false;
  const mergeWing = (t: PartGuide): void => {
    out.wing.outline.lines.push(...t.outline.lines);
    out.wing.dots.push(...t.dots);
    out.wing.arrows.push(...t.arrows);
    out.wing.notes.push(...t.notes);
  };
  for (const q of linerRes) {
    const side = q.job.side, own = q.res.raw.tail, other = linerRes.find((o) => o !== q)?.res.raw.tail ?? null;
    if (own) {
      mergeWing(q.res.wing);
      if (q.fromRef) out.wing.notes.push({ label: `${NAME[side]} 눈 — 어디서 쟀나`, value: "화장 사진을 직접 포갠 것에서 (정답사진에는 또렷이 안 그려짐)" });
      out.wing.found = true;
      bySide.wing[side] = { len: own.len, deg: own.deg, kind: own.kind };
    } else if (other) {
      mergeWing(q.job.mirrorTail(other));
      out.wing.found = true;
      bySide.wing[side] = { len: other.len, deg: other.deg, kind: other.kind };
      tailMirrored = true;
    } else mergeWing(q.res.wing);
  }
  if (!Mref && refLayer) out.liner.notes.push({ label: "화장 사진에서 직접", value: "칸이 달라 못 씀" });
  // 색: 섀도우는 "가는 어두운 선"(라이너)이 아닌 칸들의 색, 라이너는 그 선 위 칸들의 색.
  // 어두워진 칸을 통째로 섀도우에서 빼면 안 된다 — 주황 · 갈색 섀도는 살보다 어두워서 다 빠지고 옅은 가장자리 색만 남는다 (2026-10-06 주황 샘플)
  const lineLo = GUIDE.liner.lineDark / 2;
  if (out.shadow.found) out.shadow.color = colorOf("eye", (i) => (S.eye[i]! >= eyeLo && fineArr[i]! < lineLo ? S.eye[i]! : 0)) ?? colorOf("eye", (i) => (S.eye[i]! >= eyeLo ? S.eye[i]! : 0));
  // 아이라인 · 꼬리의 색: 가는 어두운 선 위 칸들의 색. 못 구하면(화장 사진에서 직접 잰 것 등) 짙은 갈색
  const linerColor = colorOf("eye", (i) => (fineArr[i]! >= lineLo ? fineArr[i]! : 0)) ?? colorOf("eye", (i) => (darkArr[i]! >= GUIDE.liner.minDark ? darkArr[i]! : 0)) ?? ([48, 40, 40] as [number, number, number]);
  if (out.liner.found) out.liner.color = linerColor;
  if (out.wing.found) out.wing.color = linerColor;

  // ── 눈썹 ─────────────────────────────────────────
  const browPart = layer.parts.brow, browLo = layer.present.brow.lo, browDarkLo = Math.max(GUIDE.brow.minDark, browLo);
  const browDark = new Float32Array(w * h);
  for (let i = 0; i < browDark.length; i++) browDark[i] = browPart.mask[i]! * Math.max(0, -browPart.dL[i]!);
  const sBrow = reader(browDark);
  // 눈썹이 "보이는" 모양 = 둘레 맨살보다 어두운 띠. 맨얼굴에서 재면 내 눈썹, 눈썹 화장을 입힌 것에서 재면 그려야 할 눈썹이다.
  // 떼어 낸 얼룩(짙어진 칸)만 테두리로 그리면 내 눈썹 위에 덧칠한 만큼만 나와서 눈썹 모양이 안 된다
  const madeL = new Float32Array(w * h);
  for (let i = 0; i < madeL.length; i++) madeL[i] = bareL[i]! + browPart.mask[i]! * browPart.amount[i]! * browPart.dL[i]!;
  const rMade = reader(madeL);
  // 먼저 좌우를 다 잰 뒤에 판단한다 — 한쪽이 뚜렷하면 다른 쪽은 조금 모자라도 받는다 (잔머리에 가려 덜 재인 쪽을 살린다)
  const browPre = eyes.map(({ side, eye, brow }) => {
    // 그쪽 눈썹에서 어두워진 칸들의 보통 진하기와 넓이
    const vals: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = browDark[y * w + x]!;
      if (v >= browDarkLo && sideOf(x + x0) === side) vals.push(v);
    }
    if (vals.length / (u * u) < GUIDE.minArea.brow) return null;
    const level = Math.max(browDarkLo, GUIDE.edge * median(vals));
    const eyeC = centroid([P(eye.inner), P(eye.outer)]);
    // 가운데 선: 꼬리 → 앞머리, 양 끝 밖으로 조금 더 (own = 내 눈썹 자리, 아니면 끝 밖)
    type Band = { a: number; b: number };
    const mids = brow.upper.map((id, k) => ({ x: (P(id).x + P(brow.lower[k]!).x) / 2, y: (P(id).y + P(brow.lower[k]!).y) / 2 }));
    const tailDir = unit(sub(mids[0]!, mids[1]!)), headDir = unit(sub(mids[mids.length - 1]!, mids[mids.length - 2]!));
    // half = 얼굴 점(위 · 아래 눈썹 점)이 잡은 반 두께 — 눈썹이 "이 안 어딘가에 있다" 는 범위로만 쓴다 (보이는 눈썹의 두 배쯤이다)
    const halves = brow.upper.map((id, k) => dist(P(id), P(brow.lower[k]!)) / 2);
    const line: { p: Pt; own: boolean; half: number }[] = [];
    for (let j = GUIDE.brow.extend; j >= 1; j--) line.push({ p: add(mids[0]!, tailDir, j * GUIDE.brow.extendStep * u), own: false, half: halves[0]! / 2 });
    for (let k = 0; k < mids.length; k++) {
      line.push({ p: mids[k]!, own: true, half: halves[k]! });
      if (k + 1 < mids.length) line.push({ p: { x: (mids[k]!.x + mids[k + 1]!.x) / 2, y: (mids[k]!.y + mids[k + 1]!.y) / 2 }, own: true, half: (halves[k]! + halves[k + 1]!) / 2 });
    }
    for (let j = 1; j <= GUIDE.brow.extend; j++) line.push({ p: add(mids[mids.length - 1]!, headDir, j * GUIDE.brow.extendStep * u), own: false, half: halves[halves.length - 1]! / 2 });
    /**
     * 밝기 줄(아래 = 눈 쪽이 −, 위가 +)에서 눈썹 띠: 가운데 근처의 가장 어두운 자리에서 위 · 아래로 걸어가,
     * 그쪽 맨살 밝기와의 중간이 되는 곳에서 멈춘다. 한쪽에 밝은 맨살이 안 보이면(그늘 · 섀도와 붙어 있음) 반대쪽 기준을 쓴다
     */
    const bandOf = (ts: readonly number[], Ls: readonly number[], half: number): Band | null => {
      const sm = Ls.map((_, i) => (Ls[Math.max(0, i - 1)]! + Ls[i]! + Ls[Math.min(Ls.length - 1, i + 1)]!) / 3);
      let d0 = -1;
      for (let i = 0; i < sm.length; i++) if (Math.abs(ts[i]!) <= half && (d0 < 0 || sm[i]! < sm[d0]!)) d0 = i;
      if (d0 < 0) return null;
      let upSkin = sm[d0]!, downSkin = sm[d0]!;
      for (let i = d0 + 1; i < sm.length; i++) upSkin = Math.max(upSkin, sm[i]!);
      for (let i = 0; i < d0; i++) downSkin = Math.max(downSkin, sm[i]!);
      const cUp = upSkin - sm[d0]!, cDown = downSkin - sm[d0]!, c = Math.max(cUp, cDown);
      if (c < GUIDE.brow.minContrast) return null;
      const lvUp = sm[d0]! + (cUp >= GUIDE.brow.minContrast ? cUp : c) / 2, lvDown = sm[d0]! + (cDown >= GUIDE.brow.minContrast ? cDown : c) / 2;
      let iu = d0, id = d0;
      while (iu + 1 < sm.length && sm[iu + 1]! < lvUp) iu++;
      while (id - 1 >= 0 && sm[id - 1]! < lvDown) id--;
      return { a: ts[id]!, b: ts[iu]! };
    };
    const reach = GUIDE.brow.reach * u;
    const st = line.map((q, k) => {
      const tan = sub(line[Math.min(line.length - 1, k + 1)]!.p, line[Math.max(0, k - 1)]!.p);
      const n = perpToward(tan, eyeC, q.p);   // 눈 반대쪽 (위)
      const none = { ...q, n, mine: null as Band | null, made: null as Band | null, changed: false };
      // 이 자리를 가로지른 밝기 줄: 맨얼굴 것과, 눈썹 화장을 입힌 것. 떼어 낸 칸 밖은 뺀다
      // 위쪽(이마)은 넉넉히, 아래쪽(눈 쪽)은 얼굴 점이 잡은 눈썹 자리에서 조금만 더 — 아래로 멀리 가면 쌍꺼풀 선 · 속눈썹이 들어온다
      const ts: number[] = [], lb: number[] = [], lmade: number[] = [];
      for (let t = -Math.min(reach, q.half + GUIDE.brow.margin * u); t <= q.half + 2 * GUIDE.brow.margin * u; t += step) {
        const x = q.p.x + n.x * t, y = q.p.y + n.y * t, v = rBare(x, y);
        if (v <= 0) continue;
        ts.push(t);
        lb.push(v);
        lmade.push(rMade(x, y));
      }
      if (ts.length < 8) return none;
      const mine = bandOf(ts, lb, q.half), made = bandOf(ts, lmade, q.half);
      if (!made || made.b - made.a < step) return { ...none, mine };
      // 화장으로 짙어진 띠가 이 눈썹에 닿아 있나
      const dark = run(sBrow, q.p, n, -reach, reach, level);
      return { ...none, mine, made, changed: !!dark && dark.a <= made.b + gap && dark.b >= made.a - gap };
    });
    const own = st.filter((q) => q.own);
    return { side, st, own, changed: own.filter((q) => q.changed).length / own.length };
  });
  for (const pre of browPre) {
    if (!pre) continue;
    const { side, st, own, changed } = pre, other = browPre.find((q) => q && q.side !== side)?.changed ?? 0;
    if (changed < GUIDE.brow.cover && !(changed >= GUIDE.brow.coverPair * GUIDE.brow.cover && other >= GUIDE.brow.cover)) {
      out.brow.notes.push({ label: `${NAME[side]} 눈썹`, value: `눈썹 길이의 ${Math.round(changed * 100)}%만 짙어짐 — 눈썹 화장으로 안 봄` });
      continue;
    }
    // 그릴 눈썹: 눈썹이 이어져 보이는 가장 긴 구간. 끝 밖 자리는 화장으로 짙어진 곳만 (관자놀이 머리카락을 눈썹으로 안 잡게)
    let from = -1, to = -1;
    for (let k = 0, start = -1; k <= st.length; k++) {
      const ok = k < st.length && !!st[k]!.made && (st[k]!.own || st[k]!.changed);
      if (ok && start < 0) start = k;
      if (!ok && start >= 0) {
        if (k - start > to - from + (from < 0 ? 0 : 1)) [from, to] = [start, k - 1];
        start = -1;
      }
    }
    const used = from < 0 ? [] : st.slice(from, to + 1);
    const seen = used.filter((q) => q.own).length / own.length;
    if (seen < GUIDE.brow.cover) {
      out.brow.notes.push({ label: `${NAME[side]} 눈썹`, value: `눈썹이 이어져 보이는 곳이 ${Math.round(seen * 100)}%뿐 — 모양을 못 잼 (머리카락에 가렸을 수 있음)` });
      continue;
    }
    const lo = smooth(used.map((q) => q.made!.a)), hi = smooth(used.map((q) => q.made!.b));
    const spotOf = (k: number, t: number): Pt => add(used[k]!.p, used[k]!.n, t);
    const endOf = (k: number): Pt => spotOf(k, (lo[k]! + hi[k]!) / 2);
    out.brow.found = true;
    out.brow.outline.polys.push(outlineOf(used.map((_, k) => spotOf(k, hi[k]!)), used.map((_, k) => spotOf(k, lo[k]!))));
    out.brow.dots.push({ at: endOf(0), label: `${NAME[side]} 눈썹 꼬리` }, { at: endOf(used.length - 1), label: `${NAME[side]} 눈썹 앞머리` });
    // 눈썹산: 위쪽 가장자리가 "꼬리 끝 ~ 앞머리 끝을 이은 선" 에서 가장 높이 솟은 자리
    const tops = used.map((_, k) => spotOf(k, hi[k]!)), chord = unit(sub(tops[tops.length - 1]!, tops[0]!));
    const rise = tops.map((q, k) => dot(sub(q, tops[0]!), used[k]!.n) - dot(sub(q, tops[0]!), chord) * dot(chord, used[k]!.n));
    let peak = 0;
    rise.forEach((v, k) => {
      if (v > rise[peak]!) peak = k;
    });
    const archAt = dot(sub(tops[peak]!, tops[0]!), chord) / (dist(tops[0]!, tops[tops.length - 1]!) || 1);
    out.brow.dots.push({ at: tops[peak]!, label: `${NAME[side]} 눈썹산` });
    out.brow.notes.push({ label: `${NAME[side]} 눈썹 — 눈썹산`, value: `꼬리에서 눈썹 길이의 ${Math.round(archAt * 100)}% 지점` });
    out.brow.measures.push({ from: spotOf(peak, lo[peak]!), to: tops[peak]!, label: `${Math.round((100 * (hi[peak]! - lo[peak]!)) / u)}%` });
    const mean = (v: readonly number[]): number => v.reduce((sum, q) => sum + q, 0) / Math.max(1, v.length);
    const thick = mean(hi.map((q, k) => q - lo[k]!)), mineThick = st.filter((q) => q.mine).map((q) => q.mine!.b - q.mine!.a);
    out.brow.notes.push({ label: `${NAME[side]} 눈썹 — 두께`, value: mineThick.length ? `${pct(thick / u)} (맨얼굴 ${Math.round((100 * mean(mineThick)) / u)}%)` : pct(thick / u) });
    // 꼬리: 맨얼굴에서 눈썹이 보이기 시작하는 자리보다 얼마나 더 나갔나
    const mineFrom = st.findIndex((q) => q.mine);
    const more = mineFrom > from ? dist(st[from]!.p, st[mineFrom]!.p) / u : 0;
    out.brow.notes.push({ label: `${NAME[side]} 눈썹 — 꼬리`, value: mineFrom < 0 ? pct(dist(endOf(0), endOf(used.length - 1)) / u) + " 길이" : more >= GUIDE.brow.extendStep / 2 ? `맨얼굴보다 ${pct(more)} 더 길게` : "맨얼굴 눈썹 끝까지" });
    bySide.brow[side] = { thick: thick / u, more: more >= GUIDE.brow.extendStep / 2 ? more : 0, arch: archAt };
  }
  if (out.brow.found) out.brow.color = colorOf("brow", (i) => (browDark[i]! >= browDarkLo ? browDark[i]! : 0));

  // ── 볼 (블러셔) ─────────────────────────────────────────
  const cheekPart = layer.parts.cheek, redArr = new Float32Array(w * h);
  for (let i = 0; i < redArr.length; i++) redArr[i] = cheekPart.mask[i]! * Math.max(0, cheekPart.da[i]!);
  const sRed = reader(redArr), C = GUIDE.cheek;
  const noseTip = P(1), faceDown = unit(sub(noseTip, P(LM.glabella)));
  /** 그쪽 볼에서 가장 붉어진 정도: 위쪽 2% 자리 (한두 칸 튀는 값 말고) */
  const redPeak = (side: "R" | "L"): number => {
    const vals: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cheekPart.mask[i]! >= 0.5 && sideOf(x + x0) === side) vals.push(redArr[i]!);
    }
    vals.sort((p, q) => p - q);
    return vals.length ? vals[Math.floor((vals.length - 1) * 0.98)]! : 0;
  };
  const peaks = { R: redPeak("R"), L: redPeak("L") };
  for (const { side, eye } of eyes) {
    const peak = peaks[side], other = peaks[side === "R" ? "L" : "R"], need = Math.max(C.minRed, C.noiseK * layer.present.cheek.noise);
    // 블러셔는 양쪽 볼에 같이 바른다 — 반대쪽이 기준을 넘었으면 이쪽은 pair 배만 넘어도 받는다 (3.3 / 2.9 로 한쪽만 걸린 적이 있다)
    if (peak < need && !(peak >= C.pair * need && other >= need)) {
      if (peak >= 0.6 * need) out.cheek.notes.push({ label: `${NAME[side]} 볼`, value: `조금 붉어졌지만(${peak.toFixed(1)}) 기준(${need.toFixed(1)}) 아래 — 블러셔로 안 봄` });
      continue;
    }
    // 중심 = 테두리 기준보다 붉은 칸들의 무게 중심. 모양(긴 방향)도 같은 칸들로
    const level = C.edge * peak;
    let cx = 0, cy = 0, ws = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = redArr[y * w + x]!;
      if (v < level || sideOf(x + x0) !== side) continue;
      cx += v * (x + x0);
      cy += v * (y + y0);
      ws += v;
    }
    if (!ws) continue;
    const c = { x: cx / ws, y: cy / ws };
    let sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = redArr[y * w + x]!;
      if (v < level || sideOf(x + x0) !== side) continue;
      const dx = x + x0 - c.x, dy = y + y0 - c.y;
      sxx += v * dx * dx;
      syy += v * dy * dy;
      sxy += v * dx * dy;
    }
    /** 중심에서 사방으로 그 기준까지 — 반지름이 한 방향만 튀지 않게 둘레를 따라 고른다 */
    const ringOf = (lv: number): Pt[] | null => {
      const reached: { d: Pt; r: number }[] = [];
      for (let k = 0; k < C.rays; k++) {
        const th = (k / C.rays) * 2 * Math.PI, d = { x: Math.cos(th), y: Math.sin(th) };
        const r = run(sRed, c, d, 0, C.reach * u, lv, gap);
        if (r) reached.push({ d, r: r.b });
      }
      if (reached.length < C.rays * 0.75) return null;
      const near3 = (v: readonly number[], k: number): number[] => [v[(k - 1 + v.length) % v.length]!, v[k]!, v[(k + 1) % v.length]!];
      const med = reached.map((_, k) => near3(reached.map((q) => q.r), k).sort((p, q) => p - q)[1]!);
      return round(round(reached.map((q, k) => add(c, q.d, near3(med, k).reduce((sum, v) => sum + v, 0) / 3))));
    };
    const edge = ringOf(level);
    if (!edge) {
      out.cheek.notes.push({ label: `${NAME[side]} 볼`, value: "붉어진 곳이 한 덩어리가 아니어서 모양을 못 잼" });
      continue;
    }
    out.cheek.found = true;
    out.cheek.outline.polys.push(edge);
    out.cheek.dots.push({ at: c, label: `${NAME[side]} 볼 중심` });
    const coreRing = ringOf(C.core * peak);
    if (coreRing) out.cheek.zones.push({ poly: coreRing, label: "가장 진하게" });
    // 자리: 눈 가운데에서 아래로 · 바깥으로 얼마나 (눈 폭 대비), 말로는 눈 ~ 코끝 사이 어디쯤
    const eyeMid = { x: (P(eye.inner).x + P(eye.outer).x) / 2, y: (P(eye.inner).y + P(eye.outer).y) / 2 }, axis = unit(sub(P(eye.outer), P(eye.inner)));
    const downBy = dot(sub(c, eyeMid), faceDown), outBy = dot(sub(c, eyeMid), axis), noseBy = dot(sub(noseTip, eyeMid), faceDown) || 1;
    const high = downBy / noseBy < 0.4 ? "눈 밑 가까이(높게)" : downBy / noseBy <= 1 ? "광대 높이(눈과 코끝 사이)" : "코끝보다 아래(낮게)";
    const wide = outBy / u < -0.15 ? "코 옆 앞볼" : outBy / u <= 0.15 ? "눈동자 아래" : outBy / u <= 0.5 ? "눈동자와 눈꼬리 사이 아래" : "눈꼬리보다 바깥 광대";
    // 모양: 붉은 칸들이 퍼진 긴 방향과 긴 쪽 / 짧은 쪽
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, gapEig = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + gapEig, l2 = Math.max(1e-6, tr / 2 - gapEig), ratio = Math.sqrt(l1 / l2);
    let major = unit(Math.abs(sxy) > 1e-6 ? { x: l1 - syy, y: sxy } : sxx >= syy ? { x: 1, y: 0 } : { x: 0, y: 1 });
    if (dot(major, axis) < 0) major = { x: -major.x, y: -major.y };   // 얼굴 바깥쪽을 보게
    const lift = -dot(major, faceDown);   // + 면 바깥으로 갈수록 위(관자놀이 쪽)
    const shape = ratio < C.round ? "동그랗게" : lift > 0.26 ? "관자놀이 쪽으로 사선으로 길게" : lift < -0.26 ? "턱 쪽으로 사선으로 길게" : "옆으로 길게";
    const radius = edge.reduce((sum, q) => sum + dist(q, c), 0) / edge.length;
    if (ratio >= C.round) {
      // 쓸어 주는 방향: 긴 방향으로, 테두리 안쪽 끝에서 바깥쪽 끝으로
      const half = Math.max(...edge.map((q) => Math.abs(dot(sub(q, c), major)))) * 0.8;
      out.cheek.arrows.push({ from: add(c, major, -half), to: add(c, major, half), label: "쓸어 주는 방향" });
    }
    const strength = peak >= C.strong ? "또렷하게" : "연하게";
    out.cheek.notes.push({ label: `${NAME[side]} 볼 — 자리`, value: `${wide}, ${high} (눈 가운데에서 아래로 ${pct(downBy / u)}, 바깥으로 ${pct(outBy / u)})` });
    out.cheek.notes.push({ label: `${NAME[side]} 볼 — 모양`, value: `${shape}, 지름 ${pct((2 * radius) / u)}` });
    out.cheek.notes.push({ label: `${NAME[side]} 볼 — 진하기`, value: `${strength} (붉어진 정도 ${peak.toFixed(1)})` });
    bySide.cheek[side] = { where: `${wide}, ${high}`, shape, size: (2 * radius) / u, strength };
  }
  if (out.cheek.found) out.cheek.color = colorOf("cheek", (i) => (redArr[i]! >= C.edge * C.minRed ? redArr[i]! : 0));

  // ── 입술 ─────────────────────────────────────────
  // 립스틱은 입술 전체에 바른다 — 모양은 내 입술선(얼굴 점)을 그대로 쓰고 색만 가져온다. 점 사이는 곡선으로 잇는다 (곧게 이으면 각진 입술이 된다).
  // 가운데만 진하면(그러데이션) 진하게 바를 가운데 자리를 테두리 하나로 더 그린다
  const lip = layer.parts.lip;
  let lipSum = 0, lipN = 0;
  for (let i = 0; i < w * h; i++) {
    if (lip.mask[i]! < 0.5) continue;
    lipSum += lip.amount[i]!;
    lipN++;
  }
  if (lipN && lipSum / lipN >= 0.5) {
    const outline = LM.lipsOuter.map(P), c = centroid(outline);
    out.lip.found = true;
    out.lip.outline.polys.push(through(outline));
    out.lip.color = colorOf("lip", (i) => (lip.mask[i]! >= 0.5 ? S.lip[i]! : 0));
    // 가운데(입술 중심에 가까운 절반) 대 가장자리의 진하기
    const half = outline.reduce((s, q) => s + dist(q, c), 0) / outline.length / 2;
    let inS = 0, inN = 0, outS = 0, outN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (lip.mask[i]! < 0.5) continue;
      if (Math.hypot((x + x0 - c.x) / 2, y + y0 - c.y) < half / 2) {
        inS += S.lip[i]!;
        inN++;
      } else {
        outS += S.lip[i]!;
        outN++;
      }
    }
    const ratio = inN && outN && inS > 0 ? outS / outN / (inS / inN) : 1;
    out.lip.notes.push({ label: "바르는 범위", value: ratio < 0.6 ? "가운데를 진하게, 가장자리는 옅게" : "입술선을 따라 전체" });
    if (ratio < 0.6) {
      // 위에서 "가운데" 로 센 바로 그 자리: 가로 반지름 half, 세로 반지름 half / 2 인 타원
      out.lip.zones.push({ poly: Array.from({ length: 24 }, (_, k) => ({ x: c.x + half * Math.cos((k / 24) * 2 * Math.PI), y: c.y + (half / 2) * Math.sin((k / 24) * 2 * Math.PI) })), label: "가운데를 진하게" });
    }
  }
  // ── 따라 하는 순서: 좌우에서 잰 값을 평균해 문장으로. 한쪽에만 보이면 그렇게 알린다 ─────────
  const both = <T>(m: Sides<T>): T[] => (["R", "L"] as const).flatMap((k) => (m[k] ? [m[k]!] : []));
  const avg = (v: readonly number[]): number => v.reduce((sum, q) => sum + q, 0) / Math.max(1, v.length);
  const p100 = (v: number): number => Math.round(v * 100);
  const oneSide = "정답사진에서 한쪽에만 보임 — 좌우가 다르게 그려진 것일 수 있다";
  const sh = both(bySide.shadow);
  if (out.shadow.found && sh.length) {
    out.shadow.steps.push(`속눈썹 선에서 시작해 위로, 가장 높은 곳이 눈 폭의 ${p100(avg(sh.map((q) => q.height)))}%가 되게 펴 바른다 (그림의 흰 선)`);
    const beyond = avg(sh.map((q) => q.beyond));
    if (beyond > 0) out.shadow.steps.push(`눈꼬리 밖으로 눈 폭의 ${p100(beyond)}%까지 자연스럽게 뺀다`);
    const core = sh.find((q) => q.core)?.core;
    if (core) out.shadow.steps.push(`가장 진한 색은 ${core}에 올린다 (그림의 진한 자리)`);
    if (sh.some((q) => q.wraps)) out.shadow.steps.push("눈꼬리를 감싸듯 눈 밑 바깥쪽까지 이어 바른다");
    else if (sh.some((q) => q.under)) out.shadow.steps.push("눈 밑에도 얇게 바른다");
    if (sh.length === 1) out.shadow.notes.push({ label: "좌우", value: oneSide });
    else if (sh[0]!.under !== sh[1]!.under) out.shadow.notes.push({ label: "좌우", value: "눈 밑 섀도우가 한쪽 눈에만 보임" });
  }
  const li = both(bySide.liner);
  if (out.liner.found && li.length) {
    out.liner.steps.push(`눈머리 점에서 눈꼬리 점까지 속눈썹 선을 따라 긋는다 — 눈머리 쪽은 가늘게 시작한다 (그림의 띠)`);
    const measured = li.some((q) => q.where);
    out.liner.steps.push(measured ? `두께는 눈 폭의 ${p100(avg(li.map((q) => q.thick)))}%쯤 (속눈썹 뿌리까지 든 두께)` : "두께는 가늘게 — 이 사진에서는 속눈썹 선의 선이 안 보여(덮인 눈꺼풀 등) 두께는 못 쟀다");
    const where = li.find((q) => q.where && !q.where.startsWith("거의 전체"))?.where;
    if (where) out.liner.steps.push(`정답사진에서 선이 또렷하게 보인 곳은 ${where} — 거기를 조금 더 또렷하게`);
    if (linerFromRef) out.liner.steps.push("※ 화장 사진을 직접 포갠 것에서 잰 것 — 정답사진 그림에는 또렷이 안 보일 수 있다");
  }
  const wi = both(bySide.wing);
  if (out.wing.found && wi.length) {
    const deg = Math.round(avg(wi.map((q) => q.deg))), len = p100(avg(wi.map((q) => q.len)));
    const dir = deg > 3 ? `위로 ${deg}°` : deg < -3 ? `아래로 ${-deg}°` : "옆으로 곧게";
    out.wing.steps.push(wi.every((q) => q.kind === "extend")
      ? `눈꼬리 점에서 속눈썹 선 끝을 따라 눈 폭의 ${len}%만 짧게 이어 긋는다 (${dir} 방향, 그림의 화살표)`
      : `눈꼬리 점에서 ${dir} 방향으로, 눈 폭의 ${len}% 자리(그림의 꼬리 끝 점)까지 뺀다`);
    out.wing.steps.push("꼬리 끝은 뾰족하게, 속눈썹 선의 아이라인과 끊기지 않게 잇는다");
    if (tailMirrored) out.wing.steps.push("※ 한쪽 눈에서만 재여서, 반대쪽 눈에는 같은 길이 · 같은 각도로 옮겨 그렸다");
    if (linerFromRef) out.wing.steps.push("※ 화장 사진을 직접 포갠 것에서 잰 것일 수 있다 (잰 값의 \"어디서 쟀나\" 를 본다)");
  }
  const br = both(bySide.brow);
  if (out.brow.found && br.length) {
    out.brow.steps.push("앞머리 점에서 시작해 결을 따라 채운다 — 앞머리는 옅게");
    out.brow.steps.push(`눈썹산은 꼬리에서 눈썹 길이의 ${p100(avg(br.map((q) => q.arch)))}% 지점 — 거기까지 올렸다가 꼬리 점으로 내린다`);
    out.brow.steps.push(`두께는 눈 폭의 ${p100(avg(br.map((q) => q.thick)))}%쯤 (그림의 테두리 안을 채운다)`);
    const more = avg(br.map((q) => q.more));
    if (more > 0) out.brow.steps.push(`꼬리는 내 눈썹보다 눈 폭의 ${p100(more)}% 더 길게 뺀다`);
    if (br.length === 1) out.brow.notes.push({ label: "좌우", value: oneSide });
  }
  const ch = both(bySide.cheek);
  if (out.cheek.found && ch.length) {
    out.cheek.steps.push(`${ch[0]!.where}에 중심을 잡는다 (그림의 볼 중심 점)`);
    out.cheek.steps.push(`${ch[0]!.shape} 펴 바른다 — 지름은 눈 폭의 ${p100(avg(ch.map((q) => q.size)))}%쯤, 테두리 쪽으로 갈수록 옅게`);
    out.cheek.steps.push(`색은 ${ch[0]!.strength} 올린다`);
    if (ch.length === 1) out.cheek.notes.push({ label: "좌우", value: oneSide });
  }
  if (out.lip.found) {
    out.lip.steps.push(out.lip.zones.length ? "입술 가운데(그림의 안쪽 테두리)에 색을 진하게 올린다" : "입술선을 따라 전체에 고르게 바른다");
    if (out.lip.zones.length) out.lip.steps.push("가장자리로 갈수록 옅게 펴서 입술선에서 자연스럽게 흐려지게 한다");
  }
  return out;
}
