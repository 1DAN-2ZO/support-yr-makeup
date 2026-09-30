/**
 * 화면 4 개발용 `?gate` 표시 — 게이트가 본 값을 숫자로 (2026-09-30 폰 시험: "안 움직였는데 흔들린다고 확인받기로 안 넘어감").
 * 선명도가 기준 근처를 오락가락하면 5프레임 연속 통과를 못 해서 영영 못 넘어간다 → 최근 3초 최소·중앙을 같이 본다.
 * 순수 함수 — 화면(screens/live.ts)이 그대로 띄운다. 사용자 화면에는 안 나온다(주소에 ?gate 를 붙일 때만).
 */

import type { LiveLimits, LiveMeasure } from "./gate";
import type { GateResult } from "./types";

const n0 = (v: number | undefined): string => (typeof v === "number" ? v.toFixed(0) : "-");
const n1 = (v: number | undefined): string => (typeof v === "number" ? v.toFixed(1) : "-");
const n2 = (v: number | undefined): string => (typeof v === "number" ? v.toFixed(2) : "-");

export function gateReadout(m: LiveMeasure, gate: GateResult, limits: LiveLimits, recent: { min: number; median: number; n: number } | null): string {
  const dL = typeof m.foreheadL === "number" && typeof m.baselineL === "number" ? m.foreheadL - m.baselineL : undefined;
  const occ = typeof m.occluded === "boolean" ? (m.occluded ? "예" : "아니오") : "-";
  return [
    `선명 ${n0(m.sharpness)}/${limits.sharpMin}` + (recent ? ` · 최근 최소 ${n0(recent.min)} · 중앙 ${n0(recent.median)} (${recent.n})` : ""),
    `${gate.ok ? "통과" : `막힘 ${gate.firstFail}`} "${gate.text}" · 안정 ${m.stableCount ?? 0}/${limits.stableFrames}`,
    `밝기차 ${n1(dL)}/${limits.brightTol} · 각도 y${n1(m.yaw)} p${n1(m.pitch)} · 차 y${n1(m.poseDiff?.yaw)}/${limits.dYaw} p${n1(m.poseDiff?.pitch)}/${limits.dPitch}`,
    `기울기 ${n1(m.roll)} · 표정 ${n2(m.exprDiff)}/${limits.exprTol} · 가림 ${occ}`,
  ].join("\n");
}

/** 최근 n 개 값의 최소·중앙 (오래된 것부터 버림). 30fps 에서 90 개 ≈ 3초 */
export function recentStats(n: number): { push(v: number): void; stats(): { min: number; median: number; n: number } | null } {
  const buf: number[] = [];
  return {
    push(v) {
      buf.push(v);
      if (buf.length > n) buf.shift();
    },
    stats() {
      if (!buf.length) return null;
      const s = [...buf].sort((a, b) => a - b), k = s.length >> 1;
      return { min: s[0]!, median: s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2, n: buf.length };
    },
  };
}
