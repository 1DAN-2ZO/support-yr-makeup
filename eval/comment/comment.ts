/**
 * 화면 6 종합 코멘트 확인 실험 (#287) — 앱 코드(채점 타입 · 한 줄 평 · 문구표 · 합산)를 그대로 쓴다.
 *
 * 부위별 한 줄(A, reviewLine)은 화면 6 에 늘 나온다 — 비교 대상이 아니라 맥락이다. 정하는 것은 그 위에 놓을 **한줄평**:
 *   B 규칙 한줄평  가장 잘된 부위 하나 + 먼저 고칠 부위 하나 — 한 문장
 *   C LLM 한줄평   같은 채점 결과를 글로 넘겨 텍스트 LLM 이 한 문장 (사진 없음)
 *
 * B 는 일부러 약하게 만들지 않는다 — 간단한 규칙으로 같은 효과가 나면 LLM 자리가 아니다 (#286 의 교훈).
 * B · C 는 같은 길이 상한(MAX_CHARS)을 쓴다 — 긴 쪽이 자세해 보여 뽑히지 않게.
 */

import { computeSummary, reviewLine } from "../../client/src/core/review";
import { CHECK_REASON_SHORT, PART_NAME, diagText } from "../../client/src/core/score";
import { LOOKS } from "../../client/src/core/looks";
import type { CheckReason, PartId, PartResult, SessionSummary } from "../../client/src/core/types";
import { PART_IDS } from "../../client/src/core/types";

/** B · C 길이 상한 — 한줄평. (v1 150자 · v2 100자는 "종합 코멘트" 두세 문장이었다. v3 부터 한줄평, 2026-10-02) */
export const MAX_CHARS = 60;
export const PROMPT_VER = "comment-v3";

export interface Session {
  id: string;
  kind: string;
  lookId: string;
  lookName: string;
  parts: PartResult[];
  summary: SessionSummary;
}

// ---------- 가짜 세션 ----------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Level = "good" | "minor" | "big" | "lr";
const CODES: Record<Exclude<PartId, "contour">, Record<Level, string[][]>> = {
  brow: { good: [[]], minor: [["BROW_SPARSE"], ["BROW_TAIL_SHORT_R"], ["BROW_OUT_L"]], big: [["BROW_TAIL_SHORT_R", "BROW_TAIL_SHORT_L"], ["BROW_OUT_R", "BROW_SPARSE"]], lr: [["BROW_LR_DIFF"]] },
  liner: { good: [[]], minor: [["LINER_THICK"], ["LINER_WING_SHORT_R"], ["LINER_GAP_L"]], big: [["LINER_WING_HIGH_R", "LINER_WING_LOW_L"], ["LINER_OUT_R", "LINER_THICK"], ["LINER_THIN"]], lr: [["LINER_LR_DIFF"]] },
  lip: { good: [[]], minor: [["LIP_OUT_UPPER"], ["LIP_UNDER"]], big: [["LIP_OUT_UPPER", "LIP_OUT_LOWER"], ["LIP_UNDER"]], lr: [["LIP_LR_DIFF"]] },
  shadow: { good: [["TONE_OK"]], minor: [["TONE_UNDER"], ["SHADOW_DIR"]], big: [["TONE_OVER"], ["TONE_UNDER", "SHADOW_DIR"]], lr: [["SHADOW_LR_DIFF_R"], ["SHADOW_LR_DIFF_L"]] },
  cheek: { good: [["TONE_OK"]], minor: [["TONE_UNDER"]], big: [["TONE_OVER"]], lr: [["CHEEK_LR_DIFF_L"], ["CHEEK_LR_DIFF_R"]] },
};
const SCORE: Record<Level, [number, number]> = { good: [86, 97], minor: [72, 84], big: [45, 64], lr: [70, 82] };
const FORM = new Set<PartId>(["brow", "liner", "lip"]);

/** 실제로 나올 조합을 골고루 — 전부 잘됨 · 한 부위만 크게 틀림 · 좌우 비대칭 · 확인만 섞임 · 건너뜀 섞임 · 여럿 아쉬움 */
const KINDS: [string, number][] = [["all_good", 5], ["one_big", 8], ["lr", 5], ["check_only", 6], ["skipped", 3], ["many", 3]];

