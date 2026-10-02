/**
 * 화면 6 부위별 한 줄 — 채점 수치를 받아 "얼마나 · 어떻게" 를 말하게 (#287 3차, 2026-10-02).
 *
 *   R 규칙 한 줄   진단 코드 + 수치 구간으로 정도(조금 · 꽤 · 많이 · 절반쯤) + 이 화장 제품으로 할 일. 모델 없음
 *   L LLM 한 줄    같은 수치를 글로 넘겨 텍스트 LLM 이 부위마다 한 줄 (한 세션 한 번 요청, 사진 없음)
 *
 * 고칠 말이 있는 완료 부위만 바꾼다 — 잘 됐어요 · 확인만 이유 · 건너뜀은 지금 고정 문구 그대로.
 * 가짜 세션의 수치는 진단 코드와 맞게 지어 넣는다 (채점 임계 rules/score.json 기준). 세션 내용(상태 · 점수 · 코드)은 바꾸지 않는다.
 */

import { PARAMS } from "../../client/src/core/score";
import type { PartId, PartResult } from "../../client/src/core/types";
import { LOOKS } from "../../client/src/core/looks";
import { type Session, issueCodesOf, josaOf, nameOf, todoCode, isOut, mentionsDiagnosis, styleProblems, STYLE_GUIDE, CONTOUR_PRODUCTS_LIST, TOOL_WORDS_LIST } from "./comment";

export const LINE_MAX = 80;
export const PART_PROMPT_VER = "partline-v3";   // v3: 화장 전문가 말투 검수 (STYLE_GUIDE) · 진단과 상관없는 말 거름   // v2: 눈썹 좌우 높이 · 섀도우 방향 사실을 넣음 (v1 은 빠져 있어 모델이 추측했다)

const T = PARAMS.tol;
const BAND: Record<"shadow" | "cheek", [number, number]> = { shadow: [20, 65], cheek: [25, 60] };

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

// ---------- 수치 지어 넣기 (진단 코드와 맞게) ----------

export interface LinerEye { coverage: number; overflow: number; thickness: number; guideThick: number; wingGuide: number; wingDrawn: number; wingDev: number; gapRatio: number }
export interface BrowSide { coverage: number; tailCoverage: number; overflow: number }

