#!/usr/bin/env node
/**
 * 채점 평가 CLI (3-2, #33) — eval/score/run.py 가 부른다. 앱과 같은 채점 코드로 골든 항목을 채점해 JSON 을 낸다.
 *
 *   stdin   {"items": [...], "data_dir": "<DHE_DATA_DIR>"}     ← eval/golden/manifest.json 의 items 그대로
 *   stdout  [{"id", "part", "label", "pred", "score", "status", "check_reason", "codes", "ms", "error"}]
 *   stderr  진행·요약 (stdout 은 JSON 만)
 *
 * 항목 하나 (초안 — ⑤ 와 합의 중. 경로는 data_dir 기준 상대 경로):
 *   { "id": "ffhq_0001_liner", "person_id": "ffhq_0001", "part": "liner",
 *     "bare": "ffhq/0001_bare.png", "makeup": "ffhq/0001_makeup.png",
 *     "bare_lm": "ffhq/0001_bare.lm.json", "makeup_lm": "ffhq/0001_makeup.lm.json",
 *     "label": "ok" }
 *   - 사진은 PNG. 랜드마크는 MediaPipe 478점 JSON — [{x,y}] 또는 [[x,y]], 픽셀 또는 0~1 정규화 둘 다 받는다
 *     (전부 0~1 이면 정규화로 보고 사진 크기를 곱한다). Node 에서는 MediaPipe 가 안 돌아서 ⑤ 가 파이썬으로 뽑는다
 *   - label: ok | slight | off (3단계, #64). 없으면 null
 *
 * 채점 코드는 client/src/core/score-part.ts 를 esbuild 로 묶어서 그대로 쓴다 — 평가가 앱과 다른 것을 재면 안 된다.
 * 가이드 기하는 ② 의 guides.ts 가 나올 때까지 guide-poc.mjs (POC 값) 를 쓴다.
 *
 * 혼자 돌려 보기:  echo '{"items":[...],"data_dir":"..."}' | node eval/score/score_cli.mjs
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { makePocGuide } from "./guide-poc.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const CLIENT = join(ROOT, "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));

/** 점수(0~100) → 사람 판정 3단계. 초안 — E-1 첫 결과를 보고 ⑤ 와 정한다 */
const FOLD = { ok: 80, slight: 50 };
function foldLabel(score) {
  if (score >= FOLD.ok) return "ok";
  if (score >= FOLD.slight) return "slight";
  return "off";
}

const CORE_FILES = ["score-part", "score", "sampling", "landmarks", "color", "baseline", "flow", "types"];

/** client/src/core 를 하나의 ESM 으로 묶는다. 소스가 안 바뀌었으면 캐시를 그대로 쓴다 */
async function loadCore() {
  const srcDir = join(CLIENT, "src", "core");
  const stamp = createHash("sha1");
  for (const f of CORE_FILES) stamp.update(readFileSync(join(srcDir, `${f}.ts`)));
  const out = join(CLIENT, "node_modules", ".cache", "dhe-score-cli", `core-${stamp.digest("hex").slice(0, 12)}.mjs`);
  if (!existsSync(out)) {
    const esbuild = require("esbuild");
    const r = await esbuild.build({
      stdin: {
        contents: [
          'export { alignedFrame, scorePart } from "./src/core/score-part";',
          'export { decide, toOutcome } from "./src/core/score";',
          'export { frameOf } from "./src/core/sampling";',
          'export { LM } from "./src/core/landmarks";',
        ].join("\n"),
        resolveDir: CLIENT,
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      write: false,
      logLevel: "silent",
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, r.outputFiles[0].text);
  }
  return import(pathToFileURL(out).href);
}

function readPng(path) {
  const { PNG } = require("pngjs");
  const png = PNG.sync.read(readFileSync(path));
  return { data: png.data, w: png.width, h: png.height };
}

/** 478점 JSON → [{x, y}] 픽셀 */
function readLandmarks(path, im) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.landmarks ?? raw.lm ?? raw.points;
  if (!Array.isArray(arr) || arr.length < 478) throw new Error(`랜드마크가 478점이 아니다 (${arr?.length ?? "?"}점): ${path}`);
  const pts = arr.map((p) => (Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y }));
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error(`랜드마크에 숫자가 아닌 값: ${path}`);
  const normalized = pts.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  return normalized ? pts.map((p) => ({ x: p.x * im.w, y: p.y * im.h })) : pts;
}

function need(item, key) {
  const v = item[key];
  if (typeof v !== "string" || !v) throw new Error(`항목에 '${key}' 가 없다`);
  return v;
}

function scoreItem(core, guide, item, dataDir) {
  const at = (rel) => {
    const p = resolve(dataDir, rel);
    if (!existsSync(p) || !statSync(p).isFile()) throw new Error(`파일 없음: ${p}`);
    return p;
  };
  const part = need(item, "part");
  const bareIm = readPng(at(need(item, "bare")));
  const makeIm = readPng(at(need(item, "makeup")));
  const base = core.frameOf(bareIm, readLandmarks(at(need(item, "bare_lm")), bareIm));
  const { frame, fit, biasPx } = core.alignedFrame(base, makeIm, readLandmarks(at(need(item, "makeup_lm")), makeIm));
  const { result, ctx } = core.scorePart(part, base, frame, guide, { alignResidual: fit.residual });
  const d = core.decide(part, result, ctx);
  return {
    pred: d.status === "scored" ? foldLabel(d.score) : null,
    score: d.score,
    status: d.status,
    check_reason: d.reason,
    codes: result.codes,
    align_residual: +fit.residual.toFixed(3),
    makeup_bias_px: +biasPx.toFixed(2),
    light_shift: ctx.lightShift == null ? null : +ctx.lightShift.toFixed(2),
  };
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const items = Array.isArray(input.items) ? input.items : [];
  const dataDir = input.data_dir ? resolve(String(input.data_dir)) : ROOT;
  if (!items.length) {
    process.stdout.write("[]\n");
    return;
  }
  const core = await loadCore();
  const guide = makePocGuide(core.LM);
  const out = [];
  let errors = 0;
  for (const item of items) {
    const t0 = performance.now();
    const row = { id: item.id ?? null, part: item.part ?? null, label: item.label ?? null, pred: null, score: null, status: null, check_reason: null, codes: [], ms: 0, error: null };
    try {
      Object.assign(row, scoreItem(core, guide, item, dataDir));
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
      errors++;
    }
    row.ms = Math.round(performance.now() - t0);
    out.push(row);
  }
  process.stdout.write(JSON.stringify(out) + "\n");
  const scored = out.filter((r) => r.status === "scored").length;
  const checkOnly = out.filter((r) => r.status === "check_only").length;
  process.stderr.write(`score_cli: ${out.length}개 — 점수 ${scored} · 확인만 ${checkOnly} · 오류 ${errors}\n`);
}

main().catch((e) => {
  process.stderr.write(`score_cli 실패: ${e?.stack ?? e}\n`);
  process.exit(1);
});
