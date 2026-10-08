/**
 * 개발용 속도 재기 (?perf, #343) — 실시간 화면이 초당 몇 장 나오나, 장면마다 어느 단계가 오래 걸리나.
 * 폰에서 "뚝뚝 끊긴다" 를 눈 느낌이 아니라 숫자로 보려고. 최근 window 장만 봐서 느려지면 바로 보인다.
 */

export interface PerfMeter {
  /** 장면 하나를 그린 시각 (ms) */
  frame(t: number): void;
  /** 이 장면에서 단계 하나에 걸린 시간 (ms) */
  stage(name: string, ms: number): void;
  /** 최근 장면들의 초당 장 수 (두 장 못 되면 0) */
  fps(): number;
  /** 단계의 최근 평균 시간 (ms, 없으면 0) */
  avg(name: string): number;
  /** "초당 25.0장 · 얼굴 찾기 18.3ms · …" — 단계는 처음 나온 순서 */
  text(): string;
}

export function createPerfMeter(window = 30): PerfMeter {
  const times: number[] = [];
  const stages = new Map<string, number[]>();
  const push = (xs: number[], x: number): void => {
    xs.push(x);
    if (xs.length > window) xs.shift();
  };
  const fps = (): number => (times.length < 2 ? 0 : ((times.length - 1) * 1000) / (times[times.length - 1]! - times[0]! || 1));
  const avg = (name: string): number => {
    const xs = stages.get(name);
    return xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  return {
    // 장면 사이 간격 window 개를 보려고 시각은 하나 더 둔다
    frame(t) { times.push(t); if (times.length > window + 1) times.shift(); },
    stage(name, ms) {
      let xs = stages.get(name);
      if (!xs) stages.set(name, (xs = []));
      push(xs, ms);
    },
    fps,
    avg,
    text: () => [`초당 ${fps().toFixed(1)}장`, ...[...stages.keys()].map((k) => `${k} ${avg(k).toFixed(1)}ms`)].join(" · "),
  };
}