/** 부위 수치 — 형태 부위는 채점 코드(score.ts)의 metrics 와 같은 이름 */
export function fillMetrics(s: Session, seed: number): void {
  const r = rng(seed);
  const u = (lo: number, hi: number): number => lo + r() * (hi - lo);
  for (const p of s.parts) {
    if (p.status !== "passed") continue;
    const has = (c: string): boolean => p.diagnosisCodes.includes(c);
    if (p.partId === "liner") {
      const eye = (k: "R" | "L"): LinerEye => {
        const guideThick = 0.045, wingGuide = 0.18;
        return {
          coverage: u(0.8, 0.97),
          overflow: has(`LINER_OUT_${k}`) ? u(0.38, 0.7) : u(0.02, 0.2),
          thickness: has("LINER_THICK") ? guideThick + u(T.thickOver * 1.2, T.thickOver * 3) : has("LINER_THIN") ? guideThick - u(T.thickUnder * 1.1, T.thickUnder * 1.6) : guideThick + u(-0.005, 0.005),
          guideThick,
          wingGuide,
          wingDrawn: has(`LINER_WING_SHORT_${k}`) ? wingGuide - u(T.wingShort * 1.1, wingGuide * 0.8) : wingGuide - u(0, T.wingShort * 0.5),
          wingDev: has(`LINER_WING_HIGH_${k}`) ? u(T.wingDev * 1.2, T.wingDev * 3) : has(`LINER_WING_LOW_${k}`) ? -u(T.wingDev * 1.2, T.wingDev * 3) : u(-T.wingDev * 0.6, T.wingDev * 0.6),
          gapRatio: has(`LINER_GAP_${k}`) ? u(0.28, 0.6) : u(0, 0.1),
        };
      };
      const perEye = { R: eye("R"), L: eye("L") };
      const lrDiff = has("LINER_LR_DIFF") ? u(T.lrDiff * 1.2, T.lrDiff * 2.5) : Math.abs(perEye.R.wingDev - perEye.L.wingDev) * 0.5;
      p.metrics = { ...p.metrics, perEye, lrDiff, thickness: (perEye.R.thickness + perEye.L.thickness) / 2 };
    } else if (p.partId === "brow") {
      const side = (k: "R" | "L"): BrowSide => ({
        coverage: has("BROW_SPARSE") ? u(0.2, 0.43) : u(0.55, 0.9),
        tailCoverage: has(`BROW_TAIL_SHORT_${k}`) ? u(0.05, 0.38) : u(0.5, 0.9),
        overflow: has(`BROW_OUT_${k}`) ? u(0.32, 0.6) : u(0.02, 0.2),
      });
      p.metrics = { ...p.metrics, per: { R: side("R"), L: side("L") }, lrDiff: has("BROW_LR_DIFF") ? u(0.05, 0.1) * (r() < 0.5 ? 1 : -1) : u(-0.02, 0.02) };
    } else if (p.partId === "lip") {
      p.metrics = {
        ...p.metrics,
        coverage: has("LIP_UNDER") ? u(0.2, 0.48) : u(0.6, 0.95),
        overU: has("LIP_OUT_UPPER") ? u(0.32, 0.6) : u(0.02, 0.2),
        overL: has("LIP_OUT_LOWER") ? u(0.32, 0.6) : u(0.02, 0.2),
        lrGap: has("LIP_LR_DIFF") ? u(0.38, 0.6) : u(0, 0.2),
      };
    } else if (p.partId === "shadow" || p.partId === "cheek") {
      const [lo, hi] = BAND[p.partId];
      const mid = has("TONE_OVER") ? hi + u(4, 20) : has("TONE_UNDER") ? lo - u(4, 15) : u(lo + 8, hi - 8);
      const lr = p.diagnosisCodes.find((c) => c.includes("LR_DIFF"));
      const diff = lr ? (lr.endsWith("_R") ? 1 : -1) * u(13, 26) : u(-6, 6);
      p.lrIndex = { left: Math.round(mid - diff / 2), right: Math.round(mid + diff / 2) };
      p.metrics = { ...p.metrics, band: [lo, hi] };
    }
  }
}

// ---------- 수치 → 사실 (평가지 · 프롬프트에 같이) ----------

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const SIDE: Record<string, string> = { R: "오른쪽", L: "왼쪽" };

/** 부위의 채점 사실 — 수치와 기준. 평가자(정답 확인)와 LLM 이 같은 것을 본다 */
export function facts(p: PartResult): string[] {
  const m = p.metrics as Record<string, unknown>;
  const out: string[] = [];
  if (p.partId === "liner" && m.perEye) {
    for (const k of ["R", "L"] as const) {
      const e = (m.perEye as Record<string, LinerEye>)[k]!;
      out.push(`${SIDE[k]} 눈: 꼬리 길이 가이드의 ${pct(e.wingDrawn / e.wingGuide)}, 꼬리 높이 편차 ${e.wingDev >= 0 ? "+" : ""}${(e.wingDev / T.wingDev).toFixed(1)} (±1 넘으면 높음/처짐), 테두리 밖 번짐 ${pct(e.overflow)} (35% 넘으면 번짐), 끊긴 곳 ${pct(e.gapRatio)} (25% 넘으면 끊김)`);
    }
    out.push(`두께: 가이드의 ${pct((m.thickness as number) / 0.045)} · 좌우 꼬리 높이 차 ${((m.lrDiff as number) / T.lrDiff).toFixed(1)} (1 넘으면 다름)`);
  } else if (p.partId === "brow" && m.per) {
    for (const k of ["R", "L"] as const) {
      const b = (m.per as Record<string, BrowSide>)[k]!;
      out.push(`${SIDE[k]} 눈썹: 채운 정도 ${pct(b.coverage)} (45% 밑이면 비어 보임), 꼬리 채운 정도 ${pct(b.tailCoverage)} (40% 밑이면 덜 그림), 테두리 밖 ${pct(b.overflow)} (30% 넘으면 나감)`);
    }
    const d = m.lrDiff as number;
    out.push(`좌우 눈썹 높이 차: ${Math.abs(d) > 0.045 ? `${d > 0 ? "오른쪽" : "왼쪽"}이 높음 (기준 넘음)` : "고름"}`);
  } else if (p.partId === "lip" && typeof m.coverage === "number") {
    out.push(`안쪽 채운 정도 ${pct(m.coverage)} (50% 밑이면 덜 채움), 윗입술 선 밖 ${pct(m.overU as number)} · 아랫입술 선 밖 ${pct(m.overL as number)} (30% 넘으면 나감), 좌우 입꼬리 채운 차 ${pct(m.lrGap as number)} (35% 넘으면 다름)`);
  } else if ((p.partId === "shadow" || p.partId === "cheek") && p.lrIndex) {
    const [lo, hi] = BAND[p.partId];
    out.push(`진하기 지수 왼쪽 ${p.lrIndex.left} · 오른쪽 ${p.lrIndex.right} (목표 ${lo}~${hi}, 좌우 차 12 넘으면 다름)`);
    if (p.partId === "shadow") out.push(`방향: ${p.diagnosisCodes.includes("SHADOW_DIR") ? "속눈썹 쪽(안쪽)이 눈 바깥쪽보다 진함 — 이 화장은 바깥쪽이 더 진해야 함" : "바깥쪽이 더 진함 (맞음)"}`);
  }
  return out;
}

