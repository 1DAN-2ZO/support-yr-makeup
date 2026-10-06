#!/usr/bin/env node
/**
 * 6단계 평가지용 렌더러 묶기 — render_sheet.ts(앱의 paintMakeup · MakeupGl)를 브라우저용 한 파일로. 결과는 stdout.
 * report.py --sheet 가 부른다.   node eval/vlm/sheet_bundle.mjs > bundle.js
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(HERE, "..", "..", "client");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild");

const r = await esbuild.build({
  entryPoints: [join(HERE, "render_sheet.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  write: false,
  logLevel: "silent",
  loader: { ".json": "json" },
  alias: { "@core": join(CLIENT, "src", "core") },
});
process.stdout.write(r.outputFiles[0].text);
