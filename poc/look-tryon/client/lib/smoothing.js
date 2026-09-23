// One Euro Filter — app.js(v2)에서 실사용 검증된 그대로. 매 프레임 독립 추정되는 랜드마크의
// 프레임간 떨림(jitter)을 줄인다. 느리게 움직일 땐 많이 부드럽게, 빠르게 움직일 땐 덜 부드럽게
// (지연 최소화) 자동 조절.

class LowPassFilter {
  reset() { this.y = null; this.s = null; }
  filter(x, alpha) {
    this.s = this.y === null ? x : alpha * x + (1 - alpha) * this.s;
    this.y = x;
    return this.s;
  }
}

export class OneEuroFilter {
  constructor(minCutoff = 2.5, beta = 0.08, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.xFilt = new LowPassFilter(); this.dxFilt = new LowPassFilter();
    this.reset();
  }
  reset() { this.xFilt.reset(); this.dxFilt.reset(); this.lastT = null; }
  alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, tMs) {
    if (this.lastT === null) { this.lastT = tMs; this.xFilt.filter(x, 1); this.dxFilt.filter(0, 1); return x; }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-3);
    this.lastT = tMs;
    const dx = (x - this.xFilt.y) / dt;
    const edx = this.dxFilt.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilt.filter(x, this.alpha(cutoff, dt));
  }
}

// 지정한 인덱스 집합의 랜드마크(x,y[,z])에 필터를 걸어주는 헬퍼.
export class LandmarkSmoother {
  constructor(trackedIdx, { smoothZ = false, minCutoff, beta } = {}) {
    this.trackedIdx = trackedIdx;
    this.smoothZ = smoothZ;
    this.filters = new Map();
    for (const i of trackedIdx) {
      this.filters.set(i, {
        x: new OneEuroFilter(minCutoff, beta),
        y: new OneEuroFilter(minCutoff, beta),
        z: smoothZ ? new OneEuroFilter(minCutoff, beta) : null,
      });
    }
    this.wasLost = true;
  }

  setParams(minCutoff, beta) {
    for (const f of this.filters.values()) {
      f.x.minCutoff = f.y.minCutoff = minCutoff;
      f.x.beta = f.y.beta = beta;
      if (f.z) { f.z.minCutoff = minCutoff; f.z.beta = beta; }
    }
  }

  reset() { for (const f of this.filters.values()) { f.x.reset(); f.y.reset(); if (f.z) f.z.reset(); } }

  // lm: 랜드마크 없음(null)이면 wasLost만 갱신. 있으면 새 배열(원본 불변) 반환.
  smooth(lm, tMs) {
    if (!lm) { this.wasLost = true; return null; }
    if (this.wasLost) this.reset(); // 다시 잡혔을 때 이전 위치로 확 당겨지는 것 방지
    this.wasLost = false;
    const out = lm.slice();
    for (const i of this.trackedIdx) {
      const f = this.filters.get(i);
      out[i] = {
        x: f.x.filter(lm[i].x, tMs),
        y: f.y.filter(lm[i].y, tMs),
        z: f.z ? f.z.filter(lm[i].z, tMs) : lm[i].z,
      };
    }
    return out;
  }
}