// ---------- R 규칙 한 줄 ----------

const deg = (ratio: number): string => (ratio < 1.5 ? "조금" : ratio < 2.5 ? "꽤" : "많이");

/** 진단 코드 하나 → 수치로 정도를 붙인 설명 */
export function describe(p: PartResult, code: string): string {
  const m = p.metrics as Record<string, unknown>;
  const k = code.endsWith("_R") ? "R" : code.endsWith("_L") ? "L" : null;
  const sd = k ? `${SIDE[k]} ` : "";
  const eye = k && m.perEye ? (m.perEye as Record<string, LinerEye>)[k]! : null;
  const bs = k && m.per ? (m.per as Record<string, BrowSide>)[k]! : null;
  if (code.startsWith("LINER_WING_SHORT") && eye) {
    const f = eye.wingDrawn / eye.wingGuide;
    return `${sd}눈꼬리 선이 ${f < 0.4 ? "가이드의 절반도 안 그려졌어요" : f < 0.75 ? "가이드의 절반쯤에서 멈췄어요" : "끝까지 조금 모자라요"}`;
  }
  if (code.startsWith("LINER_WING_HIGH") && eye) return `${sd}눈꼬리 선이 ${deg(eye.wingDev / T.wingDev)} 위로 올라갔어요`;
  if (code.startsWith("LINER_WING_LOW") && eye) return `${sd}눈꼬리 선이 ${deg(-eye.wingDev / T.wingDev)} 아래로 처졌어요`;
  if (code === "LINER_THICK") return `선이 가이드보다 ${deg(((m.thickness as number) - 0.045) / T.thickOver)} 두꺼워요`;
  if (code === "LINER_THIN") return `선이 가이드보다 ${deg((0.045 - (m.thickness as number)) / T.thickUnder)} 가늘어요`;
  if (code.startsWith("LINER_GAP") && eye) return eye.gapRatio < 0.4 ? `${sd}선 중간이 조금 끊겼어요` : `${sd}선이 여러 군데 끊겼어요`;
  if (code.startsWith("LINER_OUT") && eye) return `${sd}선이 테두리 밖으로 ${deg(eye.overflow / 0.35)} 번졌어요`;
  if (code === "LINER_LR_DIFF") return `양쪽 눈꼬리 높이가 ${deg((m.lrDiff as number) / T.lrDiff)} 달라요`;
  if (code.startsWith("BROW_TAIL_SHORT") && bs) return `${sd}눈썹 꼬리가 ${bs.tailCoverage < 0.2 ? "거의 비었어요" : "절반쯤 비었어요"}`;
  if (code.startsWith("BROW_OUT") && bs) return `${sd}눈썹이 테두리 밖으로 ${deg(bs.overflow / 0.3)} 나갔어요`;
  if (code === "BROW_SPARSE") return Math.min(...Object.values(m.per as Record<string, BrowSide>).map((x) => x.coverage)) < 0.3 ? "눈썹이 많이 비어 보여요" : "눈썹 사이사이가 조금 비어 보여요";
  if (code === "BROW_LR_DIFF") return "양쪽 눈썹 높이가 달라요";
  if (code === "LIP_OUT_UPPER") return `윗입술 선이 ${deg((m.overU as number) / 0.3)} 밖으로 나갔어요`;
  if (code === "LIP_OUT_LOWER") return `아랫입술 선이 ${deg((m.overL as number) / 0.3)} 밖으로 나갔어요`;
  if (code === "LIP_UNDER") return (m.coverage as number) < 0.3 ? "입술 안쪽이 많이 비었어요" : "입술 안쪽이 조금 덜 채워졌어요";
  if (code === "LIP_LR_DIFF") return "양쪽 입꼬리 채운 정도가 달라요";
  if ((p.partId === "shadow" || p.partId === "cheek") && p.lrIndex) {
    const [lo, hi] = BAND[p.partId];
    const avg = (p.lrIndex.left + p.lrIndex.right) / 2, diff = p.lrIndex.right - p.lrIndex.left;
    const nm = josaOf(nameOf(p.partId), "이", "가");
    if (code === "TONE_OVER") return `${nm} 목표보다 ${avg - hi < 10 ? "조금" : "꽤"} 진해요`;
    if (code === "TONE_UNDER") return `${nm} 목표보다 ${lo - avg < 8 ? "조금" : "꽤"} 옅어요`;
    if (code === "SHADOW_DIR") return "섀도우가 바깥쪽보다 안쪽이 진해요";
    if (code.includes("LR_DIFF")) return `${diff > 0 ? "오른쪽" : "왼쪽"}이 ${Math.abs(diff) < 18 ? "조금" : "꽤"} 진해요`;
  }
  return "";
}