export function makeSessions(seed = 20261002): Session[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const between = ([lo, hi]: [number, number]): number => Math.round(lo + r() * (hi - lo));
  const lookParts = PART_IDS.filter((p) => p !== "contour") as Exclude<PartId, "contour">[];
  const out: Session[] = [];
  let n = 0;
  for (const [kind, count] of KINDS) {
    for (let i = 0; i < count; i++) {
      const look = LOOKS[n % LOOKS.length]!;
      const level: Partial<Record<PartId, Level | CheckReason | "skipped">> = {};
      for (const p of lookParts) level[p] = r() < 0.75 ? "good" : "minor";
      const shuffled = [...lookParts].sort(() => r() - 0.5);
      if (kind === "all_good") for (const p of lookParts) level[p] = "good";
      if (kind === "one_big") level[shuffled[0]!] = "big";
      if (kind === "lr") { level[shuffled[0]!] = "lr"; if (r() < 0.5) level[shuffled[1]!] = "lr"; }
      if (kind === "check_only") { level[shuffled[0]!] = pick(["faint", "lighting", "occluded", "align", "subtle"] as CheckReason[]); if (r() < 0.5) level[shuffled[1]!] = pick(["faint", "lighting", "occluded"] as CheckReason[]); if (r() < 0.5) level[shuffled[2]!] = "big"; }
      if (kind === "skipped") { level[shuffled[0]!] = "skipped"; if (r() < 0.5) level[shuffled[1]!] = "skipped"; level[shuffled[2]!] = "minor"; }
      if (kind === "many") { level[shuffled[0]!] = "big"; level[shuffled[1]!] = "minor"; level[shuffled[2]!] = "lr"; level[shuffled[3]!] = "minor"; }
      const parts: PartResult[] = PART_IDS.map((partId) => {
        const base: PartResult = { partId, status: "passed", score: null, diagnosisCodes: [], diagnosis: "", checkReason: null, lrIndex: null, metrics: {}, attempts: 1, updatedAt: 0 };
        if (partId === "contour") {
          const lr = r() < 0.25 ? 12 : 2;
          return { ...base, status: "check_only", checkReason: "contour", lrIndex: { left: 50, right: 50 + lr } };
        }
        const lv = level[partId]!;
        if (lv === "skipped") return { ...base, status: "skipped" };
        if (lv !== "good" && lv !== "minor" && lv !== "big" && lv !== "lr") return { ...base, status: "check_only", checkReason: lv };
        const codes = pick(CODES[partId][lv]);
        const lrBig = lv === "lr";
        return {
          ...base,
          score: between(SCORE[lv]),
          diagnosisCodes: codes,
          lrIndex: FORM.has(partId) ? null : { left: 50, right: 50 + (lrBig ? 24 : 4) },
          metrics: FORM.has(partId) ? { lrDiff: lrBig ? 0.09 : 0.02 } : {},
        };
      });
      out.push({ id: `s${String(++n).padStart(2, "0")}`, kind, lookId: look.id, lookName: look.name, parts, summary: computeSummary(parts, undefined, () => 0) });
    }
  }
  return out;
}

// ---------- 공통 ----------

