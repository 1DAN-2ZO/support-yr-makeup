/**
 * [개발용 ?tune] 떨림 필터(One-Euro) 슬라이더 세 개 — POC(look-tryon) 와 같은 방식.
 * 2-b AR(fullrender)과 화면 4(live)가 같이 쓴다 (#235 · #244) — 폰에서 맞춘 값은 core/smooth-params.ts SMOOTH 에 적는다
 */

import { SMOOTH } from "@core/smooth-params";
import type { LandmarkSmoother } from "@core/smoothing";

export function smoothTuner(sm: Pick<LandmarkSmoother, "setParams">): HTMLElement {
  const box = document.createElement("div");
  box.className = "ar-tune";
  const v = { ...SMOOTH };
  const out = document.createElement("p");
  const show = (): void => { out.textContent = `기준 ${v.minCutoff.toFixed(1)} · 반응성 ${v.beta.toFixed(2)} · dCutoff ${v.dCutoff.toFixed(1)}`; };
  const slider = (label: string, key: keyof typeof v, min: number, max: number, step: number): HTMLLabelElement => {
    const l = document.createElement("label");
    l.textContent = label;
    const r = document.createElement("input");
    Object.assign(r, { type: "range", min: String(min), max: String(max), step: String(step), value: String(v[key]) });
    r.addEventListener("input", () => { v[key] = Number(r.value); sm.setParams(v.minCutoff, v.beta, v.dCutoff); show(); });
    l.append(r);
    return l;
  };
  box.append(
    slider("기준 (높을수록 딱 붙음)", "minCutoff", 0.5, 10, 0.1),
    slider("반응성 (높을수록 빨리 따라감)", "beta", 0.01, 1, 0.01),
    slider("dCutoff (높을수록 반응성이 빨리 켜짐)", "dCutoff", 0.5, 5, 0.1),
    out,
  );
  show();
  return box;
}