/** 고칠 말이 있는 완료 부위 — LLM · 규칙 한 줄을 만드는 대상 */
export const targets = (s: Session): PartResult[] => s.parts.filter((p) => p.partId !== "contour" && p.status === "passed" && issueCodesOf(p).length);

/** R: 첫 진단 설명(정도) + 제품으로 할 일. 둘째 진단은 자리가 남으면 설명만 */
export function ruleLine(s: Session, p: PartResult): string {
  const codes = issueCodesOf(p);
  const todo = todoCode(s, p, codes[0]!);
  // 선이 밖으로 나갔으면 "지금 살짝 닦아 수정하거나, 다음엔 ~" (전문가 검수)
  const first = isOut(codes[0]!) ? `${describe(p, codes[0]!)}. 지금 살짝 닦아 수정하거나, 다음엔 ${todo} 봐요.` : `${describe(p, codes[0]!)}. ${todo} 봐요.`;
  const second = codes[1] ? describe(p, codes[1]) : "";
  const both = second ? `${first} ${second}.` : first;
  return both.length <= LINE_MAX ? both : first;
}

// ---------- L LLM 한 줄 ----------

export function partPrompt(s: Session): string {
  const look = LOOKS.find((l) => l.id === s.lookId);
  const blocks = targets(s).map((p) => {
    const codes = issueCodesOf(p).map((c) => `${c}`).join(", ");
    const intent = look?.rationale[p.partId as Exclude<PartId, "contour">];
    return `### ${p.partId} (${nameOf(p.partId)}) — 점수 ${p.score}
- 진단: ${codes}
${facts(p).map((f) => `- ${f}`).join("\n")}${intent ? `\n- 이 화장의 의도: ${intent}` : ""}`;
  });
  return `당신은 메이크업 코치입니다. 사용자가 "${s.lookName}" 화장을 따라 하고 받은 채점 결과 중, 고칠 점이 있는 부위입니다.
부위마다 화면에 보일 **한 줄 평**을 씁니다 — 옆에서 봐 주는 선생님처럼, 무엇이 얼마나 어긋났고 어떻게 고칠지.

## 이 화장에 쓰는 제품
${[...(look?.products ?? []), ...CONTOUR_PRODUCTS_LIST].map((x) => `- ${x}`).join("\n")}

${STYLE_GUIDE}

## 부위 (사진 없이 채점 수치만)
${blocks.join("\n\n")}

## 쓸 것
- lines: 위 부위마다 한 줄 (${LINE_MAX}자 이내, 한두 문장). 그 부위 수치에서 가장 크게 어긋난 것부터 — 얼마나("조금" · "꽤" · "절반쯤" 같은 말로)와 어떻게(위 제품으로 "○○로 ~하듯이").
  그 부위 이야기만 씁니다. 수치가 기준 안인 것은 고치라고 하지 않습니다. 왼쪽 · 오른쪽을 바꾸지 않습니다.
  숫자와 퍼센트는 쓰지 않습니다. 목록에 없는 도구는 쓰지 않습니다. 친근한 존댓말("~해요").

## 답
JSON 하나만 답합니다. 코드 블록 없이.`;
}

