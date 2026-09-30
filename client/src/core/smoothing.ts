/**
 * One Euro Filter — poc/look-tryon/client/lib/smoothing.js 그대로 타입만 붙임.
 * app.js(v2)에서 실사용 검증된 그대로. 매 프레임 독립 추정되는 랜드마크의 프레임간 떨림(jitter)을
 * 줄인다. 느리게 움직일 땐 많이 부드럽게, 빠르게 움직일 땐 덜 부드럽게(지연 최소화) 자동 조절.
 * 중복 구현 금지, 여기 하나만.
 */

import type { Pt } from "./types";

class LowPassFilter {
  y: number | null = null;
  s: number | null = null;
  reset(): void {
    this.y = null;
    this.s = null;
  }
  filter(x: number, alpha: number): number {
    this.s = this.y === null ? x : alpha * x + (1 - alpha) * this.s!;
    this.y = x;
    return this.s;
  }
}

export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  private xFilt = new LowPassFilter();
  private dxFilt = new LowPassFilter();
  private lastT: number | null = null;

  constructor(minCutoff = 2.5, beta = 0.08, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset(): void {
    this.xFilt.reset();
    this.dxFilt.reset();
    this.lastT = null;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (this.lastT === null) {
      this.lastT = tMs;
      this.xFilt.filter(x, 1);
      this.dxFilt.filter(0, 1);
      return x;
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    this.lastT = tMs;
    const dx = (x - this.xFilt.y!) / dt;
    const edx = this.dxFilt.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilt.filter(x, this.alpha(cutoff, dt));
  }
}

interface FilterTriple {
  x: OneEuroFilter;
  y: OneEuroFilter;
  z: OneEuroFilter | null;
}

export interface LandmarkSmootherOptions {
  smoothZ?: boolean;
  minCutoff?: number;
  beta?: number;
  /** 속도 추정(edx) 자체를 스무딩하는 컷오프. 낮으면 빠른 움직임 시작 시 beta가 늦게 켜진다 (#173) */
  dCutoff?: number;
}

/** 지정한 인덱스 집합의 랜드마크(x,y[,z])에 필터를 걸어주는 헬퍼 */
export class LandmarkSmoother {
  private trackedIdx: readonly number[];
  private filters = new Map<number, FilterTriple>();
  private wasLost = true;

  constructor(trackedIdx: readonly number[], { smoothZ = false, minCutoff, beta, dCutoff }: LandmarkSmootherOptions = {}) {
    this.trackedIdx = trackedIdx;
    for (const i of trackedIdx) {
      this.filters.set(i, {
        x: new OneEuroFilter(minCutoff, beta, dCutoff),
        y: new OneEuroFilter(minCutoff, beta, dCutoff),
        z: smoothZ ? new OneEuroFilter(minCutoff, beta, dCutoff) : null,
      });
    }
  }

  setParams(minCutoff: number, beta: number, dCutoff: number): void {
    for (const f of this.filters.values()) {
      f.x.minCutoff = f.y.minCutoff = minCutoff;
      f.x.beta = f.y.beta = beta;
      f.x.dCutoff = f.y.dCutoff = dCutoff;
      if (f.z) {
        f.z.minCutoff = minCutoff;
        f.z.beta = beta;
        f.z.dCutoff = dCutoff;
      }
    }
  }

  reset(): void {
    for (const f of this.filters.values()) {
      f.x.reset();
      f.y.reset();
      if (f.z) f.z.reset();
    }
  }

  /** lm: 랜드마크 없음(null)이면 wasLost만 갱신. 있으면 새 배열(원본 불변) 반환 */
  smooth(lm: readonly Pt[] | null | undefined, tMs: number): Pt[] | null {
    if (!lm) {
      this.wasLost = true;
      return null;
    }
    if (this.wasLost) this.reset(); // 다시 잡혔을 때 이전 위치로 확 당겨지는 것 방지
    this.wasLost = false;
    const out = lm.slice();
    for (const i of this.trackedIdx) {
      const f = this.filters.get(i);
      const p = lm[i];
      if (!f || !p) continue;
      const fx = f.x.filter(p.x, tMs);
      const fy = f.y.filter(p.y, tMs);
      const fz = f.z ? f.z.filter(p.z ?? 0, tMs) : p.z;
      out[i] = fz === undefined ? { x: fx, y: fy } : { x: fx, y: fy, z: fz };
    }
    return out;
  }
}
