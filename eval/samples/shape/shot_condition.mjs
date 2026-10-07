// 사진 조건 확인(shotCondition, feedback-whole.ts)을 실제 맨얼굴 쌍에 돌린다 (실험 37) — 판정이 맞았던 쌍은 통과, 틀렸던 쌍은 걸려야 한다
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/shot_condition.mjs      (쌍은 shot_condition.py 와 같다, 저장소 밖)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), W = join(DATA, "work").replaceAll("\\", "/");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { shotCondition, CONDITION } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "shot-condition-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "shot-condition-core.mjs")).href);
// 기준을 바꿔 보기: LIGHT · COLOR (밝기 · 색). 안 주면 코드의 값 그대로
if (process.env.LIGHT) core.CONDITION.light = Number(process.env.LIGHT);
if (process.env.COLOR) core.CONDITION.color = Number(process.env.COLOR);
console.log(`기준 — 밝기 ${core.CONDITION.light} · 색 ${core.CONDITION.color}`);
const load = (d, n) => { const p = PNG.sync.read(readFileSync(`${W}/${d}/${n}.png`)); return core.frameOf({ data: p.data, w: p.width, h: p.height }, JSON.parse(readFileSync(`${W}/${d}/${n}.lm.json`, "utf8"))); };
const SETS = [
  ["촬영 페이지 · 같은 방식 7분 뒤 — 통과해야", "burst/pairs", [1, 2, 3, 4, 5].map((k) => `y${k}`)],
  ["촬영 페이지 · 한 묶음 안 — 통과해야", "burst/pairs", ["w32", "w33", "w34", "w35", "w22", "w25"]],
  ["촬영 페이지 · 사진 모드 대 영상 — 걸려야", "burst/pairs", [1, 2, 3, 4, 5].map((k) => `x${k}`)],
  ["손으로 찍은 같은 자리 — 걸려야 (가짜 꼬리)", "same-seat/pairs", ["s2", "s3", "s4"]],
  ["다른 날 · 다른 곳 — 걸려야", "liner-test/reshoot", ["me", "me2", "me3", "me4"]],
  ["실제 화장 시험 2~9단계 (첫 장) — 판정은 맞았다", "trial/p1/pairs", [2, 3, 4, 5, 6, 7, 8, 9].map((k) => `s${k}k1`)],
];
const WORD = { light: "밝기", size: "얼굴 크기", pose: "고개 각도" };
for (const [tag, dir, ids] of SETS) {
  const out = ids.filter((id) => existsSync(`${W}/${dir}/${id}_open_bare.png`)).map((id) => { const c = core.shotCondition(load(dir, `${id}_open_bare`), load(dir, `${id}_open_made`)); return `${id} ${c ? WORD[c] : "통과"}`; });
  console.log(`${tag}: ${out.join(" · ")}`);
}