export function partSchema(s: Session): object {
  const props = Object.fromEntries(targets(s).map((p) => [p.partId, { type: "string", minLength: 8, maxLength: LINE_MAX }]));
  return {
    type: "object",
    properties: { lines: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false } },
    required: ["lines"],
    additionalProperties: false,
  };
}

const OTHER: Record<string, RegExp> = { brow: /(?<!속)눈썹/, liner: /아이라이너|라이너/, shadow: /섀도우/, lip: /입술|립(?!스)/, cheek: /볼터치|블러셔/ };
const OPP: [RegExp, RegExp, RegExp][] = [
  [/TONE_OVER/, /TONE_UNDER/, /더 진하게|겹쳐 발라|한 번 더 발라|너무 연|너무 옅/],
  [/TONE_UNDER/, /TONE_OVER/, /(?<!갈수록 )(연하게|옅게) (발라|바르)|덜어|힘을 빼|너무 진/],
  [/WING_HIGH/, /WING_LOW/, /올려/],
  [/WING_LOW/, /WING_HIGH/, /내려/],
  [/LINER_THICK/, /LINER_THIN/, /두껍게 (그려|발라)|굵게|겹쳐|굵기가 충분/],
  [/LINER_THIN/, /LINER_THICK/, /얇게|가늘게|두껍게 그려졌|너무 두껍/],
  [/LIP_OUT/, /LIP_UNDER/, /바깥까지|밖으로 (넓게|더)|블렌딩/],
];

export interface GateLine { ok: boolean; reasons: string[]; line: string }

/** 부위 한 줄 관문 — 이 줄은 사용자가 그대로 따라 하므로 총평보다 엄하게 */
export function gateLine(s: Session, p: PartResult, raw: string): GateLine {
  const c = raw.trim();
  const reasons: string[] = [];
  if (c.length < 8 || c.length > LINE_MAX) reasons.push("길이");
  if (/[0-9%]/.test(c)) reasons.push("숫자");
  if (/[A-Za-z]/.test(c)) reasons.push("영어 섞임");
  if (!/[.!?]$|요$/.test(c)) reasons.push("문장이 잘림");
  // 다른 부위 이름 — 이 줄은 그 부위 이야기만 (섀도우 줄의 "눈꼬리" · "눈두덩" 처럼 자리 말은 괜찮다)
  const other = Object.entries(OTHER).find(([part, re]) => part !== p.partId && re.test(c));
  if (other) reasons.push(`다른 부위 이야기: ${other[0]}`);
  const kit = [...(LOOKS.find((l) => l.id === s.lookId)?.products ?? []), ...CONTOUR_PRODUCTS_LIST].join(" ");
  const strange = TOOL_WORDS_LIST.filter((w) => c.includes(w) && !kit.includes(w));
  if (strange.length) reasons.push(`목록에 없는 도구: ${strange.join(", ")}`);
  reasons.push(...styleProblems(p.partId, c));
  if (!mentionsDiagnosis(issueCodesOf(p), c)) reasons.push("진단과 상관없는 말");
  const has = (re: RegExp): boolean => p.diagnosisCodes.some((x) => re.test(x));
  for (const [code, counter, words] of OPP) if (has(code) && !has(counter) && words.test(c)) { reasons.push("반대 방향"); break; }
  // 좌우: 진단이 한쪽만이면 반대쪽만 말하면 틀림
  const sides = new Set(issueCodesOf(p).map((x) => (x.endsWith("_R") ? "R" : x.endsWith("_L") ? "L" : "both")));
  if (sides.size === 1 && !sides.has("both")) {
    const only = [...sides][0];
    if (only === "R" && /왼쪽/.test(c) && !/오른쪽/.test(c)) reasons.push("좌우가 바뀜");
    if (only === "L" && /오른쪽/.test(c) && !/왼쪽/.test(c)) reasons.push("좌우가 바뀜");
  }
  return { ok: reasons.length === 0, reasons, line: c };
}

