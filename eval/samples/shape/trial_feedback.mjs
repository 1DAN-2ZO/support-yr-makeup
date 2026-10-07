// 실제 화장 시험 — 단계별 시도사진(다섯 장)을 정답사진과 견줘 문장을 낸다 (실험 39~41). 사진을 보기 전에 적어 둔 기대(README)와 대조한다
//   DHE_DATA_DIR=D:/nudy-data node eval/samples/shape/trial_feedback.mjs <사람>      (사진: work/trial/<사람>/pairs — 저장소 밖)
//   s<단계>k<장>_open_{bare,made} = 내 맨얼굴(1단계 첫 장) · 그 단계의 다섯 장
//   _tbare · _target2 = 정답사진을 만들 때 쓴 맨얼굴 · 정답사진 (서로 겹친다). 없으면 맨얼굴 자리에 편 _target 을 쓴다 (실험 39, OLD=1 로도)
//   moved_s<단계>.png = 그 단계 시도사진의 화장을 모델로 내 맨얼굴에 옮긴 그림 (있으면 라이너를 본다)
// 기준을 바꿔 보기: LIGHT · COLOR (사진 조건의 밝기 · 색) · PAINT · BLANK (섀도우 구역). 안 주면 코드의 값 그대로
// 옮긴 그림이 없으면 라이너는 "이번에는 볼 수 없었어요", 머리카락 분할이 없어 눈썹 꼬리는 안 잰다
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..").replaceAll("\\", "/");
if (!process.env.DHE_DATA_DIR || !process.argv[2]) { console.error("DHE_DATA_DIR 와 사람 이름을 주세요 (사진은 저장소 밖에 둔다)"); process.exit(1); }
const DATA = process.env.DHE_DATA_DIR.replaceAll("\\", "/"), CLIENT = join(ROOT, "client"), T = `${DATA}/work/trial/${process.argv[2]}/pairs`;
const require = createRequire(pathToFileURL(join(CLIENT, "package.json")));
const esbuild = require("esbuild"), { PNG } = require("pngjs");
const r = await esbuild.build({ stdin: { contents: 'export { frameOf } from "./src/core/sampling";\nexport { feedbackWhole, measureWhole, SHADOW_ZONE } from "./src/core/feedback-measure";\nexport { shotCondition, CONDITION, FEEDBACK } from "./src/core/feedback-whole";', resolveDir: CLIENT, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const OUT = join(DATA, "work/shape-out"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "trial-feedback-core.mjs"), r.outputFiles[0].text);
const core = await import(pathToFileURL(join(OUT, "trial-feedback-core.mjs")).href);
for (const [env, obj, key] of [["LIGHT", core.CONDITION, "light"], ["COLOR", core.CONDITION, "color"], ["PAINT", core.SHADOW_ZONE, "paint"], ["BLANK", core.SHADOW_ZONE, "blank"]]) if (process.env[env]) obj[key] = Number(process.env[env]);
console.log(`기준 — 사진 조건: 밝기 ${core.CONDITION.light} · 색 ${core.CONDITION.color} | 견줄 것 없음: 입술 ${core.FEEDBACK.minTarget.lip} · 섀도우 ${core.FEEDBACK.minTarget.shadow} · 눈썹 ${core.FEEDBACK.minTarget.brow} | 섀도우 구역 ${core.SHADOW_ZONE.paint} · ${core.SHADOW_ZONE.blank}`);
const png = (f) => { const p = PNG.sync.read(readFileSync(f)); return { data: p.data, w: p.width, h: p.height }; };
const frame = (n) => core.frameOf(png(`${T}/${n}.png`), JSON.parse(readFileSync(`${T}/${n}.lm.json`, "utf8")));
const TB = existsSync(`${T}/_tbare.png`) && !process.env.OLD ? frame("_tbare") : null, target = png(`${T}/${TB ? "_target2" : "_target"}.png`), EXTRA = TB ? { targetBare: TB } : {};
const NAME = { 2: "2 맨얼굴 다시", 3: "3 눈썹만", 4: "4 섀도우 한쪽", 5: "5 섀도우 양쪽", 6: "6 라이너 한쪽", 7: "7 라이너 양쪽", 8: "8 완성(입술)", 9: "9 입술선 밖" };
const SHORT = { brow: "눈썹", shadow: "섀도우", liner: "라이너", cheek: "볼", lip: "입술" }, f2 = (v) => (v == null ? "-" : v.toFixed(2)), WORD = { light: "밝기", size: "얼굴 크기", pose: "고개 각도" };
const bare = frame("s2k1_open_bare"), t0 = core.measureWhole({ bare, target, cur: bare, ...EXTRA });
console.log(`정답사진의 변화 크기: 눈썹 ${t0.brow.target.toFixed(1)} · 섀도우 ${t0.shadow.target.toFixed(1)} · 입술 ${t0.lip.target.toFixed(1)}`);
for (const s of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const curs = [1, 2, 3, 4, 5].filter((k) => existsSync(`${T}/s${s}k${k}_open_made.png`)).map((k) => frame(`s${s}k${k}_open_made`));
  if (!curs.length) continue;
  const moved = existsSync(`${T}/moved_s${s}.png`) ? { moved: png(`${T}/moved_s${s}.png`) } : {}, input = { bare, target, cur: curs, ...EXTRA, ...moved };
  const hits = curs.map((c) => core.shotCondition(bare, c)).filter(Boolean), m = core.measureWhole(input), gate = core.feedbackWhole(input), fb = core.feedbackWhole(input, true);
  console.log(`\n[${NAME[s]}]  사진 조건: ${gate.blocked ? `막힘 (${hits.length}/${curs.length}장 ${[...new Set(hits.map((h) => WORD[h]))].join(" · ")})` : `통과 (걸린 장 ${hits.length}/${curs.length})`}`);
  console.log(`   양: 입술 ${f2(m.lip?.amount)} · 섀도우 R ${f2(m.shadow?.amountR)} L ${f2(m.shadow?.amountL)} · 눈썹 R ${f2(m.brow?.amountR)} L ${f2(m.brow?.amountL)}${m.liner ? ` · 꼬리 정답 ${f2(m.liner.targetR)} ${f2(m.liner.targetL)} → ${f2(m.liner.R)} ${f2(m.liner.L)}` : ""}`);
  console.log("   " + fb.parts.map((p) => `${SHORT[p.part]}: ${p.line}${p.more ? ` + ${p.more}` : ""}`).join(" | "));
}
