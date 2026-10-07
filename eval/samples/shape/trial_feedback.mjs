// 실제 화장 시험 — 단계별 시도사진을 정답사진과 견줘 문장을 낸다 (실험 39). 사진을 보기 전에 적어 둔 기대(README)와 대조한다
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/trial_feedback.mjs <사람>      (사진: work/trial/<사람>/pairs — 저장소 밖)
//   _target.png = 받은 정답사진을 맨얼굴(1단계 첫 장) 자리에 얼굴 점으로 편 것 · s<단계>k<장>_open_{bare,made} = 맨얼굴 · 그 단계의 다섯 장
// 판정 코드 · 기준값은 그대로 (feedbackWhole). 사진 조건 확인은 따로 세고(걸린 장 수), 문장은 조건 확인을 건너뛰고 본다 — 거르개가 막은 단계도 판정이 어떤지 보려고
// 옮긴 그림이 없어 라이너는 "이번에는 볼 수 없었어요", 머리카락 분할이 없어 눈썹 꼬리는 안 잰다
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 사람 이름을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = `${DATA}/work/trial/${process.argv[2]}/pairs`;
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { feedbackWhole, measureWhole } from "./src/core/feedback-measure";\nexport { shotCondition } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "trial-feedback-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "trial-feedback-core.mjs")).href);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const frame = (n) => core.frameOf(png(`${T}/${n}.png`), JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8")));
const target = png(`${T}/_target.png`), NAME = { 2: "2 맨얼굴 다시", 3: "3 눈썹만", 4: "4 섀도우 한쪽", 5: "5 섀도우 양쪽", 6: "6 라이너 한쪽", 7: "7 라이너 양쪽", 8: "8 완성(입술)", 9: "9 입술선 밖" };
const SHORT = { brow: "눈썹", shadow: "섀도우", cheek: "볼", lip: "입술" }, f2 = (v) => (v == null ? "-" : v.toFixed(2));
const m0 = core.measureWhole({ bare: frame("s2k1_open_bare"), target, cur: frame("s2k1_open_bare") });
console.log(`정답사진의 변화 크기 (8 미만이면 견줄 것이 없다고 본다): 눈썹 ${m0.brow.target.toFixed(1)} · 섀도우 ${m0.shadow.target.toFixed(1)} · 입술 ${m0.lip.target.toFixed(1)}`);
for (const s of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const ks = [1, 2, 3, 4, 5].filter((k) => existsSync(`${T}/s${s}k${k}_open_made.png`));
  if (!ks.length) continue;
  const tally = {}, nums = { lip: [], sR: [], sL: [], bR: [], bL: [] };
  let blocked = 0;
  for (const k of ks) {
    const bare = frame(`s${s}k${k}_open_bare`), cur = frame(`s${s}k${k}_open_made`);
    if (core.shotCondition(bare, cur)) blocked++;
    const m = core.measureWhole({ bare, target, cur });
    nums.lip.push(m.lip?.amount); nums.sR.push(m.shadow?.amountR); nums.sL.push(m.shadow?.amountL); nums.bR.push(m.brow?.amountR); nums.bL.push(m.brow?.amountL);
    for (const p of core.feedbackWhole({ bare, target, cur }, true).parts) if (SHORT[p.part]) { const t = (tally[p.part] ??= {}), key = p.line + (p.more ? ` + ${p.more}` : ""); t[key] = (t[key] ?? 0) + 1; }
  }
  const med = (v) => { const a = v.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[(a.length - 1) >> 1] : null; };
  console.log(`\n[${NAME[s]}]  사진 조건에 걸린 장 ${blocked}/${ks.length} · 양(가운데 값): 입술 ${f2(med(nums.lip))} · 섀도우 R ${f2(med(nums.sR))} L ${f2(med(nums.sL))} · 눈썹 R ${f2(med(nums.bR))} L ${f2(med(nums.bL))}`);
  for (const part of ["brow", "shadow", "lip"]) console.log(`   ${SHORT[part]}: ${Object.entries(tally[part] ?? {}).sort((a, b) => b[1] - a[1]).map(([line, n]) => `${line} (${n}장)`).join(" / ")}`);
}
