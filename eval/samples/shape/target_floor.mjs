// 정답사진의 "변화 크기"가 피드백의 재는 법(부위 − 둘레 피부, measureWhole)으로 얼마로 읽히는가 (실험 53)
// 화장 없는 참고로 만든 그림에서 깔리는 값과, 화장 있는 참고로 만든 그림의 값을 견줘 문턱(FEEDBACK.minTarget)을 다시 잡으려고
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/target_floor.mjs [묶음 …]
//   사진: work/recal/<묶음>/bare.png + bare.lm.json (맨얼굴) · t_<이름>.png (그 맨얼굴에 참고 화장을 옮긴 그림, 같은 크기). 저장소 밖
//   이름이 0 으로 시작하는 것 = 화장 없는 참고로 만든 그림 (깔리는 값)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR) { console.error("DHE_DATA_DIR 를 정해 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), R = `${DATA}/work/recal`;
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { measureWhole, feedbackWhole } from "./src/core/feedback-measure";\nexport { FEEDBACK } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "target-floor-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "target-floor-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const f1 = (v) => (v == null ? "   -" : v.toFixed(1).padStart(5)), f2 = (v) => (v == null ? "    -" : v.toFixed(2).padStart(5));
const sets = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(R);
console.log(`문턱(minTarget): 입술 ${core.FEEDBACK.minTarget.lip} · 섀도우 ${core.FEEDBACK.minTarget.shadow} · 눈썹 ${core.FEEDBACK.minTarget.brow}`);
for (const s of sets) {
  const bare = core.frameOf(png(`${R}/${s}/bare.png`), JSON.parse(readFileSync(`${R}/${s}/bare.lm.json`, "utf8")));
  console.log(`\n== ${s} (${bare.im.w} x ${bare.im.h})   정답 변화 크기: 입술 · 섀도우 · 눈썹 · 볼 | 입술 밖 띠 · 입꼬리 옆 R L · 눈꼬리 바깥 | 맨얼굴을 시도로 넣었을 때의 문장`);
  for (const f of readdirSync(`${R}/${s}`).filter((n) => /^t_.+\.png$/.test(n)).sort()) {
    const target = png(`${R}/${s}/${f}`), m = core.measureWhole({ bare, target, cur: bare }), fb = core.feedbackWhole({ bare, target, cur: bare }, true);
    const say = fb.parts.filter((p) => p.part !== "liner").map((p) => `${p.name} ${p.tone === "info" ? "견줄 것 없음" : p.tone === "fix" ? "고칠 것" : "비슷"}`).join(" · ");
    console.log(`${f.replace(/^t_|\.png$/g, "").padEnd(8)} ${f1(m.lip?.target)} ${f1(m.shadow?.target)} ${f1(m.brow?.target)} ${f1(m.cheek?.target)} | ${f2(m.lip?.outTarget)} ${f2(m.lip?.sideTargetR)} ${f2(m.lip?.sideTargetL)} ${f2(m.shadow?.outerTarget)} | ${say}`);
  }
}