const name = (p: PartId): string => PART_NAME[p];
/** 받침이 있으면 a, 없으면 b (은/는 · 이/가) */
const josa = (w: string, a: string, b: string): string => {
  const c = w.charCodeAt(w.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? w + a : w + b;
};
const isLook = (p: PartResult): boolean => p.partId !== "contour";
const issueCodes = (p: PartResult): string[] => p.diagnosisCodes.filter((c) => c !== "TONE_OK");
const hasLr = (p: PartResult): boolean => p.diagnosisCodes.some((c) => c.includes("LR"));
/** 잘된 부위: 완료 · 고칠 말 없음 · 점수 높은 순 */
export const goodParts = (s: Session): PartResult[] => s.parts.filter((p) => isLook(p) && p.status === "passed" && !issueCodes(p).length).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
/** 고칠 부위: 완료인데 고칠 말이 있는 것(점수 낮은 순), 그다음 다시 확인하면 되는 확인만 */
export function fixParts(s: Session): PartResult[] {
  const passed = s.parts.filter((p) => isLook(p) && p.status === "passed" && issueCodes(p).length).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const check = s.parts.filter((p) => isLook(p) && p.status === "check_only" && ["faint", "lighting", "occluded", "align"].includes(p.checkReason ?? ""));
  return [...passed, ...check];
}

// ---------- A · B ----------

/** A: 지금 화면 6 — 부위 이름 + 한 줄 평 */
export function commentA(s: Session): string {
  return s.parts.map((p) => `${name(p.partId)}: ${reviewLine(p)}`).join("\n");
}

const dot = (s: string): string => (/[.!?]$/.test(s) ? s : s + ".");
/** 고칠 말 한 문장 — 진하기 진단(TONE_*)은 부위 이름 없이 "조금 진해요" 뿐이라 할 일로 바꾼다 */
function fixText(p: PartResult): string {
  const code = issueCodes(p)[0]!;
  if (code === "TONE_OVER") return `${josa(name(p.partId), "을", "를")} 조금 연하게 발라 보세요.`;
  if (code === "TONE_UNDER") return `${josa(name(p.partId), "을", "를")} 조금 더 진하게 발라 보세요.`;
  return dot(diagText(code) ?? "");
}

/** B: 규칙 한줄평 — 한 문장. 할 일 자세한 것은 부위별 한 줄에 있다 */
export function commentB(s: Session): string {
  const good = goodParts(s), fix = fixParts(s);
  const g = good[0], f = fix[0];
  const praise = g ? `${josa(name(g.partId), "은", "는")} 잘 됐어요` : "";
  if (!f) {
    if (good.length >= 3) return `전체적으로 잘 됐어요, 특히 ${josa(name(g!.partId), "이", "가")} 깔끔해요.`;
    return praise ? `${praise}, 다음엔 건너뛴 부위도 해 봐요.` : "다음엔 건너뛴 부위도 해 봐요.";
  }
  const todo = f.status === "check_only"
    ? `${josa(name(f.partId), "은", "는")} 한 번 더 확인해 봐요`
    : hasLr(f) ? `다음엔 ${name(f.partId)} 양쪽 균형부터 맞춰 봐요` : `다음엔 ${name(f.partId)}부터 다듬어 봐요`;
  return praise ? `${praise}, ${todo}.` : `${todo}.`;
}

// ---------- C ----------

const band = (score: number | null): string => (score == null ? "" : score >= 85 ? "잘됨" : score >= 70 ? "보통" : "아쉬움");
const STATUS: Record<string, string> = { passed: "완료", check_only: "확인만 (사진으로 못 잼)", skipped: "건너뜀" };

export function promptC(s: Session): string {
  const lines = s.parts.map((p) => {
    const what = p.status === "passed" ? `${band(p.score)} · ${reviewLine(p)}` : reviewLine(p);
    return `- ${name(p.partId)}: ${STATUS[p.status] ?? p.status} · ${what}${hasLr(p) ? " · 좌우 차이 있음" : ""}`;
  });
  return `당신은 메이크업 코치입니다. 사용자가 "${s.lookName}" 화장을 따라 하고 받은 부위별 채점 결과입니다.
화면에는 아래 부위별 한 줄이 이미 보입니다. 그 위에 놓을 **한줄평**을 씁니다 — 결과를 묶어, 다음에 화장할 때 무엇을 먼저 고칠지 한눈에 알게.

## 채점 결과 (사진 없이 결과만)
${lines.join("\n")}

## 쓸 것 (순서대로)
- praise_part: 가장 잘된 부위 하나 (완료이고 고칠 말이 없는 부위). 없으면 none
- fix_part: 다음에 먼저 고칠 부위 하나 (완료인데 고칠 말이 있는 부위가 먼저, 없으면 사진으로 못 잰 부위). 없으면 none
- comment: 한 문장(쉼표로 이어도 됩니다), ${MAX_CHARS}자 이내. 잘된 점 하나와 먼저 고칠 것 하나를 묶어 씁니다. 부위별 한 줄을 되풀이하지 않습니다. 위 결과에 있는 내용만 씁니다.
  잘됨·적당해요 인 부위는 고치라고 하지 않습니다. 결과에 없는 도구나 방법은 지어내지 않습니다.
  숫자와 점수는 쓰지 않습니다. 친근한 존댓말("~해요")로 씁니다.

## 답
JSON 하나만 답합니다. 코드 블록 없이.`;
}

export function schemaC(s: Session): object {
  const praise = [...goodParts(s).map((p) => p.partId), "none"];
  const fix = [...fixParts(s).map((p) => p.partId), "none"];
  return {
    type: "object",
    properties: {
      praise_part: { enum: praise },
      fix_part: { enum: fix },
      comment: { type: "string", minLength: 10, maxLength: MAX_CHARS },
    },
    required: ["praise_part", "fix_part", "comment"],
    additionalProperties: false,
  };
}

/** 반대 방향 말 — 고칠 부위의 진단과 반대로 고치라고 하면 지어낸 말. 반대 진단이 같이 있으면(오른쪽 높고 왼쪽 낮음) 따지지 않는다 */
const OPPOSITE: [RegExp, RegExp, RegExp][] = [
  [/TONE_OVER/, /TONE_UNDER/, /더 진하게|진하게 (발라|올려)/],
  [/TONE_UNDER/, /TONE_OVER/, /연하게|덜 바르|힘을 빼/],
  [/WING_HIGH/, /WING_LOW/, /올려|올리세요/],
  [/WING_LOW/, /WING_HIGH/, /내려|내리세요/],
  [/LINER_THICK/, /LINER_THIN/, /두껍게/],
  [/LINER_THIN/, /LINER_THICK/, /얇게/],
];

export interface GateC { ok: boolean; reasons: string[]; comment: string; praise: string | null; fix: string | null }

/** C 관문: 모양 · 길이 · 숫자 · 고칠 부위를 말했나 · 결과에 없는 부위를 칭찬하나 · 반대 방향 */
export function gateC(s: Session, raw: string): GateC {
  const reasons: string[] = [];
  let j: { praise_part?: string; fix_part?: string; comment?: string } = {};
  try { j = JSON.parse(raw); } catch { return { ok: false, reasons: ["JSON 아님"], comment: "", praise: null, fix: null }; }
  const c = (j.comment ?? "").trim();
  const praise = j.praise_part && j.praise_part !== "none" ? j.praise_part : null;
  const fix = j.fix_part && j.fix_part !== "none" ? j.fix_part : null;
  if (c.length < 10 || c.length > MAX_CHARS) reasons.push("길이");
  if (/[0-9]/.test(c)) reasons.push("숫자");
  if (!/[.!?]$|요$/.test(c)) reasons.push("문장이 잘림");   // 길이 상한에 걸려 끊긴 글
  if (/[A-Za-z]/.test(c)) reasons.push("영어 섞임");
  if ((c.match(/[.!?]/g) ?? []).length > 2) reasons.push("한줄평이 아님");   // Qwen3-14B 가 "눈 liner" 를 썼다
  if (praise && !goodParts(s).some((p) => p.partId === praise)) reasons.push("칭찬 부위가 잘된 부위가 아님");
  if (fix && !fixParts(s).some((p) => p.partId === fix)) reasons.push("고칠 부위가 결과에 없음");
  if (fix && !c.includes(name(fix as PartId).split("·")[0]!)) reasons.push("고칠 부위를 글에서 말하지 않음");
  const skippedPraised = s.parts.filter((p) => p.status === "skipped").some((p) => new RegExp(`${name(p.partId)}[^.]*(잘|깔끔|좋)`).test(c));
  if (skippedPraised) reasons.push("건너뛴 부위를 칭찬함");
  // 잘된 부위를 고치라고 함 — 마디(쉼표·마침표로 나눈 조각) 하나에 잘된 부위 이름 + 고치라는 말이 있고 칭찬 말은 없으면.
  // 한줄평은 "A 는 잘 됐어요, 다음엔 B 를 …" 처럼 한 문장에 칭찬과 할 일이 같이 오므로 문장이 아니라 마디로 본다
  const goodNames = goodParts(s).map((p) => name(p.partId));
  for (const clause of c.split(/[,.!?]/)) {
    if (goodNames.some((g) => clause.includes(g)) && /신경|더 (진하게|연하게|얇게|길게|채워)|채워|해 ?보세요|주시면|주세요/.test(clause) && !/잘|예쁘|자연스러|깔끔|적당/.test(clause)) {
      reasons.push("잘된 부위를 고치라고 함");
      break;
    }
  }
  const fixPart = s.parts.find((p) => p.partId === fix);
  const has = (re: RegExp) => !!fixPart && fixPart.diagnosisCodes.some((x) => re.test(x));
  for (const [code, counter, words] of OPPOSITE) if (has(code) && !has(counter) && words.test(c)) reasons.push("반대 방향");
  return { ok: reasons.length === 0, reasons, comment: c, praise, fix };
}
