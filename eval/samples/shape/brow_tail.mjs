// 눈썹 꼬리 끝 (browTail, client/src/core/feedback-measure.ts) 을 실제 사진에 — 파이썬 시험판(brow_tail.py, 실험 33)과 같은 값이 나오나
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/brow_tail.mjs <폴더> <id,id,…>
//   <폴더> = final_whole.py (WHOLE_CASES=brow2) 가 만든 것 + 사진마다 <이름>.hair.png (머리카락 분할, brow_tail.py --dump-hair 가 만든다. 흰 칸 = 머리카락)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), DIR = process.argv[2].replaceAll("\\", "/"), IDS = process.argv[3].split(",");
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { browTail, measureWhole } from "./src/core/feedback-measure";\nexport { composeFeedback } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "brow-tail-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "brow-tail-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const hairOf = (n) => { const p = PNG.sync.read(readFileSync(`${DIR}/${n}.hair.png`)), data = new Float32Array(p.width * p.height); for (let i = 0; i < data.length; i++) data[i] = p.data[i * 4] / 255; return { w: p.width, h: p.height, data }; };
const load = (n, lmFrom = n, hairFrom = n) => core.frameOf(png(`${DIR}/${n}.png`), JSON.parse(readFileSync(`${DIR}/${lmFrom}.lm.json`, "utf8")), hairOf(hairFrom));
const bare = load("_bare"), pc = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
console.log(`맨얼굴의 눈썹 끝: R ${core.browTail(bare, "R").toFixed(2)} · L ${core.browTail(bare, "L").toFixed(2)}`);
const NAMES = ["아무것도 안 함", "정답대로 (꼬리 늘림)", "꼬리 안 늘림", "눈썹 안 그림", "오른쪽만 늘림"];
for (const n of IDS) {
  console.log(`-- 사진 ${n}`);
  NAMES.forEach((name, i) => {
    const f = i === 0 ? "bare" : String(i);
    if (!existsSync(`${DIR}/c${n}_${f}.png`)) return;
    const m = core.measureWhole({ bare, target: png(`${DIR}/_made.png`), cur: load(`c${n}_${f}`) }), b = m.brow, line = core.composeFeedback({ brow: b }).parts.find((p) => p.part === "brow");
    console.log(`  ${name.padEnd(20)} 정답 ${pc(b.tailTargetR)} · ${pc(b.tailTargetL)} → 시도 ${pc(b.tailR)} · ${pc(b.tailL)}   ${line.line}${line.more ? ` + ${line.more}` : ""}`);
  });
}
