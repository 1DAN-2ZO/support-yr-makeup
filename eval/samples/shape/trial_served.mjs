// 실제 화장 시험의 단계별 시도사진을, 배포 서버가 만든 정답사진과 견준다 (실험 53) — 처음부터 끝까지 지금 방식으로
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/trial_served.mjs <사람> <묶음> <정답 이름>
//   맨얼굴 · 정답: work/recal/<묶음>/bare.png + bare.lm.json · t_<정답 이름>.png (같은 크기)
//   시도사진: work/trial/<사람>/pairs/s<단계>k<장>_open_made.png + .lm.json (다섯 장 묶음)
// 맨얼굴은 얼굴 둘레만 자른 것이고 시도사진은 전체 사진이라 사진 조건(얼굴 크기 비)은 보지 않는다
// 기준을 바꿔 보기: LIPMIN · SHADOWMIN · BROWMIN (견줄 것이 없다고 보는 문턱). 안 주면 코드의 값
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
const [who, set, tname] = process.argv.slice(2);
if (!process.env.DHE_DATA_DIR || !tname) { console.error("DHE_DATA_DIR 와 <사람> <묶음> <정답 이름> 을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = `${DATA}/work/trial/${who}/pairs`, R = `${DATA}/work/recal/${set}`;
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { feedbackWhole, measureWhole } from "./src/core/feedback-measure";\nexport { FEEDBACK } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "trial-served-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "trial-served-core.mjs")).href);
for (const [env, key] of [["LIPMIN", "lip"], ["SHADOWMIN", "shadow"], ["BROWMIN", "brow"]]) if (process.env[env]) core.FEEDBACK.minTarget[key] = Number(process.env[env]);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const bare = core.frameOf(png(`${R}/bare.png`), JSON.parse(readFileSync(`${R}/bare.lm.json`, "utf8"))), target = png(`${R}/t_${tname}.png`);
const NAME = { 2: "2 맨얼굴 다시", 3: "3 눈썹만", 4: "4 섀도우 한쪽", 5: "5 섀도우 양쪽", 6: "6 라이너 한쪽", 7: "7 라이너 양쪽", 8: "8 완성(입술)", 9: "9 입술 옆으로 번짐" };
const f2 = (v) => (v == null ? "-" : v.toFixed(2)), t0 = core.measureWhole({ bare, target, cur: bare });
console.log(`정답 = ${set}/t_${tname} · 문턱: 입술 ${core.FEEDBACK.minTarget.lip} · 섀도우 ${core.FEEDBACK.minTarget.shadow} · 눈썹 ${core.FEEDBACK.minTarget.brow} | 정답 변화: 입술 ${t0.lip.target.toFixed(1)} · 섀도우 ${t0.shadow.target.toFixed(1)} · 눈썹 ${t0.brow.target.toFixed(1)}`);
for (const s of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const curs = [1, 2, 3, 4, 5].filter((k) => existsSync(`${T}/s${s}k${k}_open_made.png`)).map((k) => core.frameOf(png(`${T}/s${s}k${k}_open_made.png`), JSON.parse(readFileSync(`${T}/s${s}k${k}_open_made.lm.json`, "utf8"))));
  if (!curs.length) continue;
  const input = { bare, target, cur: curs }, m = core.measureWhole(input), fb = core.feedbackWhole(input, true);
  console.log(`[${NAME[s]}] 양: 입술 ${f2(m.lip?.amount)} · 섀도우 R ${f2(m.shadow?.amountR)} L ${f2(m.shadow?.amountL)} · 눈썹 R ${f2(m.brow?.amountR)} L ${f2(m.brow?.amountL)}`);
  console.log("   " + fb.parts.filter((p) => p.part !== "liner").map((p) => `${p.name}: ${p.line}${p.more ? ` + ${p.more}` : ""}`).join(" | "));
}
