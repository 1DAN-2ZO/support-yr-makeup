// 화면 6 통합(feedbackWhole, client/src/core/feedback-measure.ts)을 실제 사진에 돌린다 — 사진을 넣으면 부위별 문장이 나온다
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/feedback_whole.mjs
//   사진: final_whole.py 가 만든 묶음들 (저장소 밖) — <폴더>/_bare · _made · c<id>_bare · c<id>_<n> (+ .lm.json)
//   라이너는 모델이 옮긴 그림 묶음(work/same-seat/flux-eval2: me_bare · me_target · me_*_paste)으로 따로 본다
//   사진 조건 확인은 건너뛰고(얼굴을 같은 폭으로 잘라 둔 사진이라 뜻이 없다) 재기 → 문장만 본다
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), W = join(DATA, "work").replaceAll("\\", "/");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { feedbackWhole, measureWhole } from "./src/core/feedback-measure";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "feedback-whole-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "feedback-whole-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const lm = (f) => JSON.parse(readFileSync(f, "utf8"));
const SHORT = { brow: "눈썹", shadow: "섀도우", liner: "라이너", cheek: "볼", lip: "입술" };
const one = (fb, only) => fb.blocked ?? fb.parts.filter((p) => !only || only.includes(p.part)).map((p) => `${SHORT[p.part]}: ${p.line}${p.more ? ` + ${p.more}` : ""}`).join(" | ");

const SETS = [
  ["같은 자리 — 입술 · 섀도우 · 볼", "same-seat/out", ["2", "3", "4"], { bare: "아무것도 안 함", 1: "정답대로", 2: "입술 빼먹음", 6: "섀도우 위로 더", 7: "섀도우 오른쪽 눈만" }, ["lip", "shadow", "cheek"]],
  ["같은 자리 — 입술 범위", "same-seat/out-lip", ["2", "3", "4"], { 1: "정답대로", 2: "입술선 밖으로", 4: "아랫입술만" }, ["lip"]],
  ["같은 자리 — 섀도우 범위", "same-seat/out-shadow2", ["2", "3", "4"], { 1: "정답대로", 2: "바깥으로 더 뺌" }, ["shadow"]],
  ["촬영 페이지 — 눈썹 (진하게)", "brow/out", ["1", "2", "3"], { bare: "아무것도 안 함", 1: "정답대로", 2: "눈썹 안 그림", 3: "눈썹 옅게", 4: "눈썹 오른쪽만" }, ["brow"]],
  ["촬영 페이지 — 눈썹 두께", "brow3/out", ["1", "2", "3"], { 1: "정답대로 (두껍게)", 2: "원래 두께만" }, ["brow"]],
];
for (const [tag, dir, ids, cases, only] of SETS) {
  const d = `${W}/${dir}`;
  if (!existsSync(`${d}/_bare.png`)) continue;
  const bare = core.frameOf(png(`${d}/_bare.png`), lm(`${d}/_bare.lm.json`)), target = png(`${d}/_made.png`);
  console.log(`\n===== ${tag}`);
  for (const [c, name] of Object.entries(cases)) {
    const lines = ids.filter((n) => existsSync(`${d}/c${n}_${c}.png`)).map((n) => one(core.feedbackWhole({ bare, target, cur: core.frameOf(png(`${d}/c${n}_${c}.png`), lm(`${d}/c${n}_${c}.lm.json`)) }, true), only));
    const same = lines.every((l) => l === lines[0]);
    console.log(`[${name}] ${same ? `${lines.length}장 모두 — ${lines[0]}` : ""}`);
    if (!same) lines.forEach((l, i) => console.log(`    사진 ${ids[i]}: ${l}`));
  }
}
const F = `${W}/same-seat/flux-eval2`;
if (existsSync(`${F}/me_bare.png`)) {
  const bare = core.frameOf(png(`${F}/me_bare.png`), lm(`${F}/me_bare.lm.json`)), target = png(`${F}/me_target.png`);
  console.log("\n===== 라이너 — 모델이 맨얼굴에 옮긴 그림 (정답 = 꼬리 30% 를 그려 넣은 것)");
  for (const [k, name] of [["E_seed0", "길게 (시작값 0)"], ["E_seed1", "길게 (시작값 1)"], ["E_seed2", "길게 (시작값 2)"], ["F_seed0", "절반"], ["G_seed0", "오른쪽 눈만"], ["H_seed0", "아주 짧게"], ["J_seed0", "섀도우 높이 + 길게"]]) {
    const m = core.measureWhole({ bare, target, cur: bare, moved: png(`${F}/me_${k}_paste.png`) }).liner, pc = (v) => (v == null ? "없음" : `${(v * 100).toFixed(0)}%`);
    console.log(`[${name}] ${one(core.feedbackWhole({ bare, target, cur: bare, moved: png(`${F}/me_${k}_paste.png`) }, true), ["liner"])}   (정답 ${pc(m.targetR)} · ${pc(m.targetL)} → 옮긴 것 ${pc(m.R)} · ${pc(m.L)})`);
  }
}
