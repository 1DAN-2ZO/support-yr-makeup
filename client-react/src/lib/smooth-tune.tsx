/**
 * [개발용 ?tune] 떨림 필터(One-Euro) 슬라이더 세 개 — 본 앱 `client/src/screens/smooth-tune.ts` 를 그대로 옮겼다 (#235 · #244).
 *
 * 본 앱은 `document.createElement` 로 칸을 만들어 돌려줬는데, 여기서는 React 요소라야 화면 안에 끼울 수 있어
 * **같은 슬라이더 세 개를 컴포넌트로** 바꿨다. 값·범위·문구는 본 앱과 같다 — 폰에서 맞춘 값을 두 앱이 같이
 * `core/smooth-params.ts` 에 적기 때문에, 범위가 다르면 같은 자리에서 같은 값이 안 나온다.
 *
 * 확장자만 `.tsx` 다. `src/lib` 의 다른 파일들은 React 를 모르지만, 이 파일은 본 앱에서도 화면 쪽(screens)에
 * 있던 것이고 주소 꼬리표(`?tune`)로만 뜨는 개발용이라 **옮겨 온 자리를 그대로 두었다**.
 *
 * 값을 미는 일은 효과에서 한다 — 슬라이더를 움직일 때뿐 아니라 **필터가 새로 만들어졌을 때도**(화면을 다시
 * 켜면 live-run 이 LandmarkSmoother 를 새로 만든다) 지금 맞춰 둔 값이 그 새 필터에 그대로 들어가야 한다.
 */

import { useEffect, useState } from "react";
import { SMOOTH } from "../core/smooth-params";
import type { LandmarkSmoother } from "../core/smoothing";

interface Vals {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

export interface SmoothTuneProps {
  /** 값을 밀어 넣을 필터 (live-run 의 run.smoother) */
  sm: Pick<LandmarkSmoother, "setParams">;
  /** 그 화면이 쓰는 값 — 실시간 가이드는 LIVE_SMOOTH, 2-b AR 은 SMOOTH */
  start?: Vals;
}

/** 범위는 넉넉히 — 본 앱에서 화면 4 를 맞출 때 처음 최대(10 · 1 · 5)까지 올렸다 */
const RANGES: readonly { key: keyof Vals; label: string; min: number; max: number; step: number }[] = [
  { key: "minCutoff", label: "기준 (높을수록 딱 붙음)", min: 0.5, max: 20, step: 0.1 },
  { key: "beta", label: "반응성 (높을수록 빨리 따라감)", min: 0.01, max: 3, step: 0.01 },
  { key: "dCutoff", label: "dCutoff (높을수록 반응성이 빨리 켜짐)", min: 0.5, max: 10, step: 0.1 },
];

export default function SmoothTune({ sm, start = SMOOTH }: SmoothTuneProps) {
  // 처음 값은 한 번만 읽는다 — 그릴 때마다 읽으면 슬라이더를 움직여도 제자리로 돌아간다
  const [v, setV] = useState<Vals>(() => ({ ...start }));

  useEffect(() => {
    sm.setParams(v.minCutoff, v.beta, v.dCutoff);
  }, [sm, v]);

  return (
    <div className="ar-tune">
      {RANGES.map(({ key, label, min, max, step }) => (
        <label key={key}>
          {label}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={v[key]}
            onChange={(e) => setV((p) => ({ ...p, [key]: Number(e.target.value) }))}
          />
        </label>
      ))}
      <p>
        기준 {v.minCutoff.toFixed(1)} · 반응성 {v.beta.toFixed(2)} · dCutoff {v.dCutoff.toFixed(1)}
      </p>
    </div>
  );
}
