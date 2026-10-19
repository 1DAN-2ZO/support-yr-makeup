/**
 * 웜/쿨 "경향" 판정 — 보정 전 볼 색의 b*(노란기) 하나를 기준값 T 와 견준다 (2026-10-12, v0).
 *
 * 왜 이 값인가 (Deep Armocromia 4,910장을 skin-batch-probe 로 잰 결과, 흰자 보정 끔):
 *  - 흰자 보정을 켠 쪽이 오히려 덜 갈렸다 (같은 458장에서 b* 분리도 0.70 → 0.60). 그래서 **보정 전 값**을 쓴다.
 *  - 축은 b* · 채도 C* · 논문식 D 가 비슷했고(분리도 0.67 안팎) 색상각 h° 는 거의 못 갈랐다(0.55). 가장 단순한 b* 로 간다.
 *  - 순수 warm/cool 유형 1,546장에서 train 최적 T = 21.64. 애매 폭 ±3 이면 test 정확도 73.7%(판정한 것만), 판정 비율은 train 69%.
 *    폭 0(전부 판정)이면 68.3%. 계절 라벨(4,910장)은 62.8% → 폭 3 에서 68.5%.
 *  - 여러 설정(8가지)을 test 숫자를 보며 견줬으니 실제는 이보다 조금 낮을 수 있다. 웹캠·폰 사진은 데이터셋과 촬영 조건이 다르다.
 * 그래서 "웜이다/쿨이다" 가 아니라 "웜 쪽 / 쿨 쪽 / 애매" 로만 말한다. 화장품 추천에서도 같은 색 후보들 사이의 순서를
 * 바꾸는 데만 쓰는 게 안전하다 (틀려도 색이 크게 달라지지 않게).
 *
 * 값을 바꾸면 `VERDICT_VERSION` 을 올린다. 순수 함수 — 화면은 skin-tone-probe.ts.
 */

import type { Lab } from "./color";

export const VERDICT_VERSION = "warmcool-v0.1";

export interface VerdictConfig {
  /** 지금은 b* 하나만 */
  axis: "b";
  /** b* 가 이보다 크면 웜 쪽 */
  threshold: number;
  /** |b* − threshold| 가 이 값보다 작으면 애매 */
  margin: number;
}

export const WARMCOOL_V0: VerdictConfig = { axis: "b", threshold: 21.64, margin: 3 };

export type Tendency = "warm" | "cool" | "ambiguous";

export interface Verdict {
  tendency: Tendency;
  /** 잰 b* */
  value: number;
  threshold: number;
  margin: number;
  /** value − threshold. 양수면 웜 쪽으로 기움 */
  diff: number;
}

/** 보정 전 볼 색의 Lab 으로 웜/쿨 경향을 말한다. 경계(|diff| = margin)는 애매가 아니라 판정 쪽 (skin-threshold.evaluate 와 같은 규칙) */
export function warmCoolVerdict(lab: Pick<Lab, "b">, cfg: VerdictConfig = WARMCOOL_V0): Verdict {
  const diff = lab.b - cfg.threshold;
  const tendency: Tendency = Math.abs(diff) < cfg.margin ? "ambiguous" : diff > 0 ? "warm" : "cool";
  return { tendency, value: lab.b, threshold: cfg.threshold, margin: cfg.margin, diff };
}
