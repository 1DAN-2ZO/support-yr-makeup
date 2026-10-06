#!/usr/bin/env node
// 폰 측정 결과 집계 (#215) — client/.probe/probe-*.json 을 읽어 회차별 한 줄 + 기준과 비교한 요약을 낸다.
// 쓰는 법: node scripts/probe-summary.mjs [YYYY-MM-DD (이 날짜 이후만)] [--since HH:MM]
// 사진·좌표는 없다 (프로브가 숫자만 보낸다). 기준값은 client/src/core/flow.ts CAPTURE_LIMITS 와 맞춘다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMITS = { brightTol: 12, colorTol: 6, brightTol45: 18, colorTol45: 12, brightMin: 40, brightMax: 85, pitch: 15 };
const dir = new URL("../client/.probe/", import.meta.url);
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? "";
const sinceArg = process.argv.indexOf("--since");
const since = sinceArg > 0 ? process.argv[sinceArg + 1] : null;   // 한국 시각 HH:MM

const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const dev = (ua) => {
  const m = /\(([^)]*)\)/.exec(ua ?? "")?.[1] ?? "?";
  const model = /SM-[A-Z0-9]+|iPhone|iPad|Pixel[^;]*/.exec(m)?.[0];
  return model ?? (/iPhone|Macintosh/.test(ua ?? "") ? "iOS" : m.split(";").slice(0, 2).join(";"));
};
const r1 = (v) => Math.round(v * 10) / 10;

const files = readdirSync(dir).filter((f) => f.startsWith("probe-") && f.endsWith(".json"))
  .map((f) => ({ f, t: statSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"), f)).mtimeMs }))
  .sort((a, b) => a.t - b.t);

const rows = [];
for (const { f } of files) {
  const d = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  if (!d.shots || !d.startedAt) continue;
  const when = kst(d.startedAt);
  if (day && when.slice(0, 10) < day) continue;
  if (since && when.slice(11) < since) continue;
  const sh = Object.fromEntries(d.shots.map((s) => [s.shot, s]));
  const base = sh.front_open?.at;
  const diff = (k) => {
    const a = sh[k]?.at;
    if (!a || !base || a.foreheadA === undefined) return null;
    return { dL: r1(a.foreheadL - base.foreheadL), dAB: r1(Math.hypot(a.foreheadA - base.foreheadA, a.foreheadB - base.foreheadB)) };
  };
  const blocked = {};
  for (const s of d.shots) for (const [k, v] of Object.entries(s.blocked ?? {})) blocked[k] = (blocked[k] ?? 0) + v;
  rows.push({
    when, dev: dev(d.ua), lock: d.camDiag?.mode ?? "-", L0: base ? r1(base.foreheadL) : null,
    closed: diff("front_closed"), left: diff("left_45"), right: diff("right_45"),
    pitch: [sh.front_open?.at?.pitchLm, sh.front_closed?.at?.pitchLm].filter((v) => v !== undefined),
    secs: d.captureSeconds, n: d.shots.length, blocked, jump: d.foreheadJump, calib: d.occlusionCalib ?? {},
  });
}

const flag = (x, tol, tolAB) => (x ? `${x.dL >= 0 ? "+" : ""}${x.dL}/${x.dAB}${Math.abs(x.dL) > tol || x.dAB > tolAB ? " ⚠" : ""}` : "-");
console.log(`기준: 정면 밝기 ±${LIMITS.brightTol}·색 ${LIMITS.colorTol} · 45° 밝기 ±${LIMITS.brightTol45}·색 ${LIMITS.colorTol45} · 밝기 범위 ${LIMITS.brightMin}~${LIMITS.brightMax}   (칸 = 첫 장 대비 밝기차/색차, ⚠ = 기준 넘음)\n`);
console.log("| 시각(KST) | 기기 | 잠금 | 장 | 첫 장 L* | 눈 감음 | 왼 45° | 오른 45° | 정면 pitch | 초 | 막힘 많은 순 | 이마 급변 p99/max |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const top = Object.entries(r.blocked).filter(([k]) => k !== "stable").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  const L0 = r.L0 === null ? "-" : `${r.L0}${r.L0 < LIMITS.brightMin || r.L0 > LIMITS.brightMax ? " ⚠" : ""}`;
  console.log(`| ${r.when.slice(5)} | ${r.dev} | ${r.lock} | ${r.n} | ${L0} | ${flag(r.closed, LIMITS.brightTol, LIMITS.colorTol)} | ${flag(r.left, LIMITS.brightTol45, LIMITS.colorTol45)} | ${flag(r.right, LIMITS.brightTol45, LIMITS.colorTol45)} | ${r.pitch.map(r1).join(" / ") || "-"} | ${r.secs ?? "-"} | ${top} | ${r.jump ? `${r.jump.p99}/${r.jump.max}` : "-"} |`);
}

// 요약: 정상 최대 × 1.5 (1-4 규칙) — 사람이 비정상 회차를 빼고 다시 볼 수 있게 전부 기준으로 한 번
const all = (pick) => rows.map(pick).filter((x) => x !== null && x !== undefined);
const maxAbs = (xs) => (xs.length ? Math.max(...xs.map(Math.abs)) : null);
const frontL = maxAbs(all((r) => r.closed?.dL)), frontAB = maxAbs(all((r) => r.closed?.dAB));
const sideL = maxAbs([...all((r) => r.left?.dL), ...all((r) => r.right?.dL)]), sideAB = maxAbs([...all((r) => r.left?.dAB), ...all((r) => r.right?.dAB)]);
const x15 = (v) => (v === null ? "-" : r1(v * 1.5));
console.log(`\n회차 ${rows.length} · 정면 최대 밝기 ${frontL ?? "-"}·색 ${frontAB ?? "-"} → ×1.5 = ${x15(frontL)}·${x15(frontAB)} (지금 ${LIMITS.brightTol}·${LIMITS.colorTol})`);
console.log(`       45° 최대 밝기 ${sideL ?? "-"}·색 ${sideAB ?? "-"} → ×1.5 = ${x15(sideL)}·${x15(sideAB)} (지금 ${LIMITS.brightTol45}·${LIMITS.colorTol45})`);
const calibs = rows.flatMap((r) => Object.entries(r.calib).map(([k, v]) => `${r.when.slice(11)} ${r.dev} ${k}: p99 ${v.p99} max ${v.max} 가림 ${v.occludedFrames}`));
if (calibs.length) console.log(`\n가림 측정 (FOREHEAD_JUMP 20, 어두울 때 40):\n${calibs.join("\n")}`);
