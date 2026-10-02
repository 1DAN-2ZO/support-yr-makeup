#!/usr/bin/env node
/**
 * 화면 6 종합 코멘트 실험 — 앱 코드 호출 다리 (eval/vlm/vlm_core.mjs 와 같은 방식). generate.py · results.py 가 부른다.
 *
 *   stdin   [{"op": "...", ...}, ...]   stdout  [결과, ...]  (실패한 요청은 {"error": "..."})
 *
 * op:
 *   sessions {seed?}        → 가짜 세션 30개 [{id, kind, lookId, lookName, parts, summary, A, B, prompt, schema}]
 *   gate     {session, raw} → {ok, reasons, comment, praise, fix}
 *
 * 혼자 돌려 보기:  echo '[{"op":"sessions"}]' | node eval/comment/core.mjs
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

/** 캐시 열쇠: comment.ts + 앱 core 전부 + 규칙 파일 — 하나라도 바뀌면 다시 묶는다 */
function stamp() {
  const h = createHash("sha1");
  for (const f of ["entry.ts", "comment.ts", "partline.ts"]) h.update(readFileSync(join(HERE, f)));
  const core = join(CLIENT, "src", "core");
  for (const f of readdirSync(core).filter((f) => f.endsWith(".ts")).sort()) h.update(readFileSync(join(core, f)));
  for (const f of ["looks.json", "score.json"]) h.update(readFileSync(join(ROOT, "rules", f)));
  return h.digest("hex").slice(0, 12);
}

async function load() {
  const out = join(CLIENT, "node_modules", ".cache", "dhe-comment-eval", `comment-${stamp()}.mjs`);
  if (!existsSync(out)) {
    const esbuild = require("esbuild");
    const r = await esbuild.build({
      entryPoints: [join(HERE, "entry.ts")], bundle: true, format: "esm", platform: "node", target: "node20",
      write: false, logLevel: "silent", loader: { ".json": "json" },
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

const c = await load();
const reqs = JSON.parse((await readStdin()) || "[]");
const out = reqs.map((q) => {
  try {
    switch (q.op) {
      case "sessions":
        return c.makeSessions(q.seed).map((s) => ({ ...s, A: c.commentA(s), B: c.commentB(s), B2: c.commentB2(s), prompt: c.promptC(s), schema: c.schemaC(s) }));
      case "gate": return c.gateC(q.session, q.raw);
      case "parts": {
        // 부위별 한 줄 — 수치를 지어 넣은 세션 (같은 seed → 같은 수치)
        return c.makeSessions(q.seed).map((s, i) => {
          c.fillMetrics(s, 9000 + i);
          return {
            id: s.id, kind: s.kind, lookId: s.lookId, lookName: s.lookName, session: s,
            prompt: c.targets(s).length ? c.partPrompt(s) : null, schema: c.targets(s).length ? c.partSchema(s) : null,
            targets: c.targets(s).map((p) => ({ part: p.partId, name: c.nameOf(p.partId), score: p.score, codes: c.issueCodesOf(p), facts: c.facts(p), rule: c.ruleLine(s, p) })),
          };
        });
      }
      case "gateLine": {
        const p = q.session.parts.find((x) => x.partId === q.part);
        return c.gateLine(q.session, p, q.line);
      }
      case "meta": return { promptVer: c.PROMPT_VER, maxChars: c.MAX_CHARS, partPromptVer: c.PART_PROMPT_VER, lineMax: c.LINE_MAX };
      default: return { error: `모르는 op: ${q.op}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
process.stdout.write(JSON.stringify(out));
