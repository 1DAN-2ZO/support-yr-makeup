#!/usr/bin/env node
/**
 * VLM 선정 실험 — 앱 코드(측정·프롬프트·관문) 호출 다리. run.py · landmarks.py · report.py 가 부른다.
 *
 *   stdin   [{"op": "...", ...}, ...]      ← 요청 여러 개를 한 번에 (Node 를 한 번만 띄우려고)
 *   stdout  [결과, ...]                     ← 같은 순서. 실패한 요청은 {"error": "..."}
 *
 * op:
 *   measure  {lm}                                  → FaceMeasure
 *   prompt   {m, look, variant, faceShape?}         → 문자열 (A = 앱 프롬프트 그대로, B 말만, C 숫자만, D 측정값 없음)
 *   schema   {variant?, m?}                         → JSON 스키마 (제약 디코딩용, 관문과 같은 허용값. E·F 는 얼굴마다 좁힌다)
 *   gate     {m, raw, faceShape?}                   → {ok, parsed, rejected, decisions}
 *   rule     {m, faceShape?}                        → 규칙만으로 만든 계획 (결정 + 근거)
 *   plan     {m, raw?}                              → 렌더러용 계획 전체 (raw 없으면 규칙, 있으면 관문 거친 VLM)
 *   flips    {m, faceShape?}                        → [{name, field, m, ruleBefore, ruleAfter}]
 *   looks    {}                                     → 화장 id 목록 (rules/looks.json)
 *
 * entry.ts 를 esbuild 로 묶어서 쓴다 — 앱과 같은 코드. 소스가 안 바뀌면 캐시를 그대로 쓴다.
 * 혼자 돌려 보기:  echo '[{"op":"looks"}]' | node eval/vlm/vlm_core.mjs
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CLIENT = join(ROOT, "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));

/** 캐시 열쇠: entry.ts + 앱 core 전부 + 화장 템플릿 — 하나라도 바뀌면 다시 묶는다 */
function stamp() {
  const h = createHash("sha1");
  h.update(readFileSync(join(HERE, "entry.ts")));
  const core = join(CLIENT, "src", "core");
  for (const f of readdirSync(core).filter((f) => f.endsWith(".ts")).sort()) h.update(readFileSync(join(core, f)));
  h.update(readFileSync(join(ROOT, "rules", "looks.json")));
  return h.digest("hex").slice(0, 12);
}

async function load() {
  const out = join(CLIENT, "node_modules", ".cache", "dhe-vlm-eval", `entry-${stamp()}.mjs`);
  if (!existsSync(out)) {
    const esbuild = require("esbuild");
    const r = await esbuild.build({
      entryPoints: [join(HERE, "entry.ts")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      write: false,
      logLevel: "silent",
      // looks.ts 가 rules/looks.json 을 가져온다
      loader: { ".json": "json" },
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, r.outputFiles[0].text);
  }
  return import(pathToFileURL(out).href);
}

function readStdin() {
  return new Promise((res, rej) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => res(s));
    process.stdin.on("error", rej);
  });
}

const core = await load();
const reqs = JSON.parse((await readStdin()) || "[]");
const out = reqs.map((q) => {
  try {
    switch (q.op) {
      case "measure": return core.measure(q.lm);
      case "prompt": return core.prompt(q.m, q.look, q.variant, q.faceShape ?? null);
      case "schema": return core.schema(q.variant ?? "A", q.m);
      case "gate": {
        const g = core.gate(q.m, q.raw, q.faceShape ?? null);
        return { ok: g.ok, parsed: g.parsed, rejected: g.rejected, decisions: g.decisions, rationale: g.plan.rationale };
      }
      case "rule": return core.rulePlan(q.m, q.faceShape ?? null);
      case "plan": return core.fullPlan(q.m, q.raw);
      case "flips": return core.flips(q.m, q.faceShape ?? null);
      case "looks": return core.lookIds();
      default: return { error: `모르는 op: ${q.op}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
process.stdout.write(JSON.stringify(out));
